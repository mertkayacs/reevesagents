import { describe, expect, it } from 'vitest'
import type { BlockSpec } from '../src/core/spec.js'
import type { FlowObservations, FlowState } from '../src/core/flow.js'
import {
  MAX_ROUNDS,
  REVIEW_TIMEOUT_SEC,
  applyDecisionToState,
  createFlowState,
  decisionChangesState,
  flowTick,
  parseFlowState,
} from '../src/core/flow.js'

// The engine is a pure function of (state, observations), so every claim the design makes about
// the automaton is asserted here without tmux, git or a clock.

const AT = '2026-01-01T00:00:00.000Z'
const NOW = Date.parse(AT)

function makeState(overrides: Partial<FlowState> = {}): FlowState {
  const base = createFlowState({
    run_id: 'run-1',
    repo: '/repo',
    roles: { dev: 'dev-1', review: 'rev-1' },
    head: 'aaa111',
    at: AT,
  })
  const state = { ...base, ...overrides }
  // A `reviewing` fixture is a review that was just requested; tests that are not about the timer
  // must not start from a state the engine has to stamp first.
  if (state.state === 'reviewing' && state.review_started_at === null && overrides.review_started_at === undefined) {
    state.review_started_at = NOW
  }
  return state
}

function makeObservations(overrides: Partial<FlowObservations> = {}): FlowObservations {
  return {
    now: NOW,
    head: 'aaa111',
    tree_clean: true,
    dev_pane: 'idle',
    review_pane: 'idle',
    verdict: null,
    verdict_count: 0,
    ...overrides,
  }
}

function block(id: string): BlockSpec {
  return { id, title: `Block ${id}`, goal: 'g', requirements: ['r'], checks: ['c'], report: [] }
}

describe('flowTick — idle', () => {
  it('requests a review when the dev moved HEAD, and binds the claim to that head', () => {
    const state = makeState()
    const decision = flowTick(state, makeObservations({ head: 'bbb222', verdict_count: 4 }))

    expect(decision.kind).toBe('request_review')
    expect(decision.target).toBe('review')
    expect(decision.next_state).toBe('reviewing')
    expect(decision.next_claim).toEqual({ head: 'bbb222', verdict: null, verdict_count: 4 })
    expect(decision.message).toContain('bbb222')
    expect(decisionChangesState(state, decision)).toBe(true)
  })

  it('does nothing while the head it already accounted for has not moved', () => {
    const decision = flowTick(makeState(), makeObservations())
    expect(decision.kind).toBe('none')
    expect(decision.reason).toBe('head_unchanged')
    expect(decision.message).toBeUndefined()
    expect(decisionChangesState(makeState(), decision)).toBe(false)
  })

  it('refuses to review a tree with uncommitted changes', () => {
    const decision = flowTick(makeState(), makeObservations({ head: 'bbb222', tree_clean: false }))
    expect(decision.kind).toBe('none')
    expect(decision.reason).toBe('tree_dirty')
  })

  it('holds instead of guessing when HEAD cannot be read', () => {
    const decision = flowTick(makeState(), makeObservations({ head: '' }))
    expect(decision.reason).toBe('head_unknown')
    expect(decision.message).toBeUndefined()
  })
})

describe('flowTick — a verdict belongs to the head it was requested for', () => {
  it('ignores the verdict a previous commit left on the reviewer pane', () => {
    // The review was requested when the pane already held one ACCEPT; that ACCEPT is not an
    // answer to this request, so the tick must keep waiting.
    const idle = makeState()
    const request = flowTick(idle, makeObservations({ head: 'bbb222', verdict: 'ACCEPT', verdict_count: 1 }))
    expect(request.next_claim).toEqual({ head: 'bbb222', verdict: null, verdict_count: 1 })

    const reviewing = applyDecisionToState(idle, request, AT)
    const sameVerdict = flowTick(
      reviewing,
      makeObservations({ head: 'bbb222', verdict: 'ACCEPT', verdict_count: 1 }),
    )
    expect(sameVerdict.kind).toBe('none')
    expect(sameVerdict.reason).toBe('awaiting_verdict')
    expect(sameVerdict.next_state).toBe('reviewing')

    // One more verdict in the pane is a new answer to this request.
    const fresh = flowTick(reviewing, makeObservations({ head: 'bbb222', verdict: 'ACCEPT', verdict_count: 2 }))
    expect(fresh.kind).toBe('none')
    expect(fresh.reason).toBe('flow_done')
    expect(fresh.next_state).toBe('done')
  })

  it('does not apply a fresh verdict to a head it was not written for', () => {
    // The dev committed again while the review was running: the verdict describes `bbb222`, so it
    // is not a green light for `ccc333` — the new head goes to review instead.
    const reviewing = makeState({
      state: 'reviewing',
      claim: { head: 'bbb222', verdict: null, verdict_count: 2 },
    })
    const decision = flowTick(
      reviewing,
      makeObservations({ head: 'ccc333', verdict: 'ACCEPT', verdict_count: 3 }),
    )
    expect(decision.kind).toBe('request_review')
    expect(decision.reason).toBe('head_moved')
    expect(decision.next_claim).toEqual({ head: 'ccc333', verdict: null, verdict_count: 3 })
  })

  it('re-baselines when the capture scrolled instead of reading the drop as a verdict', () => {
    const reviewing = makeState({
      state: 'reviewing',
      claim: { head: 'aaa111', verdict: null, verdict_count: 5 },
    })
    const decision = flowTick(reviewing, makeObservations({ verdict_count: 2 }))
    expect(decision.kind).toBe('none')
    expect(decision.reason).toBe('verdict_scrolled')
    expect(decision.next_claim.verdict_count).toBe(2)
  })
})

describe('flowTick — never write into a pane that is not confirmed idle', () => {
  it('holds on a busy dev pane', () => {
    const decision = flowTick(makeState(), makeObservations({ head: 'bbb222', dev_pane: 'busy' }))
    expect(decision.kind).toBe('none')
    expect(decision.reason).toBe('dev_busy')
    expect(decision.message).toBeUndefined()
  })

  it('holds on an unknown dev pane, and on an unknown reviewer pane', () => {
    const unknownDev = flowTick(makeState(), makeObservations({ head: 'bbb222', dev_pane: 'unknown' }))
    expect(unknownDev.kind).toBe('none')
    expect(unknownDev.reason).toBe('dev_pane_unknown')
    expect(unknownDev.message).toBeUndefined()

    const unknownReview = flowTick(makeState(), makeObservations({ head: 'bbb222', review_pane: 'unknown' }))
    expect(unknownReview.kind).toBe('none')
    expect(unknownReview.reason).toBe('review_pane_unknown')
    expect(unknownReview.message).toBeUndefined()
  })

  it('holds on a busy reviewer pane', () => {
    const decision = flowTick(makeState(), makeObservations({ head: 'bbb222', review_pane: 'busy' }))
    expect(decision.reason).toBe('review_busy')
    expect(decision.message).toBeUndefined()
  })

  it('does not send a fix into a busy dev pane even though the verdict is fresh', () => {
    const reviewing = makeState({
      state: 'reviewing',
      claim: { head: 'aaa111', verdict: null, verdict_count: 1 },
    })
    const decision = flowTick(
      reviewing,
      makeObservations({ dev_pane: 'busy', verdict: 'CHANGES_REQUESTED', verdict_count: 2 }),
    )
    expect(decision.kind).toBe('none')
    expect(decision.reason).toBe('dev_busy')
    expect(decision.message).toBeUndefined()
    // The verdict is not consumed, so the next free tick still dispatches it once.
    expect(decision.next_claim.verdict_count).toBe(1)
  })
})

describe('flowTick — the round budget is cumulative and terminal', () => {
  it('dispatches a fix with the reviewer remarks and counts the round', () => {
    const reviewing = makeState({
      state: 'reviewing',
      claim: { head: 'aaa111', verdict: null, verdict_count: 1 },
    })
    const decision = flowTick(
      reviewing,
      makeObservations({
        verdict: 'CHANGES_REQUESTED',
        verdict_count: 2,
        verdict_notes: 'MAJOR: null is treated as absent',
      }),
    )
    expect(decision.kind).toBe('dispatch_fix')
    expect(decision.target).toBe('dev')
    expect(decision.next_state).toBe('fixing')
    expect(decision.next_rounds).toBe(1)
    expect(decision.message).toContain('MAJOR: null is treated as absent')
    expect(decision.next_claim).toEqual({ head: 'aaa111', verdict: 'CHANGES_REQUESTED', verdict_count: 2 })
  })

  it('escalates instead of looping once MAX_ROUNDS is spent, and stays put afterwards', () => {
    const spent = makeState({
      state: 'reviewing',
      rounds: MAX_ROUNDS,
      claim: { head: 'aaa111', verdict: null, verdict_count: 1 },
    })
    const decision = flowTick(
      spent,
      makeObservations({ verdict: 'CHANGES_REQUESTED', verdict_count: 2, verdict_notes: 'BLOCKER: still broken' }),
    )
    expect(decision.kind).toBe('escalate')
    expect(decision.reason).toBe('rounds_exhausted')
    expect(decision.next_state).toBe('escalated')
    expect(decision.message).toBeUndefined()

    // An escalated flow cannot be re-ticked into another round: five passes produce no action.
    let escalated = applyDecisionToState(spent, decision, AT)
    for (let pass = 0; pass < 5; pass += 1) {
      const next = flowTick(escalated, makeObservations({ verdict: 'CHANGES_REQUESTED', verdict_count: 9 }))
      expect(next.kind).toBe('none')
      expect(next.reason).toBe('flow_closed')
      escalated = applyDecisionToState(escalated, next, AT)
    }
    expect(escalated.rounds).toBe(MAX_ROUNDS)
    expect(escalated.state).toBe('escalated')
  })

  it('keeps the budget across a new head, so a normal cycle still reaches the limit', () => {
    // Round 5 of 6: the fix is dispatched.
    let state = makeState({
      state: 'reviewing',
      rounds: 5,
      claim: { head: 'aaa111', verdict: null, verdict_count: 1 },
    })
    const fix = flowTick(state, makeObservations({ verdict: 'CHANGES_REQUESTED', verdict_count: 2 }))
    expect(fix.kind).toBe('dispatch_fix')
    state = applyDecisionToState(state, fix, AT)
    expect(state.rounds).toBe(6)

    // The dev commits; a new head goes to review without resetting the budget.
    const review = flowTick(state, makeObservations({ head: 'bbb222', verdict_count: 2 }))
    expect(review.kind).toBe('request_review')
    expect(review.next_rounds).toBe(6)
    state = applyDecisionToState(state, review, AT)

    const second = flowTick(
      state,
      makeObservations({ head: 'bbb222', verdict: 'CHANGES_REQUESTED', verdict_count: 3 }),
    )
    expect(second.kind).toBe('escalate')
    expect(second.reason).toBe('rounds_exhausted')
  })
})

describe('flowTick — accepting a block', () => {
  it('dispatches the next queued block and never the same one twice', () => {
    const reviewing = makeState({
      state: 'reviewing',
      specs: [block('block_01'), block('block_02')],
      dispatched_specs: ['block_01'],
      claim: { head: 'aaa111', verdict: null, verdict_count: 1 },
    })
    const decision = flowTick(
      reviewing,
      makeObservations({ verdict: 'ACCEPT', verdict_count: 2 }),
    )
    expect(decision.kind).toBe('dispatch_spec')
    expect(decision.spec_id).toBe('block_02')
    expect(decision.target).toBe('dev')
    expect(decision.next_state).toBe('idle')
    expect(decision.message).toContain('block_02')

    const applied = applyDecisionToState(reviewing, decision, AT)
    expect(applied.dispatched_specs).toEqual(['block_01', 'block_02'])
    // The same ACCEPT read again does not queue the block a second time.
    const again = flowTick(applied, makeObservations({ verdict: 'ACCEPT', verdict_count: 2 }))
    expect(again.kind).toBe('none')
  })

  it('closes the flow when the review accepts and no block is left', () => {
    const reviewing = makeState({
      state: 'reviewing',
      specs: [block('block_01')],
      dispatched_specs: ['block_01'],
      claim: { head: 'aaa111', verdict: null, verdict_count: 1 },
    })
    const decision = flowTick(reviewing, makeObservations({ verdict: 'ACCEPT', verdict_count: 2 }))
    expect(decision.kind).toBe('none')
    expect(decision.reason).toBe('flow_done')
    expect(decision.next_state).toBe('done')
    expect(decisionChangesState(reviewing, decision)).toBe(true)
  })
})

describe('flowTick — fixing', () => {
  it('waits for a new head', () => {
    const fixing = makeState({ state: 'fixing', claim: { head: 'aaa111', verdict: 'CHANGES_REQUESTED', verdict_count: 2 } })
    const decision = flowTick(fixing, makeObservations({ head: 'aaa111' }))
    expect(decision.reason).toBe('no_new_head')
  })

  it('requests a review for the new head once the dev is idle again', () => {
    const fixing = makeState({ state: 'fixing', rounds: 1, claim: { head: 'aaa111', verdict: 'CHANGES_REQUESTED', verdict_count: 2 } })
    const decision = flowTick(fixing, makeObservations({ head: 'bbb222', verdict_count: 2 }))
    expect(decision.kind).toBe('request_review')
    expect(decision.next_state).toBe('reviewing')
    expect(decision.next_rounds).toBe(1)
  })
})

describe('flowTick — a review without an answer is bounded by review_timeout_sec', () => {
  it('starts the review clock with the request', () => {
    const decision = flowTick(makeState(), makeObservations({ head: 'bbb222' }))
    expect(decision.kind).toBe('request_review')
    expect(decision.next_review_started_at).toBe(NOW)

    const applied = applyDecisionToState(makeState(), decision, AT)
    expect(applied.review_started_at).toBe(NOW)
    expect(applied.review_timeout_sec).toBe(REVIEW_TIMEOUT_SEC)
  })

  it('waits while the review is younger than the timeout', () => {
    const reviewing = makeState({
      state: 'reviewing',
      review_started_at: NOW - (REVIEW_TIMEOUT_SEC - 1) * 1000,
      claim: { head: 'aaa111', verdict: null, verdict_count: 1 },
    })
    const decision = flowTick(reviewing, makeObservations({ verdict_count: 1 }))
    expect(decision.kind).toBe('none')
    expect(decision.reason).toBe('awaiting_verdict')
    expect(decision.next_state).toBe('reviewing')
  })

  it('escalates once the reviewer has not answered within the timeout', () => {
    const reviewing = makeState({
      state: 'reviewing',
      review_started_at: NOW - REVIEW_TIMEOUT_SEC * 1000,
      claim: { head: 'aaa111', verdict: null, verdict_count: 1 },
    })
    const decision = flowTick(reviewing, makeObservations({ verdict_count: 1 }))

    expect(decision.kind).toBe('escalate')
    expect(decision.reason).toBe('review_timeout')
    expect(decision.next_state).toBe('escalated')
    expect(decision.next_review_started_at).toBeNull()
    // Nothing is sent for an escalation, and the flow stops being ticked.
    expect(decision.message).toBeUndefined()
    const escalated = applyDecisionToState(reviewing, decision, AT)
    expect(escalated.state).toBe('escalated')
    expect(flowTick(escalated, makeObservations({ verdict_count: 1 })).reason).toBe('flow_closed')
  })

  it('escalates an expired review even when the reviewer pane cannot be read', () => {
    // "The pane looks like nothing I know" is how a hung reviewer presents itself; without the
    // deadline first, that state would hold for ever.
    const reviewing = makeState({
      state: 'reviewing',
      review_started_at: NOW - REVIEW_TIMEOUT_SEC * 1000 - 1,
      claim: { head: 'aaa111', verdict: null, verdict_count: 1 },
    })
    expect(flowTick(reviewing, makeObservations({ review_pane: 'unknown' })).reason).toBe('review_timeout')

    // Before the deadline the same unreadable pane only holds.
    const young = makeState({ state: 'reviewing', review_started_at: NOW, claim: reviewing.claim })
    expect(flowTick(young, makeObservations({ review_pane: 'unknown' })).reason).toBe('review_pane_unknown')
  })

  it('honours a per-flow timeout instead of the default', () => {
    const brisk = makeState({
      state: 'reviewing',
      review_timeout_sec: 60,
      review_started_at: NOW - 61_000,
      claim: { head: 'aaa111', verdict: null, verdict_count: 1 },
    })
    expect(flowTick(brisk, makeObservations({ verdict_count: 1 })).reason).toBe('review_timeout')
  })

  it('stamps a review state that carries no clock, instead of waiting forever', () => {
    // A file written before the field existed (or a request that was never stamped) still gets a
    // deadline: the tick starts the clock on the first pass and writes it.
    const unstamped = makeState({
      state: 'reviewing',
      review_started_at: null,
      claim: { head: 'aaa111', verdict: null, verdict_count: 1 },
    })
    const decision = flowTick(unstamped, makeObservations({ verdict_count: 1 }))
    expect(decision.kind).toBe('none')
    expect(decision.reason).toBe('review_timer_started')
    expect(decision.next_review_started_at).toBe(NOW)

    const stamped = applyDecisionToState(unstamped, decision, AT)
    expect(stamped.review_started_at).toBe(NOW)
    expect(stamped.state).toBe('reviewing')
    // And the next pass waits on the deadline this one set.
    expect(flowTick(stamped, makeObservations({ verdict_count: 1 })).reason).toBe('awaiting_verdict')
  })

  it('keeps a per-flow timeout through a save/parse round trip', () => {
    const state = makeState({ review_timeout_sec: 120, review_started_at: NOW })
    const parsed = parseFlowState(JSON.parse(JSON.stringify(state)))
    expect(parsed.review_timeout_sec).toBe(120)
    expect(parsed.review_started_at).toBe(NOW)
  })
})

describe('state serialisation', () => {
  it('round-trips through parse and keeps the schema version', () => {
    const state = makeState({ state: 'reviewing', rounds: 2 })
    expect(parseFlowState(JSON.parse(JSON.stringify(state)))).toEqual(state)
  })

  it('refuses another schema version instead of resetting it to defaults', () => {
    const foreign = { ...JSON.parse(JSON.stringify(makeState())), schema_version: 2 }
    expect(() => parseFlowState(foreign)).toThrow(/schema_version 2/)
  })

  it('refuses a state without a run id or with unknown status', () => {
    const noRun = { ...JSON.parse(JSON.stringify(makeState())), run_id: '' }
    expect(() => parseFlowState(noRun)).toThrow(/no run_id/)
    const badState = { ...JSON.parse(JSON.stringify(makeState())), state: 'paused' }
    expect(() => parseFlowState(badState)).toThrow(/unknown state/)
  })

  it('refuses a flow that would send to itself', () => {
    expect(() => createFlowState({ run_id: 'r', repo: '/r', roles: { dev: 'a', review: 'a' } })).toThrow(/different agents/)
  })
})
