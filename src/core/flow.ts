// Flow engine: the pipeline state and the one pure step that moves it.
//
// The engine answers a single question — "what should happen next for this run?" — from two
// inputs: the state saved last time and what the world looks like now. It performs no I/O.
// tmux, git and the file are the caller's job (`flow-runner.ts`, `flow-store.ts`). That split is
// what makes the automaton testable without a pane, a repository or a clock, and it is why
// `flowTick` cannot send anything by accident.
//
// Invariants (docs/flows-design.md §3.1–§3.4):
// - A verdict counts only for the head it was requested for, and only when the reviewer's
//   verdict counter went up. The ACCEPT a previous commit left on screen is not this commit's.
// - Nothing is dispatched into a pane that is not positively idle. `unknown` (a provider without
//   a verified marker, a login screen, a modal) is treated exactly like `busy`.
// - The round budget is cumulative for the whole flow and is never reset by a new head, so
//   `escalated` is reachable instead of being an unreachable branch of the table.
// - Every state change is a pure function of (state, observations): same input, same decision,
//   which is what lets `--dry-run` print exactly what a real tick would do.

import type { PaneBusyState } from './activity.js'
import type { BlockSpec } from './spec.js'
import { renderDispatchPrompt } from './spec.js'
import type { FlowVerdict } from './verdict.js'

export type FlowStatus = 'idle' | 'reviewing' | 'fixing' | 'escalated' | 'done'

export const FLOW_STATUSES: readonly FlowStatus[] = ['idle', 'reviewing', 'fixing', 'escalated', 'done']

// Bumped whenever the on-disk shape changes incompatibly. A file with any other version is a
// hard read error, never a silent reset (see `parseFlowState`).
export const FLOW_SCHEMA_VERSION = 1

// Fix rounds a flow may spend before it escalates to a human. Cumulative for the flow: a budget
// that a normal commit cycle resets is a budget that can never run out (§3.1).
export const MAX_ROUNDS = 6

// `flow status` shows the tail; the file stays bounded so a long-lived flow cannot grow forever.
export const FLOW_LOG_LIMIT = 50

export interface FlowClaim {
  // The commit the current review or fix is about. A verdict is only applied to this head.
  head: string
  // The last verdict read for `head`. Kept for `flow status`; never authoritative on its own,
  // because a verdict on screen outlives the commit it was written for.
  verdict: FlowVerdict | null
  // How many verdicts the reviewer pane held when the claim was taken. A verdict is "new" only
  // when this counter goes up, which is the memory that survives a restart.
  verdict_count: number
}

export interface FlowRoles {
  dev: string
  review: string
}

export interface FlowLogEntry {
  at: string
  event: string
  detail: string
}

export interface FlowState {
  schema_version: number
  run_id: string
  // Absolute path, because git needs it. Every payload renders it home-shortened (§4.1).
  repo: string
  roles: FlowRoles
  state: FlowStatus
  rounds: number
  max_rounds: number
  claim: FlowClaim
  // Blocks queued but not necessarily dispatched (§3.2). The next block is the first one whose
  // id is absent from `dispatched_specs`.
  specs: BlockSpec[]
  dispatched_specs: string[]
  log: FlowLogEntry[]
  updated_at: string
}

export interface FlowInit {
  run_id: string
  repo: string
  roles: FlowRoles
  // The commit the flow starts from; a review is requested for the next one.
  head?: string
  max_rounds?: number
  specs?: BlockSpec[]
  at?: string
}

// What the caller observed at tick time. Every field is read outside this module, so a test can
// describe any pane, any repository and any reviewer without tmux or git.
export interface FlowObservations {
  // HEAD of the flow's repository. Empty means "could not read it", which is not "unchanged".
  head: string
  // False when the worktree has uncommitted changes: reviewing a half-written tree burns a round.
  tree_clean: boolean
  dev_pane: PaneBusyState
  review_pane: PaneBusyState
  // The reviewer's latest verdict, when it printed one.
  verdict: FlowVerdict | null
  // How many verdicts the scanned capture contains. Callers must use the same window for every
  // tick of one flow, or the counter is not comparable.
  verdict_count: number
  // The reviewer's BLOCKER/MAJOR/MINOR lines, already redacted by `verdict.ts`.
  verdict_notes?: string
}

export type FlowActionKind = 'request_review' | 'dispatch_fix' | 'dispatch_spec' | 'escalate' | 'none'

// Machine-readable why. A hold and an action share the type, because `kind` already says which
// one it is and one vocabulary keeps `flow status` and the JSON payload aligned.
export type FlowReason =
  | 'flow_closed'
  | 'head_unknown'
  | 'head_unchanged'
  | 'no_new_head'
  | 'tree_dirty'
  | 'dev_busy'
  | 'dev_pane_unknown'
  | 'review_busy'
  | 'review_pane_unknown'
  | 'awaiting_verdict'
  | 'verdict_scrolled'
  | 'rounds_exhausted'
  | 'head_moved'
  | 'review_requested'
  | 'fix_dispatched'
  | 'spec_dispatched'
  | 'flow_done'

export interface FlowDecision {
  kind: FlowActionKind
  reason: FlowReason
  // The status, round count and claim after this decision is applied. Carried in the decision so
  // the transition is computed once, purely, instead of being re-derived by the writer.
  next_state: FlowStatus
  next_rounds: number
  next_claim: FlowClaim
  // Who receives `message`. Absent for a hold and for an escalation (a human decides that one).
  target?: keyof FlowRoles
  // The exact text a real tick pastes. Absent for a hold.
  message?: string
  head?: string
  spec_id?: string
  notes?: string
}

export class FlowStateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FlowStateError'
  }
}

function isoNow(): string {
  return new Date().toISOString()
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? raw as Record<string, unknown> : null
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function count(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback
}

export function createFlowState(init: FlowInit): FlowState {
  const runId = init.run_id.trim()
  if (!runId) throw new FlowStateError('a flow needs a run id')
  const dev = init.roles?.dev?.trim() ?? ''
  const review = init.roles?.review?.trim() ?? ''
  if (!dev || !review) throw new FlowStateError('a flow needs a dev agent and a review agent')
  if (dev === review) throw new FlowStateError('the dev and the review agent must be different agents')
  return {
    schema_version: FLOW_SCHEMA_VERSION,
    run_id: runId,
    repo: init.repo,
    roles: { dev, review },
    state: 'idle',
    rounds: 0,
    max_rounds: init.max_rounds && init.max_rounds > 0 ? Math.floor(init.max_rounds) : MAX_ROUNDS,
    claim: { head: init.head ?? '', verdict: null, verdict_count: 0 },
    specs: init.specs ?? [],
    dispatched_specs: [],
    log: [],
    updated_at: init.at ?? isoNow(),
  }
}

// Read a stored flow. Every failure is explicit: a damaged file is reported with its reason, and
// a version this build does not understand is refused instead of being normalised into defaults
// — a reset would silently drop a pipeline that is mid-round.
export function parseFlowState(raw: unknown): FlowState {
  const record = asRecord(raw)
  if (!record) throw new FlowStateError('flow state is not an object')
  if (record.schema_version !== FLOW_SCHEMA_VERSION) {
    throw new FlowStateError(
      `flow state has schema_version ${JSON.stringify(record.schema_version)}, this build reads ${FLOW_SCHEMA_VERSION}`,
    )
  }
  const runId = text(record.run_id)
  if (!runId) throw new FlowStateError('flow state has no run_id')
  const status = FLOW_STATUSES.find(candidate => candidate === record.state)
  if (!status) throw new FlowStateError(`flow state has an unknown state ${JSON.stringify(record.state)}`)
  const roles = asRecord(record.roles) ?? {}
  const dev = text(roles.dev)
  const review = text(roles.review)
  if (!dev || !review) throw new FlowStateError('flow state has no dev/review agent ids')
  const claim = asRecord(record.claim) ?? {}
  const verdict = claim.verdict === 'ACCEPT' || claim.verdict === 'CHANGES_REQUESTED' ? claim.verdict : null
  return {
    schema_version: FLOW_SCHEMA_VERSION,
    run_id: runId,
    repo: text(record.repo),
    roles: { dev, review },
    state: status,
    rounds: count(record.rounds),
    max_rounds: count(record.max_rounds, MAX_ROUNDS) || MAX_ROUNDS,
    claim: { head: text(claim.head), verdict, verdict_count: count(claim.verdict_count) },
    specs: Array.isArray(record.specs) ? record.specs.map(normalizeSpec).filter((spec): spec is BlockSpec => spec !== null) : [],
    dispatched_specs: Array.isArray(record.dispatched_specs)
      ? record.dispatched_specs.map(text).filter(entry => entry !== '')
      : [],
    log: Array.isArray(record.log)
      ? record.log
        .map(asRecord)
        .filter((entry): entry is Record<string, unknown> => entry !== null)
        .map(entry => ({ at: text(entry.at), event: text(entry.event), detail: text(entry.detail) }))
        .slice(-FLOW_LOG_LIMIT)
      : [],
    updated_at: text(record.updated_at) || isoNow(),
  }
}

// A queued spec was validated when it was added; on read only its identity is enforced, so a file
// written by a newer build is not rejected for a field this one does not know.
function normalizeSpec(raw: unknown): BlockSpec | null {
  const record = asRecord(raw)
  if (!record) return null
  const id = text(record.id)
  if (!id) return null
  const list = (value: unknown): string[] => Array.isArray(value) ? value.map(text).filter(entry => entry !== '') : []
  const spec: BlockSpec = {
    id,
    title: text(record.title) || id,
    goal: text(record.goal),
    requirements: list(record.requirements),
    checks: list(record.checks),
    report: list(record.report),
  }
  const body = text(record.body)
  if (body) spec.body = body
  const sourcePath = text(record.source_path)
  if (sourcePath) spec.source_path = sourcePath
  if (record.unstructured === true) spec.unstructured = true
  return spec
}

// The review request the reviewer is expected to answer with a single VERDICT line, which is what
// `verdict.ts` parses. Fixed scaffolding, verbatim body — the same rule as the dispatch prompt.
export function renderReviewPrompt(parts: { head: string; repo: string; round: number; max_rounds: number }): string {
  return [
    `Review commit ${parts.head} in ${parts.repo}.`,
    `This is round ${parts.round} of ${parts.max_rounds}; the worktree is clean and the work is committed.`,
    '',
    'Read the diff of this commit against its parent. Do not edit, commit or run install commands.',
    'Answer with one line "VERDICT: ACCEPT" or "VERDICT: CHANGES_REQUESTED", then your findings,',
    'one per line, each starting with BLOCKER, MAJOR or MINOR. Keep it under 30 lines.',
  ].join('\n')
}

// Remarks are passed through verbatim (the reviewer may write in any language); only the
// scaffolding is fixed.
export function renderFixPrompt(parts: {
  head: string
  notes: string
  round: number
  max_rounds: number
}): string {
  const lines = [
    `Flow round ${parts.round} of ${parts.max_rounds}: the review of commit ${parts.head} requested changes.`,
    'Fix every blocking item, commit the result, and report the commit hash plus the checks you ran.',
  ]
  if (parts.notes) {
    lines.push('', 'Remarks from the review (verbatim):', parts.notes)
  } else {
    lines.push('', 'No BLOCKER/MAJOR/MINOR lines were captured from the review; read the reviewer\'s report in its pane.')
  }
  return lines.join('\n')
}

function hold(state: FlowState, reason: FlowReason): FlowDecision {
  return {
    kind: 'none',
    reason,
    next_state: state.state,
    next_rounds: state.rounds,
    next_claim: state.claim,
  }
}

function withClaim(state: FlowState, reason: FlowReason, claim: FlowClaim): FlowDecision {
  return { ...hold(state, reason), next_claim: claim }
}

function reviewRequest(state: FlowState, head: string, verdictCount: number, reason: FlowReason): FlowDecision {
  return {
    kind: 'request_review',
    reason,
    next_state: 'reviewing',
    next_rounds: state.rounds,
    // The baseline is the reviewer's counter *now*, so the verdict that a previous commit left on
    // screen cannot be mistaken for this head's answer.
    next_claim: { head, verdict: null, verdict_count: verdictCount },
    target: 'review',
    head,
    message: renderReviewPrompt({
      head,
      repo: state.repo,
      round: state.rounds + 1,
      max_rounds: state.max_rounds,
    }),
  }
}

function fixDispatch(state: FlowState, observations: FlowObservations): FlowDecision {
  const notes = observations.verdict_notes ?? ''
  const rounds = state.rounds + 1
  return {
    kind: 'dispatch_fix',
    reason: 'fix_dispatched',
    next_state: 'fixing',
    next_rounds: rounds,
    // Consume the verdict: one CHANGES_REQUESTED is dispatched once, however often the tick runs.
    next_claim: { ...state.claim, verdict: observations.verdict, verdict_count: observations.verdict_count },
    target: 'dev',
    head: state.claim.head,
    notes,
    message: renderFixPrompt({
      head: state.claim.head,
      notes,
      round: rounds,
      max_rounds: state.max_rounds,
    }),
  }
}

function specDispatch(state: FlowState, spec: BlockSpec, observations: FlowObservations): FlowDecision {
  return {
    kind: 'dispatch_spec',
    reason: 'spec_dispatched',
    // A dispatched block is not a fix round: the flow goes back to waiting for the dev's next
    // head, which is what `idle` means here.
    next_state: 'idle',
    next_rounds: state.rounds,
    next_claim: { ...state.claim, verdict: observations.verdict, verdict_count: observations.verdict_count },
    target: 'dev',
    spec_id: spec.id,
    message: renderDispatchPrompt(spec),
  }
}

function escalate(state: FlowState, observations: FlowObservations): FlowDecision {
  return {
    kind: 'escalate',
    reason: 'rounds_exhausted',
    next_state: 'escalated',
    next_rounds: state.rounds,
    next_claim: { ...state.claim, verdict: observations.verdict, verdict_count: observations.verdict_count },
    head: state.claim.head,
    notes: observations.verdict_notes ?? '',
  }
}

// A dispatch needs a pane that is positively idle. Anything else — `busy`, and `unknown`, which
// covers a provider without a verified marker, a login screen and a modal — is a refusal.
function dispatchGate(state: FlowState, observations: FlowObservations): FlowDecision | null {
  if (observations.dev_pane === 'busy') return hold(state, 'dev_busy')
  if (observations.dev_pane !== 'idle') return hold(state, 'dev_pane_unknown')
  return null
}

// Requesting a review additionally needs the dev's own pane idle and a clean tree: reviewing a
// commit the dev is still building on spends a round on a moving target.
function reviewGate(state: FlowState, observations: FlowObservations): FlowDecision | null {
  const dev = dispatchGate(state, observations)
  if (dev) return dev
  if (observations.review_pane === 'busy') return hold(state, 'review_busy')
  if (observations.review_pane !== 'idle') return hold(state, 'review_pane_unknown')
  return null
}

function nextSpec(state: FlowState): BlockSpec | null {
  return state.specs.find(spec => !state.dispatched_specs.includes(spec.id)) ?? null
}

function tickIdle(state: FlowState, observations: FlowObservations): FlowDecision {
  // `claim.head` is the commit the flow has already accounted for; a review is requested for the
  // next one, so an unmoved head is not a reason to ask again.
  if (observations.head === state.claim.head) return hold(state, 'head_unchanged')
  if (!observations.tree_clean) return hold(state, 'tree_dirty')
  const gate = reviewGate(state, observations)
  if (gate) return gate
  return reviewRequest(state, observations.head, observations.verdict_count, 'review_requested')
}

function tickReviewing(state: FlowState, observations: FlowObservations): FlowDecision {
  // An unreadable reviewer pane makes every verdict observation meaningless: hold instead of
  // reading a capture that failed as "zero verdicts" and re-baselining on it.
  if (observations.review_pane === 'unknown') return hold(state, 'review_pane_unknown')

  // Fewer verdicts visible than the baseline is a scrolled window, not "no verdict" — the
  // capture is bounded, so an old verdict can leave it. Re-baseline and stay put.
  if (observations.verdict_count < state.claim.verdict_count) {
    return withClaim(state, 'verdict_scrolled', { ...state.claim, verdict_count: observations.verdict_count })
  }

  const fresh = observations.verdict !== null && observations.verdict_count > state.claim.verdict_count
  if (!fresh) return hold(state, 'awaiting_verdict')

  // The dev committed while the review was running: the verdict describes an older commit, so it
  // is not applied to the new head. The new head goes to review once the reviewer is free.
  if (observations.head !== state.claim.head) {
    const gate = reviewGate(state, observations)
    if (gate) return gate
    return reviewRequest(state, observations.head, observations.verdict_count, 'head_moved')
  }

  if (observations.verdict === 'ACCEPT') {
    const spec = nextSpec(state)
    if (!spec) {
      return {
        ...hold(state, 'flow_done'),
        next_state: 'done',
        next_claim: { ...state.claim, verdict: 'ACCEPT', verdict_count: observations.verdict_count },
      }
    }
    const gate = dispatchGate(state, observations)
    if (gate) return gate
    return specDispatch(state, spec, observations)
  }

  // CHANGES_REQUESTED: the budget is checked before the dispatch, so the flow stops on the round
  // it cannot afford instead of looping until a human notices.
  if (state.rounds >= state.max_rounds) return escalate(state, observations)
  const gate = dispatchGate(state, observations)
  if (gate) return gate
  return fixDispatch(state, observations)
}

function tickFixing(state: FlowState, observations: FlowObservations): FlowDecision {
  if (observations.head === state.claim.head) return hold(state, 'no_new_head')
  if (!observations.tree_clean) return hold(state, 'tree_dirty')
  const gate = reviewGate(state, observations)
  if (gate) return gate
  return reviewRequest(state, observations.head, observations.verdict_count, 'review_requested')
}

// One step. Pure: it reads its arguments and returns a decision, never a pane, a file or a clock.
export function flowTick(state: FlowState, observations: FlowObservations): FlowDecision {
  if (state.state === 'escalated' || state.state === 'done') return hold(state, 'flow_closed')
  if (!observations.head) return hold(state, 'head_unknown')
  if (state.state === 'idle') return tickIdle(state, observations)
  if (state.state === 'reviewing') return tickReviewing(state, observations)
  return tickFixing(state, observations)
}

// Does applying this decision change anything on disk? A hold answers false, which is what keeps
// a 2 s tick from rewriting the file (and its log) on every pass.
export function decisionChangesState(state: FlowState, decision: FlowDecision): boolean {
  if (state.state !== decision.next_state) return true
  if (state.rounds !== decision.next_rounds) return true
  if (state.claim.head !== decision.next_claim.head) return true
  if (state.claim.verdict !== decision.next_claim.verdict) return true
  if (state.claim.verdict_count !== decision.next_claim.verdict_count) return true
  if (decision.kind === 'dispatch_spec' && decision.spec_id) {
    return !state.dispatched_specs.includes(decision.spec_id)
  }
  return false
}

function logDetail(decision: FlowDecision): string {
  const parts: string[] = [decision.reason]
  if (decision.head) parts.push(decision.head)
  if (decision.spec_id) parts.push(decision.spec_id)
  return parts.join(' ')
}

function appendLog(state: FlowState, entry: FlowLogEntry): FlowLogEntry[] {
  return [...state.log, entry].slice(-FLOW_LOG_LIMIT)
}

function withDelta(
  state: FlowState,
  decision: FlowDecision,
  at: string,
  options: { advance: boolean; event: string; detail?: string },
): FlowState {
  const dispatched = decision.kind === 'dispatch_spec' && decision.spec_id && !state.dispatched_specs.includes(decision.spec_id)
    ? [...state.dispatched_specs, decision.spec_id]
    : state.dispatched_specs
  return {
    ...state,
    // The claim (and the dispatched-spec list) are consumed in both cases: a paste that landed
    // must never be repeated, even when the submit could not be confirmed.
    claim: decision.next_claim,
    dispatched_specs: dispatched,
    state: options.advance ? decision.next_state : state.state,
    rounds: options.advance ? decision.next_rounds : state.rounds,
    log: appendLog(state, { at, event: options.event, detail: options.detail ?? logDetail(decision) }),
    updated_at: at,
  }
}

export function applyDecisionToState(state: FlowState, decision: FlowDecision, at = isoNow()): FlowState {
  return withDelta(state, decision, at, {
    advance: true,
    event: decision.kind === 'none' ? decision.reason : decision.kind,
  })
}

// The paste landed but the Enter was never confirmed: the work may not have started, so the
// status does not advance — but the decision is consumed, because pasting the same text twice is
// how a queued Enter ends up answering someone else's prompt. A human reads the log entry.
export function applyUnconfirmedDispatch(state: FlowState, decision: FlowDecision, reason: string, at = isoNow()): FlowState {
  return withDelta(state, decision, at, {
    advance: false,
    event: 'dispatch_unconfirmed',
    detail: `${reason} ${logDetail(decision)}`,
  })
}
