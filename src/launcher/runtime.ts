// Tmux spawner runtime: one run owns one tmux session with independent CLI agents.
// Inputs: run/agent configs. Outputs: run and agent JSON records plus tmux side effects.
// Invariant: stored tmux targets use stable window/pane ids, never mutable indexes.

import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import stripAnsi from 'strip-ansi'
import type {
  AgentRecord,
  AgentRole,
  AuthMode,
  Effort,
  Permissions,
  Provider,
  RunRecord,
} from '../state/types.js'
import {
  agentPath,
  endRunIfNoLiveAgents,
  findAgent,
  listAgents,
  nowIso,
  nowMs,
  readAgent,
  readRun,
  removeRun,
  updateAgent,
  updateRun,
  writeAgent,
  writeRun,
} from '../state/runs.js'
import { loadConfig } from '../state/config.js'
import { buildCommand, detectAvailable, isProvider } from './providers.js'
import { resolveWorkingDir, shellQuote } from './provider-launch.js'
import { providerDisplayName, redactSecrets } from '../utils/display.js'

export interface AgentLaunchConfig {
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

export interface StartRunRequest {
  mode?: 'spawner'
  name: string
  working_dir: string
  root: AgentLaunchConfig
  workers?: AgentLaunchConfig[]
  preset_name?: string | null
  ready_delay_ms?: number
}

export interface SpawnWorkerRequest extends AgentLaunchConfig {
  run_id: string
  ready_delay_ms?: number
}

export interface RuntimeDriver {
  tmux(_args: string[], _input?: string): string
  delay(_fn: () => void, _ms: number): void
}

export interface RuntimeOptions {
  driver?: RuntimeDriver
  available?: Record<Provider, boolean>
}

export interface TmuxIds {
  windowId: string
  paneId: string
}

export const ALLOWED_KEYS = [
  'enter',
  'escape',
  'backspace',
  'tab',
  'space',
  'up',
  'down',
  'left',
  'right',
  'ctrl-c',
] as const

export type AllowedKey = typeof ALLOWED_KEYS[number]

const realDriver: RuntimeDriver = {
  tmux(args, input) {
    return execFileSync('tmux', args, {
      encoding: 'utf8',
      input,
      stdio: input === undefined ? ['ignore', 'pipe', 'pipe'] : ['pipe', 'pipe', 'pipe'],
    }).trim()
  },
  delay(fn, ms) {
    setTimeout(fn, ms)
  },
}

const POST_PASTE_ENTER_DELAY_MS = 1000
const STARTUP_READY_POLL_MS = 1000
const STARTUP_READY_TIMEOUT_MS = 20_000
const lastPasteAtByPane = new Map<string, number>()

function sleepSync(ms: number): void {
  const buffer = new SharedArrayBuffer(4)
  const view = new Int32Array(buffer)
  Atomics.wait(view, 0, 0, ms)
}

function waitAfterPaste(driver: RuntimeDriver): void {
  if (driver === realDriver) sleepSync(POST_PASTE_ENTER_DELAY_MS)
  else driver.delay(() => {}, POST_PASTE_ENTER_DELAY_MS)
}

function normalizePaneOutput(output: string): string {
  return stripAnsi(output).replace(/\s+/g, ' ').trim().toLowerCase()
}

function paneLooksReady(output: string, previousOutput: string): boolean {
  const current = normalizePaneOutput(output)
  if (!current) return false
  if (/\bready\b/.test(current)) return true
  if (current.includes('type a message') || current.includes('enter your prompt')) return true
  if (current.includes('what would you like') || current.includes('what do you want')) return true
  return !!previousOutput && current === normalizePaneOutput(previousOutput)
}

function pasteTextToPane(driver: RuntimeDriver, paneId: string, text: string): void {
  const bufferName = `reeves_${randomUUID().slice(0, 8)}`
  driver.tmux(['load-buffer', '-b', bufferName, '-'], text)
  try {
    driver.tmux(['paste-buffer', '-b', bufferName, '-t', paneId])
  } finally {
    try { driver.tmux(['delete-buffer', '-b', bufferName]) } catch { /* buffer already gone */ }
  }
}

function sanitizeName(raw: string): string {
  const cleaned = raw.trim().replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 40)
  return cleaned || 'run'
}

function tmuxWindowName(provider: Provider, nickname: string): string {
  return sanitizeName(nickname || provider).slice(0, 64)
}

function tmuxRunSessionName(runId: string, rawName: string): string {
  return `reeves-${sanitizeName(rawName).slice(0, 24)}-${runId.slice(0, 8)}`.slice(0, 64)
}

function childProcessOutput(err: unknown): string {
  if (typeof err !== 'object' || err === null) return ''
  const maybe = err as { stderr?: unknown; stdout?: unknown }
  const stderr = Buffer.isBuffer(maybe.stderr) ? maybe.stderr.toString('utf8').trim() : ''
  if (stderr) return stderr
  const stdout = Buffer.isBuffer(maybe.stdout) ? maybe.stdout.toString('utf8').trim() : ''
  return stdout
}

export function parseTmuxIds(output: string): TmuxIds {
  const [windowId, paneId] = output.trim().split(/\s+/)
  if (!windowId?.startsWith('@') || !paneId?.startsWith('%')) {
    throw new Error(`Could not parse tmux ids from: ${output}`)
  }
  return { windowId, paneId }
}

function readDisplayIds(driver: RuntimeDriver, target?: string): TmuxIds | null {
  try {
    const args = ['display-message', '-p']
    if (target) args.push('-t', target)
    args.push('#{window_id} #{pane_id}')
    return parseTmuxIds(driver.tmux(args))
  } catch {
    return null
  }
}

function requireProvider(provider: Provider, available: Record<Provider, boolean>): void {
  if (!isProvider(provider)) throw new Error(`Unsupported provider: ${String(provider)}`)
  if (!available[provider]) throw new Error(`${providerDisplayName(provider)} not found on PATH`)
}

function pickReevesAnchor(driver: RuntimeDriver): { sessionName: string; windowId: string; paneId: string } {
  if (process.env.TMUX) {
    try {
      const sessionName = driver.tmux(['display-message', '-p', '#S']).trim()
      const ids = readDisplayIds(driver)
      if (sessionName && ids) {
        return { sessionName, windowId: ids.windowId, paneId: ids.paneId }
      }
    } catch { /* fall through to fallback */ }
  }
  const fallbackName = 'reeves'
  try {
    driver.tmux(['new-session', '-d', '-s', fallbackName, '-n', 'reeves'])
  } catch { /* session may already exist */ }
  let ids = readDisplayIds(driver, `${fallbackName}:reeves`)
  if (!ids) {
    try { driver.tmux(['new-window', '-d', '-t', fallbackName, '-n', 'reeves']) } catch { /* anchor may already exist */ }
    ids = readDisplayIds(driver, `${fallbackName}:reeves`)
  }
  return { sessionName: fallbackName, windowId: ids?.windowId ?? '', paneId: ids?.paneId ?? '' }
}

function createRunSessionWithReevesTab(
  driver: RuntimeDriver,
  tmuxSession: string,
  reevesAnchor: { sessionName: string; windowId: string },
  workingDir: string,
): void {
  driver.tmux(['new-session', '-d', '-s', tmuxSession, '-n', 'reeves', '-c', workingDir])
  const source = reevesAnchor.windowId || `${reevesAnchor.sessionName}:reeves`
  try {
    driver.tmux(['link-window', '-k', '-s', source, '-t', `${tmuxSession}:0`])
  } catch {
    // Keep the placeholder window if the TUI window cannot be linked.
  }
}

function terminalShellCommand(config: AgentLaunchConfig, permissions: Permissions): string {
  const cmd = buildCommand({
    provider: config.provider,
    permissions,
    model: config.model,
    auth_mode: config.auth_mode,
    effort: config.effort,
    rc_enabled: false,
  })
  return `exec ${cmd.map(shellQuote).join(' ')}`
}

function sendDelayedStartupInput(
  driver: RuntimeDriver,
  agent: AgentRecord,
  config: AgentLaunchConfig,
  readyDelayMs: number,
): void {
  const task = config.task.trim()

  function sendStartupTask(): void {
    pasteTextToPane(driver, agent.tmux_pane_id, task)
    lastPasteAtByPane.set(agent.tmux_pane_id, Date.now())
    waitAfterPaste(driver)
    driver.tmux(['send-keys', '-t', agent.tmux_pane_id, 'Enter'])
    const current = readAgent(agent.run_id, agent.id)
    if (!current.ended_at && current.task_status === 'queued') {
      updateAgent(agent.run_id, agent.id, { task_status: 'working' })
    }
  }

  function waitForReadyThenSend(previousOutput = '', waitedMs = 0): void {
    try {
      const output = driver.tmux(['capture-pane', '-p', '-e', '-S', '-80', '-t', agent.tmux_pane_id])
      if (paneLooksReady(output, previousOutput) || waitedMs >= STARTUP_READY_TIMEOUT_MS) {
        sendStartupTask()
        return
      }
      driver.delay(() => waitForReadyThenSend(output, waitedMs + STARTUP_READY_POLL_MS), STARTUP_READY_POLL_MS)
    } catch {
      // window may have ended before startup completed
    }
  }

  if (!task) return
  driver.delay(() => waitForReadyThenSend(), readyDelayMs)
}

function newAgentRecord(
  id: string,
  runId: string,
  tmuxSession: string,
  role: AgentRole,
  config: AgentLaunchConfig,
  workingDir: string,
  ids: TmuxIds,
  permissions: Permissions,
): AgentRecord {
  return {
    id,
    run_id: runId,
    nickname: config.nickname || (role === 'root' ? providerDisplayName(config.provider) : `${providerDisplayName(config.provider)} agent`),
    provider: config.provider,
    model: config.model,
    role,
    working_dir: workingDir,
    task: config.task.trim(),
    task_status: 'queued',
    task_note: '',
    tmux_session: tmuxSession,
    tmux_window_id: ids.windowId,
    tmux_pane_id: ids.paneId,
    rc_enabled: false,
    permissions,
    inbox: [],
    last_seen: nowMs(),
    started_at: nowIso(),
    ended_at: null,
  }
}

function createAgentWindow(
  runId: string,
  tmuxSession: string,
  role: AgentRole,
  config: AgentLaunchConfig,
  inheritedWorkingDir: string,
  readyDelayMs: number,
  driver: RuntimeDriver,
): AgentRecord {
  const cfg = loadConfig()
  const id = randomUUID()
  const workingDir = resolveWorkingDir(config.working_dir, inheritedWorkingDir)
  const permissions = config.permissions ?? cfg.global.default_permissions
  const shellCommand = terminalShellCommand(config, permissions)
  const nickname = config.nickname || providerDisplayName(config.provider)
  const output = driver.tmux([
    'new-window',
    '-d',
    '-P',
    '-F',
    '#{window_id} #{pane_id}',
    '-t',
    `${tmuxSession}:`,
    '-n',
    tmuxWindowName(config.provider, nickname),
    '-c',
    workingDir,
    shellCommand,
  ])
  const agent = newAgentRecord(id, runId, tmuxSession, role, config, workingDir, parseTmuxIds(output), permissions)
  writeAgent(agent)
  sendDelayedStartupInput(driver, agent, config, readyDelayMs)
  return agent
}

function validateAgents(configs: AgentLaunchConfig[], available: Record<Provider, boolean>): void {
  for (const config of configs) requireProvider(config.provider, available)
}

function assertSpawnerMode(mode: unknown): void {
  if (mode !== undefined && mode !== 'spawner') {
    throw new Error('Only spawner runs are available in this package')
  }
}

export function startRun(request: StartRunRequest, options: RuntimeOptions = {}): { run: RunRecord, agents: AgentRecord[] } {
  assertSpawnerMode(request.mode)
  const cfg = loadConfig()
  const driver = options.driver ?? realDriver
  const available = options.available ?? detectAvailable()
  const workers = request.workers ?? []
  validateAgents([request.root, ...workers], available)

  const runId = randomUUID()
  const readyDelayMs = request.ready_delay_ms ?? cfg.global.ready_delay_ms
  const workingDir = resolveWorkingDir(request.working_dir, process.cwd())

  const reevesAnchor = pickReevesAnchor(driver)
  const tmuxSession = tmuxRunSessionName(runId, request.name)
  let createdRunSession = false

  try {
    createRunSessionWithReevesTab(driver, tmuxSession, reevesAnchor, workingDir)
    createdRunSession = true

    const root = createAgentWindow(runId, tmuxSession, 'root', request.root, workingDir, readyDelayMs, driver)
    const run: RunRecord = {
      id: runId,
      mode: 'spawner',
      name: request.name,
      status: 'running',
      tmux_session: tmuxSession,
      reeves_session: reevesAnchor.sessionName,
      reeves_window_id: reevesAnchor.windowId,
      reeves_pane_id: reevesAnchor.paneId,
      root_agent_id: root.id,
      working_dir: workingDir,
      preset_name: request.preset_name ?? null,
      started_at: nowIso(),
      ended_at: null,
    }
    writeRun(run)
    const workerAgents = workers.map(worker => {
      return createAgentWindow(runId, tmuxSession, 'worker', worker, workingDir, readyDelayMs, driver)
    })
    return { run, agents: [root, ...workerAgents] }
  } catch (err) {
    if (createdRunSession) {
      try { driver.tmux(['kill-session', '-t', tmuxSession]) } catch { /* session may not exist */ }
    }
    removeRun(runId)
    const detail = childProcessOutput(err) || (err instanceof Error ? err.message : 'tmux returned a non-zero exit code')
    throw new Error(`Failed to start run ${request.name}: ${detail}`, { cause: err })
  }
}

export function spawnWorker(request: SpawnWorkerRequest, options: RuntimeOptions = {}): AgentRecord {
  const cfg = loadConfig()
  const driver = options.driver ?? realDriver
  const available = options.available ?? detectAvailable()
  requireProvider(request.provider, available)
  const run = readRun(request.run_id)
  if (run.status === 'ended' || run.ended_at) throw new Error(`Run is ended: ${run.id}`)
  if (run.mode !== 'spawner') {
    throw new Error('Run not found')
  }
  return createAgentWindow(
    run.id,
    run.tmux_session,
    'worker',
    request,
    run.working_dir,
    request.ready_delay_ms ?? cfg.global.ready_delay_ms,
    driver,
  )
}

export function openReeves(runId: string, options: RuntimeOptions = {}): void {
  const driver = options.driver ?? realDriver
  const run = readRun(runId)
  if (!run.reeves_window_id) throw new Error('Reeves TUI window is unavailable for this run')
  const target = `${run.reeves_session ?? run.tmux_session}:${run.reeves_window_id}`
  try { driver.tmux(['switch-client', '-t', target]) } catch { /* no attached client */ }
  driver.tmux(['select-window', '-t', target])
}

export function openAgent(agentId: string, options: RuntimeOptions = {}): void {
  const driver = options.driver ?? realDriver
  const agent = findAgent(agentId)
  if (agent.headless || !agent.tmux_window_id) throw new Error('This agent is headless - no tmux window exists')
  const target = `${agent.tmux_session}:${agent.tmux_window_id}`
  try { driver.tmux(['switch-client', '-t', target]) } catch { /* no attached client */ }
  driver.tmux(['select-window', '-t', target])
}

export function peekAgent(agentId: string, lines = 10, options: RuntimeOptions = {}): string {
  const driver = options.driver ?? realDriver
  try {
    const agent = findAgent(agentId)
    if (agent.headless || !agent.tmux_pane_id) return '(headless agent - no output)'
    let output = driver.tmux(['capture-pane', '-p', '-e', '-S', String(-lines), '-t', agent.tmux_pane_id])
    if (!output.trim()) {
      try { output = driver.tmux(['capture-pane', '-p', '-e', '-a', '-S', String(-lines), '-t', agent.tmux_pane_id]) } catch { /* no alternate screen */ }
    }
    return redactSecrets(stripAnsi(output).trim())
  } catch {
    return ''
  }
}

export function sendText(agentId: string, text: string, options: RuntimeOptions = {}): void {
  const driver = options.driver ?? realDriver
  const agent = findAgent(agentId)
  if (agent.headless || !agent.tmux_pane_id) throw new Error('This agent is headless - no tmux pane exists')
  pasteTextToPane(driver, agent.tmux_pane_id, text)
  lastPasteAtByPane.set(agent.tmux_pane_id, Date.now())
  if (!agent.ended_at && agent.task_status === 'queued') updateAgent(agent.run_id, agent.id, { task_status: 'working' })
}

function tmuxKey(key: AllowedKey): string {
  if (key === 'enter') return 'Enter'
  if (key === 'escape') return 'Escape'
  if (key === 'backspace') return 'BSpace'
  if (key === 'tab') return 'Tab'
  if (key === 'space') return 'Space'
  if (key === 'up') return 'Up'
  if (key === 'down') return 'Down'
  if (key === 'left') return 'Left'
  if (key === 'right') return 'Right'
  return 'C-c'
}

export function sendKey(agentId: string, key: AllowedKey, options: RuntimeOptions = {}): void {
  const driver = options.driver ?? realDriver
  const agent = findAgent(agentId)
  if (agent.headless || !agent.tmux_pane_id) throw new Error('This agent is headless - no tmux pane exists')
  if (!ALLOWED_KEYS.includes(key)) throw new Error(`Unsupported key: ${String(key)}`)
  if (key === 'enter') {
    const lastPasteAt = lastPasteAtByPane.get(agent.tmux_pane_id) ?? 0
    const remaining = POST_PASTE_ENTER_DELAY_MS - (Date.now() - lastPasteAt)
    if (remaining > 0) {
      if (driver === realDriver) sleepSync(remaining)
      else driver.delay(() => {}, remaining)
    }
  }
  driver.tmux(['send-keys', '-t', agent.tmux_pane_id, tmuxKey(key)])
  if (!agent.ended_at && agent.task_status === 'queued') updateAgent(agent.run_id, agent.id, { task_status: 'working' })
}

export function interrupt(agentId: string, options: RuntimeOptions = {}): void {
  sendKey(agentId, 'ctrl-c', options)
}

export function killAgent(agentId: string, options: RuntimeOptions = {}): AgentRecord {
  const driver = options.driver ?? realDriver
  const agent = findAgent(agentId)
  const run = readRun(agent.run_id)
  if (run.mode !== 'spawner') {
    throw new Error('Run not found')
  }
  try {
    driver.tmux(['kill-window', '-t', agent.tmux_window_id])
  } catch {
    // already gone
  }
  const endedAt = nowIso()
  updateAgent(agent.run_id, agent.id, { ended_at: endedAt, task_status: 'done' })
  endRunIfNoLiveAgents(agent.run_id, endedAt)
  return findAgent(agentId)
}

export function stopRun(runId: string, options: RuntimeOptions = {}): RunRecord {
  const driver = options.driver ?? realDriver
  const run = readRun(runId)
  const endedAt = nowIso()
  const runOwnsSession = !!run.reeves_session && run.reeves_session !== run.tmux_session
  if (runOwnsSession) {
    try {
      driver.tmux(['kill-session', '-t', run.tmux_session])
    } catch {
      // session may already be gone
    }
  }
  for (const agent of listAgents(run.id)) {
    if (agent.ended_at) continue
    if (!runOwnsSession && agent.tmux_window_id) {
      try {
        driver.tmux(['kill-window', '-t', agent.tmux_window_id])
      } catch {
        // window may already be gone
      }
    }
    updateAgent(run.id, agent.id, { ended_at: endedAt })
  }
  updateRun(run.id, { status: 'ended', ended_at: endedAt })
  return readRun(run.id)
}

export function agentJsonPath(runId: string, agentId: string): string {
  return agentPath(runId, agentId)
}
