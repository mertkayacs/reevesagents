// The plan indicator on a run card: which tone, which words, and whether it is still news.
//
// The mapping lives in core (`flowBadgeView`) so the TUI, the Web UI and the tests read one rule. Colour is presentation;
// the label carries the same information in words, which is what a reader who cannot separate amber from green needs.

import { describe, expect, it } from 'vitest'
import { createFlowState } from '../src/core/flow.js'
import type { FlowState } from '../src/core/flow.js'
import { flowBadge } from '../src/core/flow-view.js'
import { flowBadgeView } from '../src/core/flow-label.js'
import { translate } from '../src/i18n/catalog.js'

const t = (key: never, values?: Record<string, string | number>) => translate('en', key, values)

function badge(state: FlowState, plan: { done: number, total: number } | null, attention: Parameters<typeof flowBadge>[2] = null) {
  return flowBadge(state, Date.parse('2026-11-02T12:00:00.000Z'), attention, plan)
}

function state(overrides: Partial<FlowState> = {}): FlowState {
  return {
    ...createFlowState({ run_id: 'r', repo: '/tmp', roles: { dev: 'd', review: 'v' }, max_rounds: 3, at: '2026-11-02T11:00:00.000Z' }),
    ...overrides,
  }
}

const at = (s: FlowState, plan: { done: number, total: number } | null, attention: Parameters<typeof flowBadge>[2] = null, fresh = true) =>
  flowBadgeView(t as never, badge(s, plan, attention), { fresh })

describe('the plan badge', () => {
  it('shows the plan progress in amber and does not pulse', () => {
    const view = at(state({ state: 'idle' }), { done: 1, total: 3 })
    expect(view).toMatchObject({ tone: 'progress', pulse: false })
    expect(view.label).toBe('flow: plan 1/3')
  })

  it('shows a finished plan in green and pulses while it is news', () => {
    const view = at(state({ state: 'done' }), { done: 3, total: 3 })
    expect(view).toMatchObject({ tone: 'done', pulse: true })
    expect(view.label).toBe('flow: done 3/3')
    // The pulse is an expiry: the same badge a while later is static.
    expect(at(state({ state: 'done' }), { done: 3, total: 3 }, null, false).pulse).toBe(false)
  })

  it('shows attention in red for every blocker, and pulses only while fresh', () => {
    const cases = [
      ['escalated', state({ state: 'escalated' }), { reason: 'escalated' as const, item: null }],
      ['review_timeout', state({ state: 'reviewing' }), { reason: 'review_timeout' as const, item: null }],
      ['needs_brief', state({ state: 'idle' }), { reason: 'needs_brief' as const, item: 'P1.7.2' }],
      ['blocked_owner', state({ state: 'idle' }), { reason: 'blocked_owner' as const, item: 'P1.7.1' }],
    ] as const
    for (const [name, s, attention] of cases) {
      const view = at(s as FlowState, { done: 0, total: 2 }, attention as never)
      expect({ name, tone: view.tone, pulse: view.pulse }).toEqual({ name, tone: 'attention', pulse: true })
      expect(view.label).toBe('flow: needs attention')
      expect(view.detail).toBeTruthy()
      expect(at(s as FlowState, { done: 0, total: 2 }, attention as never, false).pulse).toBe(false)
    }
  })

  it('keeps a paused flow neutral and static, with its budget', () => {
    const view = at(state({ state: 'paused', rounds: 1, max_rounds: 3 }), { done: 1, total: 3 })
    expect(view.tone).toBe('paused')
    expect(view.pulse).toBe(false)
    expect(view.label).toContain('paused')
  })

  it('shows queue progress without attention and a clear warning if a queued spec is lost', () => {
    const queued = state({ specs: [{ id: 'B', title: 'Second', goal: 'g', requirements: ['r'], checks: ['c'], report: ['r'] }] })
    const progress = at(queued, null)
    expect(progress).toMatchObject({ tone: 'progress', pulse: false })
    expect(progress.label).toBe('flow: 1 specs queued')

    const lost = state({ log: [{ at: '2026-11-02T11:00:00.000Z', event: 'spec_queued', detail: 'B' }] })
    const attention = at(lost, null)
    expect(attention).toMatchObject({ tone: 'attention', pulse: true })
    expect(attention.detail).toContain('queued spec B is missing')
  })

  it('says "closed" for a flow that ended without a plan, never "done 3/3"', () => {
    const view = at(state({ state: 'done', close_reason: 'stopped by the operator' }), null)
    expect(view.tone).toBe('neutral')
    expect(view.pulse).toBe(false)
    expect(view.label).toBe('flow: closed')
  })

  it('falls back to the round budget when the flow has no plan', () => {
    const view = at(state({ state: 'reviewing', rounds: 2, max_rounds: 3 }), null)
    expect(view.tone).toBe('neutral')
    expect(view.label).toBe('flow: review (2/3)')
  })
})

describe('the work badge', () => {
  // A real view, built the way `workItems` builds it, so `current` is one of the rows.
  function view(
    rows: Array<{ id: string, status: string, holder?: { role: 'dev' | 'reviewer', agent_id: string } | null, note?: string | null }>,
    currentId: string | null,
    dispatchUnknown = false,
  ) {
    const items = rows.map(row => ({
      id: row.id,
      title: row.id,
      origin: 'spec' as const,
      status: row.status as never,
      plan_status: null,
      holder: row.holder ?? null,
      head: null,
      note: row.note ?? null,
    }))
    return { total: items.length, items, current: items.find(row => row.id === currentId) ?? null, dispatch_unknown: dispatchUnknown }
  }

  const badgeFor = (status: Parameters<typeof flowBadge>[0]['state'], workView: ReturnType<typeof view>, progress: { done: number, total: number } | null = null) =>
    flowBadgeView(t as never, flowBadge(state({ state: status }), Date.parse('2026-11-02T12:00:00.000Z'), null, progress), { fresh: true, work: workView })

  it('names the task in work and the agent that holds it', () => {
    const w = view([{ id: 'UI-143', status: 'in_work', holder: { role: 'dev', agent_id: 'dev-1' } }, { id: 'UI-144', status: 'queued' }], 'UI-143')
    const badge = badgeFor('idle', w)
    expect(badge.label).toBe('in work: UI-143')
    expect(badge.detail).toBe('dev: dev-1')
    expect(badge.tone).toBe('progress')
  })

  it('names the review, its reviewer and the plan progress as a separate segment', () => {
    const w = view([{ id: 'UI-143', status: 'reviewing', holder: { role: 'reviewer', agent_id: 'rev-1' } }], 'UI-143')
    const badge = badgeFor('reviewing', w, { done: 1, total: 3 })
    expect(badge.label).toBe('review: UI-143')
    expect(badge.detail).toBe('reviewer: rev-1')
    // The plan's arithmetic is its own segment: the label is about the task, never about the plan.
    expect(badge.plan_label).toBe('plan 1/3')
  })

  it('says a dispatch is in flight without naming an agent', () => {
    const w = view([{ id: 'UI-143', status: 'dispatching', note: 'dispatch in flight, not confirmed' }], 'UI-143')
    const badge = badgeFor('idle', w)
    expect(badge.label).toBe('dispatching: UI-143')
    expect(badge.detail).toBe('dispatch in flight, not confirmed')
  })

  it('keeps the three empty states distinct', () => {
    // Nothing in work: no current row, and no uncertainty about a dispatch.
    expect(badgeFor('idle', view([{ id: 'UI-143', status: 'done' }], null)).label).toBe('nothing in work')
    // Uncertainty: a dispatch was sent and the journal does not name the task. Not the same fact as an idle flow.
    const unknown = badgeFor('idle', view([{ id: 'UI-143', status: 'handed_over' }], null, true))
    expect(unknown.label).toBe('dispatch not confirmed — task unknown')
    expect(unknown.tone).toBe('attention')
    // Parked: the gate took the owner away, and the badge says which parked state it is.
    expect(badgeFor('paused', view([{ id: 'UI-143', status: 'in_work', note: 'flow paused: ownership unknown' }], null)).label).toBe('paused')
    expect(badgeFor('escalated', view([{ id: 'UI-143', status: 'in_work', note: 'flow escalated: ownership unknown' }], null)).label).toBe('escalated')
  })

  it('leaves a flow with no rows to the status text it always had', () => {
    const badge = badgeFor('reviewing', view([], null))
    expect(badge.label).toBe('flow: review (0/3)')
    expect(badge.plan_label).toBeNull()
    expect(badge.tone).toBe('neutral')
  })
})
