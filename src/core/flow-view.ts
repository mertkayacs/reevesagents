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
import { readPlan } from './plan.js'
import { redactSecrets } from './redact.js'
import { tickStateText } from './tick-status.js'
import type { TickStatus } from './tick-status.js'
import { shortHomePath } from '../utils/paths.js'
import { flowIncidentAgeMs, listFlowIncidents } from './flow-incidents.js'
import type { FlowIncident } from './flow-incidents.js'

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
    ? `no flow for run ${wanted} (flow not started; flows exist for: ${known}${files.length > 5 ? ', ...' : ''})`
    : `no flow for run ${wanted} (flow not started; no flows exist yet)`)
}

export interface FlowStatusPayload {
  schema_version: number
  run_id: string
  state: string
  rounds: number
  max_rounds: number
  review_started_at: number | null
  review_timeout_sec: number
  dev_timeout_sec: number
  dev_stall_attempts: number
  dev_stall_max_attempts: number
  stalled_since: number | null
  head: string
  claim: { head: string, verdict: string | null, verdict_count: number, verdict_applied: boolean, spec_id: string | null }
  // The dispatch in flight: a claim written by a tick that has not settled it yet. This is why a
  // flow can be sitting still while a send is in progress.
  pending: { kind: string, target: string, at: number } | null
  // Why the flow is standing still, and since when (block 64). `reason` is the engine's own word (`tree_dirty`,
  // `head_unchanged`, `awaiting_verdict`, …) and `detail` the human sentence a detailed hold carries. Null when the flow
  // is moving or waiting on a dispatch, which `pending` already describes.
  hold: { reason: string, since: string, detail?: string } | null
  agent_question: { agent: string, item: string | null, text: string, since: number } | null
  incidents: Array<Pick<FlowIncident, 'id' | 'spec_id' | 'kind' | 'severity' | 'owner' | 'status' | 'first_seen' | 'last_seen' | 'count' | 'note'> & { age_ms: number, evidence: FlowIncident['evidence'] }>
  // What the last review could prove: the numbers the evidence rule looked at. Never the notes text.
  last_evidence: { elapsed_ms: number, notes_findings: number, notes_bytes: number, pane_tool_lines: number } | null
  // The newest round's notes, as a reference and counters — never the text (§11.3 of the notification
  // design: the payload is a transcript, the file is the record).
  last_notes: { ref: string, counts: { blocker: number, major: number, minor: number } } | null
  // Parked-state facts, so a surface can explain a flow that is not moving: `paused` shows where a
  // resume would put it, `orphaned` shows why it was parked, `done` shows whether a human closed it.
  paused_from: string | null
  paused_at: number | null
  orphan_reason: string | null
  close_reason: string | null
  queue: { id: string, title: string, source_path: string | null }[]
  dispatched_specs: string[]
  // A dispatch whose submit was never confirmed, so an operator can see why a round has not started — the journal always
  // knew; `flow status` and `/api/state` did not (block 69).
  dispatch: FlowDispatchNote | null
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

// A dispatch that was not confirmed, as a surface reports it.
export interface FlowDispatchNote {
  state: 'unconfirmed'
  // The journal's own words for it: `unconfirmed review_requested <head>` or the retry attempt.
  reason: string
  at: string
}

// Was the last dispatch confirmed? The journal is the sequence — a state field would have to be cleared by every later
// success, and the entries already say it: `dispatch_unconfirmed` / `dispatch_retry_enter` leave the dispatch open, a
// settled decision (`request_review`, `dispatch_fix`, `dispatch_spec`) or a refusal closes it. The brief's point is that
// this fact used to live only in the log, where nobody watching the flow could see it (block 69).
const SETTLED_DISPATCH_EVENTS = /^(?:request_review|dispatch_fix|dispatch_spec|dispatch_stall_retry|plan_item_dispatched)$/
export function flowDispatchNote(state: FlowState): FlowDispatchNote | null {
  for (let index = state.log.length - 1; index >= 0; index -= 1) {
    const entry = state.log[index]!
    if (entry.event === 'dispatch_unconfirmed' || entry.event === 'dispatch_retry_enter') {
      return { state: 'unconfirmed', reason: redactSecrets(entry.detail), at: entry.at }
    }
    if (entry.event === 'dispatch_claimed' || entry.event === 'dispatch_refused') continue
    if (SETTLED_DISPATCH_EVENTS.test(entry.event)) return null
    // Anything else (a hold, a pause, a round release) says nothing about the dispatch: keep looking backwards.
  }
  return null
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

// `review_unsubstantiated` entries carry `elapsed=<n>s notes=<findings>/<bytes>b tool=<lines>` in their
// detail (see `evidenceNumbers` in flow.ts); the payload lifts the four numbers out of it so a surface
// does not have to parse prose.
function parseEvidence(detail: string): { elapsed_ms: number, notes_findings: number, notes_bytes: number, pane_tool_lines: number } | null {
  const match = /elapsed=(\d+)s notes=(\d+)\/(\d+)b tool=(\d+)/.exec(detail)
  if (!match) return null
  return {
    elapsed_ms: Number(match[1]) * 1000,
    notes_findings: Number(match[2]),
    notes_bytes: Number(match[3]),
    pane_tool_lines: Number(match[4]),
  }
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
    dev_timeout_sec: state.dev_timeout_sec,
    dev_stall_attempts: state.dev_stall_attempts,
    dev_stall_max_attempts: state.dev_stall_max_attempts,
    stalled_since: state.stalled_since,
    head: state.claim.head,
    claim: {
      head: state.claim.head,
      verdict: state.claim.verdict,
      verdict_count: state.claim.verdict_count,
      verdict_applied: state.claim.verdict_applied,
      spec_id: state.claim.spec_id,
    },
    pending: state.pending
      ? { kind: state.pending.kind, target: state.pending.target, at: state.pending.at }
      : null,
    // The reason the flow is standing still, so a host does not have to run a `--dry-run` tick to find out. The field is
    // passed through, never derived: `since` is when the hold started, not when this payload was built.
    hold: state.hold
      ? { reason: state.hold.reason, since: state.hold.since, ...(state.hold.detail ? { detail: state.hold.detail } : {}) }
      : null,
    agent_question: state.agent_question ? {
      agent: state.agent_question.agent,
      item: state.agent_question.item,
      text: redactSecrets(state.agent_question.text),
      since: state.agent_question.since,
    } : null,
    incidents: listFlowIncidents(state.run_id, { open_only: true }).map(row => ({
      id: row.id,
      spec_id: row.spec_id,
      kind: row.kind,
      severity: row.severity,
      owner: row.owner,
      status: row.status,
      first_seen: row.first_seen,
      last_seen: row.last_seen,
      count: row.count,
      note: row.note,
      evidence: row.evidence,
      age_ms: flowIncidentAgeMs(row),
    })),
    // The last decision that saw a verdict carries the numbers the evidence rule used; a state written
    // before this field existed simply has none.
    last_evidence: (() => {
      for (let index = state.log.length - 1; index >= 0; index -= 1) {
        const entry = state.log[index]!
        if (entry.event === 'review_unsubstantiated') return parseEvidence(entry.detail)
      }
      return null
    })(),
    // The newest log entry that consumed a notes file. The text stays in the file.
    last_notes: (() => {
      for (let index = state.log.length - 1; index >= 0; index -= 1) {
        const entry = state.log[index]!
        if (entry.notes_ref) {
          return { ref: entry.notes_ref, counts: entry.notes_counts ?? { blocker: 0, major: 0, minor: 0 } }
        }
      }
      return null
    })(),
    paused_from: state.paused_from,
    paused_at: state.paused_at,
    // Both reasons are text a human wrote or a short engine string; the redactor still runs so a
    // pasted token cannot ride out through them.
    orphan_reason: state.orphan_reason ? redactSecrets(state.orphan_reason) : null,
    close_reason: state.close_reason ? redactSecrets(state.close_reason) : null,
    queue,
    dispatched_specs: state.dispatched_specs,
    dispatch: flowDispatchNote(state),
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
export type FlowAttention = 'escalated' | 'review_timeout' | 'dev_stalled' | 'dispatch_unconfirmed' | 'plan_waiting' | 'incident' | 'spec_lost'

// What the plan is waiting for, when it is waiting for a human. Supplied by the caller that read `plan.json`:
// the badge is a view, and the plan is a separate file (`docs/plan-model-design.md` §2.2).
export interface PlanAttention {
  reason: 'needs_brief' | 'blocked_owner'
  item: string
}

export interface FlowBadge {
  status: FlowStatus
  rounds: number
  max_rounds: number
  // A review past its deadline: the flow is waiting for an answer that will not arrive.
  review_overdue: boolean
  // Why a human is needed, or null while the flow is moving on its own.
  attention: FlowAttention | null
  attention_detail: string | null
  queue_depth: number
  // The item the plan is waiting for, when `attention` is `plan_waiting`.
  plan: PlanAttention | null
  // How far the plan got, when the flow has one. The badge needs the numbers, not just "done": a finished plan and a
  // flow that never had one both end in `done`, and the label has to tell them apart.
  plan_progress: { done: number, total: number } | null
  incident_summary: { open: number, blockers: number, owner: 'orchestrator' | 'human' } | null
  // Why a closed flow closed, so `closed` can be shown without pretending a plan finished.
  close_reason: string | null
  // When the flow file last changed: the "is this news?" input for a pulse that is not meant to last for ever.
  updated_at: number
}

// Same comparison the engine makes, so a badge can never say "overdue" while the tick still waits:
// `>= timeout` on the ms difference, measured from `review_started_at`.
export function flowBadge(
  state: FlowState,
  now: number = Date.now(),
  plan: PlanAttention | null = null,
  planProgress: { done: number, total: number } | null = null,
  incidentSummary: FlowBadge['incident_summary'] = null,
): FlowBadge {
  const queueDepth = state.specs.filter(spec => !state.dispatched_specs.includes(spec.id)).length
  const lostSpec = lostQueuedSpec(state)
  const overdue = state.state === 'reviewing'
    && state.review_started_at !== null
    && now - state.review_started_at >= state.review_timeout_sec * 1000
  // `escalated` and a timed-out review outrank the plan: they are pipeline problems, and the plan waiting is the
  // normal "somebody has to write a brief" case. A dispatch that was never confirmed is a pipeline problem too — the
  // round has not started — so it outranks the plan and sits below the two that need a human's decision (block 69).
  const escalation = state.state === 'escalated' ? 'escalated' : overdue ? 'review_timeout' : null
  const stalled = escalation === null && state.state !== 'done' && state.state !== 'orphaned' && state.state !== 'paused'
    && flowDispatchNote(state) !== null
    ? 'dispatch_unconfirmed' as const
    : null
  const devStalled = escalation === null && stalled === null && state.stalled_since !== null
    && (state.dev_stall_attempts > 0 || now - state.stalled_since >= state.dev_timeout_sec * 1000)
    && state.state !== 'done' && state.state !== 'orphaned' && state.state !== 'paused'
    ? 'dev_stalled' as const : null
  const planAttention = escalation === null && stalled === null && devStalled === null && plan !== null && (state.state === 'idle' || state.state === 'reviewing' || state.state === 'fixing')
    ? 'plan_waiting' as const
    : null
  const incidentAttention = incidentSummary && incidentSummary.open > 0 ? 'incident' as const : null
  const specLost = lostSpec ? 'spec_lost' as const : null
  return {
    status: state.state,
    rounds: state.rounds,
    max_rounds: state.max_rounds,
    review_overdue: overdue,
    attention: incidentAttention ?? escalation ?? stalled ?? devStalled ?? specLost ?? planAttention,
    attention_detail: lostSpec ? `queued spec ${lostSpec} is missing from both the queue and dispatch history` : null,
    queue_depth: queueDepth,
    plan: incidentAttention !== null ? null : planAttention === null ? null : plan,
    plan_progress: planProgress,
    incident_summary: incidentSummary,
    close_reason: state.close_reason ?? null,
    updated_at: Date.parse(state.updated_at) || 0,
  }
}

function lostQueuedSpec(state: FlowState): string | null {
  const seen = new Set<string>()
  for (const entry of [...state.log].reverse()) {
    if (entry.event === 'spec_queued') {
      for (const id of entry.detail.split(',').map(value => value.trim()).filter(Boolean)) {
        if (seen.has(id)) continue
        seen.add(id)
        if (!state.specs.some(spec => spec.id === id) && !state.dispatched_specs.includes(id)) return id
      }
    } else if (entry.event === 'spec_dropped') {
      const id = entry.detail.split(':', 1)[0]?.trim()
      if (id) seen.add(id)
    }
  }
  return null
}

// The plan's attention, read from `flows/<run-id>/plan.json` when there is one: the first open item that cannot
// move without a human. Returns null for "nothing the plan is waiting for".
export function planAttentionOf(runId: string, root?: string): PlanAttention | null {
  try {
    const plan = readPlan(runId, { root })
    for (const item of plan.items) {
      if (item.missing_since !== null) continue
      if (item.status === 'blocked_owner') return { reason: 'blocked_owner', item: item.id }
      if (item.spec === null && item.status !== 'done' && item.status !== 'skipped') return { reason: 'needs_brief', item: item.id }
    }
    return null
  } catch {
    return null
  }
}

// How far the plan got. `null` when the flow has no plan, which is a different thing from `0/0`.
export function planProgressOf(runId: string, root?: string): { done: number, total: number } | null {
  try {
    const plan = readPlan(runId, { root })
    const total = plan.items.length
    if (total === 0) return null
    const done = plan.items.filter(item => item.status === 'done' || item.status === 'skipped').length
    return { done, total }
  } catch {
    return null
  }
}

// The Flow section on the run page: a few plain lines, so the renderer needs no logic and a test can assert the text
// for every state. Width is capped at 78 columns for the narrow terminal: a status line that wraps is a status line
// nobody reads.
export interface FlowSectionOptions {
  now?: number
  // The driver's record, as `readTickStatus()` returns it. The panel never advances a flow itself, so the only truth
  // it can print is the last real pass (block 68); `null` says plainly that no pass has been recorded.
  tick?: TickStatus | null
  plan?: PlanAttention | null
  active_plan_item?: string | null
  queue_depth?: number
}

export function flowSectionLines(state: FlowState, options: FlowSectionOptions = {}): string[] {
  const now = options.now ?? Date.now()
  const badge = flowBadge(state, now, options.plan ?? null)
  const lines: string[] = []
  const budget = badge.status === 'escalated' || badge.status === 'done' || badge.status === 'orphaned'
    ? `round ${badge.rounds}`
    : `round ${badge.rounds}/${badge.max_rounds}`
  lines.push(`state    ${badge.status} · ${budget}`)
  if (state.agent_question) lines.push(`question ${state.agent_question.agent}: ${state.agent_question.text}`)
  if (options.active_plan_item) {
    const suffix = options.plan && options.plan.item === options.active_plan_item ? '' : ''
    lines.push(`item     ${options.active_plan_item}${suffix}`)
  }
  if (typeof options.queue_depth === 'number') lines.push(`queue    ${options.queue_depth} pending`)
  if (options.plan) {
    const why = options.plan.reason === 'needs_brief' ? 'needs a brief' : 'blocked_owner'
    lines.push(`waiting  ${options.plan.item} (${why})`)
  }
  if (badge.attention === 'review_timeout') lines.push('attention review timed out')
  else if (badge.attention === 'escalated') lines.push('attention rounds spent — approve or deny in Approvals')
  else if (badge.attention === 'dev_stalled') lines.push(`attention dev stalled · retry ${state.dev_stall_attempts}/${state.dev_stall_max_attempts}`)
  else if (badge.attention === 'plan_waiting') lines.push('attention waiting for you')
  // Where the next move comes from: the external driver, reported by its own last pass — never by a setting the
  // panel does not own.
  lines.push(`tick     ${tickStateText(options.tick ?? null, now)}`)
  return lines.map(line => (line.length > 78 ? `${line.slice(0, 77)}…` : line))
}

// A run without a flow has no badge, and neither has one whose file cannot be read: a dashboard
// skips a damaged file instead of breaking the board, while `flow status` still reports it (§3.3).
export function readFlowBadge(runId: string, now: number = Date.now(), root?: string): FlowBadge | null {
  try {
    const incidents = listFlowIncidents(runId, { root, open_only: true })
    const incidentSummary = incidents.length > 0 ? {
      open: incidents.length,
      blockers: incidents.filter(row => row.severity === 'blocker').length,
      owner: incidents.some(row => row.owner === 'human') ? 'human' as const : 'orchestrator' as const,
    } : null
    return flowBadge(readFlow(runId, { root }), now, planAttentionOf(runId, root), planProgressOf(runId, root), incidentSummary)
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
