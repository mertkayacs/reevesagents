// Load, save, and merge global config at ~/.reeves/config.json.
// Reads path from REEVES_CONFIG env var. Atomic write. Falls back to defaults on any parse error.

import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import type { Config, GlobalConfig, Permissions } from './types.js'
import { DEFAULT_LANGUAGE, isLanguageCode } from '../i18n/languages.js'

const SCHEMA_VERSION = 2

const DEFAULT_GLOBAL: GlobalConfig = {
  peek_interval_ms: 5000,
  peek_lines: 10,
  max_depth: 5,
  max_agents: 100,
  ready_delay_ms: 5000,
  max_lifetime_ms: 0,
  default_permissions: 'ask',
  language: DEFAULT_LANGUAGE,
}

export function configPath(): string {
  const base = process.env.REEVES_CONFIG
  if (base) return base
  return join(homedir(), '.reeves', 'config.json')
}

export function configExists(): boolean {
  try {
    readFileSync(configPath(), 'utf-8')
    return true
  } catch {
    return false
  }
}

export function defaultConfig(): Config {
  return {
    version: SCHEMA_VERSION,
    global: { ...DEFAULT_GLOBAL }
  }
}

function mergeDefaults(raw: unknown): Config {
  if (typeof raw !== 'object' || raw === null) return defaultConfig()

  const obj = raw as Record<string, unknown>
  const merged: Config = {
    version: typeof obj.version === 'number' ? obj.version : SCHEMA_VERSION,
    global: { ...DEFAULT_GLOBAL }
  }

  if (typeof obj.global === 'object' && obj.global !== null) {
    const g = obj.global as Record<string, unknown>
    if (typeof g.peek_interval_ms === 'number' && g.peek_interval_ms > 0) merged.global.peek_interval_ms = g.peek_interval_ms
    if (typeof g.peek_lines === 'number' && g.peek_lines > 0) merged.global.peek_lines = g.peek_lines
    if (typeof g.max_depth === 'number' && g.max_depth > 0) merged.global.max_depth = g.max_depth
    if (typeof g.max_agents === 'number' && g.max_agents > 0) merged.global.max_agents = g.max_agents
    if (typeof g.ready_delay_ms === 'number' && g.ready_delay_ms >= 0) merged.global.ready_delay_ms = g.ready_delay_ms
    if (typeof g.max_lifetime_ms === 'number' && g.max_lifetime_ms >= 0) merged.global.max_lifetime_ms = g.max_lifetime_ms
    if (g.default_permissions === 'skip' || g.default_permissions === 'ask') merged.global.default_permissions = g.default_permissions as Permissions
    if (isLanguageCode(g.language)) merged.global.language = g.language
  }

  return merged
}

export function loadConfig(): Config {
  try {
    const content = readFileSync(configPath(), 'utf-8')
    return mergeDefaults(JSON.parse(content))
  } catch {
    return defaultConfig()
  }
}

export function saveConfig(cfg: Config): string {
  const path = configPath()
  const dir = dirname(path)
  mkdirSync(dir, { recursive: true })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(cfg, null, 2), 'utf-8')
  try {
    renameSync(tmp, path)
  } catch {
    writeFileSync(path, JSON.stringify(cfg, null, 2), 'utf-8')
  }
  return path
}

// ---- Editable global config fields: one source of truth for every interface ----
// CLI `config`, the MCP config tools, the TUI Settings editor, and the web config
// panel all read this list and route writes through setConfigValues, so the set of
// settable fields and their validation can never drift between surfaces.

export type ConfigFieldKind = 'posint' | 'nonneg-int' | 'permissions' | 'language'

export interface ConfigFieldSpec {
  key: keyof GlobalConfig
  kind: ConfigFieldKind
  label: string
}

export const CONFIG_FIELDS: readonly ConfigFieldSpec[] = [
  { key: 'peek_interval_ms', kind: 'posint', label: 'peek interval (ms)' },
  { key: 'peek_lines', kind: 'posint', label: 'peek lines' },
  { key: 'max_depth', kind: 'posint', label: 'max depth' },
  { key: 'max_agents', kind: 'posint', label: 'max agents' },
  { key: 'ready_delay_ms', kind: 'nonneg-int', label: 'ready delay (ms)' },
  { key: 'max_lifetime_ms', kind: 'nonneg-int', label: 'max agent lifetime (ms)' },
  { key: 'default_permissions', kind: 'permissions', label: 'default permissions' },
  { key: 'language', kind: 'language', label: 'language' },
]

function configFieldSpec(key: string): ConfigFieldSpec {
  const spec = CONFIG_FIELDS.find(field => field.key === key)
  if (!spec) throw new Error(`unknown config field: ${key}`)
  return spec
}

// Coerce a raw string (CLI input) into the value type a field expects. Numeric
// fields parse to a number here; the authoritative range/enum checks live in
// setConfigValues, so string and typed callers share one validator.
export function parseConfigValue(key: string, raw: string): number | string {
  const spec = configFieldSpec(key)
  if (spec.kind === 'posint' || spec.kind === 'nonneg-int') {
    const n = Number(raw)
    if (!Number.isFinite(n)) throw new Error(`${spec.label} must be a number`)
    return n
  }
  return raw
}

function validateConfigField(spec: ConfigFieldSpec, value: unknown): number | string {
  switch (spec.kind) {
    case 'posint':
      if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) throw new Error(`${spec.label} must be a positive integer`)
      return value
    case 'nonneg-int':
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new Error(`${spec.label} must be zero or a positive integer`)
      return value
    case 'permissions':
      if (value !== 'ask' && value !== 'skip') throw new Error(`${spec.label} must be ask or skip`)
      return value
    case 'language':
      if (!isLanguageCode(value)) throw new Error(`unknown language: ${String(value)}`)
      return value
  }
}

// Validate a partial global config and persist it. Unlike loadConfig's merge,
// which silently drops bad values, this throws on any invalid field. The single
// write path every interface uses to edit config. Returns the saved config.
export function setConfigValues(patch: Record<string, unknown>): Config {
  const cfg = loadConfig()
  for (const [key, value] of Object.entries(patch)) {
    const spec = configFieldSpec(key)
    ;(cfg.global as unknown as Record<string, unknown>)[spec.key] = validateConfigField(spec, value)
  }
  saveConfig(cfg)
  return cfg
}
