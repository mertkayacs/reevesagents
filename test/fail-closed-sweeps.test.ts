import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { RunRecord } from '../src/core/types.js'
import { writeRun, writeAgent, autoCleanupRuns, listRuns, runHasLiveTmuxTarget } from '../src/core/runs.js'
import { sweepAgents, sweepOrphanSessions } from '../src/core/reaper.js'
import { diagnosticsPath, logDiagnostic, readDiagnostics } from '../src/core/diagnostics.js'

// The failure these tests pin: a sweep that cannot read tmux used to get an empty
// collection, read it as "every window/session is gone", and archive a live fleet. Each
// sweep must now stand down on an unanswered enumeration and leave one journal line.

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeves-fail-closed-'))
  process.env.REEVES_REGISTRY = tmpDir
  process.env.REEVES_CONFIG = join(tmpDir, 'config.json')
})

afterEach(() => {
  delete process.env.REEVES_REGISTRY
  delete process.env.REEVES_CONFIG
  rmSync(tmpDir, { recursive: true, force: true })
})

function makeRun(id: string, session: string): RunRecord {
  return {
    id,
    name: `run-${id}`,
    status: 'running',
    tmux_session: session,
    reeves_session: 'reeves',
    reeves_window_id: '@0',
    reeves_pane_id: '%0',
    root_agent_id: `agent-${id}`,
    working_dir: '/tmp',
    preset_name: null,
    started_at: new Date().toISOString(),
    ended_at: null,
  }
}

function seedLiveRun(id = 'r1', session = 'reeves-live-a1b2c3d4'): void {
  const run = makeRun(id, session)
  writeRun(run)
  writeAgent({
    id: `agent-${id}`,
    run_id: id,
    nickname: `nick-${id}`,
    provider: 'hermes',
    model: '',
    role: 'root',
    working_dir: '/tmp',
    task: '',
    task_status: 'working',
    task_note: '',
    tmux_session: session,
    tmux_window_id: '@7',
    tmux_pane_id: '%7',
    rc_enabled: false,
    permissions: 'ask',
    inbox: [],
    last_seen: 0,
    started_at: new Date().toISOString(),
    ended_at: null,
  })
}

describe('sweeps stand down when tmux cannot answer', () => {
  it('reaps nothing when the window enumeration failed', () => {
    seedLiveRun()
    const killed: string[] = []
    const { reaped } = sweepAgents({
      // null = tmux could not answer, which is not the same as "no windows".
      // Deliberately no injected targetExists: that would bypass the enumeration.
      windowIds: () => null,
      driver: { tmux: (args: string[]) => { killed.push(args.join(' ')); return '' }, delay: fn => fn() },
      maxLifetimeMs: 0,
    })
    expect(reaped).toEqual([])
    expect(killed).toEqual([])
    expect(listRuns()).toHaveLength(1)
  })

  it('reaps a window-gone agent when the enumeration answered and the fresh probe agreed', () => {
    seedLiveRun()
    const { reaped } = sweepAgents({
      windowIds: () => new Set<string>(),
      targetExists: () => false,
      driver: { tmux: () => '', delay: fn => fn() },
      maxLifetimeMs: 0,
    })
    expect(reaped.map(item => item.reason)).toEqual(['window-gone'])
  })

  it('kills no session when the session enumeration failed', () => {
    seedLiveRun()
    const { killed } = sweepOrphanSessions({ listSessions: () => null, killSession: () => { throw new Error('must not kill') } })
    expect(killed).toEqual([])
  })

  it('archives nothing when the run cleanup enumeration failed', () => {
    seedLiveRun()
    const { removed, archived } = autoCleanupRuns({
      windowIds: () => null,
      sessions: () => null,
      killSession: () => { throw new Error('must not kill') },
      killViewers: () => { throw new Error('must not kill') },
    })
    expect(removed).toEqual([])
    expect(archived).toEqual([])
    expect(listRuns()).toHaveLength(1)
  })

  it('still archives a run whose windows are confirmed gone', () => {
    seedLiveRun()
    const { archived } = autoCleanupRuns({
      windowIds: () => new Set<string>(),
      sessions: () => [{ name: 'reeves-live-a1b2c3d4' }],
      targetExists: () => false,
      sessionExists: () => true,
      killSession: () => {},
      killViewers: () => {},
    })
    expect(archived).toHaveLength(1)
  })
})

describe('an unanswered probe never counts as a dead target', () => {
  it('treats unknown as alive', () => {
    seedLiveRun()
    const run = listRuns()[0]
    expect(runHasLiveTmuxTarget(run, { targetExists: () => null })).toBe(true)
    expect(runHasLiveTmuxTarget(run, { targetExists: () => false })).toBe(false)
  })
})

describe('diagnostics journal', () => {
  it('records skipped sweeps with a reason', () => {
    seedLiveRun()
    sweepAgents({ windowIds: () => null, maxLifetimeMs: 0 })
    sweepOrphanSessions({ listSessions: () => null })
    autoCleanupRuns({ windowIds: () => null, sessions: () => null })

    const raw = readFileSync(diagnosticsPath(), 'utf8').trim().split('\n')
    const events = raw.map(line => line.split('\t')[2])
    expect(events).toEqual(['sweep-agents-skipped', 'orphan-sweep-skipped', 'run-cleanup-skipped'])
    expect(raw[0]).toContain('tmux-enumeration-failed')
    expect(raw[0]).toContain(`pid=${process.pid}`)
  })

  it('records archived runs so a vanished fleet is explainable', () => {
    seedLiveRun()
    autoCleanupRuns({
      windowIds: () => new Set<string>(),
      sessions: () => [{ name: 'reeves-live-a1b2c3d4' }],
      targetExists: () => false,
      sessionExists: () => true,
      killSession: () => {},
      killViewers: () => {},
    })
    const entries = readDiagnostics()
    const archived = entries.find(entry => entry.event === 'run-archived')
    expect(archived?.detail).toContain('"reason":"stale"')
    expect(entries.some(entry => entry.event === 'run-archived')).toBe(true)
  })

  it('does not throw when the journal cannot be written', () => {
    process.env.REEVES_REGISTRY = '/proc/definitely-not-writable'
    expect(() => logDiagnostic('probe', { a: 1 })).not.toThrow()
  })
})
