import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { AgentRecord, RunRecord } from '../src/state/types.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeves-runs-state-test-'))
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
    root_agent_id: `${id}-root`,
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
    task: 'test task',
    task_status: 'queued',
    task_note: '',
    tmux_session: `reeves_${runId}`,
    tmux_window_id: '@1',
    tmux_pane_id: '%1',
    rc_enabled: false,
    permissions: 'ask',
    inbox: [],
    last_seen: Date.now(),
    started_at: '2026-01-01T00:00:01.000Z',
    ended_at: null,
    ...overrides,
  }
}

describe('v1 run state', () => {
  it('stores runs under REEVES_REGISTRY/runs/<run-id>/run.json', async () => {
    const { writeRun, readRun, runPath } = await import('../src/state/runs.js')
    const run = makeRun('r1')
    expect(writeRun(run)).toBe(join(tmpDir, 'runs', 'r1', 'run.json'))
    expect(runPath('r1')).toBe(join(tmpDir, 'runs', 'r1', 'run.json'))
    expect(readRun('r1')).toEqual(run)
  })

  it('lists runs newest first', async () => {
    const { writeRun, listRuns } = await import('../src/state/runs.js')
    writeRun(makeRun('old', { started_at: '2026-01-01T00:00:00.000Z' }))
    writeRun(makeRun('new', { started_at: '2026-01-02T00:00:00.000Z' }))
    expect(listRuns().map(run => run.id)).toEqual(['new', 'old'])
  })

  it('updates one run field without disturbing the rest', async () => {
    const { writeRun, updateRun, readRun } = await import('../src/state/runs.js')
    writeRun(makeRun('r2'))
    updateRun('r2', { status: 'ended', ended_at: '2026-01-02T00:00:00.000Z' })
    const updated = readRun('r2')
    expect(updated.status).toBe('ended')
    expect(updated.working_dir).toBe('/tmp')
  })

  it('uses a readable fallback name for stored runs with blank names', async () => {
    const { readRun } = await import('../src/state/runs.js')
    const runId = '12345678-90ab-cdef-1234-567890abcdef'
    mkdirSync(join(tmpDir, 'runs', runId), { recursive: true })
    writeFileSync(join(tmpDir, 'runs', runId, 'run.json'), JSON.stringify(makeRun(runId, { name: '' })), 'utf-8')

    expect(readRun(runId).name).toBe('Run 12345678')
  })

  it('computes stale status from tmux reality without storing it', async () => {
    const { computeRunStatus } = await import('../src/state/runs.js')
    expect(computeRunStatus(makeRun('r3'), false)).toBe('stale')
    expect(computeRunStatus(makeRun('r4', { status: 'ended', ended_at: '2026-01-02T00:00:00.000Z' }), false)).toBe('ended')
  })

  it('stores agents under their run and lists root before workers', async () => {
    const { writeRun, writeAgent, readAgent, listAgents } = await import('../src/state/runs.js')
    writeRun(makeRun('r5', { root_agent_id: 'root' }))
    writeAgent(makeAgent('worker', 'r5', { role: 'worker', started_at: '2026-01-01T00:00:02.000Z' }))
    writeAgent(makeAgent('root', 'r5', { role: 'root', started_at: '2026-01-01T00:00:03.000Z' }))

    expect(readAgent('r5', 'worker').run_id).toBe('r5')
    expect(listAgents('r5').map(agent => agent.id)).toEqual(['root', 'worker'])
  })

  it('preserves headless root agents when reading state', async () => {
    const { writeRun, writeAgent, readAgent } = await import('../src/state/runs.js')
    writeRun(makeRun('headless', { root_agent_id: 'root' }))
    writeAgent(makeAgent('root', 'headless', {
      role: 'root',
      tmux_window_id: '',
      tmux_pane_id: '',
      headless: true,
    }))

    expect(readAgent('headless', 'root').headless).toBe(true)
  })

  it('updates and heartbeats agents', async () => {
    const { writeRun, writeAgent, updateAgent, heartbeatAgent, readAgent } = await import('../src/state/runs.js')
    writeRun(makeRun('r6'))
    writeAgent(makeAgent('a1', 'r6', { last_seen: 1 }))
    updateAgent('r6', 'a1', { task_status: 'working', task_note: 'running tests' })
    heartbeatAgent('r6', 'a1')
    const agent = readAgent('r6', 'a1')
    expect(agent.task_status).toBe('working')
    expect(agent.task_note).toBe('running tests')
    expect(agent.last_seen).toBeGreaterThan(1)
  })

  it('redacts agent task, note, and inbox message text before writing', async () => {
    const { writeRun, writeAgent, appendAgentInbox, readAgent } = await import('../src/state/runs.js')
    writeRun(makeRun('r7'))
    writeAgent(makeAgent('a2', 'r7', {
      task: 'use sk-ant-api03-abcdefghij1234567890abcdef',
      task_note: 'token sk-ant-api03-abcdefghij1234567890abcdef',
    }))
    appendAgentInbox('r7', 'a2', {
      id: 'm1',
      from_id: 'root',
      text: 'message sk-ant-api03-abcdefghij1234567890abcdef',
      sent_at: '2026-01-01T00:00:00.000Z',
      read: false,
    })
    const agent = readAgent('r7', 'a2')
    expect(agent.task).toContain('[REDACTED]')
    expect(agent.task_note).toContain('[REDACTED]')
    expect(agent.inbox[0]?.text).toContain('[REDACTED]')
  })

  it('drains an agent inbox after reading', async () => {
    const { writeRun, writeAgent, appendAgentInbox, readAgentInbox, readAgent } = await import('../src/state/runs.js')
    writeRun(makeRun('r8'))
    writeAgent(makeAgent('a3', 'r8'))
    appendAgentInbox('r8', 'a3', {
      id: 'm2',
      from_id: 'root',
      text: 'hello',
      sent_at: '2026-01-01T00:00:00.000Z',
      read: false,
    })
    expect(readAgentInbox('r8', 'a3')).toHaveLength(1)
    expect(readAgent('r8', 'a3').inbox).toEqual([])
  })

  it('creates, lists, and resolves approvals inside the run folder', async () => {
    const {
      writeRun,
      writeAgent,
      createRunApproval,
      listRunApprovals,
      resolveRunApproval,
      readRunApproval,
    } = await import('../src/state/runs.js')
    writeRun(makeRun('r9'))
    writeAgent(makeAgent('a4', 'r9'))

    const approval = createRunApproval({
      agent_id: 'a4',
      action: 'deploy',
      summary: 'deploy review app',
      risk: 'high',
    })

    expect(approval.run_id).toBe('r9')
    expect(existsSync(join(tmpDir, 'runs', 'r9', 'approvals', `${approval.id}.json`))).toBe(true)
    expect(listRunApprovals('r9', 'pending')).toHaveLength(1)

    const resolved = resolveRunApproval(approval.id, 'approved', 'ok')
    expect(resolved.status).toBe('approved')
    expect(resolved.decision_note).toBe('ok')
    expect(readRunApproval('r9', approval.id).status).toBe('approved')
  })

  it('redacts approval text and details before writing', async () => {
    const { writeRun, writeAgent, createRunApproval, readRunApproval } = await import('../src/state/runs.js')
    writeRun(makeRun('r10'))
    writeAgent(makeAgent('a5', 'r10'))
    const approval = createRunApproval({
      agent_id: 'a5',
      action: 'use token',
      summary: 'send sk-ant-api03-abcdefghij1234567890abcdef',
      details: { token: 'sk-ant-api03-abcdefghij1234567890abcdef' },
    })

    const loaded = readRunApproval('r10', approval.id)
    expect(loaded.summary).toContain('[REDACTED]')
    expect(String(loaded.details.token)).toContain('[REDACTED]')
  })

  it('normalizes malformed stored agents', async () => {
    const { writeRun, readAgent } = await import('../src/state/runs.js')
    writeRun(makeRun('r11'))
    const path = join(tmpDir, 'runs', 'r11', 'agents', 'bad.json')
    mkdirSync(join(tmpDir, 'runs', 'r11', 'agents'), { recursive: true })
    writeFileSync(path, JSON.stringify({ id: 'bad', run_id: 'r11', provider: 'old', task_status: 'idle' }), 'utf-8')
    const agent = readAgent('r11', 'bad')
    expect(agent.provider).toBe('cc')
    expect(agent.task_status).toBe('queued')
  })

  it('removes only the selected run folder', async () => {
    const { writeRun, removeRun } = await import('../src/state/runs.js')
    writeRun(makeRun('keep'))
    writeRun(makeRun('drop'))
    removeRun('drop')
    expect(existsSync(join(tmpDir, 'runs', 'drop'))).toBe(false)
    expect(JSON.parse(readFileSync(join(tmpDir, 'runs', 'keep', 'run.json'), 'utf-8')).id).toBe('keep')
  })

  describe('autoCleanupRuns', () => {
    it('returns empty when registry has no runs', async () => {
      const { autoCleanupRuns } = await import('../src/state/runs.js')
      const result = autoCleanupRuns({ sessionExists: () => false })
      expect(result.removed).toEqual([])
    })

    it('removes runs with status ended', async () => {
      const { writeRun, autoCleanupRuns } = await import('../src/state/runs.js')
      writeRun(makeRun('e1', { status: 'ended', ended_at: '2026-01-01T00:00:01.000Z' }))
      const result = autoCleanupRuns({ sessionExists: () => true })
      expect(result.removed).toContain('e1')
      expect(existsSync(join(tmpDir, 'runs', 'e1'))).toBe(false)
    })

    it('removes runs with ended_at set even if status is running', async () => {
      const { writeRun, autoCleanupRuns } = await import('../src/state/runs.js')
      writeRun(makeRun('e2', { status: 'running', ended_at: '2026-01-01T00:00:01.000Z' }))
      const result = autoCleanupRuns({ sessionExists: () => true })
      expect(result.removed).toContain('e2')
    })

    it('keeps running runs whose tmux session is alive', async () => {
      const { writeRun, writeAgent, autoCleanupRuns } = await import('../src/state/runs.js')
      writeRun(makeRun('alive', { root_agent_id: 'root' }))
      writeAgent(makeAgent('root', 'alive', { role: 'root', headless: true, tmux_window_id: '', tmux_pane_id: '' }))
      const result = autoCleanupRuns({ sessionExists: () => true })
      expect(result.removed).not.toContain('alive')
      expect(existsSync(join(tmpDir, 'runs', 'alive'))).toBe(true)
    })

    it('removes running runs with no root agent even when the tmux session is alive', async () => {
      const { writeRun, autoCleanupRuns } = await import('../src/state/runs.js')
      writeRun(makeRun('missing-root'))
      const result = autoCleanupRuns({ sessionExists: () => true })
      expect(result.removed).toContain('missing-root')
      expect(existsSync(join(tmpDir, 'runs', 'missing-root'))).toBe(false)
    })

    it('removes running runs whose tmux session is gone (stale)', async () => {
      const { writeRun, autoCleanupRuns } = await import('../src/state/runs.js')
      writeRun(makeRun('stale'))
      const result = autoCleanupRuns({ sessionExists: () => false })
      expect(result.removed).toContain('stale')
      expect(existsSync(join(tmpDir, 'runs', 'stale'))).toBe(false)
    })

    it('removes running runs whose agent windows are gone even when the run session is alive', async () => {
      const { writeRun, writeAgent, autoCleanupRuns } = await import('../src/state/runs.js')
      writeRun(makeRun('window-stale', { root_agent_id: 'root' }))
      writeAgent(makeAgent('root', 'window-stale', { role: 'root', tmux_window_id: '@dead', tmux_pane_id: '%dead' }))

      const result = autoCleanupRuns({
        sessionExists: () => true,
        targetExists: target => target !== '@dead',
      })

      expect(result.removed).toContain('window-stale')
      expect(existsSync(join(tmpDir, 'runs', 'window-stale'))).toBe(false)
    })

    it('cleans only dead and keeps live ones in a mixed registry', async () => {
      const { writeRun, writeAgent, autoCleanupRuns } = await import('../src/state/runs.js')
      writeRun(makeRun('live', { root_agent_id: 'root' }))
      writeAgent(makeAgent('root', 'live', { role: 'root', headless: true, tmux_window_id: '', tmux_pane_id: '' }))
      writeRun(makeRun('done', { status: 'ended', ended_at: '2026-01-01T00:00:01.000Z' }))
      writeRun(makeRun('gone'))
      const result = autoCleanupRuns({ sessionExists: (s) => s === 'reeves_live' })
      expect(result.removed.sort()).toEqual(['done', 'gone'])
      expect(existsSync(join(tmpDir, 'runs', 'live'))).toBe(true)
    })

    it('skips the stale check when tmux is not available, but still cleans ended', async () => {
      const { writeRun, autoCleanupRuns } = await import('../src/state/runs.js')
      writeRun(makeRun('still-running'))
      writeRun(makeRun('finished', { status: 'ended', ended_at: '2026-01-01T00:00:01.000Z' }))
      const result = autoCleanupRuns({
        tmuxAvailable: () => false,
        sessionExists: undefined,
      })
      // When sessionExists is undefined and tmuxAvailable is false, only ended
      // runs are cleaned. The "still-running" entry is preserved.
      expect(result.removed).toEqual(['finished'])
      expect(existsSync(join(tmpDir, 'runs', 'still-running'))).toBe(true)
    })
  })
})
