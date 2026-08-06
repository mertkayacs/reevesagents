import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { AgentRecord, RunRecord } from '../src/core/types.js'

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
    const { writeRun, readRun, runPath } = await import('../src/core/runs.js')
    const run = makeRun('r1')
    expect(writeRun(run)).toBe(join(tmpDir, 'runs', 'r1', 'run.json'))
    expect(runPath('r1')).toBe(join(tmpDir, 'runs', 'r1', 'run.json'))
    expect(readRun('r1')).toEqual(run)
  })

  it('lists runs newest first', async () => {
    const { writeRun, listRuns } = await import('../src/core/runs.js')
    writeRun(makeRun('old', { started_at: '2026-01-01T00:00:00.000Z' }))
    writeRun(makeRun('new', { started_at: '2026-01-02T00:00:00.000Z' }))
    expect(listRuns().map(run => run.id)).toEqual(['new', 'old'])
  })

  it('hides ended runs from active run listings', async () => {
    const { writeRun, listRuns } = await import('../src/core/runs.js')
    writeRun(makeRun('active'))
    writeRun(makeRun('ended', { status: 'ended', ended_at: '2026-01-02T00:00:00.000Z' }))

    expect(listRuns().map(run => run.id)).toEqual(['active'])
  })

  it('updates one run field without disturbing the rest', async () => {
    const { writeRun, updateRun, readRun } = await import('../src/core/runs.js')
    writeRun(makeRun('r2'))
    updateRun('r2', { status: 'ended', ended_at: '2026-01-02T00:00:00.000Z' })
    const updated = readRun('r2')
    expect(updated.status).toBe('ended')
    expect(updated.working_dir).toBe('/tmp')
  })

  it('uses a readable fallback name for stored runs with blank names', async () => {
    const { readRun } = await import('../src/core/runs.js')
    const runId = '12345678-90ab-cdef-1234-567890abcdef'
    mkdirSync(join(tmpDir, 'runs', runId), { recursive: true })
    writeFileSync(join(tmpDir, 'runs', runId, 'run.json'), JSON.stringify(makeRun(runId, { name: '' })), 'utf-8')

    expect(readRun(runId).name).toBe('Run 12345678')
  })

  it('computes stale status from tmux reality without storing it', async () => {
    const { computeRunStatus } = await import('../src/core/runs.js')
    expect(computeRunStatus(makeRun('r3'), false)).toBe('stale')
    expect(computeRunStatus(makeRun('r4', { status: 'ended', ended_at: '2026-01-02T00:00:00.000Z' }), false)).toBe('ended')
  })

  it('stores agents under their run and lists root before workers', async () => {
    const { writeRun, writeAgent, readAgent, listAgents } = await import('../src/core/runs.js')
    writeRun(makeRun('r5', { root_agent_id: 'root' }))
    writeAgent(makeAgent('worker', 'r5', { role: 'worker', started_at: '2026-01-01T00:00:02.000Z' }))
    writeAgent(makeAgent('root', 'r5', { role: 'root', started_at: '2026-01-01T00:00:03.000Z' }))

    expect(readAgent('r5', 'worker').run_id).toBe('r5')
    expect(listAgents('r5').map(agent => agent.id)).toEqual(['root', 'worker'])
  })

  it('preserves headless root agents when reading state', async () => {
    const { writeRun, writeAgent, readAgent } = await import('../src/core/runs.js')
    writeRun(makeRun('headless', { root_agent_id: 'root' }))
    writeAgent(makeAgent('root', 'headless', {
      role: 'root',
      tmux_window_id: '',
      tmux_pane_id: '',
      headless: true,
    }))

    expect(readAgent('headless', 'root').headless).toBe(true)
  })

  it('updates agents', async () => {
    const { writeRun, writeAgent, updateAgent, readAgent } = await import('../src/core/runs.js')
    writeRun(makeRun('r6'))
    writeAgent(makeAgent('a1', 'r6', { last_seen: 1 }))
    updateAgent('r6', 'a1', { task_status: 'working', task_note: 'running tests' })
    const agent = readAgent('r6', 'a1')
    expect(agent.task_status).toBe('working')
    expect(agent.task_note).toBe('running tests')
    expect(agent.last_seen).toBe(1)
  })

  it('redacts agent task, note, and inbox message text before writing', async () => {
    const { writeRun, writeAgent, appendAgentInbox, readAgent } = await import('../src/core/runs.js')
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
    const { writeRun, writeAgent, appendAgentInbox, readAgentInbox, readAgent } = await import('../src/core/runs.js')
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

  it('normalizes malformed stored agents', async () => {
    const { writeRun, readAgent } = await import('../src/core/runs.js')
    writeRun(makeRun('r11'))
    const path = join(tmpDir, 'runs', 'r11', 'agents', 'bad.json')
    mkdirSync(join(tmpDir, 'runs', 'r11', 'agents'), { recursive: true })
    writeFileSync(path, JSON.stringify({ id: 'bad', run_id: 'r11', provider: 'old', task_status: 'idle' }), 'utf-8')
    const agent = readAgent('r11', 'bad')
    expect(agent.provider).toBe('cc')
    expect(agent.task_status).toBe('queued')
  })

  it('removes only the selected run folder', async () => {
    const { writeRun, removeRun } = await import('../src/core/runs.js')
    writeRun(makeRun('keep'))
    writeRun(makeRun('drop'))
    removeRun('drop')
    expect(existsSync(join(tmpDir, 'runs', 'drop'))).toBe(false)
    expect(JSON.parse(readFileSync(join(tmpDir, 'runs', 'keep', 'run.json'), 'utf-8')).id).toBe('keep')
  })

  it('deletes only stopped agents', async () => {
    const { deleteAgent, listAgents, writeAgent, writeRun } = await import('../src/core/runs.js')
    writeRun(makeRun('agents'))
    writeAgent(makeAgent('live', 'agents'))
    writeAgent(makeAgent('ended', 'agents', { ended_at: '2026-01-01T00:00:03.000Z' }))

    expect(() => deleteAgent('live')).toThrow(/stop agent before deleting/i)
    expect(deleteAgent('ended').id).toBe('ended')
    expect(listAgents('agents').map(agent => agent.id)).toEqual(['live'])
  })

  it('deletes one archived history record', async () => {
    const { archiveAndRemoveRun, deleteRunHistory, listRunHistory, writeRun } = await import('../src/core/runs.js')
    writeRun(makeRun('keep', { status: 'ended', ended_at: '2026-01-01T00:00:01.000Z' }))
    writeRun(makeRun('drop', { status: 'ended', ended_at: '2026-01-01T00:00:02.000Z' }))
    archiveAndRemoveRun('keep', 'ended')
    archiveAndRemoveRun('drop', 'ended')

    deleteRunHistory('drop')

    expect(listRunHistory().map(record => record.id)).toEqual(['keep'])
  })

  it('marks a run ended when no live agents remain', async () => {
    const { endRunIfNoLiveAgents, readRun, updateAgent, writeAgent, writeRun } = await import('../src/core/runs.js')
    writeRun(makeRun('solo'))
    writeAgent(makeAgent('root', 'solo', { role: 'root' }))
    updateAgent('solo', 'root', { ended_at: '2026-01-01T00:00:03.000Z' })

    endRunIfNoLiveAgents('solo', '2026-01-01T00:00:03.000Z')

    expect(readRun('solo')).toMatchObject({
      status: 'ended',
      ended_at: '2026-01-01T00:00:03.000Z',
    })
  })

  describe('autoCleanupRuns', () => {
    it('returns empty when registry has no runs', async () => {
      const { autoCleanupRuns } = await import('../src/core/runs.js')
      const result = autoCleanupRuns({ sessionExists: () => false })
      expect(result.removed).toEqual([])
    })

    it('removes runs with status ended', async () => {
      const { writeRun, autoCleanupRuns } = await import('../src/core/runs.js')
      writeRun(makeRun('e1', { status: 'ended', ended_at: '2026-01-01T00:00:01.000Z' }))
      const result = autoCleanupRuns({ sessionExists: () => true })
      expect(result.removed).toContain('e1')
      expect(existsSync(join(tmpDir, 'runs', 'e1'))).toBe(false)
    })

    it('archives simple history before removing ended runs', async () => {
      const { writeRun, writeAgent, autoCleanupRuns, listRunHistory, runHistoryPath } = await import('../src/core/runs.js')
      writeRun(makeRun('hist', { status: 'ended', ended_at: '2026-01-01T00:00:02.000Z', root_agent_id: 'root' }))
      writeAgent(makeAgent('root', 'hist', { role: 'root', provider: 'codex' }))

      const result = autoCleanupRuns({ sessionExists: () => true })
      const history = listRunHistory()

      expect(result.archived).toContain('hist')
      expect(existsSync(runHistoryPath('hist'))).toBe(true)
      expect(history).toHaveLength(1)
      expect(history[0]).toMatchObject({
        id: 'hist',
        name: 'run-hist',
        status: 'ended',
        working_dir: '/tmp',
        started_at: '2026-01-01T00:00:00.000Z',
        ended_at: '2026-01-01T00:00:02.000Z',
        agent_count: 1,
        root_provider: 'codex',
      })
      expect(history[0]).not.toHaveProperty('agents')
      expect(history[0]).not.toHaveProperty('task')
    })

    it('removes runs with ended_at set even if status is running', async () => {
      const { writeRun, autoCleanupRuns } = await import('../src/core/runs.js')
      writeRun(makeRun('e2', { status: 'running', ended_at: '2026-01-01T00:00:01.000Z' }))
      const result = autoCleanupRuns({ sessionExists: () => true })
      expect(result.removed).toContain('e2')
    })

    it('keeps running runs whose tmux session is alive', async () => {
      const { writeRun, writeAgent, autoCleanupRuns } = await import('../src/core/runs.js')
      writeRun(makeRun('alive', { root_agent_id: 'root' }))
      writeAgent(makeAgent('root', 'alive', { role: 'root', headless: true, tmux_window_id: '', tmux_pane_id: '' }))
      const result = autoCleanupRuns({ sessionExists: () => true })
      expect(result.removed).not.toContain('alive')
      expect(existsSync(join(tmpDir, 'runs', 'alive'))).toBe(true)
    })

    it('keeps agent runs with no root agent when the tmux session is alive', async () => {
      const { writeRun, autoCleanupRuns } = await import('../src/core/runs.js')
      writeRun(makeRun('missing-root'))
      const result = autoCleanupRuns({ sessionExists: () => true })
      expect(result.removed).not.toContain('missing-root')
      expect(existsSync(join(tmpDir, 'runs', 'missing-root'))).toBe(true)
    })

    it('removes running runs whose tmux session is gone (stale)', async () => {
      const { writeRun, autoCleanupRuns, listRunHistory } = await import('../src/core/runs.js')
      writeRun(makeRun('stale'))
      const result = autoCleanupRuns({ sessionExists: () => false })
      expect(result.removed).toContain('stale')
      expect(existsSync(join(tmpDir, 'runs', 'stale'))).toBe(false)
      expect(listRunHistory()[0]?.status).toBe('stale')
    })

    it('removes running runs whose agent windows are gone even when the run session is alive', async () => {
      const { writeRun, writeAgent, autoCleanupRuns } = await import('../src/core/runs.js')
      writeRun(makeRun('window-stale', { root_agent_id: 'root' }))
      writeAgent(makeAgent('root', 'window-stale', { role: 'root', tmux_window_id: '@dead', tmux_pane_id: '%dead' }))

      const result = autoCleanupRuns({
        sessionExists: () => true,
        targetExists: target => target !== '@dead',
      })

      expect(result.removed).toContain('window-stale')
      expect(existsSync(join(tmpDir, 'runs', 'window-stale'))).toBe(false)
    })

    it('kills the pinned run session and its viewers before archiving a stale run', async () => {
      const { writeRun, writeAgent, autoCleanupRuns, listRunHistory } = await import('../src/core/runs.js')
      writeRun(makeRun('pinned', { root_agent_id: 'root' }))
      writeAgent(makeAgent('root', 'pinned', { role: 'root', tmux_window_id: '@dead', tmux_pane_id: '%dead' }))

      const calls: string[] = []
      const result = autoCleanupRuns({
        sessionExists: () => true,
        targetExists: () => false,
        killViewers: session => calls.push(`viewers:${session}`),
        killSession: session => calls.push(`session:${session}`),
      })

      expect(result.removed).toContain('pinned')
      expect(listRunHistory()[0]?.status).toBe('stale')
      // Viewers die before the run session so neither keeps the other's windows alive.
      expect(calls).toEqual([`viewers:${'reeves_pinned'}`, `session:${'reeves_pinned'}`])
    })

    it('does not kill sessions for ended runs (their teardown already ran)', async () => {
      const { writeRun, autoCleanupRuns } = await import('../src/core/runs.js')
      writeRun(makeRun('ended-run', { status: 'ended', ended_at: '2026-01-01T00:00:01.000Z' }))

      const calls: string[] = []
      const result = autoCleanupRuns({
        sessionExists: () => true,
        killViewers: session => calls.push(`viewers:${session}`),
        killSession: session => calls.push(`session:${session}`),
      })

      expect(result.removed).toContain('ended-run')
      expect(calls).toEqual([])
    })

    it('archives a stale run whose session is gone, still sweeping its viewers', async () => {
      const { writeRun, autoCleanupRuns } = await import('../src/core/runs.js')
      writeRun(makeRun('gone-run'))

      const calls: string[] = []
      const result = autoCleanupRuns({
        sessionExists: () => false,
        killViewers: session => calls.push(`viewers:${session}`),
        killSession: session => calls.push(`session:${session}`),
      })

      expect(result.removed).toContain('gone-run')
      // The run session is already dead, but grouped viewers can outlive it and
      // stay identifiable by group name, so the viewer sweep runs regardless.
      expect(calls).toEqual(['viewers:reeves_gone-run'])
    })

    it('escalates stubborn pane processes when archiving a stale run', async () => {
      const { writeRun, writeAgent, autoCleanupRuns } = await import('../src/core/runs.js')
      const { spawn } = await import('node:child_process')
      writeRun(makeRun('stubborn-run', { root_agent_id: 'root' }))
      // A SIGHUP/SIGTERM-ignoring CLI: only the SIGKILL escalation can end it.
      const child = spawn(process.execPath, ['-e', 'process.on("SIGTERM", () => {}); process.on("SIGHUP", () => {}); setInterval(() => {}, 1000)'])
      const exited = new Promise<string>(resolve => child.once('exit', () => resolve('exited')))
      writeAgent(makeAgent('root', 'stubborn-run', { role: 'root', tmux_window_id: '@dead', tmux_pane_id: '%dead', pane_pid: child.pid }))

      const result = autoCleanupRuns({
        sessionExists: () => true,
        targetExists: () => false,
        killViewers: () => {},
        killSession: () => {},
      })

      expect(result.removed).toContain('stubborn-run')
      const timeout = new Promise<string>(resolve => setTimeout(() => resolve('alive'), 3000))
      expect(await Promise.race([exited, timeout])).toBe('exited')
    })

    it('cleans only dead and keeps live ones in a mixed registry', async () => {
      const { writeRun, writeAgent, autoCleanupRuns } = await import('../src/core/runs.js')
      writeRun(makeRun('live', { root_agent_id: 'root' }))
      writeAgent(makeAgent('root', 'live', { role: 'root', headless: true, tmux_window_id: '', tmux_pane_id: '' }))
      writeRun(makeRun('done', { status: 'ended', ended_at: '2026-01-01T00:00:01.000Z' }))
      writeRun(makeRun('gone'))
      const result = autoCleanupRuns({ sessionExists: (s) => s === 'reeves_live' })
      expect(result.removed.sort()).toEqual(['done', 'gone'])
      expect(existsSync(join(tmpDir, 'runs', 'live'))).toBe(true)
    })

    it('skips the stale check when tmux is not available, but still cleans ended', async () => {
      const { writeRun, autoCleanupRuns } = await import('../src/core/runs.js')
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

    it('can skip stale cleanup while still archiving ended runs', async () => {
      const { writeRun, autoCleanupRuns, listRunHistory } = await import('../src/core/runs.js')
      writeRun(makeRun('stale-but-visible'))
      writeRun(makeRun('finished', { status: 'ended', ended_at: '2026-01-01T00:00:01.000Z' }))

      const result = autoCleanupRuns({ sessionExists: () => false, cleanStale: false })

      expect(result.removed).toEqual(['finished'])
      expect(existsSync(join(tmpDir, 'runs', 'stale-but-visible'))).toBe(true)
      expect(listRunHistory().map(record => record.id)).toEqual(['finished'])
    })
  })

  describe('corrupt or missing registry files', () => {
    it('readRun returns a not-found error, not a raw SyntaxError, on corrupt run.json', async () => {
      const { writeRun, readRun, runPath } = await import('../src/core/runs.js')
      writeRun(makeRun('corrupt-run'))
      writeFileSync(runPath('corrupt-run'), '{ broken', 'utf-8')
      expect(() => readRun('corrupt-run')).toThrow(/Run not found/)
    })

    it('readAgent returns a not-found error, not a raw SyntaxError, on corrupt agent json', async () => {
      const { writeRun, writeAgent, readAgent, agentPath } = await import('../src/core/runs.js')
      writeRun(makeRun('run-a'))
      writeAgent(makeAgent('agent-a', 'run-a'))
      writeFileSync(agentPath('run-a', 'agent-a'), '{ broken', 'utf-8')
      expect(() => readAgent('run-a', 'agent-a')).toThrow(/Agent not found/)
    })

    it('readAgent returns a not-found error for a missing agent file', async () => {
      const { writeRun, readAgent } = await import('../src/core/runs.js')
      writeRun(makeRun('run-b'))
      expect(() => readAgent('run-b', 'nope')).toThrow(/Agent not found/)
    })
  })
})
