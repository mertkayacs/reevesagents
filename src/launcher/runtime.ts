// V1 tmux runtime: the Reeves TUI stays in its own tmux session/window, and
// each run owns a separate tmux session for its terminal/agent windows.
// Inputs: run/terminal/worker configs. Outputs: run and agent JSON records plus tmux side effects.
// Invariant: stored tmux targets use stable window/pane ids, never mutable indexes.

import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import stripAnsi from 'strip-ansi'
import type {
  AgentRecord,
  AgentRole,
  AuthMode,
  Effort,
  Permissions,
  Provider,
  RunMode,
  RunRecord,
} from '../state/types.js'
import {
  agentPath,
  findAgent,
  listAgents,
  nowIso,
  nowMs,
  readAgent,
  readRun,
  removeRun,
  runDir,
  stateRoot,
  updateAgent,
  updateRun,
  writeAgent,
  writeRun,
} from '../state/runs.js'
import { loadConfig } from '../state/config.js'
import { buildCommand, detectAvailable, isProvider } from './providers.js'
import {
  claudeMcpConfig,
  codexMcpOverrides,
  fullLaunchShellCommand,
  launchCommandWithInitialTask,
  resolveWorkingDir,
  shellQuote,
} from './provider-launch.js'
import { redactSecrets } from '../utils/display.js'

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
  mode?: RunMode
  name: string
  working_dir: string
  root: AgentLaunchConfig
  workers?: AgentLaunchConfig[]
  preset_name?: string | null
  ready_delay_ms?: number
  root_is_caller?: boolean  // skip root tmux window and create a headless root record
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

// block synchronously via Atomics.wait; paste pacing here runs in a sync path
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

function tmuxWindowName(mode: RunMode, role: AgentRole, provider: Provider, nickname: string): string {
  if (mode === 'spawner') return sanitizeName(nickname || provider).slice(0, 64)
  if (role === 'root') return `root-${provider}`.slice(0, 64)
  return sanitizeName(nickname || `${provider}-worker`).slice(0, 64)
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
  if (!available[provider]) throw new Error(`Provider '${provider}' not found on PATH`)
}

// Pick the Reeves TUI anchor. Agent windows are not placed here; each run gets
// its own tmux session. When not already inside tmux, create/use a fallback
// session named "reeves" with a single TUI anchor window.
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

const ROOT_CAPABILITY_NOTE = [
  'ReevesAgents context:',
  '- You are running inside a local ReevesAgents tmux run.',
  '- You are the root agent. You are the coordinator and can control this run through ReevesAgents MCP.',
  '- Your agent id is in env REEVES_AGENT_ID (and REEVES_SESSION_ID). Your run id is REEVES_RUN_ID.',
  '- You do not need to ask the user for this run id. Root-scoped MCP tools default to your current run when run_id is omitted.',
  '- Your first MCP call should be context() or tree() so you know the current run, agents, approvals, and available controls.',
  '',
  'Coordinate the team:',
  '- context() returns your identity, this run, current agents, approvals, and control scope.',
  '- spawn_worker({ provider, model, task, nickname?, working_dir?, permissions?, ... }) adds a worker to this run. Operators may also pass run_id.',
  '- Prefer the spawn_worker task field for the first assignment. After spawning, wait briefly, then use tree/list_agents/peek before sending follow-up text.',
  '- list_agents(run_id?) lists agents in your run.',
  '- tree(run_id?) returns run, root, and workers in one call.',
  '- get_run(run_id?) returns this run with agents and approvals.',
  '- peek(agent_id, lines?) reads recent output of any agent in your run.',
  '- wait(agent_id, timeout_ms?) blocks until a worker ends or the timeout elapses.',
  '',
  'Full run control:',
  '- open_agent(agent_id) jumps the human to a worker CLI window.',
  '- open_reeves(run_id?) jumps the human back to the ReevesAgents TUI window for this run.',
  '- kill_agent(agent_id) closes a worker CLI window and marks that worker ended.',
  '- stop_run(run_id?) ends this run, closes its agent CLIs, and marks every agent ended.',
  '- You cannot kill yourself with kill_agent. Use stop_run() to end the whole run.',
  '- start_run is for external operators only; inside a run, use spawn_worker to add capacity.',
  '',
  'Standing objective:',
  '- Keep workers moving until the user task is done.',
  '- Check worker status with tree/list_agents, peek, and wait; report each worker status in every user-facing response.',
  '- If a worker is done, failed, or blocked, make that clear before continuing.',
  '',
  'Drive a worker pane:',
  '- send_text(agent_id, text) pastes text into a worker pane.',
  '- send_key(agent_id, key) sends one key. Allowed keys: enter, escape, backspace, tab, space, up, down, left, right, ctrl-c.',
  '- interrupt(agent_id) is shorthand for ctrl-c.',
  '',
  'Approvals from workers:',
  '- list_approvals(run_id?, status?) shows approval requests in your run.',
  '- resolve_approval(approval_id, decision, note?) approves or denies a request.',
  '- poll_approval(run_id?, timeout_ms?) waits for a pending approval in this run.',
  '- When a human is using your CLI, present the worker request and let the human decide before resolving.',
  '',
  'Status and messages:',
  '- update_task(agent_id, status, note?) writes a worker status. Valid statuses: queued, working, done, failed, blocked.',
  '- send_message(agent_id, text) queues a message in another agent inbox in your run.',
  '- get_inbox(agent_id) lets you read and clear another agent inbox in your run when needed.',
  '- check_messages() reads your own inbox, heartbeats your last_seen, and moves queued callers to working.',
  '- Call check_messages() at the start of every prompt cycle. During long coordination, call it again after worker updates and before replying.',
  '',
  'Example: spawn a cc worker, paste a task, run it, watch it:',
  '- worker = spawn_worker({ provider: "cc", model: "", task: "..." })',
  '- send_text(worker.id, "the task body")',
  '- send_key(worker.id, "enter")',
  '- peek(worker.id, 30)',
].join('\n')

const WORKER_CAPABILITY_NOTE = [
  'ReevesAgents context:',
  '- You are running inside a local ReevesAgents tmux run.',
  '- You are a worker agent. The root agent and the human can drive you.',
  '- Your agent id is in env REEVES_AGENT_ID (and REEVES_SESSION_ID). Your run id is REEVES_RUN_ID.',
  '',
  'Report state:',
  '- context() tells you who you are, your current run, your root, workers, approvals, and your control scope.',
  '- update_task(your_agent_id, status, note?) sets your task status. Valid statuses: queued, working, done, failed, blocked.',
  '- check_messages() each prompt cycle to read your inbox; it also heartbeats your last_seen and moves queued callers to working.',
  '- Your first MCP calls before starting the User task should be context() then check_messages(). For long work, check again after each major step and before your final response.',
  '- Treat new inbox messages from the root or human as updated instructions unless they conflict with safety or provider policy.',
  '- Set status to working when you start, then done, failed, or blocked before your final response.',
  '',
  'Ask for approval:',
  '- request_approval(action, summary, details?, risk?) before risky steps.',
  '- check_approval(approval_id) reads the decision once the root or a human resolves it.',
  '',
  'Communicate inside the run:',
  '- send_message(agent_id, text) sends a message to another agent in your run.',
  '- peek(your_agent_id, lines?) reads your own recent output.',
  '',
  'Navigate:',
  '- open_reeves(run_id?) returns the human to the ReevesAgents TUI window.',
  '',
  'You cannot kill other agents, stop the run, list approvals, or resolve approvals.',
].join('\n')

export function capabilityNote(role: AgentRole): string {
  return role === 'root' ? ROOT_CAPABILITY_NOTE : WORKER_CAPABILITY_NOTE
}

export function startupTask(role: AgentRole, task: string): string {
  const trimmed = task.trim()
  if (!trimmed) return capabilityNote(role)
  return `${capabilityNote(role)}\n\nUser task:\n${task}`
}

function writeRunClaudeMcpConfig(runId: string, agentId: string, vars: Record<string, string>): string {
  const path = join(runDir(runId), 'mcp', `${agentId}-claude-mcp.json`)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(claudeMcpConfig(vars), null, 2), 'utf-8')
  chmodSync(path, 0o600)
  return path
}

function agentEnvVars(runId: string, agentId: string, role: AgentRole): Record<string, string> {
  return {
    REEVES_SESSION_ID: agentId,
    REEVES_AGENT_ID: agentId,
    REEVES_RUN_ID: runId,
    REEVES_ROLE: role,
    REEVES_REGISTRY: stateRoot(),
  }
}

function agentShellCommand(
  runId: string,
  agentId: string,
  role: AgentRole,
  config: AgentLaunchConfig,
  permissions: Permissions,
): string {
  const reevesVars = agentEnvVars(runId, agentId, role)
  const mcpVars = {
    ...reevesVars,
    ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
  }

  let cmd = buildCommand({
    provider: config.provider,
    permissions,
    model: config.model,
    auth_mode: config.auth_mode,
    effort: config.effort,
    rc_enabled: config.rc_enabled ?? false,
  })

  if (config.provider === 'codex') cmd = [...cmd, ...codexMcpOverrides(mcpVars)]
  if (config.provider === 'cc') cmd = [...cmd, '--mcp-config', writeRunClaudeMcpConfig(runId, agentId, mcpVars)]

  const task = startupTask(role, config.task)
  const launchCmd = launchCommandWithInitialTask(config.provider, cmd, task)

  const envPrefix = Object.entries(reevesVars)
    .map(([key, value]) => `export ${key}=${shellQuote(value)}`)
    .join(' && ')

  return fullLaunchShellCommand(config.provider, envPrefix, launchCmd, task)
}

function terminalShellCommand(
  config: AgentLaunchConfig,
  permissions: Permissions,
): string {
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

function promptForMode(mode: RunMode, role: AgentRole, task: string): string {
  if (mode === 'spawner') return task.trim()
  return startupTask(role, task)
}

function sendDelayedStartupInput(
  driver: RuntimeDriver,
  agent: AgentRecord,
  config: AgentLaunchConfig,
  readyDelayMs: number,
  mode: RunMode,
): void {
  const task = promptForMode(mode, agent.role, config.task)
  const shouldEnableRemoteControl = mode === 'orchestrator' && config.rc_enabled === true && config.provider === 'cc'

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

  function sendReadyInput(): void {
    if (shouldEnableRemoteControl) {
      try {
        driver.tmux(['send-keys', '-t', agent.tmux_pane_id, '/remote-control', 'Enter'])
      } catch {
        // window may have ended before startup completed
        return
      }
      if (!task.trim()) return
      driver.delay(() => sendStartupTask(), 1500)
      return
    }
    if (task.trim()) sendStartupTask()
  }

  function waitForReadyThenSend(previousOutput = '', waitedMs = 0): void {
    try {
      const output = driver.tmux(['capture-pane', '-p', '-e', '-S', '-80', '-t', agent.tmux_pane_id])
      if (paneLooksReady(output, previousOutput) || waitedMs >= STARTUP_READY_TIMEOUT_MS) {
        sendReadyInput()
        return
      }
      driver.delay(() => waitForReadyThenSend(output, waitedMs + STARTUP_READY_POLL_MS), STARTUP_READY_POLL_MS)
    } catch {
      // window may have ended before startup completed
    }
  }

  if (!task.trim() && !shouldEnableRemoteControl) return
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
    nickname: config.nickname || (role === 'root' ? 'root' : `${config.provider}-worker`),
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
    rc_enabled: config.provider === 'cc' ? config.rc_enabled ?? false : false,
    permissions,
    inbox: [],
    last_seen: nowMs(),
    started_at: nowIso(),
    ended_at: null,
  }
}

function createHeadlessRootAgent(
  runId: string,
  tmuxSession: string,
  config: AgentLaunchConfig,
  workingDir: string,
): AgentRecord {
  const cfg = loadConfig()
  const id = randomUUID()
  const resolvedWorkingDir = resolveWorkingDir(config.working_dir, workingDir)
  const permissions = config.permissions ?? cfg.global.default_permissions
  const agent: AgentRecord = {
    id,
    run_id: runId,
    nickname: config.nickname || 'root',
    provider: config.provider,
    model: config.model,
    role: 'root',
    working_dir: resolvedWorkingDir,
    task: config.task.trim(),
    task_status: 'working',
    task_note: '',
    tmux_session: tmuxSession,
    tmux_window_id: '',
    tmux_pane_id: '',
    rc_enabled: false,
    permissions,
    headless: true,
    inbox: [],
    last_seen: nowMs(),
    started_at: nowIso(),
    ended_at: null,
  }
  writeAgent(agent)
  return agent
}

function createAgentWindow(
  runId: string,
  tmuxSession: string,
  mode: RunMode,
  role: AgentRole,
  config: AgentLaunchConfig,
  inheritedWorkingDir: string,
  readyDelayMs: number,
  driver: RuntimeDriver,
  firstWindowInSession = false,
): AgentRecord {
  const cfg = loadConfig()
  const id = randomUUID()
  const workingDir = resolveWorkingDir(config.working_dir, inheritedWorkingDir)
  const permissions = config.permissions ?? cfg.global.default_permissions
  const shellCommand = mode === 'spawner'
    ? terminalShellCommand(config, permissions)
    : agentShellCommand(runId, id, role, config, permissions)
  const nickname = config.nickname || (mode === 'spawner' ? config.provider : role === 'root' ? 'root' : `${config.provider}-worker`)
  const output = firstWindowInSession
    ? driver.tmux([
      'new-session',
      '-d',
      '-P',
      '-F',
      '#{window_id} #{pane_id}',
      '-s',
      tmuxSession,
      '-n',
      tmuxWindowName(mode, role, config.provider, nickname),
      '-c',
      workingDir,
      shellCommand,
    ])
    : driver.tmux([
      'new-window',
      '-d',
      '-P',
      '-F',
      '#{window_id} #{pane_id}',
      '-t',
      `${tmuxSession}:`,
      '-n',
      tmuxWindowName(mode, role, config.provider, nickname),
      '-c',
      workingDir,
      shellCommand,
    ])
  const agent = newAgentRecord(id, runId, tmuxSession, role, config, workingDir, parseTmuxIds(output), permissions)
  writeAgent(agent)
  sendDelayedStartupInput(driver, agent, config, readyDelayMs, mode)
  return agent
}

function validateAgents(configs: AgentLaunchConfig[], available: Record<Provider, boolean>): void {
  for (const config of configs) requireProvider(config.provider, available)
}

export function startRun(request: StartRunRequest, options: RuntimeOptions = {}): { run: RunRecord, agents: AgentRecord[] } {
  const cfg = loadConfig()
  const driver = options.driver ?? realDriver
  const available = options.available ?? detectAvailable()
  const mode = request.mode ?? 'orchestrator'
  if (mode === 'spawner' && request.root_is_caller) throw new Error('Spawner runs cannot use a headless root')
  const workers = request.workers ?? []
  validateAgents(request.root_is_caller ? workers : [request.root, ...workers], available)

  const runId = randomUUID()
  const readyDelayMs = request.ready_delay_ms ?? cfg.global.ready_delay_ms
  const workingDir = resolveWorkingDir(request.working_dir, process.cwd())

  const reevesAnchor = pickReevesAnchor(driver)
  const tmuxSession = tmuxRunSessionName(runId, request.name)
  let createdRunSession = false

  try {
    createRunSessionWithReevesTab(driver, tmuxSession, reevesAnchor, workingDir)
    createdRunSession = true

    let root: AgentRecord
    if (request.root_is_caller) {
      // Headless root: the MCP caller acts as root, no tmux window for them.
      root = createHeadlessRootAgent(runId, tmuxSession, request.root, workingDir)
    } else {
      root = createAgentWindow(runId, tmuxSession, mode, 'root', request.root, workingDir, readyDelayMs, driver)
    }
    const run: RunRecord = {
      id: runId,
      mode,
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
      return createAgentWindow(runId, tmuxSession, mode, 'worker', worker, workingDir, readyDelayMs, driver)
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
  return createAgentWindow(
    run.id,
    run.tmux_session,
    run.mode ?? 'orchestrator',
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
  // switch-client moves the user's attached client to the target session+window
  // (works across sessions). select-window after is redundant when switch-client
  // succeeded but harmless and keeps the same-session path working when no client
  // is attached (e.g., FakeDriver / smoke tests with no interactive client).
  const target = `${run.reeves_session ?? run.tmux_session}:${run.reeves_window_id}`
  try { driver.tmux(['switch-client', '-t', target]) } catch { /* no attached client */ }
  driver.tmux(['select-window', '-t', target])
}

export function openAgent(agentId: string, options: RuntimeOptions = {}): void {
  const driver = options.driver ?? realDriver
  const agent = findAgent(agentId)
  if (agent.headless || !agent.tmux_window_id) throw new Error('This agent is headless (MCP root) - no tmux window exists')
  const target = `${agent.tmux_session}:${agent.tmux_window_id}`
  try { driver.tmux(['switch-client', '-t', target]) } catch { /* no attached client */ }
  driver.tmux(['select-window', '-t', target])
}

export function peekAgent(agentId: string, lines = 10, options: RuntimeOptions = {}): string {
  const driver = options.driver ?? realDriver
  try {
    const agent = findAgent(agentId)
    if (agent.headless || !agent.tmux_pane_id) return '(headless root - no terminal output)'
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
  if (agent.headless || !agent.tmux_pane_id) throw new Error('This agent is headless (MCP root) - no tmux pane exists')
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
  if (agent.headless || !agent.tmux_pane_id) throw new Error('This agent is headless (MCP root) - no tmux pane exists')
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
  if (run.mode !== 'spawner' && agent.role === 'root') throw new Error('Root agent cannot be killed directly; stop the run instead')
  try {
    driver.tmux(['kill-window', '-t', agent.tmux_window_id])
  } catch {
    // already gone
  }
  updateAgent(agent.run_id, agent.id, { ended_at: nowIso(), task_status: 'done' })
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
