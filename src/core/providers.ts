// Provider launch helpers. Provider identity and per-provider launch logic live in
// the registry (provider-registry.ts); this module derives the lookups and command
// builders the rest of the app imports: BIN, PROVIDERS, the alias map, buildCommand,
// and the --help compatibility checks.

import { execFileSync, spawnSync, type SpawnSyncOptions } from 'node:child_process'
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

const HELP_INSPECT_TIMEOUT_MS = 3000
// The budget grows with the catalogue at 1.5s per provider (8s floor); once it
// runs out, the providers left are reported as skipped.
const HELP_INSPECT_TOTAL_BUDGET_MS = Math.max(8000, PROVIDERS.length * 1500)

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

// Which launch knobs a provider honors. UI pickers read these so an auth-mode or
// effort control appears only when buildArgs uses it. The provider-capabilities
// test asserts these match what buildArgs actually emits, so they cannot drift.
export function providerSupportsAuthMode(provider: Provider): boolean {
  return PROVIDER_REGISTRY[provider]?.supportsAuthMode === true
}

export function providerSupportsEffort(provider: Provider): boolean {
  return PROVIDER_REGISTRY[provider]?.supportsEffort === true
}

export function buildCommand(opts: BuildCommandOptions): string[] {
  const { provider, permissions, model, auth_mode = 'default', effort = 'default', extra_args = [] } = opts
  if (!isProvider(provider)) {
    throw new Error(`Unsupported provider: ${String(provider)}`)
  }
  const def = PROVIDER_REGISTRY[provider]
  return [def.bin, ...def.buildArgs({ permissions, model, auth_mode, effort }), ...extra_args]
}

// True when the binary resolves on PATH. Shared by the provider and the helper
// tool catalogues so both availability reports use the same probe.
export function binaryOnPath(bin: string, platform = process.platform): boolean {
  try {
    execFileSync(platform === 'win32' ? 'where' : 'which', [bin], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

export function detectAvailable(): Record<Provider, boolean> {
  const result = {} as Record<Provider, boolean>
  for (const provider of PROVIDERS) {
    result[provider] = binaryOnPath(BIN[provider])
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

// Full path of a CLI on PATH via where/which, or null when it is not found.
// On Windows `where` may list several candidates (npm shims ship both an
// extensionless stub and a .cmd); prefer the runnable extension.
export function resolveCliPath(bin: string): string | null {
  try {
    const out = execFileSync(process.platform === 'win32' ? 'where' : 'which', [bin], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const candidates = out.trim().split(/\r?\n/).filter(Boolean)
    return (candidates.find(c => /\.(cmd|bat|exe)$/i.test(c)) ?? candidates[0]) ?? null
  } catch {
    return null
  }
}

// Tokens that never need cmd.exe quoting (npm CLI help flags look like this).
const isPlainToken = (token: string): boolean =>
  /^[A-Za-z0-9_:@%+=,./\\-]+$/.test(token)

export function spawnCliSync(
  bin: string,
  args: string[],
  options: SpawnSyncOptions = {},
  platform = process.platform,
): ReturnType<typeof spawnSync> {
  if (platform !== 'win32') return spawnSync(bin, args, options)
  // npm-installed CLIs on Windows are .cmd shims, which a shell-less spawnSync
  // cannot run. Resolve the real path; run shims through the shell with each
  // argument safely quoted, real executables directly with no shell.
  const resolved = resolveCliPath(bin)
  if (!resolved) return spawnSync(bin, args, options) // ENOENT like a missing binary
  if (/\.(cmd|bat)$/i.test(resolved)) {
    // shell: true joins file+args verbatim, so quote anything cmd.exe would
    // treat specially (help flags are plain, embedded double quotes are dropped)
    return spawnCmdShim(resolved, args, options)
  }
  return spawnSync(resolved, args, options)
}

function spawnCmdShim(resolved: string, args: string[], options: SpawnSyncOptions): ReturnType<typeof spawnSync> {
  const cmdSafe = (token: string): string =>
    isPlainToken(token) ? token : '"' + token.replace(/["\\^&|<>()!%]/g, '').replace(/\s+/g, ' ') + '"'
  return spawnSync(`"${resolved}"`, args.map(cmdSafe), { ...options, shell: true, windowsVerbatimArguments: true })
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
      const inspected = spawnCliSync(bin, args, {
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
