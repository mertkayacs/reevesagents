// Lean agent control MCP server. It lets one AI CLI run and drive others: spawn
// a CLI agent, type into it, read its output, handle approvals, manage presets
// and settings, and check the host setup. Any agent that has this MCP can call
// any tool on any run. It stays deliberately flat: no roles, autonomous loops,
// or higher-level coordination protocol.
//
// Typical flow: list_providers -> spawn (returns an agent_id and run_id) ->
// send_text then send_key enter to submit -> read the output -> kill or stop ->
// delete. Every id comes from spawn or list. The session run: a spawn without
// run_id reuses one run created on the first spawn, so a chain of spawns lands
// together.
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
  openTmuxTarget,
  peekAgent,
  sendKey,
  sendText,
  spawnWorker,
  startRun,
  startRunFromPreset,
  startRunWithHead,
  stopRun,
  type AllowedKey,
} from '../core/runtime.js'
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
} from '../core/runs.js'
import { detectAvailable, isProvider } from '../core/providers.js'
import { PROVIDER_DEFS } from '../core/provider-registry.js'
import { runDoctor } from '../core/doctor.js'
import { hostStatus, attach, attachAll, detach } from './installer.js'
import { listPresets, savePresetFromRun, deletePreset } from '../core/store.js'
import { CONFIG_FIELDS, loadConfig, setConfigValues } from '../core/config.js'
import {
  createRunApproval,
  listRunApprovals,
  readRunApproval,
  resolveRunApproval,
  type ApprovalRisk,
  type ApprovalStatus,
} from '../core/approvals.js'
import type { AuthMode, Effort, Permissions, Provider } from '../core/types.js'
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
const PROVIDER_CATALOG_URI = 'reevesagents://providers'

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
    description: 'Start a CLI agent in its own tmux window and return its agent_id (use it with send_text, send_key, read, kill) and run_id. Omit run_id to add the agent to this MCP session run, created on the first spawn so a chain of spawns stays in one run; pass run_id to add it to an existing run. Call list_providers for valid provider keys.',
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
    description: 'Stop one agent and close its tmux window. Pass an agent_id from spawn or list. Once it is ended you can remove its record with delete.',
    inputSchema: {
      type: 'object',
      properties: { agent_id: { type: 'string' } },
      required: ['agent_id'],
    },
    handler: (a) => ok(killAgent(String(a.agent_id))),
  },
  {
    name: 'stop',
    description: 'Stop a whole run: end every agent in it and tear down its tmux session. Pass a run_id from spawn or list. Once ended, remove it with delete_run.',
    inputSchema: {
      type: 'object',
      properties: { run_id: { type: 'string' } },
      required: ['run_id'],
    },
    handler: (a) => ok(stopRun(String(a.run_id))),
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
    handler: (a) => {
      sendKey(String(a.agent_id), parseKey(a.key))
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
      // peekAgent swallows a missing-agent error and returns '', so validate
      // first to give callers a clean "agent not found" instead of empty output.
      findAgent(String(a.agent_id))
      const lines = typeof a.lines === 'number' && a.lines > 0 ? Math.floor(a.lines) : 20
      return ok(peekAgent(String(a.agent_id), lines))
    },
  },
  {
    name: 'list',
    description: 'List every live run and the agents in each, with their ids, status, provider, and tmux info. Start here to find a run_id or agent_id for the other tools. Ended runs are in list_history.',
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
    description: 'Ask for approval before a risky action. Creates a pending approval that a human or another agent clears with resolve_approval, and returns it with its approval_id.',
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
    description: 'Approve or deny one pending approval by its approval_id (from list_approvals). An optional note records why.',
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
    description: 'Read one approval\'s current status (pending, approved, denied, or expired) by its approval_id.',
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
    description: 'List approval requests, optionally filtered by run_id or status (pending, approved, denied, expired). Use it to find an approval_id to resolve.',
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
    description: 'List archived run history: runs that have ended or gone stale. Live runs are in list, not here.',
    inputSchema: { type: 'object', properties: {} },
    handler: () => ok(listRunHistory()),
  },
  {
    name: 'delete',
    description: 'Permanently remove one ended agent\'s record. Kill the agent first; a still-running agent is rejected.',
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
    description: 'Permanently remove one ended run, archiving it to history. Stop the run first; a still-running run is rejected.',
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
    description: 'Permanently remove one archived run history record by its id (from list_history).',
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
  {
    name: 'open',
    description: 'Open a run or agent in tmux for the user: switch the attached tmux client to a run (its reeves tab) or to a specific agent window. Works for any run, whether this agent started it or not, so you can surface any run for the user on request. No effect when nobody is attached.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'A run id or an agent id (from list). A run id opens its reeves tab; an agent id opens that agent window.' },
      },
      required: ['id'],
    },
    handler: (a) => ok(openTmuxTarget(asString(a.id))),
  },
  {
    name: 'doctor',
    description: 'Check this machine for running agents: tmux availability, which provider CLIs are installed, and the state directories. Returns each check with an ok/warn/fail status and a detail string. Run it when a spawn fails to see what is missing.',
    inputSchema: { type: 'object', properties: {} },
    handler: () => ok(runDoctor().checks),
  },
  {
    name: 'get_config',
    description: 'Read the global reevesagents settings: peek_interval_ms, peek_lines, max_depth, max_agents (the per-run agent cap), ready_delay_ms, default_permissions, and language. Check max_agents here when a spawn is rejected for hitting the cap.',
    inputSchema: { type: 'object', properties: {} },
    handler: () => ok(loadConfig().global),
  },
  {
    name: 'set_config',
    description: 'Change one or more global settings and save them. Pass only the fields to change. Counts must be positive integers (ready_delay_ms may be 0); default_permissions is ask or skip; language is a supported code such as en or tr. Example: raise the per-run agent cap with { "max_agents": 20 }. Returns the saved settings.',
    inputSchema: {
      type: 'object',
      properties: {
        peek_interval_ms: { type: 'number', description: 'Milliseconds between output peek polls.' },
        peek_lines: { type: 'number', description: 'Lines captured per peek.' },
        max_depth: { type: 'number', description: 'Spawn recursion cap.' },
        max_agents: { type: 'number', description: 'Max agents per run.' },
        ready_delay_ms: { type: 'number', description: 'Delay before the startup prompt is injected.' },
        default_permissions: { type: 'string', enum: ['ask', 'skip'], description: 'Permission mode used when a spawn omits one.' },
        language: { type: 'string', description: 'UI language code for the TUI and web UI, e.g. en, tr.' },
      },
    },
    handler: (a) => {
      const patch: Record<string, unknown> = {}
      for (const field of CONFIG_FIELDS) {
        if (a[field.key] !== undefined) patch[field.key] = a[field.key]
      }
      if (Object.keys(patch).length === 0) return fail('no config fields to set')
      return ok(setConfigValues(patch).global)
    },
  },
  {
    name: 'list_presets',
    description: 'List saved run presets: reusable agent-team templates, each with a root agent and workers. Launch a whole team at once by passing a preset name to start_preset.',
    inputSchema: { type: 'object', properties: {} },
    handler: () => ok(listPresets()),
  },
  {
    name: 'save_preset',
    description: 'Save a live run\'s agent line-up as a reusable preset under a name, so the same team can be relaunched later with start_preset. Pass a run_id from list. Re-saving the same name updates it. Note: a captured agent\'s auth_mode and effort are not stored (they default).',
    inputSchema: {
      type: 'object',
      properties: {
        run_id: { type: 'string', description: 'The run whose agents become the preset (from list).' },
        name: { type: 'string', description: 'Preset name; characters that are not filename-safe are replaced.' },
        description: { type: 'string' },
      },
      required: ['run_id', 'name'],
    },
    handler: (a) => ok(savePresetFromRun(String(a.run_id), asString(a.name), asString(a.description))),
  },
  {
    name: 'start_preset',
    description: 'Launch a new run from a saved preset (see list_presets), starting its root agent and every worker at once. Optionally override the run name and working_dir. Returns the new run and its agents.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Preset name to launch (from list_presets).' },
        run_name: { type: 'string', description: 'Run name; defaults to the preset name.' },
        working_dir: { type: 'string' },
      },
      required: ['name'],
    },
    handler: (a) => {
      const presetName = asString(a.name)
      if (!listPresets().some(preset => preset.name === presetName)) return fail(`preset not found: ${presetName}`)
      const result = startRunFromPreset(presetName, {
        name: typeof a.run_name === 'string' ? a.run_name : undefined,
        working_dir: typeof a.working_dir === 'string' ? a.working_dir : undefined,
      })
      return ok({ run: result.run, agents: result.agents })
    },
  },
  {
    name: 'delete_preset',
    description: 'Permanently delete a saved preset by its name (from list_presets). Does not affect any running run.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    },
    handler: (a) => {
      const name = asString(a.name)
      if (!listPresets().some(preset => preset.name === name)) return fail('preset not found')
      deletePreset(name)
      return ok({ deleted: true, name })
    },
  },
  {
    name: 'list_hosts',
    description: 'List the AI CLIs on this machine that can host the reevesagents MCP and whether reevesagents is attached to each. Use it to see where this control surface is wired before attach_host or detach_host.',
    inputSchema: { type: 'object', properties: {} },
    handler: () => ok(hostStatus()),
  },
  {
    name: 'attach_host',
    description: 'Attach the reevesagents MCP to one host CLI by its key (from list_hosts), or to every installed host when key is omitted. After attaching, that CLI can drive agents through these same tools.',
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
    description: 'Detach the reevesagents MCP from one host CLI by its key (from list_hosts). The CLI keeps running but can no longer drive agents through reevesagents.',
    inputSchema: {
      type: 'object',
      properties: { key: { type: 'string' } },
      required: ['key'],
    },
    handler: (a) => ok(detach(asString(a.key))),
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
