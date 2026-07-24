// V1 run registry: one run folder, one run.json, and per-run agent JSON.
// Storage: REEVES_REGISTRY/runs for isolated tests, otherwise ~/.reeves/runs.
// Invariant: all user/model text fields are redacted before writing.

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
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import type {
  AgentRecord,
  Message,
  Permissions,
  RunHistoryRecord,
  RunHistoryStatus,
  RunRecord,
  RunViewStatus,
  TaskStatus,
} from './types.js'
import { redactSecrets } from '../utils/display.js'
import { isProvider } from './providers.js'

export function stateRoot(): string {
  return process.env.REEVES_REGISTRY || join(homedir(), '.reeves')
}

export function runsDir(): string {
  return join(stateRoot(), 'runs')
}

function historyDir(): string {
  return join(stateRoot(), 'history', 'runs')
}

export function runDir(runId: string): string {
  return join(runsDir(), runId)
}

function agentsDir(runId: string): string {
  return join(runDir(runId), 'agents')
}

export function runPath(runId: string): string {
  return join(runDir(runId), 'run.json')
}

export function agentPath(runId: string, agentId: string): string {
  return join(agentsDir(runId), `${agentId}.json`)
}

export function runHistoryPath(runId: string): string {
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

function atomicWriteJson(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmpPath = `${path}.tmp`
  writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8')
  chmodSync(tmpPath, 0o600)
  renameSync(tmpPath, path)
}

function normalizeTaskStatus(value: unknown): TaskStatus {
  if (value === 'queued' || value === 'working' || value === 'done' || value === 'failed' || value === 'blocked') return value
  return 'queued'
}

function normalizePermissions(value: unknown): Permissions {
  return value === 'skip' ? 'skip' : 'ask'
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function fallbackRunName(id: string): string {
  return id ? `Run ${id.slice(0, 8)}` : 'Untitled run'
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function normalizeInbox(value: unknown): Message[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map(item => ({
      id: asString(item.id, randomUUID()),
      from_id: asString(item.from_id),
      text: asString(item.text),
      sent_at: asString(item.sent_at, nowIso()),
      read: typeof item.read === 'boolean' ? item.read : false,
    }))
}

function normalizeRun(raw: Record<string, unknown>): RunRecord {
  const id = asString(raw.id)
  const run: RunRecord = {
    id,
    name: asString(raw.name).trim() || fallbackRunName(id),
    status: raw.status === 'ended' ? 'ended' : 'running',
    tmux_session: asString(raw.tmux_session),
    reeves_window_id: asString(raw.reeves_window_id),
    reeves_pane_id: asString(raw.reeves_pane_id),
    root_agent_id: asString(raw.root_agent_id),
    working_dir: asString(raw.working_dir),
    preset_name: asNullableString(raw.preset_name),
    started_at: asString(raw.started_at, nowIso()),
    ended_at: asNullableString(raw.ended_at),
  }
  const reevesSession = asString(raw.reeves_session)
  if (reevesSession) run.reeves_session = reevesSession
  return run
}

function normalizeRunHistory(raw: Record<string, unknown>): RunHistoryRecord {
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

function normalizeAgent(raw: Record<string, unknown>): AgentRecord {
  const id = asString(raw.id)
  return {
    id,
    run_id: asString(raw.run_id),
    nickname: asString(raw.nickname, id),
    provider: isProvider(raw.provider) ? raw.provider : 'cc',
    model: asString(raw.model),
    role: raw.role === 'worker' ? 'worker' : 'root',
    working_dir: asString(raw.working_dir),
    task: asString(raw.task),
    task_status: normalizeTaskStatus(raw.task_status),
    task_note: asString(raw.task_note),
    tmux_session: asString(raw.tmux_session),
    tmux_window_id: asString(raw.tmux_window_id),
    tmux_pane_id: asString(raw.tmux_pane_id),
    rc_enabled: typeof raw.rc_enabled === 'boolean' ? raw.rc_enabled : false,
    permissions: normalizePermissions(raw.permissions),
    headless: raw.headless === true,
    inbox: normalizeInbox(raw.inbox),
    last_seen: typeof raw.last_seen === 'number' ? raw.last_seen : 0,
    started_at: asString(raw.started_at, nowIso()),
    ended_at: asNullableString(raw.ended_at),
  }
}

function redactAgent(agent: AgentRecord): AgentRecord {
  return {
    ...agent,
    task: redactSecrets(agent.task),
    task_note: redactSecrets(agent.task_note),
    inbox: agent.inbox.map(message => ({ ...message, text: redactSecrets(message.text) })),
  }
}

function writeRunUnlocked(run: RunRecord): string {
  const path = runPath(run.id)
  atomicWriteJson(path, run)
  return path
}

function readRunUnlocked(runId: string): RunRecord {
  try {
    const raw = readFileSync(runPath(runId), 'utf-8')
    // A missing or corrupt run reads as "not found", not a raw fs/parse error that leaks the path.
    return normalizeRun(JSON.parse(raw) as Record<string, unknown>)
  } catch {
    throw new Error(`Run not found: ${runId}`)
  }
}

function writeAgentUnlocked(agent: AgentRecord): string {
  const path = agentPath(agent.run_id, agent.id)
  atomicWriteJson(path, redactAgent(agent))
  return path
}

function writeRunHistoryUnlocked(record: RunHistoryRecord): string {
  const path = runHistoryPath(record.id)
  atomicWriteJson(path, record)
  return path
}

function readAgentUnlocked(runId: string, agentId: string): AgentRecord {
  try {
    return normalizeAgent(JSON.parse(readFileSync(agentPath(runId, agentId), 'utf-8')) as Record<string, unknown>)
  } catch {
    throw new Error(`Agent not found: ${agentId}`)
  }
}

export function writeRun(run: RunRecord): string {
  return withRunsLock(() => writeRunUnlocked(run))
}

export function readRun(runId: string): RunRecord {
  return readRunUnlocked(runId)
}

export function updateRun(runId: string, patch: Partial<RunRecord>): void {
  withRunsLock(() => {
    writeRunUnlocked({ ...readRunUnlocked(runId), ...patch })
  })
}

function isRunEnded(run: RunRecord): boolean {
  return run.status === 'ended' || run.ended_at !== null
}

function listRunsUnlocked(includeEnded = false): RunRecord[] {
  let entries: string[]
  try {
    entries = readdirSync(runsDir())
  } catch {
    return []
  }

  const runs: RunRecord[] = []
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

function listRunHistoryUnlocked(): RunHistoryRecord[] {
  let entries: string[]
  try {
    entries = readdirSync(historyDir())
  } catch {
    return []
  }

  const history: RunHistoryRecord[] = []
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

export function listRuns(): RunRecord[] {
  return listRunsUnlocked()
}

// The current workspace: the most recently started run that is still active.
// The `add` command uses it so agents can join without naming a run. Returns
// null when nothing is running, since listRuns already drops ended runs.
export function latestActiveRun(): RunRecord | null {
  const active = listRuns()
  if (active.length === 0) return null
  return active.reduce((latest, run) => (run.started_at > latest.started_at ? run : latest))
}

export function listRunHistory(): RunHistoryRecord[] {
  return listRunHistoryUnlocked()
}

export function removeRun(runId: string): void {
  withRunsLock(() => {
    rmSync(runDir(runId), { recursive: true, force: true })
  })
}

export function deleteAgent(agentId: string): AgentRecord {
  return withRunsLock(() => {
    const runs = listRunsUnlocked()
    for (const run of runs) {
      try {
        const agent = readAgentUnlocked(run.id, agentId)
        if (!agent.ended_at) throw new Error('Stop agent before deleting it')
        rmSync(agentPath(run.id, agent.id), { force: true })
        return agent
      } catch (err) {
        if (err instanceof Error && err.message === 'Stop agent before deleting it') throw err
      }
    }
    throw new Error(`Agent not found: ${agentId}`)
  })
}

export function deleteRunHistory(runId: string): void {
  withRunsLock(() => {
    rmSync(runHistoryPath(runId), { force: true })
  })
}

export function computeRunStatus(run: RunRecord, tmuxSessionExists = true): RunViewStatus {
  if (run.status === 'ended' || run.ended_at !== null) return 'ended'
  return tmuxSessionExists ? 'running' : 'stale'
}

export function writeAgent(agent: AgentRecord): string {
  return withRunsLock(() => writeAgentUnlocked(agent))
}

export function readAgent(runId: string, agentId: string): AgentRecord {
  return readAgentUnlocked(runId, agentId)
}

export function updateAgent(runId: string, agentId: string, patch: Partial<AgentRecord>): void {
  withRunsLock(() => {
    writeAgentUnlocked({ ...readAgentUnlocked(runId, agentId), ...patch })
  })
}

function listAgentsForRunIds(runIds: string[]): AgentRecord[] {
  const agents: AgentRecord[] = []

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

function buildRunHistoryRecord(run: RunRecord, status: RunHistoryStatus): RunHistoryRecord {
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

export function archiveAndRemoveRun(runId: string, status: RunHistoryStatus): RunHistoryRecord {
  return withRunsLock(() => {
    const run = readRunUnlocked(runId)
    const record = buildRunHistoryRecord(run, status)
    writeRunHistoryUnlocked(record)
    rmSync(runDir(runId), { recursive: true, force: true })
    return record
  })
}

export function endRunIfNoLiveAgents(runId: string, endedAt = nowIso()): RunRecord {
  return withRunsLock(() => {
    const run = readRunUnlocked(runId)
    if (run.status === 'ended' || run.ended_at !== null) return run
    // Headless agents (a host CLI head with no tmux window) do not keep a run
    // alive on their own; once the last windowed worker ends, the head-run must
    // tear down so its tmux session and run record are not leaked.
    const liveAgents = listAgentsForRunIds([runId]).filter(agent => !agent.ended_at && !agent.headless)
    if (liveAgents.length > 0) return run
    const endedRun: RunRecord = { ...run, status: 'ended', ended_at: endedAt }
    writeRunUnlocked(endedRun)
    return endedRun
  })
}

export function listAgents(runId?: string): AgentRecord[] {
  return listAgentsForRunIds(runId ? [runId] : listRuns().map(run => run.id))
}

export function findAgent(agentId: string): AgentRecord {
  for (const run of listRuns()) {
    try {
      return readAgentUnlocked(run.id, agentId)
    } catch {
      // agent belongs to another run
    }
  }
  throw new Error(`Agent not found: ${agentId}`)
}

export function heartbeatAgent(runId: string, agentId: string): void {
  updateAgent(runId, agentId, { last_seen: nowMs() })
}

export function appendAgentInbox(runId: string, agentId: string, message: Message): void {
  withRunsLock(() => {
    const agent = readAgentUnlocked(runId, agentId)
    agent.inbox.push(message)
    writeAgentUnlocked(agent)
  })
}

export function readAgentInbox(runId: string, agentId: string): Message[] {
  return withRunsLock(() => {
    const agent = readAgentUnlocked(runId, agentId)
    const messages = agent.inbox
    agent.inbox = []
    writeAgentUnlocked(agent)
    return messages
  })
}

function defaultTmuxSessionExists(session: string): boolean {
  if (!session) return false
  try {
    const result = spawnSync('tmux', ['has-session', '-t', session], { stdio: 'ignore' })
    return result.status === 0
  } catch {
    return false
  }
}

function defaultTmuxAvailable(): boolean {
  try {
    const result = spawnSync('tmux', ['-V'], { stdio: 'ignore' })
    return result.status === 0
  } catch {
    return false
  }
}

function defaultTmuxTargetExists(target: string): boolean {
  if (!target) return false
  try {
    const format = target.startsWith('%') ? '#{pane_id}' : '#{window_id}'
    const result = spawnSync('tmux', ['display-message', '-p', '-t', target, format], { encoding: 'utf8' })
    return result.status === 0 && result.stdout.trim() === target
  } catch {
    return false
  }
}

export interface AutoCleanupOptions {
  sessionExists?: (_session: string) => boolean
  targetExists?: (_target: string) => boolean
  tmuxAvailable?: () => boolean
  cleanStale?: boolean
}

export function runHasLiveTmuxTarget(run: RunRecord, options: AutoCleanupOptions = {}): boolean {
  const targetExists = options.targetExists ?? defaultTmuxTargetExists
  const sessionExists = options.sessionExists ?? defaultTmuxSessionExists
  const agents = listAgents(run.id).filter(agent => !agent.ended_at)
  const windowedAgents = agents.filter(agent => !agent.headless && agent.tmux_window_id)
  if (windowedAgents.length > 0) return windowedAgents.some(agent => targetExists(agent.tmux_window_id))
  return sessionExists(run.tmux_session)
}

// Removes state directories for runs whose status is 'ended' or whose tmux
// run-owned tmux windows no longer exist. Called from the TUI on startup and on every
// Runs refresh tick. If tmux is not installed at all, only ended runs are
// cleaned (the stale check is skipped) so a missing-tmux environment never
// nukes the user's run records. Per-run failures are swallowed.
export function autoCleanupRuns(options: AutoCleanupOptions = {}): { removed: string[]; archived: string[] } {
  const sessionExists = options.sessionExists ?? defaultTmuxSessionExists
  const targetExists = options.targetExists ?? defaultTmuxTargetExists
  // If the caller injected tmux checks (test drivers), treat tmux as available and skip the real probe.
  const tmuxAvailable = options.sessionExists || options.targetExists
    ? () => true
    : options.tmuxAvailable ?? defaultTmuxAvailable
  const haveTmux = options.cleanStale === false ? false : tmuxAvailable()
  const removed: string[] = []
  const archived: string[] = []
  const runs = listRunsUnlocked(true)
  for (const run of runs) {
    const isEnded = isRunEnded(run)
    const isStale = !isEnded && haveTmux && !runHasLiveTmuxTarget(run, { sessionExists, targetExists })
    if (!isEnded && !isStale) continue
    try {
      const record = archiveAndRemoveRun(run.id, isStale ? 'stale' : 'ended')
      removed.push(run.id)
      archived.push(record.id)
    } catch {
      // try again next refresh
    }
  }
  return { removed, archived }
}
