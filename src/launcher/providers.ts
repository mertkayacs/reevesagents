// Provider launch helpers. Provider identity and per-provider launch logic live in
// the registry (provider-registry.ts); this module derives the lookups and command
// builders the rest of the app imports: BIN, PROVIDERS, the alias map, buildCommand,
// and the --help compatibility checks.

import { execFileSync, spawnSync } from 'node:child_process'
import type { Provider, Permissions, AuthMode, Effort } from '../state/types.js'
import { PROVIDER_DEFS, PROVIDER_REGISTRY } from './provider-registry.js'

export interface BuildCommandOptions {
  provider: Provider
  permissions: Permissions
  model: string
  auth_mode?: AuthMode
  effort?: Effort
  rc_enabled?: boolean
}

export const BIN = Object.fromEntries(
  PROVIDER_DEFS.map(def => [def.id, def.bin]),
) as Record<Provider, string>

export const PROVIDERS = Object.keys(PROVIDER_REGISTRY) as Provider[]

const PROVIDER_ALIASES: Record<string, Provider> = Object.fromEntries(
  PROVIDER_DEFS.flatMap(def => def.aliases.map(alias => [alias, def.id])),
)

const HELP_INSPECT_TIMEOUT_MS = 3000
const HELP_INSPECT_TOTAL_BUDGET_MS = 8000

export interface ProviderCompatibility {
  provider: Provider
  available: boolean
  ok: boolean
  detail: string
  missing: string[]
}

export function isProvider(value: unknown): value is Provider {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PROVIDER_REGISTRY, value)
}

export function normalizeProvider(value: unknown): Provider | null {
  if (typeof value !== 'string') return null
  return PROVIDER_ALIASES[value.trim().toLowerCase()] ?? null
}

export function buildCommand(opts: BuildCommandOptions): string[] {
  const { provider, permissions, model, auth_mode = 'default', effort = 'default' } = opts
  if (!isProvider(provider)) {
    throw new Error(`Unsupported provider: ${String(provider)}`)
  }
  const def = PROVIDER_REGISTRY[provider]
  return [def.bin, ...def.buildArgs({ permissions, model, auth_mode, effort })]
}

export function detectAvailable(): Record<Provider, boolean> {
  const result = {} as Record<Provider, boolean>
  for (const provider of PROVIDERS) {
    try {
      execFileSync('which', [BIN[provider]], { stdio: 'pipe' })
      result[provider] = true
    } catch {
      result[provider] = false
    }
  }
  return result
}

export function helpCommand(provider: Provider): string[] {
  const def = PROVIDER_REGISTRY[provider]
  return [def.bin, ...(def.helpArgs ?? ['--help'])]
}

export function missingHelpFeatures(provider: Provider, helpText: string): string[] {
  return PROVIDER_REGISTRY[provider].helpRequirements
    .filter(req => req.tokens.some(token => !helpText.includes(token)))
    .map(req => req.feature)
}

export function inspectProviderCompatibility(): Record<Provider, ProviderCompatibility> {
  const available = detectAvailable()
  const result = {} as Record<Provider, ProviderCompatibility>
  const deadline = Date.now() + HELP_INSPECT_TOTAL_BUDGET_MS

  for (const provider of PROVIDERS) {
    if (!available[provider]) {
      result[provider] = {
        provider,
        available: false,
        ok: true,
        detail: 'not installed',
        missing: [],
      }
      continue
    }

    try {
      const remaining = deadline - Date.now()
      if (remaining <= 0) {
        result[provider] = {
          provider,
          available: true,
          ok: false,
          detail: 'help inspection skipped after timeout budget',
          missing: ['help inspection'],
        }
        continue
      }
      const [bin, ...args] = helpCommand(provider)
      const inspected = spawnSync(bin, args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: Math.min(HELP_INSPECT_TIMEOUT_MS, remaining),
      })
      if (inspected.error) throw inspected.error
      const help = `${inspected.stdout ?? ''}\n${inspected.stderr ?? ''}`
      if (inspected.status !== 0 && help.trim().length === 0) {
        throw new Error(`help exited ${inspected.status}`)
      }
      const missing = missingHelpFeatures(provider, help)
      result[provider] = {
        provider,
        available: true,
        ok: missing.length === 0,
        detail: missing.length === 0 ? 'compatible' : `missing ${missing.join(', ')}`,
        missing,
      }
    } catch (err) {
      result[provider] = {
        provider,
        available: true,
        ok: false,
        detail: `could not inspect help: ${err instanceof Error ? err.message : 'unknown error'}`,
        missing: ['help inspection'],
      }
    }
  }

  return result
}
