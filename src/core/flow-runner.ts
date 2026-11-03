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
import type { EvidencePolicy, FlowDecision, FlowHold, FlowLogEntry, FlowObservations, FlowState, VerdictEvidence } from './flow.js'
import { DEFAULT_EVIDENCE_POLICY } from './flow.js'
import {
  FLOW_LOG_LIMIT,
  MAX_ENTER_RETRIES,
  appendLog,
  applyDecisionToState,
  applyUnconfirmedDispatch,
  escalateOnDirtyComposer,
  escalateUnconfirmedDispatch,
  claimPendingDispatch,
  decisionChangesState,
  flowTick,
  releaseDispatch,
  retryEnterDispatch,
} from './flow.js'
import { readFlow, saveFlow } from './flow-store.js'
import {
  countFindings, durablePath, ensureNotesInbox, findingsText, isCommitId, notesRef, pruneClosedFlowNotes, pruneNotes,
  publishNotesIfChanged, readDurable, readNewestNotes, readStaging, stagingPath, writePaneCapture,
} from './flow-notes.js'
import { withDispatchGate } from './flow-dispatch-gate.js'
import { loadConfig } from './config.js'
import { planExists, readPlan, mutatePlan, closeItemOnAccept, moveItemByEngine, addItemRound, PLAN_LIMITS } from './plan.js'
import { applyPlanMarks } from './plan-mark.js'
import { emitNotification } from './notifications.js'
import { raiseEscalationApproval } from './flow-escalation.js'
import { planTickSummary as planSummaryLine, planTickView } from './flow-plan.js'
import type { PlanTickView } from './flow-plan.js'
import { isRunsLockTimeout, readRun, runPath, tryListAgents, withRunsLock } from './runs.js'
import type { AgentRecord, RunRecord } from './types.js'
import { paneBusy, paneDiagnosis, peekAgentRaw, sendWhenIdle } from './runtime.js'
import type { SendOutcome } from './runtime.js'
import { VERDICT_SCAN_LINES, scanVerdict } from './verdict.js'
import type { FlowVerdict } from './verdict.js'

// Everything the engine must not know about. Injected so a test can describe a pane, a commit and
// a reviewer without tmux, git or a nine-second paste settle.
// What the flow knows about a paste it already made and has not had confirmed. It travels with the send because a
// scheduled tick is a new process: `sendWhenIdle`'s own paste map is empty there, and this record is the evidence that a
// collapsed `[Pasted Content N chars]` marker is ours (block 69, review round 2).
export interface DispatchSendOptions {
  pasted?: { at: number } | null
}

export interface FlowPorts {
  // Argument names stay in the signature for the reader; the base lint rule reports a name in a
  // type-only position as unused, so they carry the allowed `_` prefix (same as elsewhere here).
  paneBusy: (_agentId: string) => PaneBusyState
  // Raw capture: the verdict scan cannot match text that redaction replaced.
  peek: (_agentId: string, _lines: number) => string
  send: (_agentId: string, _text: string, _options?: DispatchSendOptions) => SendOutcome
  // Why a pane was last read as it was ('composer_not_found', 'footer_absent', …). Optional: a test that only cares about
  // the state can leave it out, and the hold then reports the state alone (block 73).
  paneDiagnosis?: (_agentId: string) => string | null
}

export const defaultFlowPorts: FlowPorts = {
  paneBusy: agentId => paneBusy(agentId),
  peek: (agentId, lines) => peekAgentRaw(agentId, lines),
  send: (agentId, text, options) => sendWhenIdle(agentId, text, { pasted: options?.pasted ?? null }),
  paneDiagnosis: agentId => paneDiagnosis(agentId),
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

// Which files the commits between two heads touched. Used to tell the dev's work from the plan and its briefs, which are
// documents about the work: a commit that only changes those is not progress a reviewer should be asked to read
// (block 22, D6 — on the sandbox the flow sent the reviewer after the plan document instead of the item).
export function changedPathsBetween(repo: string, from: string, to: string): string[] | null {
  if (!repo || !isCommitId(from) || !isCommitId(to) || from === to) return []
  try {
    return execFileSync('git', ['-C', repo, 'diff', '--name-only', `${from}..${to}`], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).split('\n').map(line => line.trim()).filter(Boolean)
  } catch {
    // Unreadable history is not "documents": the caller falls back to reviewing, which is the safe side.
    return null
  }
}

// The paths that hold the plan and the briefs of a flow: the imported document, the brief directory, and the mirror.
function documentationPaths(state: FlowState): string[] {
  const paths = ['docs/briefs/']
  try {
    const plan = readPlan(state.run_id)
    if (plan) paths.push(plan.source_path)
  } catch {
    // A damaged plan does not make a commit a document commit.
  }
  return paths
}

// Is every path this commit range touched documentation? `null`/`[]` answers mean "cannot tell", which the caller treats
// as work.
export function docsOnlySince(state: FlowState, head: string): boolean | null {
  if (state.state === 'done') return null
  const changed = changedPathsBetween(state.repo, state.claim.head, head)
  // `null` is "cannot tell" and must stay `null`: collapsing it into `false` made an unreadable range look like an answer, and a caller
  // that anchors on anything but `true` (`resume`) treated it as documentation and ate the commit (block 57, MAJOR).
  if (changed === null) return null
  if (changed.length === 0) return false
  const docs = documentationPaths(state)
  return changed.every(path => docs.some(prefix => path === prefix || path.startsWith(prefix)))
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
  // Caller-known: a test or a probe can state whether the commits since the claim touched only documents.
  docs_only_since_claim?: boolean
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
  // Which commit the file belongs to: the head the review was requested for, which need not be `claim.head`.
  head?: string
  // The verdict of the round, when the file answered. It is the answer the reviewer chose to persist.
  verdict?: FlowVerdict
  text?: string
  ref?: string
  counts?: { blocker: number, major: number, minor: number }
  staging_path?: string
  invalid?: string
  raw?: string
  // The whole text of the round's file (staging or durable), before the finding lines are filtered out. Evidence is
  // measured on this: a 16-byte `VERDICT: ACCEPT` with «no findings» is a substantiated answer, and counting only
  // its finding lines reported `notes=0/0b` for a file that was right there (D3).
  evidence_text?: string
  // The round of the file that answered, when it was found by the head rather than by the round this tick computed.
  round?: number
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
  // The prompt names a file inside `notes/inbox`, so the directory has to exist before the prompt is pasted: a
  // `flow start --replace` removes the whole notes directory, and a reviewer whose answer has nowhere to go is a round
  // nobody can read (block 69).
  ensureNotesInbox(state.run_id, options.root)
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
  // The prompt names a file inside `notes/inbox`, so the directory has to exist before the review is requested: a
  // `flow start --replace` removes the whole notes directory, and a reviewer whose answer has nowhere to go is a round
  // nobody can read (block 69).
  if (requestHead) ensureNotesInbox(state.run_id, options.root)
  // Reading an answer is not limited to `reviewing`, and not limited to the claim's head either. Two live runs showed both
  // halves of that: one had already returned to `idle` with the file written for the commit it had reviewed, the other sat on
  // the right head with the file beside it — in both, the answer existed and nothing looked. The file is the source of truth
  // for its round; the state and `claim.head` are bookkeeping around it (block 41).
  const pendingReview = state.pending?.kind === 'request_review' ? state.pending : null
  const head = [pendingReview?.head, observedHead, state.claim.head]
    .map(candidate => (typeof candidate === 'string' ? candidate.trim() : ''))
    .find(candidate => isCommitId(candidate)) ?? ''
  if (!isCommitId(head)) return { source: 'pane', staging_path: staging }
  // Staging first — it is what the reviewer wrote — then the **durable** record of the same round: once a
  // valid staging file has been published its copy is gone, and every later tick of this round (the ones
  // that held on a busy dev pane) must still see that answer. Without the fallback the round would never
  // be answered and would run into the review timeout. When neither answers, the *staging* verdict stands
  // so the journal reports why the file was unusable rather than a bare "missing".
  const stagingRead = readStaging(state.run_id, head, round, { root: options.root })
  const durableRead = stagingRead.ok ? null : readDurable(state.run_id, head, round, { root: options.root })
  const exact = stagingRead.ok ? stagingRead : (durableRead && durableRead.ok ? durableRead : stagingRead)
  // The commit is the binding, not the counter. The round above is derived from `state.rounds`, and that number moves
  // without a review happening (a phantom fix, an operator's retry) — the answer then sits in `<head>-r<earlier>.md`
  // while this tick looks at a later number and finds nothing, so the verdict exists on disk and the flow never reads it
  // (block 69, the live 6f25848). When the exact round has no file, the head's newest one answers instead.
  const newest = exact.ok || exact.reason !== 'missing'
    ? null
    : readNewestNotes(state.run_id, head, { root: options.root })
  const found = stagingRead.ok
    ? { text: stagingRead.text, verdict: stagingRead.verdict, counts: stagingRead.counts, round, publishable: true }
    : durableRead?.ok
      ? { text: durableRead.text, verdict: durableRead.verdict, counts: durableRead.counts, round, publishable: false }
      : newest?.ok && newest.round !== undefined
        ? {
          text: newest.text ?? '',
          verdict: newest.verdict as FlowVerdict,
          counts: newest.counts ?? countFindings(newest.text ?? ''),
          round: newest.round,
          publishable: newest.source === 'staging',
        }
        : null
  if (found) {
    return {
      source: 'file',
      verdict: found.verdict,
      text: findingsText(found.text),
      ref: notesRef(head, found.round),
      counts: found.counts,
      staging_path: staging,
      head,
      evidence_text: found.text,
      // Only a staging text is published later; a durable one is already the record.
      raw: found.publishable ? found.text : undefined,
      round: found.round,
    }
  }
  // `missing` is the ordinary case (no file written yet); anything else is worth a journal line — including a file of
  // this head that exists but cannot be read (the head-scoped attempt's reason when it found one).
  const exactReason = 'reason' in exact ? exact.reason : undefined
  const invalid = exactReason === undefined || exactReason === 'missing'
    ? (newest !== null && !newest.ok && newest.reason !== 'missing' ? newest.reason : undefined)
    : exactReason
  return {
    source: 'pane',
    staging_path: staging,
    ...(invalid === undefined ? {} : { invalid }),
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
// The plan's conflict list, for the guards that must report a historical inconsistency only once.
function readPlanConflicts(state: FlowState): Array<{ kind?: string, detail?: string, item_id?: string }> {
  try {
    return planExists(state.run_id) ? readPlan(state.run_id).conflicts : []
  } catch {
    return []
  }
}

export function readPlanView(state: FlowState): PlanTickView | null {
  if (!planExists(state.run_id)) return null
  const plan = readPlan(state.run_id)   // throws PlanError for a damaged file, which `stepFlow` surfaces
  return planTickView(plan, { perItem: state.max_rounds, total: state.max_total_rounds })
}

// Apply what the decision asked the plan to record. Runs after the flow state is saved, and is idempotent in
// the parts that matter: closing an item that is already closed and moving a status that is already set are
// both no-ops.
// The document is written back once per tick, and therefore committed once: the item this tick closed and every done item
// an earlier tick had to defer are one pass with one commit (block 72, review round 1). Two calls would put two
// `chore(flow): mark …` commits in a single tick for one tick's worth of marking.
//
// A deferred mark is journalled when this tick closed something (`attempt: 'close'`); a tick that only retries stays quiet
// about the dirty tree it already reported. A failure is journalled by `applyPlanMarks` and never undoes the close.
function markPlanDocument(before: FlowState, observations: FlowObservations, decision: FlowDecision, options: StepFlowOptions): void {
  if (!observations.plan) return
  try {
    applyPlanMarks(before.run_id, {
      root: options.root,
      repo: before.repo,
      tree_clean: observations.tree_clean,
      closed: decision.next_plan_close?.id ?? null,
      attempt: decision.next_plan_close ? 'close' : 'reconcile',
      at: options.at,
    })
  } catch {
    // Writing the document back is bookkeeping; the tick's own work is not undone by a document that could not be written.
  }
}

function applyPlanDecision(before: FlowState, observations: FlowObservations, decision: FlowDecision): void {
  if (!observations.plan) return
  const activeId = before.active_plan_item
  const close = decision.next_plan_close
  const status = decision.next_plan_status
  const fixRound = decision.kind === 'dispatch_fix' && activeId !== null
  const started = decision.reason === 'plan_item_dispatched' || decision.kind === 'dispatch_spec'
  const reviewStarted = decision.kind === 'request_review' && activeId !== null
  const refusedClose = decision.reason === 'plan_item_double_close'
  if (!close && !status && !fixRound && !started && !reviewStarted && !refusedClose) return

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
      // A refused double close is recorded in the plan, so the next tick recognises it as history and stops reporting it.
      if (decision.reason === 'plan_item_double_close' && decision.log_detail) {
        next = {
          ...next,
          conflicts: [...next.conflicts, {
            kind: 'plan_item_double_close' as const,
            item_id: before.active_plan_item ?? '',
            detail: decision.log_detail,
            at: new Date().toISOString(),
          }].slice(-PLAN_LIMITS.conflicts),
        }
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
// A plan that cannot move because nobody wrote a brief is a human task, not a broken pipeline: it gets a warning
// event and the item's name, and the flow stays in a working state (§2.2 of the notification design).
function emitPlanAttention(state: FlowState, observations: FlowObservations, decision: FlowDecision): void {
  const plan = observations.plan
  if (!plan || decision.reason !== 'plan_incomplete') return
  const detail = decision.log_detail ?? ''
  const briefItem = /needs a brief for ([\w.@:-]+)/.exec(detail)?.[1]
  const blockedItem = /([\w.@:-]+) is blocked_owner/.exec(detail)?.[1]
  if (!briefItem && !blockedItem) return
  const item = briefItem ?? blockedItem!
  const kind = briefItem ? 'plan.item_needs_brief' : 'plan.item_blocked'
  emitNotification({
    kind,
    title: briefItem ? `plan item ${item} needs a brief` : `plan item ${item} is blocked`,
    detail: briefItem ? 'attach one with `flow plan attach`; the engine does not invent scope' : detail,
    run_id: state.run_id,
    project: projectOfRepo(state.repo),
    source: 'product',
    dedupe_key: `${state.flow_id}:${kind}:${item}`,
  })
}

// Every escalation becomes an approval: the operator gets a decision to make instead of a stopped pipeline with a
// log line. `raiseEscalationApproval` is idempotent per episode, so a ticker that sees the same escalated flow again
// does not create a second ticket.
function raiseEscalationFor(state: FlowState, decision: FlowDecision): void {
  if (state.state !== 'escalated') return
  try {
    raiseEscalationApproval({
      run_id: state.run_id,
      flow_id: state.flow_id,
      episode: state.notify_episode,
      reason: decision.kind === 'escalate' ? decision.reason : (state.log.at(-1)?.detail ?? 'escalated'),
      item_id: state.active_plan_item,
    })
  } catch {
    // The approval is how a human hears about it, but a failure to write it must not undo the escalation itself.
  }
}

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
    // A pane the detector could not classify says why, in its own words: the hold is explained rather than merely named
    // (block 73).
    pane_diagnostics: {
      dev: devPane === 'unknown' ? (ports.paneDiagnosis?.(state.roles.dev) ?? null) : null,
      review: reviewPane === 'unknown' ? (ports.paneDiagnosis?.(state.roles.review) ?? null) : null,
    },
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
    // Evidence wants the file, not the filtered findings; the prompt and the journal keep the findings.
    notes_text: fromFile ? (notes.evidence_text ?? notes.text) : undefined,
    notes_ref: fromFile ? notes.ref : undefined,
    notes_counts: fromFile ? notes.counts : undefined,
    notes_invalid: fromFile ? undefined : notes.invalid,
    notes_raw: fromFile ? notes.raw : undefined,
    notes_staging_path: notes.staging_path,
    notes_head: notes.head,
    notes_round: notes.round,
    pane_text: reviewPane === 'unknown' ? undefined : paneText,
    evidence_policy: options.evidence_policy ?? evidencePolicy(),
    // The plan owns the queue only when it exists: a flow without one keeps `state.specs`, which is what
    // schema-v1 flows have always used.
    plan: options.plan === null ? undefined : (options.plan ?? readPlanView(state) ?? undefined),
    plan_conflicts: readPlanConflicts(state),
    docs_only_since_claim: options.docs_only_since_claim ?? docsOnlySince(state, head) ?? false,
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
  // Set when the decision sends nothing but still changes the state (an escalation, a timer stamp). `status` separates
  // "the flow moved" from "the flow recorded why it is standing": a hold that becomes visible for the first time is
  // written, but it is not an advance, and the ticker and `flow_step` report it as the hold it is (block 64).
  settled: { state: FlowState, path: string, status?: FlowApplyStatus } | null
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
    // The round is the file's own: a reader that found `<head>-r1.md` while the counter said 2 publishes that round,
    // instead of minting a second record for an answer the reviewer wrote once (block 69).
    publishNotesIfChanged(state.run_id, head, observations.notes_round ?? reviewRound(state), observations.notes_raw, { root: options.root })
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

// How long a pane may stay unclassifiable before the journal explains it. A tick that cannot read a pane holds at once —
// that is the safe answer — but a hold that lasts minutes is a question an operator will ask, and the detector's own words
// are the answer (block 73).
export const PANE_UNKNOWN_HOLD_MS = 120_000

// The one line that explains a pane which has been `unknown` for too long: which pane, and what the detector looked for and
// did not find. Written once per pane and reason — the hold line already says the state.
function paneStateUnknownNote(
  state: FlowState,
  decision: FlowDecision,
  observations: FlowObservations,
  at: string,
): FlowLogEntry | null {
  const pane = decision.reason === 'dev_pane_unknown' ? 'dev'
    : decision.reason === 'review_pane_unknown' ? 'review'
      : null
  if (!pane) return null
  const reason = observations.pane_diagnostics?.[pane]
  if (!reason) return null
  // `since` is when this hold started: the state's own record when the reason matches, this tick otherwise.
  const since = state.hold !== null && state.hold.reason === decision.reason
    ? Date.parse(state.hold.since)
    : Date.parse(at)
  const now = Date.parse(at)
  if (!Number.isFinite(since) || !Number.isFinite(now) || now - since < PANE_UNKNOWN_HOLD_MS) return null
  const detail = `${pane}: ${reason}`
  if (state.log.some(entry => entry.event === 'pane_state_unknown' && entry.detail === detail)) return null
  return { at, event: 'pane_state_unknown', detail }
}

// The hold a decision leaves behind: the engine's reason, the moment this hold started, and the human sentence when the
// engine has one. `since` moves only when the reason (or its detail) changed, so `flow status` says how long the flow
// has been standing instead of when the ticker last looked at it.
function holdOfDecision(state: FlowState, decision: FlowDecision, at: string): FlowHold | null {
  if (decision.kind !== 'none') return null
  const same = state.hold !== null
    && state.hold.reason === decision.reason
    && (state.hold.detail ?? null) === (decision.log_detail ?? null)
  return {
    reason: decision.reason,
    since: same && state.hold ? state.hold.since : at,
    ...(decision.log_detail ? { detail: decision.log_detail } : {}),
  }
}

// Is the hold the same one the file already records? A repeat writes nothing at all — not even a save — which is what
// keeps a 2 s tick from touching the state file every pass.
function sameHold(current: FlowHold | null, next: FlowHold | null): boolean {
  if (current === null || next === null) return current === next
  return current.reason === next.reason && (current.detail ?? null) === (next.detail ?? null)
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
    if (!decisionChangesState(state, decision)) {
      // A hold leaves a trace now (block 64). Before this, `tree_dirty` and its neighbours existed only in the ticker's
      // stdout: the file said `idle`, the journal said nothing, and `flow status` could not answer "why is it standing".
      // The reason and the moment it started live in the state; the journal takes one `hold` line per reason and stays
      // silent on a repeat, which is what keeps a 2 s tick from turning the log into noise.
      const nextHold = holdOfDecision(state, decision, at)
      // A detailed hold's explanation is its latest log line, so find the most recent hold entry independently.
      // A hold whose reason or detail changed is new even when its reason matches an older hold entry.
      const lastHold = [...state.log].reverse().find(entry => entry.event === 'hold')
      const journalled = lastHold?.detail === decision.reason
      const repeated = sameHold(state.hold, nextHold)
      // A pane that has been unreadable for minutes gets one line of its own, even while the hold itself repeats silently.
      const paneNote = paneStateUnknownNote(state, decision, observations, at)
      if (repeated && journalled && !paneNote) {
        return { state, decision, dispatch: null, settled: null }
      }
      // A detailed hold (the plan is waiting for a brief) keeps the journal line it always had; a silent one gets the
      // one line that names it. `updated_at` is deliberately carried over: a hold is not a move, and the badge and the
      // `tick` line in `flow status` read that stamp to say when the last real move happened.
      const noted = decision.log_detail && !repeated ? applyDecisionToState(state, decision, at) : state
      const withHold = !repeated || !journalled
        ? appendLog(noted, { at, event: 'hold', detail: decision.reason })
        : noted.log
      const log = paneNote === null ? withHold : [...withHold, paneNote].slice(-FLOW_LOG_LIMIT)
      const held: FlowState = { ...noted, hold: nextHold, log, updated_at: state.updated_at }
      return {
        state,
        decision,
        dispatch: null,
        // A detailed hold has always been applied (it writes the sentence into the journal); a silent one only becomes
        // visible now, and stays a hold the driver does not count as a move.
        settled: {
          state: held,
          path: saveFlow(held, { root: options.root }),
          status: decision.log_detail ? 'applied' : 'skipped',
        },
      }
    }
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
    // The mirror is updated; the document that lists the work follows it, then anything a previous tick had to defer.
    markPlanDocument(before, observations, phase.decision, options)
    emitFlowAttention(phase.settled?.state ?? before, phase.decision)
    raiseEscalationFor(phase.settled?.state ?? before, phase.decision)
    emitPlanAttention(before, observations, phase.decision)
    // A hold that only becomes visible wrote the reason, not an answer: publishing the reviewer's file here would
    // record a round nobody accepted and remove the staging copy the next tick still needs (the bug that made a
    // rejected answer unpublishable). `status: 'skipped'` is exactly that case — see `holdOfDecision`.
    if (phase.settled && phase.settled.status !== 'skipped') {
      publishRoundNotes(before, observations, phase.decision, options)
      pruneClosedNotes(phase.settled.state, options)
    }
    return {
      observations,
      decision: phase.decision,
      status: phase.settled?.status ?? (phase.settled ? 'applied' : 'skipped'),
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
    // take the runs lock on its own. The claimed state carries the record of a paste this flow already made into that
    // same pane for that same head — the only evidence a fresh process has for its own collapsed marker.
    const paste = dispatch.state.dispatch_paste
    const send = ports.send(dispatch.agent, dispatch.message, {
      pasted: paste !== null && paste.agent === dispatch.agent && paste.head === (phase.decision.head ?? dispatch.state.claim.head)
        ? { at: paste.at }
        : null,
    })

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
      if (send.reason === 'pane_changed') {
        // The Enter was never pressed: the pane stopped looking idle between the paste and the submit, and the composer
        // did not hold our text. Nothing was submitted, so **no round exists** and the decision is not consumed — the
        // reviewer received no request (the review of d096765 on the live run said exactly this). The claim is released
        // and the next tick asks again; because our text is still in the box, `sendWhenIdle` sends the Enter only and
        // never a second paste.
        const released = releaseDispatch(after, send.reason, at)
        return { state: released, status: 'refused', path: saveFlow(released, { root: options.root }) }
      }
      if (send.reason === 'unconfirmed_paste') {
        // The paste is still in the composer and the Enter did not start a turn: **no round exists**, so the decision is
        // not applied (rounds and `review_started_at` stay put) and the claim is released. The next tick presses Enter
        // only — `sendWhenIdle` sees our text in the box and pastes nothing — up to three times; after that a human is
        // asked, because nothing else can submit it (block 69).
        // The record the next tick needs: the pane and the head this prompt was for, and the moment the composer was
        // last read as holding it. `pastedAt` comes from the sender because that is when it looked.
        const pasted = send.pastedAt === undefined
          ? null
          : {
            agent: dispatch.agent,
            head: phase.decision.head ?? dispatch.state.claim.head,
            at: send.pastedAt,
          }
        if (after.enter_retries >= MAX_ENTER_RETRIES) {
          const escalated = escalateUnconfirmedDispatch(after, phase.decision, at)
          return { state: escalated, status: 'unconfirmed', path: saveFlow(escalated, { root: options.root }) }
        }
        const retried = retryEnterDispatch(after, send.reason, pasted, at)
        return { state: retried, status: 'refused', path: saveFlow(retried, { root: options.root }) }
      }
      if (send.reason === 'unconfirmed') {
        // The Enter went in and nothing confirmed it. This is the ambiguous case, and for a review request the round
        // still starts (§3.6b): the reviewer may be working on the commit we pasted, and a round the flow has forgotten
        // is a round whose answer is never read. A fix round does not advance.
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
  if (done.status === 'applied') {
    applyPlanDecision(before, observations, phase.decision)
    markPlanDocument(before, observations, phase.decision, options)
  }
  // Not only `applied`: `composer_dirty` escalates the flow and reports `unconfirmed`, and an escalation the human
  // is never told about is the one failure this journal exists to prevent.
  emitFlowAttention(done.state, phase.decision)
  emitPlanAttention(before, observations, phase.decision)
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
