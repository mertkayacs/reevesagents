// The TUI Flow section: one plain line set per state, so the renderer carries no logic and the text can be asserted.
//
// The rule from the block: the section shows what the flow is doing *and* what it waits for, without turning a plan
// blocker into a state change — attention stays a view value.

import { describe, expect, it } from 'vitest'
import { createFlowState } from '../src/core/flow.js'
import type { FlowState } from '../src/core/flow.js'
import { flowSectionLines } from '../src/core/flow-view.js'

const NOW = Date.parse('2026-11-02T09:00:00.000Z')
const AT = new Date(NOW).toISOString()

function state(overrides: Partial<FlowState> = {}): FlowState {
  return {
    ...createFlowState({ run_id: 'run-1', repo: '/repo', roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 3, max_total_rounds: 8, at: AT }),
    updated_at: new Date(NOW).toISOString(),
    ...overrides,
  }
}

describe('the flow section', () => {
  it('renders every state with its round budget', () => {
    const cases: [Partial<FlowState>, string][] = [
      [{ state: 'idle' }, 'state    idle · round 0/3'],
      [{ state: 'reviewing', rounds: 1, review_started_at: NOW }, 'state    reviewing · round 1/3'],
      [{ state: 'fixing', rounds: 2 }, 'state    fixing · round 2/3'],
      [{ state: 'escalated', rounds: 3 }, 'state    escalated · round 3'],
      [{ state: 'done' }, 'state    done · round 0'],
    ]
    for (const [overrides, expected] of cases) {
      expect(flowSectionLines(state(overrides), { now: NOW, tickMs: 60_000 })[0]).toBe(expected)
    }
  })

  it('names the item in flight, the queue and the waiting item', () => {
    const lines = flowSectionLines(state({ state: 'reviewing', active_plan_item: 'P1.2' }), {
      now: NOW,
      tickMs: 60_000,
      active_plan_item: 'P1.2',
      queue_depth: 2,
      plan: { reason: 'needs_brief', item: 'P1.3' },
    })
    expect(lines).toContain('item     P1.2')
    expect(lines).toContain('queue    2 pending')
    expect(lines).toContain('waiting  P1.3 (needs a brief)')
    expect(lines).toContain('attention waiting for you')
  })

  it('says where the next move comes from: the ticker, or a manual tick when it is off', () => {
    const auto = flowSectionLines(state(), { now: NOW, tickMs: 60_000 })
    expect(auto.at(-1)).toBe('tick     auto every 60s · next in 60s')
    const off = flowSectionLines(state(), { now: NOW, tickMs: 0 })
    expect(off.at(-1)).toBe('tick     off (flow_tick_ms 0) — run `flow tick`')
  })

  it('points at the approvals screen when the flow escalated', () => {
    const lines = flowSectionLines(state({ state: 'escalated', rounds: 3 }), { now: NOW, tickMs: 60_000 })
    expect(lines).toContain('attention rounds spent — approve or deny in Approvals')
  })

  it('keeps every line inside 78 columns for the narrow terminal', () => {
    const lines = flowSectionLines(state({ state: 'escalated', active_plan_item: `P${'9'.repeat(90)}` }), {
      now: NOW,
      tickMs: 60_000,
      active_plan_item: `P${'9'.repeat(90)}`,
      plan: { reason: 'blocked_owner', item: `P${'9'.repeat(90)}` },
    })
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(78)
    }
  })
})
