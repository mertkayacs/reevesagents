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

import { randomUUID } from 'node:crypto'
import { relative } from 'node:path'
import type { PaneBusyState } from './activity.js'
import type { BlockSpec } from './spec.js'
import { DISPATCH_POINTER_MAX, renderPointerPrompt } from './spec.js'
import { isCommitId } from './flow-notes.js'
import { displayPath } from '../utils/paths.js'
import { readPlan } from './plan.js'
import type { FlowVerdict } from './verdict.js'
import type { PlanItemTick, PlanTickView } from './flow-plan.js'
import {
  defaultTotalRounds, itemBudgetSpent, planIsComplete, planNext, planOpenItems, planTickSummary,
  planWaitingForBrief, totalBudgetSpent,
} from './flow-plan.js'

export type FlowStatus = 'idle' | 'reviewing' | 'fixing' | 'paused' | 'orphaned' | 'escalated' | 'done'

export const FLOW_STATUSES: readonly FlowStatus[] = ['idle', 'reviewing', 'fixing', 'paused', 'orphaned', 'escalated', 'done']

// Every transition the flow may make, from every state (§3.3, §3.4). Operator actions and engine
// decisions go through the same table, so an illegal write is impossible from either side: a
// `resume` out of `done`, a `pause` of an escalated flow, or a stray engine path into `orphaned`
// all fail here with a message instead of quietly changing the file.
//
// `done` is terminal on purpose — a finished flow is replaced by `flow start --replace`, never
// revived, because its claim and budget describe work that is over.
export const FLOW_TRANSITIONS: Record<FlowStatus, readonly FlowStatus[]> = {
  // `done` is reachable from every live state because `flow stop` is the operator's escape hatch.
  // `escalated` is reachable from `idle` too: a claimed block dispatch that never settles escalates
  // from there after `PENDING_TTL_SEC`, and refusing that transition would strand the claim.
  // `fixing` is reachable from `idle` because a verdict can be collected while the flow is idle (block 21): the answer
  // is older work than any commit, and refusing the edge would leave it unspent for ever.
  idle: ['reviewing', 'fixing', 'paused', 'orphaned', 'escalated', 'done'],
  reviewing: ['idle', 'fixing', 'paused', 'orphaned', 'escalated', 'done'],
  fixing: ['reviewing', 'paused', 'orphaned', 'escalated', 'done'],
  // A paused flow returns to the state it was paused from, which is one of the three above.
  paused: ['idle', 'reviewing', 'fixing', 'orphaned', 'done'],
  // An orphaned flow is parked: only the operator closes it, or its history record's deletion
  // takes the file with it (§3.3).
  orphaned: ['done'],
  // `resume` on an escalated flow grants a fresh budget and returns it to `idle` (§3.4).
  escalated: ['idle', 'orphaned', 'done'],
  done: [],
}

export function canTransition(from: FlowStatus, to: FlowStatus): boolean {
  return FLOW_TRANSITIONS[from].includes(to)
}

// The statuses a flow may be resumed into: its own `paused_from`, which is validated as a target.
export function transitionsFrom(from: FlowStatus): readonly FlowStatus[] {
  return FLOW_TRANSITIONS[from]
}

export function assertTransition(from: FlowStatus, to: FlowStatus, action: string): void {
  if (canTransition(from, to)) return
  const allowed = FLOW_TRANSITIONS[from]
  const hint = allowed.length === 0
    ? 'this flow is closed; start a new one with `flow start --replace`'
    : `allowed from ${from}: ${allowed.join(', ')}`
  throw new FlowStateError(`cannot ${action} a flow in state ${from} (${hint})`)
}

// Bumped whenever the on-disk shape changes incompatibly. A file with any other version is a
// hard read error, never a silent reset (see `parseFlowState`).
export const FLOW_SCHEMA_VERSION = 1

// Fix rounds a flow may spend before it escalates to a human. Cumulative for the flow: a budget
// that a normal commit cycle resets is a budget that can never run out (§3.1).
export const MAX_ROUNDS = 6

// How long a requested review may stay unanswered before the flow stops waiting (§3.1,
// `review_timeout_sec`). A reviewer that crashed, hit a login screen or is staring at a modal never
// prints a verdict, and "wait forever" is not a state a pipeline can afford: the tick escalates.
export const REVIEW_TIMEOUT_SEC = 900

// `flow status` shows the tail; the file stays bounded so a long-lived flow cannot grow forever.
export const FLOW_LOG_LIMIT = 50

// How long a dispatch claim may stay unsettled before a tick stops touching the flow (§2.4). The
// claim is written before the paste and cleared when the paste settled, so an old one means the
// process that took it died mid-send: nobody can tell whether the prompt landed, and a blind
// re-send is the one answer that is certainly wrong.
export const PENDING_TTL_SEC = 120

export interface FlowClaim {
  // The commit the current review or fix is about. A verdict is only applied to this head.
  head: string
  // The last verdict read for `head`. Kept for `flow status`; never authoritative on its own,
  // because a verdict on screen outlives the commit it was written for.
  verdict: FlowVerdict | null
  // How many verdicts the reviewer pane held when the claim was taken. A verdict is "new" only
  // when this counter goes up, which is the memory that survives a restart.
  verdict_count: number
  // Has this claim's verdict been carried out? Recorded in the same write as the dispatch or the close it caused, so a
  // crash between "the answer is known" and "the answer was used" is visible instead of being re-derived from an
  // observation that no longer contains it (block 25). Absent on older files, which read as `false` — and a state whose
  // verdict is `null` is unaffected either way.
  verdict_applied: boolean
  // The plan item whose brief was dispatched for this round. The close uses it, not "whatever item is active now": the live run
  // closed P2.2 with the commit that belonged to P2.1 (block 44).
  spec_id: string | null
  // Where the brief of this round lives, recorded with the dispatch. A plan item's brief is its `spec_path`; a spec queued with
  // `flow start --spec` has no plan row at all, and without this its review prompt arrived with no brief (block 62).
  brief_path?: string | null
}

export interface FlowRoles {
  dev: string
  review: string
}

// The persisted intent of one dispatch — phase one of the claim -> act -> settle protocol (§2.4).
// It exists so two tickers, or one ticker restarted after a crash, cannot paste the same prompt
// twice: a claim on disk means "a send is in flight, do nothing".
export interface FlowPendingDispatch {
  // Identity of this attempt. The settle applies the transition only for its own op, which is what
  // makes settling idempotent.
  op_id: string
  kind: FlowActionKind
  target: keyof FlowRoles
  head: string | null
  spec_id: string | null
  // When the claim was taken (epoch ms) — the only clock `PENDING_TTL_SEC` is measured against.
  at: number
  // The pane's verdict counter when the request was sent. Kept in the claim so a recovery can tell "a verdict answered this
  // request" from "the pane still shows the verdict that was there before it" — the number is the only memory of that
  // moment, and `state.claim.verdict_count` may have been refreshed since (block 29, MAJOR). Absent on older files.
  verdict_baseline?: number
}

export interface FlowLogEntry {
  at: string
  event: string
  detail: string
  // Present when the entry consumed a round's notes: the reference relative to the flow directory
  // (`notes/<head>-r<N>.md`) and the counts. The text itself never enters the journal.
  notes_ref?: string
  notes_counts?: { blocker: number, major: number, minor: number }
}

function parsePlanSummary(raw: unknown): FlowPlanSummary | null {
  const record = raw as Record<string, unknown> | null
  if (!record || typeof record !== 'object') return null
  return {
    imported_at: String(record.imported_at ?? ''),
    source_hash: String(record.source_hash ?? ''),
    done: typeof record.done === 'number' ? record.done : 0,
    total: typeof record.total === 'number' ? record.total : 0,
    waiting: typeof record.waiting === 'number' ? record.waiting : 0,
  }
}

// The plan statuses this module may write. Declared structurally for the same reason as `FlowPlanSummary`:
// `plan.ts` already imports this module, and a type-only cycle through a value module is fragile.
export type FlowPlanItemStatus = 'pending' | 'needs_brief' | 'queued' | 'in_work' | 'reviewing' | 'done'
  | 'blocked_owner' | 'skipped'

// Mirrors `PlanSummary` in `plan.ts` structurally rather than importing it: the plan module already imports
// this one, and a type-only cycle through a value module is more fragile than two small shapes.
export interface FlowPlanSummary {
  imported_at: string
  source_hash: string
  done: number
  total: number
  waiting: number
}

export interface FlowHold {
  // The engine's reason, unchanged from the decision (`tree_dirty`, `head_unchanged`, …): the operator can match it
  // against `flow tick --dry-run` and the journal without translating anything.
  reason: string
  // When this hold started (ISO), not when a tick last looked at it: a repeat keeps the first stamp, so
  // `flow status` can say how long the flow has been standing still.
  since: string
  // The human sentence a detailed hold carries (the plan is waiting for a brief for P1.2, an item is blocked). Absent
  // for the holds that only name a reason.
  detail?: string
}

export interface FlowState {
  schema_version: number
  run_id: string
  // A stable identity for *this* flow. `flow start --replace` on the same run writes a new file, so a run-scoped
  // notification key would collide with the closed flow's key and the dedupe index would suppress a genuinely
  // new escalation (§2.2 of the notification design).
  flow_id: string
  // Incremented on every transition into `escalated`; the notification key is `flow_id:kind:episode`, so a
  // second escalation after `flow resume` is a new episode rather than a duplicate.
  notify_episode: number
  // Absolute path, because git needs it. Every payload renders it home-shortened (§4.1).
  repo: string
  roles: FlowRoles
  // When `flow start` created this flow (ISO). The marker that the file describes a flow that was actually
  // started: it is written once, never moved, and, unlike the `flow_started` journal entry (the journal is
  // capped at FLOW_LOG_LIMIT, so a long flow loses it), it survives for the life of the flow. `saveFlow`
  // refuses a state without it — a file that carries no start is not a pipeline, and a surface that reads it
  // would draw a closed flow that never ran (block 63, BUG 2).
  started_at: string
  state: FlowStatus
  rounds: number
  // With a plan this is the budget of **one item**; without one it stays the flow's round budget, exactly as
  // before (a schema-v1 flow must keep working, and `max_rounds` was never about an item there).
  max_rounds: number
  // The fuse for the whole flow: `4 × max_rounds` capped at 100 unless set. Without a plan it is not read.
  max_total_rounds: number
  // Seconds a requested review may stay unanswered. Per flow, so a slow reviewer can be given
  // more room without touching the engine.
  review_timeout_sec: number
  // When the outstanding review was requested (epoch ms), null when no review is outstanding.
  // Without it the engine cannot tell "the reviewer is thinking" from "the reviewer is gone".
  review_started_at: number | null
  claim: FlowClaim
  // Blocks queued but not necessarily dispatched (§3.2). The next block is the first one whose
  // id is absent from `dispatched_specs`.
  specs: BlockSpec[]
  dispatched_specs: string[]
  // Why the flow is standing still, and since when. Optional in the file: a state written before this field existed
  // reads as "not holding", which is the only safe reading — the alternative would be inventing a reason (block 64).
  hold: FlowHold | null
  // The dispatch in flight, or null. Optional in the file: a flow written before the claim existed
  // reads as "nothing in flight", which is the pre-claim behaviour and why the version stays 1.
  pending: FlowPendingDispatch | null
  // How many verdicts of the current review have been rejected as unsubstantiated (§Evidence). Reset to
  // zero whenever a substantiated verdict is consumed, so a later round gets its own allowance.
  unsubstantiated_attempts: number
  // How many Enter-only retries of the current dispatch were spent. A paste that landed without a confirmed submit starts
  // no round, so the next tick presses Enter again; three such attempts are allowed, then a human is asked (block 69).
  // Optional in the file: a flow written before the field existed has spent none.
  enter_retries: number
  // The plan item whose brief the dispatch in flight was rendered from. An ACCEPT closes *this* item, not
  // "the next one in the document": the two differ as soon as a round runs long enough for the plan to change.
  active_plan_item: string | null
  // `<head>-r<round>` of the last notes-file answer a dispatch was built from. The key is head-scoped, so a
  // new commit starts clean; it exists because a file answer was otherwise fresh on *every* tick — after
  // `dispatch_unconfirmed` (claim released, staging file kept) the next tick rebuilt and re-pasted the same
  // fix prompt. A *refused* dispatch does not set it: nothing was pasted, so the answer stays usable.
  answered_round: string | null
  // The commit whose verdict this flow has already acted on from `idle`. Without it an ACCEPT that arrived while the
  // flow was idle would be re-applied on every tick — closing the item it just dispatched. Reset when the head moves.
  verdict_handled_for: string | null
  // The plan item that verdict was applied to. `verdict_handled_for` alone cannot tell "the ACCEPT closed P1.1" from "a
  // verdict was handled on this commit and P1.2 is now open", and the difference is whether a close is still owed.
  verdict_handled_item: string | null
  // Where `resume` returns the flow to, and when the pause happened. Null unless `state` is
  // `paused`: a resume that guessed would silently restart a pipeline in the wrong state.
  paused_from: FlowStatus | null
  paused_at: number | null
  // Why the flow was parked as `orphaned` (the run or its agents are gone). Written once, so the
  // operator reads the reason instead of guessing from a muted badge.
  orphan_reason: string | null
  // Set by `flow stop` only: the operator ended the pipeline, which is not the same as ACCEPT.
  close_reason: string | null
  // A one-line snapshot of the plan (`docs/plan-model-design.md` §3.1): `flows/<run-id>/plan.json` is the
  // record, this is the cache a surface can read without opening it. Optional in the file, so a flow
  // written before plans existed reads as "no plan" instead of failing.
  plan?: FlowPlanSummary | null
  // Bounded journal (§3.4): transitions, dispatches, verdicts, refusals and escalations, one entry
  // each, capped at FLOW_LOG_LIMIT. It never carries a prompt body — only the decision, the head,
  // the block id and a short reason, so the file stays readable and leak-free.
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
  // Optional: defaults to `defaultTotalRounds(max_rounds)`.
  max_total_rounds?: number
  review_timeout_sec?: number
  specs?: BlockSpec[]
  at?: string
}

// What the caller observed at tick time. Every field is read outside this module, so a test can
// describe any pane, any repository and any reviewer without tmux or git.
export interface FlowObservations {
  // The caller's clock, epoch ms. Injected instead of read here, so the tick stays a pure function
  // of its arguments and a timeout is a testable fact rather than a wait.
  now: number
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
  // Whether the flow's run and both role agents still exist in the registry. Absent means "this
  // caller did not look", which is not evidence of absence: a probe that cannot see the registry
  // must not park a live flow, so only an explicit `false` orphans it (§3.3).
  run_present?: boolean
  agents_present?: boolean
  // Where the verdict came from. `file` means the reviewer wrote this round's notes to disk and the
  // engine read them; that answer is bound to `(head, round)`, so the pane's verdict counter is not
  // the memory for it and the counter checks below do not apply. Absent means the pane.
  verdict_source?: 'file' | 'pane'
  // Sanitised findings of the round, when a notes file answered: what the fix prompt receives.
  notes_text?: string
  // Reference (`notes/<head>-r<N>.md`) and counts of the same file, for the journal.
  notes_ref?: string
  notes_counts?: { blocker: number, major: number, minor: number }
  // The raw reviewer capture of this tick, so the runner can persist it as the fallback evidence
  // without a second capture-pane call.
  pane_text?: string
  // Absolute path of the staging file this round should write. The runner owns the state root, so it
  // resolves the path and the engine only renders it into the prompt.
  notes_staging_path?: string
  // Why this round's notes file was unusable, when one existed: journalled once, on the decision that
  // consumed the pane answer instead. Never a prompt text, only the reason.
  notes_invalid?: string
  // What the tick can prove about the review behind the verdict it is about to apply (incident of
  // 2026-11-01: a reviewer that lived sixteen hours answered `ВЕРДИКТ: ACCEPT` in one second, with no
  // tool call, and the engine would have closed the plan on it).
  verdict_evidence?: VerdictEvidence
  // The reviewer's answer states explicitly that it found nothing — only possible in a notes file, never
  // in a pane.
  verdict_explicit_clean?: boolean
  // The policy the tick applies; the runner reads it from the global config, a test passes it directly.
  evidence_policy?: EvidencePolicy
  // The plan, when the flow has one. Present means "the plan owns the queue": the engine takes the next item
  // from it instead of `state.specs`. Absent keeps the pre-plan behaviour intact (§5 of the plan design).
  plan?: PlanTickView
  // The raw staging text (untruncated), so the runner can publish the durable record without reading
  // the file a second time.
  notes_raw?: string
  // True when every commit between `claim.head` and the observed head touched only the plan document or the briefs: the
  // documents about the work are not the work, and a dev did nothing for them (block 22, D6).
  docs_only_since_claim?: boolean
  // The commit the round's notes file belongs to. It can differ from `claim.head`: a review was requested for it before the
  // claim caught up (block 41).
  notes_head?: string
  // The plan's recorded conflicts, so a guard can tell "this already happened and was reported" from "this is happening now".
  plan_conflicts?: Array<{ kind?: string, detail?: string, item_id?: string }>
  // The round number of the notes file that answered — the file's own, which is not necessarily the round this tick
  // would compute: the reader finds a head's newest file, and a counter that moved must not hide it (block 69).
  notes_round?: number
}

// What a tick can measure about the review behind a verdict.
export interface VerdictEvidence {
  // From the review request to the moment the verdict was first seen.
  elapsed_ms: number
  // The notes of this round, in bytes and in finding lines (0 when the answer came from the pane).
  notes_bytes: number
  notes_findings: number
  // How many lines of the reviewer's capture look like tool work. A support signal, never the only one:
  // panes format differently and a provider can change its ledger.
  pane_tool_lines: number
}

// `review_min_seconds` and `review_evidence_retries` (global config), passed in so the engine stays pure.
export interface EvidencePolicy {
  min_seconds: number
  retries: number
}

export const DEFAULT_EVIDENCE_POLICY: EvidencePolicy = { min_seconds: 30, retries: 1 }

export type FlowActionKind = 'request_review' | 'dispatch_fix' | 'dispatch_spec' | 'escalate' | 'orphan' | 'none'

// Machine-readable why. A hold and an action share the type, because `kind` already says which
// one it is and one vocabulary keeps `flow status` and the JSON payload aligned.
export type FlowReason =
  | 'flow_closed'
  | 'flow_paused'
  | 'flow_orphaned'
  | 'run_gone'
  | 'agents_gone'
  | 'head_unknown'
  | 'head_unchanged'
  | 'head_reanchored'
  | 'no_new_head'
  | 'tree_dirty'
  | 'dev_busy'
  | 'dev_pane_unknown'
  | 'review_busy'
  | 'review_pane_unknown'
  | 'awaiting_verdict'
  | 'verdict_scrolled'
  | 'review_timer_started'
  | 'rounds_exhausted'
  | 'review_timeout'
  | 'dispatch_pending'
  | 'dispatch_unresolved'
  | 'review_unsubstantiated'
  | 'review_dispatch_unconfirmed'
  | 'plan_incomplete'
  | 'plan_item_double_close'
  | 'plan_in_flight'
  | 'rounds_exhausted'
  | 'total_rounds_exhausted'
  | 'off_plan_spec'
  | 'plan_item_dispatched'
  | 'target_not_ready'
  | 'composer_dirty'
  | 'head_moved'
  | 'review_requested'
  | 'fix_dispatched'
  | 'spec_dispatched'
  | 'flow_done'

export interface FlowDecision {
  kind: FlowActionKind
  reason: FlowReason
  // The notes file this decision consumed, when a round answered from disk. The journal records the
  // reference and the counts, never the text (§11.3 of docs/notifications-design.md).
  notes_ref?: string
  notes_counts?: { blocker: number, major: number, minor: number }
  // The reason a notes file of this round existed but was unusable; goes into the journal entry.
  notes_invalid?: string
  // Journal text for decisions whose `notes` must not be logged (a fix dispatch carries the reviewer's
  // remarks there, and those stay out of the bounded journal).
  log_detail?: string
  // The value the state's `unsubstantiated_attempts` takes when this decision is applied: incremented by a
  // rejected review, reset to zero by one that is accepted.
  next_unsubstantiated_attempts?: number
  // The round key a dispatch was built from, recorded so the same file answer is not consumed twice.
  next_answered_round?: string | null
  next_verdict_handled_for?: string | null
  next_verdict_handled_item?: string | null
  // Marks the claim's verdict as carried out. Set by the decision that dispatches or closes on it, in the same write.
  next_claim_verdict_applied?: boolean
  // The journal event for this decision, when the default (`kind`, or `reason` for a hold) would hide what happened.
  log_event?: string
  // Extra journal lines written with this decision — never the prompt, never a path.
  extra_events?: Array<{ event: string, detail: string }>
  // The plan item this decision dispatches for (null clears it: a dispatch that is not the plan's).
  next_active_plan_item?: string | null
  // The plan item an accepted verdict closes, with the facts the plan records.
  next_plan_close?: { id: string, head: string, rounds: number, notes_ref: string | null }
  // A plan item this decision moves by itself (blocked after spending its rounds).
  next_plan_status?: { id: string, status: FlowPlanItemStatus, block_reason?: string | null }
  // The status, round count and claim after this decision is applied. Carried in the decision so
  // the transition is computed once, purely, instead of being re-derived by the writer.
  next_state: FlowStatus
  next_rounds: number
  next_claim: FlowClaim
  // When the review clock starts (a review request) or stops (a consumed verdict).
  next_review_started_at: number | null
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
    flow_id: randomUUID(),
    notify_episode: 0,
    repo: init.repo,
    roles: { dev, review },
    started_at: init.at ?? isoNow(),
    state: 'idle',
    rounds: 0,
    max_rounds: init.max_rounds && init.max_rounds > 0 ? Math.floor(init.max_rounds) : MAX_ROUNDS,
    max_total_rounds: init.max_total_rounds && init.max_total_rounds > 0
      ? Math.floor(init.max_total_rounds)
      : defaultTotalRounds(init.max_rounds && init.max_rounds > 0 ? Math.floor(init.max_rounds) : MAX_ROUNDS),
    review_timeout_sec: init.review_timeout_sec && init.review_timeout_sec > 0
      ? Math.floor(init.review_timeout_sec)
      : REVIEW_TIMEOUT_SEC,
    review_started_at: null,
    claim: { head: init.head ?? '', verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null },
    specs: init.specs ?? [],
    dispatched_specs: [],
    hold: null,
    pending: null,
    unsubstantiated_attempts: 0,
    enter_retries: 0,
    answered_round: null,
    verdict_handled_for: null,
    verdict_handled_item: null,
    active_plan_item: null,
    paused_from: null,
    paused_at: null,
    orphan_reason: null,
    close_reason: null,
    plan: null,
    log: [],
    updated_at: init.at ?? isoNow(),
  }
}

// Was this state ever created by `flow start`? Two facts say yes and both are needed: the start marker, and the commit the
// flow was bound to. `parseFlowState` derives the marker for files written before the field existed, so an empty one
// means the bytes record no flow at all; a marker without a head means the same thing for a different reason — a flow
// that was bound to nothing cannot be driven, and a reader must not draw it as a closed pipeline (block 63/64). Both
// halves of that rule live outside this module — `saveFlow` refuses such a state, `readFlow` reports "no flow".
export function flowWasStarted(state: FlowState): boolean {
  return state.started_at.trim() !== '' && state.claim.head.trim() !== ''
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
  const log = parseLog(record.log)
  // A file written before `started_at` existed was still created by `flow start`, which binds the flow to a commit
  // and journals `flow_started`. Deriving the marker from those two facts keeps an older file readable — and
  // re-savable — instead of failing the first write after an upgrade, while a file that carries neither has no
  // start to recover: it reads back with an empty marker, which `saveFlow` then refuses to persist again.
  const startedAt = text(record.started_at)
    || log.find(entry => entry.event === 'flow_started')?.at
    || (text(claim.head) ? (text(record.updated_at) || isoNow()) : '')
  return {
    schema_version: FLOW_SCHEMA_VERSION,
    run_id: runId,
    flow_id: typeof record.flow_id === 'string' && record.flow_id ? record.flow_id : randomUUID(),
    notify_episode: count(record.notify_episode),
    repo: text(record.repo),
    roles: { dev, review },
    started_at: startedAt,
    state: status,
    rounds: count(record.rounds),
    max_rounds: count(record.max_rounds, MAX_ROUNDS) || MAX_ROUNDS,
    max_total_rounds: count(record.max_total_rounds, defaultTotalRounds(count(record.max_rounds, MAX_ROUNDS) || MAX_ROUNDS))
      || defaultTotalRounds(count(record.max_rounds, MAX_ROUNDS) || MAX_ROUNDS),
    review_timeout_sec: count(record.review_timeout_sec, REVIEW_TIMEOUT_SEC) || REVIEW_TIMEOUT_SEC,
    review_started_at: typeof record.review_started_at === 'number' && Number.isFinite(record.review_started_at)
      ? Math.floor(record.review_started_at)
      : null,
    claim: {
      head: text(claim.head),
      verdict,
      verdict_count: count(claim.verdict_count),
      // Migration, not a guess: a file written before this field existed has no way to say "applied", but
      // `verdict_handled_for` (written by the versions that came before) already records the commit whose answer was
      // used. Reading that as `true` is what keeps a legacy file from applying an old ACCEPT to a *new* item — the
      // failure that had to be repaired by hand on 02.11 (block 27, MAJOR 3). Without that trace the field stays `false`
      // and the verdict is applied once.
      verdict_applied: typeof claim.verdict_applied === 'boolean'
        ? claim.verdict_applied
        : typeof record.verdict_handled_for === 'string' && record.verdict_handled_for === text(claim.head),
      // Absent on older files: the close falls back to `active_plan_item`, which is what those files were written with.
      spec_id: typeof claim.spec_id === 'string' ? claim.spec_id : null,
      // Absent rather than null when there is nothing to say: the field is new, and a state file that never had one should read back
      // exactly as it was written.
      ...(typeof claim.brief_path === 'string' && claim.brief_path !== '' ? { brief_path: claim.brief_path } : {}),
    },
    specs: Array.isArray(record.specs) ? record.specs.map(normalizeSpec).filter((spec): spec is BlockSpec => spec !== null) : [],
    dispatched_specs: Array.isArray(record.dispatched_specs)
      ? record.dispatched_specs.map(text).filter(entry => entry !== '')
      : [],
    hold: parseHold(record.hold),
    pending: parsePendingDispatch(record.pending),
    unsubstantiated_attempts: count(record.unsubstantiated_attempts),
    enter_retries: count(record.enter_retries),
    answered_round: typeof record.answered_round === 'string' ? record.answered_round : null,
    verdict_handled_for: typeof record.verdict_handled_for === 'string' ? record.verdict_handled_for : null,
    verdict_handled_item: typeof record.verdict_handled_item === 'string' ? record.verdict_handled_item : null,
    active_plan_item: typeof record.active_plan_item === 'string' ? record.active_plan_item : null,
    // A paused file always names where it came from; a missing field defaults to `idle`, which is
    // the only target a flow without a recorded origin could safely resume into.
    paused_from: status === 'paused'
      ? (FLOW_STATUSES.find(candidate => candidate === record.paused_from && candidate !== 'paused') ?? 'idle')
      : null,
    paused_at: typeof record.paused_at === 'number' && Number.isFinite(record.paused_at)
      ? Math.floor(record.paused_at)
      : null,
    // Why the flow is parked: user-visible text, so it is bounded and never a prompt body.
    orphan_reason: text(record.orphan_reason).slice(0, 200) || null,
    close_reason: text(record.close_reason).slice(0, 200) || null,
    plan: parsePlanSummary(record.plan),
    log,
    updated_at: text(record.updated_at) || isoNow(),
  }
}

// The bounded journal, parsed once per read: `parseFlowState` needs it for the `started_at` migration above and
// for the state itself, and two copies of this mapping would be two chances to drift.
function parseLog(raw: unknown): FlowLogEntry[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map(asRecord)
    .filter((entry): entry is Record<string, unknown> => entry !== null)
    .map(entry => {
      const parsed: FlowLogEntry = { at: text(entry.at), event: text(entry.event), detail: text(entry.detail) }
      const ref = text(entry.notes_ref)
      if (ref) parsed.notes_ref = ref
      const counts = asRecord(entry.notes_counts)
      if (counts) {
        parsed.notes_counts = {
          blocker: count(counts.blocker),
          major: count(counts.major),
          minor: count(counts.minor),
        }
      }
      return parsed
    })
    .slice(-FLOW_LOG_LIMIT)
}

// The hold a file records, or null. Absent (an older file) is "not holding" — the pipeline is not made broken by a
// field it never had — and a damaged one reads the same way instead of failing every surface that asks what the flow
// is waiting for. `since` defaults to the last write, which is the closest thing an old file has to "when it started".
function parseHold(raw: unknown): FlowHold | null {
  const record = asRecord(raw)
  if (!record) return null
  const reason = text(record.reason)
  if (!reason) return null
  const since = text(record.since)
  const detail = text(record.detail)
  return { reason, since: since || isoNow(), ...(detail ? { detail } : {}) }
}

// A missing `pending` is "nothing in flight", which is what a flow written before the claim
// existed means. A `pending` that is there but damaged is a read error: reading it as "no claim"
// would let a second ticker paste a prompt whose first paste may already have landed.
function parsePendingDispatch(raw: unknown): FlowPendingDispatch | null {
  if (raw === undefined || raw === null) return null
  const record = asRecord(raw)
  if (!record) throw new FlowStateError('flow state has a damaged pending dispatch')
  const opId = text(record.op_id)
  if (!opId) throw new FlowStateError('flow state has a pending dispatch without an op id')
  const kind = record.kind
  if (kind !== 'request_review' && kind !== 'dispatch_fix' && kind !== 'dispatch_spec') {
    throw new FlowStateError(`flow state has a pending dispatch of an unknown kind ${JSON.stringify(kind)}`)
  }
  const target = record.target
  if (target !== 'dev' && target !== 'review') {
    throw new FlowStateError(`flow state has a pending dispatch for an unknown role ${JSON.stringify(target)}`)
  }
  if (typeof record.at !== 'number' || !Number.isFinite(record.at)) {
    throw new FlowStateError('flow state has a pending dispatch without a clock')
  }
  return {
    op_id: opId,
    kind,
    target,
    head: text(record.head) || null,
    spec_id: text(record.spec_id) || null,
    at: Math.floor(record.at),
    // Optional on read: a claim written before the field existed simply has no baseline, and a recovery falls back to the
    // flow's own counter (the pre-block-29 behaviour) rather than inventing one.
    ...(typeof record.verdict_baseline === 'number' && Number.isFinite(record.verdict_baseline)
      ? { verdict_baseline: Math.floor(record.verdict_baseline) }
      : {}),
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
export function renderReviewPrompt(parts: {
  head: string
  repo: string
  round: number
  max_rounds: number
  // The staging file the reviewer must write. Passed in rather than composed here: the runner owns the
  // state root, and a prompt that guesses a path is a prompt that writes nowhere.
  notes_path?: string
  // A re-request after a verdict was rejected as unsubstantiated: say so, and say what has to change.
  strict?: boolean
  // The plan item this round is about, and the brief that defines it. Without them the reviewer has only the general rules and fills the
  // gap with its own expectations — on `flow-a` it rejected an empty `faq.html` that the brief explicitly asked to be empty (block 61).
  plan_item?: string | null
  brief_path?: string | null
}): string {
  const lines = [
    `Review commit ${parts.head} in ${parts.repo}.`,
    `This is round ${parts.round} of ${parts.max_rounds}; the worktree is clean and the work is committed.`,
    '',
    'Read the diff of this commit against its parent. Do not edit, commit or run install commands.',
    'Answer with one line "VERDICT: ACCEPT" or "VERDICT: CHANGES_REQUESTED", then your findings,',
    'one per line, each starting with BLOCKER, MAJOR or MINOR. Keep it under 30 lines.',
  ]
  if (parts.brief_path) {
    // The brief is the contract of this round. Stated once, plainly, and placed before the verdict instructions so it frames them: judge the
    // work against what was asked, and do not invent requirements — a reviewer's own idea of "what else a page needs" is not evidence.
    lines.push(
      '',
      parts.plan_item
        ? `This round is plan item ${parts.plan_item}; its brief is ${parts.brief_path}.`
        : `This round's brief is ${parts.brief_path}.`,
      `Judge the work as CONFORMANCE TO that brief: does the commit do what the brief requires, no more and no less?`,
      'A requirement that is not in the brief is not a reason for a verdict — not a missing feature, not a style preference, not "this could',
      'be better". If the brief asks for an empty file, an empty file is correct. The brief wins over your own expectations; if it',
      'contradicts the general rules you were given (secrets, safety, tests weakened to pass), say so as a BLOCKER and quote the line of',
      'the brief — a conflict between the brief and a rule is the operator\'s to settle, not yours to guess.',
    )
  }
  if (parts.strict) {
    lines.push(
      '',
      'Your previous answer to this round was rejected: it arrived without a review behind it (too fast,',
      'no findings recorded). Do the review now: read the diff, run the checks the block names, and answer',
      'with the finding lines this prompt asks for. An APPROVE with nothing to report must say so explicitly',
      '(`no findings`) in the notes file — a bare verdict is not accepted.',
    )
  }
  if (parts.notes_path) {
    // The file is the primary channel (§11 of docs/notifications-design.md): a pane answer scrolls away,
    // a file is the round's record. The instruction is one paragraph, not a new contract — the same
    // lines the parser expects, in the same order, with the verdict last.
    lines.push(
      '',
      `Also write those same lines to ${parts.notes_path} — one finding per line,`,
      'each starting with BLOCKER, MAJOR or MINOR followed by file:line, then what is wrong and what to do,',
      'and end the file with the line "VERDICT: ACCEPT" or "VERDICT: CHANGES_REQUESTED".',
    )
  }
  return lines.join('\n')
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

function hold(state: FlowState, reason: FlowReason, detail?: string): FlowDecision {
  return {
    kind: 'none',
    reason,
    next_state: state.state,
    next_rounds: state.rounds,
    next_claim: state.claim,
    next_review_started_at: state.review_started_at,
    ...(detail ? { log_detail: detail } : {}),
  }
}

function withNext(state: FlowState, reason: FlowReason, patch: Partial<FlowDecision>): FlowDecision {
  return { ...hold(state, reason), ...patch }
}

function withClaim(state: FlowState, reason: FlowReason, claim: FlowClaim): FlowDecision {
  return withNext(state, reason, { next_claim: claim })
}

function reviewRequest(
  state: FlowState,
  head: string,
  verdictCount: number,
  reason: FlowReason,
  now: number,
  notesPath?: string,
  strict = false,
): FlowDecision {
  const roundItem = state.claim.spec_id ?? state.active_plan_item
  const roundBrief = state.claim.brief_path ?? briefPathFor(state, roundItem)
  return {
    kind: 'request_review',
    reason,
    next_state: 'reviewing',
    next_rounds: state.rounds,
    // The clock starts with the request: a reviewer that never answers is bounded by
    // `review_timeout_sec`, not by a human noticing.
    next_review_started_at: now,
    // The baseline is the reviewer's counter *now*, so the verdict that a previous commit left on
    // screen cannot be mistaken for this head's answer.
    // The item whose brief this round is about survives the review request: the close reads `claim.spec_id`, and resetting it here
    // sent the ACCEPT back to "whichever item is active", which is the binding error of block 44 all over again (block 45, MAJOR 1).
    // The brief of the round survives the request: the next request after a fix round must name the same file, not fall back to a guess.
    next_claim: { head, verdict: null, verdict_count: verdictCount, verdict_applied: false, spec_id: state.claim.spec_id, ...(state.claim.brief_path ? { brief_path: state.claim.brief_path } : {}) },
    target: 'review',
    head,
    message: renderReviewPrompt({
      head,
      repo: state.repo,
      round: state.rounds + 1,
      max_rounds: state.max_rounds,
      notes_path: notesPath,
      strict,
      // The item and its brief: `claim.spec_id` is the item this round belongs to, and the plan knows where its brief lives.
      plan_item: roundItem,
      brief_path: roundBrief,
    }),
  }
}

// The brief a dispatch is about: a plan item's `spec_path`, or the file a spec was read from — shortened the way every message shortens a
// path (relative inside the repository, `displayPath` outside), so the reviewer can open it and the prompt stays a sentence, not an OS path.
function dispatchBriefPath(state: FlowState, spec: BlockSpec, observations: FlowObservations): string {
  const row = observations.plan?.items.find(entry => entry.id === spec.id)
  if (row?.spec_path) return row.spec_path
  const source = spec.source_path
  if (source) {
    const relativePath = relative(state.repo, source)
    return relativePath !== '' && !relativePath.startsWith('..') ? relativePath : displayPath(source)
  }
  return `docs/briefs/${spec.id}.md`
}

// Where the brief for an item lives: the plan's own record when it has one, the conventional path otherwise. Read here, not in the prompt
// renderer, so the renderer stays a pure function of its arguments.
function briefPathFor(state: FlowState, item: string | null): string | null {
  if (!item) return null
  try {
    const plan = readPlan(state.run_id)
    const row = plan?.items.find(entry => entry.id === item)
    if (row?.spec_path) return row.spec_path
  } catch {
    // A damaged plan must not stop a review from being requested; the conventional path is still the best guess.
  }
  return `docs/briefs/${item}.md`
}

// Attach the notes of the round this decision just consumed. The journal then says "round 2 →
// notes/<head>-r2.md · 2 MAJOR, 1 MINOR" instead of only "fix dispatched", and the text stays in the
// file (§11.3 of docs/notifications-design.md).
function withNotes(decision: FlowDecision, observations: FlowObservations): FlowDecision {
  const annotated = observations.notes_invalid ? { ...decision, notes_invalid: observations.notes_invalid } : decision
  if (!observations.notes_ref) return annotated
  return { ...annotated, notes_ref: observations.notes_ref, notes_counts: observations.notes_counts }
}

function fixDispatch(state: FlowState, observations: FlowObservations): FlowDecision {
  const notes = observations.verdict_notes ?? ''
  const rounds = state.rounds + 1
  return {
    kind: 'dispatch_fix',
    reason: 'fix_dispatched',
    next_state: 'fixing',
    next_rounds: rounds,
    next_review_started_at: null,
    // Consume the verdict: one CHANGES_REQUESTED is dispatched once, however often the tick runs.
    next_claim: {
      ...state.claim,
      verdict: observations.verdict,
      verdict_count: observations.verdict_count,
    },
    target: 'dev',
    head: state.claim.head,
    notes,
    next_unsubstantiated_attempts: 0,
    next_verdict_handled_for: state.claim.head,
    // The reference of the file that answered, whatever round it is: the reader finds a head's newest file, and a round
    // counter that moved must not make the same answer look like a new one (block 69).
    next_answered_round: observations.verdict_source === 'file' ? (observations.notes_ref ?? undefined) : undefined,
    message: renderFixPrompt({
      head: state.claim.head,
      notes,
      round: rounds,
      max_rounds: state.max_rounds,
    }),
  }
}

// Which file the pointer names. A plan item carries its brief as a repository-relative path (`docs/briefs/<id>.md`); a spec handed to
// `flow start --spec` or `flow add-spec` carries the file the operator passed, which is the one dev must read. It arrives absolute, so a
// path inside the repository is shortened to its relative form and one outside is shown the way every other message shows it — never as a
// raw `/home/...`, and never as a guess: pointing dev at `docs/briefs/<id>.md` when the brief lives somewhere else sends it to a file that
// may not exist (block 54).
function pointerPath(state: FlowState, spec: BlockSpec, planPath: string | null | undefined): string {
  if (planPath) return planPath
  const source = spec.source_path
  if (source) {
    const relativePath = relative(state.repo, source)
    return relativePath !== '' && !relativePath.startsWith('..') ? relativePath : displayPath(source)
  }
  return `docs/briefs/${spec.id}.md`
}

// What the dev's panel receives: a pointer to the brief when the item has one, the full specification otherwise. `DISPATCH_POINTER_MAX`
// is the ceiling — a longer paste is what broke the composer detection on three live runs (block 47).
function messageForDispatch(state: FlowState, spec: BlockSpec, observations: FlowObservations): string {
  // One path for both kinds of dispatch — a plan item and a spec queued by hand: the panel gets a pointer to the brief, never its body.
  // A brief body is fifteen to thirty lines, and pasting it pushed the input line out of the detector's window: the Enter was never
  // confirmed, the next tick read `dev_pane_unknown`, and the prompt sat in the composer until a human sent a pointer by hand (block 52,
  // the live `flow-a`). The fallback matters as much: an item without a recorded `spec_path` still gets the conventional path rather than
  // the body, because "no path" is not a reason to paste a document into a terminal.
  const item = observations.plan?.items.find(entry => entry.id === spec.id)
  const pointer = renderPointerPrompt({ id: spec.id, title: spec.title, path: pointerPath(state, spec, item?.spec_path) })
  return pointer.length <= DISPATCH_POINTER_MAX ? pointer : `${pointer.slice(0, DISPATCH_POINTER_MAX - 1)}…`
}

function specDispatch(state: FlowState, spec: BlockSpec, observations: FlowObservations): FlowDecision {
  const fromPlan = observations.plan?.items.some(item => item.id === spec.id) === true
  return {
    kind: 'dispatch_spec',
    reason: fromPlan ? 'plan_item_dispatched' : 'spec_dispatched',
    // A dispatched block is not a fix round: the flow goes back to waiting for the dev's next
    // head, which is what `idle` means here.
    next_state: 'idle',
    next_rounds: state.rounds,
    next_review_started_at: null,
    next_claim: {
      ...state.claim,
      // A new round starts with no answer: the verdict that led here was spent closing its item. Carrying it forward let the next tick
      // close the *new* item on the old ACCEPT, without a review of its commit (block 48, MAJOR 1). A verdict that is still owed never
      // reaches a dispatch — the settle hands it to `settledVerdictDecision` first.
      verdict: null,
      verdict_count: observations.verdict_count,
      verdict_applied: false,
      // The round belongs to this item: the close reads it back, so a later tick cannot close "whatever is active now".
      spec_id: fromPlan ? spec.id : null,
      // The brief travels with the round, not with the plan: an off-plan spec has no row to look the path up in later, and its review
      // prompt was the one that arrived without a brief (block 62).
      brief_path: dispatchBriefPath(state, spec, observations),
    },
    target: 'dev',
    spec_id: spec.id,
    // A spec that is an item of the flow's plan *is* that item's work: the ACCEPT will close it, and the fix
    // rounds will count against its budget. A spec outside the plan leaves this null, which is why
    // `off_plan_spec` exists in the journal.
    next_active_plan_item: observations.plan?.items.some(item => item.id === spec.id) ? spec.id : null,
    // Dispatching an item spends the verdict of this commit for that item: the answer that closed the previous one cannot
    // be read as a close still owed for this one.
    next_verdict_handled_item: observations.plan?.items.some(item => item.id === spec.id) ? spec.id : null,
    next_claim_verdict_applied: true,
    next_unsubstantiated_attempts: 0,
    // The reference of the file that answered, whatever round it is: the reader finds a head's newest file, and a round
    // counter that moved must not make the same answer look like a new one (block 69).
    next_answered_round: observations.verdict_source === 'file' ? (observations.notes_ref ?? undefined) : undefined,
    message: messageForDispatch(state, spec, observations),
  }
}

function escalate(
  state: FlowState,
  observations: FlowObservations,
  reason: FlowReason = 'rounds_exhausted',
): FlowDecision {
  return {
    kind: 'escalate',
    reason,
    next_state: 'escalated',
    next_rounds: state.rounds,
    next_review_started_at: null,
    next_claim: {
      ...state.claim,
      verdict: observations.verdict,
      verdict_count: observations.verdict_count,
    },
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

// The item an accepted verdict closes, with what the plan records about it. `notes_ref` comes from the round
// that produced the verdict, so `flow plan status` can point at the findings of the closing review.
// One commit closes one item. A second item closing on a head that already closed one is not progress — it is a binding error, and
// the live run showed what it costs: P2.2 was closed with P2.1's commit, the header went into the next commit, and P2.3 ("About")
// was closed with work it never did, silently skipping a section (block 44).
function planItemDoubleClose(state: FlowState, observations: FlowObservations): FlowDecision | null {
  const id = state.claim.spec_id ?? state.active_plan_item
  const head = state.claim.head
  if (!id || !head || !observations.plan) return null
  const already = observations.plan.items.find(item =>
    item.id !== id && item.head === head && (item.status === 'done' || item.status === 'skipped'))
  if (!already) return null
  const refusedItem = observations.plan.items.find(item => item.id === id)
  const detail = `${head.slice(0, 7)} already closed ${already.id}; it cannot close ${id} as well`
  // A conflict that is already recorded is history, not news: closing more items on that head is refused, the line is written once,
  // and the flow carries on with the first open item. Escalating every tick made a resumed run unresumable — `done` is terminal,
  // so the guard could never stop firing (block 45, defect 3).
  // Two memories, because either can be the only one left: the plan's conflict list and the flow's own journal. Whichever saw it
  // first, the second tick reads it as history (block 45, defect 3).
  const recorded = state.log.some(entry => entry.event === 'plan_item_double_close' && entry.detail.includes(id))
    || (observations.plan_conflicts ?? []).some(conflict =>
      (conflict.kind === 'plan_item_double_close' && conflict.item_id === id) || conflict.detail === detail)
  // Refused either way — a second close on that head must not happen. The only difference is the journal: the first time the
  // conflict is news, afterwards it is history, and repeating it every tick is what made a resumed run unresumable (block 45).
  const refusal: FlowDecision = {
    kind: 'none',
    reason: 'plan_item_double_close',
    next_state: state.state,
    next_rounds: state.rounds,
    next_review_started_at: state.review_started_at,
    next_claim: { ...state.claim, verdict_applied: true },
    next_active_plan_item: null,
    // The item was dispatched but must not be closed by this commit: it goes back to the queue, not to `in_work`. Left in flight it
    // kept the picker convinced that one task was running, so a resumed run never started the next item (block 46, MAJOR 2).
    ...(refusedItem && (refusedItem.status === 'in_work' || refusedItem.status === 'reviewing')
      ? { next_plan_status: { id, status: 'queued' as const } }
      : {}),
    log_detail: detail,
  }
  if (recorded) return { ...refusal, log_detail: undefined }
  return refusal
}

function planCloseOf(state: FlowState, observations: FlowObservations): FlowDecision['next_plan_close'] {
  // The item that owns this round: the one whose brief was dispatched. `active_plan_item` is only the fallback for files written
  // before the claim carried `spec_id`, and for a close that is not about a plan item at all.
  const id = state.claim.spec_id ?? state.active_plan_item
  if (!id) return undefined
  // The item's own rounds, not the flow's: after a few items the flow counter is several times the item's, and
  // `flow plan status` would report a number that never happened for this row.
  const item = observations.plan?.items.find(entry => entry.id === id)
  return { id, head: state.claim.head, rounds: item?.rounds ?? 0, notes_ref: observations.notes_ref ?? null }
}

function withPlanClose(state: FlowState, observations: FlowObservations, decision: FlowDecision): FlowDecision {
  const close = planCloseOf(state, observations)
  return close ? { ...decision, next_plan_close: close } : decision
}

// An ACCEPT with a plan: close this item, then decide what the plan wants next.
function planAcceptDecision(
  state: FlowState,
  observations: FlowObservations,
  plan: PlanTickView,
): FlowDecision {
  // Closing an item and recording it are one write, and so is what the flow has in flight afterwards: the closed item must
  // not stay in `active_plan_item`, or the next tick believes a task is running and never starts the next one (block 31,
  // D11). A decision that dispatches the next item names it; anything else leaves nothing in flight.
  const close = (decision: FlowDecision): FlowDecision => {
    const doubleClose = planItemDoubleClose(state, observations)
    if (doubleClose) return doubleClose
    return {
      ...withPlanClose(state, observations, decision),
      next_active_plan_item: decision.next_active_plan_item ?? null,
    }
  }

  // The fuse outranks everything: a flow that has spent its total budget escalates even while closing an item,
  // otherwise a pathological reviewer could keep it walking from item to item for ever.
  if (totalBudgetSpent(plan, state.rounds)) {
    return close({
      ...escalate(state, observations, 'total_rounds_exhausted'),
      log_detail: `total rounds spent: ${state.rounds}/${plan.max_total_rounds} · ${planTickSummary(plan)}`,
    })
  }

  // A spec queued by hand (outside the plan) is an explicit instruction and outranks the picker: it would
  // otherwise sit in `state.specs` for ever, journalled as `off_plan_spec` and never sent. The plan fills the
  // queue only when the queue is empty, which is what "the plan is the default source of work" means.
  const queued = nextSpec(state)
  if (queued) {
    const gate = dispatchGate(state, observations)
    if (gate) return close(gate)
    return close(specDispatch(state, queued, observations))
  }

  // The item being closed is the one whose brief was sent; `active_plan_item` may already be a different row. Skipping the wrong
  // id here re-dispatched the item that had just been closed (block 44).
  const closingId = state.claim.spec_id ?? state.active_plan_item
  const next = planNext(plan, { skip: closingId })
  if (next.kind === 'none') {
    if (!planIsComplete(plan)) {
      const open = planOpenItems(plan)
      return close(hold(
        state,
        'plan_incomplete',
        `plan incomplete: ${open.length} open (${open.map(item => item.id).join(', ')})`,
      ))
    }
    return close({
      kind: 'none',
      reason: 'flow_done',
      next_state: 'done',
      next_rounds: state.rounds,
      next_review_started_at: null,
      next_claim: { ...state.claim, verdict: 'ACCEPT', verdict_count: observations.verdict_count },
      next_unsubstantiated_attempts: 0,
      next_active_plan_item: null,
      log_detail: `plan complete: ${planTickSummary(plan)}`,
    })
  }
  if (next.kind === 'needs_brief') {
    // Nothing to dispatch and nothing to invent: the flow holds on the plan and names every item waiting for a
    // brief. It is a hold, not an escalation — the owner's block-13 rule is "the item shows up in the report",
    // and an escalation here would make a half-written document look like a broken pipeline.
    const waiting = planWaitingForBrief(plan).map(item => item.id)
    return close(hold(
      state,
      'plan_incomplete',
      `needs a brief for ${next.item.id}${waiting.length > 1 ? ` (waiting: ${waiting.join(', ')})` : ''} — attach one with \`flow plan attach\``,
    ))
  }
  if (next.kind === 'blocked_owner') {
    return close(hold(
      state,
      'plan_incomplete',
      `${next.item.id} is blocked_owner${next.item.rounds > 0 ? ` after ${next.item.rounds} rounds` : ''}: the plan waits for a human`,
    ))
  }
  if (next.kind === 'in_flight') {
    return close(hold(state, 'plan_in_flight', `${next.item.id} is ${next.item.status}: one task per flow`))
  }

  const gate = dispatchGate(state, observations)
  if (gate) return close(gate)
  return close(planItemDispatch(state, next.item, observations))
}

// A CHANGES_REQUESTED on an item that has spent its rounds does not start another fix round: the item blocks
// and the flow stops on it, so a bad item cannot be silently walked past.
function planBudgetDecision(
  state: FlowState,
  observations: FlowObservations,
  plan: PlanTickView,
): FlowDecision | null {
  // `state.rounds` is what has been spent: the next round is allowed while `rounds < max_total_rounds`, so a
  // fuse of 5 permits rounds 1..5 and escalates on the sixth attempt, not before the fifth.
  if (totalBudgetSpent(plan, state.rounds)) {
    return {
      ...escalate(state, observations, 'total_rounds_exhausted'),
      log_detail: `total rounds spent: ${state.rounds}/${plan.max_total_rounds} · ${planTickSummary(plan)}`,
    }
  }
  const id = state.active_plan_item
  if (!id) return null
  const item = plan.items.find(entry => entry.id === id)
  if (!item || !itemBudgetSpent(plan, item)) return null
  return {
    ...hold(state, 'rounds_exhausted', `${id} spent ${item.rounds}/${plan.max_rounds_per_item} rounds; it is blocked until a human decides`),
    next_plan_status: { id, status: 'blocked_owner', block_reason: 'rounds_exhausted' },
  }
}

// Dispatch the brief of one plan item. It is `specDispatch` plus the two facts the plan needs: which item the
// dispatch belongs to, and the journal line the operator reads.
function planItemDispatch(state: FlowState, item: PlanItemTick, observations: FlowObservations): FlowDecision {
  const decision = specDispatch(state, item.spec as BlockSpec, observations)
  return {
    ...decision,
    reason: 'plan_item_dispatched',
    next_active_plan_item: item.id,
    log_detail: `plan_item_dispatched ${item.id}`,
  }
}

function nextSpec(state: FlowState): BlockSpec | null {
  return state.specs.find(spec => !state.dispatched_specs.includes(spec.id)) ?? null
}

function tickIdle(state: FlowState, observations: FlowObservations): FlowDecision {
  // `claim.head` is the commit the flow has already accounted for; a review is requested for the
  // next one, so an unmoved head is not a reason to ask again.
  //
  // Except for work that has never been sent. A plan imported into a fresh flow, and a block queued with
  // `flow add-spec`, both wait for a dispatch and neither produces a new head by itself: without this branch the flow
  // holds on `head_unchanged` for ever (no dispatch → no commit → no review → no ACCEPT → no picker), which is exactly
  // the loop that made an imported plan look unstartable. The head still wins when it has moved — a review of the new
  // commit is an older promise than any queued item — so this is consulted only after that check.
  // A verdict that arrived while the flow was idle is work waiting to happen, and it comes **before** the head check:
  // `fixDispatch` and `planAcceptDecision` used to be reachable only from `tickReviewing`, so a CHANGES_REQUESTED
  // collected at the wrong moment left the flow answering `head_unchanged` for ever (D4). The settled verdict is older
  // than any commit — and if the head moved in the meantime, skipping it would drop the answer the reviewer already
  // gave, which is the same loss one step later (block 22, A1). Order: verdict → moved head → queued work →
  // `head_unchanged`.
  const settled = settledVerdictDecision(state, observations)
  if (settled) return settled

  if (observations.head === state.claim.head) {
    return bootstrapDecision(state, observations) ?? hold(state, 'head_unchanged')
  }

  // A commit that only touches the plan or its briefs is not the dev's work: re-anchor and keep going instead of asking a
  // reviewer to read a document (block 22, D6).
  if (observations.docs_only_since_claim === true) return reanchor(state, observations.head)
  if (!observations.tree_clean) return hold(state, 'tree_dirty')
  const gate = reviewGate(state, observations)
  if (gate) return gate
  return reviewRequest(state, observations.head, observations.verdict_count, 'review_requested', observations.now, observations.notes_staging_path)
}

// A notes file is the answer to its round, and it outranks every other decision: if the reviewer wrote it, the flow applies it
// instead of asking again or dispatching the same item. The state does not matter and `claim.head` does not matter — the file
// names its own head, and the claim is moved there (they are the commit the reviewer actually read). Two live runs each failed
// a different half of this: one had gone back to `idle` with the file beside the old head, the other sat on the right head with
// the file written and the tick dispatching the item again (block 41).
function settleFromNotes(state: FlowState, observations: FlowObservations): FlowDecision | null {
  if (observations.verdict_source !== 'file' || observations.verdict === null) return null
  const head = observations.notes_head
  if (!head) return null
  // Already applied for this very round *and* nothing is left open for it: nothing to settle. The marker alone is not enough —
  // the live run had it set with its item still `in_work`, so the answer was on disk, the item was open, and every tick
  // answered `head_unchanged` (block 41, case B).
  const openItem = observations.plan?.items.some(item =>
    (item.status === 'in_work' || item.status === 'queued' || item.status === 'reviewing') && item.spec !== null)
  if (state.claim.verdict === observations.verdict && state.claim.head === head && state.claim.verdict_applied && !openItem) return null
  // The ordinary path: a flow in `reviewing`, on that very head, reads its own file in `tickReviewing` — with its own events
  // and its own notes handling. This branch exists for the two cases that path cannot serve: the head moved on without the
  // claim, or the flow left `reviewing` before the answer arrived.
  if (state.state === 'reviewing' && state.claim.head === head && state.pending === null) return null
  // Which plan item the answer closes: the one the claim recorded when its brief was dispatched. `active_plan_item` and "the first
  // open item with a brief" are fallbacks for states written before the claim carried the binding — using them first closed the
  // wrong row whenever the two disagreed (block 46, MAJOR 1).
  const planItem = state.claim.spec_id
    ?? state.active_plan_item
    ?? observations.plan?.items.find(item => item.status !== 'done' && item.status !== 'skipped' && item.spec !== null)?.id
    ?? null
  // This round was already refused once for a double close; the record in the plan is the memory of that, and re-deciding it every
  // tick is what made a resumed run unresumable. Leave it to the ordinary tick, which moves on to the next item (block 45).
  const refusedBefore = state.log.some(entry => entry.event === 'plan_item_double_close' && entry.detail.includes(planItem ?? '\u0000'))
    || (observations.plan_conflicts ?? []).some(conflict =>
      conflict.kind === 'plan_item_double_close' && conflict.item_id === planItem)
  if (refusedBefore) return null
  const answered: FlowState = {
    ...state,
    // Keep the plan's in-flight item binding as well as the claim's `spec_id`. They usually
    // agree, but older and recovered states can carry only one of the two (block 63, MAJOR 1).
    active_plan_item: state.active_plan_item,
    // The round the reviewer answered: its head, its verdict, and a clock so the budgets behave as they would have.
    claim: {
      ...state.claim,
      head,
      verdict: observations.verdict,
      verdict_count: observations.verdict_count,
      verdict_applied: false,
      // The answer closes the item whose brief was sent, which is the one the plan item above names.
      spec_id: state.claim.spec_id ?? planItem,
      // The brief of the round survives the reconstruction: a `CHANGES_REQUESTED` recovered from a late note asks for a fix, and the review
      // that follows it must name the same file. Rebuilding the claim without this dropped the path for an off-plan spec, whose only record
      // of the brief *is* the claim (block 63, MAJOR 1).
      ...(state.claim.brief_path ? { brief_path: state.claim.brief_path } : {}),
    },
    state: state.state === 'paused' || state.state === 'orphaned' || state.state === 'done' ? state.state : 'reviewing',
    review_started_at: state.review_started_at ?? observations.now,
    // The claim that was in flight for this round is answered now.
    pending: null,
  }
  // Settled as the collected verdict it is — not by re-entering `flowTick`, which would come straight back here.
  const decision = settledVerdictDecision(answered, observations)
  if (!decision) return null
  if (decision.kind === 'request_review') return null
  if (!decisionChangesState(answered, decision)) return null
  return {
    ...decision,
    next_claim: { ...decision.next_claim, head },
    log_event: 'settled_by_observation',
    extra_events: [
      ...(decision.extra_events ?? []),
      { event: 'settled_by_observation', detail: `${head.slice(0, 7)} verdict ${observations.verdict}` },
    ],
  }
}

// Settle a claim the world has already answered. The decision is the one the engine would have taken without the claim
// (a `tickReviewing` that reads the notes file), marked with `settled_by_observation` so the journal says the claim was
// recovered rather than settled by its sender. Returns null when nothing observable answers the claim — then the claim is
// genuinely in flight and the caller holds.
function settleByObservation(state: FlowState, observations: FlowObservations): FlowDecision | null {
  const pending = state.pending
  if (!pending || pending.kind !== 'request_review') return null
  const fromFile = observations.verdict_source === 'file' && observations.verdict !== null
  // "A new verdict" is measured against the counter the request was sent with, not the flow's counter today: a later tick may
  // have moved that one, and comparing against it either loses the answer (7 > 7) or accepts an older one for it.
  const baseline = pending.verdict_baseline ?? state.claim.verdict_count
  const fromPane = observations.verdict !== null && observations.verdict_count > baseline
  if (!fromFile && !fromPane) return null
  // Re-run the engine with the claim out of the way; anything it refuses to decide means the observation does not
  // actually answer this claim, and the claim keeps its rights.
  // Settle it as the round it was, not as a new tick: the claim says which state the flow was in when the request went
  // out, and re-deciding from "no claim, still idle" is how a second `request_review` was created and sent instead of the
  // answer being used (block 27, MAJOR 2).
  // The claim is on the head the request was *made for*, which is usually not the head the flow still carries (the dev
  // committed while the request was being pasted). Keeping the old head makes `tickReviewing` see "head !== claim.head"
  // and ask for the review again, so the claim never settles (block 28, MAJOR). A synthetic claim on `pending.head` with
  // the baseline the request was sent with is what the send itself would have written.
  const pendingHead = pending.head ?? ''
  const reviewHead = isCommitId(pendingHead) ? pendingHead : state.claim.head
  const withoutClaim: FlowState = {
    ...state,
    pending: null,
    state: 'reviewing',
    review_started_at: state.review_started_at ?? pending.at,
    claim: {
      ...state.claim,
      head: reviewHead,
      // The counter at dispatch time is what "a new verdict" is measured against — the claim recorded it, because
      // `state.claim.verdict_count` may have been refreshed by later ticks and would let the verdict that was already on
      // screen before the request pass for its answer (block 29, MAJOR).
      verdict_count: pending.verdict_baseline ?? state.claim.verdict_count,
    },
  }
  const decision = flowTick(withoutClaim, observations)
  // A review request can never be the settlement of a review request: if the engine wants to ask again, this claim is
  // not answered by anything observable and keeps its rights (and its TTL).
  if (decision.kind === 'request_review') return null
  // "Did not decide" is "changes nothing on disk" — not `kind: 'none'`, which is also how a legitimate `flow_done` is
  // expressed.
  if (!decisionChangesState(withoutClaim, decision)) return null
  return { ...decision, log_event: 'settled_by_observation' }
}

// Take a documentation-only commit as the new baseline: nothing is reviewed, nothing is dispatched, the round counter does
// not move. The journal says so once, because "the flow moved its baseline" is a fact an operator wants to see; what does
// not happen is a review request or a fix.
function reanchor(state: FlowState, head: string): FlowDecision {
  return {
    kind: 'none',
    reason: 'head_reanchored',
    next_state: state.state,
    next_rounds: state.rounds,
    next_review_started_at: state.review_started_at,
    next_claim: { head, verdict: null, verdict_count: state.claim.verdict_count, verdict_applied: false, spec_id: state.claim.spec_id, ...(state.claim.brief_path ? { brief_path: state.claim.brief_path } : {}) },
    next_verdict_handled_for: null,
    log_detail: `documentation commit ${head.slice(0, 7)}: baseline moved, nothing to review`,
  }
}

// The verdict the flow already has, acted on from `idle`. Ordered before the head check because it is *older* work than
// any commit: an answer that was collected must be carried out, or the pipeline stops on a state nobody advances.
// `verdict_handled_for` makes it once per commit — without it an ACCEPT would close the item it just dispatched on every
// following tick.
function settledVerdictDecision(state: FlowState, observations: FlowObservations): FlowDecision | null {
  const verdict = state.claim.verdict
  // The question is "does this flow owe its verdict a consequence?", and the answer lives in the state: a verdict that was
  // recorded and never applied. Deriving it from this tick's observation cannot work — once the answer is collected, the
  // next observation no longer contains it (the review is not waiting any more), so the close was looked for in a place
  // that had already forgotten it (block 25).
  if (verdict === null) return null
  // The marker says the answer was used; an item still open for *that* answer is proof it was not. This is how `landing-ten` sat with
  // `verdict: ACCEPT`, `verdict_applied: true` and `P2.3b` in flight — an unconfirmed send whose answer arrived anyway, and nothing
  // applied it (block 47).
  const boundItem = state.claim.spec_id
  const owesClose = boundItem !== null
    && observations.plan !== undefined
    && observations.plan.items.some(item => item.id === boundItem && item.status !== 'done' && item.status !== 'skipped')
  if (state.claim.verdict_applied && !owesClose) return null
  // An ACCEPT that is still owed a close outranks the marker: the marker says "this verdict was applied", and a plan item
  // that is still open is proof it was not. The live run showed how that happens — a review timed out, the same item was
  // dispatched again, the reviewer answered afterwards, and the marker left the item `in_work` for ever while the flow
  // answered `head_unchanged` (block 24, D10).
  if (!observations.tree_clean) return hold(state, 'tree_dirty')

  if (verdict === 'ACCEPT') {
    // Without a plan an ACCEPT is the legacy close, and `tickReviewing` has already done it: a flow that is idle with an
    // ACCEPT and no plan is simply done with its work. With a plan the item is still open and must be closed.
    if (!observations.plan) return null
    // Nothing to close means the answer was already used. The item is the one the claim bound, or the active one when the claim has
    // no binding (states written before it): a flow whose field was cleared — a refused close does that — still owes the close for
    // the item its verdict names (block 47).
    if (boundItem === null && state.active_plan_item === null) return null
    const accepted = planAcceptDecision(state, observations, observations.plan)
    return {
      ...accepted,
      next_verdict_handled_for: state.claim.head,
      next_verdict_handled_item: state.active_plan_item,
      next_claim_verdict_applied: true,
      // The item is closed here, so the flow has nothing in flight unless the decision dispatched the next one.
      next_active_plan_item: accepted.next_active_plan_item === undefined ? null : accepted.next_active_plan_item,
    }
  }

  if (observations.plan) {
    const budget = planBudgetDecision(state, observations, observations.plan)
    if (budget) return { ...budget, next_verdict_handled_for: state.claim.head, next_claim_verdict_applied: true }
  } else if (state.rounds >= state.max_rounds) {
    return { ...escalate(state, observations), next_verdict_handled_for: state.claim.head, next_claim_verdict_applied: true }
  }
  const gate = dispatchGate(state, observations)
  if (gate) return gate
  return { ...fixDispatch(state, observations), next_claim_verdict_applied: true }
}

// The first dispatch of a flow. Same rules as `planAcceptDecision` — a queued spec outranks the picker, the picker
// takes the first item with a brief, the gate refuses a pane that is not positively idle — reached from the other end
// of the pipeline: nothing has been sent yet, so there is no verdict to react to.
//
// `null` means "nothing to start", and the caller keeps its own reason (`head_unchanged`). A `hold` is returned only
// when there *is* work and something concrete stands in the way, so the journal says why nothing went out.
// Is the item `active_plan_item` points at actually in flight? The field is a cache of "one task per flow", and a closed item
// left in it blocks the next one for ever — the sandbox showed `P1.1.1: done` with the flow still naming it, and the tick
// answering `head_unchanged` while `P1.1.2` waited with a brief (block 31, D11). Only `in_work` and `reviewing` are work; any
// other status is a stale value.
function activeItemInFlight(state: FlowState, plan: PlanTickView | undefined): boolean {
  const id = state.active_plan_item
  if (!id) return false
  const item = plan?.items.find(entry => entry.id === id)
  return item !== undefined && (item.status === 'in_work' || item.status === 'reviewing')
}

function bootstrapDecision(state: FlowState, observations: FlowObservations): FlowDecision | null {
  const queued = nextSpec(state)
  const plan = observations.plan
  if (!queued && !plan) return null
  // One task per flow, and never into a tree somebody is editing: pasting a brief over half-finished work loses it. What
  // counts as "in flight" is the plan's word, not the field's: a stale id is cleared in this same decision and the tick
  // carries on, so the journal records `stale_active_item_cleared` once instead of the field blocking the plan for ever.
  const staleId = state.active_plan_item !== null && !activeItemInFlight(state, plan) ? state.active_plan_item : null
  // Only a real in-flight item is work; a stale id is not, and must never be handed to the picker as `skip` — a `queued` entry
  // in `active_plan_item` would make the picker jump over the very item that is ready (block 37, MAJOR).
  const inFlightId = state.active_plan_item !== null && staleId === null ? state.active_plan_item : null
  if (inFlightId) return null
  // The clear is its own journal line, and the decision keeps its own: one record each, no overwriting.
  const dispatch = (decision: FlowDecision): FlowDecision => (staleId === null ? decision : {
    ...decision,
    next_active_plan_item: decision.next_active_plan_item ?? null,
    extra_events: [
      ...(decision.extra_events ?? []),
      { event: 'stale_active_item_cleared', detail: `${staleId} is not in flight` },
    ],
  })
  if (!observations.tree_clean) return dispatch(hold(state, 'tree_dirty'))
  if (queued) {
    const gate = dispatchGate(state, observations)
    if (gate) return dispatch(gate)
    return dispatch(specDispatch(state, queued, observations))
  }
  if (!plan) {
    // Nothing to start and no plan to start it from: the only thing left to do is write the stale value away.
    return staleId === null ? null : dispatch(hold(state, 'head_unchanged'))
  }
  // `skip` is for the item that is genuinely in flight and must not be started twice. A stale id is *not* in flight — whatever
  // its status says, `queued` included — so it is never passed on: it has just been cleared above, and if it is the first ready
  // item the picker takes it. (Block 38: handing it over as `skip` still made the picker jump past a ready item, and the
  // previous fix only stopped doing that for items without a brief.)
  const next = planNext(plan, { skip: inFlightId })
  // `needs_brief` / `blocked_owner` / `in_flight` are states of the document, reported by `flow plan status` on every
  // read. Escalating or holding on them from `idle` would repeat one line every tick and would let a ready item later
  // in the document be picked over a blocked one, which block 13's rule forbids.
  if (next.kind !== 'item') return staleId === null ? null : dispatch(hold(state, 'plan_incomplete', `${staleId} is not in flight`))
  const gate = dispatchGate(state, observations)
  if (gate) return dispatch(gate)
  return dispatch(planItemDispatch(state, next.item, observations))
}

function tickReviewing(state: FlowState, observations: FlowObservations): FlowDecision {
  // A review state written before the clock existed, or a request that was stamped by nothing:
  // start the clock now rather than waiting on a deadline nobody set.
  if (state.review_started_at === null) {
    return withNext(state, 'review_timer_started', { next_review_started_at: observations.now })
  }

  const timedOut = observations.now - state.review_started_at >= state.review_timeout_sec * 1000
  // A verdict read from this round's notes file is bound to `(head, round)` — round N of head H is a
  // different file from round N of any other head, and a consumed round is followed by a new request
  // (a new round) — so the pane counter is not the memory for it and must not gate it: after a fix the
  // pane still shows the old verdict, and comparing counters would either refuse a fresh file answer or
  // accept an old one twice.
  const fromFile = observations.verdict_source === 'file'

  // An unreadable reviewer pane makes every *pane* verdict observation meaningless: hold instead of
  // reading a capture that failed as "zero verdicts" and re-baselining on it. A file answer does not
  // come from the pane at all — that is the point of the channel — so it is not gated by this; the
  // dispatch itself still needs a positively idle dev pane further down. An expired deadline still
  // wins, because it is a fact about the request and not about what this tick can see.
  const expired = (): FlowDecision => escalate(state, observations, 'review_timeout')
  if (!fromFile && observations.review_pane === 'unknown') {
    return timedOut ? expired() : hold(state, 'review_pane_unknown')
  }

  // HEAD is what binds a verdict to a commit, so nothing can be applied without it — but the
  // deadline outranks this blind spot for the same reason it outranks an unreadable pane.
  if (!observations.head) {
    return timedOut ? expired() : hold(state, 'head_unknown')
  }

  // Fewer verdicts visible than the baseline is a scrolled window, not "no verdict" — the
  // capture is bounded, so an old verdict can leave it. Re-baseline and stay put.
  if (!fromFile && observations.verdict_count < state.claim.verdict_count) {
    return withClaim(state, 'verdict_scrolled', { ...state.claim, verdict_count: observations.verdict_count })
  }

  // The dev committed while the review was running: the verdict describes an older commit, so it
  // is not applied to the new head. The new head goes to review once the reviewer is free.
  //
  // This runs *before* the freshness gate on purpose. A head that moved is a fact about the repository,
  // not about the reviewer: after `dispatch_unconfirmed` the round's answer is already consumed, so a
  // freshness check first would hold the tick in `awaiting_verdict` and let the dev's new commit sit
  // unseen until the review timeout escalated the flow.
  if (observations.head !== state.claim.head) {
    const gate = reviewGate(state, observations)
    if (gate) return gate
    return reviewRequest(state, observations.head, observations.verdict_count, 'head_moved', observations.now, observations.notes_staging_path)
  }

  // A file answer is bound to `(head, round)`, which is why it does not need the pane's verdict counter — but an answer
  // already acted on is not fresh again. The comparison is against the *file's own* reference, not the round this tick
  // would compute: the reader looks for any round of the head, so a counter that moved (a phantom fix, a manual retry)
  // must not make a consumed answer look fresh (block 69).
  const fileAnswered = fromFile && observations.notes_ref !== undefined && state.answered_round === observations.notes_ref
  const fresh = observations.verdict !== null && !fileAnswered
    && (fromFile || observations.verdict_count > state.claim.verdict_count)
  if (!fresh) {
    // Nothing answered within the budget: a reviewer that crashed, hit a login screen or is stuck
    // on a modal never prints a verdict, so the flow escalates instead of waiting for ever.
    return timedOut ? expired() : hold(state, 'awaiting_verdict')
  }

  // A pane verdict is not bound to a commit. The capture window still holds the verdicts of earlier rounds, so a
  // CHANGES_REQUESTED read there says nothing about *this* head — the counter only notices that one more appeared. The
  // file the prompt asked for names the commit it judges, so a fix round needs it; a pane answer is accepted only as an
  // ACCEPT (a close), which the head and the baseline already pin down (block 69).
  if (observations.verdict !== null && observations.verdict !== 'ACCEPT' && !fromFile) {
    return hold(
      state,
      'awaiting_verdict',
      `a ${observations.verdict} read from the pane is not bound to ${state.claim.head.slice(0, 7)}; waiting for its notes file`,
    )
  }

  // A verdict is only an answer if there is a review behind it: a reviewer that answers in one second
  // with nothing recorded is either stamping or broken, and both must stop here rather than close the plan.
  if (!isVerdictSubstantiated(observations)) return unsubstantiated(state, observations)

  // Whatever path consumes this verdict, it is consumed for this commit: the marker is what keeps `idle` from applying the
  // same ACCEPT a second time after the flow comes back there (block 21, D4).
  // The marker records the commit *and* the item the answer was applied to: the item is the one that was active when the
  // verdict arrived, which the decision may already have moved past.
  const handled = (decision: FlowDecision): FlowDecision => ({
    ...decision,
    next_verdict_handled_for: state.claim.head,
    next_claim_verdict_applied: true,
    // A decision that already names the item it spent the verdict on (a dispatch of the next one) keeps it.
    next_verdict_handled_item: decision.next_verdict_handled_item !== undefined
      ? decision.next_verdict_handled_item
      : state.active_plan_item,
  })

  if (observations.verdict === 'ACCEPT') {
    // With a plan the queue comes from the document, not from `state.specs` (§5): the accepted item closes and
    // the engine takes the next item in document order — or refuses to move on, which is the whole point.
    if (observations.plan) return handled(planAcceptDecision(state, observations, observations.plan))

    const spec = nextSpec(state)
    if (!spec) {
      return handled(withNotes(withNext(state, 'flow_done', {
        next_state: 'done',
        next_review_started_at: null,
        next_claim: { ...state.claim, verdict: 'ACCEPT', verdict_count: observations.verdict_count },
        next_unsubstantiated_attempts: 0,
      }), observations))
    }
    const gate = dispatchGate(state, observations)
    if (gate) return gate
    return handled(withNotes(specDispatch(state, spec, observations), observations))
  }

  // CHANGES_REQUESTED: the budget is checked before the dispatch, so the flow stops on the round it cannot
  // afford instead of looping until a human notices.
  //
  // With a plan there are two budgets and neither is `max_rounds`-of-the-flow: the item's own rounds
  // (`max_rounds` per item) block the item, and the flow's fuse (`max_total_rounds`) escalates the flow.
  if (observations.plan) {
    const budget = planBudgetDecision(state, observations, observations.plan)
    if (budget) return handled(withNotes(budget, observations))
    const planGate = dispatchGate(state, observations)
    if (planGate) return planGate
    return handled(withNotes(fixDispatch(state, observations), observations))
  }
  // No plan: the rule a schema-v1 flow has always had, untouched.
  if (state.rounds >= state.max_rounds) return handled(withNotes(escalate(state, observations), observations))
  const gate = dispatchGate(state, observations)
  if (gate) return gate
  return handled(withNotes(fixDispatch(state, observations), observations))
}

function tickFixing(state: FlowState, observations: FlowObservations): FlowDecision {
  if (observations.head === state.claim.head) return hold(state, 'no_new_head')
  if (observations.docs_only_since_claim === true) return reanchor(state, observations.head)
  if (!observations.tree_clean) return hold(state, 'tree_dirty')
  const gate = reviewGate(state, observations)
  if (gate) return gate
  return reviewRequest(state, observations.head, observations.verdict_count, 'review_requested', observations.now, observations.notes_staging_path)
}

// Is this verdict evidence of a review? Both halves are required: enough wall time since the request, and
// either a finding line or an explicit statement that nothing was found — the latter only from a notes
// file, because a pane answer has no room for it and an ACCEPT there is exactly the one-second stamp the
// incident produced. `review_min_seconds = 0` disables only the time half.
function isVerdictSubstantiated(observations: FlowObservations): boolean {
  const policy = observations.evidence_policy ?? DEFAULT_EVIDENCE_POLICY
  const evidence = observations.verdict_evidence
  const elapsedOk = policy.min_seconds <= 0
    || (evidence !== undefined && evidence.elapsed_ms >= policy.min_seconds * 1000)
  // A valid notes *file* carrying an explicit verdict is evidence in itself: a human-readable record the reviewer wrote
  // by hand, not a one-second stamp picked out of a pane. Without the file the older rule stands — enough wall time and at
  // least one finding (or an explicit "nothing to report") — because an ACCEPT typed into a busy pane proves nothing (D8).
  if (observations.verdict_source === 'file') return true
  const notesOk = (evidence?.notes_findings ?? 0) >= 1 || observations.verdict_explicit_clean === true
  return elapsedOk && notesOk
}

function evidenceNumbers(observations: FlowObservations): string {
  const evidence = observations.verdict_evidence
  if (!evidence) return 'elapsed=unknown notes=0 tool=0'
  return `elapsed=${Math.round(evidence.elapsed_ms / 1000)}s notes=${evidence.notes_findings}/${evidence.notes_bytes}b tool=${evidence.pane_tool_lines}`
}

// A verdict the tick refuses to act on. One rejection re-requests the review with a prompt that says what
// was wrong; the next one escalates, because a reviewer that keeps stamping will not start reviewing on
// its own and a human has to look.
function unsubstantiated(state: FlowState, observations: FlowObservations): FlowDecision {
  const policy = observations.evidence_policy ?? DEFAULT_EVIDENCE_POLICY
  const attempts = state.unsubstantiated_attempts + 1
  const detail = evidenceNumbers(observations)
  if (attempts > policy.retries) {
    return {
      ...escalate(state, observations, 'review_unsubstantiated'),
      notes: `the reviewer is not reviewing: ${detail}`,
      log_detail: `the reviewer is not reviewing: ${detail}`,
      next_unsubstantiated_attempts: attempts,
    }
  }
  const retry = reviewRequest(
    state,
    state.claim.head,
    observations.verdict_count,
    'review_unsubstantiated',
    observations.now,
    observations.notes_staging_path,
    true,
  )
  return {
    ...retry,
    // The clock restarts with the new request: the rejected answer must not count as elapsed time.
    next_review_started_at: observations.now,
    notes: `review rejected as unsubstantiated: ${detail}`,
    log_detail: `review rejected as unsubstantiated: ${detail}`,
    next_unsubstantiated_attempts: attempts,
  }
}

// The pane's composer holds text that is not ours. Pasting again would stack onto it — that is how nine
// copies of one prompt ended up in a pane — so the flow stops and a human looks at the pane. The decision
// that would have been dispatched is dropped; nothing was pasted.
export function escalateOnDirtyComposer(state: FlowState, decision: FlowDecision, at = isoNow()): FlowState {
  const stuck: FlowDecision = {
    ...decision,
    kind: 'escalate',
    reason: 'composer_dirty',
    message: undefined,
    target: undefined,
    next_state: 'escalated',
    next_review_started_at: null,
    notes: 'the pane composer holds text that is not ours; nothing was pasted',
    log_detail: 'composer_dirty: the pane composer holds text that is not ours; nothing was pasted',
  }
  return applyDecisionToState(state, stuck, at)
}

// How many Enter-only retries a dispatch gets before a human is asked. Three ticks is about three minutes: enough for a
// composer that swallowed one Enter, short enough that a flow does not sit on a prompt nobody submitted (block 69).
export const MAX_ENTER_RETRIES = 3

// The paste is still in the box and the Enter did not start a turn: no round exists, so the decision is NOT applied — the
// round counter and `review_started_at` stay where they were. The attempt is counted and journalled, the claim is
// released, and the next tick presses Enter without pasting again (`sendWhenIdle` sees the composer holds our text).
export function retryEnterDispatch(state: FlowState, reason: string, at = isoNow()): FlowState {
  const attempt = state.enter_retries + 1
  return {
    ...state,
    pending: null,
    enter_retries: attempt,
    log: appendLog(state, {
      at,
      event: 'dispatch_retry_enter',
      detail: `${reason}: attempt ${attempt}/${MAX_ENTER_RETRIES}`,
    }),
    updated_at: at,
  }
}

// Out of Enter retries: the prompt sits in the pane and nothing submits it, so a human has to press Enter. The flow
// escalates with a reason that says exactly that, and the counter is cleared for whatever comes next.
export function escalateUnconfirmedDispatch(state: FlowState, decision: FlowDecision, at = isoNow()): FlowState {
  const pane = decision.target === 'dev' ? 'dev' : 'review'
  const stuck: FlowDecision = {
    ...decision,
    kind: 'escalate',
    reason: 'review_dispatch_unconfirmed',
    message: undefined,
    target: undefined,
    next_state: 'escalated',
    next_review_started_at: null,
    notes: `the prompt is in the ${pane} pane and ${MAX_ENTER_RETRIES} Enters did not submit it`,
    log_detail: `review_dispatch_unconfirmed: the prompt is in the ${pane} pane and ${MAX_ENTER_RETRIES} Enters did not submit it — press Enter there`,
  }
  const escalated = applyDecisionToState(state, stuck, at)
  return { ...escalated, enter_retries: 0 }
}

// The run (or one of its role agents) is gone: the flow is parked instead of being ticked against
// panes that no longer exist. Parked means parked — a second tick holds, so the reason is written
// once and the log does not fill up with the same line every two seconds (§3.3).
function orphan(state: FlowState, reason: 'run_gone' | 'agents_gone'): FlowDecision {
  return {
    kind: 'orphan',
    reason,
    next_state: 'orphaned',
    next_rounds: state.rounds,
    next_review_started_at: null,
    next_claim: state.claim,
    notes: reason === 'run_gone'
      ? 'the run is no longer in the registry (archived, stopped or swept)'
      : 'one of the run\'s role agents is no longer in the registry',
  }
}

// One step. Pure: it reads its arguments and returns a decision, never a pane, a file or a clock.
export function flowTick(state: FlowState, observations: FlowObservations): FlowDecision {
  if (state.state === 'escalated' || state.state === 'done') return hold(state, 'flow_closed')
  // Parked states are decided before anything is observed for a reason: a paused or orphaned flow
  // must not be ticked into a pane, and its own reason is the answer the caller prints.
  if (state.state === 'paused') return hold(state, 'flow_paused')
  if (state.state === 'orphaned') return hold(state, 'flow_orphaned')
  // A claimed dispatch owns the flow until it settles. This is the rule that makes a cron tick, a
  // manual `flow tick` and a restart of the same process safe to run against one flow: the second
  // caller sees the claim on disk, decides nothing, and pastes nothing. It outranks the orphan
  // check on purpose: a send in flight has to settle (or expire) before the flow is parked.
  if (state.pending) {
    // A claim in flight is not a lock on the world: if the work it asked for has visibly happened — the round's notes
    // file answers, or the pane's verdict counter grew — then the claim is stale, not pending, and the flow settles it
    // from what it can see instead of waiting for a TTL that will escalate work which is already done (D7).
    const byObservation = settleByObservation(state, observations)
    if (byObservation) return byObservation
    if (observations.now - state.pending.at < PENDING_TTL_SEC * 1000) return hold(state, 'dispatch_pending')
    // Past the TTL the claim belongs to a process that is gone, and nobody can tell whether the
    // paste landed. Re-sending blind is how one prompt becomes two, so a human decides.
    return escalate(state, observations, 'dispatch_unresolved')
  }
  // A notes file for a round answers that round, whatever the state and wherever `claim.head` points: this is the first thing
  // a tick settles, before the state machine gets a chance to ask again (block 41).
  const fromNotes = settleFromNotes(state, observations)
  if (fromNotes) return fromNotes
  // An explicit negative from the caller parks the flow; "not looked at" (undefined) does not.
  if (observations.run_present === false) return orphan(state, 'run_gone')
  if (observations.agents_present === false) return orphan(state, 'agents_gone')
  // `reviewing` owns the unreadable-HEAD case itself: a review that was requested still has a
  // deadline, and a repository this tick cannot read must not be able to keep it waiting for ever.
  if (state.state === 'reviewing') return tickReviewing(state, observations)
  if (!observations.head) return hold(state, 'head_unknown')
  if (state.state === 'idle') return tickIdle(state, observations)
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
  if (state.review_started_at !== decision.next_review_started_at) return true
  // A hold that clears a stale `active_plan_item` must reach the disk; otherwise the field survives and blocks the plan for
  // ever, which is the defect the clear exists for. `undefined` means "the decision does not touch the field", `null` means
  // "cleared" — `??` conflated them and hid every clear (block 38, MAJOR 2).
  const nextActive = decision.next_active_plan_item === undefined ? state.active_plan_item : decision.next_active_plan_item
  if (nextActive !== state.active_plan_item) return true
  if (decision.kind === 'dispatch_spec' && decision.spec_id) {
    return !state.dispatched_specs.includes(decision.spec_id)
  }
  return false
}

function logDetail(decision: FlowDecision): string {
  if (decision.log_detail) return decision.log_detail
  const parts: string[] = [decision.reason]
  if (decision.head) parts.push(decision.head)
  if (decision.spec_id) parts.push(decision.spec_id)
  return parts.join(' ')
}

export function appendLogEntries(log: FlowLogEntry[], entry: FlowLogEntry): FlowLogEntry[] {
  return [...log, entry].slice(-FLOW_LOG_LIMIT)
}

export function appendLog(state: FlowState, entry: FlowLogEntry): FlowLogEntry[] {
  return appendLogEntries(state.log, entry)
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
    claim: {
      ...decision.next_claim,
      // A verdict that just arrived is not applied yet; the branch that uses it says so in the same decision. Older
      // decisions that predate the field keep whatever the state had.
      verdict_applied: decision.next_claim_verdict_applied !== undefined
        ? decision.next_claim_verdict_applied
        : (decision.next_claim.verdict !== state.claim.verdict ? false : state.claim.verdict_applied),
    },
    dispatched_specs: dispatched,
    state: options.advance ? decision.next_state : state.state,
    rounds: options.advance ? decision.next_rounds : state.rounds,
    // A dispatch that was not confirmed changes no status, so the review clock keeps running:
    // resetting it would hide a reviewer that never answered.
    review_started_at: options.advance ? decision.next_review_started_at : state.review_started_at,
    // Every settled decision ends the dispatch in flight: the claim exists only for the window
    // between the paste and this write.
    pending: null,
    // A decision that changes anything moved the flow, so no hold survives it: the reason the engine was waiting is
    // gone the moment it acted (block 64). Holds are written by the step that records one, not by this function.
    hold: null,
    // The reason a flow was parked is part of the state, not only of the log: `flow status` reads
    // it, and the log is bounded, so the reason must survive the entry being pushed out.
    orphan_reason: decision.kind === 'orphan' ? (decision.notes ?? null) : state.orphan_reason,
    unsubstantiated_attempts: decision.next_unsubstantiated_attempts ?? state.unsubstantiated_attempts,
    answered_round: decision.next_answered_round === undefined ? state.answered_round : decision.next_answered_round,
    // A verdict is acted on once per commit: set by the branch that used it, dropped as soon as the head moves (the
    // next commit has its own verdict to earn).
    verdict_handled_for: decision.next_verdict_handled_for !== undefined
      ? decision.next_verdict_handled_for
      : (decision.next_claim.head !== state.claim.head ? null : state.verdict_handled_for),
    verdict_handled_item: decision.next_verdict_handled_item !== undefined
      ? decision.next_verdict_handled_item
      : (decision.next_claim.head !== state.claim.head ? null : state.verdict_handled_item),
    active_plan_item: decision.next_active_plan_item === undefined ? state.active_plan_item : decision.next_active_plan_item,
    // A new episode starts when the flow *becomes* escalated, which is exactly when a human has to be told.
    notify_episode: options.advance && state.state !== 'escalated' && decision.next_state === 'escalated'
      ? state.notify_episode + 1
      : state.notify_episode,
    log: [...(decision.extra_events ?? []).reduce<FlowLogEntry[]>(
      (acc, extra) => appendLogEntries(acc, { at, event: extra.event, detail: extra.detail }),
      appendLog(state, {
        at,
        event: options.event,
      detail: options.detail
        ?? [logDetail(decision), decision.notes_invalid ? `notes_invalid ${decision.notes_invalid}` : '']
          .filter(Boolean).join(' '),
      // Only a decision that consumed a round's notes carries these; the text stays out of the journal.
        ...(decision.notes_ref ? { notes_ref: decision.notes_ref } : {}),
        ...(decision.notes_counts ? { notes_counts: decision.notes_counts } : {}),
      })),
    ],
    updated_at: at,
  }
}

export function applyDecisionToState(state: FlowState, decision: FlowDecision, at = isoNow()): FlowState {
  // The engine's own transitions go through the same table as the operator's: an illegal one is a
  // bug to surface, never a file silently describing a state the automaton cannot reach.
  if (decision.next_state !== state.state) assertTransition(state.state, decision.next_state, decision.kind)
  return withDelta(state, decision, at, {
    advance: true,
    event: decision.log_event ?? (decision.kind === 'none'
      ? decision.reason
      : decision.kind === 'orphan' ? 'flow_orphaned' : decision.kind),
  })
}

// The paste landed but the Enter was never confirmed: the work may not have started, so a *fix* round does not
// advance — but the decision is consumed, because pasting the same text twice is how a queued Enter ends up
// answering someone else's prompt. A human reads the log entry.
//
// A review request is the exception, and it is the whole of D1: an unconfirmed request is still a round. The
// reviewer may well be working on the commit we pasted and answers by writing `notes/inbox/<head>-r<N>.md`; a flow
// left in `idle` with `review_started_at === null` never reads that file (the next tick says `head_unchanged`, and
// notes are only read in `reviewing`), so the answer is lost and the work is repeated. Here the transition and the
// clock are applied exactly as a confirmed request would apply them. What is not applied is a second paste: the
// claim is consumed in this write, and the claim is what a paste needs.
export function applyUnconfirmedDispatch(state: FlowState, decision: FlowDecision, reason: string, at = isoNow()): FlowState {
  const unconfirmed = (advance: boolean): FlowState => withDelta(state, decision, at, {
    advance,
    event: 'dispatch_unconfirmed',
    detail: `${reason} ${logDetail(decision)}`,
  })
  if (decision.kind === 'request_review') return unconfirmed(true)
  return unconfirmed(false)
}

export interface PendingClaimInit {
  // Identity of this attempt, generated by the caller — this module never invents one.
  op_id: string
  // Epoch ms of the claim: the clock `PENDING_TTL_SEC` is measured against.
  now: number
  at?: string
}

// Phase one of the dispatch protocol: record the intent before anything is pasted. The caller
// writes the result, so a ticker that dies between the write and the paste leaves a claim behind —
// which the next tick reads as "a send is in flight" instead of repeating it.
export function claimPendingDispatch(state: FlowState, decision: FlowDecision, init: PendingClaimInit): FlowState {
  if (!decision.message || !decision.target) return state
  const at = init.at ?? isoNow()
  return {
    ...state,
    pending: {
      op_id: init.op_id,
      kind: decision.kind,
      target: decision.target,
      head: decision.head ?? null,
      spec_id: decision.spec_id ?? null,
      at: Math.floor(init.now),
      // The baseline belongs to the decision, not to the state it was taken from: `next_claim.verdict_count` is the counter
      // the request is answered against, and it can already be ahead of `state.claim.verdict_count` when a verdict appeared
      // while the tick was deciding. Taking the state's number there would let that older verdict pass for the answer
      // (block 30).
      verdict_baseline: decision.next_claim.verdict_count,
    },
    log: appendLog(state, { at, event: 'dispatch_claimed', detail: logDetail(decision) }),
    updated_at: at,
  }
}

// Phase three, refused before anything was pasted: the decision is dropped and the claim released,
// because nothing was sent and the next tick must be free to decide again. The pane guard re-reads
// the pane on that tick, which is what makes the retry safe.
export function releaseDispatch(state: FlowState, reason: string, at = isoNow()): FlowState {
  return {
    ...state,
    pending: null,
    log: appendLog(state, { at, event: 'dispatch_refused', detail: reason }),
    updated_at: at,
  }
}

export interface FlowOperatorTransition {
  // The status the operator puts the flow into. Validated against FLOW_TRANSITIONS.
  to: FlowStatus
  // Journal event name, e.g. `flow_paused`.
  event: string
  // The command name used in a refusal: `cannot pause a flow in state done`.
  action: string
  detail?: string
  at?: string
  // Fields this transition owns (the pause origin, the close reason, a reset budget).
  patch?: Partial<FlowState>
}

// Pause, resume and stop all funnel through here: the table is the only gate, and the journal entry
// and the dropped claim cannot be forgotten by one of the three commands. Nothing is sent, so there
// is no lock to avoid — the caller holds it around read + this + write.
export function applyOperatorTransition(state: FlowState, init: FlowOperatorTransition): FlowState {
  assertTransition(state.state, init.to, init.action)
  const at = init.at ?? isoNow()
  return {
    ...state,
    ...init.patch,
    state: init.to,
    // A human decision outranks a dispatch in flight: a paused or stopped flow must not carry a
    // claim that would escalate it later, and this call pasted nothing. It also outranks a hold: the operator moved the
    // flow, so whatever the engine was waiting for is no longer the reason it is standing (block 64).
    pending: null,
    hold: null,
    log: appendLog(state, { at, event: init.event, detail: init.detail ?? init.to }),
    updated_at: at,
  }
}
