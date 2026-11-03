// @vitest-environment happy-dom
//
// The plan dialog's driver line, and the question "did this frame change anything but the clock?".
//
// The defect (block 71): the frame carried `age_s`/`next_in_s`, which change on their own, so `payload === last` never
// matched, every SSE frame was sent, and the client rebuilt the whole sidebar every 1.5 s. The line is now computed from
// absolute marks with the browser's clock, and a frame whose state is unchanged only refreshes that one line.

import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { translate } from '../../src/i18n/catalog.js'
import type { TranslationKey } from '../../src/i18n/catalog.js'

interface TickPayload {
  driver: string
  at: string
  next_at?: number
  active?: boolean
  advanced: number
  held: number
  skipped: number
}

interface TickLine {
  ageSeconds: (_tick: TickPayload | null, _now: number) => number
  nextInSeconds: (_tick: TickPayload | null, _now: number) => number | null
  lineText: (_tick: TickPayload | null, _now: number, _t: (_key: string, _values?: Record<string, unknown>) => string) => string
  tone: (_tick: TickPayload | null) => string
  frameKey: (_data: Record<string, unknown>) => string
}

let tickLine: TickLine
const NOW = Date.parse('2026-11-03T12:00:00.000Z')

// The real client file, loaded the way the browser loads it: a plain script that publishes itself on `window`.
function loadTickLine(): TickLine {
  const source = readFileSync(join(process.cwd(), 'src/surfaces/webui/client/tick-line.js'), 'utf8')
  const sandbox: { tickLine?: TickLine } = {}
  new Function('window', `${source}; return window.tickLine`)(sandbox)
  return sandbox.tickLine!
}

// The real English catalog: a test that invented its own strings would pass while the panel said nothing useful.
function en(key: string, values: Record<string, unknown> = {}): string {
  return translate('en', key as TranslationKey, values as Record<string, string | number>)
}

function tick(overrides: Partial<TickPayload> = {}): TickPayload {
  return {
    driver: 'systemd:reeves-flow-tick.timer',
    at: new Date(NOW - 12_000).toISOString(),
    advanced: 1,
    held: 0,
    skipped: 0,
    ...overrides,
  }
}

beforeEach(() => {
  tickLine = loadTickLine()
})

describe('the driver line is computed from marks, not from a countdown', () => {
  it('reads the age and the countdown off `at` and `next_at` with the local clock', () => {
    const payload = tick({ next_at: NOW + 7_000 })

    expect(tickLine.ageSeconds(payload, NOW)).toBe(12)
    expect(tickLine.nextInSeconds(payload, NOW)).toBe(7)
    expect(tickLine.lineText(payload, NOW, en)).toBe('ticks: systemd:reeves-flow-tick.timer · last 12s ago · next 7s')
  })

  it('says it is waiting instead of counting backwards past the deadline', () => {
    const overdue = tick({ next_at: NOW - 30_000 })

    expect(tickLine.nextInSeconds(overdue, NOW)).toBe(0)
    expect(tickLine.lineText(overdue, NOW, en)).toBe('ticks: systemd:reeves-flow-tick.timer · last 12s ago · waiting for a tick')
  })

  it('drops the countdown when the machine reports no deadline, and the line when there is no receipt', () => {
    expect(tickLine.lineText(tick(), NOW, en)).toBe('ticks: systemd:reeves-flow-tick.timer · last 12s ago')
    expect(tickLine.lineText(null, NOW, en)).toBe('ticks: none — no driver')
  })

  it('rebuilds the same line after a reconnect: nothing is remembered but the marks', () => {
    // A tab that was disconnected for a minute comes back to the marks it already had (or to fresh ones) — the age is
    // recomputed, never carried forward as "12s ago" from the last time the line was drawn (block 71, edge case 4).
    const payload = tick({ next_at: NOW + 30_000 })

    expect(tickLine.lineText(payload, NOW, en)).toContain('last 12s ago')
    expect(tickLine.lineText(payload, NOW + 60_000, en)).toContain('last 72s ago')
    expect(tickLine.lineText(payload, NOW + 60_000, en)).toContain('waiting for a tick')
  })

  it('takes the attention tone for a missing or stopped driver', () => {
    expect(tickLine.tone(null)).toBe('attention')
    expect(tickLine.tone(tick({ active: false }))).toBe('attention')
    expect(tickLine.tone(tick({ active: true }))).toBe('neutral')
  })
})

describe('a frame whose state did not change is not an event', () => {
  const state = {
    runs: [{ id: 'run-1', status: 'running' }],
    history: [],
    approvals: [],
    notifications: { latest_seq: 3, read_seq: 1, unread: 2, unread_by: [] },
    providers: [{ id: 'codex' }],
    version: '2.1.0',
    language: 'en',
    web_theme: 'dark',
    agent_pulse_ms: 5000,
  }

  it('ignores the driver line entirely', () => {
    const a = tickLine.frameKey({ ...state, tick: tick({ at: new Date(NOW).toISOString() }) })
    const b = tickLine.frameKey({ ...state, tick: tick({ at: new Date(NOW + 60_000).toISOString(), held: 4 }) })

    expect(b).toBe(a)
  })

  it('changes when any of the state does', () => {
    const base = tickLine.frameKey(state)

    expect(tickLine.frameKey({ ...state, runs: [] })).not.toBe(base)
    expect(tickLine.frameKey({ ...state, notifications: { ...state.notifications, unread: 3 } })).not.toBe(base)
    expect(tickLine.frameKey({ ...state, approvals: [{ id: 'a1' }] })).not.toBe(base)
  })
})
