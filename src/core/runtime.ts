// Tmux agent-run runtime: one run owns one tmux session with independent CLI agents.
// Inputs: run/agent configs. Outputs: run and agent JSON records plus tmux side effects.
// Invariant: stored tmux targets use window/pane ids, never mutable indexes, and an id
// is only trusted as the pair (session name, id); see core/tmux.ts for the identity
// doctrine and the membership probes every consumer must use.

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
  PresetSlot,
} from './types.js'
import {
  archiveAndRemoveRun,
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
} from './runs.js'
import { emitNotification } from './notifications.js'
import { loadConfig } from './config.js'
import { loadPreset } from './store.js'
import { buildCommand, detectAvailable, isProvider } from './providers.js'
import { resolveWorkingDir, shellQuote } from './provider-launch.js'
import { paneInSession, realDriver, sessionInGroup, STALE_WINDOW_ERROR, VIEWER_SESSION_PATTERN, windowInSession, type RuntimeDriver } from './tmux.js'
import { reapPaneProcess } from './process.js'
import {
  BUSY_SCAN_LINES, composerText, countWorkLines, detectPaneBusy, detectPaneReady, paneInCopyMode, type PaneBusyState,
} from './activity.js'
import { redactSecrets } from './redact.js'
import { providerDisplayName } from '../utils/display.js'

export type { RuntimeDriver } from './tmux.js'
export type { PaneBusyState } from './activity.js'

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
  // Extra launch flags appended after the args we build. Launch-only, like
  // auth_mode and effort: not stored on the record and not captured into presets.
  extra_args?: string[]
}

export interface StartRunRequest {
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

export interface RuntimeOptions {
  driver?: RuntimeDriver
  available?: Record<Provider, boolean>
}

export interface TmuxIds {
  windowId: string
  paneId: string
  panePid?: number
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

const POST_PASTE_ENTER_DELAY_MS = 1000
const STARTUP_READY_POLL_MS = 1000
const STARTUP_READY_TIMEOUT_MS = 20_000
const lastPasteAtByPane = new Map<string, number>()

function sleepSync(ms: number): void {
  const buffer = new SharedArrayBuffer(4)
  const view = new Int32Array(buffer)
  Atomics.wait(view, 0, 0, ms)
}

// Web viewer sessions (reevesweb_*) are grouped with the run session, so killing
// the run session alone leaves them holding the run's windows and processes.
function killViewerSessions(driver: RuntimeDriver, runSession: string): void {
  let rows: string
  try {
    rows = driver.tmux(['list-sessions', '-F', '#{session_name}\t#{session_group}\t#{session_group_list}'])
  } catch {
    return
  }
  for (const row of rows.split('\n')) {
    const [name = '', group = '', groupList = ''] = row.trim().split('\t')
    if (!VIEWER_SESSION_PATTERN.test(name)) continue
    if (!sessionInGroup({ group, groupList: groupList.split(',').filter(Boolean) }, runSession)) continue
    try { driver.tmux(['kill-session', '-t', `=${name}`]) } catch { /* already gone */ }
  }
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
  const [windowId, paneId, panePidRaw] = output.trim().split(/\s+/)
  if (!windowId?.startsWith('@') || !paneId?.startsWith('%')) {
    throw new Error(`Could not parse tmux ids from: ${output}`)
  }
  const panePid = panePidRaw === undefined ? undefined : Number.parseInt(panePidRaw, 10)
  return { windowId, paneId, panePid: Number.isFinite(panePid) && panePid! > 0 ? panePid : undefined }
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
  let ids = readDisplayIds(driver, `=${fallbackName}:reeves`)
  if (!ids) {
    try { driver.tmux(['new-window', '-d', '-t', `${fallbackName}:`, '-n', 'reeves']) } catch { /* anchor may already exist */ }
    ids = readDisplayIds(driver, `=${fallbackName}:reeves`)
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
    extra_args: config.extra_args,
  })
  const joined = cmd.map(shellQuote).join(' ')
  // cmd knows no `exec`; the shell prefix only makes sense on POSIX.
  return process.platform === 'win32' ? joined : `exec ${joined}`
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
      if (!paneInSession(driver, agent.tmux_session, agent.tmux_pane_id)) return
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
    pane_pid: ids.panePid ?? null,
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
    '#{window_id} #{pane_id} #{pane_pid}',
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

// The three fields every run-scoped event needs, derived in one place: the project is a directory name, never a
// path (§2.1 of the notification design).
function basenameOf(dir: string): string {
  const parts = dir.split(/[\\/]+/).filter(Boolean)
  return parts.length > 0 ? parts[parts.length - 1]!.slice(0, 64) : ''
}

function emitRunCreated(run: RunRecord): void {
  emitNotification({
    kind: 'run.created',
    title: `run ${run.name || run.id} started`,
    run_id: run.id,
    run_name: run.name,
    project: basenameOf(run.working_dir),
    source: 'product',
  })
}

export function startRun(request: StartRunRequest, options: RuntimeOptions = {}): { run: RunRecord, agents: AgentRecord[] } {
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
    emitRunCreated(run)
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

function slotToLaunchConfig(slot: PresetSlot): AgentLaunchConfig {
  return {
    nickname: slot.nickname_template,
    provider: slot.provider,
    model: slot.model,
    auth_mode: slot.auth_mode,
    effort: slot.effort,
    task: slot.initial_prompt,
    working_dir: slot.working_dir,
    permissions: slot.permissions,
    rc_enabled: slot.rc_enabled,
  }
}

// Start a run from a saved preset. The preset must already exist. opts.name
// overrides the run name (defaults to the preset name); opts.working_dir sets the
// run base dir, while each slot's own working_dir still wins when it is set.
export function startRunFromPreset(
  presetName: string,
  opts: { name?: string; working_dir?: string } = {},
  options: RuntimeOptions = {},
): { run: RunRecord; agents: AgentRecord[] } {
  const tree = loadPreset(presetName)
  if (!tree) throw new Error(`preset not found: ${presetName}`)
  return startRun({
    name: opts.name?.trim() || tree.name,
    working_dir: opts.working_dir || process.cwd(),
    root: slotToLaunchConfig(tree.root),
    workers: tree.workers.map(slotToLaunchConfig),
    preset_name: tree.name,
  }, options)
}

function createHeadlessHeadAgent(
  runId: string,
  tmuxSession: string,
  provider: Provider,
  workingDir: string,
): AgentRecord {
  const cfg = loadConfig()
  const agent: AgentRecord = {
    id: randomUUID(),
    run_id: runId,
    nickname: providerDisplayName(provider),
    provider,
    model: '',
    role: 'root',
    working_dir: workingDir,
    task: '',
    task_status: 'working',
    task_note: '',
    tmux_session: tmuxSession,
    tmux_window_id: '',
    tmux_pane_id: '',
    rc_enabled: false,
    permissions: cfg.global.default_permissions,
    headless: true,
    inbox: [],
    last_seen: nowMs(),
    started_at: nowIso(),
    ended_at: null,
  }
  writeAgent(agent)
  return agent
}

// Start a run whose head is the host CLI itself (headless, no tmux window) and
// whose first worker gets a real window. Used when the MCP server was launched
// by a recognized host CLI so that host sits at the top of one shared run.
export function startRunWithHead(
  headProvider: Provider,
  firstWorker: AgentLaunchConfig,
  options: RuntimeOptions = {},
): { run: RunRecord, agents: AgentRecord[] } {
  const cfg = loadConfig()
  const driver = options.driver ?? realDriver
  const available = options.available ?? detectAvailable()
  validateAgents([firstWorker], available)

  const runId = randomUUID()
  const readyDelayMs = cfg.global.ready_delay_ms
  const workingDir = resolveWorkingDir(firstWorker.working_dir, process.cwd())

  const reevesAnchor = pickReevesAnchor(driver)
  const tmuxSession = tmuxRunSessionName(runId, providerDisplayName(headProvider))
  let createdRunSession = false

  try {
    createRunSessionWithReevesTab(driver, tmuxSession, reevesAnchor, workingDir)
    createdRunSession = true

    const head = createHeadlessHeadAgent(runId, tmuxSession, headProvider, workingDir)
    const run: RunRecord = {
      id: runId,
      name: providerDisplayName(headProvider),
      status: 'running',
      tmux_session: tmuxSession,
      reeves_session: reevesAnchor.sessionName,
      reeves_window_id: reevesAnchor.windowId,
      reeves_pane_id: reevesAnchor.paneId,
      root_agent_id: head.id,
      working_dir: workingDir,
      preset_name: null,
      started_at: nowIso(),
      ended_at: null,
    }
    writeRun(run)
    const worker = createAgentWindow(runId, tmuxSession, 'worker', firstWorker, workingDir, readyDelayMs, driver)
    emitRunCreated(run)
    return { run, agents: [head, worker] }
  } catch (err) {
    if (createdRunSession) {
      try { driver.tmux(['kill-session', '-t', tmuxSession]) } catch { /* session may not exist */ }
    }
    removeRun(runId)
    const detail = childProcessOutput(err) || (err instanceof Error ? err.message : 'tmux returned a non-zero exit code')
    throw new Error(`Failed to start run ${providerDisplayName(headProvider)}: ${detail}`, { cause: err })
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
  const reevesSession = run.reeves_session ?? run.tmux_session
  if (!run.reeves_window_id || !windowInSession(driver, reevesSession, run.reeves_window_id)) {
    throw new Error('Reeves TUI window is unavailable for this run')
  }
  const target = `${reevesSession}:${run.reeves_window_id}`
  try { driver.tmux(['switch-client', '-t', target]) } catch { /* no attached client */ }
  driver.tmux(['select-window', '-t', target])
}

export function openRunTabs(runId: string, options: RuntimeOptions = {}): void {
  const driver = options.driver ?? realDriver
  const run = readRun(runId)
  const target = `${run.tmux_session}:reeves`
  try { driver.tmux(['switch-client', '-t', target]) } catch { /* no attached client */ }
  driver.tmux(['select-window', '-t', target])
}

export function openAgent(agentId: string, options: RuntimeOptions = {}): void {
  const driver = options.driver ?? realDriver
  const agent = findAgent(agentId)
  if (agent.headless || !agent.tmux_window_id) throw new Error('This agent is headless - no tmux window exists')
  if (!windowInSession(driver, agent.tmux_session, agent.tmux_window_id)) throw new Error(STALE_WINDOW_ERROR)
  const target = `${agent.tmux_session}:${agent.tmux_window_id}`
  try { driver.tmux(['switch-client', '-t', target]) } catch { /* no attached client */ }
  driver.tmux(['select-window', '-t', target])
}

// Raw capture of an agent's pane. The parsers (busy detection, verdict scanning) need the
// text before redaction; anything that leaves the runtime for a human still goes through it.
function capturePaneRaw(driver: RuntimeDriver, agent: AgentRecord, lines: number): string {
  const target = agent.tmux_pane_id
  let output = driver.tmux(['capture-pane', '-p', '-e', '-S', String(-lines), '-t', target])
  if (!output.trim()) {
    // A provider that renders on the alternate screen prints nothing on the primary one.
    try { output = driver.tmux(['capture-pane', '-p', '-e', '-a', '-S', String(-lines), '-t', target]) } catch { /* no alternate screen */ }
  }
  return output
}

export function peekAgent(agentId: string, lines = 10, options: RuntimeOptions = {}): string {
  const driver = options.driver ?? realDriver
  // Coerce to a positive integer: a zero/negative/NaN count would otherwise read
  // from the wrong end of history (lines=-5 -> capture-pane -S 5).
  const n = Number.isFinite(lines) && lines > 0 ? Math.floor(lines) : 10
  try {
    const agent = findAgent(agentId)
    if (agent.headless || !agent.tmux_pane_id) return '(headless agent - no output)'
    if (!paneInSession(driver, agent.tmux_session, agent.tmux_pane_id)) return ''
    return redactSecrets(stripAnsi(capturePaneRaw(driver, agent, n)).trim())
  } catch {
    return ''
  }
}

// The same capture without redaction, for parsers only (the verdict scan). Redaction replaces
// secret-shaped strings in place, so a parser fed `peekAgent` can silently misread a line; the
// flow engine therefore reads here and redacts whatever it stores. Never print this, never put it
// in a payload: everything that leaves the process goes through `peekAgent`/`redactSecrets`.
export function peekAgentRaw(agentId: string, lines = 10, options: RuntimeOptions = {}): string {
  const driver = options.driver ?? realDriver
  const n = Number.isFinite(lines) && lines > 0 ? Math.floor(lines) : 10
  try {
    const agent = findAgent(agentId)
    if (agent.headless || !agent.tmux_pane_id) return ''
    if (!paneInSession(driver, agent.tmux_session, agent.tmux_pane_id)) return ''
    return stripAnsi(capturePaneRaw(driver, agent, n))
  } catch {
    return ''
  }
}

// Is this agent still working? Fail-closed: a pane we cannot observe, an agent with no pane,
// and a provider without a verified busy marker all answer 'unknown', which every automated
// write must treat as busy (see core/activity.ts).
export function paneBusy(agentId: string, options: RuntimeOptions = {}): PaneBusyState {
  const driver = options.driver ?? realDriver
  try {
    const agent = findAgent(agentId)
    if (agent.headless || !agent.tmux_pane_id) return 'unknown'
    if (!paneInSession(driver, agent.tmux_session, agent.tmux_pane_id)) return 'unknown'
    return detectPaneBusy(capturePaneRaw(driver, agent, BUSY_SCAN_LINES), agent.provider)
  } catch {
    return 'unknown'
  }
}

export interface IdleSendTimings {
  // A provider prompt appears seconds after the paste, so the confirm window is generous.
  pasteSettleMs: number
  submitWaitMs: number
  // How long the pane may take to turn busy after the Enter, polled in `confirmPollMs` steps. The
  // default comes from `dispatch_confirm_seconds` (90 s): a cold provider can take most of a minute to
  // start its first turn, and the fixed six-second window used to call that a failed dispatch.
  confirmMs?: number
  confirmPollMs?: number
}

export const DEFAULT_IDLE_SEND_TIMINGS: IdleSendTimings = {
  pasteSettleMs: 9000,
  submitWaitMs: 6000,
  confirmMs: 90_000,
  confirmPollMs: 1_000,
}

export type SendRefusal =
  | 'busy' | 'unknown' | 'stale_pane' | 'headless' | 'pane_changed' | 'unconfirmed'
  // The composer is not initialised yet (no provider hint): nothing was pasted, retry later.
  | 'target_not_ready'
  // The composer already holds text that is not ours: pasting would stack onto it.
  | 'composer_dirty'
export type SendOutcome = { sent: true } | { sent: false; reason: SendRefusal }

export interface IdleSendOptions extends RuntimeOptions {
  timings?: Partial<IdleSendTimings>
}

// Blocking wait that obeys the injected driver: the real driver sleeps for real, a test driver
// resolves immediately (same convention as waitAfterPaste).
function waitBlocking(driver: RuntimeDriver, ms: number): void {
  if (ms <= 0) return
  if (driver === realDriver) sleepSync(ms)
  else driver.delay(() => {}, ms)
}

// The only write path an automated caller (the flow engine) may use: paste, one Enter, then
// confirm that the pane went busy. It never writes into a pane it observed as busy or as
// unknown, and it never sends a second Enter — a queued Enter answers whatever prompt appears
// next, including an approval an operator was about to read. A dispatch it cannot confirm is
// reported as 'unconfirmed' so the caller can record it and wait for a human.
export function sendWhenIdle(agentId: string, text: string, options: IdleSendOptions = {}): SendOutcome {
  const driver = options.driver ?? realDriver
  const timings: IdleSendTimings = { ...DEFAULT_IDLE_SEND_TIMINGS, ...options.timings }
  let agent: AgentRecord
  try {
    agent = findAgent(agentId)
  } catch {
    return { sent: false, reason: 'stale_pane' }
  }
  if (agent.headless || !agent.tmux_pane_id) return { sent: false, reason: 'headless' }
  // A window that no longer belongs to the run is its own refusal: paneBusy would call it
  // 'unknown', and "the window is gone" is the more useful thing to report.
  if (!paneInSession(driver, agent.tmux_session, agent.tmux_pane_id)) return { sent: false, reason: 'stale_pane' }

  // Copy mode eats Enter as a scroll, and the paste lands nowhere usable: cancel it first, then probe
  // again. A pane that is still in copy mode after the cancel is not ready, so nothing is typed.
  let paneText = capturePaneRaw(driver, agent, BUSY_SCAN_LINES)
  if (paneInCopyMode(paneText)) {
    try {
      driver.tmux(['send-keys', '-t', agent.tmux_pane_id, '-X', 'cancel'])
    } catch {
      return { sent: false, reason: 'stale_pane' }
    }
    waitBlocking(driver, timings.pasteSettleMs)
    paneText = capturePaneRaw(driver, agent, BUSY_SCAN_LINES)
    if (paneInCopyMode(paneText)) return { sent: false, reason: 'target_not_ready' }
  }

  const gate = detectPaneBusy(paneText, agent.provider)
  if (gate === 'busy') return { sent: false, reason: 'busy' }
  if (gate === 'unknown') return { sent: false, reason: 'unknown' }

  // The input box exists — but is it *initialised*? A provider draws its composer hints only once it is
  // ready; a fresh pane with none of them is `target_not_ready`, and pasting into it loses the prompt
  // (incident of 2026-11-01). A provider with no verified hints keeps the older behaviour.
  if (detectPaneReady(paneText, agent.provider) === 'not_ready') return { sent: false, reason: 'target_not_ready' }

  // What is already sitting in the composer? Empty means "paste". Our own text means a previous paste
  // landed and only the submit is missing — one Enter, never a second paste. Anything else is somebody
  // else's text: pasting again stacks onto it (nine copies of one prompt in one pane), so refuse.
  const composer = composerText(paneText, agent.provider)
  if (composer === null) return { sent: false, reason: 'unknown' }
  const alreadyOurs = composer !== '' && composerHoldsOurs(composer, text)
  if (composer !== '' && !alreadyOurs) return { sent: false, reason: 'composer_dirty' }

  if (!alreadyOurs) {
    try {
      pasteTextToPane(driver, agent.tmux_pane_id, text)
    } catch {
      return { sent: false, reason: 'stale_pane' }
    }
  }
  if (!alreadyOurs) lastPasteAtByPane.set(agent.tmux_pane_id, Date.now())
  // Best effort: the text is already pasted, so a bookkeeping failure must never abort the
  // submit and leave the prompt sitting in the input box with nothing recorded.
  if (!agent.ended_at && agent.task_status === 'queued') {
    try {
      updateAgent(agent.run_id, agent.id, { task_status: 'working' })
    } catch {
      // the record is repaired by the next send or status read
    }
  }

  waitBlocking(driver, timings.pasteSettleMs)
  // Re-check right before the Enter: during the settle window the agent can start working, or
  // the screen can change to a modal, and submitting then would answer whatever prompt just
  // appeared.
  //
  // But "the pane changed" is two different facts wearing one face, and only one of them may be submitted. A Codex
  // pane that redraws while our paste settles reads as busy — the redraw *is* our paste — and the composer still holds
  // exactly our text; one Enter is all that is missing, and refusing here is what left prompts sitting in the box
  // (D2). A pane that really moved on (the agent started working, a modal appeared) no longer holds our text, or is
  // no longer ready, and that is a refusal. So the decision is made on the composer, not on the busy probe.
  const beforeEnter = capturePaneRaw(driver, agent, BUSY_SCAN_LINES)
  if (detectPaneBusy(beforeEnter, agent.provider) !== 'idle') {
    // Only the composer decides: the busy probe is what the redraw trips, and it says nothing about whose text is in
    // the box. Our exact text in it means the paste landed and the Enter is the only step missing.
    const holdsOurs = composerHoldsOurs(composerText(beforeEnter, agent.provider) ?? '', text)
    if (!holdsOurs) return { sent: false, reason: 'pane_changed' }
  }
  try {
    driver.tmux(['send-keys', '-t', agent.tmux_pane_id, 'Enter'])
  } catch {
    return { sent: false, reason: 'stale_pane' }
  }
  // A configurable window, not a fixed nap: a cold provider can spend most of a minute before its first
  // turn shows a busy marker, and the flow calls that a failed dispatch.
  const confirmMs = Math.max(timings.confirmMs ?? timings.submitWaitMs, 0)
  const pollMs = Math.max(timings.confirmPollMs ?? 1000, 1)
  if (waitForBusy(agent, options, driver, confirmMs, pollMs)) return { sent: true }

  // The Enter was pressed and the pane never turned busy. One more Enter is allowed only when two things
  // hold, and neither is a guess: the pane right now reads **positively idle and ready** (a pane that went
  // `unknown` — a modal, a login screen, a half-drawn frame — must not receive a keystroke at all), and the
  // composer still holds exactly our text (a submit that did not land, not a blind repeat).
  const after = capturePaneRaw(driver, agent, BUSY_SCAN_LINES)
  const stillOurs = composerHoldsOurs(composerText(after, agent.provider) ?? '', text)
  // A confirmed submit does not have to announce itself as "busy". Two independent witnesses are enough: our text is out
  // of the composer, and the pane's ledger grew (a tool line, a shell line, a file edit). Providers that never print a
  // busy marker — or print it later than the window — used to look like a failed dispatch while the agent was already
  // working on it (block 23, D9).
  if (!stillOurs && countWorkLines(after) > countWorkLines(beforeEnter)) return { sent: true }
  const afterBusy = detectPaneBusy(after, agent.provider)
  const afterReady = detectPaneReady(after, agent.provider)
  if (afterBusy !== 'idle' || afterReady !== 'ready') return { sent: false, reason: 'unconfirmed' }
  if (!stillOurs) return { sent: false, reason: 'unconfirmed' }
  try {
    driver.tmux(['send-keys', '-t', agent.tmux_pane_id, 'Enter'])
  } catch {
    return { sent: false, reason: 'stale_pane' }
  }
  const retryWindow = Math.min(confirmMs, 5000)
  return waitForBusy(agent, options, driver, retryWindow, pollMs) ? { sent: true } : { sent: false, reason: 'unconfirmed' }
}

// The window is measured in *simulated* time — the sum of the waits this function asked for — not on the
// wall clock: an injected driver delays instantly, and a wall-clock deadline would spin for ninety real
// seconds in every test (and in any caller that injects a driver for a dry run).
function waitForBusy(
  agent: AgentRecord,
  options: RuntimeOptions,
  driver: RuntimeDriver,
  totalMs: number,
  pollMs: number,
): boolean {
  let waited = 0
  while (true) {
    if (paneBusy(agent.id, options) === 'busy') return true
    if (waited + pollMs > totalMs) return false
    waitBlocking(driver, pollMs)
    waited += pollMs
  }
}

// Composer comparison ignores whitespace runs and the box's own wrapping: the same prompt re-drawn by the
// provider must still read as ours, while a different text must not.
function normalizeComposer(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

// Does the composer hold the text we pasted? Exact equality is not enough, and the live codex pane showed why: a long
// paste is rendered on one line and cut with an ellipsis (`› Review commit d60048c…`), and a very long one is folded
// into `[Pasted Content 1020 chars]`. Both are our paste and nobody else's, so a visible prefix of what we typed (with
// a floor, so a bare `› ` cannot match) and the paste placeholder both count.
function composerHoldsOurs(composer: string, text: string): boolean {
  const seen = normalizeComposer(composer)
  const want = normalizeComposer(text)
  if (seen === '' || want === '') return false
  if (seen === want) return true
  if (/^\[Pasted (?:Content|text) \d+ (?:chars|lines)\]/i.test(seen)) return true
  const visible = seen.replace(/[\u2026.]+$/, '').trimEnd()
  return visible.length >= 32 && want.startsWith(visible)
}

export function sendText(agentId: string, text: string, options: RuntimeOptions = {}): void {
  const driver = options.driver ?? realDriver
  const agent = findAgent(agentId)
  if (agent.headless || !agent.tmux_pane_id) throw new Error('This agent is headless - no tmux pane exists')
  if (!paneInSession(driver, agent.tmux_session, agent.tmux_pane_id)) throw new Error(STALE_WINDOW_ERROR)
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
  if (!paneInSession(driver, agent.tmux_session, agent.tmux_pane_id)) throw new Error(STALE_WINDOW_ERROR)
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
  // Only kill the window when the stored id still belongs to this run's session; a
  // stale id (server restart) would name an unrelated window. A failed check means
  // the window is already gone, so the record teardown below proceeds either way.
  // Process escalation is gated on the same check: without a fresh confirmation
  // the pane was really ours, a stale pane_pid could name a reused stranger pid.
  const hadWindow = windowInSession(driver, agent.tmux_session, agent.tmux_window_id)
  if (hadWindow) {
    try {
      driver.tmux(['kill-window', '-t', agent.tmux_window_id])
    } catch {
      // already gone
    }
    reapPaneProcess(agent.pane_pid)
  }
  lastPasteAtByPane.delete(agent.tmux_pane_id)
  const endedAt = nowIso()
  updateAgent(agent.run_id, agent.id, { ended_at: endedAt, task_status: 'done' })
  const updatedAgent = readAgent(agent.run_id, agent.id)
  const endedRun = endRunIfNoLiveAgents(agent.run_id, endedAt)
  if (endedRun.status === 'ended' || endedRun.ended_at !== null) {
    // Same guard as stopRun: never kill a session the run shares with the reeves TUI.
    const runOwnsSession = !!run.reeves_session && run.reeves_session !== run.tmux_session
    if (runOwnsSession) {
      killViewerSessions(driver, run.tmux_session)
      try {
        driver.tmux(['kill-session', '-t', `=${run.tmux_session}`])
      } catch {
        // session may already be gone
      }
    }
    archiveAndRemoveRun(run.id, 'ended')
  }
  return updatedAgent
}

export function stopRun(runId: string, options: RuntimeOptions = {}): RunRecord {
  const driver = options.driver ?? realDriver
  const run = readRun(runId)
  const endedAt = nowIso()
  // Only kill the run's tmux session when it differs from the reeves TUI session; a shared one would close the TUI.
  const runOwnsSession = !!run.reeves_session && run.reeves_session !== run.tmux_session
  // Escalation below is gated on a fresh kill succeeding; if the session/window
  // was already gone the recorded pane_pid may name a reused stranger process.
  let sessionKilled = false
  if (runOwnsSession) {
    killViewerSessions(driver, run.tmux_session)
    try {
      driver.tmux(['kill-session', '-t', `=${run.tmux_session}`])
      sessionKilled = true
    } catch {
      // session may already be gone
    }
  }
  for (const agent of listAgents(run.id)) {
    if (agent.ended_at) continue
    if (!runOwnsSession && windowInSession(driver, agent.tmux_session, agent.tmux_window_id)) {
      try {
        driver.tmux(['kill-window', '-t', agent.tmux_window_id])
      } catch {
        // window may already be gone
      }
      reapPaneProcess(agent.pane_pid)
    } else if (sessionKilled) {
      reapPaneProcess(agent.pane_pid)
    }
    lastPasteAtByPane.delete(agent.tmux_pane_id)
    updateAgent(run.id, agent.id, { ended_at: endedAt })
  }
  const endedRun: RunRecord = { ...run, status: 'ended', ended_at: endedAt }
  updateRun(run.id, { status: endedRun.status, ended_at: endedRun.ended_at })
  emitNotification({
    kind: 'run.stopped',
    title: `run ${run.name || run.id} stopped`,
    run_id: run.id,
    run_name: run.name,
    project: basenameOf(run.working_dir),
    source: 'product',
  })
  archiveAndRemoveRun(run.id, 'ended')
  return endedRun
}

// Switch the attached tmux client to a run (its reeves tab) or to a specific
// agent window, so an agent can surface any run for the user: its own run or
// another. Both tmux calls are best effort. With no attached client there is
// nothing to switch, which is not an error; select-window still sets the
// active window so it is ready when someone attaches.
export function openTmuxTarget(id: string, options: RuntimeOptions = {}): { session: string; window: string; label: string } {
  const driver = options.driver ?? realDriver
  let session: string
  let window: string
  let label: string
  try {
    const run = readRun(id)
    session = run.tmux_session
    window = 'reeves'
    label = run.name
  } catch {
    try {
      const agent = findAgent(id)
      session = agent.tmux_session
      window = agent.tmux_window_id
      label = agent.nickname
    } catch {
      throw new Error(`no run or agent found: ${id}`)
    }
    if (!windowInSession(driver, session, window)) throw new Error(STALE_WINDOW_ERROR)
  }
  const target = `${session}:${window}`
  try { driver.tmux(['switch-client', '-t', target]) } catch { /* no attached client to switch */ }
  try { driver.tmux(['select-window', '-t', target]) } catch { /* best effort */ }
  return { session, window, label }
}
