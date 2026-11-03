// The TUI Flow section: one plain line set per state, so the renderer carries no logic and the text can be asserted.
//
// The rule from the block: the section shows what the flow is doing *and* what it waits for, without turning a plan
// blocker into a state change — attention stays a view value.

import { describe, expect, it } from 'vitest'
import { createFlowState } from '../src/core/flow.js'
import type { FlowState } from '../src/core/flow.js'
import { flowSectionLines } from '../src/core/flow-view.js'
import type { TickStatus } from '../src/core/tick-status.js'

const NOW = Date.parse('2026-11-02T09:00:00.000Z')
const AT = new Date(NOW).toISOString()

// The driver's receipt, as `readTickStatus()` returns it: the panel prints the last real pass and nothing else.
function tick(overrides: Partial<TickStatus> = {}): TickStatus {
  return {
    at: new Date(NOW - 12_000).toISOString(), mode: 'all', driver: 'systemd:reeves-flow-tick.timer',
    pid: 4242, advanced: 1, held: 0, skipped: 0, ...overrides,
  }
}

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
      expect(flowSectionLines(state(overrides), { now: NOW, tick: tick() })[0]).toBe(expected)
    }
  })

  it('names the item in flight, the queue and the waiting item', () => {
    const lines = flowSectionLines(state({ state: 'reviewing', active_plan_item: 'P1.2' }), {
      now: NOW,
      tick: tick(),
      active_plan_item: 'P1.2',
      queue_depth: 2,
      plan: { reason: 'needs_brief', item: 'P1.3' },
    })
    expect(lines).toContain('item     P1.2')
    expect(lines).toContain('queue    2 pending')
    expect(lines).toContain('waiting  P1.3 (needs a brief)')
    expect(lines).toContain('attention waiting for you')
  })

  it('says who drives the flow, from the driver\'s own receipt (block 68)', () => {
    const driven = flowSectionLines(state(), { now: NOW, tick: tick() })
    expect(driven.at(-1)).toBe('tick     last 12s ago · driver systemd:reeves-flow-tick.timer')

    // No receipt is a fact too, and the line says it plainly — it never mentions a setting, because the setting that
    // could say "off" while a timer ran every minute is gone.
    const none = flowSectionLines(state(), { now: NOW, tick: null })
    expect(none.at(-1)).toBe('tick     none recorded — `flow tick --all` or install reeves-flow-tick.timer')
    expect(flowSectionLines(state(), { now: NOW }).at(-1)).toBe(none.at(-1))
    for (const line of [...driven, ...none]) expect(line).not.toContain('flow_tick_ms')
  })

  it('points at the approvals screen when the flow escalated', () => {
    const lines = flowSectionLines(state({ state: 'escalated', rounds: 3 }), { now: NOW, tick: tick() })
    expect(lines).toContain('attention rounds spent — approve or deny in Approvals')
  })

  it('keeps every line inside 78 columns for the narrow terminal', () => {
    const lines = flowSectionLines(state({ state: 'escalated', active_plan_item: `P${'9'.repeat(90)}` }), {
      now: NOW,
      tick: tick(),
      active_plan_item: `P${'9'.repeat(90)}`,
      plan: { reason: 'blocked_owner', item: `P${'9'.repeat(90)}` },
    })
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(78)
    }
  })
})
