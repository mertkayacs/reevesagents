// ConPTY agent-run runtime: the tmux-free replacement for src/core/runtime.ts. Each
// agent is a provider CLI spawned into its own ConPTY via @lydell/node-pty, hosted
// as a child of this process. There is no external daemon like tmux, so agents live
// exactly as long as this process (the MCP server): closing the MCP session tears
// every ConPTY down. That makes this a session-scoped driver, correct for "a host
// CLI drives helper CLIs during its working session" and not a detached fleet
// manager (that stays the tmux package's job).
//
// The in-memory `live` map is the authority for "can I drive this now": every drive
// op requires the agent to be present there. A registry record without a live entry
// means the pty died (usually because a previous MCP session closed), so we reject
// the op instead of silently no-op'ing.

import pty from '@lydell/node-pty'
import { randomUUID } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import stripAnsi from 'strip-ansi'
import type { AgentRole, AuthMode, Effort, Permissions, Provider } from '../shared/types.js'
import { buildCommand } from '../shared/provider-build.js'
import { redactSecrets } from '../shared/redact.js'
import { resolveBin } from './availability.js'
import { RingBuffer, type OutputBuffer } from './buffer.js'
import { keyBytes, type AllowedKey } from './keys.js'
import type { PtyAgentRecord, PtyRunRecord } from './types-win.js'
import * as reg from './registry.js'

type IPtyLike = ReturnType<typeof pty.spawn>

export interface WinAgentConfig {
  provider: Provider
  model: string
  task: string
  nickname?: string
  working_dir?: string
  permissions?: Permissions
  auth_mode?: AuthMode
  effort?: Effort
  extra_args?: string[]
}

export interface StartRunRequest {
  name: string
  working_dir: string
  root: WinAgentConfig
}

export interface SpawnWorkerRequest extends WinAgentConfig {
  run_id: string
}

interface LivePty {
  term: IPtyLike
  buf: OutputBuffer
  runId: string
}

// Config knobs are hardcoded because native Windows ships no config tools. They match the unix
// defaults (src/core/config.ts DEFAULT_GLOBAL).
const DEFAULT_PERMISSIONS: Permissions = 'ask'
const READY_DELAY_MS = 5000
const POST_PASTE_ENTER_DELAY_MS = 1000
const STARTUP_READY_POLL_MS = 1000
const STARTUP_READY_TIMEOUT_MS = 20_000
const PTY_COLS = 120
const PTY_ROWS = 30

// process-memory authority: agentId -> its live ConPTY (see file header).
const live = new Map<string, LivePty>()
const lastPasteAt = new Map<string, number>()

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

// How to turn our argv into an OS process. On Windows, provider bins are .cmd shims
// that Node cannot exec directly, so we launch through cmd.exe /d /c <cmdPath>. We do
// NOT pass /s: it strips the first and last quote of the whole string after /c, which
// corrupts the command line when node-pty has already quoted a cmdPath containing
// spaces (e.g. C:\Program Files\...). On other platforms we run the resolved path
// directly, which keeps the runtime exercisable off Windows. Injectable so tests
// point the spawn at a stub CLI.
export interface SpawnPlan {
  file: string
  args: string[]
}

export type PlanSpawn = (_argv: string[]) => SpawnPlan
export type SpawnPty = typeof pty.spawn

function defaultPlanSpawn(argv: string[]): SpawnPlan {
  const [bin, ...rest] = argv
  const { cmdPath } = resolveBin(bin ?? '')
  if (process.platform === 'win32') {
    const comspec = process.env.ComSpec ?? 'cmd.exe'
    return { file: comspec, args: ['/d', '/c', cmdPath, ...rest] }
  }
  return { file: cmdPath, args: rest }
}

// Injectable seams mirror the unix runtime's RuntimeDriver: planSpawn lets tests
// aim the spawn at a stub CLI (real ConPTY, controlled command); spawnPty lets a
// unit test hand in a fake IPty to assert exact write bytes deterministically.
let planSpawn: PlanSpawn = defaultPlanSpawn
let spawnPty: SpawnPty = pty.spawn

export function setPlanSpawn(fn: PlanSpawn): void {
  planSpawn = fn
}

export function setSpawnPty(fn: SpawnPty): void {
  spawnPty = fn
}

// Reset the seams and tear down every live pty. Tests call this in afterEach so no
// ConPTY leaks across tests.
export function resetRuntimeSeams(): void {
  planSpawn = defaultPlanSpawn
  spawnPty = pty.spawn
  for (const [, l] of live) {
    try { l.term.kill() } catch { /* already exited */ }
  }
  live.clear()
  lastPasteAt.clear()
}

function expandHome(p: string): string {
  if (p === '~') return homedir()
  if (p.startsWith('~/')) return join(homedir(), p.slice(2))
  return p
}

function resolveWorkingDir(requested: string | undefined, fallback: string): string {
  if (!requested) return fallback
  const expanded = expandHome(requested.trim())
  if (!expanded) return fallback
  if (existsSync(expanded) && statSync(expanded).isDirectory()) return expanded
  throw new Error(`Working directory does not exist: ${expanded}`)
}

function normalizePaneOutput(output: string): string {
  return stripAnsi(output).replace(/\s+/g, ' ').trim().toLowerCase()
}

// Ported verbatim in spirit from src/core/runtime.ts paneLooksReady: the only
// change is the buffer source (our ring buffer instead of tmux capture-pane). The
// ready markers are English-only (same as the unix runtime); a non-English CLI falls
// through to the idle-output check and the startup timeout, which still delivers the
// task, just after the full wait rather than on an early ready match.
function paneLooksReady(output: string, previousOutput: string): boolean {
  const current = normalizePaneOutput(output)
  if (!current) return false
  if (/\bready\b/.test(current)) return true
  if (current.includes('type a message') || current.includes('enter your prompt')) return true
  if (current.includes('what would you like') || current.includes('what do you want')) return true
  return !!previousOutput && current === normalizePaneOutput(previousOutput)
}

function own(agentId: string): LivePty {
  const l = live.get(agentId)
  if (!l) throw new Error(`agent ${agentId} is not owned by this MCP session (it ended when the previous session closed)`)
  return l
}

export function isAgentLive(agentId: string): boolean {
  return live.has(agentId)
}

function markWorkingIfQueued(runId: string, agentId: string): void {
  try {
    const agent = reg.readAgent(runId, agentId)
    if (!agent.ended_at && agent.task_status === 'queued') reg.updateAgent(runId, agentId, { task_status: 'working' })
  } catch {
    // agent record gone (run archived); nothing to update
  }
}

// A provider exited on its own (crash, /exit, finished). Drop it from live and mirror
// the unix onExit semantics: end the agent, and if it was the last live agent, end
// and archive the run. Fully defensive because kill/stop may already have removed the
// records before this fires.
function onAgentExit(runId: string, agentId: string): void {
  live.delete(agentId)
  lastPasteAt.delete(agentId)
  try { reg.endAgent(runId, agentId) } catch { /* record already gone */ }
  try {
    if (reg.isEnded(reg.endRunIfNoLiveAgents(runId))) reg.archiveAndRemoveRun(runId, 'ended')
  } catch {
    // run already archived/removed
  }
}

function createAgent(runId: string, role: AgentRole, config: WinAgentConfig, inheritedDir: string): PtyAgentRecord {
  const id = randomUUID()
  const workingDir = resolveWorkingDir(config.working_dir, inheritedDir)
  const permissions = config.permissions ?? DEFAULT_PERMISSIONS
  const argv = buildCommand({
    provider: config.provider,
    permissions,
    model: config.model,
    auth_mode: config.auth_mode,
    effort: config.effort,
    extra_args: config.extra_args,
  })
  const plan = planSpawn(argv)
  const term = spawnPty(plan.file, plan.args, {
    name: 'xterm-256color',
    cols: PTY_COLS,
    rows: PTY_ROWS,
    cwd: workingDir,
    env: process.env,
  })
  const buf = new RingBuffer()
  term.onData(data => buf.push(data))
  term.onExit(() => onAgentExit(runId, id))
  live.set(id, { term, buf, runId })

  const record: PtyAgentRecord = {
    id,
    run_id: runId,
    nickname: config.nickname?.trim() || (role === 'root' ? config.provider : `${config.provider} agent`),
    provider: config.provider,
    model: config.model,
    role,
    working_dir: workingDir,
    task: config.task.trim(),
    task_status: 'queued',
    pid: term.pid,
    permissions,
    started_at: reg.nowIso(),
    ended_at: null,
  }
  reg.writeAgent(record)
  void injectStartupTask(id, runId, config.task)
  return record
}

// After the ready delay, poll our buffer for a ready marker, then paste the task and
// press Enter. Async waits replace the unix sync-sleep (Atomics.wait) hack since the
// MCP handlers are async. Bails out quietly if the agent ends mid-startup.
async function injectStartupTask(agentId: string, runId: string, task: string): Promise<void> {
  const trimmed = task.trim()
  if (!trimmed) return
  try {
    await delay(READY_DELAY_MS)
    let previous = ''
    for (let waited = 0; waited < STARTUP_READY_TIMEOUT_MS; waited += STARTUP_READY_POLL_MS) {
      const l = live.get(agentId)
      if (!l) return
      const current = l.buf.tail(80)
      if (paneLooksReady(current, previous)) break
      previous = current
      await delay(STARTUP_READY_POLL_MS)
    }
    const pasteTarget = live.get(agentId)
    if (!pasteTarget) return
    pasteTarget.term.write(`\x1b[200~${trimmed}\x1b[201~`)
    lastPasteAt.set(agentId, Date.now())
    await delay(POST_PASTE_ENTER_DELAY_MS)
    const enterTarget = live.get(agentId)
    if (!enterTarget) return
    enterTarget.term.write(keyBytes('enter'))
    markWorkingIfQueued(runId, agentId)
  } catch {
    // agent ended before startup completed
  }
}

export function startRun(request: StartRunRequest): { run: PtyRunRecord; agents: PtyAgentRecord[] } {
  const runId = randomUUID()
  const workingDir = resolveWorkingDir(request.working_dir, process.cwd())
  const root = createAgent(runId, 'root', request.root, workingDir)
  const run: PtyRunRecord = {
    id: runId,
    name: request.name.trim() || root.nickname,
    status: 'running',
    root_agent_id: root.id,
    working_dir: workingDir,
    started_at: reg.nowIso(),
    ended_at: null,
  }
  reg.writeRun(run)
  return { run, agents: [root] }
}

export function spawnWorker(request: SpawnWorkerRequest): PtyAgentRecord {
  const run = reg.readRun(request.run_id)
  if (reg.isEnded(run)) throw new Error(`Run is ended: ${run.id}`)
  return createAgent(run.id, 'worker', request, run.working_dir)
}

export function readAgent(agentId: string, lines = 20): string {
  const l = own(agentId)
  return redactSecrets(stripAnsi(l.buf.tail(lines)).trim())
}

// Paste text at the prompt without submitting, matching the unix send_text contract.
// Bracketed paste makes multi-line text land as one paste, not line-by-line submits.
export function sendText(agentId: string, text: string): void {
  const l = own(agentId)
  l.term.write(`\x1b[200~${text}\x1b[201~`)
  lastPasteAt.set(agentId, Date.now())
  markWorkingIfQueued(l.runId, agentId)
}

export async function sendKey(agentId: string, key: AllowedKey): Promise<void> {
  const l = own(agentId)
  // Post-paste guard (src/core/runtime.ts): give the TUI time to commit a paste
  // before Enter submits it, or the first keystrokes can be dropped.
  if (key === 'enter') {
    const remaining = POST_PASTE_ENTER_DELAY_MS - (Date.now() - (lastPasteAt.get(agentId) ?? 0))
    if (remaining > 0) await delay(remaining)
  }
  l.term.write(keyBytes(key))
  markWorkingIfQueued(l.runId, agentId)
}

// Ctrl+C as a write, never kill('SIGINT'): signals throw on Windows (node-pty.d.ts).
// ConPTY delivers the ETX to the console app as Ctrl+C.
export function interrupt(agentId: string): void {
  own(agentId).term.write(keyBytes('ctrl-c'))
}

export function killAgent(agentId: string): PtyAgentRecord {
  const l = own(agentId)
  try { l.term.kill() } catch { /* already exited; no signal arg on Windows */ }
  live.delete(agentId)
  lastPasteAt.delete(agentId)
  const record = reg.endAgent(l.runId, agentId)
  if (reg.isEnded(reg.endRunIfNoLiveAgents(l.runId))) {
    try { reg.archiveAndRemoveRun(l.runId, 'ended') } catch { /* already gone */ }
  }
  return record
}

export function stopRun(runId: string): PtyRunRecord {
  const run = reg.readRun(runId)
  const endedAt = reg.nowIso()
  for (const agent of reg.listAgents(runId)) {
    const l = live.get(agent.id)
    if (l) {
      try { l.term.kill() } catch { /* already exited */ }
      live.delete(agent.id)
      lastPasteAt.delete(agent.id)
    }
    if (!agent.ended_at) reg.updateAgent(runId, agent.id, { ended_at: endedAt, task_status: 'done' })
  }
  reg.updateRun(runId, { status: 'ended', ended_at: endedAt })
  try { reg.archiveAndRemoveRun(runId, 'ended') } catch { /* already gone */ }
  return { ...run, status: 'ended', ended_at: endedAt }
}
