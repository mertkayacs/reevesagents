// Flow runner: the only module that knows both the engine and the outside world.
//
// `flow.ts` decides, this file looks and acts. Three jobs, in one place so a surface never has to
// remember them:
// - `observeFlow` reads HEAD, the worktree state, both panes and the reviewer's verdict;
// - the dispatch is three phases (§2.4 of docs/flows-design.md) — **claim** (a short runs lock that
//   re-reads the flow, decides and writes the intent), **act** (no lock at all, one guarded paste),
//   **settle** (a short runs lock that writes the outcome). The claim is what makes a cron tick, a
//   manual tick and a restarted process mutually exclusive: the second caller reads a claim on disk
//   and pastes nothing;
// - `stepFlow` composes the three, and is what the CLI calls.
//
// A refused send is never retried blindly: nothing was pasted when the pane was busy or unknown, so
// the claim is released and the next tick decides again from a re-read pane; when the paste did
// land but the Enter was not confirmed, the decision is consumed and logged as
// `dispatch_unconfirmed`, because pasting the same text twice is how a queued Enter ends up
// answering someone else's prompt. A claim nobody settled (the process died mid-send) is left for
// the engine, which escalates it after `PENDING_TTL_SEC` instead of re-sending.

import { randomUUID } from 'node:crypto'
import { statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import type { PaneBusyState } from './activity.js'
import type { EvidencePolicy, FlowDecision, FlowObservations, FlowState, VerdictEvidence } from './flow.js'
import { DEFAULT_EVIDENCE_POLICY } from './flow.js'
import {
  applyDecisionToState,
  applyUnconfirmedDispatch,
  escalateOnDirtyComposer,
  claimPendingDispatch,
  decisionChangesState,
  flowTick,
  releaseDispatch,
} from './flow.js'
import { readFlow, saveFlow } from './flow-store.js'
import {
  durablePath, findingsText, isCommitId, notesRef, pruneClosedFlowNotes, pruneNotes,
  publishNotesIfChanged, readDurable, readStaging, stagingPath, writePaneCapture,
} from './flow-notes.js'
import { withDispatchGate } from './flow-dispatch-gate.js'
import { loadConfig } from './config.js'
import { planExists, readPlan, mutatePlan, closeItemOnAccept, moveItemByEngine, addItemRound } from './plan.js'
import { emitNotification } from './notifications.js'
import { planTickSummary as planSummaryLine, planTickView } from './flow-plan.js'
import type { PlanTickView } from './flow-plan.js'
import { isRunsLockTimeout, readRun, runPath, tryListAgents, withRunsLock } from './runs.js'
import type { AgentRecord, RunRecord } from './types.js'
import { paneBusy, peekAgentRaw, sendWhenIdle } from './runtime.js'
import type { SendOutcome } from './runtime.js'
import { VERDICT_SCAN_LINES, scanVerdict } from './verdict.js'
import type { FlowVerdict } from './verdict.js'

// Everything the engine must not know about. Injected so a test can describe a pane, a commit and
// a reviewer without tmux, git or a nine-second paste settle.
export interface FlowPorts {
  // Argument names stay in the signature for the reader; the base lint rule reports a name in a
  // type-only position as unused, so they carry the allowed `_` prefix (same as elsewhere here).
  paneBusy: (_agentId: string) => PaneBusyState
  // Raw capture: the verdict scan cannot match text that redaction replaced.
  peek: (_agentId: string, _lines: number) => string
  send: (_agentId: string, _text: string) => SendOutcome
}

export const defaultFlowPorts: FlowPorts = {
  paneBusy: agentId => paneBusy(agentId),
  peek: (agentId, lines) => peekAgentRaw(agentId, lines),
  send: (agentId, text) => sendWhenIdle(agentId, text),
}

export function readGitHead(repo: string): string {
  if (!repo) return ''
  try {
    return execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    // Empty, not a throw: an unreadable HEAD is an observation the engine holds on ('head_unknown').
    return ''
  }
}

export function isGitTreeClean(repo: string): boolean {
  if (!repo) return false
  try {
    const status = execFileSync('git', ['-C', repo, 'status', '--porcelain'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return status === ''
  } catch {
    // A repository this process cannot read is not a clean tree; reviewing it would burn a round.
    return false
  }
}

export interface ObserveFlowOptions {
  ports?: FlowPorts
  // Caller-known facts win: a probe or a re-check can pass them instead of shelling out to git.
  head?: string
  tree_clean?: boolean
  // The clock the timeout is measured against; the default is the wall clock.
  now?: number
  // Registry facts, so a test can describe a live or an archived run without one.
  run_present?: boolean
  agents_present?: boolean
  // The state root the notes files live under; defaults to the live one.
  root?: string
  // The evidence policy (`review_min_seconds`, `review_evidence_retries`); defaults to the shipped one.
  evidence_policy?: EvidencePolicy
  // Evidence for this tick, when the caller already knows it. The default measures it from the round.
  verdict_evidence?: VerdictEvidence
  // The plan view, when the caller has already read it. The default reads `flows/<run-id>/plan.json`.
  plan?: PlanTickView | null
  // Read the notes of this round from here instead of disk (a test seam: the pipeline's own tests
  // describe a valid, an invalid and a missing file without writing one).
  notes?: NotesRead
}

// What the caller observed about this round's notes file, in the shape the engine wants.
export interface NotesRead {
  source: 'file' | 'pane'
  // The verdict of the round, when the file answered. It is the answer the reviewer chose to persist.
  verdict?: FlowVerdict
  text?: string
  ref?: string
  counts?: { blocker: number, major: number, minor: number }
  staging_path?: string
  invalid?: string
  raw?: string
}

// Is the flow's run still there, and are both of its role agents still part of it? An archived run
// (`stop`, `delete-run`, the stale sweep) removes the run directory, and a missing role agent means
// the flow would paste into a pane that no longer exists — both park the flow as `orphaned` (§3.3).
//
// Three distinctions matter here, because parking is irreversible from the engine's side:
// - a **missing run file** is a run that is gone (archiving removes the directory);
// - a run file that **exists but cannot be read** is this process failing to see the registry, not a
//   missing run — `readRun` reports both as "Run not found", so existence is checked first and a
//   read failure answers "not seen" (`undefined`), which the engine refuses to treat as absence;
// - an agent that is still on disk but has **ended** is not a live pane, so `ended_at` decides.
function registryPresence(state: FlowState): { run_present?: boolean, agents_present?: boolean } {
  const presence = probeRunFile(runPath(state.run_id))
  if (presence === 'missing') return { run_present: false, agents_present: false }
  // `existsSync` answers `false` for an unreadable directory too, which would turn "cannot see" into
  // "the run is gone". `statSync` keeps the reason, so a permission failure says nothing.
  if (presence === 'unreadable') return {}
  let run: RunRecord
  try {
    run = readRun(state.run_id)
  } catch {
    // The file is there but does not describe a run (damaged JSON, a directory in its place): say
    // nothing rather than park a live pipeline. The pane guard still holds the tick.
    return {}
  }
  if (run.status === 'ended' || run.ended_at !== null) return { run_present: false, agents_present: false }
  // `listAgents` swallows read failures into an empty list, which would read as "the agents are
  // gone". The failure-aware variant is what a parking decision uses.
  const agents = tryListAgents(run.id)
  if (agents === null) return { run_present: true }
  return { run_present: true, agents_present: everyAgentPresent(state, agents) }
}

// Does the run file exist, is it missing, or can this process not tell?
function probeRunFile(path: string): 'present' | 'missing' | 'unreadable' {
  try {
    statSync(path)
    return 'present'
  } catch (err) {
    return (err as { code?: string }).code === 'ENOENT' ? 'missing' : 'unreadable'
  }
}

function everyAgentPresent(state: FlowState, agents: AgentRecord[]): boolean {
  // An ended agent keeps its record in the run directory, so its id alone proves nothing: the flow
  // would wait on a pane that no longer exists. Only a live agent counts.
  const live = new Set(agents.filter(agent => agent.ended_at === null).map(agent => agent.id))
  return [state.roles.dev, state.roles.review].every(id => id !== '' && live.has(id))
}

// The observations a parked flow gets: no git, no tmux, no registry. `flowTick` holds on `paused` and
// `orphaned` before it looks at any of these, which is what "a tick does nothing and observes
// nothing" means in code — a paused flow cannot cost a pane capture or a git call.
export function unobservedFlow(now: number): FlowObservations {
  return {
    now,
    head: '',
    tree_clean: false,
    dev_pane: 'unknown',
    review_pane: 'unknown',
    verdict: null,
    verdict_count: 0,
  }
}

// The round in flight: reviews are numbered from one per flow, and the request that started this one
// used `rounds + 1` (see `reviewRequest` in flow.ts). Reading a different number than the prompt wrote
// would look at the wrong file.
export function reviewRound(state: FlowState): number {
  return state.rounds + 1
}

// Where the notes of the round in flight live. The prompt names the staging path and the journal names
// the durable one; both are derived here so the two can never disagree.
export function roundNotesPaths(state: FlowState, options: { root?: string } = {}): {
  staging: string
  durable: string
  ref: string
} {
  const head = state.claim.head
  const round = reviewRound(state)
  if (!isCommitId(head)) return { staging: '', durable: '', ref: '' }
  return {
    staging: stagingPath(state.run_id, head, round, options.root),
    durable: durablePath(state.run_id, head, round, options.root),
    ref: notesRef(head, round),
  }
}

// The notes of the round in flight, in the order §11.2 states: the staging file first, the pane only
// when the file is missing or unusable. A file that exists but fails validation is reported (so the
// journal can say why) and does not stop the pane fallback.
function readRoundNotes(state: FlowState, options: ObserveFlowOptions, observedHead: string): NotesRead {
  if (options.notes) return options.notes
  const round = reviewRound(state)
  // The prompt names the staging file of the head the review is *requested for* — which is the head this
  // tick observed, not necessarily the claim head (a dev may have moved it). A state whose head is not a
  // commit id can never have a notes file: the name would be unsafe and the prompt never asked for one.
  const requestHead = isCommitId(observedHead)
    ? observedHead.trim()
    : isCommitId(state.claim.head) ? state.claim.head : ''
  const staging = requestHead ? stagingPath(state.run_id, requestHead, round, options.root) : undefined
  // Only the *reading* of an answer is limited to `reviewing`: the path is needed on every tick that
  // might request a review, idle and fixing included.
  if (state.state !== 'reviewing') return { source: 'pane', staging_path: staging }
  const head = state.claim.head
  if (!isCommitId(head)) return { source: 'pane', staging_path: staging }
  // Staging first — it is what the reviewer wrote — then the **durable** record of the same round: once a
  // valid staging file has been published its copy is gone, and every later tick of this round (the ones
  // that held on a busy dev pane) must still see that answer. Without the fallback the round would never
  // be answered and would run into the review timeout. When neither answers, the *staging* verdict stands
  // so the journal reports why the file was unusable rather than a bare "missing".
  const stagingRead = readStaging(state.run_id, head, round, { root: options.root })
  const durableRead = stagingRead.ok ? null : readDurable(state.run_id, head, round, { root: options.root })
  const read = stagingRead.ok ? stagingRead : (durableRead && durableRead.ok ? durableRead : stagingRead)
  if (read.ok) {
    return {
      source: 'file',
      verdict: read.verdict,
      text: findingsText(read.text),
      ref: notesRef(head, round),
      counts: read.counts,
      staging_path: staging,
      // Only a staging text is published later; a durable one is already the record.
      raw: stagingRead.ok ? read.text : undefined,
    }
  }
  return {
    source: 'pane',
    staging_path: staging,
    // `missing` is the ordinary case (no file written yet); anything else is worth a journal line.
    invalid: read.reason === 'missing' ? undefined : read.reason,
  }
}

// Is the verdict this tick sees backed by a review? Three numbers, and the notes are the strongest: a
// reviewer that read the diff names findings, and a one-second answer names none. The pane's tool lines are
// a support signal only — providers format their ledgers differently — so nothing depends on them alone.
const TOOL_LINE_PATTERN = /^(?:\s*[│|]?\s*[●◦•·]\s|\s*[│|]\s*(?:run|exec|shell|read|write|edit|grep|search)\b)|\bexec_command\b|\brun_shell\b/i

export function measureEvidence(state: FlowState, observations: FlowObservations): VerdictEvidence {
  const elapsed = state.review_started_at === null ? 0 : Math.max(0, observations.now - state.review_started_at)
  // The findings can come from either channel: the notes file when it answered, and the pane's scraped
  // finding lines when it did not. Counting only the file would reject a reviewer that named three MAJORs
  // in the pane — "no evidence" is not the same as "no notes file".
  const findingsSource = observations.notes_text ?? observations.verdict_notes ?? ''
  const paneText = observations.pane_text ?? ''
  return {
    elapsed_ms: elapsed,
    notes_bytes: Buffer.byteLength(findingsSource, 'utf-8'),
    notes_findings: findingsSource
      ? findingsSource.split('\n').filter(line => /^(BLOCKER|MAJOR|MINOR)\b/.test(line.trim())).length
      : 0,
    pane_tool_lines: paneText.split('\n').filter(line => TOOL_LINE_PATTERN.test(line)).length,
  }
}

// `review_min_seconds` / `review_evidence_retries` are product policy from the global config.
function evidencePolicy(): EvidencePolicy {
  try {
    const global = loadConfig().global
    return {
      min_seconds: global.review_min_seconds ?? DEFAULT_EVIDENCE_POLICY.min_seconds,
      retries: global.review_evidence_retries ?? DEFAULT_EVIDENCE_POLICY.retries,
    }
  } catch {
    return DEFAULT_EVIDENCE_POLICY
  }
}

// An **absent** plan means "no plan" and the flow behaves as it did before plans existed. A plan that is present
// but unreadable is a different thing entirely: swallowing the error would make the ACCEPT path take the legacy
// branch and close the flow with items still open, which is the one outcome the plan exists to prevent. So the
// error is raised, the tick writes nothing, and the operator fixes the file.
export function readPlanView(state: FlowState): PlanTickView | null {
  if (!planExists(state.run_id)) return null
  const plan = readPlan(state.run_id)   // throws PlanError for a damaged file, which `stepFlow` surfaces
  return planTickView(plan, { perItem: state.max_rounds, total: state.max_total_rounds })
}

// Apply what the decision asked the plan to record. Runs after the flow state is saved, and is idempotent in
// the parts that matter: closing an item that is already closed and moving a status that is already set are
// both no-ops.
function applyPlanDecision(before: FlowState, observations: FlowObservations, decision: FlowDecision): void {
  if (!observations.plan) return
  const activeId = before.active_plan_item
  const close = decision.next_plan_close
  const status = decision.next_plan_status
  const fixRound = decision.kind === 'dispatch_fix' && activeId !== null
  const started = decision.reason === 'plan_item_dispatched' || decision.kind === 'dispatch_spec'
  const reviewStarted = decision.kind === 'request_review' && activeId !== null
  if (!close && !status && !fixRound && !started && !reviewStarted) return

  try {
    mutatePlan(before.run_id, current => {
      if (!current) return { plan: null, value: null }
      let next = current
      if (close) {
        emitNotification({
          kind: 'plan.item_done',
          title: `plan item ${close.id} done`,
          detail: `closed by ${close.head} after ${close.rounds} round${close.rounds === 1 ? '' : 's'}${close.notes_ref ? ` · notes ${close.notes_ref}` : ''}`,
          run_id: before.run_id,
          project: projectOfRepo(before.repo),
          source: 'product',
          dedupe_key: `${before.flow_id}:plan.item_done:${close.id}:${close.head}`,
        })
        next = closeItemOnAccept(next, {
          id: close.id,
          head: close.head,
          rounds: close.rounds,
          notes_ref: close.notes_ref,
          now: Date.now(),
        })
      }
      if (status) {
        if (status.status === 'blocked_owner') {
          emitNotification({
            kind: 'plan.item_blocked',
            title: `plan item ${status.id} blocked`,
            detail: status.block_reason ?? 'blocked_owner',
            run_id: before.run_id,
            project: projectOfRepo(before.repo),
            source: 'product',
            dedupe_key: `${before.flow_id}:plan.item_blocked:${status.id}:${before.notify_episode}`,
          })
        }
        next = moveItemByEngine(next, {
          id: status.id,
          status: status.status,
          block_reason: status.block_reason ?? null,
          now: Date.now(),
        })
      }
      if (fixRound) next = addItemRound(next, activeId, Date.now())
      if (started && decision.next_active_plan_item) {
        next = moveItemByEngine(next, { id: decision.next_active_plan_item, status: 'in_work', now: Date.now() })
      }
      if (reviewStarted) {
        next = moveItemByEngine(next, { id: activeId, status: 'reviewing', now: Date.now() })
      }
      return { plan: next === current ? null : next, value: null }
    })
  } catch {
    // The plan is a mirror, not the engine's state: a failure here must not undo a saved decision. The next
    // tick re-reads the file and acts on what it finds.
  }
}

// A flow event exists iff the badge would show a warning (§2.2): the same decision that escalated the flow writes
// the notification, with a key that survives a retry and a `--replace` (§ `flow_id`).
function emitFlowAttention(state: FlowState, decision: FlowDecision): void {
  // The state is the authority, not the decision's kind: a `composer_dirty` escalation is a `dispatch_spec`
  // decision that ended in `escalated`, and gating on `kind` silently dropped exactly that case. The dedupe key
  // carries the episode, so a later tick that still sees `escalated` does not duplicate the row.
  const escalated = decision.kind === 'escalate' || state.state === 'escalated'
  if (!escalated) return
  const reason = decision.kind === 'escalate' ? decision.reason : (state.log.at(-1)?.detail ?? 'escalated')
  const kind = reason.startsWith('review_timeout') ? 'flow.review_timeout' : 'flow.escalated'
  const parts = state.repo.split(/[\\/]+/).filter(Boolean)
  emitNotification({
    kind,
    title: kind === 'flow.review_timeout'
      ? `review timed out on ${state.run_id}`
      : `flow escalated on ${state.run_id}`,
    detail: `reason ${reason} · round ${state.rounds}/${state.max_rounds} · ${planTickSummaryOf(state)}`,
    run_id: state.run_id,
    project: parts.length > 0 ? parts[parts.length - 1]!.slice(0, 64) : '',
    source: 'product',
    dedupe_key: `${state.flow_id}:${kind}:${state.notify_episode}`,
  })
}

function projectOfRepo(repo: string): string {
  const parts = repo.split(/[\\/]+/).filter(Boolean)
  return parts.length > 0 ? parts[parts.length - 1]!.slice(0, 64) : ''
}

function planTickSummaryOf(state: FlowState): string {
  try {
    const view = readPlanView(state)
    return view ? planSummaryLine(view) : 'no plan'
  } catch {
    return 'plan unreadable'
  }
}

const EXPLICIT_CLEAN_PATTERN = /(?:no findings|nothing to report|nothing found|замечаний нет|нет замечаний)/i

function observations_explicit_clean(text: string): boolean {
  return EXPLICIT_CLEAN_PATTERN.test(text)
}

export function observeFlow(state: FlowState, options: ObserveFlowOptions = {}): FlowObservations {
  const ports = options.ports ?? defaultFlowPorts
  const head = options.head ?? readGitHead(state.repo)
  const treeClean = options.tree_clean ?? isGitTreeClean(state.repo)
  const devPane: PaneBusyState = state.roles.dev ? ports.paneBusy(state.roles.dev) : 'unknown'
  const reviewPane: PaneBusyState = state.roles.review ? ports.paneBusy(state.roles.review) : 'unknown'
  const paneText = reviewPane === 'unknown' ? '' : ports.peek(state.roles.review, VERDICT_SCAN_LINES)
  // An unreadable reviewer pane carries no verdict evidence at all: report "no verdict" and let
  // the engine hold on `review_pane_unknown` instead of reading a failed capture as zero verdicts.
  const scan = reviewPane === 'unknown'
    ? { count: 0, last: null, notes: '' }
    : scanVerdict(paneText)
  const presence = options.run_present === undefined || options.agents_present === undefined
    ? registryPresence(state)
    : { run_present: options.run_present, agents_present: options.agents_present }
  const notes = readRoundNotes(state, options, head)
  // The file wins when it is valid: it is the answer the reviewer chose to persist, and it is bound to
  // this round. The pane count is still reported so the baseline keeps working for the pane path.
  const fromFile = notes.source === 'file' && notes.text !== undefined
  const observations: FlowObservations = {
    now: options.now ?? Date.now(),
    head,
    tree_clean: treeClean,
    dev_pane: devPane,
    review_pane: reviewPane,
    verdict: fromFile ? (notes.verdict ?? null) : scan.last,
    verdict_count: scan.count,
    verdict_notes: fromFile ? notes.text : scan.notes,
    run_present: options.run_present ?? presence.run_present,
    agents_present: options.agents_present ?? presence.agents_present,
    verdict_source: fromFile ? 'file' : 'pane',
    // "Nothing to report" is evidence only when the reviewer chose to say it in the record: a bare
    // ACCEPT in a pane is exactly the one-second stamp the evidence rule rejects.
    // The phrase lives in the file body, not in the finding lines: `notes.raw` is the whole staging text.
    verdict_explicit_clean: fromFile && observations_explicit_clean(notes.raw ?? notes.text ?? ''),
    notes_text: fromFile ? notes.text : undefined,
    notes_ref: fromFile ? notes.ref : undefined,
    notes_counts: fromFile ? notes.counts : undefined,
    notes_invalid: fromFile ? undefined : notes.invalid,
    notes_raw: fromFile ? notes.raw : undefined,
    notes_staging_path: notes.staging_path,
    pane_text: reviewPane === 'unknown' ? undefined : paneText,
    evidence_policy: options.evidence_policy ?? evidencePolicy(),
    // The plan owns the queue only when it exists: a flow without one keeps `state.specs`, which is what
    // schema-v1 flows have always used.
    plan: options.plan === null ? undefined : (options.plan ?? readPlanView(state) ?? undefined),
  }
  // The evidence is measured on the finished observation: it needs the notes text and the capture, so it
  // cannot be built before them. A caller that has already measured it (the flow's own tests) passes it.
  observations.verdict_evidence = options.verdict_evidence ?? measureEvidence(state, observations)
  return observations
}

// What one step did. The statuses name the four outcomes a caller has to distinguish, because they
// need different reactions: nothing happened, it worked, a pane refused (retry), or a paste landed
// without its submit (a human looks).
export type FlowApplyStatus =
  | 'applied'
  | 'skipped'
  | 'refused'
  | 'unconfirmed'
  | 'locked'
  // A claim was taken and then dropped before the paste: `flow pause` or `flow stop` landed in
  // between, so nothing was sent and nothing was applied.
  | 'cancelled'

export interface FlowStepResult {
  observations: FlowObservations
  decision: FlowDecision
  status: FlowApplyStatus
  // Present whenever a send was attempted, so a caller can report the exact refusal.
  send?: SendOutcome
  // The state on disk after the call. Equal to the input state when nothing was written.
  state: FlowState
  path?: string
}

export interface StepFlowOptions extends ObserveFlowOptions {
  root?: string
  // Timestamp written into the log; the clock the engine measures a timeout against is `now`
  // (epoch ms).
  at?: string
  // Observe and decide, then print: nothing is sent and nothing is written.
  dryRun?: boolean
  // Called once the claim is on disk and before the paste. A surface can render "dispatching" from
  // it, and a test uses it to interleave a control command with the exact race it guards against.
  onClaimed?: (_state: FlowState) => void
  // How long to wait for the dispatch gate. A test shortens it to prove that a control command
  // cannot slip into the act; production uses the default.
  gate_timeout_ms?: number
}

interface ClaimedDispatch {
  op_id: string
  agent: string
  message: string
  // The state as written by the claim, i.e. the file contents while the paste is in flight.
  state: FlowState
  path: string
}

interface ClaimPhaseResult {
  // The state the decision was computed from.
  state: FlowState
  decision: FlowDecision
  // Set when the decision sends something: the claim is already on disk when we get here.
  dispatch: ClaimedDispatch | null
  // Set when the decision sends nothing but still changes the state (an escalation, a timer stamp).
  settled: { state: FlowState, path: string } | null
}

interface SettlePhaseResult {
  state: FlowState
  status: FlowApplyStatus
  path?: string
}

// What the act phase produced. `cancelled` means a control command got there first (nothing was
// pasted); `settle-locked` means the paste landed but its outcome could not be written.
type ActResult =
  | { kind: 'cancelled', state: FlowState, path?: string }
  | { kind: 'settle-locked', send: SendOutcome, state: FlowState, path?: string }
  | { kind: 'settled', send: SendOutcome, status: FlowApplyStatus, state: FlowState, path?: string }

// The runs lock is the one lock in this state tree (§2.4): a second implementation over the same
// files is how ordering bugs are born. It is not reentrant and it gives up after a few seconds, so
// it is held only around pure file work — never around a send, which takes that same lock itself.
function withStateLock<T>(fn: () => T): { locked: true } | { locked: false, value: T } {
  try {
    return { locked: false, value: withRunsLock(fn) }
  } catch (err) {
    // A timeout means another process is writing the state tree right now. Nothing was sent and
    // nothing was written, which is the honest answer; the next tick picks the work up.
    if (isRunsLockTimeout(err)) return { locked: true }
    throw err
  }
}

// A parked flow is decided from the file alone: `paused` and `orphaned` hold, so observing would
// only cost a git call, two pane captures and a verdict scan to reach the same answer.
function isParked(state: FlowState): boolean {
  return state.state === 'paused' || state.state === 'orphaned'
}


// The capture is written on every reviewing tick: it is the fallback evidence for a round whose file never
// appears or never validates, so it cannot wait for a decision.
function writeRoundCapture(state: FlowState, observations: FlowObservations, options: StepFlowOptions): void {
  if (state.state !== 'reviewing') return
  const head = state.claim.head
  if (!head || !isCommitId(head) || observations.pane_text === undefined) return
  try {
    writePaneCapture(state.run_id, head, reviewRound(state), observations.pane_text, { root: options.root })
  } catch {
    // Evidence, not state: a failure here must not stop the tick that decides.
  }
}

// The durable record is published only when this tick **accepted** the round's answer. Publishing before
// the decision was a bug: a valid but unsubstantiated answer (too fast) was recorded and its staging file
// removed, so the reviewer's second, real answer had nowhere to go — the re-request reuses the same
// (head, round), the durable file already existed and `flow notes` kept showing the rejected text.
function publishRoundNotes(
  state: FlowState,
  observations: FlowObservations,
  decision: FlowDecision,
  options: StepFlowOptions,
): void {
  if (state.state !== 'reviewing') return
  const head = state.claim.head
  if (!head || !isCommitId(head)) return
  if (observations.notes_raw === undefined) return          // the answer came from the pane
  if (decision.reason === 'review_unsubstantiated') return  // the answer was rejected
  try {
    publishNotesIfChanged(state.run_id, head, reviewRound(state), observations.notes_raw, { root: options.root })
    pruneNotes(state.run_id, { root: options.root })
  } catch {
    // A publish failure leaves the staging file where the next tick finds it.
  }
}

// A closed flow has no next round: keep the newest round as the evidence a human reads and drop the
// rest. Runs on the tick that closes the flow and again on every later tick (cheap and idempotent).
function pruneClosedNotes(state: FlowState, options: StepFlowOptions): void {
  if (state.state !== 'done' && state.state !== 'escalated' && state.state !== 'orphaned') return
  try {
    pruneClosedFlowNotes(state.run_id, { root: options.root })
  } catch {
    // Retention is housekeeping; it must never fail a tick.
  }
}

// One engine step: claim, act, settle.
export function stepFlow(runId: string, options: StepFlowOptions = {}): FlowStepResult {
  const ports = options.ports ?? defaultFlowPorts
  const at = options.at ?? new Date().toISOString()
  const now = options.now ?? Date.now()

  if (options.dryRun === true) {
    const state = readFlow(runId, { root: options.root })
    const observations = isParked(state) ? unobservedFlow(now) : observeFlow(state, options)
    return { observations, decision: flowTick(state, observations), status: 'skipped', state }
  }

  // Observation stays outside the lock: it shells out to git and tmux, and only the state read, the
  // decision and the write have to be atomic with each other.
  const before = readFlow(runId, { root: options.root })
  const observations = isParked(before) ? unobservedFlow(now) : observeFlow(before, options)
  if (!isParked(before)) {
    writeRoundCapture(before, observations, options)
    pruneClosedNotes(before, options)
  }

  // Phase one — claim. Re-reading inside the lock is what makes two tickers safe: the decision comes
  // from the file as it is now, so the second ticker sees the first one's claim and holds.
  const claim = withStateLock<ClaimPhaseResult>(() => {
    const state = readFlow(runId, { root: options.root })
    const decision = flowTick(state, observations)
    if (!decisionChangesState(state, decision)) return { state, decision, dispatch: null, settled: null }
    const { message, target } = decision
    if (!message || !target) {
      const next = applyDecisionToState(state, decision, at)
      const path = saveFlow(next, { root: options.root })
      return { state, decision, dispatch: null, settled: { state: next, path } }
    }
    const opId = randomUUID()
    const claimed = claimPendingDispatch(state, decision, { op_id: opId, now, at })
    return {
      state,
      decision,
      dispatch: {
        op_id: opId,
        agent: state.roles[target],
        message,
        state: claimed,
        path: saveFlow(claimed, { root: options.root }),
      },
      settled: null,
    }
  })

  if (claim.locked) {
    // Still print a decision: it is what the tick would have done, and the caller asked for it.
    return { observations, decision: flowTick(before, observations), status: 'locked', state: before }
  }

  const phase = claim.value
  const { dispatch } = phase
  if (!dispatch) {
    // Outside the runs lock: `mutatePlan` takes it itself, and it is not reentrant. Unconditional, because a
    // decision that holds the flow can still move the plan (an accepted verdict closes its item, a spent
    // budget blocks one) — and `decisionChangesState` only looks at the flow's own fields.
    applyPlanDecision(before, observations, phase.decision)
    emitFlowAttention(phase.settled?.state ?? before, phase.decision)
    if (phase.settled) {
      publishRoundNotes(before, observations, phase.decision, options)
      pruneClosedNotes(phase.settled.state, options)
    }
    return {
      observations,
      decision: phase.decision,
      status: phase.settled ? 'applied' : 'skipped',
      state: phase.settled?.state ?? phase.state,
      path: phase.settled?.path,
    }
  }

  // Phase two — act, inside the dispatch gate and outside the runs lock (`sendWhenIdle` takes that
  // lock itself). The gate is what makes "the operator paused the flow" and "this prompt is being
  // typed" mutually exclusive: `pause` and `stop` take the same gate, so they land either before the
  // claim re-check below or after the settle — never between them, which is the race a check-then-act
  // alone cannot close.
  options.onClaimed?.(dispatch.state)
  const act = withDispatchGate<ActResult>(() => {
    const current = readFlow(runId, { root: options.root })
    if (current.pending?.op_id !== dispatch.op_id) return { kind: 'cancelled', state: current }
    if (current.state === 'paused' || current.state === 'orphaned' || current.state === 'done') {
      // Our claim survived but the flow was parked: release it so a later resume cannot inherit a
      // send that never happened, and leave the reason in the journal.
      const released = releaseDispatch(current, `flow is ${current.state}`, at)
      return { kind: 'cancelled', state: released, path: saveFlow(released, { root: options.root }) }
    }

    // The paste itself, still inside the gate: no state lock is held here, so `sendWhenIdle` can
    // take the runs lock on its own.
    const send = ports.send(dispatch.agent, dispatch.message)

    // Phase three — settle, and only for our own claim: a claim that someone else already settled
    // must not be applied twice. Kept inside the gate so a control command waits for the outcome
    // instead of reading a half-finished dispatch.
    const settle = withStateLock<SettlePhaseResult>(() => {
      const after = readFlow(runId, { root: options.root })
      if (after.pending?.op_id !== dispatch.op_id) return { state: after, status: 'skipped' }
      if (send.sent) {
        const next = applyDecisionToState(after, phase.decision, at)
        const path = saveFlow(next, { root: options.root })
        return { state: next, status: 'applied', path }
      }
      if (send.reason === 'composer_dirty') {
        // Somebody else's text is sitting in the composer: nothing was pasted, and repeating the paste is
        // the one answer that makes it worse. A human reads the pane.
        // Saved like every other settled decision: an escalation that is computed but never written is an
        // escalation nobody sees, and the next tick would re-decide it from a state that says otherwise.
        const escalated = escalateOnDirtyComposer(after, phase.decision, at)
        return { state: escalated, status: 'unconfirmed', path: saveFlow(escalated, { root: options.root }) }
      }
      if (send.reason === 'pane_changed' || send.reason === 'unconfirmed') {
        // The text is in the input box but the submit was not confirmed. Consume the decision so the
        // same text is never pasted twice; the status stays put and the log says why.
        const stuck = applyUnconfirmedDispatch(after, phase.decision, send.reason, at)
        return { state: stuck, status: 'unconfirmed', path: saveFlow(stuck, { root: options.root }) }
      }
      // Nothing was pasted (busy, unknown, stale pane, headless): release the claim and leave the
      // status alone, so the next tick retries once the pane is free.
      const released = releaseDispatch(after, send.reason, at)
      return { state: released, status: 'refused', path: saveFlow(released, { root: options.root }) }
    })

    if (settle.locked) return { kind: 'settle-locked', send, state: dispatch.state, path: dispatch.path }
    return {
      kind: 'settled',
      send,
      status: settle.value.status,
      state: settle.value.state,
      path: settle.value.path ?? dispatch.path,
    }
  }, { root: options.root, timeoutMs: options.gate_timeout_ms })

  if (!act.acquired) {
    // A control command (or a stuck sender) held the gate for the whole timeout: nothing was pasted.
    // Release our claim so the next tick starts clean instead of escalating a send that never
    // happened — unless the claim is already someone else's, in which case this tick owns nothing.
    const freed = withStateLock<SettlePhaseResult>(() => {
      const current = readFlow(runId, { root: options.root })
      if (current.pending?.op_id !== dispatch.op_id) return { state: current, status: 'locked' }
      const released = releaseDispatch(current, 'dispatch gate busy', at)
      return { state: released, status: 'locked', path: saveFlow(released, { root: options.root }) }
    })
    return {
      observations,
      decision: phase.decision,
      status: 'locked',
      state: freed.locked ? dispatch.state : freed.value.state,
      path: freed.locked ? dispatch.path : freed.value.path,
    }
  }

  const done = act.value
  if (done.kind === 'cancelled') {
    return { observations, decision: phase.decision, status: 'cancelled', state: done.state, path: done.path }
  }
  if (done.kind === 'settle-locked') {
    // The paste happened but its outcome could not be written: the claim stays behind and the engine
    // escalates it after the TTL. A human has to read that one, so it is reported as such.
    return {
      observations,
      decision: phase.decision,
      status: 'unconfirmed',
      send: done.send,
      state: done.state,
      path: done.path,
    }
  }
  // The settle is where an answer becomes the flow's state: publish its record only when this tick did not
  // reject it. A refused send leaves the round open for a retry, so nothing is recorded yet.
  if (done.status === 'applied') applyPlanDecision(before, observations, phase.decision)
  // Not only `applied`: `composer_dirty` escalates the flow and reports `unconfirmed`, and an escalation the human
  // is never told about is the one failure this journal exists to prevent.
  emitFlowAttention(done.state, phase.decision)
  if (done.status === 'applied') publishRoundNotes(before, observations, phase.decision, options)
  pruneClosedNotes(done.state, options)
  return {
    observations,
    decision: phase.decision,
    status: done.status,
    send: done.send,
    state: done.state,
    path: done.path,
  }
}
