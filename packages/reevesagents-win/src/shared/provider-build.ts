// Pure launch helpers copied from the unix package's src/core/providers.ts. Only
// the OS-agnostic parts live here (argv building, provider identity, alias
// normalization); the impure availability probe (which/where) is reimplemented in
// core/availability.ts. catalog-drift.test.ts asserts these functions match the
// originals byte-for-byte, so the two provider catalogs cannot drift.

import type { Provider, Permissions, AuthMode, Effort } from './types.js'
import { PROVIDER_DEFS, PROVIDER_REGISTRY } from './provider-registry.js'

export interface BuildCommandOptions {
  provider: Provider
  permissions: Permissions
  model: string
  auth_mode?: AuthMode
  effort?: Effort
  rc_enabled?: boolean
  // Raw flags appended verbatim after everything ReevesAgents builds, so the
  // user can pass provider-specific options we do not model (e.g. Claude Code's
  // --remote-control). Last position lets them override our earlier flags.
  extra_args?: string[]
}

// Normalize user-supplied extra launch flags into an argv array. Accepts a raw
// string (whitespace-split, the shape the CLI and UI text inputs produce) or an
// already-split array (the shape MCP passes). Blank tokens are dropped, so an
// empty value yields no flags. Splitting is whitespace-only; a flag value that
// itself contains spaces is not a launch-flag case we support.
export function coerceExtraArgs(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(Boolean)
  }
  if (typeof value === 'string') {
    return value.trim().split(/\s+/).filter(Boolean)
  }
  return []
}

export const BIN = Object.fromEntries(
  PROVIDER_DEFS.map(def => [def.id, def.bin]),
) as Record<Provider, string>

export const PROVIDERS = Object.keys(PROVIDER_REGISTRY) as Provider[]

const PROVIDER_ALIASES: Record<string, Provider> = Object.fromEntries(
  PROVIDER_DEFS.flatMap(def => def.aliases.map(alias => [alias, def.id])),
)

export function isProvider(value: unknown): value is Provider {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PROVIDER_REGISTRY, value)
}

export function normalizeProvider(value: unknown): Provider | null {
  if (typeof value !== 'string') return null
  return PROVIDER_ALIASES[value.trim().toLowerCase()] ?? null
}

export function buildCommand(opts: BuildCommandOptions): string[] {
  const { provider, permissions, model, auth_mode = 'default', effort = 'default', extra_args = [] } = opts
  if (!isProvider(provider)) {
    throw new Error(`Unsupported provider: ${String(provider)}`)
  }
  const def = PROVIDER_REGISTRY[provider]
  return [def.bin, ...def.buildArgs({ permissions, model, auth_mode, effort }), ...extra_args]
}
