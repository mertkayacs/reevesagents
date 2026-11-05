// Shapes the registry into the view model the web client renders.
// Input: the live registry (runs + agents). Output: live runs and simple history.
// Invariant: read-only. This never writes state and reuses the same registry the
// TUI and CLI read, so the web UI is a viewer, not a second source of truth.

import {
  listRuns,
  listAgents,
  listRunHistory,
  runHasLiveTmuxTarget,
  computeRunStatus,
} from '../../core/runs.js'
import { PROVIDERS, detectAvailable, providerSupportsAuthMode, providerSupportsEffort } from '../../core/providers.js'
import { modelValuesForProvider } from '../../core/model-catalog.js'
import { providerColor, providerDisplayName } from '../../utils/display.js'
import { listRunApprovals, type ApprovalRisk } from '../../core/approvals.js'
import type { FlowAttention, FlowBadge } from '../../core/flow-view.js'
import { readFlowBadge } from '../../core/flow-view.js'
import { flowIncidentAgeMs, listFlowIncidents } from '../../core/flow-incidents.js'
import type { FlowIncident } from '../../core/flow-incidents.js'
import { flowAttentionText, flowBadgeView, type FlowTranslate } from '../../core/flow-label.js'
import { loadConfig } from '../../core/config.js'
import { translate } from '../../i18n/catalog.js'
import type { LanguageCode, Provider, RunRecord, RunViewStatus, TaskStatus } from '../../core/types.js'

export interface WebStateOptions {
  liveTmuxTarget?: (_run: RunRecord) => boolean
  // Rendered here, not in the browser: the label is formatted by the same helper the TUI uses, so
  // the client never holds a second copy of "flow: review (2/6)".
  language?: LanguageCode
  // The clock the review deadline is measured against.
  now?: number
  // How long a badge counts as news (`agent_pulse_ms`); 0 turns the pulse off.
  agent_pulse_ms?: number
}

// The flow badge as a surface shows it. `label` and `attention_label` arrive pre-rendered from
// core/flow-label.ts; the client only displays them.
export interface WebRunFlow {
  status: string
  rounds: number
  max_rounds: number
  label: string
  attention: FlowAttention | null
  attention_label: string | null
  review_overdue: boolean
  // The plan indicator: tone drives the colour, `label` its text, `pulse` whether it is still news. `plan` and
  // `done_kind` are here so a host can explain the badge without re-reading the flow file.
  tone: 'progress' | 'done' | 'attention' | 'paused' | 'neutral'
  pulse: boolean
  plan: { done: number, total: number } | null
  done_kind: 'plan_complete' | 'closed_no_plan' | 'stopped' | null
  detail: string | null
}

export interface WebTerminal {
  id: string
  nickname: string
  provider: Provider
  provider_label: string
  model: string
  role: 'root' | 'worker'
  status: TaskStatus | 'ended'
  headless: boolean
  hasWindow: boolean
  canAttach: boolean
  canKill: boolean
  canDelete: boolean
  disabledReason: string | null
  monogram: string
  color: string
  task: string
}

export interface WebRun {
  id: string
  name: string
  status: RunViewStatus
  working_dir: string
  canStop: boolean
  canDelete: boolean
  terminals: WebTerminal[]
  // Derived from the flow file on every snapshot, never stored on the run record.
  flow: WebRunFlow | null
  incidents: Array<Pick<FlowIncident, 'id' | 'spec_id' | 'kind' | 'severity' | 'owner' | 'status' | 'first_seen' | 'last_seen' | 'count' | 'note'> & { age_ms: number }>
}

export interface WebRunHistory {
  id: string
  name: string
  status: 'ended' | 'stale'
  working_dir: string
  started_at: string
  ended_at: string | null
  archived_at: string
  agent_count: number
  root_provider: Provider | null
  root_provider_label: string | null
}

export interface WebApproval {
  id: string
  run_id: string
  run_name: string
  agent_id: string
  agent_nickname: string
  provider: Provider | null
  provider_label: string | null
  color: string | null
  action: string
  summary: string
  risk: ApprovalRisk
  requested_at: string
}

export interface WebState {
  runs: WebRun[]
  history: WebRunHistory[]
  approvals: WebApproval[]
}

export interface WebProvider {
  id: Provider
  name: string
  available: boolean
  color: string
  models: string[]
  supportsAuthMode: boolean
  supportsEffort: boolean
}

function monogram(nickname: string, provider: string): string {
  const base = (nickname || provider).trim()
  const alnum = base.replace(/[^A-Za-z0-9]/g, '')
  return (alnum.slice(0, 2) || provider.slice(0, 2)).toUpperCase()
}

function webFlow(badge: FlowBadge, t: FlowTranslate, options: { now?: number, pulseMs?: number } = {}): WebRunFlow {
  // "Still news" is an expiry, not a state: a badge that pulses for ever is ignored within a day. The flow file's own
  // `updated_at` is the clock — no extra timer, and a restart does not restart the pulse.
  const pulseMs = options.pulseMs ?? 15 * 60 * 1000
  // `pulseMs > 0` first, before any comparison: with `0` the difference is `age < 0`, which a clock skew (an `updated_at`
  // in the future) would turn into "fresh" and start a pulse the operator switched off (block 28, MINOR).
  const fresh = pulseMs > 0 && badge.updated_at > 0
    && (options.now ?? Date.now()) - badge.updated_at < pulseMs
  const view = flowBadgeView(t, badge, { fresh })
  const doneKind = badge.status !== 'done'
    ? null
    : badge.plan_progress !== null && badge.plan_progress.done >= badge.plan_progress.total
      ? 'plan_complete' as const
      : badge.close_reason === 'stopped by the operator' ? 'stopped' as const : 'closed_no_plan' as const
  return {
    status: badge.status,
    rounds: badge.rounds,
    max_rounds: badge.max_rounds,
    label: view.label,
    attention: badge.attention,
    attention_label: flowAttentionText(t, badge),
    review_overdue: badge.review_overdue,
    tone: view.tone,
    pulse: view.pulse,
    plan: badge.plan_progress,
    done_kind: doneKind,
    detail: view.detail,
  }
}

export function buildWebState(options: WebStateOptions = {}): WebState {
  const language = options.language ?? loadConfig().global.language
  const t: FlowTranslate = (key, values) => translate(language, key, values)
  const now = options.now ?? Date.now()
  const agentIndex = new Map<string, { nickname: string; provider: Provider }>()
  const runNameById = new Map<string, string>()
  const runs = listRuns().map<WebRun>(run => {
    runNameById.set(run.id, run.name)
    const live = options.liveTmuxTarget ? options.liveTmuxTarget(run) : runHasLiveTmuxTarget(run)
    const runStatus = computeRunStatus(run, live)
    // Read once per run per snapshot: the flow file is small and this is the only place the web
    // view learns about it.
    const flow = readFlowBadge(run.id, now)
    const incidents = listFlowIncidents(run.id, { open_only: true, now }).map(row => ({
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
      age_ms: flowIncidentAgeMs(row, now),
    }))
    const terminals = listAgents(run.id).map<WebTerminal>(agent => {
      agentIndex.set(agent.id, { nickname: agent.nickname, provider: agent.provider })
      const status = agent.ended_at ? 'ended' : agent.task_status
      const hasWindow = !agent.headless && !!agent.tmux_window_id
      const canAttach = live && hasWindow && status !== 'ended'
      const canKill = live && status !== 'ended' && hasWindow
      const canDelete = status === 'ended'
      return {
        id: agent.id,
        nickname: agent.nickname,
        provider: agent.provider,
        provider_label: providerDisplayName(agent.provider),
        model: agent.model,
        role: agent.role,
        status,
        headless: !!agent.headless,
        hasWindow,
        canAttach,
        canKill,
        canDelete,
        disabledReason: canAttach
          ? null
          : status === 'ended'
          ? 'agent has ended'
          : !live
          ? 'run tmux session is unavailable'
          : 'agent has no tmux window',
        monogram: monogram(agent.nickname, agent.provider),
        color: providerColor(agent.provider),
        task: agent.task,
      }
    })
    return {
      id: run.id,
      name: run.name,
      status: runStatus,
      working_dir: run.working_dir,
      canStop: run.status === 'running' && !run.ended_at,
      canDelete: run.status === 'ended' || run.ended_at !== null,
      terminals,
      flow: flow ? webFlow(flow, t, { now, pulseMs: options.agent_pulse_ms }) : null,
      incidents,
    }
  })
  const history = listRunHistory().map<WebRunHistory>(record => ({
    id: record.id,
    name: record.name,
    status: record.status,
    working_dir: record.working_dir,
    started_at: record.started_at,
    ended_at: record.ended_at,
    archived_at: record.archived_at,
    agent_count: record.agent_count,
    root_provider: record.root_provider,
    root_provider_label: record.root_provider ? providerDisplayName(record.root_provider) : null,
  }))
  const approvals = listRunApprovals(undefined, 'pending').map<WebApproval>(approval => {
    const info = agentIndex.get(approval.agent_id)
    return {
      id: approval.id,
      run_id: approval.run_id,
      run_name: runNameById.get(approval.run_id) ?? approval.run_id,
      agent_id: approval.agent_id,
      agent_nickname: info?.nickname ?? approval.agent_id,
      provider: info?.provider ?? null,
      provider_label: info ? providerDisplayName(info.provider) : null,
      color: info ? providerColor(info.provider) : null,
      action: approval.action,
      summary: approval.summary,
      risk: approval.risk,
      requested_at: approval.requested_at,
    }
  })
  return { runs, history, approvals }
}

// Provider options for the create form. Availability is probed via `which`, so this
// is called once on page load (GET /api/state), never on the SSE update path.
export function listWebProviders(): WebProvider[] {
  const available = detectAvailable()
  return PROVIDERS.map(id => ({
    id,
    name: providerDisplayName(id),
    available: available[id],
    color: providerColor(id),
    models: [...modelValuesForProvider(id)],
    supportsAuthMode: providerSupportsAuthMode(id),
    supportsEffort: providerSupportsEffort(id),
  }))
}
