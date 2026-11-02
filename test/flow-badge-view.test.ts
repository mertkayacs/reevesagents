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
