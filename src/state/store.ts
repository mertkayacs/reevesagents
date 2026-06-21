// App persistence: JSON presets.
// Inputs: SavedTree preset definitions.
// Outputs: typed reads with defaults; atomic writes.
// Invariant: all reads return defaults on any parse error.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync, renameSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import type { AgentRecord, SavedTree, SavedTreeSlot } from './types.js'
import { listAgents, nowIso, readRun, stateRoot } from './runs.js'
import { isProvider } from '../launcher/providers.js'

function stateDir(): string {
  return stateRoot()
}

export function savedTreesDir(): string {
  return join(stateDir(), 'presets')
}

export const presetsDir = savedTreesDir

function atomicWrite(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8')
  try {
    renameSync(tmp, path)
  } catch {
    writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8')
  }
}

function isEffort(value: unknown): value is SavedTreeSlot['effort'] {
  return value === 'default' || value === 'low' || value === 'medium' || value === 'high' || value === 'xhigh' || value === 'max'
}

function normalizeSlot(raw: Record<string, unknown>, fallbackDir = ''): SavedTreeSlot {
  // Read new field name first; fall back to legacy task_template for old presets.
  const promptRaw = typeof raw.initial_prompt === 'string'
    ? raw.initial_prompt
    : typeof raw.task_template === 'string'
    ? raw.task_template
    : ''
  return {
    nickname_template: typeof raw.nickname_template === 'string' ? raw.nickname_template : 'agent',
    provider: isProvider(raw.provider) ? raw.provider : 'cc',
    model: typeof raw.model === 'string' ? raw.model : '',
    auth_mode: raw.auth_mode === 'api-key' ? 'api-key' : 'default',
    effort: isEffort(raw.effort) ? raw.effort : 'default',
    initial_prompt: promptRaw,
    working_dir: typeof raw.working_dir === 'string' ? raw.working_dir : fallbackDir,
    permissions: raw.permissions === 'skip' ? 'skip' : 'ask',
    rc_enabled: typeof raw.rc_enabled === 'boolean' ? raw.rc_enabled : false,
  }
}

function normalizeSavedTree(raw: unknown): SavedTree | null {
  if (typeof raw !== 'object' || raw === null) return null
  const obj = raw as Record<string, unknown>
  const legacyDir = typeof obj.working_dir_pattern === 'string' ? obj.working_dir_pattern : ''
  const rootRaw = typeof obj.root === 'object' && obj.root !== null ? obj.root as Record<string, unknown> : {}
  const workersRaw = Array.isArray(obj.workers) ? obj.workers : []

  return {
    name: typeof obj.name === 'string' ? obj.name : 'preset',
    description: typeof obj.description === 'string' ? obj.description : '',
    root: normalizeSlot(rootRaw, legacyDir),
    workers: workersRaw
      .filter((w): w is Record<string, unknown> => typeof w === 'object' && w !== null)
      .map(w => normalizeSlot(w, legacyDir)),
    working_dir_pattern: legacyDir || undefined,
    created_at: typeof obj.created_at === 'string' ? obj.created_at : new Date().toISOString(),
    updated_at: typeof obj.updated_at === 'string' ? obj.updated_at : new Date().toISOString(),
  }
}

export function listSavedTrees(): SavedTree[] {
  const dir = savedTreesDir()
  if (!existsSync(dir)) return []
  try {
    return readdirSync(dir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        try { return normalizeSavedTree(JSON.parse(readFileSync(join(dir, f), 'utf-8'))) }
        catch { return null }
      })
      .filter((t): t is SavedTree => t !== null)
  } catch {
    return []
  }
}

export function loadSavedTree(name: string): SavedTree | null {
  try {
    return normalizeSavedTree(JSON.parse(readFileSync(join(savedTreesDir(), `${name}.json`), 'utf-8')))
  } catch {
    return null
  }
}

export function saveSavedTree(tree: SavedTree): void {
  atomicWrite(join(savedTreesDir(), `${tree.name}.json`), tree)
}

export function deleteSavedTree(name: string): void {
  try { unlinkSync(join(savedTreesDir(), `${name}.json`)) } catch { /* already gone */ }
}

// Filesystem-safe preset name: presets are stored as <name>.json under the presets
// dir, so restrict a user-supplied name to characters that cannot traverse paths.
function sanitizePresetName(raw: string): string {
  return raw.trim().replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 64)
}

function agentToSlot(agent: AgentRecord): SavedTreeSlot {
  // AgentRecord does not persist auth_mode/effort, so a run -> preset capture
  // defaults those two; every other launch field carries over verbatim.
  return {
    nickname_template: agent.nickname,
    provider: agent.provider,
    model: agent.model,
    auth_mode: 'default',
    effort: 'default',
    initial_prompt: agent.task,
    working_dir: agent.working_dir,
    permissions: agent.permissions,
    rc_enabled: agent.rc_enabled,
  }
}

// Capture a live run's agents into a reusable preset: the run's root agent becomes
// the preset root and the remaining windowed agents become workers in start order.
// Re-saving under an existing name keeps its created_at. Throws on an empty name or
// a run with no capturable (non-headless) agents.
export function savePresetFromRun(runId: string, name: string, description = ''): SavedTree {
  const presetName = sanitizePresetName(name)
  if (!presetName) throw new Error('preset name is required')
  const run = readRun(runId)
  const agents = listAgents(run.id).filter(agent => !agent.headless)
  if (agents.length === 0) throw new Error('run has no agents to save as a preset')
  const root = agents.find(agent => agent.role === 'root') ?? agents[0]!
  const workers = agents.filter(agent => agent !== root)
  const existing = loadSavedTree(presetName)
  const now = nowIso()
  const tree: SavedTree = {
    name: presetName,
    description,
    root: agentToSlot(root),
    workers: workers.map(agentToSlot),
    created_at: existing?.created_at ?? now,
    updated_at: now,
  }
  saveSavedTree(tree)
  return tree
}
