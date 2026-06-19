// Lean agent control MCP server. It exposes a flat mechanism: spawn a CLI agent,
// drive it (text and keys), read its output, and handle approvals. Any agent
// that has this MCP can call any tool on any run. It stays deliberately flat:
// no roles, autonomous loops, or higher-level coordination protocol.
//
// Each tool is one entry in TOOLS, colocating its schema and its handler so the
// advertised list and the dispatch can never drift. MCP_TOOLS is derived from it.

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

import {
  ALLOWED_KEYS,
  interrupt,
  killAgent,
  peekAgent,
  sendKey,
  sendText,
  spawnWorker,
  startRun,
  startRunWithHead,
  stopRun,
  type AllowedKey,
} from '../launcher/runtime.js'
import { detectHostProvider } from './host.js'
import {
  archiveAndRemoveRun,
  deleteAgent,
  deleteRunHistory,
  findAgent,
  listAgents,
  listRunHistory,
  listRuns,
  readRun,
} from '../state/runs.js'
import { detectAvailable, isProvider } from '../launcher/providers.js'
import { PROVIDER_DEFS } from '../launcher/provider-registry.js'
import { loadConfig } from '../state/config.js'
import {
  createRunApproval,
  listRunApprovals,
  readRunApproval,
  resolveRunApproval,
  type ApprovalRisk,
  type ApprovalStatus,
} from '../state/approvals.js'
import type { AuthMode, Effort, Permissions, Provider } from '../state/types.js'
import { REEVESAGENTS_VERSION } from '../version.js'

// Read-only at module load: which host CLI launched us, if any. Used to make the
// host the head of one shared run instead of starting a fresh run per spawn.
const hostProvider = detectHostProvider()

// The single run this MCP session drives when callers omit run_id. Set on the
// first headless spawn and reused for every later run_id-less spawn.
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

function parseRisk(value: unknown): ApprovalRisk {
  return value === 'low' || value === 'high' ? value : 'medium'
}

function parseApprovalStatus(value: unknown): ApprovalStatus | undefined {
  if (value === 'pending' || value === 'approved' || value === 'denied' || value === 'expired') return value
  return undefined
}

// The three spawn launch knobs. Each returns undefined for a missing or unknown
// value so the runtime falls back to its own default instead of a bad value.
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
// missing run (e.g. archived by stop/kill), which counts as not live. Exported so
// the no-run_id spawn guard can be tested without driving real tmux.
export function sessionRunIsLive(runId: string): boolean {
  try {
    const run = readRun(runId)
    return run.status !== 'ended' && run.ended_at === null
  } catch {
    return false
  }
}

// Discovery: the provider/model catalog a controlling agent reads to learn what it
// can spawn, instead of guessing provider ids. Exposed both as the list_providers
// tool and as the reevesagents://providers resource; both share this builder.
export const PROVIDER_CATALOG_URI = 'reevesagents://providers'

export function buildProviderCatalog() {
  const available = detectAvailable()
  return PROVIDER_DEFS.map(def => ({
    id: def.id,
    display_name: def.displayName,
    bin: def.bin,
    available: available[def.id],
    aliases: [...def.aliases],
    models: [...def.models],
    model_source: def.modelSource,
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
  }
  if (typeof a.run_id === 'string' && a.run_id.trim()) {
    // Adding to an existing run: enforce the size cap. A new run (no run_id,
    // handled below) starts with one agent, so it is always under it.
    const cap = loadConfig().global.max_agents
    const live = listAgents(a.run_id).filter(agent => !agent.ended_at && !agent.headless).length
    if (live >= cap) return fail(`run ${a.run_id} is at the agent cap (${cap}); raise max_agents in config to add more`)
    return ok(spawnWorker({ ...config, run_id: a.run_id }))
  }
  // No run_id but this session already owns a run: add the agent to it under
  // the same cap as the run_id branch. The owned run may have been ended by a
  // stop/kill that archived and removed it; if so, drop it and fall through to
  // start a fresh run instead of spawning into a dead run.
  if (sessionRunId && sessionRunIsLive(sessionRunId)) {
    const cap = loadConfig().global.max_agents
    const live = listAgents(sessionRunId).filter(agent => !agent.ended_at && !agent.headless).length
    if (live >= cap) return fail(`run ${sessionRunId} is at the agent cap (${cap}); raise max_agents in config to add more`)
    return ok(spawnWorker({ ...config, run_id: sessionRunId }))
  }
  sessionRunId = null
  // First spawn of this session. If a host CLI launched us, that host becomes
  // the headless head and this agent is its first worker. Otherwise keep the
  // original behavior: a new run with this agent as its head.
  if (hostProvider) {
    const result = startRunWithHead(hostProvider, config)
    sessionRunId = result.run.id
    return ok({ run: result.run, agents: result.agents })
  }
  // asString returns '' for an empty string, so a blank name would defeat the
  // fallback; trim-check it explicitly before falling back to nickname/provider.
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
  handler: (_a: Record<string, unknown>) => ToolResult
}

const TOOLS: ToolDef[] = [
  {
    name: 'spawn',
    description: 'Start a CLI agent. With run_id, add it to that run. Without run_id, add it to this session\'s run, which is created on the first spawn.',
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
        permissions: { type: 'string', enum: ['ask', 'skip'], description: 'ask prompts for each action; skip runs autonomously. Blank uses the global default.' },
        auth_mode: { type: 'string', enum: ['default', 'api-key'], description: 'How the CLI authenticates. Blank uses the provider default.' },
        effort: { type: 'string', enum: ['default', 'low', 'medium', 'high', 'xhigh', 'max'], description: 'Reasoning effort, for providers that support it. Blank uses the provider default.' },
      },
      required: ['provider'],
    },
    handler: spawnHandler,
  },
  {
    name: 'kill',
    description: 'Stop one agent and close its tmux window.',
    inputSchema: {
      type: 'object',
      properties: { agent_id: { type: 'string' } },
      required: ['agent_id'],
    },
    handler: (a) => ok(killAgent(String(a.agent_id))),
  },
  {
    name: 'stop',
    description: 'Stop a whole run, ending every agent in it.',
    inputSchema: {
      type: 'object',
      properties: { run_id: { type: 'string' } },
      required: ['run_id'],
    },
    handler: (a) => ok(stopRun(String(a.run_id))),
  },
  {
    name: 'send_text',
    description: 'Paste text (a prompt) into one agent.',
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
    description: 'Send one key to an agent: enter, escape, tab, space, up, down, left, right, backspace, or ctrl-c.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string' },
        key: { type: 'string', enum: [...ALLOWED_KEYS] },
      },
      required: ['agent_id', 'key'],
    },
    handler: (a) => {
      sendKey(String(a.agent_id), parseKey(a.key))
      return ok({ sent: true })
    },
  },
  {
    name: 'interrupt',
    description: 'Send ctrl-c to one agent.',
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
    name: 'read',
    description: 'Read one agent\'s recent output, ANSI-stripped and secret-redacted.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string' },
        lines: { type: 'number', description: 'How many lines, default 20.' },
      },
      required: ['agent_id'],
    },
    handler: (a) => {
      // peekAgent swallows a missing-agent error and returns '', so validate
      // first to give callers a clean "agent not found" instead of empty output.
      findAgent(String(a.agent_id))
      const lines = typeof a.lines === 'number' && a.lines > 0 ? Math.floor(a.lines) : 20
      return ok(peekAgent(String(a.agent_id), lines))
    },
  },
  {
    name: 'list',
    description: 'List runs and the agents in each.',
    inputSchema: { type: 'object', properties: {} },
    handler: () => ok(listRuns().map(run => ({ ...run, agents: listAgents(run.id) }))),
  },
  {
    name: 'list_providers',
    description: 'List the CLI providers this machine can launch: id, display name, whether it is installed, aliases, and known models. Pass an id as the provider for spawn.',
    inputSchema: { type: 'object', properties: {} },
    handler: () => ok(buildProviderCatalog()),
  },
  {
    name: 'request_approval',
    description: 'Ask for approval before an action. Another agent or a human resolves it.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'The agent asking for approval.' },
        action: { type: 'string' },
        summary: { type: 'string' },
        details: { type: 'object' },
        risk: { type: 'string', enum: ['low', 'medium', 'high'] },
      },
      required: ['agent_id', 'action', 'summary'],
    },
    handler: (a) => {
      const action = asString(a.action).trim()
      const summary = asString(a.summary).trim()
      if (!action) return fail('approval action is required')
      if (!summary) return fail('approval summary is required')
      return ok(createRunApproval({
        agent_id: String(a.agent_id),
        action,
        summary,
        details: typeof a.details === 'object' && a.details !== null ? a.details as Record<string, unknown> : {},
        risk: parseRisk(a.risk),
      }))
    },
  },
  {
    name: 'resolve_approval',
    description: 'Approve or deny one pending request.',
    inputSchema: {
      type: 'object',
      properties: {
        approval_id: { type: 'string' },
        decision: { type: 'string', enum: ['approved', 'denied'] },
        note: { type: 'string' },
      },
      required: ['approval_id', 'decision'],
    },
    handler: (a) => {
      const decision = a.decision === 'approved' ? 'approved' : a.decision === 'denied' ? 'denied' : null
      if (!decision) throw new Error('decision must be approved or denied')
      return ok(resolveRunApproval(String(a.approval_id), decision, typeof a.note === 'string' ? a.note : ''))
    },
  },
  {
    name: 'check_approval',
    description: 'Read one approval\'s current status.',
    inputSchema: {
      type: 'object',
      properties: { approval_id: { type: 'string' } },
      required: ['approval_id'],
    },
    handler: (a) => {
      const approval = listRunApprovals().find(item => item.id === String(a.approval_id))
      if (!approval) throw new Error(`Approval not found: ${String(a.approval_id)}`)
      return ok(readRunApproval(approval.run_id, approval.id))
    },
  },
  {
    name: 'list_approvals',
    description: 'List approval requests, optionally for one run or one status.',
    inputSchema: {
      type: 'object',
      properties: {
        run_id: { type: 'string' },
        status: { type: 'string', enum: ['pending', 'approved', 'denied', 'expired'] },
      },
    },
    handler: (a) => ok(listRunApprovals(typeof a.run_id === 'string' ? a.run_id : undefined, parseApprovalStatus(a.status))),
  },
  {
    name: 'list_history',
    description: 'List archived run history records (ended and stale runs).',
    inputSchema: { type: 'object', properties: {} },
    handler: () => ok(listRunHistory()),
  },
  {
    name: 'delete',
    description: 'Delete one ended agent\'s record. The agent must already be ended (kill it first).',
    inputSchema: {
      type: 'object',
      properties: { agent_id: { type: 'string' } },
      required: ['agent_id'],
    },
    handler: (a) => {
      // Mirror the web delete guard: an agent must be stopped before deletion.
      const agent = findAgent(String(a.agent_id))
      if (!agent.ended_at) return fail('Stop agent before deleting it')
      return ok(deleteAgent(String(a.agent_id)))
    },
  },
  {
    name: 'delete_run',
    description: 'Delete one ended run, archiving it to history. The run must already be ended (stop it first).',
    inputSchema: {
      type: 'object',
      properties: { run_id: { type: 'string' } },
      required: ['run_id'],
    },
    handler: (a) => {
      // Mirror the web delete guard: a run must be stopped before deletion.
      const run = readRun(String(a.run_id))
      if (run.status !== 'ended' && run.ended_at === null) return fail('Stop run before deleting it')
      return ok(archiveAndRemoveRun(run.id, 'ended'))
    },
  },
  {
    name: 'delete_history',
    description: 'Delete one archived run history record.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
    handler: (a) => {
      const id = String(a.id)
      // Mirror the web guard: confirm the record exists before deleting it.
      if (!listRunHistory().some(record => record.id === id)) return fail('history record not found')
      deleteRunHistory(id)
      return ok({ deleted: true, id })
    },
  },
]

// The advertised tool list (schema only) and the name -> handler dispatch, both
// derived from the single TOOLS source so they cannot drift.
export const MCP_TOOLS = TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }))

const TOOL_BY_NAME = new Map(TOOLS.map(tool => [tool.name, tool]))

// Dispatch a tool call to its handler. Any error a handler throws (a bad argument,
// a missing agent) is caught here and returned as a structured fail() result.
export function handleAgentMcpTool(name: string, a: Record<string, unknown>) {
  const tool = TOOL_BY_NAME.get(name)
  if (!tool) return fail(`Unknown tool: ${name}`)
  try {
    return tool.handler(a)
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e))
  }
}

export async function startAgentMcpServer(): Promise<void> {
  const server = new Server(
    { name: 'reevesagents', version: REEVESAGENTS_VERSION },
    { capabilities: { tools: {}, resources: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: MCP_TOOLS }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params
    return handleAgentMcpTool(name, args as Record<string, unknown>)
  })

  // The provider/model catalog as a readable resource, mirroring the list_providers tool.
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      {
        uri: PROVIDER_CATALOG_URI,
        name: 'Providers and models',
        description: 'CLI providers this machine can launch and their known models.',
        mimeType: 'application/json',
      },
    ],
  }))

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params
    if (uri !== PROVIDER_CATALOG_URI) throw new Error(`Unknown resource: ${uri}`)
    return {
      contents: [
        { uri, mimeType: 'application/json', text: JSON.stringify(buildProviderCatalog()) },
      ],
    }
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)
}
