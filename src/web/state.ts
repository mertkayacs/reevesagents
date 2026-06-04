// Shapes the registry into the view model the web client renders.
// Input: the live registry (runs + agents). Output: live runs and simple history.
// Invariant: read-only. This never writes state and reuses the same registry the
// TUI and CLI read, so the web UI is a viewer, not a second source of truth.

import {
  listRuns,
  listRunsAny,
  listAgents,
  listAgentsAny,
  listRunHistory,
  runHasLiveTmuxTarget,
  computeRunStatus,
} from '../state/runs.js'
import { PROVIDERS, detectAvailable } from '../launcher/providers.js'
import { modelValuesForProvider } from '../launcher/model-catalog.js'
import { providerColor, providerDisplayName } from '../utils/display.js'
import type { Provider, RunRecord, RunViewStatus, TaskStatus } from '../state/types.js'
import { isOrchestratorWebProvider } from './prebeta-orchestrator.js'

export interface WebStateOptions {
  prebetaOrchestrator?: boolean
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
}

export interface WebRun {
  id: string
  mode: 'spawner' | 'orchestrator'
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
  mode: 'spawner' | 'orchestrator'
  status: 'ended' | 'stale'
  working_dir: string
  started_at: string
  ended_at: string | null
  archived_at: string
  agent_count: number
  root_provider: Provider | null
  root_provider_label: string | null
}

export interface WebState {
  runs: WebRun[]
  history: WebRunHistory[]
}

export interface WebProvider {
  id: Provider
  name: string
  available: boolean
  orchestrator: boolean
  color: string
  models: string[]
}

function monogram(nickname: string, provider: string): string {
  const base = (nickname || provider).trim()
  const alnum = base.replace(/[^A-Za-z0-9]/g, '')
  return (alnum.slice(0, 2) || provider.slice(0, 2)).toUpperCase()
}

export function buildWebState(options: WebStateOptions = {}): WebState {
  const runsSource = options.prebetaOrchestrator ? listRunsAny() : listRuns()
  const listForRun = options.prebetaOrchestrator ? listAgentsAny : listAgents
  const runs = runsSource.map<WebRun>(run => {
    const mode = run.mode === 'spawner' ? 'spawner' : 'orchestrator'
    const live = options.liveTmuxTarget ? options.liveTmuxTarget(run) : runHasLiveTmuxTarget(run)
    const runStatus = computeRunStatus(run, live)
    const terminals = listForRun(run.id).map<WebTerminal>(agent => {
      const status = agent.ended_at ? 'ended' : agent.task_status
      const hasWindow = !agent.headless && !!agent.tmux_window_id
      const canAttach = live && hasWindow && status !== 'ended'
      const canKill = live && status !== 'ended' && hasWindow && (mode === 'spawner' || agent.role !== 'root')
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
      }
    })
    return {
      id: run.id,
      mode,
      name: run.name,
      status: runStatus,
      working_dir: run.working_dir,
      canStop: run.status === 'running' && !run.ended_at,
      canDelete: run.status === 'ended' || run.ended_at !== null,
      terminals,
    }
  })
  const history = listRunHistory({ includeAllModes: options.prebetaOrchestrator === true }).map<WebRunHistory>(record => ({
    id: record.id,
    name: record.name,
    mode: record.mode,
    status: record.status,
    working_dir: record.working_dir,
    started_at: record.started_at,
    ended_at: record.ended_at,
    archived_at: record.archived_at,
    agent_count: record.agent_count,
    root_provider: record.root_provider,
    root_provider_label: record.root_provider ? providerDisplayName(record.root_provider) : null,
  }))
  return { runs, history }
}

// Provider options for the create form. Availability is probed via `which`, so this
// is called once on page load (GET /api/state), never on the SSE update path.
export function listWebProviders(): WebProvider[] {
  const available = detectAvailable()
  return PROVIDERS.map(id => ({
    id,
    name: providerDisplayName(id),
    available: available[id],
    orchestrator: isOrchestratorWebProvider(id),
    color: providerColor(id),
    models: [...modelValuesForProvider(id)],
  }))
}
