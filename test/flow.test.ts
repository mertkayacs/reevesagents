import { describe, expect, it } from 'vitest'
import type { BlockSpec } from '../src/core/spec.js'
import type { FlowObservations, FlowState } from '../src/core/flow.js'
import {
  MAX_ROUNDS,
  PENDING_TTL_SEC,
  PLAN_IN_FLIGHT_STALE_TIMEOUT_MS,
  REVIEW_TIMEOUT_SEC,
  applyDecisionToState,
  claimPendingDispatch,
  createFlowState,
  decisionChangesState,
  flowTick,
  parseFlowState,
  releaseDispatch,
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
    // A substantiated review by default: one minute of work and one recorded finding. Tests about the
    // evidence rule override this; every other test describes a normal round.
    verdict_evidence: { elapsed_ms: 60_000, notes_bytes: 240, notes_findings: 1, pane_tool_lines: 4 },
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
    expect(decision.next_claim).toEqual({ head: 'bbb222', verdict: null, verdict_count: 4, verdict_applied: false, spec_id: null })
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
    expect(request.next_claim).toEqual({ head: 'bbb222', verdict: null, verdict_count: 1, verdict_applied: false, spec_id: null })

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
      claim: { head: 'bbb222', verdict: null, verdict_count: 2, verdict_applied: false, spec_id: null },
    })
    const decision = flowTick(
      reviewing,
      makeObservations({ head: 'ccc333', verdict: 'ACCEPT', verdict_count: 3 }),
    )
    expect(decision.kind).toBe('request_review')
    expect(decision.reason).toBe('head_moved')
    expect(decision.next_claim).toEqual({ head: 'ccc333', verdict: null, verdict_count: 3, verdict_applied: false, spec_id: null })
  })

  it('re-baselines when the capture scrolled instead of reading the drop as a verdict', () => {
    const reviewing = makeState({
      state: 'reviewing',
      claim: { head: 'aaa111', verdict: null, verdict_count: 5, verdict_applied: false, spec_id: null },
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
      claim: { head: 'aaa111', verdict: null, verdict_count: 1, verdict_applied: false, spec_id: null },
    })
    const decision = flowTick(
      reviewing,
      makeObservations({ dev_pane: 'busy', verdict: 'CHANGES_REQUESTED', verdict_source: 'file', verdict_count: 2 }),
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
      claim: { head: 'aaa111', verdict: null, verdict_count: 1, verdict_applied: false, spec_id: null },
    })
    const decision = flowTick(
      reviewing,
      makeObservations({
        verdict: 'CHANGES_REQUESTED',
        verdict_source: 'file',
        verdict_count: 2,
        verdict_notes: 'MAJOR: null is treated as absent',
      }),
    )
    expect(decision.kind).toBe('dispatch_fix')
    expect(decision.target).toBe('dev')
    expect(decision.next_state).toBe('fixing')
    expect(decision.next_rounds).toBe(1)
    expect(decision.message).toContain('MAJOR: null is treated as absent')
    expect(decision.next_claim).toEqual({ head: 'aaa111', verdict: 'CHANGES_REQUESTED', verdict_count: 2, verdict_applied: false, spec_id: null })
  })

  it('escalates instead of looping once MAX_ROUNDS is spent, and stays put afterwards', () => {
    const spent = makeState({
      state: 'reviewing',
      rounds: MAX_ROUNDS,
      claim: { head: 'aaa111', verdict: null, verdict_count: 1, verdict_applied: false, spec_id: null },
    })
    const decision = flowTick(
      spent,
      makeObservations({ verdict: 'CHANGES_REQUESTED', verdict_source: 'file', verdict_count: 2, verdict_notes: 'BLOCKER: still broken' }),
    )
    expect(decision.kind).toBe('escalate')
    expect(decision.reason).toBe('rounds_exhausted')
    expect(decision.next_state).toBe('escalated')
    expect(decision.message).toBeUndefined()

    // An escalated flow cannot be re-ticked into another round: five passes produce no action.
    let escalated = applyDecisionToState(spent, decision, AT)
    for (let pass = 0; pass < 5; pass += 1) {
      const next = flowTick(escalated, makeObservations({ verdict: 'CHANGES_REQUESTED', verdict_source: 'file', verdict_count: 9 }))
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
      claim: { head: 'aaa111', verdict: null, verdict_count: 1, verdict_applied: false, spec_id: null },
    })
    const fix = flowTick(state, makeObservations({ verdict: 'CHANGES_REQUESTED', verdict_source: 'file', verdict_count: 2 }))
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
      makeObservations({ head: 'bbb222', verdict: 'CHANGES_REQUESTED', verdict_source: 'file', verdict_count: 3 }),
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
      claim: { head: 'aaa111', verdict: null, verdict_count: 1, verdict_applied: false, spec_id: null },
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
      claim: { head: 'aaa111', verdict: null, verdict_count: 1, verdict_applied: false, spec_id: null },
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
    const fixing = makeState({ state: 'fixing', claim: { head: 'aaa111', verdict: 'CHANGES_REQUESTED', verdict_count: 2, verdict_applied: false, spec_id: null } })
    const decision = flowTick(fixing, makeObservations({ head: 'aaa111' }))
    expect(decision.reason).toBe('no_new_head')
  })

  it('requests a review for the new head once the dev is idle again', () => {
    const fixing = makeState({ state: 'fixing', rounds: 1, claim: { head: 'aaa111', verdict: 'CHANGES_REQUESTED', verdict_count: 2, verdict_applied: false, spec_id: null } })
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
      claim: { head: 'aaa111', verdict: null, verdict_count: 1, verdict_applied: false, spec_id: null },
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
      claim: { head: 'aaa111', verdict: null, verdict_count: 1, verdict_applied: false, spec_id: null },
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
      claim: { head: 'aaa111', verdict: null, verdict_count: 1, verdict_applied: false, spec_id: null },
    })
    expect(flowTick(reviewing, makeObservations({ review_pane: 'unknown' })).reason).toBe('review_timeout')

    // Before the deadline the same unreadable pane only holds.
    const young = makeState({ state: 'reviewing', review_started_at: NOW, claim: reviewing.claim })
    expect(flowTick(young, makeObservations({ review_pane: 'unknown' })).reason).toBe('review_pane_unknown')
  })

  it('escalates an expired review even when HEAD cannot be read', () => {
    // The unreadable-HEAD guard used to run before the reviewing branch, so a requested review
    // could sit past its deadline for ever: the deadline is a fact about the request, not about
    // what this tick is able to observe.
    const reviewing = makeState({
      state: 'reviewing',
      review_started_at: NOW - REVIEW_TIMEOUT_SEC * 1000,
      claim: { head: 'aaa111', verdict: null, verdict_count: 1, verdict_applied: false, spec_id: null },
    })
    const decision = flowTick(reviewing, makeObservations({ head: '', verdict_count: 1 }))
    expect(decision.kind).toBe('escalate')
    expect(decision.reason).toBe('review_timeout')
    expect(decision.next_state).toBe('escalated')

    // Inside the deadline the same blind spot only holds, and idle still refuses to even start.
    const young = makeState({ state: 'reviewing', review_started_at: NOW, claim: reviewing.claim })
    expect(flowTick(young, makeObservations({ head: '', verdict_count: 1 })).reason).toBe('head_unknown')
    expect(flowTick(makeState(), makeObservations({ head: '' })).reason).toBe('head_unknown')
  })

  it('honours a per-flow timeout instead of the default', () => {
    const brisk = makeState({
      state: 'reviewing',
      review_timeout_sec: 60,
      review_started_at: NOW - 61_000,
      claim: { head: 'aaa111', verdict: null, verdict_count: 1, verdict_applied: false, spec_id: null },
    })
    expect(flowTick(brisk, makeObservations({ verdict_count: 1 })).reason).toBe('review_timeout')
  })

  it('stamps a review state that carries no clock, instead of waiting forever', () => {
    // A file written before the field existed (or a request that was never stamped) still gets a
    // deadline: the tick starts the clock on the first pass and writes it.
    const unstamped = makeState({
      state: 'reviewing',
      review_started_at: null,
      claim: { head: 'aaa111', verdict: null, verdict_count: 1, verdict_applied: false, spec_id: null },
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
    const badState = { ...JSON.parse(JSON.stringify(makeState())), state: 'dispatching' }
    expect(() => parseFlowState(badState)).toThrow(/unknown state/)
  })

  it('refuses a flow that would send to itself', () => {
    expect(() => createFlowState({ run_id: 'r', repo: '/r', roles: { dev: 'a', review: 'a' } })).toThrow(/different agents/)
  })

  it('reads a file written before the claim existed as "nothing in flight"', () => {
    // Backwards compatibility is a promise of this file format: an older flow must keep working, and
    // the only honest meaning of a missing claim is that no dispatch is in flight.
    const legacy = JSON.parse(JSON.stringify(makeState())) as Record<string, unknown>
    delete legacy.pending
    expect(parseFlowState(legacy).pending).toBeNull()
  })

  it('refuses a damaged claim instead of reading it as "nothing in flight"', () => {
    // A claim that cannot be read is the one case where "no claim" is a lie: a paste may already
    // have landed, so the file has to be looked at rather than silently unlocked.
    const damaged = { ...JSON.parse(JSON.stringify(makeState())), pending: { op_id: '', target: 'review', kind: 'request_review', at: NOW } }
    expect(() => parseFlowState(damaged)).toThrow(/pending dispatch without an op id/)
    const noClock = { ...JSON.parse(JSON.stringify(makeState())), pending: { op_id: 'op', target: 'review', kind: 'request_review' } }
    expect(() => parseFlowState(noClock)).toThrow(/pending dispatch without a clock/)
    const badRole = { ...JSON.parse(JSON.stringify(makeState())), pending: { op_id: 'op', target: 'nobody', kind: 'request_review', at: NOW } }
    expect(() => parseFlowState(badRole)).toThrow(/unknown role/)
  })
})

describe('the dispatch claim', () => {
  const claim = {
    op_id: 'op-1',
    kind: 'request_review',
    target: 'review',
    head: 'bbb222',
    spec_id: null,
    at: NOW,
  } as const

  it('holds a tick while a claim is younger than its TTL', () => {
    const state = makeState({ pending: { ...claim } })
    const decision = flowTick(state, makeObservations({ head: 'bbb222' }))

    expect(decision.kind).toBe('none')
    expect(decision.reason).toBe('dispatch_pending')
    // Nothing changes, so a 2 s tick does not rewrite the file either.
    expect(decisionChangesState(state, decision)).toBe(false)
  })

  it('escalates a claim nobody settled in time instead of sending it again', () => {
    const state = makeState({ pending: { ...claim, at: NOW - (PENDING_TTL_SEC + 1) * 1000 } })
    const decision = flowTick(state, makeObservations({ head: 'bbb222' }))

    expect(decision.kind).toBe('escalate')
    expect(decision.reason).toBe('dispatch_unresolved')
    expect(decision.message).toBeUndefined()
    expect(decision.next_state).toBe('escalated')
    // The settled transition clears the claim, so the flow is not stuck on it afterwards.
    const applied = applyDecisionToState(state, decision, AT)
    expect(applied.pending).toBeNull()
  })

  it('settles a fix claim from a newer clean commit after the claim timestamp', () => {
    const state = makeState({
      state: 'fixing',
      claim: { ...makeState().claim, verdict: 'CHANGES_REQUESTED' },
      pending: { ...claim, head: 'aaa111', kind: 'dispatch_fix', target: 'dev', at: NOW - 180_000 },
    })
    const decision = flowTick(state, makeObservations({
      head: 'ccc333', head_committed_at: NOW - 30_000, now: NOW,
    }))

    expect(decision.log_event).toBe('settled_by_observation')
    expect(decision.next_state).toBe('fixing')
    expect(decision.next_rounds).toBe(state.rounds + 1)
    expect(decision.next_claim.head).toBe('ccc333')
    expect(applyDecisionToState(state, decision, AT).pending).toBeNull()
  })

  it('releases an expired claim when an idle composer proves no paste landed', () => {
    const state = makeState({
      pending: { ...claim, head: 'aaa111', kind: 'dispatch_fix', target: 'dev', at: NOW - 180_000 },
    })
    const decision = flowTick(state, makeObservations({ pending_dispatch_delivery: 'empty' }))

    expect(decision.reason).toBe('dispatch_released_unlanded')
    expect(decision.clear_pending).toBe(true)
    expect(applyDecisionToState(state, decision, AT).pending).toBeNull()
  })

  it('re-decides an expired request when the recorded prompt still owns the composer', () => {
    const state = makeState({
      pending: { ...claim, at: NOW - 180_000 },
    })
    const decision = flowTick(state, makeObservations({ head: 'bbb222', pending_dispatch_delivery: 'ours' }))

    expect(decision.kind).toBe('request_review')
    expect(decision.head).toBe('bbb222')
    expect(decision.log_event).toBe('dispatch_retry_enter')
  })

  it('writes the claim with the identity of its own op, and clears it on settle', () => {
    const idle = makeState()
    const decision = flowTick(idle, makeObservations({ head: 'bbb222', verdict_count: 3 }))
    expect(decision.kind).toBe('request_review')

    const claimed = claimPendingDispatch(idle, decision, { op_id: 'op-42', now: NOW, at: AT })
    expect(claimed.pending).toEqual({
      op_id: 'op-42',
      kind: 'request_review',
      target: 'review',
      head: 'bbb222',
      spec_id: null,
      at: NOW,
      // The claim records the counter the *decision* was answered against — the observation's three verdicts, not the
      // state's zero: the claim is sent with the number a fresh answer has to beat (block 30).
      verdict_baseline: 3,
    })
    expect(claimed.log.at(-1)?.event).toBe('dispatch_claimed')
    // ^ `verdict_baseline` above is the decision's counter (3), not the state's (0). They differ whenever a verdict showed up
    // while the tick was deciding, and the claim has to carry the higher one: it is the number an answer must beat.
    expect(idle.claim.verdict_count).toBe(0)
    expect(decision.next_claim.verdict_count).toBe(3)
    expect(claimed.pending?.verdict_baseline).toBe(decision.next_claim.verdict_count)
    // The claim itself changes nothing the engine acts on: the status moves when it settles.
    expect(claimed.state).toBe('idle')
    expect(claimed.review_started_at).toBeNull()

    const settled = applyDecisionToState(claimed, decision, AT)
    expect(settled.pending).toBeNull()
    expect(settled.state).toBe('reviewing')
  })

  it('claims nothing for a decision that sends nothing', () => {
    const idle = makeState()
    const hold = flowTick(idle, makeObservations({ head: 'aaa111' }))
    expect(claimPendingDispatch(idle, hold, { op_id: 'op-1', now: NOW, at: AT })).toBe(idle)

    const escalation = flowTick(
      makeState({ state: 'reviewing', rounds: 6, claim: { head: 'aaa111', verdict: null, verdict_count: 1, verdict_applied: false, spec_id: null } }),
      makeObservations({ verdict: 'CHANGES_REQUESTED', verdict_source: 'file', verdict_count: 2 }),
    )
    expect(escalation.kind).toBe('escalate')
    expect(claimPendingDispatch(idle, escalation, { op_id: 'op-2', now: NOW, at: AT })).toBe(idle)
  })

  it('releases a claim that never pasted anything, keeping the status', () => {
    const state = makeState({ pending: { ...claim } })
    const released = releaseDispatch(state, 'busy', AT)

    expect(released.pending).toBeNull()
    expect(released.state).toBe('idle')
    expect(released.log.at(-1)).toMatchObject({ event: 'dispatch_refused', detail: 'busy' })
  })

  it('survives a save and parse round trip', () => {
    const state = makeState({ pending: { ...claim } })
    const parsed = parseFlowState(JSON.parse(JSON.stringify(state)))
    expect(parsed).toEqual(state)
    expect(parsed.pending).toEqual(claim)
  })
})

describe('plan in-flight rows are bound to the live claim (block 96)', () => {
  const tickItem = (id: string, status: 'reviewing' | 'done' | 'queued', head: string | null) => ({
    id, title: id, status, block_reason: null, rounds: 1, spec: block(id), spec_path: `docs/briefs/${id}.json`,
    head, notes_ref: null, missing: false,
  })
  const view = (staleStatus: 'reviewing' | 'done' | 'queued', staleHead: string | null) => ({
    items: [tickItem('T4.3.2', staleStatus, staleHead), tickItem('T4.3.3', 'done', 'aaa111')],
    max_rounds_per_item: 6,
    max_total_rounds: 24,
  })

  it('closes a stale headless row checked in the document and consumes the duplicate ACCEPT file', () => {
    const state = makeState({
      state: 'reviewing', review_started_at: NOW - 60_000, active_plan_item: 'T4.3.3',
      claim: { head: 'aaa111', verdict: null, verdict_count: 5, verdict_applied: true, spec_id: 'T4.3.3' },
    })
    const observations = makeObservations({
      head: 'aaa111', verdict: 'ACCEPT', verdict_source: 'file', notes_head: 'aaa111', notes_ref: 'notes/aaa111-r24.md',
      plan: view('reviewing', null), plan_conflicts: [{ kind: 'ticked_by_hand', item_id: 'T4.3.2' }],
    })
    const repair = flowTick(state, observations)

    expect(repair.reason).toBe('plan_item_requeued')
    expect(repair.next_plan_close).toMatchObject({ id: 'T4.3.2', head: 'aaa111' })
    expect(repair.next_answered_round).toBe('notes/aaa111-r24.md')
    const applied = applyDecisionToState(state, repair, AT)
    expect(applied.answered_round).toBe('notes/aaa111-r24.md')

    const afterRepair = { ...observations, plan: view('done', 'aaa111') }
    const second = flowTick(applied, afterRepair)
    const third = flowTick(applied, afterRepair)
    expect(second.reason).toBe('awaiting_verdict')
    expect(decisionChangesState(applied, second)).toBe(false)
    expect(third).toEqual(second)
  })

  it('returns an unchecked stale row to queued', () => {
    const state = makeState({ state: 'reviewing', active_plan_item: 'T4.3.3', claim: {
      head: 'aaa111', verdict: null, verdict_count: 5, verdict_applied: false, spec_id: 'T4.3.3',
    } })
    const decision = flowTick(state, makeObservations({ plan: view('reviewing', null) }))

    expect(decision.next_plan_status).toEqual({ id: 'T4.3.2', status: 'queued' })
    expect(decision.reason).toBe('plan_item_requeued')
  })

  it('keeps a reviewing item in flight when the live claim owns it', () => {
    const state = makeState({ state: 'reviewing', review_started_at: NOW, active_plan_item: 'T4.3.2', claim: {
      head: 'aaa111', verdict: null, verdict_count: 0, verdict_applied: false, spec_id: 'T4.3.2',
    } })
    const decision = flowTick(state, makeObservations({ plan: {
      items: [tickItem('T4.3.2', 'reviewing', 'aaa111')], max_rounds_per_item: 6, max_total_rounds: 24,
    } }))

    expect(decision.reason).toBe('awaiting_verdict')
    expect(decision.kind).toBe('none')
    expect(decision.next_state).not.toBe('escalated')
    expect(decision.next_plan_status).toBeUndefined()
  })

  it('keeps a legacy reviewing row when the flow still has a live reviewing head', () => {
    const state = makeState({ state: 'reviewing', review_started_at: NOW, active_plan_item: null, claim: {
      head: 'aaa111', verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null,
    } })
    const decision = flowTick(state, makeObservations({ plan: {
      items: [tickItem('T4.3.2', 'reviewing', null)], max_rounds_per_item: 6, max_total_rounds: 24,
    } }))

    expect(decision.reason).toBe('awaiting_verdict')
    expect(decision.next_plan_status).toBeUndefined()
  })

  it('gives an unreconcilable checked row a visible hold, then escalates once the hold expires', () => {
    const state = makeState({ state: 'reviewing', active_plan_item: 'T4.3.3', claim: {
      head: 'aaa111', verdict: null, verdict_count: 0, verdict_applied: false, spec_id: 'T4.3.3',
    } })
    const initialObs = makeObservations({
      plan: { items: [tickItem('T4.3.2', 'reviewing', 'bbb222')], max_rounds_per_item: 6, max_total_rounds: 24 },
      plan_conflicts: [{ kind: 'ticked_by_hand', item_id: 'T4.3.2' }],
    })
    const first = flowTick(state, initialObs)
    expect(first.reason).toBe('plan_in_flight')
    expect(first.log_detail).toContain('T4.3.2 is reviewing but nothing is in flight')
    const waiting = { ...state, hold: { reason: 'plan_in_flight', since: AT, detail: first.log_detail } }
    const expired = flowTick(waiting, { ...initialObs, now: NOW + PLAN_IN_FLIGHT_STALE_TIMEOUT_MS })
    expect(expired.kind).toBe('escalate')
    expect(expired.reason).toBe('plan_item_stale_in_flight')
    expect(expired.log_detail).toContain('T4.3.2')
  })
})
