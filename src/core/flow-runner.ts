// Flow runner: the only module that knows both the engine and the outside world.
//
// `flow.ts` decides, this file looks and acts. Three jobs, in one place so a surface never has to
// remember them:
// - `observeFlow` reads HEAD, the worktree state, both panes and the reviewer's verdict;
// - `applyDecision` pastes through `sendWhenIdle`, which is the one write path that re-checks the
//   idle signal; it persists the transition only after the send was confirmed;
// - `stepFlow` composes the two, and is what the CLI calls.
//
// A refused send is never retried blindly: nothing was pasted when the pane was busy or unknown,
// so the state is left untouched and the next tick tries again; when the paste did land but the
// Enter was not confirmed, the decision is consumed and logged as `dispatch_unconfirmed`, because
// pasting the same text twice is how a queued Enter ends up answering someone else's prompt.

import { execFileSync } from 'node:child_process'
import type { PaneBusyState } from './activity.js'
import type { FlowDecision, FlowObservations, FlowState } from './flow.js'
import { applyDecisionToState, applyUnconfirmedDispatch, decisionChangesState, flowTick } from './flow.js'
import { saveFlow } from './flow-store.js'
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
  return {
    now: options.now ?? Date.now(),
    head,
    tree_clean: treeClean,
    dev_pane: devPane,
    review_pane: reviewPane,
    verdict: scan.last,
    verdict_count: scan.count,
    verdict_notes: scan.notes,
  }
}

export type FlowApplyStatus = 'applied' | 'skipped' | 'unconfirmed'

export interface FlowApplyResult {
  status: FlowApplyStatus
  decision: FlowDecision
  // Present whenever a send was attempted, so a caller can report the exact refusal.
  send?: SendOutcome
  // The state on disk after the call. Equal to the input state when nothing was written.
  state: FlowState
  path?: string
}

export interface ApplyFlowOptions {
  root?: string
  ports?: FlowPorts
  // Timestamp written into the log; the clock the engine measures a timeout against is
  // `ObserveFlowOptions.now` (epoch ms).
  at?: string
}

// The thin effect layer. It writes only what the pure engine already computed: no transition
// logic lives here, which is why `--dry-run` can promise "exactly what a real tick would do".
export function applyDecision(
  state: FlowState,
  decision: FlowDecision,
  options: ApplyFlowOptions = {},
): FlowApplyResult {
  const ports = options.ports ?? defaultFlowPorts
  const at = options.at ?? new Date().toISOString()

  if (!decisionChangesState(state, decision)) return { status: 'skipped', decision, state }

  let send: SendOutcome | undefined
  if (decision.message && decision.target) {
    send = ports.send(state.roles[decision.target], decision.message)
    if (!send.sent) {
      if (send.reason === 'pane_changed' || send.reason === 'unconfirmed') {
        // The text is in the input box but the submit was not confirmed. Consume the decision so
        // the same text is never pasted twice; the status stays put and the log says why.
        const stuck = applyUnconfirmedDispatch(state, decision, send.reason, at)
        return { status: 'unconfirmed', decision, send, state: stuck, path: saveFlow(stuck, { root: options.root }) }
      }
      // Nothing was pasted (busy, unknown, stale pane, headless): leave the state alone so the
      // next tick can retry once the pane is free.
      return { status: 'unconfirmed', decision, send, state }
    }
  }

  const next = applyDecisionToState(state, decision, at)
  return { status: 'applied', decision, send, state: next, path: saveFlow(next, { root: options.root }) }
}

export interface StepFlowOptions extends ApplyFlowOptions, ObserveFlowOptions {
  // Observe and decide, then print: nothing is sent and nothing is written.
  dryRun?: boolean
}

export interface FlowStepResult {
  observations: FlowObservations
  decision: FlowDecision
  status: FlowApplyStatus
  send?: SendOutcome
  state: FlowState
  path?: string
}

// One engine step: look, decide, act. The CLI and (later) the TUI tick call this and nothing else.
export function stepFlow(state: FlowState, options: StepFlowOptions = {}): FlowStepResult {
  const observations = observeFlow(state, options)
  const decision = flowTick(state, observations)
  if (options.dryRun) return { observations, decision, status: 'skipped', state }
  const applied = applyDecision(state, decision, options)
  return { observations, decision, status: applied.status, send: applied.send, state: applied.state, path: applied.path }
}
