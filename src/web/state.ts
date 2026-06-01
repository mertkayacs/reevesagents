// Shapes the registry into the view model the web client renders.
// Input: the live registry (runs + agents). Output: runs grouped with terminal cards.
// Invariant: read-only. This never writes state and reuses the same registry the
// TUI and CLI read, so the web UI is a viewer, not a second source of truth.

import {
  listRuns,
  listRunsAny,
  listAgents,
  listAgentsAny,
  runHasLiveTmuxTarget,
  computeRunStatus,
} from '../state/runs.js'
import { PROVIDERS, detectAvailable } from '../launcher/providers.js'
import { providerColor } from '../utils/display.js'
import type { Provider, RunViewStatus, TaskStatus } from '../state/types.js'
import { isOrchestratorWebProvider } from './prebeta-orchestrator.js'

export interface WebStateOptions {
  prebetaOrchestrator?: boolean
}

export interface WebTerminal {
  id: string
  nickname: string
  provider: Provider
  model: string
  role: 'root' | 'worker'
  status: TaskStatus | 'ended'
  headless: boolean
  hasWindow: boolean
  canAttach: boolean
  canKill: boolean
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
  terminals: WebTerminal[]
}

export interface WebState {
  runs: WebRun[]
}

export interface WebProvider {
  id: Provider
  available: boolean
  orchestrator: boolean
  color: string
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
    const live = runHasLiveTmuxTarget(run)
    const terminals = listForRun(run.id).map<WebTerminal>(agent => {
      const status = agent.ended_at ? 'ended' : agent.task_status
      const hasWindow = !agent.headless && !!agent.tmux_window_id
      const canAttach = hasWindow && status !== 'ended'
      const canKill = status !== 'ended' && hasWindow && (mode === 'spawner' || agent.role !== 'root')
      return {
        id: agent.id,
        nickname: agent.nickname,
        provider: agent.provider,
        model: agent.model,
        role: agent.role,
        status,
        headless: !!agent.headless,
        hasWindow,
        canAttach,
        canKill,
        disabledReason: canAttach ? null : status === 'ended' ? 'terminal has ended' : 'terminal has no tmux window',
        monogram: monogram(agent.nickname, agent.provider),
        color: providerColor(agent.provider),
      }
    })
    return {
      id: run.id,
      mode,
      name: run.name,
      status: computeRunStatus(run, live),
      working_dir: run.working_dir,
      canStop: run.status === 'running' && !run.ended_at,
      terminals,
    }
  })
  return { runs }
}

// Provider options for the create form. Availability is probed via `which`, so this
// is called once on page load (GET /api/state), never on the SSE update path.
export function listWebProviders(): WebProvider[] {
  const available = detectAvailable()
  return PROVIDERS.map(id => ({
    id,
    available: available[id],
    orchestrator: isOrchestratorWebProvider(id),
    color: providerColor(id),
  }))
}
