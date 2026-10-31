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
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import type { PaneBusyState } from './activity.js'
import type { FlowDecision, FlowObservations, FlowState } from './flow.js'
import {
  applyDecisionToState,
  applyUnconfirmedDispatch,
  claimPendingDispatch,
  decisionChangesState,
  flowTick,
  releaseDispatch,
} from './flow.js'
import { readFlow, saveFlow } from './flow-store.js'
import { isRunsLockTimeout, listAgents, readRun, runPath, withRunsLock } from './runs.js'
import type { AgentRecord, RunRecord } from './types.js'
import { paneBusy, peekAgentRaw, sendWhenIdle } from './runtime.js'
import type { SendOutcome } from './runtime.js'
import { VERDICT_SCAN_LINES, scanVerdict } from './verdict.js'

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
  if (!existsSync(runPath(state.run_id))) return { run_present: false, agents_present: false }
  let run: RunRecord
  try {
    run = readRun(state.run_id)
  } catch {
    // A damaged or unreadable registry: say nothing rather than park a live pipeline. The pane
    // guard still holds the tick, so this cannot turn into a blind send either.
    return {}
  }
  if (run.status === 'ended' || run.ended_at !== null) return { run_present: false, agents_present: false }
  const agents = listAgents(run.id)
  return { run_present: true, agents_present: everyAgentPresent(state, agents) }
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

export function observeFlow(state: FlowState, options: ObserveFlowOptions = {}): FlowObservations {
  const ports = options.ports ?? defaultFlowPorts
  const head = options.head ?? readGitHead(state.repo)
  const treeClean = options.tree_clean ?? isGitTreeClean(state.repo)
  const devPane: PaneBusyState = state.roles.dev ? ports.paneBusy(state.roles.dev) : 'unknown'
  const reviewPane: PaneBusyState = state.roles.review ? ports.paneBusy(state.roles.review) : 'unknown'
  // An unreadable reviewer pane carries no verdict evidence at all: report "no verdict" and let
  // the engine hold on `review_pane_unknown` instead of reading a failed capture as zero verdicts.
  const scan = reviewPane === 'unknown'
    ? { count: 0, last: null, notes: '' }
    : scanVerdict(ports.peek(state.roles.review, VERDICT_SCAN_LINES))
  const presence = options.run_present === undefined || options.agents_present === undefined
    ? registryPresence(state)
    : { run_present: options.run_present, agents_present: options.agents_present }
  return {
    now: options.now ?? Date.now(),
    head,
    tree_clean: treeClean,
    dev_pane: devPane,
    review_pane: reviewPane,
    verdict: scan.last,
    verdict_count: scan.count,
    verdict_notes: scan.notes,
    run_present: options.run_present ?? presence.run_present,
    agents_present: options.agents_present ?? presence.agents_present,
  }
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

// The answer to "is this claim still mine and is the flow still live?", asked once right before the
// paste. `send: false` means a control command won the race and nothing may be pasted.
interface PreSendGuard {
  send: boolean
  state: FlowState
  path?: string
}

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

  // Phase one — claim. Re-reading inside the lock is what makes two tickers safe: the decision comes
  // from the file as it is now, so the second ticker sees the first one's claim and holds.
  const claim = withStateLock<ClaimPhaseResult>(() => {
    const state = readFlow(runId, { root: options.root })
    const decision = flowTick(state, observations)
    if (!decisionChangesState(state, decision)) return { state, decision, dispatch: null, settled: null }
    const { message, target } = decision
    if (!message || !target) {
      const next = applyDecisionToState(state, decision, at)
      return { state, decision, dispatch: null, settled: { state: next, path: saveFlow(next, { root: options.root }) } }
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
    return {
      observations,
      decision: phase.decision,
      status: phase.settled ? 'applied' : 'skipped',
      state: phase.settled?.state ?? phase.state,
      path: phase.settled?.path,
    }
  }

  // Phase two — act. The claim is ours, but a control command may have landed between the claim and
  // this line: `flow pause` and `flow stop` drop the claim on purpose, so the intent is re-read once
  // immediately before the paste. A claim that is gone, or a flow that is no longer live, means
  // nothing is sent — without this check a paused flow would still receive one prompt.
  options.onClaimed?.(dispatch.state)
  const guard = withStateLock<PreSendGuard>(() => {
    const current = readFlow(runId, { root: options.root })
    if (current.pending?.op_id !== dispatch.op_id) return { send: false, state: current }
    if (current.state === 'paused' || current.state === 'orphaned' || current.state === 'done') {
      // Our claim survived but the flow was parked: release it so a later resume cannot inherit a
      // send that never happened, and leave the reason in the journal.
      const released = releaseDispatch(current, `flow is ${current.state}`, at)
      return { send: false, state: released, path: saveFlow(released, { root: options.root }) }
    }
    return { send: true, state: current }
  })

  if (guard.locked) {
    // Someone is writing the state right now, so the claim cannot be verified: send nothing and let
    // the next tick decide. The claim stays and expires with `PENDING_TTL_SEC` if nobody settles it.
    return { observations, decision: phase.decision, status: 'locked', state: dispatch.state, path: dispatch.path }
  }
  if (!guard.value.send) {
    return {
      observations,
      decision: phase.decision,
      status: 'cancelled',
      state: guard.value.state,
      path: guard.value.path,
    }
  }

  // The paste happens outside every lock: `sendWhenIdle` reaches `updateAgent`, which takes the runs
  // lock itself, so holding it across the send would deadlock and then steal the lock from itself.
  const send = ports.send(dispatch.agent, dispatch.message)

  // Phase three — settle, and only for our own claim: a claim that someone else already settled
  // (a restarted process, a second ticker that took over) must not be applied twice.
  const settle = withStateLock<SettlePhaseResult>(() => {
    const current = readFlow(runId, { root: options.root })
    if (current.pending?.op_id !== dispatch.op_id) {
      return { state: current, status: 'skipped' }
    }
    if (send.sent) {
      const next = applyDecisionToState(current, phase.decision, at)
      return { state: next, status: 'applied', path: saveFlow(next, { root: options.root }) }
    }
    if (send.reason === 'pane_changed' || send.reason === 'unconfirmed') {
      // The text is in the input box but the submit was not confirmed. Consume the decision so the
      // same text is never pasted twice; the status stays put and the log says why.
      const stuck = applyUnconfirmedDispatch(current, phase.decision, send.reason, at)
      return { state: stuck, status: 'unconfirmed', path: saveFlow(stuck, { root: options.root }) }
    }
    // Nothing was pasted (busy, unknown, stale pane, headless): release the claim and leave the
    // status alone, so the next tick retries once the pane is free.
    const released = releaseDispatch(current, send.reason, at)
    return { state: released, status: 'refused', path: saveFlow(released, { root: options.root }) }
  })

  if (settle.locked) {
    // The paste happened but its outcome could not be written: the claim stays behind, and the
    // engine escalates it after the TTL. A human has to read that one, so it is reported as such.
    return {
      observations,
      decision: phase.decision,
      status: 'unconfirmed',
      send,
      state: dispatch.state,
      path: dispatch.path,
    }
  }

  const settled = settle.value
  return {
    observations,
    decision: phase.decision,
    status: settled.status,
    send,
    state: settled.state,
    path: settled.path ?? dispatch.path,
  }
}
