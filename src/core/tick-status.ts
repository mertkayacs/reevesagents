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
  // Test seam for the probe; the default shells out to `systemctl --user`.
  run?: (_command: string, _args: string[]) => string
}

function systemctlRun(command: string, args: string[]): string {
  return String(execFileSync(command, args, {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 1500,
    windowsHide: true,
  }))
}

// Does the systemd user timer exist, and when is its next run? Optional by design: macOS, a container, or a machine
// that uses cron has no answer, and none of them should see an error for that — the caller simply gets no fields.
export function systemdTimerState(options: TimerStateOptions = {}): TimerState | null {
  const now = options.now ?? Date.now()
  let text: string
  try {
    text = (options.run ?? systemctlRun)('systemctl', [
      '--user', 'show', 'reeves-flow-tick.timer', '-p', 'ActiveState', '-p', 'NextElapseUSecRealtime',
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
  // Microseconds since the epoch; 0 means systemd has no next elapse to report.
  const usec = Number(fields.get('NextElapseUSecRealtime') ?? '0')
  if (Number.isFinite(usec) && usec > 0) state.next_in_s = Math.max(0, Math.round((usec / 1000 - now) / 1000))
  return state
}
