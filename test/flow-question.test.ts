import { describe, expect, it } from 'vitest'
import { applyDecisionToState, createFlowState, flowTick } from '../src/core/flow.js'
import type { FlowObservations } from '../src/core/flow.js'

const now = 1_800_000_000_000
const base = createFlowState({
  run_id: 'q', repo: '/tmp', roles: { dev: 'dev-1', review: 'rev-1' }, head: 'a'.repeat(40), at: new Date(now).toISOString(),
})
const plan = (status: 'in_work' | 'blocked_owner') => ({
  max_rounds_per_item: 3, max_total_rounds: 12,
  items: [{ id: 'P1.1', title: 'task', status, block_reason: status === 'blocked_owner' ? 'agent_question' : null, rounds: 0, spec: null, spec_path: null, head: null, notes_ref: null, missing: false }],
})
const obs = (at: number, question: string | null, status: 'in_work' | 'blocked_owner' = 'in_work'): FlowObservations => ({
  now: at, head: 'a'.repeat(40), tree_clean: true, dev_pane: question ? 'unknown' : 'idle', review_pane: 'idle', verdict: null,
  verdict_count: 0, plan: plan(status), agent_question: question,
})

describe('agent question lifecycle', () => {
  it('journals once, holds the plan item for a human, resumes after the prompt disappears, and escalates once after 20 minutes', () => {
    const working = { ...base, active_plan_item: 'P1.1', claim: { ...base.claim, spec_id: 'P1.1' } }
    const question = 'Which network approach should I use?'
    const first = flowTick(working, obs(now, question))
    expect(first.log_event).toBe('agent_question')
    expect(first.next_plan_status).toMatchObject({ id: 'P1.1', status: 'blocked_owner', block_reason: 'agent_question' })
    const waiting = applyDecisionToState(working, first, new Date(now).toISOString())
    expect(waiting.agent_question).toMatchObject({ agent: 'dev-1', item: 'P1.1', text: question, since: now })

    expect(flowTick(waiting, obs(now + 10_000, question, 'blocked_owner')).reason).toBe('agent_question')
    const answered = flowTick(waiting, obs(now + 20_000, null, 'blocked_owner'))
    expect(answered.log_event).toBe('agent_question_answered')
    expect(answered.next_plan_status).toMatchObject({ id: 'P1.1', status: 'in_work' })
    expect(applyDecisionToState(waiting, answered, new Date(now + 20_000).toISOString()).agent_question).toBeNull()

    const unreadable = flowTick(waiting, { ...obs(now + 15_000, null, 'blocked_owner'), dev_pane: 'unknown' })
    expect(unreadable.reason).toBe('agent_question')
    expect(unreadable.log_event).toBeUndefined()

    const timedOut = flowTick(waiting, { ...obs(now + 20 * 60_000, null, 'blocked_owner'), dev_pane: 'unknown' })
    expect(timedOut.reason).toBe('question_unanswered')
    expect(timedOut.next_state).toBe('escalated')
    expect(timedOut.log_event).toBe('question_unanswered')

    const lateAnswer = flowTick(waiting, { ...obs(now + 20 * 60_000 + 1, null, 'blocked_owner'), dev_pane: 'idle' })
    expect(lateAnswer.reason).toBe('agent_question_answered')
    expect(lateAnswer.next_state).not.toBe('escalated')
  })
})
