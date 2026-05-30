// Load, save, and merge global config at ~/.reeves/config.json.
// Reads path from REEVES_CONFIG env var. Atomic write. Falls back to defaults on any parse error.

import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import type { Config, GlobalConfig, Permissions } from './types.js'

const SCHEMA_VERSION = 2

const DEFAULT_GLOBAL: GlobalConfig = {
  peek_interval_ms: 5000,
  peek_lines: 10,
  max_depth: 5,
  max_agents: 10,
  ready_delay_ms: 5000,
  default_permissions: 'ask'
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
    if (g.default_permissions === 'skip' || g.default_permissions === 'ask') merged.global.default_permissions = g.default_permissions as Permissions
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
