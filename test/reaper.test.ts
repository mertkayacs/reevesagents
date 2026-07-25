import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { AgentRecord, RunRecord } from '../src/core/types.js'
import type { RuntimeDriver } from '../src/core/runtime.js'
import { writeRun, writeAgent, listAgents } from '../src/core/runs.js'
import { sweepAgents, sweepAgentsThrottled, resetSweepThrottle } from '../src/core/reaper.js'

let tmpDir: string
let savedTmux: string | undefined

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeves-reaper-test-'))
  process.env.REEVES_REGISTRY = tmpDir
  process.env.REEVES_CONFIG = join(tmpDir, 'config.json')
  savedTmux = process.env.TMUX
  delete process.env.TMUX
  resetSweepThrottle()
})

afterEach(() => {
  delete process.env.REEVES_REGISTRY
  delete process.env.REEVES_CONFIG
  if (savedTmux === undefined) delete process.env.TMUX
  else process.env.TMUX = savedTmux
  rmSync(tmpDir, { recursive: true, force: true })
})

// A driver that never touches real tmux, so killAgent's kill-window/kill-session
// calls are no-ops in the test.
const noopDriver: RuntimeDriver = { tmux: () => '', delay: fn => fn() }

const HOUR = 3_600_000

function makeRun(id: string): RunRecord {
  return {
    id,
    name: `run-${id}`,
    status: 'running',
    tmux_session: `reeves-${id}`,
    reeves_session: 'reeves',
    reeves_window_id: '@0',
    reeves_pane_id: '%0',
    root_agent_id: '',
    working_dir: '/tmp',
    preset_name: null,
    started_at: new Date().toISOString(),
    ended_at: null,
  }
}

function makeAgent(runId: string, id: string, overrides: Partial<AgentRecord> = {}): AgentRecord {
  return {
    id,
    run_id: runId,
    nickname: id,
    provider: 'cc',
    model: '',
    role: 'worker',
    working_dir: '/tmp',
    task: '',
    task_status: 'working',
    task_note: '',
    tmux_session: `reeves-${runId}`,
    tmux_window_id: `@${id}`,
    tmux_pane_id: `%${id}`,
    rc_enabled: false,
    permissions: 'ask',
    inbox: [],
    last_seen: Date.now(),
    started_at: new Date().toISOString(),
    ended_at: null,
    ...overrides,
  }
}

describe('zombie-agent reaper', () => {
  it('reaps an agent whose tmux window is gone but leaves a live-window sibling', () => {
    writeRun(makeRun('r1'))
    writeAgent(makeAgent('r1', 'live', { tmux_window_id: '@alive' }))
    writeAgent(makeAgent('r1', 'dead', { tmux_window_id: '@dead' }))

    const { reaped } = sweepAgents({
      driver: noopDriver,
      targetExists: id => id === '@alive',
      maxLifetimeMs: 0,
    })

    expect(reaped).toHaveLength(1)
    expect(reaped[0]).toMatchObject({ agent_id: 'dead', run_id: 'r1', reason: 'window-gone' })

    const agents = listAgents('r1')
    expect(agents.find(a => a.id === 'live')!.ended_at).toBeNull()
    expect(agents.find(a => a.id === 'dead')!.ended_at).not.toBeNull()
  })

  it('reaps an agent older than max_lifetime_ms and spares a younger one', () => {
    const now = 10 * HOUR
    writeRun(makeRun('r1'))
    // window is alive for both, so only lifetime decides
    writeAgent(makeAgent('r1', 'old', { started_at: new Date(now - 3 * HOUR).toISOString() }))
    writeAgent(makeAgent('r1', 'young', { started_at: new Date(now - 5 * 60_000).toISOString() }))

    const { reaped } = sweepAgents({
      driver: noopDriver,
      targetExists: () => true,
      now: () => now,
      maxLifetimeMs: HOUR,
    })

    expect(reaped).toHaveLength(1)
    expect(reaped[0]).toMatchObject({ agent_id: 'old', reason: 'lifetime-exceeded' })
    expect(reaped[0]!.age_ms).toBe(3 * HOUR)
    expect(listAgents('r1').find(a => a.id === 'young')!.ended_at).toBeNull()
  })

  it('does not reap a healthy agent when lifetime is disabled', () => {
    writeRun(makeRun('r1'))
    writeAgent(makeAgent('r1', 'ok', { tmux_window_id: '@ok' }))

    const { reaped } = sweepAgents({
      driver: noopDriver,
      targetExists: () => true,
      maxLifetimeMs: 0,
    })

    expect(reaped).toHaveLength(0)
    expect(listAgents('r1')[0]!.ended_at).toBeNull()
  })

  it('skips headless agents and already-ended agents', () => {
    writeRun(makeRun('r1'))
    writeAgent(makeAgent('r1', 'head', { headless: true, tmux_window_id: '' }))
    writeAgent(makeAgent('r1', 'done', { ended_at: new Date().toISOString(), tmux_window_id: '@gone' }))

    const { reaped } = sweepAgents({ driver: noopDriver, targetExists: () => false })
    expect(reaped).toHaveLength(0)
  })

  it('reaps nothing when tmux is unavailable', () => {
    writeRun(makeRun('r1'))
    writeAgent(makeAgent('r1', 'dead', { tmux_window_id: '@dead' }))

    const { reaped } = sweepAgents({ tmuxAvailable: () => false, maxLifetimeMs: HOUR })
    expect(reaped).toHaveLength(0)
    expect(listAgents('r1')[0]!.ended_at).toBeNull()
  })

  it('throttles repeat sweeps within the interval', () => {
    resetSweepThrottle()
    const opts = { driver: noopDriver, targetExists: () => true, maxLifetimeMs: 0 }

    const a = sweepAgentsThrottled(15_000, { ...opts, now: () => 1_000 })
    expect(a.swept).toBe(true)
    const b = sweepAgentsThrottled(15_000, { ...opts, now: () => 5_000 })
    expect(b.swept).toBe(false)
    const c = sweepAgentsThrottled(15_000, { ...opts, now: () => 20_000 })
    expect(c.swept).toBe(true)
  })
})
