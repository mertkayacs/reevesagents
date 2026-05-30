import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { AgentRecord, RunRecord } from '../src/state/types.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeves-mcp-test-'))
  process.env.REEVES_REGISTRY = tmpDir
})

afterEach(() => {
  delete process.env.REEVES_REGISTRY
  rmSync(tmpDir, { recursive: true, force: true })
})

function makeRun(id: string, overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id,
    name: `run-${id}`,
    status: 'running',
    tmux_session: `reeves_${id}`,
    reeves_window_id: '@0',
    reeves_pane_id: '%0',
    root_agent_id: 'root',
    working_dir: '/tmp',
    preset_name: null,
    started_at: '2026-01-01T00:00:00.000Z',
    ended_at: null,
    ...overrides,
  }
}

function makeAgent(id: string, runId: string, overrides: Partial<AgentRecord> = {}): AgentRecord {
  return {
    id,
    run_id: runId,
    nickname: `agent-${id}`,
    provider: 'cc',
    model: '',
    role: 'worker',
    working_dir: '/tmp',
    task: 'test',
    task_status: 'queued',
    task_note: '',
    tmux_session: `reeves_${runId}`,
    tmux_window_id: '@1',
    tmux_pane_id: '%1',
    rc_enabled: false,
    permissions: 'ask',
    inbox: [],
    last_seen: Date.now() - 60_000,
    started_at: '2026-01-01T00:00:01.000Z',
    ended_at: null,
    ...overrides,
  }
}

async function seedRun() {
  const { writeRun, writeAgent } = await import('../src/state/runs.js')
  const run = makeRun('run1', { root_agent_id: 'root' })
  const root = makeAgent('root', 'run1', { role: 'root', nickname: 'lead', provider: 'codex', tmux_window_id: '@1', tmux_pane_id: '%1' })
  const worker = makeAgent('worker', 'run1', { role: 'worker', nickname: 'reviewer', provider: 'opencode', tmux_window_id: '@2', tmux_pane_id: '%2' })
  writeRun(run)
  writeAgent(root)
  writeAgent(worker)
  return { run, root, worker }
}

function jsonText(result: { content: Array<{ text: string }> }) {
  return JSON.parse(result.content[0]!.text) as Record<string, unknown>
}

describe('mcp tools', () => {
  it('exposes the v1 design tool list', async () => {
    const { TOOLS } = await import('../src/mcp.js')
    expect(TOOLS.map(t => t.name)).toEqual([
      'start_run',
      'list_runs',
      'context',
      'list_agents',
      'tree',
      'get_run',
      'open_reeves',
      'open_agent',
      'peek',
      'wait',
      'send_text',
      'send_key',
      'interrupt',
      'spawn_worker',
      'kill_agent',
      'stop_run',
      'update_task',
      'send_message',
      'check_messages',
      'request_approval',
      'check_approval',
      'list_approvals',
      'resolve_approval',
      'poll_approval',
      'get_inbox',
      'doctor',
    ])
  })

  it('start_run schema only lists focused providers', async () => {
    const { TOOLS } = await import('../src/mcp.js')
    const startRun = TOOLS.find(t => t.name === 'start_run')!
    const root = startRun.inputSchema.properties.root as { properties: { provider: { enum: string[] } } }
    expect(root.properties.provider.enum).toEqual(['cc', 'codex', 'opencode', 'hermes'])
  })

  it('tool schemas avoid Codex-rejected top-level combinators', async () => {
    const { TOOLS } = await import('../src/mcp.js')
    const forbidden = ['oneOf', 'anyOf', 'allOf', 'enum', 'not']
    for (const tool of TOOLS) {
      for (const key of forbidden) {
        expect(tool.inputSchema).not.toHaveProperty(key)
      }
    }
  })

  it('start_run rejects non-headless payloads without a root config', async () => {
    const { handleMcpTool } = await import('../src/mcp.js')
    const result = await handleMcpTool('start_run', { working_dir: '/tmp' }, null)
    expect((result as { isError?: boolean }).isError).toBe(true)
    expect(jsonText(result).error).toBe('root is required unless root_is_caller is true')
  })

  it('lists runs and agents in caller scope', async () => {
    const { handleMcpTool } = await import('../src/mcp.js')
    const { run, root, worker } = await seedRun()

    const operatorRuns = await handleMcpTool('list_runs', {}, null)
    expect((jsonText(operatorRuns) as unknown as RunRecord[])[0]?.id).toBe(run.id)

    const rootAgents = await handleMcpTool('list_agents', {}, root.id)
    expect((jsonText(rootAgents) as unknown as AgentRecord[]).map(agent => agent.id)).toEqual([root.id, worker.id])

    const workerRuns = await handleMcpTool('list_runs', {}, worker.id)
    expect((jsonText(workerRuns) as unknown as RunRecord[]).map(item => item.id)).toEqual([run.id])
  })

  it('returns run tree and get_run payloads', async () => {
    const { handleMcpTool } = await import('../src/mcp.js')
    const { run, root, worker } = await seedRun()

    const tree = jsonText(await handleMcpTool('tree', { run_id: run.id }, root.id))
    expect(((tree.root as AgentRecord).id)).toBe(root.id)
    expect((tree.workers as AgentRecord[])[0]?.id).toBe(worker.id)
    expect(tree).not.toHaveProperty('reeves')

    const getRun = jsonText(await handleMcpTool('get_run', { run_id: run.id }, null))
    expect((getRun.agents as AgentRecord[])).toHaveLength(2)
    expect((getRun.approvals as unknown[])).toHaveLength(0)

    const rootDefaultGetRun = jsonText(await handleMcpTool('get_run', {}, root.id))
    expect((rootDefaultGetRun.run as RunRecord).id).toBe(run.id)
  })

  it('returns current run context for root callers', async () => {
    const { handleMcpTool } = await import('../src/mcp.js')
    const { run, root, worker } = await seedRun()

    const context = jsonText(await handleMcpTool('context', {}, root.id))

    expect(context.role).toBe('root')
    expect((context.agent as AgentRecord).id).toBe(root.id)
    expect((context.agent as AgentRecord).task_status).toBe('working')
    expect((context.run as RunRecord).id).toBe(run.id)
    expect((context.workers as AgentRecord[]).map(agent => agent.id)).toEqual([worker.id])
    expect((context.controls as { can_spawn_worker: boolean }).can_spawn_worker).toBe(true)
  })

  it('requires run_id for external operator current-run tools', async () => {
    const { handleMcpTool } = await import('../src/mcp.js')
    await seedRun()

    const result = await handleMcpTool('get_run', {}, null)

    expect((result as { isError?: boolean }).isError).toBe(true)
    expect(jsonText(result).error).toBe('run_id is required for external operator callers')
  })

  it('send_message and check_messages roundtrip through agent inbox', async () => {
    const { handleMcpTool } = await import('../src/mcp.js')
    const { root, worker } = await seedRun()

    await handleMcpTool('send_message', { agent_id: worker.id, text: 'hello' }, root.id)
    const result = await handleMcpTool('check_messages', {}, worker.id)
    const messages = JSON.parse(result.content[0]!.text) as Array<{ text: string; from_id: string }>

    expect(messages).toHaveLength(1)
    expect(messages[0]?.text).toBe('hello')
    expect(messages[0]?.from_id).toBe(root.id)
  })

  it('marks queued agent callers working when they use MCP', async () => {
    const { handleMcpTool } = await import('../src/mcp.js')
    const { readAgent } = await import('../src/state/runs.js')
    const { worker } = await seedRun()

    await handleMcpTool('list_runs', {}, worker.id)

    expect(readAgent(worker.run_id, worker.id).task_status).toBe('working')
    expect(readAgent(worker.run_id, worker.id).last_seen).toBeGreaterThan(worker.last_seen)
  })

  it('update_task allows workers to update themselves only', async () => {
    const { handleMcpTool } = await import('../src/mcp.js')
    const { readAgent } = await import('../src/state/runs.js')
    const { root, worker } = await seedRun()

    await handleMcpTool('update_task', { agent_id: worker.id, status: 'working', note: 'phase 1' }, worker.id)
    expect(readAgent(worker.run_id, worker.id).task_status).toBe('working')
    expect(readAgent(worker.run_id, worker.id).task_note).toBe('phase 1')

    const denied = await handleMcpTool('update_task', { agent_id: root.id, status: 'done' }, worker.id)
    expect((denied as { isError?: boolean }).isError).toBe(true)
  })

  it('enforces root/operator control for input and lifecycle tools before tmux calls', async () => {
    const { handleMcpTool } = await import('../src/mcp.js')
    const { root, worker } = await seedRun()

    const workerControl = await handleMcpTool('send_text', { agent_id: root.id, text: 'x' }, worker.id)
    expect((workerControl as { isError?: boolean }).isError).toBe(true)

    const rootSelfKill = await handleMcpTool('kill_agent', { agent_id: root.id }, root.id)
    expect((rootSelfKill as { isError?: boolean }).isError).toBe(true)
  })

  it('agents can request and check approvals, workers cannot resolve or list them', async () => {
    const { handleMcpTool } = await import('../src/mcp.js')
    const { worker } = await seedRun()

    const requested = await handleMcpTool('request_approval', {
      action: 'publish',
      summary: 'publish package',
      details: { version: '1.0.0' },
      risk: 'high',
    }, worker.id)
    const approval = jsonText(requested)

    expect(approval.status).toBe('pending')
    expect(approval.agent_id).toBe(worker.id)
    expect(approval.run_id).toBe(worker.run_id)

    const checked = await handleMcpTool('check_approval', { approval_id: approval.id }, worker.id)
    expect(jsonText(checked).id).toBe(approval.id)

    const listDenied = await handleMcpTool('list_approvals', {}, worker.id)
    const resolveDenied = await handleMcpTool('resolve_approval', { approval_id: approval.id, decision: 'approved' }, worker.id)
    expect((listDenied as { isError?: boolean }).isError).toBe(true)
    expect((resolveDenied as { isError?: boolean }).isError).toBe(true)
  })

  it('root and external operator callers can resolve approvals in scope', async () => {
    const { handleMcpTool } = await import('../src/mcp.js')
    const { root, worker } = await seedRun()

    const requested = await handleMcpTool('request_approval', {
      action: 'deploy',
      summary: 'deploy review app',
      risk: 'medium',
    }, worker.id)
    const approval = jsonText(requested)

    const rootList = await handleMcpTool('list_approvals', { status: 'pending' }, root.id)
    expect((jsonText(rootList) as unknown as Array<{ id: string }>)[0]?.id).toBe(approval.id)

    const resolved = await handleMcpTool('resolve_approval', {
      approval_id: approval.id,
      decision: 'approved',
      note: 'approved in test',
    }, null)

    expect(jsonText(resolved).status).toBe('approved')
    expect(jsonText(resolved).decision_note).toBe('approved in test')
  })

  it('only roots and external operators can poll approval requests', async () => {
    const { handleMcpTool } = await import('../src/mcp.js')
    const { root, worker } = await seedRun()

    const requested = await handleMcpTool('request_approval', {
      action: 'publish',
      summary: 'publish package',
    }, worker.id)
    const approval = jsonText(requested)

    const workerPoll = await handleMcpTool('poll_approval', { run_id: worker.run_id, timeout_ms: 1 }, worker.id)
    expect((workerPoll as { isError?: boolean }).isError).toBe(true)

    const rootPoll = await handleMcpTool('poll_approval', { timeout_ms: 1 }, root.id)
    expect(jsonText(rootPoll).id).toBe(approval.id)
  })
})
