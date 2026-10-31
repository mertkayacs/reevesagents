// Flow view: what a surface is allowed to show about a flow.
//
// The payload below is a published shape — `flow status --json` and the MCP `flow_status` tool
// return exactly it — so two rules live here instead of in each surface: a path is rendered
// home-shortened, and secret-looking text in the log passes the redactor. A flow whose file cannot
// be read is named by the store, not hidden behind an empty result.
//
// Nothing here decides anything: the engine owns the transitions, this module only describes them.

import type { FlowState, FlowStatus } from './flow.js'
import { FlowStateError } from './flow.js'
import { flowPath, listFlowFiles, readFlow } from './flow-store.js'
import { redactSecrets } from './redact.js'
import { shortHomePath } from '../utils/paths.js'

// Run ids are what a flow is keyed by, and a flow of an archived run must still resolve, so this
// reads the flow directory rather than the live run registry. An exact id wins; a unique prefix is
// accepted, which is what makes a hand-typed id usable.
export function resolveFlowRunId(input: string, root?: string): string {
  const wanted = input.trim()
  if (!wanted) throw new FlowStateError('a run id is required')
  const files = listFlowFiles(root)
  const exact = files.find(file => file.run_id === wanted)
  if (exact) return exact.run_id
  const matches = files.filter(file => file.run_id.startsWith(wanted))
  if (matches.length === 1) return matches[0]!.run_id
  if (matches.length > 1) throw new FlowStateError(`ambiguous run id: ${matches.map(file => file.run_id).join(', ')}`)
  const known = files.slice(0, 5).map(file => file.run_id).join(', ')
  throw new FlowStateError(known
    ? `no flow for run ${wanted} (flows exist for: ${known}${files.length > 5 ? ', ...' : ''})`
    : `no flow for run ${wanted} (no flows exist yet)`)
}

export interface FlowStatusPayload {
  schema_version: number
  run_id: string
  state: string
  rounds: number
  max_rounds: number
  review_started_at: number | null
  review_timeout_sec: number
  head: string
  claim: { head: string, verdict: string | null, verdict_count: number }
  // The dispatch in flight: a claim written by a tick that has not settled it yet. This is why a
  // flow can be sitting still while a send is in progress.
  pending: { kind: string, target: string, at: number } | null
  // Parked-state facts, so a surface can explain a flow that is not moving: `paused` shows where a
  // resume would put it, `orphaned` shows why it was parked, `done` shows whether a human closed it.
  paused_from: string | null
  paused_at: number | null
  orphan_reason: string | null
  close_reason: string | null
  queue: { id: string, title: string, source_path: string | null }[]
  dispatched_specs: string[]
  repo: string
  updated_at: string
  last_decision: { at: string, event: string, detail: string } | null
  log: { at: string, event: string, detail: string }[]
  path: string
}

export interface FlowQueueEntry {
  id: string
  title: string
  source_path: string | null
}

// A queued block is summarised, never dumped: `body` is repository-authored text and the payload is
// a log line in a transcript. Its id, title and origin are enough to recognise it.
//
// The title is user text, so it goes through the redactor like the log does — a block heading is as
// capable of quoting a token as a reviewer remark. The flow file keeps the original; only the
// rendered view is redacted.
export function flowQueueSummary(state: FlowState): FlowQueueEntry[] {
  return state.specs
    .filter(spec => !state.dispatched_specs.includes(spec.id))
    .map(spec => ({
      id: spec.id,
      title: redactSecrets(spec.title),
      source_path: spec.source_path ? shortHomePath(spec.source_path) : null,
    }))
}

export function flowStatusPayload(state: FlowState, path = flowPath(state.run_id)): FlowStatusPayload {
  const queue = flowQueueSummary(state)
  const log = state.log.slice(-5).map(entry => ({
    at: entry.at,
    event: entry.event,
    detail: redactSecrets(entry.detail),
  }))
  return {
    schema_version: state.schema_version,
    run_id: state.run_id,
    state: state.state,
    rounds: state.rounds,
    max_rounds: state.max_rounds,
    review_started_at: state.review_started_at,
    review_timeout_sec: state.review_timeout_sec,
    head: state.claim.head,
    claim: {
      head: state.claim.head,
      verdict: state.claim.verdict,
      verdict_count: state.claim.verdict_count,
    },
    pending: state.pending
      ? { kind: state.pending.kind, target: state.pending.target, at: state.pending.at }
      : null,
    paused_from: state.paused_from,
    paused_at: state.paused_at,
    // Both reasons are text a human wrote or a short engine string; the redactor still runs so a
    // pasted token cannot ride out through them.
    orphan_reason: state.orphan_reason ? redactSecrets(state.orphan_reason) : null,
    close_reason: state.close_reason ? redactSecrets(state.close_reason) : null,
    queue,
    dispatched_specs: state.dispatched_specs,
    repo: shortHomePath(state.repo),
    updated_at: state.updated_at,
    // `flow status` and an MCP host both want "why is it sitting there" in one field.
    last_decision: log.at(-1) ?? null,
    log,
    path: shortHomePath(path),
  }
}


// The badge a run row shows. Derived on every read from the flow document, never stored in a run
// record: a heuristic written into a lifecycle field outlives the reason that produced it, and the
// next reader cannot tell "escalated" from "was escalated an hour ago".
export type FlowAttention = 'escalated' | 'review_timeout'

export interface FlowBadge {
  status: FlowStatus
  rounds: number
  max_rounds: number
  // A review past its deadline: the flow is waiting for an answer that will not arrive.
  review_overdue: boolean
  // Why a human is needed, or null while the flow is moving on its own.
  attention: FlowAttention | null
}

// Same comparison the engine makes, so a badge can never say "overdue" while the tick still waits:
// `>= timeout` on the ms difference, measured from `review_started_at`.
export function flowBadge(state: FlowState, now: number = Date.now()): FlowBadge {
  const overdue = state.state === 'reviewing'
    && state.review_started_at !== null
    && now - state.review_started_at >= state.review_timeout_sec * 1000
  return {
    status: state.state,
    rounds: state.rounds,
    max_rounds: state.max_rounds,
    review_overdue: overdue,
    attention: state.state === 'escalated' ? 'escalated' : overdue ? 'review_timeout' : null,
  }
}

// A run without a flow has no badge, and neither has one whose file cannot be read: a dashboard
// skips a damaged file instead of breaking the board, while `flow status` still reports it (§3.3).
export function readFlowBadge(runId: string, now: number = Date.now(), root?: string): FlowBadge | null {
  try {
    return flowBadge(readFlow(runId, { root }), now)
  } catch {
    return null
  }
}

export function listFlowBadges(
  runIds: readonly string[],
  now: number = Date.now(),
  root?: string,
): Map<string, FlowBadge> {
  const badges = new Map<string, FlowBadge>()
  for (const runId of runIds) {
    const badge = readFlowBadge(runId, now, root)
    if (badge) badges.set(runId, badge)
  }
  return badges
}

// A 2 s tick must not re-render the list for an unchanged board.
export function sameFlowBadges(
  a: ReadonlyMap<string, FlowBadge>,
  b: ReadonlyMap<string, FlowBadge>,
): boolean {
  if (a.size !== b.size) return false
  for (const [runId, badge] of a) {
    const other = b.get(runId)
    if (!other) return false
    if (other.status !== badge.status || other.rounds !== badge.rounds || other.max_rounds !== badge.max_rounds) return false
    if (other.attention !== badge.attention || other.review_overdue !== badge.review_overdue) return false
  }
  return true
}
