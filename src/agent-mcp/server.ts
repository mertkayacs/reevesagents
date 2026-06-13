// Lean agent control MCP server. It exposes a flat mechanism: spawn a CLI agent,
// drive it (text and keys), read its output, and handle approvals. Any agent
// that has this MCP can call any tool on any run. Roles, autonomous loops, and
// the coordination protocol live in the separate orchestrator package, not here.

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

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
import { findAgent, listAgents, listRuns } from '../state/runs.js'
import { isProvider } from '../launcher/providers.js'
import { loadConfig } from '../state/config.js'
import {
  createRunApproval,
  listRunApprovals,
  readRunApproval,
  resolveRunApproval,
  type ApprovalRisk,
  type ApprovalStatus,
} from '../state/approvals.js'
import type { Provider } from '../state/types.js'
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

export const MCP_TOOLS = [
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
      },
      required: ['provider'],
    },
  },
  {
    name: 'kill',
    description: 'Stop one agent and close its tmux window.',
    inputSchema: {
      type: 'object',
      properties: { agent_id: { type: 'string' } },
      required: ['agent_id'],
    },
  },
  {
    name: 'stop',
    description: 'Stop a whole run, ending every agent in it.',
    inputSchema: {
      type: 'object',
      properties: { run_id: { type: 'string' } },
      required: ['run_id'],
    },
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
  },
  {
    name: 'interrupt',
    description: 'Send ctrl-c to one agent.',
    inputSchema: {
      type: 'object',
      properties: { agent_id: { type: 'string' } },
      required: ['agent_id'],
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
  },
  {
    name: 'list',
    description: 'List runs and the agents in each.',
    inputSchema: { type: 'object', properties: {} },
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
  },
  {
    name: 'check_approval',
    description: 'Read one approval\'s current status.',
    inputSchema: {
      type: 'object',
      properties: { approval_id: { type: 'string' } },
      required: ['approval_id'],
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
  },
] as const

export function handleAgentMcpTool(name: string, a: Record<string, unknown>) {
  try {
    if (name === 'spawn') {
      const provider = parseProvider(a.provider)
      const config = {
        provider,
        model: asString(a.model),
        task: asString(a.task),
        nickname: typeof a.nickname === 'string' ? a.nickname : undefined,
        working_dir: typeof a.working_dir === 'string' ? a.working_dir : undefined,
      }
      if (typeof a.run_id === 'string' && a.run_id.trim()) {
        // Adding to an existing run: enforce the size cap. A new run (no run_id,
        // handled below) starts with one agent, so it is always under it.
        const cap = loadConfig().global.max_agents
        const live = listAgents(a.run_id).filter(agent => !agent.ended_at).length
        if (live >= cap) return fail(`run ${a.run_id} is at the agent cap (${cap}); raise max_agents in config to add more`)
        return ok(spawnWorker({ ...config, run_id: a.run_id }))
      }
      // No run_id but this session already owns a run: add the agent to it under
      // the same cap as the run_id branch.
      if (sessionRunId) {
        const cap = loadConfig().global.max_agents
        const live = listAgents(sessionRunId).filter(agent => !agent.ended_at).length
        if (live >= cap) return fail(`run ${sessionRunId} is at the agent cap (${cap}); raise max_agents in config to add more`)
        return ok(spawnWorker({ ...config, run_id: sessionRunId }))
      }
      // First spawn of this session. If a host CLI launched us, that host becomes
      // the headless head and this agent is its first worker. Otherwise keep the
      // original behavior: a new run with this agent as its head.
      if (hostProvider) {
        const result = startRunWithHead(hostProvider, config)
        sessionRunId = result.run.id
        return ok({ run: result.run, agents: result.agents })
      }
      const result = startRun({
        name: asString(a.name, config.nickname ?? provider),
        working_dir: asString(a.working_dir, process.cwd()),
        root: config,
      })
      sessionRunId = result.run.id
      return ok({ run: result.run, agents: result.agents })
    }

    if (name === 'kill') return ok(killAgent(String(a.agent_id)))
    if (name === 'stop') return ok(stopRun(String(a.run_id)))

    if (name === 'send_text') {
      sendText(String(a.agent_id), asString(a.text))
      return ok({ sent: true })
    }

    if (name === 'send_key') {
      sendKey(String(a.agent_id), parseKey(a.key))
      return ok({ sent: true })
    }

    if (name === 'interrupt') {
      interrupt(String(a.agent_id))
      return ok({ sent: true })
    }

    if (name === 'read') {
      // peekAgent swallows a missing-agent error and returns '', so validate
      // first to give callers a clean "agent not found" instead of empty output.
      findAgent(String(a.agent_id))
      const lines = typeof a.lines === 'number' && a.lines > 0 ? Math.floor(a.lines) : 20
      return ok(peekAgent(String(a.agent_id), lines))
    }

    if (name === 'list') {
      return ok(listRuns().map(run => ({ ...run, agents: listAgents(run.id) })))
    }

    if (name === 'request_approval') {
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
    }

    if (name === 'resolve_approval') {
      const decision = a.decision === 'approved' ? 'approved' : a.decision === 'denied' ? 'denied' : null
      if (!decision) throw new Error('decision must be approved or denied')
      return ok(resolveRunApproval(String(a.approval_id), decision, typeof a.note === 'string' ? a.note : ''))
    }

    if (name === 'check_approval') {
      const approval = listRunApprovals().find(item => item.id === String(a.approval_id))
      if (!approval) throw new Error(`Approval not found: ${String(a.approval_id)}`)
      return ok(readRunApproval(approval.run_id, approval.id))
    }

    if (name === 'list_approvals') {
      return ok(listRunApprovals(typeof a.run_id === 'string' ? a.run_id : undefined, parseApprovalStatus(a.status)))
    }

    return fail(`Unknown tool: ${name}`)
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e))
  }
}

export async function startAgentMcpServer(): Promise<void> {
  const server = new Server(
    { name: 'reevesagents', version: REEVESAGENTS_VERSION },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: MCP_TOOLS }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params
    return handleAgentMcpTool(name, args as Record<string, unknown>)
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)
}
