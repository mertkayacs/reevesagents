import { describe, expect, it } from 'vitest'
import { ownerDecisionBlockFromPane } from '../src/core/flow-runner.js'
import { createFlowState, flowTick } from '../src/core/flow.js'
import type { FlowObservations, FlowState } from '../src/core/flow.js'
import type { PlanTickView } from '../src/core/flow-plan.js'

const AT = '2026-11-04T12:00:00.000Z'
const NOW = Date.parse(AT)

function plan(status: 'in_work' | 'done' = 'in_work'): PlanTickView {
  return {
    max_rounds_per_item: 5,
    max_total_rounds: 20,
    items: [
      { id: 'P1.1', title: 'verify provider writes', status, block_reason: null, rounds: 1,
        spec: { id: 'P1.1', title: 'verify provider writes', goal: 'g', requirements: ['r'], checks: ['c'], report: [] },
        spec_path: 'docs/briefs/P1.1.json', head: null, notes_ref: null, missing: false },
      { id: 'P1.2', title: 'next', status: 'queued', block_reason: null, rounds: 0,
        spec: { id: 'P1.2', title: 'next', goal: 'g', requirements: ['r'], checks: ['c'], report: [] },
        spec_path: 'docs/briefs/P1.2.json', head: null, notes_ref: null, missing: false },
    ],
  }
}

function acceptedState(): FlowState {
  return {
    ...createFlowState({ run_id: 'run-1', repo: '/repo', roles: { dev: 'dev-1', review: 'rev-1' }, head: 'aaa111', at: AT }),
    state: 'reviewing', active_plan_item: 'P1.1', review_started_at: NOW,
    claim: { head: 'aaa111', verdict: null, verdict_count: 0, verdict_applied: false, spec_id: 'P1.1' },
  }
}

function observations(overrides: Partial<FlowObservations> = {}): FlowObservations {
  return {
    now: NOW + 60_000, head: 'aaa111', tree_clean: true, dev_pane: 'idle', review_pane: 'idle',
    verdict: 'ACCEPT', verdict_count: 1, verdict_evidence: { elapsed_ms: 60_000, notes_bytes: 100, notes_findings: 0, pane_tool_lines: 2 },
    plan: plan(), verdict_source: 'pane', verdict_explicit_clean: true,
    ...overrides,
  }
}

describe('owner decision marker', () => {
  it('puts the machine-readable owner decision instruction in plan-item dispatches', () => {
    const state = createFlowState({ run_id: 'run-1', repo: '/repo', roles: { dev: 'dev-1', review: 'rev-1' }, head: 'aaa111', at: AT })
    const decision = flowTick(state, observations({
      verdict: null,
      verdict_count: 0,
      verdict_evidence: undefined,
      verdict_explicit_clean: false,
      plan: { ...plan(), items: plan().items.map(item => ({ ...item, status: 'queued' as const })) },
    }))
    expect(decision.kind).toBe('dispatch_spec')
    expect(decision.message).toContain('FLOW-BLOCKED: <what the owner must decide>')
  })

  it('reads a final marker while ignoring pane prompt chrome, but not a marker from an older response block', () => {
    expect(ownerDecisionBlockFromPane('Finished generic verification.\nFLOW-BLOCKED: needs an authorized write test scope\n›\n? for shortcuts'))
      .toBe('needs an authorized write test scope')
    expect(ownerDecisionBlockFromPane('FLOW-BLOCKED: needs an authorized write test scope\n\n› \nGPT-6-Luna high · ~/repo\n← for agents · ? for shortcuts'))
      .toBe('needs an authorized write test scope')
    expect(ownerDecisionBlockFromPane('Finished generic verification.\nFLOW-BLOCKED: needs an authorized write test scope\n\n› Ask Codex to do anything\nGPT-6-Luna high · ~/repo\n← for agents · ? for shortcuts'))
      .toBe('needs an authorized write test scope')
    expect(ownerDecisionBlockFromPane('FLOW-BLOCKED: old blocker\n\nThe next completion finished the task.\n›')).toBeNull()
    expect(ownerDecisionBlockFromPane('FLOW-BLOCKED: old blocker\n1. Next output line\n›')).toBeNull()
  })

  it('blocks an ACCEPT before closing and does not dispatch the next item', () => {
    const decision = flowTick(acceptedState(), observations({ owner_blocked: 'needs a verified write capability' }))
    expect(decision.next_plan_status).toEqual({ id: 'P1.1', status: 'blocked_owner', block_reason: 'owner_decision' })
    expect(decision.next_plan_close).toBeUndefined()
    expect(decision.next_active_plan_item).toBeNull()
    expect(decision.next_claim_verdict_applied).toBe(true)
    expect(decision.next_state).toBe('idle')
    expect(decision.next_review_started_at).toBeNull()
    expect(decision.next_claim.verdict).toBeNull()
    expect(decision.log_event).toBe('plan_item_blocked')
  })

  it('does not block a CHANGES_REQUESTED round or work without a plan', () => {
    const changes = flowTick(acceptedState(), observations({ verdict: 'CHANGES_REQUESTED', owner_blocked: 'owner choice' }))
    expect(changes.reason).not.toBe('plan_item_blocked')
    expect(changes.next_plan_status).toBeUndefined()

    const noPlan = flowTick(acceptedState(), observations({ plan: undefined, owner_blocked: 'owner choice' }))
    expect(noPlan.next_plan_status).toBeUndefined()
  })

  it('keeps an already closed item on the ordinary ACCEPT path', () => {
    const decision = flowTick(acceptedState(), observations({ plan: plan('done'), owner_blocked: 'owner choice' }))
    expect(decision.next_plan_status).toBeUndefined()
  })
})
