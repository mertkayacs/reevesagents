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
import { withDispatchGate } from './flow-dispatch-gate.js'
import { isRunsLockTimeout, readRun, runPath, tryListAgents, withRunsLock } from './runs.js'
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
        return { state: next, status: 'applied', path: saveFlow(next, { root: options.root }) }
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
  return {
    observations,
    decision: phase.decision,
    status: done.status,
    send: done.send,
    state: done.state,
    path: done.path,
  }

}
