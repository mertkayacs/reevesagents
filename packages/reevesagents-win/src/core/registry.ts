// Win run registry: one run folder, one run.json, and per-run agent JSON, under a
// distinct REEVES_WIN_REGISTRY dir (default ~/.reeves-win) so it can never fight the
// unix package's ~/.reeves store. This is a trimmed reimplementation of the unix
// src/core/runs.ts: the same fs read/write/lock/atomic/redact/archive logic, minus
// every tmux probe (no tmux on Windows), with win-native records (pid, no tmux_*).
//
// The registry holds durable metadata; the in-memory live-pty map in pty-runtime is
// the authority for "can I drive this now". Because ConPTY children die with the MCP
// process, reconcileOnStart archives everything left over from a previous session on
// boot (their ptys are gone and cannot be reacquired).

import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { PtyAgentRecord, PtyRunHistoryRecord, PtyRunRecord } from './types-win.js'
import type { AgentRole, Permissions, RunHistoryStatus, TaskStatus } from '../shared/types.js'
import { redactSecrets } from '../shared/redact.js'
import { isProvider } from '../shared/provider-build.js'

export function stateRoot(): string {
  return process.env.REEVES_WIN_REGISTRY || join(homedir(), '.reeves-win')
}

export function runsDir(): string {
  return join(stateRoot(), 'runs')
}

function historyDir(): string {
  return join(stateRoot(), 'history', 'runs')
}

function runDir(runId: string): string {
  return join(runsDir(), runId)
}

function agentsDir(runId: string): string {
  return join(runDir(runId), 'agents')
}

function runPath(runId: string): string {
  return join(runDir(runId), 'run.json')
}

function agentPath(runId: string, agentId: string): string {
  return join(agentsDir(runId), `${agentId}.json`)
}

function runHistoryPath(runId: string): string {
  return join(historyDir(), `${runId}.json`)
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function nowMs(): number {
  return Date.now()
}

// block synchronously via Atomics.wait; the lock retry loop below is not async
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

export function withRunsLock<T>(fn: () => T): T {
  mkdirSync(stateRoot(), { recursive: true })
  const lockPath = join(stateRoot(), '.runs.lock')
  const staleMs = 5000
  const deadline = Date.now() + staleMs

  while (true) {
    try {
      const fd = openSync(lockPath, 'wx', 0o600)
      try {
        writeFileSync(fd, JSON.stringify({ pid: process.pid, created_at: nowIso() }))
      } finally {
        closeSync(fd)
      }
      break
    } catch {
      try {
        const age = Date.now() - statSync(lockPath).mtimeMs
        if (age > staleMs) unlinkSync(lockPath)
      } catch {
        // lock disappeared between attempts
      }

      if (Date.now() > deadline) throw new Error(`Timed out waiting for runs lock: ${lockPath}`)
      sleepSync(25)
    }
  }

  try {
    return fn()
  } finally {
    try { unlinkSync(lockPath) } catch { /* lock already gone */ }
  }
}

// chmod 0o600 is a no-op on Windows but does not throw, so this ports as-is.
function atomicWriteJson(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmpPath = `${path}.tmp`
  writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8')
  chmodSync(tmpPath, 0o600)
  renameSync(tmpPath, path)
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function fallbackRunName(id: string): string {
  return id ? `Run ${id.slice(0, 8)}` : 'Untitled run'
}

function normalizeTaskStatus(value: unknown): TaskStatus {
  if (value === 'queued' || value === 'working' || value === 'done' || value === 'failed' || value === 'blocked') return value
  return 'queued'
}

function normalizePermissions(value: unknown): Permissions {
  return value === 'skip' ? 'skip' : 'ask'
}

function normalizeRole(value: unknown): AgentRole {
  return value === 'worker' ? 'worker' : 'root'
}

function normalizeRun(raw: Record<string, unknown>): PtyRunRecord {
  const id = asString(raw.id)
  return {
    id,
    name: asString(raw.name).trim() || fallbackRunName(id),
    status: raw.status === 'ended' ? 'ended' : 'running',
    root_agent_id: asString(raw.root_agent_id),
    working_dir: asString(raw.working_dir),
    started_at: asString(raw.started_at, nowIso()),
    ended_at: asNullableString(raw.ended_at),
  }
}

function normalizeAgent(raw: Record<string, unknown>): PtyAgentRecord {
  const id = asString(raw.id)
  return {
    id,
    run_id: asString(raw.run_id),
    nickname: asString(raw.nickname, id),
    provider: isProvider(raw.provider) ? raw.provider : 'cc',
    model: asString(raw.model),
    role: normalizeRole(raw.role),
    working_dir: asString(raw.working_dir),
    task: asString(raw.task),
    task_status: normalizeTaskStatus(raw.task_status),
    pid: typeof raw.pid === 'number' && Number.isFinite(raw.pid) ? raw.pid : 0,
    permissions: normalizePermissions(raw.permissions),
    started_at: asString(raw.started_at, nowIso()),
    ended_at: asNullableString(raw.ended_at),
  }
}

function normalizeRunHistory(raw: Record<string, unknown>): PtyRunHistoryRecord {
  return {
    id: asString(raw.id),
    name: asString(raw.name).trim() || fallbackRunName(asString(raw.id)),
    status: raw.status === 'stale' ? 'stale' : 'ended',
    working_dir: asString(raw.working_dir),
    started_at: asString(raw.started_at, nowIso()),
    ended_at: asNullableString(raw.ended_at),
    archived_at: asString(raw.archived_at, nowIso()),
    agent_count: typeof raw.agent_count === 'number' && Number.isFinite(raw.agent_count)
      ? Math.max(0, Math.floor(raw.agent_count))
      : 0,
    root_provider: isProvider(raw.root_provider) ? raw.root_provider : null,
  }
}

// User/model text is redacted before it ever hits disk, same as the unix registry.
function redactAgent(agent: PtyAgentRecord): PtyAgentRecord {
  return { ...agent, task: redactSecrets(agent.task) }
}

function isRunEnded(run: PtyRunRecord): boolean {
  return run.status === 'ended' || run.ended_at !== null
}

function writeRunUnlocked(run: PtyRunRecord): void {
  atomicWriteJson(runPath(run.id), run)
}

function readRunUnlocked(runId: string): PtyRunRecord {
  let raw: string
  try {
    raw = readFileSync(runPath(runId), 'utf-8')
  } catch {
    throw new Error(`Run not found: ${runId}`)
  }
  return normalizeRun(JSON.parse(raw) as Record<string, unknown>)
}

function writeAgentUnlocked(agent: PtyAgentRecord): void {
  atomicWriteJson(agentPath(agent.run_id, agent.id), redactAgent(agent))
}

function readAgentUnlocked(runId: string, agentId: string): PtyAgentRecord {
  return normalizeAgent(JSON.parse(readFileSync(agentPath(runId, agentId), 'utf-8')) as Record<string, unknown>)
}

export function writeRun(run: PtyRunRecord): void {
  withRunsLock(() => writeRunUnlocked(run))
}

export function readRun(runId: string): PtyRunRecord {
  return readRunUnlocked(runId)
}

export function updateRun(runId: string, patch: Partial<PtyRunRecord>): void {
  withRunsLock(() => writeRunUnlocked({ ...readRunUnlocked(runId), ...patch }))
}

export function writeAgent(agent: PtyAgentRecord): void {
  withRunsLock(() => writeAgentUnlocked(agent))
}

export function readAgent(runId: string, agentId: string): PtyAgentRecord {
  return readAgentUnlocked(runId, agentId)
}

export function updateAgent(runId: string, agentId: string, patch: Partial<PtyAgentRecord>): void {
  withRunsLock(() => writeAgentUnlocked({ ...readAgentUnlocked(runId, agentId), ...patch }))
}

function listRunsUnlocked(includeEnded = false): PtyRunRecord[] {
  let entries: string[]
  try {
    entries = readdirSync(runsDir())
  } catch {
    return []
  }
  const runs: PtyRunRecord[] = []
  for (const entry of entries) {
    if (!existsSync(runPath(entry))) continue
    try {
      const run = readRunUnlocked(entry)
      if (!includeEnded && isRunEnded(run)) continue
      runs.push(run)
    } catch {
      // skip malformed run folders
    }
  }
  return runs.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
}

function listAgentsForRunIds(runIds: string[]): PtyAgentRecord[] {
  const agents: PtyAgentRecord[] = []
  for (const id of runIds) {
    let files: string[]
    try {
      files = readdirSync(agentsDir(id))
    } catch {
      continue
    }
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      try {
        agents.push(readAgentUnlocked(id, file.slice(0, -5)))
      } catch {
        // skip malformed agent records
      }
    }
  }
  return agents.sort((a, b) => {
    if (a.run_id !== b.run_id) return a.run_id.localeCompare(b.run_id)
    if (a.role !== b.role) return a.role === 'root' ? -1 : 1
    return new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
  })
}

export function listRuns(): PtyRunRecord[] {
  return listRunsUnlocked()
}

export function listAgents(runId?: string): PtyAgentRecord[] {
  return listAgentsForRunIds(runId ? [runId] : listRuns().map(run => run.id))
}

export function findAgent(agentId: string): PtyAgentRecord {
  for (const run of listRuns()) {
    try {
      return readAgentUnlocked(run.id, agentId)
    } catch {
      // agent belongs to another run
    }
  }
  throw new Error(`Agent not found: ${agentId}`)
}

export function listRunHistory(): PtyRunHistoryRecord[] {
  let entries: string[]
  try {
    entries = readdirSync(historyDir())
  } catch {
    return []
  }
  const history: PtyRunHistoryRecord[] = []
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue
    try {
      history.push(normalizeRunHistory(JSON.parse(readFileSync(join(historyDir(), entry), 'utf-8')) as Record<string, unknown>))
    } catch {
      // skip malformed history records
    }
  }
  return history.sort((a, b) => new Date(b.archived_at).getTime() - new Date(a.archived_at).getTime())
}

// Mark one agent ended. Returns the updated record so callers can report it.
export function endAgent(runId: string, agentId: string, endedAt = nowIso()): PtyAgentRecord {
  updateAgent(runId, agentId, { ended_at: endedAt, task_status: 'done' })
  return readAgent(runId, agentId)
}

// End the run once no live (non-ended) agent remains, mirroring the unix
// endRunIfNoLiveAgents (src/core/runs.ts). There are no headless agents on Windows.
export function endRunIfNoLiveAgents(runId: string, endedAt = nowIso()): PtyRunRecord {
  return withRunsLock(() => {
    const run = readRunUnlocked(runId)
    if (isRunEnded(run)) return run
    const live = listAgentsForRunIds([runId]).filter(agent => !agent.ended_at)
    if (live.length > 0) return run
    const ended: PtyRunRecord = { ...run, status: 'ended', ended_at: endedAt }
    writeRunUnlocked(ended)
    return ended
  })
}

function buildRunHistoryRecord(run: PtyRunRecord, status: RunHistoryStatus): PtyRunHistoryRecord {
  const agents = listAgentsForRunIds([run.id])
  const root = agents.find(agent => agent.role === 'root' && (!run.root_agent_id || agent.id === run.root_agent_id))
    ?? agents.find(agent => agent.role === 'root')
    ?? null
  return {
    id: run.id,
    name: run.name,
    status,
    working_dir: run.working_dir,
    started_at: run.started_at,
    ended_at: run.ended_at,
    archived_at: nowIso(),
    agent_count: agents.length,
    root_provider: root?.provider ?? null,
  }
}

export function archiveAndRemoveRun(runId: string, status: RunHistoryStatus): PtyRunHistoryRecord {
  return withRunsLock(() => {
    const run = readRunUnlocked(runId)
    const record = buildRunHistoryRecord(run, status)
    atomicWriteJson(runHistoryPath(record.id), record)
    rmSync(runDir(runId), { recursive: true, force: true })
    return record
  })
}

export function isEnded(run: PtyRunRecord): boolean {
  return isRunEnded(run)
}

// Reconcile-on-start: every run dir present at boot belongs to a dead prior MCP
// process whose ConPTYs are gone, so archive it. Live runs go to history as
// 'stale' (the process that owned them is gone, like a vanished tmux target);
// any already-ended leftovers go as 'ended'. This is the win analogue of the unix
// autoCleanupRuns stale sweep, keyed on "previous process is gone" rather than
// "tmux target is gone".
export function reconcileOnStart(): { archived: string[] } {
  const archived: string[] = []
  for (const run of listRunsUnlocked(true)) {
    try {
      const record = archiveAndRemoveRun(run.id, isRunEnded(run) ? 'ended' : 'stale')
      archived.push(record.id)
    } catch {
      // try again next boot
    }
  }
  return { archived }
}
