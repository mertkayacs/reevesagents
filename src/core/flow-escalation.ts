// Escalation as an approval: no silent stops.
//
// When a flow escalates (an item spent its rounds, the flow's fuse ran out, or no substantiated verdict arrived), the
// tick raises an approval through the existing mechanism — the same `approvals` directory a worker's tool request
// uses, so the TUI and the Web UI already show it. Nothing here writes to the flow behind the operator's back: the
// human decides, and `applyEscalationDecision` turns that decision into a state change.
//
// Approve → the item goes back to `pending` with a fresh budget and the flow resumes.
// Deny    → the flow closes as `done` with a `close_reason`, which is `flow stop` with a reason.

import { createRunApproval, listRunApprovals, removeRunApproval } from './approvals.js'
import type { RunApproval } from './approvals.js'
import { readFlow, saveFlow } from './flow-store.js'
import type { FlowState } from './flow.js'
import { planExists, mutatePlan, moveItemByEngine } from './plan.js'
import { withRunsLock } from './runs.js'

// The action name a host surface can match on; the details carry everything the decision needs.
export const FLOW_ESCALATION_ACTION = 'flow_escalation'

export interface EscalationRequest {
  run_id: string
  flow_id: string
  episode: number
  reason: string
  // The item that caused it, when the reason is item-scoped (`rounds_exhausted`).
  item_id: string | null
}

export function escalationKey(request: Pick<EscalationRequest, 'flow_id' | 'episode'>): string {
  // The key is what makes the approval idempotent across ticks: one episode, one approval, however often the ticker
  // looks at the same escalated flow.
  return `${request.flow_id}:${request.episode}`
}

// Raise the approval once per episode. Returns the approval that exists for this episode (new or already open), or
// null when the flow is not escalated any more — the state is re-read under the lock, so a `flow resume` that landed
// between the decision and this call does not produce a stale request.
export function raiseEscalationApproval(request: EscalationRequest): RunApproval | null {
  // `createRunApproval` takes the runs lock itself, and that lock is not reentrant — so this function must not hold it
  // while creating. The episode key is checked before and after the create: the second check collapses a race
  // between two tickers into the first ticket, which is what the operator should see.
  const state = readFlow(request.run_id)
  if (state.state !== 'escalated') return null
  const key = escalationKey(request)
  const pendingForKey = listRunApprovals(request.run_id, 'pending').filter(approval =>
    approval.action === FLOW_ESCALATION_ACTION && approval.details?.key === key)
  if (pendingForKey.length > 0) {
    // More than one can exist when two tickers raced past the check below. They are duplicates of the *same* episode
    // and none of them carries a decision yet, so keeping the oldest and dropping the rest loses nothing and spares the
    // operator two identical tickets.
    const [oldest] = [...pendingForKey].sort((a, b) => a.requested_at.localeCompare(b.requested_at))
    for (const extra of pendingForKey) if (extra.id !== oldest!.id) removeRunApproval(extra.id)
    return oldest!
  }
    // The approval needs an agent id in this data model; a flow escalation is run-scoped, so the run's dev agent is
    // the honest owner — it is the agent whose work the operator is deciding about.
  const agentId = state.roles.dev
  const created = createRunApproval({
      agent_id: agentId,
      action: FLOW_ESCALATION_ACTION,
      summary: `flow ${request.run_id} escalated: ${request.reason} — continue with a fresh budget, or stop the flow`,
      details: {
        key,
        run_id: request.run_id,
        flow_id: request.flow_id,
        episode: request.episode,
        reason: request.reason,
        item_id: request.item_id,
      },
    risk: 'medium',
  })
  // The same race, seen from the other side: this call just created a record, and another one may have appeared
  // meanwhile. Keep the oldest and drop ours if it lost.
  const race = listRunApprovals(request.run_id, 'pending').filter(approval =>
    approval.action === FLOW_ESCALATION_ACTION && approval.details?.key === key)
  if (race.length <= 1) return created
  const [oldest] = [...race].sort((a, b) => a.requested_at.localeCompare(b.requested_at))
  for (const extra of race) if (extra.id !== oldest!.id) removeRunApproval(extra.id)
  return oldest ?? created
}

export interface EscalationOutcome {
  run_id: string
  decision: 'approved' | 'denied'
  flow_state: string
  item_id: string | null
}

// Turn a human's decision into a flow change. `approved` gives the item a fresh budget (and the flow a resumed
// state); `denied` closes the flow with the reason in `close_reason`, which is what `flow stop --reason` would do.
export function applyEscalationDecision(approval: RunApproval, note = ''): EscalationOutcome | null {
  if (approval.action !== FLOW_ESCALATION_ACTION) return null
  const runId = typeof approval.details?.run_id === 'string' ? approval.details.run_id : approval.run_id
  const itemId = typeof approval.details?.item_id === 'string' ? approval.details.item_id : null
  const reason = typeof approval.details?.reason === 'string' ? approval.details.reason : 'escalated'

  const episode = typeof approval.details?.episode === 'number' ? approval.details.episode : null
  const outcome = withRunsLock(() => {
    const state = readFlow(runId)
    // The approval is about one episode of one flow. After a `flow resume` (or a replacement flow) the number moved on,
    // and applying an old ticket would resume a flow the operator already dealt with — or close a fresh one.
    if (state.state !== 'escalated' || (episode !== null && state.notify_episode !== episode)) {
      return { run_id: runId, decision: 'approved' as const, flow_state: state.state, item_id: null }
    }
    if (approval.status === 'approved') {
      // Resume first, then hand the item back: a flow that is still `escalated` would ignore the new budget.
      const resumed: FlowState = {
        ...state,
        state: 'idle',
        rounds: 0,
        claim: { ...state.claim, verdict: null, verdict_count: state.claim.verdict_count },
        review_started_at: null,
        log: [
          ...state.log,
          { at: new Date().toISOString(), event: 'escalation_approved', detail: `${reason}${note ? ` · ${note}` : ''}` },
        ].slice(-50),
      }
      saveFlow(resumed, { root: undefined })
      return { run_id: runId, decision: 'approved' as const, flow_state: resumed.state, item_id: itemId }
    }
    const closed: FlowState = {
      ...state,
      state: 'done',
      review_started_at: null,
      close_reason: `escalation denied: ${reason}${note ? ` · ${note}` : ''}`,
      log: [
        ...state.log,
        { at: new Date().toISOString(), event: 'escalation_denied', detail: closedDetail(reason, note) },
      ].slice(-50),
    }
    saveFlow(closed, { root: undefined })
    return { run_id: runId, decision: 'denied' as const, flow_state: closed.state, item_id: itemId }
  })

  // The item follows the flow, outside the runs lock: `mutatePlan` takes it too and is not reentrant.
  if (itemId && planExists(runId)) {
    try {
      mutatePlan(runId, current => {
        if (!current) return { plan: null, value: null }
        if (outcome.decision === 'approved') {
          // `queued`, not `pending`: the engine table forbids `in_work → pending` (an item in flight may only become
          // queued, reviewing or blocked), and `queued` is exactly "has a brief, waiting for the tick to pick it up".
          return { plan: moveItemByEngine(current, { id: itemId, status: 'queued', now: Date.now() }), value: null }
        }
        // `in_work → skipped` is not a legal transition, so the item is closed the same way a human would: queued
        // first (the engine's own edge), then skipped with the reason.
        const requeued = moveItemByEngine(current, { id: itemId, status: 'queued', now: Date.now() })
        return { plan: moveItemByEngine(requeued, { id: itemId, status: 'skipped', block_reason: 'escalation_denied', now: Date.now() }), value: null }
      })
    } catch {
      // The flow decision is what matters; a plan that cannot be moved is reported by the plan commands.
    }
  }
  return outcome
}

function closedDetail(reason: string, note: string): string {
  return `escalation denied: ${reason}${note ? ` · ${note}` : ''}`
}

// A short line a surface can print next to a run without opening the flow file.
export function escalationSummary(approval: RunApproval): string {
  const reason = typeof approval.details?.reason === 'string' ? approval.details.reason : 'escalated'
  const item = typeof approval.details?.item_id === 'string' ? ` (${approval.details.item_id})` : ''
  return `flow escalated: ${reason}${item}`
}
