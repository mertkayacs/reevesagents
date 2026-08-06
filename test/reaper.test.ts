import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { AgentRecord, RunRecord } from '../src/core/types.js'
import type { RuntimeDriver } from '../src/core/runtime.js'
import { writeRun, writeAgent, listAgents } from '../src/core/runs.js'
import {
  sweepAgents,
  sweepAgentsThrottled,
  sweepOrphanSessions,
  resetSweepThrottle,
} from '../src/core/reaper.js'
import type { TmuxSessionInfo } from '../src/core/tmux.js'

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

  it('reaps a stale id as window-gone even when the same id is live in another session', () => {
    writeRun(makeRun('r1'))
    writeAgent(makeAgent('r1', 'stale', { tmux_window_id: '@3' }))

    // After a tmux server restart "@3" can belong to an unrelated session. The
    // probe must judge the (id, session) pair, never the id alone, or the zombie
    // reads as alive and a later kill hits the stranger's window.
    const probed: Array<[string, string]> = []
    const { reaped } = sweepAgents({
      driver: noopDriver,
      targetExists: (id, session) => {
        probed.push([id, session])
        return id === '@3' && session === 'reeves-other'
      },
      maxLifetimeMs: 0,
    })

    expect(probed).toContainEqual(['@3', 'reeves-r1'])
    expect(reaped).toHaveLength(1)
    expect(reaped[0]).toMatchObject({ agent_id: 'stale', reason: 'window-gone' })
    // Reaping the run's only agent tears the run down and archives it.
    expect(listAgents('r1')).toHaveLength(0)
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

describe('orphan session sweep', () => {
  function session(name: string, overrides: Partial<TmuxSessionInfo> = {}): TmuxSessionInfo {
    // createdSec 0 reads as "unknown age", which is always old enough to reap.
    return { name, attached: false, group: '', groupList: [], createdSec: 0, ...overrides }
  }

  function runSweep(sessions: TmuxSessionInfo[], extra: { sessionAttached?: (_name: string) => boolean; now?: () => number } = {}): { killed: string[]; calls: string[] } {
    const calls: string[] = []
    const { killed } = sweepOrphanSessions({
      listSessions: () => sessions,
      killSession: name => calls.push(name),
      sessionAttached: () => false,
      ...extra,
    })
    return { killed, calls }
  }

  it('kills a run session no live record owns', () => {
    const { killed, calls } = runSweep([session('reeves-crashed-a1b2c3d4')])
    expect(killed).toEqual(['reeves-crashed-a1b2c3d4'])
    expect(calls).toEqual(['reeves-crashed-a1b2c3d4'])
  })

  it('spares a run session with a live record', () => {
    writeRun(makeRun('r1'))
    // makeRun's tmux_session does not match the run-session pattern, so use a
    // record whose session name does.
    const run = makeRun('r2')
    run.tmux_session = 'reeves-live-b2c3d4e5'
    writeRun(run)

    const { killed } = runSweep([
      session('reeves-live-b2c3d4e5'),
      session('reeves-crashed-a1b2c3d4'),
    ])
    expect(killed).toEqual(['reeves-crashed-a1b2c3d4'])
  })

  it('spares sessions a human is attached to', () => {
    const { killed } = runSweep([session('reeves-watched-a1b2c3d4', { attached: true })])
    expect(killed).toEqual([])
  })

  it('kills a viewer whose group holds no live run session, spares a backed one', () => {
    const run = makeRun('r3')
    run.tmux_session = 'reeves-backed-c3d4e5f6'
    writeRun(run)

    const { killed } = runSweep([
      session('reevesweb_11111111', { group: 'reeves-backed-c3d4e5f6', groupList: ['reeves-backed-c3d4e5f6', 'reevesweb_11111111'] }),
      session('reevesweb_22222222', { group: 'reeves-gone-d4e5f6a1', groupList: ['reeves-gone-d4e5f6a1', 'reevesweb_22222222'] }),
      session('reevesweb_33333333'),
    ])
    expect(killed).toEqual(['reevesweb_22222222', 'reevesweb_33333333'])
  })

  it('ignores sessions outside the reeves naming patterns', () => {
    const { killed } = runSweep([
      session('reeves'),
      session('reeves-not-a-run-id'),
      session('other-session'),
    ])
    expect(killed).toEqual([])
  })

  it('kills nothing when tmux is unavailable', () => {
    const { killed } = sweepOrphanSessions({ tmuxAvailable: () => false })
    expect(killed).toEqual([])
  })

  it('spares sessions younger than the orphan grace period (a run still starting)', () => {
    const nowMs = 1_000_000_000_000
    const justBorn = Math.floor(nowMs / 1000) - 5
    const { killed } = runSweep(
      [session('reeves-starting-a1b2c3d4', { createdSec: justBorn }), session('reeves-old-b2c3d4e5', { createdSec: justBorn - 3600 })],
      { now: () => nowMs },
    )
    expect(killed).toEqual(['reeves-old-b2c3d4e5'])
  })

  it('re-probes attached state right before killing', () => {
    // Enumeration said unattached, but a human attached before the kill landed.
    const { killed, calls } = runSweep([session('reeves-grabbed-a1b2c3d4')], { sessionAttached: () => true })
    expect(killed).toEqual([])
    expect(calls).toEqual([])
  })
})
