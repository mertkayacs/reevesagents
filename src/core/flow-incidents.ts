// Durable flow attention. Incidents describe exceptional conditions and route responsibility; they never
// send text to an agent pane or attempt to repair the work automatically.

import { randomUUID } from 'node:crypto'
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FlowDecision, FlowObservations, FlowState } from './flow.js'
import { appendLog, FLOW_LOG_LIMIT } from './flow.js'
import { flowsDir, FLOW_ID_PATTERN, readFlow, saveFlow } from './flow-store.js'
import { createRunApproval, listRunApprovals } from './approvals.js'
import { readRun, withRunsLock } from './runs.js'
import { redactSecrets } from './redact.js'

export type FlowIncidentSeverity = 'info' | 'warn' | 'blocker'
export type FlowIncidentOwner = 'orchestrator' | 'human'
export type FlowIncidentStatus = 'open' | 'acked' | 'resolved'

export interface FlowIncidentEvidence {
  state: string
  head: string
  dev_pane: string
  review_pane: string
  tree_clean: boolean | null
  reason: string
  last_log: { at: string, event: string, detail: string } | null
}

export interface FlowIncident {
  id: string
  run_id: string
  spec_id: string | null
  kind: string
  severity: FlowIncidentSeverity
  evidence: FlowIncidentEvidence
  first_seen: string
  last_seen: string
  count: number
  episode: string
  owner: FlowIncidentOwner
  status: FlowIncidentStatus
  note: string | null
  ack_deadline: string | null
  approval_id: string | null
  resolved_at: string | null
}

interface IncidentStore {
  schema_version: 1
  run_id: string
  incidents: FlowIncident[]
  watches: Record<string, number>
}

export interface ReconcileIncidentOptions {
  root?: string
  now?: number
  at?: string
  ack_timeout_ms?: number
  pane_unknown_grace_ms?: number
}

interface IncidentSignal {
  kind: string
  severity: FlowIncidentSeverity
  spec_id: string | null
  reason: string
}

export const DEFAULT_INCIDENT_ACK_TIMEOUT_MS = 10 * 60_000
export const DEFAULT_PANE_UNKNOWN_GRACE_MS = 120_000

function incidentPath(runId: string, root?: string): string {
  if (!FLOW_ID_PATTERN.test(runId)) throw new Error(`not a valid flow id: ${runId}`)
  return join(flowsDir(root), runId, 'incidents.json')
}

function emptyStore(runId: string): IncidentStore {
  return { schema_version: 1, run_id: runId, incidents: [], watches: {} }
}

function normalizeIncident(raw: unknown, runId: string): FlowIncident | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  if (typeof row.id !== 'string' || typeof row.kind !== 'string') return null
  const evidence = typeof row.evidence === 'object' && row.evidence !== null
    ? row.evidence as Record<string, unknown>
    : {}
  const lastLog = typeof evidence.last_log === 'object' && evidence.last_log !== null
    ? evidence.last_log as Record<string, unknown>
    : null
  const severity = row.severity === 'blocker' || row.severity === 'warn' ? row.severity : 'info'
  const status = row.status === 'acked' || row.status === 'resolved' ? row.status : 'open'
  const owner = row.owner === 'human' ? 'human' : 'orchestrator'
  return {
    id: row.id,
    run_id: runId,
    spec_id: typeof row.spec_id === 'string' ? row.spec_id : null,
    kind: row.kind,
    severity,
    evidence: {
      state: typeof evidence.state === 'string' ? evidence.state : '',
      head: typeof evidence.head === 'string' ? evidence.head : '',
      dev_pane: typeof evidence.dev_pane === 'string' ? evidence.dev_pane : 'unknown',
      review_pane: typeof evidence.review_pane === 'string' ? evidence.review_pane : 'unknown',
      tree_clean: typeof evidence.tree_clean === 'boolean' ? evidence.tree_clean : null,
      reason: typeof evidence.reason === 'string' ? redactSecrets(evidence.reason) : '',
      last_log: lastLog && typeof lastLog.at === 'string' && typeof lastLog.event === 'string'
        ? { at: lastLog.at, event: lastLog.event, detail: redactSecrets(typeof lastLog.detail === 'string' ? lastLog.detail : '') }
        : null,
    },
    first_seen: typeof row.first_seen === 'string' ? row.first_seen : new Date(0).toISOString(),
    last_seen: typeof row.last_seen === 'string' ? row.last_seen : new Date(0).toISOString(),
    count: typeof row.count === 'number' && Number.isFinite(row.count) ? Math.max(1, Math.floor(row.count)) : 1,
    episode: typeof row.episode === 'string' ? row.episode : '',
    owner,
    status,
    note: typeof row.note === 'string' ? redactSecrets(row.note) : null,
    ack_deadline: typeof row.ack_deadline === 'string' ? row.ack_deadline : null,
    approval_id: typeof row.approval_id === 'string' ? row.approval_id : null,
    resolved_at: typeof row.resolved_at === 'string' ? row.resolved_at : null,
  }
}

function readStore(runId: string, root?: string): IncidentStore {
  try {
    const parsed = JSON.parse(readFileSync(incidentPath(runId, root), 'utf8')) as Record<string, unknown>
    if (parsed.schema_version !== 1 || parsed.run_id !== runId || !Array.isArray(parsed.incidents)) {
      throw new Error(`flow incidents file for ${runId} has an unsupported shape`)
    }
    const watches = typeof parsed.watches === 'object' && parsed.watches !== null && !Array.isArray(parsed.watches)
      ? Object.fromEntries(Object.entries(parsed.watches as Record<string, unknown>)
        .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1])))
      : {}
    return {
      schema_version: 1,
      run_id: runId,
      incidents: parsed.incidents.map(row => normalizeIncident(row, runId)).filter((row): row is FlowIncident => row !== null),
      watches,
    }
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return emptyStore(runId)
    throw error
  }
}

function writeStore(store: IncidentStore, root?: string): void {
  const path = incidentPath(store.run_id, root)
  mkdirSync(join(flowsDir(root), store.run_id), { recursive: true })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8')
  chmodSync(tmp, 0o600)
  renameSync(tmp, path)
}

function itemFor(state: FlowState, observations?: FlowObservations, decision?: FlowDecision): string | null {
  return decision?.spec_id ?? state.claim.spec_id ?? state.active_plan_item
    ?? observations?.plan?.items.find(item => item.status === 'in_work' || item.status === 'reviewing')?.id
    ?? null
}

function episodeFor(state: FlowState, item: string | null): string {
  return `${state.claim.head || 'no-head'}:${item ?? '-'}`
}

function signalsFor(
  state: FlowState,
  observations: FlowObservations | undefined,
  decision: FlowDecision | undefined,
  now: number,
  paneGrace: number,
  previousWatches: Record<string, number>,
): { signals: IncidentSignal[], watches: Record<string, number>, watchActive: Set<string> } {
  const item = itemFor(state, observations, decision)
  const signals: IncidentSignal[] = []
  const watches: Record<string, number> = {}
  const watchActive = new Set<string>()
  const reason = decision?.reason ?? state.hold?.reason ?? ''
  const evidenceReason = decision?.log_detail ?? state.hold?.detail ?? reason
  const paneUnknown = reason === 'dev_pane_unknown' || reason === 'review_pane_unknown'
  if (paneUnknown && observations) {
    const since = state.hold?.reason === reason ? Date.parse(state.hold.since) : now
    if (Number.isFinite(since) && now - since >= paneGrace) {
      const pane = reason.startsWith('dev_') ? 'dev' : 'review'
      const diagnosis = observations?.pane_diagnostics?.[pane] ?? 'pane classification signal was unavailable'
      signals.push({ kind: 'pane_unknown', severity: 'warn', spec_id: item, reason: `${pane}: ${diagnosis}` })
    }
  }

  if (observations?.tree_clean === false) {
    if (observations.dev_pane === 'idle') {
      const key = `dev_stalled|${episodeFor(state, item)}`
      const since = Number.isFinite(state.stalled_since) && state.stalled_since !== null
        ? state.stalled_since
        : undefined
      const watchAt = since ?? previousWatches[key] ?? now
      watchActive.add(key)
      watches[key] = watchAt
      const elapsed = now - watchAt
      if (elapsed >= state.dev_timeout_sec * 1000) {
        signals.push({ kind: 'dev_stalled', severity: 'warn', spec_id: item, reason: `tree is dirty and dev pane is idle for ${Math.floor(elapsed / 1000)}s` })
      }
    }
  }

  let dispatch = false
  let dispatchLog: FlowState['log'][number] | undefined
  for (const entry of [...state.log].reverse()) {
    if (entry.event === 'dispatch_unconfirmed' || entry.event === 'dispatch_retry_enter') {
      dispatch = true
      dispatchLog = entry
      break
    }
    if (/^(?:request_review|dispatch_fix|dispatch_spec|dispatch_stall_retry|plan_item_dispatched|dispatch_refused)$/.test(entry.event)) break
  }
  if (dispatch) signals.push({ kind: 'dispatch_unconfirmed', severity: 'blocker', spec_id: item, reason: dispatchLog?.detail ?? 'dispatch submit could not be confirmed' })

  // Incident journal entries are outputs of this reconciler, not new flow causes. Ignore them when a
  // parked escalated flow is rechecked so an `incident_opened` row cannot turn into unknown_hold.
  const latest = [...state.log].reverse().find(entry => entry.event !== 'incident_opened' && entry.event !== 'incident_resolved') ?? null
  const latestDetail = latest?.detail ?? ''
  // A manual tick of an escalated flow appends `flow_closed`; the cause belongs to the latest escalation
  // event, not that subsequent hold. Preserve it so one blocker stays one incident across parked sweeps.
  const escalationCause = [...state.log].reverse().find(entry => entry.event === 'escalate')?.detail
  const escalatedReason = state.state === 'escalated'
    ? (decision?.kind === 'escalate' ? decision.reason : undefined) ?? escalationCause
      ?? (decision?.reason === 'flow_closed' ? undefined : decision?.reason) ?? latestDetail
    : decision?.reason ?? reason
  if (escalatedReason.includes('dispatch_unresolved') || escalatedReason.includes('review_dispatch_unconfirmed')
    || latest?.event === 'dispatch_unresolved') {
    signals.push({ kind: 'dispatch_unconfirmed', severity: 'blocker', spec_id: item, reason: latestDetail || escalatedReason })
  } else if (escalatedReason.includes('review_timeout')) {
    signals.push({ kind: 'review_timeout', severity: 'blocker', spec_id: item, reason: escalatedReason })
  } else if (/rounds_exhausted|total_rounds_exhausted|rounds spent/.test(escalatedReason)) {
    signals.push({ kind: 'rounds_exhausted', severity: 'blocker', spec_id: item, reason: escalatedReason })
  } else if (escalatedReason.includes('dev_stalled') && !observations) {
    signals.push({ kind: 'dev_stalled', severity: 'warn', spec_id: item, reason: escalatedReason })
  } else if (state.state === 'escalated' && escalatedReason) {
    signals.push({ kind: 'unknown_hold', severity: 'blocker', spec_id: item, reason: escalatedReason })
  }

  const planBlocked = observations?.plan?.items.find(entry => entry.id === item && entry.status === 'blocked_owner')
  if (planBlocked?.block_reason === 'rounds_exhausted') {
    signals.push({ kind: 'rounds_exhausted', severity: 'blocker', spec_id: item, reason: 'plan item exhausted its review rounds' })
  }

  if (reason === 'agent_question' || state.agent_question) {
    signals.push({ kind: 'agent_question', severity: 'warn', spec_id: item, reason: state.agent_question?.text ?? evidenceReason })
  }

  const normal = new Set([
    '', 'head_unchanged', 'tree_dirty', 'dev_busy', 'review_busy', 'dev_pane_unknown', 'review_pane_unknown',
    'awaiting_verdict', 'review_timer_started', 'dispatch_pending', 'dispatch_unresolved',
    'plan_incomplete', 'plan_in_flight', 'fix_refused', 'flow_closed', 'agent_question', 'agent_question_answered',
  ])
  if (decision?.kind === 'none' && !normal.has(decision.reason) && decision.reason !== 'dev_stalled'
    && decision.reason !== 'review_timeout' && decision.reason !== 'rounds_exhausted') {
    signals.push({ kind: 'unknown_hold', severity: 'warn', spec_id: item, reason: decision.log_detail ?? decision.reason })
  }

  if (decision?.reason === 'dev_stalled' || (state.stalled_since !== null && observations?.dev_pane === 'idle'
    && now - state.stalled_since >= state.dev_timeout_sec * 1000)) {
    signals.push({ kind: 'dev_stalled', severity: 'warn', spec_id: item, reason: decision?.log_detail ?? 'dev remained idle beyond the configured timeout' })
  }

  return { signals, watches, watchActive }
}

function evidenceOf(state: FlowState, observations: FlowObservations | undefined, reason: string): FlowIncidentEvidence {
  const last = state.log.at(-1)
  return {
    state: state.state,
    head: state.claim.head,
    dev_pane: observations?.dev_pane ?? 'unknown',
    review_pane: observations?.review_pane ?? 'unknown',
    tree_clean: observations?.tree_clean ?? null,
    reason: redactSecrets(reason),
    last_log: last ? { at: last.at, event: last.event, detail: redactSecrets(last.detail) } : null,
  }
}

function keyFor(episode: string, kind: string, item: string | null): string {
  return `${episode}|${kind}|${item ?? '-'}`
}

function activeKey(row: FlowIncident): string {
  return keyFor(row.episode, row.kind, row.spec_id)
}

function withIncidentJournal(state: FlowState, events: { event: 'incident_opened' | 'incident_resolved', detail: string }[], at: string, root?: string): FlowState {
  if (events.length === 0) return state
  let log = state.log
  for (const event of events) {
    if (log.some(entry => entry.event === event.event && entry.detail === event.detail)) continue
    log = [...appendLog({ ...state, log }, { at, event: event.event, detail: event.detail })].slice(-FLOW_LOG_LIMIT)
  }
  const updated = { ...state, log, updated_at: at }
  saveFlow(updated, { root })
  return updated
}

// Reconcile one observed tick. The durable incident file is the source of truth; flow logs only record first open and
// resolution, never repeat observations. `null` observations still process ACK deadlines for parked flows.
export function reconcileFlowIncidents(
  state: FlowState,
  observations?: FlowObservations,
  decision?: FlowDecision,
  options: ReconcileIncidentOptions = {},
): FlowState {
  const now = options.now ?? Date.now()
  const at = options.at ?? new Date(now).toISOString()
  const ackTimeout = options.ack_timeout_ms ?? DEFAULT_INCIDENT_ACK_TIMEOUT_MS
  const paneGrace = options.pane_unknown_grace_ms ?? DEFAULT_PANE_UNKNOWN_GRACE_MS
  const approvalsToCreate: string[] = []
  const events: { event: 'incident_opened' | 'incident_resolved', detail: string }[] = []

  withRunsLock(() => {
    const store = readStore(state.run_id, options.root)
    const detected = signalsFor(state, observations, decision, now, paneGrace, store.watches)
    store.watches = Object.fromEntries(Object.entries(store.watches).filter(([key]) => detected.watchActive.has(key)))
    Object.assign(store.watches, detected.watches)
    const signalByKey = new Map<string, IncidentSignal>()
    for (const signal of detected.signals) {
      const key = keyFor(episodeFor(state, signal.spec_id), signal.kind, signal.spec_id)
      signalByKey.set(key, signal)
    }

    for (const row of store.incidents) {
      if (row.status === 'resolved') continue
      const key = activeKey(row)
      const signal = signalByKey.get(key)
      if (signal) {
        row.last_seen = at
        row.count += 1
        row.evidence = evidenceOf(state, observations, signal.reason)
        continue
      }
      if (!observations) continue
      // Unknown holds and pane conditions are observed per tick; a missing signal means the condition cleared.
      row.status = 'resolved'
      row.resolved_at = at
      row.last_seen = at
      row.note = 'condition cleared'
      events.push({ event: 'incident_resolved', detail: `${row.id} ${row.kind}: condition cleared` })
    }

    for (const [key, signal] of signalByKey) {
      const episode = episodeFor(state, signal.spec_id)
      const prior = store.incidents.find(row => activeKey(row) === key)
      if (prior) continue
      const resolvedBefore = store.incidents.some(row => row.status === 'resolved' && activeKey(row) === key)
      if (resolvedBefore) continue
      const incident: FlowIncident = {
        id: randomUUID(),
        run_id: state.run_id,
        spec_id: signal.spec_id,
        kind: signal.kind,
        severity: signal.severity,
        evidence: evidenceOf(state, observations, signal.reason),
        first_seen: at,
        last_seen: at,
        count: 1,
        episode,
        owner: 'orchestrator',
        status: 'open',
        note: null,
        ack_deadline: signal.severity === 'blocker' ? new Date(now + ackTimeout).toISOString() : null,
        approval_id: null,
        resolved_at: null,
      }
      store.incidents.push(incident)
      events.push({ event: 'incident_opened', detail: `${incident.id} ${incident.severity} ${incident.kind}${incident.spec_id ? ` ${incident.spec_id}` : ''}` })
    }

    for (const row of store.incidents) {
      if (row.status !== 'open' || row.severity !== 'blocker' || !row.ack_deadline || Date.parse(row.ack_deadline) > now) continue
      if (row.owner === 'orchestrator') {
        row.owner = 'human'
        row.note = row.note ?? 'orchestrator ACK timeout; escalated to human'
      }
      if (row.owner === 'human' && !row.approval_id) approvalsToCreate.push(row.id)
    }
    writeStore(store, options.root)
    const current = readFlow(state.run_id, { root: options.root })
    const updated = withIncidentJournal(current, events, at, options.root)
    state = updated
  })

  for (const incidentId of approvalsToCreate) {
    let incident = listFlowIncidents(state.run_id, { root: options.root }).find(row => row.id === incidentId)
    if (!incident || incident.approval_id) continue
    try {
      const existing = listRunApprovals(state.run_id).find(approval => approval.details.incident_id === incidentId && approval.status === 'pending')
      let approvalId = existing?.id
      if (!approvalId) {
        const run = readRun(state.run_id)
        const approval = createRunApproval({
          agent_id: run.root_agent_id,
          action: 'flow_incident',
          summary: `Flow incident needs attention: ${incident.kind}${incident.spec_id ? ` (${incident.spec_id})` : ''}`,
          details: { incident_id: incident.id, kind: incident.kind, evidence: incident.evidence.reason },
          risk: 'high',
        })
        approvalId = approval.id
      }
      withRunsLock(() => {
        const store = readStore(state.run_id, options.root)
        const row = store.incidents.find(item => item.id === incidentId)
        if (!row || row.status === 'resolved' || row.approval_id) return
        row.approval_id = approvalId ?? null
        writeStore(store, options.root)
      })
    } catch {
      // Persisted owner=human makes the escalation visible; a later tick retries approval delivery if it failed.
    }
  }
  return state
}

export interface ListFlowIncidentsOptions { root?: string, open_only?: boolean, now?: number }

export function listFlowIncidents(runId: string, options: ListFlowIncidentsOptions = {}): FlowIncident[] {
  const rows = readStore(runId, options.root).incidents
  return rows
    .filter(row => options.open_only !== true || row.status !== 'resolved')
    .map(row => ({ ...row, evidence: { ...row.evidence } }))
    .sort((a, b) => a.first_seen.localeCompare(b.first_seen))
}

function findIncident(store: IncidentStore, id: string): FlowIncident {
  const matches = store.incidents.filter(row => row.id === id || row.id.startsWith(id))
  if (matches.length !== 1) throw new Error(matches.length > 1 ? `ambiguous incident id ${id}` : `no incident ${id}`)
  return matches[0]!
}

export function claimFlowIncident(runId: string, id: string, options: { root?: string, at?: string } = {}): FlowIncident {
  return withRunsLock(() => {
    const store = readStore(runId, options.root)
    const row = findIncident(store, id)
    if (row.status === 'resolved') throw new Error(`incident ${row.id} is already resolved`)
    row.owner = 'orchestrator'
    writeStore(store, options.root)
    return row
  })
}

export function ackFlowIncident(runId: string, id: string, options: { root?: string, at?: string } = {}): FlowIncident {
  return withRunsLock(() => {
    const at = options.at ?? new Date().toISOString()
    const store = readStore(runId, options.root)
    const row = findIncident(store, id)
    if (row.status === 'resolved') throw new Error(`incident ${row.id} is already resolved`)
    row.owner = 'orchestrator'
    row.status = 'acked'
    row.note = row.note ?? 'acknowledged by orchestrator'
    row.last_seen = at
    writeStore(store, options.root)
    return row
  })
}

export function resolveFlowIncident(runId: string, id: string, note: string, options: { root?: string, at?: string } = {}): FlowIncident {
  const cleanNote = note.trim()
  if (!cleanNote) throw new Error('resolving an incident requires a note')
  return withRunsLock(() => {
    const at = options.at ?? new Date().toISOString()
    const store = readStore(runId, options.root)
    const row = findIncident(store, id)
    if (row.status === 'resolved') return row
    row.status = 'resolved'
    row.resolved_at = at
    row.last_seen = at
    row.note = redactSecrets(cleanNote)
    writeStore(store, options.root)
    const current = readFlow(runId, { root: options.root })
    const detail = `${row.id} ${row.kind}: ${row.note}`
    if (!current.log.some(entry => entry.event === 'incident_resolved' && entry.detail.startsWith(`${row.id} `))) {
      const updated = { ...current, log: appendLog(current, { at, event: 'incident_resolved', detail }), updated_at: at }
      saveFlow(updated, { root: options.root })
    }
    return row
  })
}

export function flowIncidentAgeMs(row: FlowIncident, now = Date.now()): number {
  return Math.max(0, now - Date.parse(row.first_seen))
}
