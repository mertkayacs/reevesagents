// The driver's receipt and the one systemd reading the panel needs: when the timer runs next.
//
// Block 68's first round took `NextElapseUSecRealtime` for a number, but `systemctl show` prints a *timestamp* property
// as human text (`Tue 2026-11-03 13:16:47 CET`), so `Number(...)` was NaN and the panel lost `next`. The formats below
// are the ones the binary on this machine actually produces, copied from `systemctl --user show` and from
// `systemctl show … -p NextElapseUSecMonotonic` (a monotonic timer has no realtime elapse at all).

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  monotonicSeconds,
  parseSystemdTimestamp,
  parseSystemdTimespan,
  readTickStatus,
  systemdTimerState,
  tickDriver,
  tickStateText,
  tickStatusPath,
  writeTickStatus,
} from '../src/core/tick-status.js'

const NOW = Date.parse('2026-11-03T13:00:00.000Z')
const AT = new Date(NOW).toISOString()

let root: string
let savedRegistry: string | undefined

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'reeves-tick-status-'))
  savedRegistry = process.env.REEVES_REGISTRY
  process.env.REEVES_REGISTRY = root
})

afterEach(() => {
  if (savedRegistry === undefined) delete process.env.REEVES_REGISTRY
  else process.env.REEVES_REGISTRY = savedRegistry
  rmSync(root, { recursive: true, force: true })
})

describe('the driver receipt', () => {
  it('round-trips through the file the surfaces read', () => {
    writeTickStatus('all', { advanced: 2, held: 1, skipped: 3 }, { at: AT, pid: 4242, driver: 'cron:reeves-flow-tick' })
    expect(readTickStatus()).toMatchObject({
      at: AT, mode: 'all', driver: 'cron:reeves-flow-tick', pid: 4242, advanced: 2, held: 1, skipped: 3,
    })
    expect(tickStatusPath()).toBe(join(root, 'tick-status.json'))
  })

  it('reads a damaged receipt as none, and names nobody as `external`', () => {
    writeFileSync(tickStatusPath(), '{"at": ', 'utf-8')
    expect(readTickStatus()).toBeNull()
    expect(tickDriver({})).toBe('external')
    expect(tickDriver({ REEVES_TICK_DRIVER: '  systemd:reeves-flow-tick.timer ' })).toBe('systemd:reeves-flow-tick.timer')
  })

  it('renders the one line every surface prints', () => {
    const status = {
      at: new Date(NOW - 12_000).toISOString(), mode: 'all' as const, driver: 'external',
      pid: 1, advanced: 0, held: 0, skipped: 0,
    }
    expect(tickStateText(status, NOW)).toBe('last 12s ago · driver external')
    expect(tickStateText(null, NOW)).toBe('none recorded — `flow tick --all` or install reeves-flow-tick.timer')
  })
})

describe('a systemd timestamp is parsed, not coerced', () => {
  it('reads the machine form (microseconds since the epoch)', () => {
    // `NextElapseUSecRealtime=1793708265997040`, as `systemctl --timestamp=us` prints it.
    expect(parseSystemdTimestamp('1793708265997040')).toBe(1793708265997.04)
  })

  it('reads the human form `systemctl show` prints by default', () => {
    // The shape that produced NaN before: a *timestamp* property is not a number.
    expect(parseSystemdTimestamp('Tue 2026-11-03 13:16:47 UTC')).toBe(Date.UTC(2026, 10, 3, 13, 16, 47))
    expect(parseSystemdTimestamp('Tue 2026-11-03 13:16:47.250000 UTC')).toBe(Date.UTC(2026, 10, 3, 13, 16, 47, 250))
    // No zone: systemd prints the host's own local time, so that is how it is read back.
    expect(parseSystemdTimestamp('Tue 2026-11-03 13:16:47')).toBe(new Date(2026, 10, 3, 13, 16, 47).getTime())
    // `CET` here is the host zone in this log line; a named zone is read as local time, an explicit offset is applied.
    expect(parseSystemdTimestamp('Tue 2026-11-03 13:16:47 CET')).toBe(new Date(2026, 10, 3, 13, 16, 47).getTime())
    expect(parseSystemdTimestamp('Tue 2026-11-03 13:16:47 +0200')).toBe(Date.UTC(2026, 10, 3, 11, 16, 47))
  })

  it('answers null for anything it cannot read, never NaN', () => {
    for (const raw of ['', '   ', 'n/a', 'tomorrow', 'Tue', '2026-11-03']) {
      expect(parseSystemdTimestamp(raw)).toBeNull()
    }
  })
})

describe('a monotonic elapse is a duration, not a date', () => {
  it('parses the spans systemd prints', () => {
    // Copied from this host: `NextElapseUSecMonotonic=3d 22h 10min 44.544443s`.
    expect(parseSystemdTimespan('3d 22h 10min 44.544443s')).toBeCloseTo(339_044.544443, 5)
    expect(parseSystemdTimespan('4d 16min 10.781878s')).toBeCloseTo(346_570.781878, 5)
    expect(parseSystemdTimespan('45s')).toBe(45)
    expect(parseSystemdTimespan('1h 30min')).toBe(5_400)
    expect(parseSystemdTimespan('1month 2days 3h 4min 5s')).toBe(2_813_645)
  })

  it('answers null for an empty or nonsense span', () => {
    for (const raw of ['', 'n/a', 'infinity', 'soon', '3 fortnights']) {
      expect(parseSystemdTimespan(raw)).toBeNull()
    }
  })

  it('reads the monotonic clock this host measures against', () => {
    const seconds = monotonicSeconds()
    // `/proc/uptime` exists on every host the CLI targets; if it ever does not, the probe simply has no `next` to give.
    if (seconds !== null) expect(seconds).toBeGreaterThan(0)
  })
})

describe('the systemd timer probe', () => {
  it('computes seconds until the next run from a formatted date (the reported defect)', () => {
    const run = (): string => [
      'NextElapseUSecRealtime=Tue 2026-11-03 13:00:30 UTC',
      'ActiveState=active',
    ].join('\n')

    const state = systemdTimerState({ now: NOW, run })

    expect(state).toEqual({ active: true, next_in_s: 30 })
  })

  it('computes it from microseconds when systemd answers in the machine form', () => {
    const next = NOW + 45_000
    const run = (): string => [
      `NextElapseUSecRealtime=${(next * 1000).toFixed(0)}`,
      'ActiveState=active',
    ].join('\n')

    expect(systemdTimerState({ now: NOW, run })).toEqual({ active: true, next_in_s: 45 })
  })

  it('falls back to the monotonic elapse when the timer has no realtime one', () => {
    // This machine's timer is scheduled `OnBootSec`/`OnUnitActiveSec`, so `NextElapseUSecRealtime` is empty and the
    // monotonic span is the only answer. It is measured against the monotonic clock, not against now.
    const run = (): string => [
      'NextElapseUSecRealtime=',
      'NextElapseUSecMonotonic=3d 22h 10min 44.544443s',
      'ActiveState=active',
    ].join('\n')

    const state = systemdTimerState({ now: NOW, run, monotonicNow: () => 339_000 })

    expect(state).toEqual({ active: true, next_in_s: 45 })
  })

  it('reports active without a next run when systemd has no elapse to give', () => {
    const run = (): string => ['NextElapseUSecRealtime=', 'NextElapseUSecMonotonic=', 'ActiveState=active'].join('\n')
    expect(systemdTimerState({ now: NOW, run, monotonicNow: () => 1 })).toEqual({ active: true })
  })

  it('stays silent without systemd: no exception, no invented fields', () => {
    expect(systemdTimerState({ now: NOW, run: () => { throw new Error('no systemctl here') } })).toBeNull()
    expect(systemdTimerState({ now: NOW, run: () => '' })).toBeNull()
    expect(systemdTimerState({ now: NOW, run: () => 'NextElapseUSecRealtime=Tue 2026-11-03 13:00:30 UTC' })).toBeNull()
  })

  it('never returns a negative countdown for an elapse already in the past', () => {
    const run = (): string => [
      'NextElapseUSecRealtime=Tue 2026-11-03 12:59:00 UTC',
      'ActiveState=active',
    ].join('\n')
    expect(systemdTimerState({ now: NOW, run })).toEqual({ active: true, next_in_s: 0 })
  })
})
