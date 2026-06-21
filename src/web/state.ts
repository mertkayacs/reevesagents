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
} from '../core/runs.js'
import { PROVIDERS, detectAvailable } from '../core/providers.js'
import { modelValuesForProvider } from '../core/model-catalog.js'
import { providerColor, providerDisplayName } from '../utils/display.js'
import { listRunApprovals, type ApprovalRisk } from '../core/approvals.js'
import type { Provider, RunRecord, RunViewStatus, TaskStatus } from '../core/types.js'

export interface WebStateOptions {
  liveTmuxTarget?: (_run: RunRecord) => boolean
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
}

function monogram(nickname: string, provider: string): string {
  const base = (nickname || provider).trim()
  const alnum = base.replace(/[^A-Za-z0-9]/g, '')
  return (alnum.slice(0, 2) || provider.slice(0, 2)).toUpperCase()
}

export function buildWebState(options: WebStateOptions = {}): WebState {
  const agentIndex = new Map<string, { nickname: string; provider: Provider }>()
  const runNameById = new Map<string, string>()
  const runs = listRuns().map<WebRun>(run => {
    runNameById.set(run.id, run.name)
    const live = options.liveTmuxTarget ? options.liveTmuxTarget(run) : runHasLiveTmuxTarget(run)
    const runStatus = computeRunStatus(run, live)
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
  }))
}
