// Lean agent-control MCP server for native Windows. It lets one AI CLI run and drive
// others: spawn a CLI agent in its own ConPTY, type into it, read its output, and
// kill or stop it. The drive loop and tool schemas match the unix reevesagents
// server (src/surfaces/mcp/server.ts) so an agent that learned reevesagents on unix uses the
// same tool calls here; the config, preset, approval, history, and tmux `open` tools
// are not part of the native Windows package.
//
// Each tool is one entry in TOOLS, colocating its schema and handler so the
// advertised list and the dispatch can never drift. Agents are children of this
// process (ConPTY, not a tmux daemon), so they live only as long as this session.

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

import {
  interrupt,
  isAgentLive,
  killAgent,
  readAgent,
  sendKey,
  sendText,
  spawnWorker,
  startRun,
  stopRun,
} from '../core/pty-runtime.js'
import { listAgents, listRuns, reconcileOnStart, readRun } from '../core/registry.js'
import { detectAvailable } from '../core/availability.js'
import { runDoctor } from '../core/doctor.js'
import { attach, attachAll, detach, hostStatus } from './installer.js'
import { PROVIDER_DEFS } from '../shared/provider-registry.js'
import { coerceExtraArgs, isProvider } from '../shared/provider-build.js'
import { ALLOWED_KEYS, type AllowedKey } from '../core/keys.js'
import type { AuthMode, Effort, Permissions, Provider } from '../shared/types.js'
import { REEVESAGENTS_WIN_VERSION } from '../version.js'

// Native Windows ships no config tools, so the per-run agent cap is a constant matching the
// unix default (src/core/config.ts DEFAULT_GLOBAL.max_agents).
const MAX_AGENTS = 100

// The single run this session drives when callers omit run_id. Set on the first spawn
// and reused for every later run_id-less spawn. There is no host-as-head path yet:
// native Windows does not detect the launching host CLI, so every first spawn starts
// a fresh run.
let sessionRunId: string | null = null

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] }
}

function fail(message: string) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }],
    isError: true as const,
  }
}

type ToolResult = ReturnType<typeof ok> | ReturnType<typeof fail>

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function parseProvider(value: unknown): Provider {
  if (isProvider(value)) return value
  throw new Error(`Unsupported provider: ${String(value)}`)
}

function parseKey(value: unknown): AllowedKey {
  if (typeof value === 'string' && (ALLOWED_KEYS as readonly string[]).includes(value)) return value as AllowedKey
  throw new Error(`Unsupported key: ${String(value)}. Allowed: ${ALLOWED_KEYS.join(', ')}`)
}

function parsePermissions(value: unknown): Permissions | undefined {
  return value === 'ask' || value === 'skip' ? value : undefined
}

function parseAuthMode(value: unknown): AuthMode | undefined {
  return value === 'default' || value === 'api-key' ? value : undefined
}

function parseEffort(value: unknown): Effort | undefined {
  if (value === 'default' || value === 'low' || value === 'medium' || value === 'high' || value === 'xhigh' || value === 'max') return value
  return undefined
}

// True when the session's run still exists and is not ended. readRun throws for a
// missing run (archived by stop/kill), which counts as not live.
function sessionRunIsLive(runId: string): boolean {
  try {
    const run = readRun(runId)
    return run.status !== 'ended' && run.ended_at === null
  } catch {
    return false
  }
}

const PROVIDER_CATALOG_URI = 'reevesagents://providers'
const GUIDE_URI = 'reevesagents://guide'

function buildProviderCatalog() {
  const available = detectAvailable()
  return PROVIDER_DEFS.map(def => ({
    id: def.id,
    display_name: def.displayName,
    bin: def.bin,
    available: available[def.id],
    aliases: [...def.aliases],
    models: [...def.models],
    model_source: def.modelSource,
    supports_auth_mode: def.supportsAuthMode === true,
    supports_effort: def.supportsEffort === true,
  }))
}

function spawnHandler(a: Record<string, unknown>): ToolResult {
  const provider = parseProvider(a.provider)
  const config = {
    provider,
    model: asString(a.model),
    task: asString(a.task),
    nickname: typeof a.nickname === 'string' ? a.nickname : undefined,
    working_dir: typeof a.working_dir === 'string' ? a.working_dir : undefined,
    permissions: parsePermissions(a.permissions),
    auth_mode: parseAuthMode(a.auth_mode),
    effort: parseEffort(a.effort),
    extra_args: coerceExtraArgs(a.extra_args),
  }
  if (typeof a.run_id === 'string' && a.run_id.trim()) {
    const live = listAgents(a.run_id).filter(agent => !agent.ended_at).length
    if (live >= MAX_AGENTS) return fail(`run ${a.run_id} is at the agent cap (${MAX_AGENTS})`)
    return ok(spawnWorker({ ...config, run_id: a.run_id }))
  }
  // No run_id but this session already owns a live run: add the agent to it. If the
  // owned run was ended by a stop/kill, drop it and start a fresh run instead.
  if (sessionRunId && sessionRunIsLive(sessionRunId)) {
    const live = listAgents(sessionRunId).filter(agent => !agent.ended_at).length
    if (live >= MAX_AGENTS) return fail(`run ${sessionRunId} is at the agent cap (${MAX_AGENTS})`)
    return ok(spawnWorker({ ...config, run_id: sessionRunId }))
  }
  sessionRunId = null
  const runName = typeof a.name === 'string' && a.name.trim() ? a.name : (config.nickname ?? provider)
  const result = startRun({
    name: runName,
    working_dir: asString(a.working_dir, process.cwd()),
    root: config,
  })
  sessionRunId = result.run.id
  return ok({ run: result.run, agents: result.agents })
}

interface ToolDef {
  name: string
  description: string
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: readonly string[] }
  handler: (_a: Record<string, unknown>) => ToolResult | Promise<ToolResult>
}

const TOOLS: ToolDef[] = [
  {
    name: 'list_providers',
    description: 'List the CLI providers this machine can launch: id, display name, whether it is installed, aliases, and known models. Pass an id as the provider for spawn.',
    inputSchema: { type: 'object', properties: {} },
    handler: () => ok(buildProviderCatalog()),
  },
  {
    name: 'spawn',
    description: 'Start a CLI agent in its own ConPTY on this machine and return its agent_id (use it with send_text, send_key, read, kill) and run_id. Omit run_id to add the agent to this MCP session run, created on the first spawn so a chain of spawns stays in one run; pass run_id to add it to an existing run. Agents live only as long as this MCP session. Call list_providers for valid provider keys.',
    inputSchema: {
      type: 'object',
      properties: {
        run_id: { type: 'string', description: 'Add to this run. Omit to start a new run.' },
        provider: { type: 'string', description: 'Provider key, e.g. cc, codex, kimi, qwen, opencode, hermes.' },
        model: { type: 'string', description: 'Model id. Blank keeps the provider default.' },
        task: { type: 'string', description: 'Initial prompt pasted into the agent on startup.' },
        nickname: { type: 'string' },
        name: { type: 'string', description: 'Run name when starting a new run.' },
        working_dir: { type: 'string' },
        permissions: { type: 'string', enum: ['ask', 'skip'], description: 'ask prompts for each action; skip runs autonomously. Blank uses the default.' },
        auth_mode: { type: 'string', enum: ['default', 'api-key'], description: 'How the CLI authenticates. Blank uses the provider default.' },
        effort: { type: 'string', enum: ['default', 'low', 'medium', 'high', 'xhigh', 'max'], description: 'Reasoning effort, for providers that support it. Blank uses the provider default.' },
        extra_args: { type: 'array', items: { type: 'string' }, description: 'Extra flags appended verbatim to the launch. Each flag and its value is a separate item, e.g. ["--remote-control"].' },
      },
      required: ['provider'],
    },
    handler: spawnHandler,
  },
  {
    name: 'read',
    description: 'Read one agent\'s recent terminal output, ANSI-stripped and secret-redacted. Use it to see what the agent printed or is waiting on. Defaults to the last 20 lines.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string' },
        lines: { type: 'number', description: 'How many lines, default 20.' },
      },
      required: ['agent_id'],
    },
    handler: (a) => {
      const lines = typeof a.lines === 'number' && a.lines > 0 ? Math.floor(a.lines) : 20
      return ok(readAgent(String(a.agent_id), lines))
    },
  },
  {
    name: 'send_text',
    description: 'Paste text into one agent at its prompt. This does NOT submit it: follow with send_key enter to send. Use it to give a running agent a new instruction.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string' },
        text: { type: 'string' },
      },
      required: ['agent_id', 'text'],
    },
    handler: (a) => {
      sendText(String(a.agent_id), asString(a.text))
      return ok({ sent: true })
    },
  },
  {
    name: 'send_key',
    description: 'Press one key in an agent: enter, escape, tab, space, up, down, left, right, backspace, or ctrl-c. Send enter after send_text to submit the pasted text.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string' },
        key: { type: 'string', enum: [...ALLOWED_KEYS] },
      },
      required: ['agent_id', 'key'],
    },
    handler: async (a) => {
      await sendKey(String(a.agent_id), parseKey(a.key))
      return ok({ sent: true })
    },
  },
  {
    name: 'interrupt',
    description: 'Press ctrl-c in one agent to interrupt whatever it is doing.',
    inputSchema: {
      type: 'object',
      properties: { agent_id: { type: 'string' } },
      required: ['agent_id'],
    },
    handler: (a) => {
      interrupt(String(a.agent_id))
      return ok({ sent: true })
    },
  },
  {
    name: 'kill',
    description: 'Stop one agent and tear down its ConPTY. Pass an agent_id from spawn or list.',
    inputSchema: {
      type: 'object',
      properties: { agent_id: { type: 'string' } },
      required: ['agent_id'],
    },
    handler: (a) => ok(killAgent(String(a.agent_id))),
  },
  {
    name: 'stop',
    description: 'Stop a whole run: end every agent in it and tear down their ConPTYs. Pass a run_id from spawn or list.',
    inputSchema: {
      type: 'object',
      properties: { run_id: { type: 'string' } },
      required: ['run_id'],
    },
    handler: (a) => ok(stopRun(String(a.run_id))),
  },
  {
    name: 'list',
    description: 'List every live run and the agents in each, with their ids, status, provider, and a live flag (true when this session can still drive the agent). Start here to find a run_id or agent_id for the other tools.',
    inputSchema: { type: 'object', properties: {} },
    handler: () => ok(listRuns().map(run => ({
      ...run,
      agents: listAgents(run.id).map(agent => ({ ...agent, live: isAgentLive(agent.id) })),
    }))),
  },
  {
    name: 'list_hosts',
    description: 'List the AI CLIs on this machine that can host the reevesagents-win MCP and whether it is attached to each. Use it before attach_host or detach_host.',
    inputSchema: { type: 'object', properties: {} },
    handler: () => ok(hostStatus()),
  },
  {
    name: 'attach_host',
    description: 'Attach the reevesagents-win MCP to one host CLI by its key (from list_hosts), or to every installed host when key is omitted. After attaching, that CLI can drive agents through these same tools.',
    inputSchema: {
      type: 'object',
      properties: { key: { type: 'string', description: 'Host key from list_hosts, e.g. cc or codex. Omit to attach all installed hosts.' } },
    },
    handler: (a) => {
      const key = asString(a.key).trim()
      return ok(key ? [attach(key)] : attachAll())
    },
  },
  {
    name: 'detach_host',
    description: 'Detach the reevesagents-win MCP from one host CLI by its key (from list_hosts).',
    inputSchema: {
      type: 'object',
      properties: { key: { type: 'string' } },
      required: ['key'],
    },
    handler: (a) => ok(detach(asString(a.key))),
  },
  {
    name: 'doctor',
    description: 'Check this machine for running agents: Node version, the ConPTY (node-pty) binding, which provider CLIs are installed, and the registry directory. Returns each check with an ok/warn/fail status. Run it when a spawn fails to see what is missing.',
    inputSchema: { type: 'object', properties: {} },
    handler: () => ok(runDoctor().checks),
  },
]

const MCP_TOOLS = TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }))

const TOOL_BY_NAME = new Map(TOOLS.map(tool => [tool.name, tool]))

// Dispatch a tool call to its handler. Any error a handler throws (a bad argument, an
// agent this session does not own) is caught here and returned as a structured fail().
async function handleAgentMcpTool(name: string, a: Record<string, unknown>): Promise<ToolResult> {
  const tool = TOOL_BY_NAME.get(name)
  if (!tool) return fail(`Unknown tool: ${name}`)
  try {
    return await tool.handler(a)
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e))
  }
}

// Surfaced to the host model on connect (the MCP `instructions` field). Same drive
// loop as the unix server with the tmux wording removed.
const MCP_INSTRUCTIONS_WIN = `reevesagents-win lets you run and steer other AI CLI agents from this session on native Windows: Claude Code, Codex, Kimi, Qwen, OpenCode, Hermes, and more, each in its own ConPTY on this machine. Hand slices of work to other models, then read or redirect what they do. Agents live only as long as this MCP session.

Drive loop:
1. list_providers - which CLIs are installed here and their models.
2. spawn { provider, task } - start an agent; returns agent_id and run_id. Omit run_id to keep adding agents to the same run.
3. read { agent_id } - an agent's recent output.
4. send_text { agent_id, text } then send_key { agent_id, key: "enter" } - type a message and submit it. send_text alone does NOT submit.
5. kill { agent_id } or stop { run_id } when done.

Every id comes from spawn or list. Read the reevesagents://guide resource for a worked example.`

const GUIDE_TEXT_WIN = `# reevesagents-win: drive a team of AI CLIs on native Windows

You can spawn and steer other coding CLIs from here. Each agent is a real CLI in its own ConPTY on this machine, hosted as a child of this MCP server. reevesagents-win never proxies model traffic or stores credentials; each CLI uses its own login.

## Session-scoped
Agents are children of this MCP server process, not a detached daemon. They live exactly as long as this MCP session. When the host CLI closes the session, every agent is torn down. read on an agent from a previous, closed session returns an error, not stale output.

## Worked example: hand a task to Codex, then steer it
1. list_providers                          confirm "codex" is available
2. spawn { "provider": "codex", "task": "summarize README.md" }
                                           returns { "agent_id": "ab12...", "run_id": "cd34..." }
3. read { "agent_id": "ab12..." }          see what it produced
4. send_text { "agent_id": "ab12...", "text": "now write tests for it" }
   send_key  { "agent_id": "ab12...", "key": "enter" }
5. kill { "agent_id": "ab12..." }          stop it when finished

## Notes
- send_text types but does not submit; always follow it with send_key enter.
- Omit run_id on spawn to add agents to the run you started; pass run_id to target a specific run.
- list shows every run and agent with a live flag; read shows recent output (20 lines by default).
- read output is a best-effort tail of the raw ConPTY stream; a full-screen TUI may show repainted frames.`

function listMcpResources() {
  return [
    {
      uri: PROVIDER_CATALOG_URI,
      name: 'Providers and models',
      description: 'CLI providers this machine can launch and their known models.',
      mimeType: 'application/json',
    },
    {
      uri: GUIDE_URI,
      name: 'Getting started',
      description: 'What reevesagents-win is and a worked example of driving an agent.',
      mimeType: 'text/markdown',
    },
  ]
}

function readMcpResource(uri: string) {
  if (uri === PROVIDER_CATALOG_URI) {
    return { uri, mimeType: 'application/json', text: JSON.stringify(buildProviderCatalog()) }
  }
  if (uri === GUIDE_URI) {
    return { uri, mimeType: 'text/markdown', text: GUIDE_TEXT_WIN }
  }
  throw new Error(`Unknown resource: ${uri}`)
}

export async function startWinMcpServer(): Promise<void> {
  // Prior-session ptys are gone; archive their leftover runs before serving. Skip
  // this when a launch verifier spawned us (REEVES_WIN_VERIFY): that throwaway
  // handshake server must never archive another live session's runs.
  if (process.env.REEVES_WIN_VERIFY !== '1') reconcileOnStart()

  const server = new Server(
    { name: 'reevesagents-win', version: REEVESAGENTS_WIN_VERSION },
    { capabilities: { tools: {}, resources: {} }, instructions: MCP_INSTRUCTIONS_WIN },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: MCP_TOOLS }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params
    return handleAgentMcpTool(name, args as Record<string, unknown>)
  })

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: listMcpResources() }))

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => ({
    contents: [readMcpResource(request.params.uri)],
  }))

  await server.connect(new StdioServerTransport())
}
