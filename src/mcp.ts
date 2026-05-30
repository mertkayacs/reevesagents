// MCP server: v1 run/agent control plane over stdio.
// Caller role comes from REEVES_SESSION_ID, kept as the compatibility agent id.
// Invariant: all surfaces use the same run state and runtime operations.

import { randomUUID } from 'node:crypto'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

import { PROVIDERS } from './launcher/providers.js'
import {
  interrupt,
  killAgent,
  openAgent,
  openReeves,
  peekAgent,
  sendKey,
  sendText,
  spawnWorker,
  startRun,
  stopRun,
  type AllowedKey,
} from './launcher/runtime.js'
import { runDoctor } from './launcher/doctor.js'
import {
  appendAgentInbox,
  createRunApproval,
  findAgent,
  listAgents,
  listRunApprovals,
  listRuns,
  readAgentInbox,
  readRun,
  readRunApproval,
  resolveRunApproval,
  updateAgent,
  computeRunStatus,
  runHasLiveTmuxTarget,
} from './state/runs.js'
import type {
  AgentRecord,
  ApprovalRisk,
  ApprovalStatus,
  Effort,
  Message,
  Permissions,
  Provider,
  RunRecord,
  TaskStatus,
} from './state/types.js'

type Caller =
  | { role: 'operator' }
  | { role: 'root' | 'worker', agent: AgentRecord, run: RunRecord }

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] }
}

function fail(message: string) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }],
    isError: true as const,
  }
}

function callerContext(callerAgentId: string | null): Caller {
  if (!callerAgentId) return { role: 'operator' }
  const agent = findAgent(callerAgentId)
  const run = readRun(agent.run_id)
  return { role: agent.role, agent, run }
}

function callerLabel(caller: Caller): string {
  return caller.role === 'operator' ? 'operator' : caller.agent.id
}

function parseEffort(value: unknown): Effort {
  if (value === 'low' || value === 'medium' || value === 'high' || value === 'xhigh' || value === 'max') return value
  return 'default'
}

function parseApprovalStatus(value: unknown): ApprovalStatus | undefined {
  if (value === 'pending' || value === 'approved' || value === 'denied' || value === 'expired') return value
  return undefined
}

function parseApprovalRisk(value: unknown): ApprovalRisk {
  if (value === 'low' || value === 'medium' || value === 'high') return value
  return 'medium'
}

function parseTaskStatus(value: unknown): TaskStatus {
  if (value === 'queued' || value === 'working' || value === 'done' || value === 'failed' || value === 'blocked') return value
  throw new Error('status must be queued, working, done, failed, or blocked')
}

function parsePermissions(value: unknown): Permissions | undefined {
  if (value === 'skip' || value === 'ask') return value
  return undefined
}

function parseProvider(value: unknown): Provider {
  if (value === 'cc' || value === 'codex' || value === 'opencode' || value === 'hermes') return value
  throw new Error(`Unsupported provider: ${String(value)}`)
}

function parseOptionalProvider(value: unknown): Provider {
  if (value === 'cc' || value === 'codex' || value === 'opencode' || value === 'hermes') return value
  return 'cc'
}

function parseWorkerConfig(a: Record<string, unknown>) {
  return {
    nickname: typeof a.nickname === 'string' ? a.nickname : undefined,
    provider: parseProvider(a.provider),
    model: String(a.model ?? ''),
    auth_mode: a.auth_mode === 'api-key' ? 'api-key' as const : 'default' as const,
    effort: parseEffort(a.effort),
    task: String(a.task ?? ''),
    working_dir: typeof a.working_dir === 'string' ? a.working_dir : undefined,
    permissions: parsePermissions(a.permissions),
    rc_enabled: typeof a.rc_enabled === 'boolean' ? a.rc_enabled : false,
  }
}

function parseStartRunArgs(a: Record<string, unknown>) {
  const rootIsCaller = a.root_is_caller === true
  if (!rootIsCaller && (typeof a.root !== 'object' || a.root === null)) {
    throw new Error('root is required unless root_is_caller is true')
  }
  const rootRaw = typeof a.root === 'object' && a.root !== null ? a.root as Record<string, unknown> : {}
  const workersRaw = Array.isArray(a.workers) ? a.workers : []
  const workers = workersRaw
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map(parseWorkerConfig)

  const root = rootIsCaller
    ? {
        provider: parseOptionalProvider(rootRaw.provider),
        model: typeof rootRaw.model === 'string' ? rootRaw.model : '',
        task: typeof rootRaw.task === 'string' ? rootRaw.task : '',
        nickname: typeof rootRaw.nickname === 'string' ? rootRaw.nickname : undefined,
        permissions: parsePermissions(rootRaw.permissions),
        auth_mode: rootRaw.auth_mode === 'api-key' ? 'api-key' as const : 'default' as const,
        effort: parseEffort(rootRaw.effort),
        rc_enabled: typeof rootRaw.rc_enabled === 'boolean' ? rootRaw.rc_enabled : false,
      }
    : parseWorkerConfig(rootRaw)

  return {
    name: String(a.name ?? '').trim() || 'run',
    working_dir: String(a.working_dir ?? process.cwd()),
    root,
    workers,
    preset_name: typeof a.preset_name === 'string' ? a.preset_name : null,
    ready_delay_ms: typeof a.ready_delay_ms === 'number' ? a.ready_delay_ms : undefined,
    root_is_caller: rootIsCaller,
  }
}

function requireOperator(caller: Caller): void {
  if (caller.role !== 'operator') throw new Error('external operator only')
}

function requireRunAccess(caller: Caller, runId: string): void {
  if (caller.role === 'operator') return
  if (caller.run.id !== runId) throw new Error('run is outside caller scope')
}

function requireRootOrOperatorForRun(caller: Caller, runId: string): void {
  if (caller.role === 'operator') return
  if (caller.role === 'root' && caller.run.id === runId) return
  throw new Error('root or external operator required')
}

function requireAgentReadAccess(caller: Caller, agent: AgentRecord): void {
  if (caller.role === 'operator') return
  if (caller.run.id !== agent.run_id) throw new Error('agent is outside caller scope')
  if (caller.role === 'worker' && caller.agent.id !== agent.id) throw new Error('worker can only inspect itself')
}

function requireAgentControlAccess(caller: Caller, agent: AgentRecord): void {
  if (caller.role === 'operator') return
  if (caller.role === 'root' && caller.run.id === agent.run_id && caller.agent.id !== agent.id) return
  throw new Error('root or external operator required for agent control')
}

function runTree(run: RunRecord) {
  const agents = listAgents(run.id)
  return {
    run: { ...run, view_status: computeRunStatus(run, runHasLiveTmuxTarget(run)) },
    root: agents.find(agent => agent.role === 'root') ?? null,
    workers: agents.filter(agent => agent.role === 'worker'),
  }
}

function currentRunId(caller: Caller, runId: unknown): string {
  if (typeof runId === 'string' && runId.trim()) return runId
  if (caller.role !== 'operator') return caller.run.id
  throw new Error('run_id is required for external operator callers')
}

function callerContextPayload(caller: Caller) {
  if (caller.role === 'operator') {
    return {
      role: 'operator',
      runs: listRuns().map(run => ({ ...run, view_status: computeRunStatus(run, runHasLiveTmuxTarget(run)) })),
      controls: {
        can_start_run: true,
        can_control_any_run: true,
      },
    }
  }

  const tree = runTree(caller.run)
  return {
    role: caller.role,
    agent: caller.agent,
    ...tree,
    approvals: listRunApprovals(caller.run.id),
    controls: {
      can_spawn_worker: caller.role === 'root',
      can_control_workers: caller.role === 'root',
      can_stop_run: caller.role === 'root',
      can_resolve_approvals: caller.role === 'root',
      current_run_default: true,
    },
  }
}

function markCallerActive(caller: Caller): Caller {
  if (caller.role === 'operator') return caller
  updateAgent(caller.agent.run_id, caller.agent.id, {
    last_seen: Date.now(),
    ...(caller.agent.ended_at || caller.agent.task_status !== 'queued' ? {} : { task_status: 'working' as const }),
  })
  return callerContext(caller.agent.id)
}

export const TOOLS = [
  {
    name: 'start_run',
    description: 'Start a ReevesAgents run. External operator only. Creates a per-run tmux session with a root agent and optional workers.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        working_dir: { type: 'string' },
        root: {
          type: 'object',
          properties: {
            provider: { type: 'string', enum: PROVIDERS },
            model: { type: 'string' },
            task: { type: 'string' },
            nickname: { type: 'string' },
            permissions: { type: 'string', enum: ['skip', 'ask'] },
            auth_mode: { type: 'string', enum: ['default', 'api-key'] },
            effort: { type: 'string', enum: ['default', 'low', 'medium', 'high', 'xhigh', 'max'] },
            rc_enabled: { type: 'boolean' },
          },
          required: ['provider', 'model', 'task'],
        },
        workers: { type: 'array', items: { type: 'object' } },
        preset_name: { type: 'string' },
        ready_delay_ms: { type: 'number' },
        root_is_caller: { type: 'boolean', description: 'When true, create a headless root agent instead of a root tmux window. Use the returned root agent id as REEVES_SESSION_ID to manage the run as root.' },
      },
      required: ['working_dir'],
    },
  },
  {
    name: 'list_runs',
    description: 'List runs visible to the caller. Operators see all runs; agents see their own run.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'context',
    description: 'Return caller identity, current run, agents, approvals, and available control scope. Root and worker callers get their current run.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_agents',
    description: 'List agents by run. Operators can omit run_id to list all agents.',
    inputSchema: {
      type: 'object',
      properties: { run_id: { type: 'string' } },
    },
  },
  {
    name: 'tree',
    description: 'Return run tree data with root and worker agent records.',
    inputSchema: {
      type: 'object',
      properties: { run_id: { type: 'string' } },
    },
  },
  {
    name: 'get_run',
    description: 'Return one run with its agent and approval records. Root and worker callers may omit run_id to use their current run.',
    inputSchema: {
      type: 'object',
      properties: { run_id: { type: 'string' } },
    },
  },
  {
    name: 'open_reeves',
    description: 'Open the ReevesAgents TUI window for a run. Root and worker callers may omit run_id to use their current run.',
    inputSchema: {
      type: 'object',
      properties: { run_id: { type: 'string' } },
    },
  },
  {
    name: 'open_agent',
    description: 'Open a real provider CLI window for one agent.',
    inputSchema: {
      type: 'object',
      properties: { agent_id: { type: 'string' } },
      required: ['agent_id'],
    },
  },
  {
    name: 'peek',
    description: 'Return last N lines of one agent pane output, ANSI-stripped and redacted.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string' },
        lines: { type: 'number' },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'wait',
    description: 'Block until one agent ends or timeout_ms elapses. Default 300000ms.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string' },
        timeout_ms: { type: 'number' },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'send_text',
    description: 'Paste text into one agent pane. Root can control workers in its run; operators can control any agent.',
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
    description: 'Send one allowed key into one agent pane.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string' },
        key: { type: 'string', enum: ['enter', 'escape', 'backspace', 'tab', 'space', 'up', 'down', 'left', 'right', 'ctrl-c'] },
      },
      required: ['agent_id', 'key'],
    },
  },
  {
    name: 'interrupt',
    description: 'Send Ctrl-C to one agent pane.',
    inputSchema: {
      type: 'object',
      properties: { agent_id: { type: 'string' } },
      required: ['agent_id'],
    },
  },
  {
    name: 'spawn_worker',
    description: 'Spawn one worker window inside an existing run session. Root callers may omit run_id to use their current run. Put the first assignment in task; wait and inspect the worker before follow-up text.',
    inputSchema: {
      type: 'object',
      properties: {
        run_id: { type: 'string' },
        provider: { type: 'string', enum: PROVIDERS },
        model: { type: 'string' },
        task: { type: 'string' },
        nickname: { type: 'string' },
        working_dir: { type: 'string' },
        permissions: { type: 'string', enum: ['skip', 'ask'] },
        auth_mode: { type: 'string', enum: ['default', 'api-key'] },
        effort: { type: 'string', enum: ['default', 'low', 'medium', 'high', 'xhigh', 'max'] },
        rc_enabled: { type: 'boolean' },
        ready_delay_ms: { type: 'number' },
      },
      required: ['provider', 'model', 'task'],
    },
  },
  {
    name: 'kill_agent',
    description: 'Kill one worker agent window. Killing the root is stop_run.',
    inputSchema: {
      type: 'object',
      properties: { agent_id: { type: 'string' } },
      required: ['agent_id'],
    },
  },
  {
    name: 'stop_run',
    description: 'Stop a run by killing its tmux session/windows and marking the run and agents ended. Root callers may omit run_id to stop their current run.',
    inputSchema: {
      type: 'object',
      properties: { run_id: { type: 'string' } },
    },
  },
  {
    name: 'update_task',
    description: 'Set task_status and optional note for an agent.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string' },
        status: { type: 'string', enum: ['queued', 'working', 'done', 'failed', 'blocked'] },
        note: { type: 'string' },
      },
      required: ['agent_id', 'status'],
    },
  },
  {
    name: 'send_message',
    description: 'Write a message into one agent inbox. Target reads it on check_messages.',
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
    name: 'check_messages',
    description: 'Consume caller agent inbox, heartbeat last_seen, and move queued callers to working. Call every prompt cycle.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'request_approval',
    description: 'Request root or operator approval for a proposed action. Agent callers only.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string' },
        summary: { type: 'string' },
        details: { type: 'object' },
        risk: { type: 'string', enum: ['low', 'medium', 'high'] },
      },
      required: ['action', 'summary'],
    },
  },
  {
    name: 'check_approval',
    description: 'Read one approval status. Workers can only check approvals they requested.',
    inputSchema: {
      type: 'object',
      properties: { approval_id: { type: 'string' } },
      required: ['approval_id'],
    },
  },
  {
    name: 'list_approvals',
    description: 'List approval requests. Operators can list all; roots can list their run.',
    inputSchema: {
      type: 'object',
      properties: {
        run_id: { type: 'string' },
        status: { type: 'string', enum: ['pending', 'approved', 'denied', 'expired'] },
      },
    },
  },
  {
    name: 'resolve_approval',
    description: 'Approve or deny one request. Allowed for external operators and the run root.',
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
    name: 'poll_approval',
    description: 'Block until a pending approval appears in the run, then return it. Root callers may omit run_id to use their current run. Returns null on timeout.',
    inputSchema: {
      type: 'object',
      properties: {
        run_id: { type: 'string' },
        timeout_ms: { type: 'number', description: 'Max wait in ms, default 60000' },
      },
    },
  },
  {
    name: 'get_inbox',
    description: 'Read and clear the inbox of any agent in your run. Use with the headless root agent_id to receive messages workers sent upward.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string' },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'doctor',
    description: 'Run setup and environment health checks.',
    inputSchema: { type: 'object', properties: {} },
  },
] as const

export async function handleMcpTool(name: string, a: Record<string, unknown>, callerAgentId: string | null) {
  try {
    const caller = markCallerActive(callerContext(callerAgentId))

    if (name === 'start_run') {
      requireOperator(caller)
      return ok(startRun(parseStartRunArgs(a)))
    }

    if (name === 'list_runs') {
      const runs = caller.role === 'operator' ? listRuns() : [caller.run]
      return ok(runs.map(run => ({ ...run, view_status: computeRunStatus(run, runHasLiveTmuxTarget(run)) })))
    }

    if (name === 'context') {
      return ok(callerContextPayload(caller))
    }

    if (name === 'list_agents') {
      const runId = typeof a.run_id === 'string' ? a.run_id : undefined
      if (runId) requireRunAccess(caller, runId)
      if (caller.role !== 'operator') return ok(listAgents(caller.run.id))
      return ok(listAgents(runId))
    }

    if (name === 'tree') {
      const runId = typeof a.run_id === 'string' ? a.run_id : undefined
      if (runId) {
        requireRunAccess(caller, runId)
        return ok(runTree(readRun(runId)))
      }
      if (caller.role !== 'operator') return ok(runTree(caller.run))
      return ok(listRuns().map(runTree))
    }

    if (name === 'get_run') {
      const runId = currentRunId(caller, a.run_id)
      requireRunAccess(caller, runId)
      const run = readRun(runId)
      return ok({
        run: { ...run, view_status: computeRunStatus(run, runHasLiveTmuxTarget(run)) },
        agents: listAgents(runId),
        approvals: listRunApprovals(runId),
      })
    }

    if (name === 'open_reeves') {
      const runId = currentRunId(caller, a.run_id)
      requireRunAccess(caller, runId)
      openReeves(runId)
      return ok({ opened: true })
    }

    if (name === 'open_agent') {
      const agent = findAgent(String(a.agent_id))
      requireAgentReadAccess(caller, agent)
      openAgent(agent.id)
      return ok({ opened: true })
    }

    if (name === 'peek') {
      const agent = findAgent(String(a.agent_id))
      requireAgentReadAccess(caller, agent)
      return ok(peekAgent(agent.id, typeof a.lines === 'number' ? a.lines : 10))
    }

    if (name === 'wait') {
      const agent = findAgent(String(a.agent_id))
      requireAgentReadAccess(caller, agent)
      const timeoutMs = typeof a.timeout_ms === 'number' ? a.timeout_ms : 300_000
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        const current = findAgent(agent.id)
        if (current.ended_at) return ok({ ended_at: current.ended_at })
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
      return ok({ timeout: true })
    }

    if (name === 'send_text') {
      const agent = findAgent(String(a.agent_id))
      requireAgentControlAccess(caller, agent)
      sendText(agent.id, String(a.text ?? ''))
      return ok({ sent: true })
    }

    if (name === 'send_key') {
      const agent = findAgent(String(a.agent_id))
      requireAgentControlAccess(caller, agent)
      sendKey(agent.id, String(a.key) as AllowedKey)
      return ok({ sent: true })
    }

    if (name === 'interrupt') {
      const agent = findAgent(String(a.agent_id))
      requireAgentControlAccess(caller, agent)
      interrupt(agent.id)
      return ok({ sent: true })
    }

    if (name === 'spawn_worker') {
      const runId = currentRunId(caller, a.run_id)
      requireRootOrOperatorForRun(caller, runId)
      const worker = spawnWorker({ ...parseWorkerConfig(a), run_id: runId, ready_delay_ms: typeof a.ready_delay_ms === 'number' ? a.ready_delay_ms : undefined })
      return ok(worker)
    }

    if (name === 'kill_agent') {
      const agent = findAgent(String(a.agent_id))
      requireAgentControlAccess(caller, agent)
      return ok(killAgent(agent.id))
    }

    if (name === 'stop_run') {
      const runId = currentRunId(caller, a.run_id)
      requireRootOrOperatorForRun(caller, runId)
      return ok(stopRun(runId))
    }

    if (name === 'update_task') {
      const agent = findAgent(String(a.agent_id))
      if (caller.role === 'worker' && caller.agent.id !== agent.id) throw new Error('worker can only update itself')
      if (caller.role === 'root' && caller.run.id !== agent.run_id) throw new Error('agent is outside caller scope')
      updateAgent(agent.run_id, agent.id, {
        task_status: parseTaskStatus(a.status),
        ...(typeof a.note === 'string' ? { task_note: a.note } : {}),
      })
      return ok({ ok: true })
    }

    if (name === 'send_message') {
      const agent = findAgent(String(a.agent_id))
      if (caller.role !== 'operator' && caller.run.id !== agent.run_id) throw new Error('agent is outside caller scope')
      const message: Message = {
        id: randomUUID(),
        from_id: callerLabel(caller),
        text: String(a.text ?? ''),
        sent_at: new Date().toISOString(),
        read: false,
      }
      appendAgentInbox(agent.run_id, agent.id, message)
      return ok({ queued: true })
    }

    if (name === 'check_messages') {
      if (caller.role === 'operator') return fail('REEVES_SESSION_ID not set; caller agent cannot be identified')
      return ok(readAgentInbox(caller.run.id, caller.agent.id))
    }

    if (name === 'request_approval') {
      if (caller.role === 'operator') return fail('agent caller required')
      const action = String(a.action ?? '').trim()
      const summary = String(a.summary ?? '').trim()
      if (!action) return fail('approval action is required')
      if (!summary) return fail('approval summary is required')
      const details = typeof a.details === 'object' && a.details !== null ? a.details as Record<string, unknown> : {}
      return ok(createRunApproval({
        agent_id: caller.agent.id,
        action,
        summary,
        details,
        risk: parseApprovalRisk(a.risk),
      }))
    }

    if (name === 'check_approval') {
      const approvalId = String(a.approval_id)
      const approval = listRunApprovals().find(item => item.id === approvalId)
      if (!approval) throw new Error(`Approval not found: ${approvalId}`)
      if (caller.role === 'worker' && approval.agent_id !== caller.agent.id) throw new Error('approval is outside caller scope')
      if (caller.role === 'root' && approval.run_id !== caller.run.id) throw new Error('approval is outside caller scope')
      return ok(readRunApproval(approval.run_id, approval.id))
    }

    if (name === 'list_approvals') {
      if (caller.role === 'worker') throw new Error('worker cannot list approvals')
      const status = parseApprovalStatus(a.status)
      const runId = typeof a.run_id === 'string' ? a.run_id : undefined
      if (caller.role === 'root') return ok(listRunApprovals(caller.run.id, status))
      return ok(listRunApprovals(runId, status))
    }

    if (name === 'resolve_approval') {
      const decision = a.decision === 'approved' ? 'approved' : a.decision === 'denied' ? 'denied' : null
      if (!decision) throw new Error('decision must be approved or denied')
      const approval = listRunApprovals().find(item => item.id === String(a.approval_id))
      if (!approval) throw new Error(`Approval not found: ${String(a.approval_id)}`)
      requireRootOrOperatorForRun(caller, approval.run_id)
      return ok(resolveRunApproval(approval.id, decision, typeof a.note === 'string' ? a.note : ''))
    }

    if (name === 'poll_approval') {
      const runId = currentRunId(caller, a.run_id)
      requireRootOrOperatorForRun(caller, runId)
      const timeoutMs = typeof a.timeout_ms === 'number' ? a.timeout_ms : 60_000
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        const pending = listRunApprovals(runId, 'pending')
        if (pending.length > 0) return ok(pending[0])
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
      return ok(null)
    }

    if (name === 'get_inbox') {
      const agent = findAgent(String(a.agent_id))
      requireAgentReadAccess(caller, agent)
      updateAgent(agent.run_id, agent.id, { last_seen: Date.now() })
      return ok(readAgentInbox(agent.run_id, agent.id))
    }

    if (name === 'doctor') {
      return ok(runDoctor())
    }

    return fail(`Unknown tool: ${name}`)
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e))
  }
}

export async function startMcpServer(): Promise<void> {
  const callerAgentId = process.env.REEVES_SESSION_ID ?? process.env.REEVES_AGENT_ID ?? null

  const server = new Server(
    { name: 'reevesagents', version: '0.8.0' },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params
    return handleMcpTool(name, args as Record<string, unknown>, callerAgentId)
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)
}
