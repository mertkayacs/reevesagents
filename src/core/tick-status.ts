// The flow driver's own record: who last advanced the flows, and when.
//
// There is exactly one driver on purpose — an external scheduler (`reeves-flow-tick.timer`, cron) running
// `flow tick --all`. The panel used to keep a second timer of its own, which meant the automatic run of work died
// with the browser tab while a systemd timer quietly kept ticking, and every surface described a setting
// (`flow_tick_ms`) instead of the driver. Block 68 removed the panel timer and the setting: this file is what a
// real pass leaves behind, so `flow status`, the TUI flow section and `/api/state` can name the driver from a fact.
//
// Two rules:
// - only a real pass writes it. `--dry-run` asks a question and leaves nothing behind, because a receipt for a
//   pass that never happened is exactly the lie this module exists to end.
// - a receipt that cannot be written never fails the pass: the pass is the work, the file is the record of it.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { stateRoot } from './state-path.js'

export type TickMode = 'run' | 'all'

export interface TickStatus {
  // ISO, the moment the pass ran.
  at: string
  // Which entry point ran it: one flow (`flow tick --run`) or every live flow (`flow tick --all`).
  mode: TickMode
  // Who ran it. A scheduler names itself through `REEVES_TICK_DRIVER` (`systemd:reeves-flow-tick.timer`, `cron:…`);
  // a human typing the command is `external`, which is the brief's default and the truth.
  driver: string
  pid: number
  // How many flows the pass moved, held and skipped. The three numbers the pass itself already returns.
  advanced: number
  held: number
  skipped: number
}

export function tickStatusPath(root = stateRoot()): string {
  return join(root, 'tick-status.json')
}

export function tickDriver(env: Record<string, string | undefined> = process.env): string {
  const named = env.REEVES_TICK_DRIVER?.trim()
  return named ? named : 'external'
}

export interface TickCounts {
  advanced: number
  held: number
  skipped: number
}

export interface WriteTickStatusOptions {
  root?: string
  at?: string
  // Test seams: the clock and the environment a scheduler would have set.
  pid?: number
  driver?: string
}

// Write the receipt. Returns what was written, or null when the file could not be written at all — a read-only state
// directory must not turn an applied pass into a failed one.
export function writeTickStatus(mode: TickMode, counts: TickCounts, options: WriteTickStatusOptions = {}): TickStatus | null {
  const status: TickStatus = {
    at: options.at ?? new Date().toISOString(),
    mode,
    driver: options.driver ?? tickDriver(),
    pid: options.pid ?? process.pid,
    advanced: counts.advanced,
    held: counts.held,
    skipped: counts.skipped,
  }
  try {
    const path = tickStatusPath(options.root)
    mkdirSync(dirname(path), { recursive: true })
    const text = JSON.stringify(status, null, 2)
    const tmp = `${path}.tmp`
    writeFileSync(tmp, text, 'utf-8')
    try {
      renameSync(tmp, path)
    } catch {
      writeFileSync(path, text, 'utf-8')
    }
    return status
  } catch {
    return null
  }
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

// The record on disk, or null. A machine whose flows are ticked by hand has no driver to name, and a damaged file is
// read as "no receipt" rather than as an invented one.
export function readTickStatus(root = stateRoot()): TickStatus | null {
  try {
    const raw: unknown = JSON.parse(readFileSync(tickStatusPath(root), 'utf-8'))
    if (typeof raw !== 'object' || raw === null) return null
    const record = raw as Record<string, unknown>
    const at = typeof record.at === 'string' ? record.at : ''
    if (!at || Number.isNaN(Date.parse(at))) return null
    return {
      at,
      mode: record.mode === 'run' ? 'run' : 'all',
      driver: typeof record.driver === 'string' && record.driver.trim() ? record.driver.trim() : 'external',
      pid: count(record.pid),
      advanced: count(record.advanced),
      held: count(record.held),
      skipped: count(record.skipped),
    }
  } catch {
    return null
  }
}

export function tickAgeSeconds(status: TickStatus, now: number = Date.now()): number {
  const at = Date.parse(status.at)
  return Number.isNaN(at) ? 0 : Math.max(0, Math.round((now - at) / 1000))
}

// The one line every surface prints about the driver: the fact on disk, or the plain sentence that there is no fact.
// It never mentions a setting — the setting it used to mention no longer exists (block 68).
//
// The empty form is worded to fit the TUI flow section's 78-column rule with its `tick     ` label (76 columns): the
// section cuts anything longer, and a hint cut to "reeves-flow-tick.ti…" loses the one word the operator needs.
export function tickStateText(status: TickStatus | null, now: number = Date.now()): string {
  if (!status) return 'none recorded — `flow tick --all` or install reeves-flow-tick.timer'
  return `last ${tickAgeSeconds(status, now)}s ago · driver ${status.driver}`
}

export interface TimerState {
  active: boolean
  next_in_s?: number
}

export interface TimerStateOptions {
  now?: number
  // Test seams: the probe itself, and the monotonic clock (seconds since boot) a monotonic timer's elapse is measured
  // against.
  run?: (_command: string, _args: string[]) => string
  monotonicNow?: () => number | null
}

function systemctlRun(command: string, args: string[]): string {
  return String(execFileSync(command, args, {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 1500,
    windowsHide: true,
  }))
}

// `systemctl show` prints a *timestamp* property as human text — `Tue 2026-11-03 13:16:47 CET` — unless a machine
// format was asked for, so `Number(...)` on it is NaN and `next_in_s` disappeared (block 68, round 1). Both shapes are
// accepted: microseconds since the epoch (the `...USec` machine form), and the formatted date.
export function parseSystemdTimestamp(raw: string): number | null {
  const text = raw.trim()
  if (!text || text === 'n/a') return null
  // The property is named `...USecRealtime`, so a bare number is microseconds since the epoch.
  if (/^\d+$/.test(text)) {
    const micros = Number(text)
    return Number.isFinite(micros) ? micros / 1000 : null
  }
  // `Tue 2026-11-03 13:16:47 CET`, optionally with a fraction. The weekday is decoration; the zone is the host's own
  // (systemd prints local time), and UTC/GMT or an explicit offset are the cases where local time would be wrong.
  const match = /^(?:[A-Za-z]{3,9},?\s+)?(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?\s*([A-Za-z]{1,5}|[+-]\d{2}:?\d{2})?$/.exec(text)
  if (!match) return null
  const [, year, month, day, hour, minute, second, fraction, zone] = match
  const millis = fraction ? Number(fraction.padEnd(3, '0').slice(0, 3)) : 0
  const parts = [Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second), millis] as const
  let stamp: number
  if (zone !== undefined && /^(?:utc|gmt|ut|z)$/i.test(zone)) {
    stamp = Date.UTC(...parts)
  } else {
    const offset = zone === undefined ? null : /^([+-])(\d{2}):?(\d{2})$/.exec(zone)
    if (offset) {
      const minutes = (Number(offset[2]) * 60 + Number(offset[3])) * (offset[1] === '-' ? -1 : 1)
      stamp = Date.UTC(...parts) - minutes * 60_000
    } else {
      stamp = new Date(...parts).getTime()
    }
  }
  return Number.isNaN(stamp) ? null : stamp
}

// Unit -> seconds. systemd prints a span as `3d 22h 10min 44.544443s`, and spells the units out when they are long.
const TIMESPAN_UNITS: Record<string, number> = {
  month: 2_629_800, months: 2_629_800, mo: 2_629_800,
  week: 604_800, weeks: 604_800, w: 604_800, wk: 604_800,
  day: 86_400, days: 86_400, d: 86_400,
  hour: 3_600, hours: 3_600, hr: 3_600, h: 3_600,
  minute: 60, minutes: 60, min: 60,
  second: 1, seconds: 1, sec: 1, s: 1,
  ms: 0.001, msec: 0.001,
  us: 0.000001, usec: 0.000001, 'µs': 0.000001,
}

// `3d 22h 10min 44.544443s` — how systemd prints a *monotonic* elapse: a duration since boot, not a date. A timer
// scheduled with `OnBootSec`/`OnUnitActiveSec` (this machine's) has no realtime elapse at all, and this is the only
// field that answers, so it has to be measured against the monotonic clock.
export function parseSystemdTimespan(raw: string): number | null {
  const text = raw.trim()
  if (!text || text === 'n/a' || text === 'infinity') return null
  let total = 0
  for (const token of text.split(/\s+/)) {
    const match = /^(\d+(?:\.\d+)?)([a-zµ]+)$/i.exec(token)
    if (!match) return null
    const scale = TIMESPAN_UNITS[match[2]!.toLowerCase()]
    if (scale === undefined) return null
    total += Number(match[1]) * scale
  }
  return total
}

// Seconds since boot: the clock a monotonic elapse is measured on. `/proc/uptime` is the source the CLI can read
// without privileges; anything without it (macOS, a container without /proc) simply answers no `next`.
export function monotonicSeconds(): number | null {
  try {
    const first = readFileSync('/proc/uptime', 'utf-8').trim().split(/\s+/)[0]
    const seconds = Number(first)
    return Number.isFinite(seconds) ? seconds : null
  } catch {
    return null
  }
}

// Does the systemd user timer exist, and when is its next run? Optional by design: macOS, a container, or a machine
// that uses cron has no answer, and none of them should see an error for that — the caller simply gets no fields.
export function systemdTimerState(options: TimerStateOptions = {}): TimerState | null {
  const now = options.now ?? Date.now()
  let text: string
  try {
    text = (options.run ?? systemctlRun)('systemctl', [
      '--user', 'show', 'reeves-flow-tick.timer',
      '-p', 'ActiveState', '-p', 'NextElapseUSecRealtime', '-p', 'NextElapseUSecMonotonic',
    ])
  } catch {
    return null
  }
  const fields = new Map<string, string>()
  for (const line of text.split('\n')) {
    const index = line.indexOf('=')
    if (index <= 0) continue
    fields.set(line.slice(0, index).trim(), line.slice(index + 1).trim())
  }
  const activeState = fields.get('ActiveState')
  if (!activeState) return null
  const state: TimerState = { active: activeState === 'active' }
  // The next elapse arrives in one of three shapes (microseconds, a formatted date, or a monotonic duration); whatever
  // it is, the panel is given seconds until the next pass, never a number that came out of parsing prose as NaN.
  const realtime = parseSystemdTimestamp(fields.get('NextElapseUSecRealtime') ?? '')
  if (realtime !== null) {
    state.next_in_s = Math.max(0, Math.round((realtime - now) / 1000))
    return state
  }
  const elapse = parseSystemdTimespan(fields.get('NextElapseUSecMonotonic') ?? '')
  if (elapse !== null) {
    const current = (options.monotonicNow ?? monotonicSeconds)()
    if (current !== null) state.next_in_s = Math.max(0, Math.round(elapse - current))
  }
  return state
}
