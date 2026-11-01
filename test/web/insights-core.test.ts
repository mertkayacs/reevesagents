// The Insights dialog's arithmetic, tested against the real client file.
//
// `insights-core.js` is a plain script (the client has no build step), so the test loads it with a fake `window` and
// exercises the functions the dialog and the card pulse call. That is the only way to prove the pulse keeps its
// remainder across a reload without driving a browser.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(process.cwd(), 'src/surfaces/webui/client/insights-core.js'), 'utf8')

interface InsightsCore {
  formatPlanProgress: (_done: number, _total: number) => { text: string, percent: number, done: number, total: number }
  pulseRemaining: (_latestTs: string | null, _nowMs: number, _pulseMs: number, _seenAtMs?: number) => number
  filterPlanItems: (_items: unknown[], _filter: string) => { id: string, status: string, spec_path?: string | null }[]
  planWaiting: (_items: unknown[]) => { needsBrief: { id: string }[], blocked: { id: string }[], total: number }
}

function loadCore(): InsightsCore {
  const sandbox: { insightsCore?: InsightsCore } = {}
  // The file is an IIFE that assigns to `window`; a bare object stands in for it.
  new Function('window', source)(sandbox)
  if (!sandbox.insightsCore) throw new Error('insights-core.js did not publish its helpers')
  return sandbox.insightsCore
}

const core = loadCore()

describe('formatPlanProgress', () => {
  it('renders done/total and a rounded percentage', () => {
    expect(core.formatPlanProgress(1, 3)).toEqual({ text: '1/3', percent: 33, done: 1, total: 3 })
    expect(core.formatPlanProgress(23, 23)).toEqual({ text: '23/23', percent: 100, done: 23, total: 23 })
  })

  it('is safe on an empty or nonsense plan', () => {
    expect(core.formatPlanProgress(0, 0)).toMatchObject({ text: '0/0', percent: 0 })
    expect(core.formatPlanProgress(Number.NaN, 5)).toMatchObject({ text: '0/5', percent: 0 })
    expect(core.formatPlanProgress(2, -1)).toMatchObject({ text: '2/0', percent: 0 })
  })
})

describe('pulseRemaining', () => {
  const started = '2026-11-02T09:00:00.000Z'
  const startedMs = Date.parse(started)

  it('counts down from the server timestamp, not from the page load', () => {
    expect(core.pulseRemaining(started, startedMs, 5000)).toBe(5000)
    expect(core.pulseRemaining(started, startedMs + 2000, 5000)).toBe(3000)
    expect(core.pulseRemaining(started, startedMs + 6000, 5000)).toBe(0)
  })

  it('keeps the remainder across a reload, and keeps counting down while the page is open', () => {
    // A reload two seconds into the pulse continues from 3 s (measured from the event's server stamp), and the next
    // render one second later shows 2 s — the remainder must decrease with wall time, not stand still.
    expect(core.pulseRemaining(started, startedMs + 2000, 5000)).toBe(3000)
    expect(core.pulseRemaining(started, startedMs + 3000, 5000)).toBe(2000)
    expect(core.pulseRemaining(started, startedMs + 5000, 5000)).toBe(0)
  })

  it('is off when agent_pulse_ms is 0, and tolerant of a missing timestamp', () => {
    expect(core.pulseRemaining(started, startedMs, 0)).toBe(0)
    expect(core.pulseRemaining(null, startedMs, 5000)).toBe(0)
    expect(core.pulseRemaining('not a date', startedMs, 5000)).toBe(0)
  })
})

describe('plan filters', () => {
  const items = [
    { id: 'P1.1', status: 'done', spec_path: 'docs/briefs/P1.1.json', missing_since: null },
    { id: 'P1.2', status: 'queued', spec_path: 'docs/briefs/P1.2.json', missing_since: null },
    { id: 'P1.3', status: 'pending', spec_path: null, missing_since: null },
    { id: 'P1.4', status: 'blocked_owner', spec_path: 'docs/briefs/P1.4.json', missing_since: null },
    { id: 'P1.5', status: 'skipped', spec_path: null, missing_since: null },
    // Dropped from the document: it is not waiting for a brief, it is waiting for a re-import.
    { id: 'P1.6', status: 'pending', spec_path: null, missing_since: '2026-11-02T09:00:00.000Z' },
  ]

  it('splits all / open / waiting', () => {
    expect(core.filterPlanItems(items, 'all').map(item => item.id)).toEqual(['P1.1', 'P1.2', 'P1.3', 'P1.4', 'P1.5', 'P1.6'])
    // `open` keeps the missing row: it is still open work, just not in the document — the list has to show it so the
    // owner can re-import rather than wonder where it went.
    expect(core.filterPlanItems(items, 'open').map(item => item.id)).toEqual(['P1.2', 'P1.3', 'P1.4', 'P1.6'])
    // Waiting = a blocked item, or an open item with no brief. `skipped` is closed and a `missing` row is not
    // waiting for a brief at all.
    expect(core.filterPlanItems(items, 'waiting').map(item => item.id)).toEqual(['P1.3', 'P1.4'])
  })

  it('lists what the "waiting for you" block shows', () => {
    const waiting = core.planWaiting(items)
    expect(waiting.needsBrief.map(item => item.id)).toEqual(['P1.3'])
    expect(waiting.blocked.map(item => item.id)).toEqual(['P1.4'])
    expect(waiting.total).toBe(2)
  })
})
