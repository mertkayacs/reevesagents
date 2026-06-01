// Optional PRE-BETA bridge from the stable web UI to the separate orchestrator package.
// Loaded only when the user starts `reevesagents web --prebeta-orchestrator`.

import type { AgentRecord, AuthMode, Effort, Permissions, Provider, RunRecord } from '../state/types.js'

export const ORCHESTRATOR_WEB_PROVIDERS = ['cc', 'codex', 'opencode', 'hermes'] as const

export interface WebLaunchConfig {
  nickname?: string
  provider: Provider
  model: string
  auth_mode?: AuthMode
  effort?: Effort
  task: string
  working_dir?: string
  permissions?: Permissions
  rc_enabled?: boolean
}

export interface WebOrchestratorRuntime {
  startRun: (_request: {
    mode: 'orchestrator'
    name: string
    working_dir: string
    root: WebLaunchConfig
    workers?: WebLaunchConfig[]
    preset_name?: string | null
    ready_delay_ms?: number
  }) => { run: RunRecord; agents: AgentRecord[] }
  spawnWorker: (_request: WebLaunchConfig & { run_id: string; ready_delay_ms?: number }) => AgentRecord
  killAgent: (_agentId: string) => AgentRecord
  stopRun: (_runId: string) => RunRecord
}

export function isOrchestratorWebProvider(provider: Provider): boolean {
  return (ORCHESTRATOR_WEB_PROVIDERS as readonly string[]).includes(provider)
}

function isRuntime(value: unknown): value is WebOrchestratorRuntime {
  if (!value || typeof value !== 'object') return false
  const maybe = value as Record<string, unknown>
  return typeof maybe.startRun === 'function'
    && typeof maybe.spawnWorker === 'function'
    && typeof maybe.killAgent === 'function'
    && typeof maybe.stopRun === 'function'
}

export async function loadWebOrchestratorRuntime(
  injected?: WebOrchestratorRuntime,
): Promise<WebOrchestratorRuntime> {
  if (injected) return injected
  try {
    const specifier = 'reevesagents-orchestrator'
    const mod = await import(specifier)
    if (isRuntime(mod)) return mod
  } catch {
    // Fall through to one clear product-facing error below.
  }
  throw new Error([
    'PRE-BETA orchestrator web mode requires the separate orchestrator package.',
    'Install the all-in pre-beta option, then rerun:',
    '  npm install -g reevesagents reevesagents-orchestrator',
    '  reevesagents web --prebeta-orchestrator',
  ].join('\n'))
}
