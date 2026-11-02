// Flow control: the operator's hands on a flow — pause, resume, stop, and queueing a block after
// the flow already started.
//
// Every command here is one short runs-lock section: read the flow, validate the transition against
// the engine's table (`FLOW_TRANSITIONS`, §3.4), write it back atomically. Nothing sends: a control
// command changes what the *next* tick may do, it never pastes into a pane itself. That is why the
// CLI, the MCP and a future TUI key all call this module and not the runtime.
//
// Two deliberate behaviours:
// - `pause` and `stop` drop an unsettled dispatch claim. A human decision outranks a claim; leaving
//   it behind would make `resume` wait out `PENDING_TTL_SEC` and then escalate a flow nobody is
//   driving.
// - `resume` returns the flow to the state it was paused from, never to "the beginning": a paused
//   `fixing` flow resumes into `fixing`, so the engine still waits for the next HEAD instead of
//   asking for a review of a commit it already reviewed. Resuming an *escalated* flow is the one
//   exception the design makes (§3.4): it grants a fresh round budget and logs that it did.

import type { FlowState, FlowStatus } from './flow.js'
import { FLOW_LOG_LIMIT, FlowStateError, applyOperatorTransition, canTransition } from './flow.js'
import type { BlockSpec } from './spec.js'
import { readSpecFile } from './flow-queue.js'
import type { FlowStoreOptions } from './flow-store.js'
import { readFlow, saveFlow } from './flow-store.js'
import { docsOnlySince, readGitHead } from './flow-runner.js'
import { isRunsLockTimeout, withRunsLock } from './runs.js'
import { withDispatchGate } from './flow-dispatch-gate.js'
import { planExists, readPlan } from './plan.js'
import { pruneClosedFlowNotes } from './flow-notes.js'

export interface FlowControlOptions extends FlowStoreOptions {
  // Timestamp written into the log entry; the clock is the caller's so a test can pin it.
  at?: string
  now?: number
  // How long to wait for an in-flight dispatch to finish before refusing. A test shortens it.
  gate_timeout_ms?: number
}

export interface FlowControlResult {
  state: FlowState
  path: string
}

// One short critical section for a transition. `fn` runs inside the lock and reads the flow as it is
// *now*, which is what makes two control commands (or a control command and a tick) safe: the second
// one validates against the state the first one wrote.
//
// The dispatch gate comes first, the runs lock second — the same order the runner takes (`§2.4`), so
// a control command can never land between a runner's claim check and the paste it guards. While a
// prompt is being typed this waits for it to finish (bounded), then applies on top of the settled
// state; if the sender is stuck the command refuses instead of hanging for ever.
function transition(
  runId: string,
  options: FlowControlOptions,
  // The name is documented in the comment above; a type-only position is reported as unused.
  fn: (_state: FlowState) => FlowState,
): FlowControlResult {
  try {
    const gated = withDispatchGate<FlowControlResult>(
      () => withRunsLock<FlowControlResult>(() => {
        const next = fn(readFlow(runId, { root: options.root }))
        return { state: next, path: saveFlow(next, { root: options.root }) }
      }),
      { root: options.root, timeoutMs: options.gate_timeout_ms },
    )
    if (!gated.acquired) {
      throw new FlowStateError('a dispatch is in flight; nothing was changed — try again in a moment')
    }
    return gated.value
  } catch (err) {
    // A timeout means another reevesagents process is writing the state tree right now: nothing was
    // changed, and the operator can run the command again.
    if (isRunsLockTimeout(err)) {
      throw new FlowStateError('another reevesagents process is writing the state directory; try again')
    }
    throw err
  }
}

// Where a resume would put the flow, without changing anything, so a surface can explain the command
// before it runs. Null when the flow cannot be resumed at all.
export function resumeTarget(state: FlowState): FlowStatus | null {
  if (state.state === 'paused') return state.paused_from ?? 'idle'
  if (state.state === 'escalated') return 'idle'
  return null
}

export function pauseFlow(runId: string, options: FlowControlOptions = {}): FlowControlResult {
  const at = options.at ?? new Date().toISOString()
  const now = options.now ?? Date.now()
  return transition(runId, options, (state) => {
    if (state.state === 'paused') {
      throw new FlowStateError(`flow for run ${state.run_id} is already paused; \`flow resume\` puts it back to work`)
    }
    return applyOperatorTransition(state, {
      to: 'paused',
      action: 'pause',
      event: 'flow_paused',
      detail: `from ${state.state}${state.pending ? ', dropped an unsettled dispatch' : ''}`,
      at,
      patch: { paused_from: state.state, paused_at: Math.floor(now) },
    })
  })
}

export function resumeFlow(runId: string, options: FlowControlOptions = {}): FlowControlResult {
  const at = options.at ?? new Date().toISOString()
  return transition(runId, options, (state) => {
    if (state.state === 'paused') {
      const target = state.paused_from ?? 'idle'
      // The table guards the target too: a file claiming `paused_from: paused` must not resume into
      // itself, and `paused_from: done` must not revive a closed flow.
      if (!canTransition('paused', target)) {
        throw new FlowStateError(`flow for run ${state.run_id} cannot resume into state ${target}`)
      }
      return applyOperatorTransition(state, {
        to: target,
        action: 'resume',
        event: 'flow_resumed',
        detail: `from paused to ${target}`,
        at,
        patch: { paused_from: null, paused_at: null, ...anchorOnHead(state) },
      })
    }
    if (state.state === 'escalated') {
      // A human granting a new budget is a decision, not a side effect of a commit (§3.4).
      return applyOperatorTransition(state, {
        to: 'idle',
        action: 'resume',
        event: 'flow_resumed',
        detail: `from escalated to idle, rounds reset from ${state.rounds}`,
        at,
        patch: { rounds: 0, ...anchorOnHead(state) },
      })
    }
    throw new FlowStateError(
      `cannot resume a flow in state ${state.state} (only a paused or escalated flow can be resumed)`,
    )
  })
}

export function stopFlow(runId: string, options: FlowControlOptions = {}): FlowControlResult {
  const at = options.at ?? new Date().toISOString()
  return transition(runId, options, (state) => {
    if (state.state === 'done') {
      throw new FlowStateError(`flow for run ${state.run_id} is already closed (${state.close_reason ?? 'done'})`)
    }
    const stopped = applyOperatorTransition(state, {
      to: 'done',
      action: 'stop',
      event: 'flow_stopped',
      detail: `from ${state.state}${state.pending ? ', dropped an unsettled dispatch' : ''}`,
      at,
      patch: { close_reason: 'stopped by the operator' },
    })
    // The flow will not review again: keep the newest round as evidence, drop the rest (§11.3).
    try { pruneClosedFlowNotes(state.run_id, { root: options.root }) } catch { /* housekeeping only */ }
    return stopped
  })
}

export interface AddSpecsInput {
  run_id: string
  // Structured JSON block specs.
  files?: string[]
  // Files ingested as unstructured markdown: an explicit downgrade, not an accident (§3.2).
  markdown?: string[]
}

export interface AddSpecsResult extends FlowControlResult {
  // The blocks this call queued, in argument order.
  queued: BlockSpec[]
}

// Queue blocks on a flow that already exists. Every file is read and validated *before* the lock, so
// one bad path leaves the flow untouched instead of half-queued; the queue is written once.
// The item ids of the flow's plan, or null when there is none. Read-only and failure-tolerant: the plan is a
// mirror, and a damaged one must not stop a spec from being queued.
function planItemIds(runId: string): string[] | null {
  try {
    if (!planExists(runId)) return null
    return readPlan(runId).items.map(item => item.id)
  } catch {
    return null
  }
}

export function addFlowSpecs(input: AddSpecsInput, options: FlowControlOptions = {}): AddSpecsResult {
  const at = options.at ?? new Date().toISOString()
  const files = input.files ?? []
  const markdown = input.markdown ?? []
  if (files.length === 0 && markdown.length === 0) {
    throw new FlowStateError('pass at least one --file or --markdown')
  }

  const before = readFlow(input.run_id, { root: options.root })
  refuseClosed(before)

  const queued: BlockSpec[] = []
  const ids = [...before.specs.map(spec => spec.id), ...before.dispatched_specs]
  for (const [paths, asMarkdown] of [[files, false], [markdown, true]] as const) {
    for (const path of paths) {
      const spec = readSpecFile(path, { repo: before.repo, existingIds: ids, asMarkdown })
      queued.push(spec)
      ids.push(spec.id)
    }
  }

  return {
    ...transition(input.run_id, options, (state) => {
      // Re-checked inside the lock: a dispatch or another `add-spec` may have moved since the read
      // above, and this call must not overwrite that queue with a stale copy.
      refuseClosed(state)
      const taken = queued.filter(spec =>
        state.specs.some(entry => entry.id === spec.id) || state.dispatched_specs.includes(spec.id))
      if (taken.length > 0) {
        throw new FlowStateError(`block ${taken.map(spec => spec.id).join(', ')} was queued by another call meanwhile`)
      }
      // When the flow has a plan, a spec that is not an item of it is "off plan": allowed (a human may want a
      // side task), but never silent — the journal says so, and `flow status` shows the same log.
      const offPlan = planItemIds(state.run_id)
      const strays = offPlan === null ? [] : queued.map(spec => spec.id).filter(id => !offPlan.includes(id))
      return {
        ...state,
        specs: [...state.specs, ...queued],
        log: [
          ...state.log,
          { at, event: 'spec_queued', detail: queued.map(spec => spec.id).join(', ') },
          ...(strays.length > 0
            ? [{ at, event: 'off_plan_spec', detail: `${strays.join(', ')} — queued outside the plan` }]
            : []),
        ].slice(-FLOW_LOG_LIMIT),
        updated_at: at,
      }
    }),
    queued,
  }
}

// The head a fresh spell starts from: the current one when the movement since the claim was documentation only (or unreadable), the old
// one when real work happened in between — the tick needs to see that difference to request a review.
function anchorHead(state: FlowState): string {
  const current = readGitHead(state.repo) || state.claim.head
  if (!state.claim.head) return current
  const docsOnly = docsOnlySince(state, current)
  return docsOnly === false ? state.claim.head : current
}

// Is the item the claim is bound to still open? The question the settle asks, asked here so `resume` keeps the answer that is still due.
function boundItemOpen(state: FlowState): boolean {
  const id = state.claim.spec_id
  if (!id) return false
  try {
    const plan = readPlan(state.run_id)
    return plan.items.some(item => item.id === id && item.status !== 'done' && item.status !== 'skipped')
  } catch {
    // An unreadable plan is not a reason to throw the answer away: the settle will find nothing to close and say so.
    return true
  }
}

// `resume` starts a new working spell, so the commits that landed while the flow was parked are the new baseline: they are
// "already accounted for" and do not earn a review (block 22, D6). Without this the first tick after a resume asked a
// reviewer to read whatever had been committed in the meantime — including the plan document itself.
//
// What it must not do is throw away an answer the flow already has. `resume` used to reset `verdict` and `spec_id`, so a run that
// escalated *after* its reviewer answered came back with nothing to apply and sat on the item for ever — that is exactly what
// `landing-ten` did (`claim.head = 5badf48`, `verdict ACCEPT`, then `verdict none` after the resume). An answer that has not been
// used keeps its head, its verdict and its binding: the whole point of resuming is to let the flow carry it out (block 48, MAJOR 2).
function anchorOnHead(state: FlowState): { claim: FlowState['claim'], verdict_handled_for: null } {
  // An answer is owed while the item it belongs to is still open — the marker `verdict_applied` is bookkeeping, and it can be set while
  // the item it claims to have closed is still in flight (the settle treats exactly that as "the close is still due"). Resetting the
  // claim on that state threw the answer away and left the run parked with nothing to apply (block 50, MAJOR).
  const owed = state.claim.verdict !== null && (!state.claim.verdict_applied || boundItemOpen(state))
  // Re-anchoring is for the commits that are not work: a plan import or an attached brief made while the flow was parked must not come back
  // as "the head moved". A commit that touches code is work, and the flow owes it a review — so the claim keeps its old head and the next
  // tick sees the movement and asks for the review. Anchoring on the new head regardless swallowed that step: `flow-a` came back from a
  // resume with `claim.head` already at the dev's commit, `0/2`, and a tick that could only say `head_unchanged` (block 55).
  const head = owed ? state.claim.head : anchorHead(state)
  return {
    claim: owed
      ? { ...state.claim, head }
      : { head, verdict: null, verdict_count: state.claim.verdict_count, verdict_applied: false, spec_id: null },
    verdict_handled_for: null,
  }
}

// A block queued on a closed flow is work nobody will ever dispatch: refuse it with the reason
// instead of growing a file that only `flow status` reads.
function refuseClosed(state: FlowState): void {
  if (state.state !== 'done' && state.state !== 'escalated' && state.state !== 'orphaned') return
  const why = state.close_reason ?? state.orphan_reason ?? 'closed'
  throw new FlowStateError(
    `flow for run ${state.run_id} is ${state.state}; a block queued there would never be dispatched (${why})`,
  )
}
