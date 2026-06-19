// On-demand loopback HTTP server for the web UI.
// Input: optional port/open/webRoot preferences. Output: a server bound to 127.0.0.1
// that serves the client, streams state over SSE, and runs create/kill/stop actions.
// Invariant: foreground only (no daemon), loopback only, no user login. The SSE poller
// lives only while a browser is connected. Stopping the server never touches a terminal.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { Server } from 'node:http'
import type { Socket } from 'node:net'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isAllowedHostHeader, isAllowedOrigin, isStateChangingMethod } from './guards.js'
import { buildWebState, listWebProviders } from './state.js'
import { placeholderPage } from './client-shell.js'
import { attachTerminalBridge } from './bridge.js'
import { startRun, spawnWorker, killAgent, stopRun } from '../launcher/runtime.js'
import { normalizeProvider } from '../launcher/providers.js'
import { modelValuesForProvider } from '../launcher/model-catalog.js'
import { providerDisplayName } from '../utils/display.js'
import type { Permissions, Provider } from '../state/types.js'
import { loadConfig, saveConfig } from '../state/config.js'
import { isLanguageCode, LANGUAGE_OPTIONS } from '../i18n/languages.js'
import { localeCatalog } from '../i18n/catalog.js'
import {
  archiveAndRemoveRun,
  autoCleanupRuns,
  deleteAgent,
  deleteRunHistory,
  findAgent,
  findAgentAny,
  listRunHistory,
  readRun,
  readRunAny,
} from '../state/runs.js'
import { resolveRunApproval } from '../state/approvals.js'
import { runDoctor } from '../launcher/doctor.js'
import { REEVESAGENTS_VERSION } from '../version.js'
import {
  isOrchestratorWebProvider,
  loadWebOrchestratorRuntime,
  type WebOrchestratorRuntime,
} from './prebeta-orchestrator.js'
import {
  hostStatus as mcpHostStatus,
  attach as attachMcpHost,
  detach as detachMcpHost,
  attachAll as attachAllMcpHosts,
} from '../agent-mcp/installer.js'

const HOST = '127.0.0.1'
const DEFAULT_PORT = 8080
const DEFAULT_RANGE = 10
const POLL_MS = 1500
const MAX_BODY = 64 * 1024
const DEFAULT_WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), 'web')

// Fixed asset allowlist: route -> file under webRoot. Never joins a client-supplied
// path, so there is no traversal surface.
const STATIC_ROUTES: Record<string, { file: string; type: string }> = {
  '/app.css': { file: 'app.css', type: 'text/css; charset=utf-8' },
  '/app.js': { file: 'app.js', type: 'text/javascript; charset=utf-8' },
  '/xterm.css': { file: 'xterm.css', type: 'text/css; charset=utf-8' },
  '/xterm.js': { file: 'xterm.js', type: 'text/javascript; charset=utf-8' },
  '/addon-fit.js': { file: 'addon-fit.js', type: 'text/javascript; charset=utf-8' },
  '/brand-duck.json': { file: 'brand-duck.json', type: 'application/json; charset=utf-8' },
}

export interface WebServerOptions {
  port?: number
  range?: number
  open?: boolean
  webRoot?: string
  prebetaOrchestrator?: boolean
  orchestratorRuntime?: WebOrchestratorRuntime
}

export interface WebServerHandle {
  url: string
  port: number
  close: () => Promise<void>
}

interface RequestContext {
  port: () => number
  webRoot: string
  cache: Map<string, Buffer>
  sse: SseHub
  prebetaOrchestrator: boolean
  orchestratorRuntime?: WebOrchestratorRuntime
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function send(res: ServerResponse, status: number, body: string | Buffer, contentType: string): void {
  res.writeHead(status, {
    'content-type': contentType,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(body)
}

function sendJson(res: ServerResponse, status: number, obj: unknown): void {
  send(res, status, JSON.stringify(obj), 'application/json; charset=utf-8')
}

function webLanguagePayload(): unknown {
  const current = loadConfig().global.language
  return {
    current,
    languages: LANGUAGE_OPTIONS,
    translations: localeCatalog(current),
  }
}

function serveAsset(res: ServerResponse, file: string, type: string, ctx: RequestContext): void {
  let buf = ctx.cache.get(file)
  if (!buf) {
    try {
      buf = readFileSync(join(ctx.webRoot, file))
    } catch {
      send(res, 404, 'asset missing; run the build', 'text/plain; charset=utf-8')
      return
    }
    ctx.cache.set(file, buf)
  }
  send(res, 200, buf, type)
}

// Serves the built page, falling back to an embedded placeholder when the client
// has not been built yet (also what unit tests hit, since they do not run the build).
function serveIndex(res: ServerResponse, ctx: RequestContext): void {
  let buf = ctx.cache.get('index.html')
  if (!buf) {
    try {
      buf = readFileSync(join(ctx.webRoot, 'index.html'))
      ctx.cache.set('index.html', buf)
    } catch {
      send(res, 200, placeholderPage(), 'text/html; charset=utf-8')
      return
    }
  }
  send(res, 200, buf, 'text/html; charset=utf-8')
}

interface SseHub {
  add: (_res: ServerResponse) => void
  close: () => void
}

// Pushes the run/terminal state to connected browsers. The poller starts when the
// first client connects and stops when the last disconnects: connection-scoped, not
// a daemon. fs.watch is avoided because recursive watch is unreliable across platforms.
function createSseHub(prebetaOrchestrator: boolean): SseHub {
  const clients = new Set<ServerResponse>()
  let timer: ReturnType<typeof setInterval> | null = null
  let last = ''

  const snapshot = (): string => {
    autoCleanupRuns({ includeAllModes: prebetaOrchestrator, cleanStale: false })
    return JSON.stringify(buildWebState({ prebetaOrchestrator }))
  }
  const write = (res: ServerResponse, payload: string): void => {
    try { res.write(`data: ${payload}\n\n`) } catch { /* client gone; close handler will drop it */ }
  }
  const tick = (): void => {
    const payload = snapshot()
    if (payload === last) return
    last = payload
    for (const res of clients) write(res, payload)
  }
  const start = (): void => {
    if (timer) return
    last = snapshot()
    timer = setInterval(tick, POLL_MS)
    timer.unref()
  }
  const stop = (): void => {
    if (timer) { clearInterval(timer); timer = null }
  }

  return {
    add(res) {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-store',
        'connection': 'keep-alive',
        'x-content-type-options': 'nosniff',
      })
      write(res, snapshot())
      clients.add(res)
      start()
      res.on('close', () => {
        clients.delete(res)
        if (clients.size === 0) stop()
      })
    },
    close() {
      stop()
      for (const res of clients) { try { res.end() } catch { /* already closed */ } }
      clients.clear()
    },
  }
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buf = chunk as Buffer
    size += buf.length
    if (size > MAX_BODY) throw new Error('request body too large')
    chunks.push(buf)
  }
  if (chunks.length === 0) return {}
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (!parsed || typeof parsed !== 'object') throw new Error('expected a JSON object')
  return parsed as Record<string, unknown>
}

function sanitizeNickname(raw: string): string {
  return raw.trim().replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 40)
}

function sanitizeRunName(raw: string): string {
  return raw.trim().replace(/[^\p{L}\p{N} _.-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 80).trim()
}

function normalizeModel(provider: Provider, raw: unknown): string {
  const model = typeof raw === 'string' ? raw.trim() : ''
  if (!modelValuesForProvider(provider).includes(model)) {
    throw new Error('unknown model for provider')
  }
  return model
}

function normalizePermissionsInput(raw: unknown): Permissions | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined
  if (raw === 'ask' || raw === 'skip') return raw
  throw new Error('unknown permission mode')
}

// Creates a terminal: a worker in an existing run, or a fresh single-terminal run.
// Provider is validated against the known set (it maps to the launched binary);
// nickname is sanitized; the prompt is typed into the pane by the runtime, not shelled.
async function createTerminal(body: Record<string, unknown>, ctx: RequestContext): Promise<{ id: string; run_id: string }> {
  const provider = body.provider
  const normalizedProvider = normalizeProvider(provider)
  if (!normalizedProvider) throw new Error('unknown provider')
  const model = normalizeModel(normalizedProvider, body.model)
  const permissions = normalizePermissionsInput(body.permissions)
  const nickname = sanitizeNickname(typeof body.nickname === 'string' ? body.nickname : '')
  const runName = sanitizeRunName(typeof body.run_name === 'string' ? body.run_name : '')
  const prompt = typeof body.prompt === 'string' ? body.prompt : ''
  const runId = typeof body.run_id === 'string' && body.run_id ? body.run_id : null

  if (runId) {
    const run = ctx.prebetaOrchestrator ? readRunAny(runId) : readRun(runId)
    const mode = run.mode === 'spawner' ? 'spawner' : 'orchestrator'
    if (mode === 'orchestrator') {
      if (!ctx.orchestratorRuntime) throw new Error('PRE-BETA orchestrator web mode is not enabled')
      if (!isOrchestratorWebProvider(normalizedProvider)) throw new Error('provider is not supported in PRE-BETA orchestrator mode')
      const agent = ctx.orchestratorRuntime.spawnWorker({
        run_id: runId,
        provider: normalizedProvider,
        nickname: nickname || undefined,
        model,
        permissions,
        task: prompt,
      })
      return { id: agent.id, run_id: agent.run_id }
    }
    const agent = spawnWorker({ run_id: runId, provider: normalizedProvider, nickname: nickname || undefined, model, permissions, task: prompt })
    return { id: agent.id, run_id: agent.run_id }
  }

  const mode = body.mode === 'orchestrator' ? 'orchestrator' : 'spawner'
  const workingDir = typeof body.working_dir === 'string' && body.working_dir.trim()
    ? body.working_dir.trim()
    : process.cwd()
  if (mode === 'orchestrator') {
    if (!ctx.prebetaOrchestrator || !ctx.orchestratorRuntime) throw new Error('PRE-BETA orchestrator web mode is not enabled')
    if (!isOrchestratorWebProvider(normalizedProvider)) throw new Error('provider is not supported in PRE-BETA orchestrator mode')
    const result = ctx.orchestratorRuntime.startRun({
      mode: 'orchestrator',
      name: runName || nickname || providerDisplayName(normalizedProvider),
      working_dir: workingDir,
      root: { provider: normalizedProvider, nickname: nickname || undefined, model, permissions, task: prompt },
    })
    const root = result.agents[0]
    if (!root) throw new Error('run created no agent')
    return { id: root.id, run_id: result.run.id }
  }

  const result = startRun({
    mode: 'spawner',
    name: runName || nickname || providerDisplayName(normalizedProvider),
    working_dir: workingDir,
    root: { provider: normalizedProvider, nickname: nickname || undefined, model, permissions, task: prompt },
  })
  const root = result.agents[0]
  if (!root) throw new Error('run created no agent')
  return { id: root.id, run_id: result.run.id }
}

function requireConfirm(body: Record<string, unknown>): void {
  if (body.confirm !== true) throw new Error('confirmation required')
}

function updateLanguage(body: Record<string, unknown>): unknown {
  if (!isLanguageCode(body.language)) throw new Error('unknown language')
  const cfg = loadConfig()
  cfg.global.language = body.language
  saveConfig(cfg)
  return webLanguagePayload()
}

// Agent control: list the MCP-capable host CLIs and attach/detach the
// reevesagents MCP per host by calling that CLI's own mcp add/remove. This only
// touches the host CLI's own config and is gated to loopback by the same origin
// guard as every other state-changing route.
function mcpHostsPayload(): unknown {
  return { hosts: mcpHostStatus() }
}

function attachMcpHostAction(body: Record<string, unknown>): unknown {
  const key = typeof body.key === 'string' ? body.key : ''
  if (!key) throw new Error('host key is required')
  const result = attachMcpHost(key)
  return { result, hosts: mcpHostStatus() }
}

function detachMcpHostAction(body: Record<string, unknown>): unknown {
  const key = typeof body.key === 'string' ? body.key : ''
  if (!key) throw new Error('host key is required')
  const result = detachMcpHost(key)
  return { result, hosts: mcpHostStatus() }
}

function attachAllMcpHostsAction(): unknown {
  return { results: attachAllMcpHosts(), hosts: mcpHostStatus() }
}

function killTerminal(id: string, ctx: RequestContext): void {
  const agent = ctx.prebetaOrchestrator ? findAgentAny(id) : findAgent(id)
  const run = ctx.prebetaOrchestrator ? readRunAny(agent.run_id) : readRun(agent.run_id)
  if (run.mode === 'spawner') {
    killAgent(id)
    return
  }
  if (!ctx.orchestratorRuntime) throw new Error('PRE-BETA orchestrator web mode is not enabled')
  ctx.orchestratorRuntime.killAgent(id)
}

function deleteTerminal(id: string, ctx: RequestContext): void {
  const agent = ctx.prebetaOrchestrator ? findAgentAny(id) : findAgent(id)
  if (!agent.ended_at) throw new Error('Stop agent before deleting it')
  deleteAgent(id, { includeAllModes: ctx.prebetaOrchestrator })
}

function stopWebRun(id: string, ctx: RequestContext): void {
  const run = ctx.prebetaOrchestrator ? readRunAny(id) : readRun(id)
  if (run.mode === 'spawner') {
    stopRun(id)
    return
  }
  if (!ctx.orchestratorRuntime) throw new Error('PRE-BETA orchestrator web mode is not enabled')
  ctx.orchestratorRuntime.stopRun(id)
}

function deleteWebRun(id: string, ctx: RequestContext): void {
  const run = ctx.prebetaOrchestrator ? readRunAny(id) : readRun(id)
  if (run.status !== 'ended' && run.ended_at === null) throw new Error('Stop run before deleting it')
  archiveAndRemoveRun(id, 'ended')
}

function deleteHistoryRecord(id: string, ctx: RequestContext): void {
  const history = listRunHistory({ includeAllModes: ctx.prebetaOrchestrator })
  if (!history.some(record => record.id === id)) throw new Error('history record not found')
  deleteRunHistory(id)
}

// Resolve a pending approval (approve or deny). The decision is the confirmation,
// so no separate confirm flag is required; the origin guard already blocks CSRF.
function resolveApprovalAction(id: string, body: Record<string, unknown>): unknown {
  const decision = body.decision === 'approved' ? 'approved' : body.decision === 'denied' ? 'denied' : null
  if (!decision) throw new Error('decision must be approved or denied')
  const note = typeof body.note === 'string' ? body.note : ''
  return resolveRunApproval(id, decision, note)
}

async function handleRequest(req: IncomingMessage, res: ServerResponse, ctx: RequestContext): Promise<void> {
  if (!isAllowedHostHeader(req.headers.host)) {
    send(res, 403, 'forbidden host', 'text/plain; charset=utf-8')
    return
  }
  if (isStateChangingMethod(req.method) && !isAllowedOrigin(req.headers.origin, ctx.port())) {
    send(res, 403, 'forbidden origin', 'text/plain; charset=utf-8')
    return
  }

  const path = (req.url ?? '/').split('?')[0]
  const method = req.method ?? 'GET'

  if (method === 'GET' && (path === '/' || path === '/index.html')) {
    serveIndex(res, ctx)
    return
  }
  const asset = STATIC_ROUTES[path]
  if (method === 'GET' && asset) {
    serveAsset(res, asset.file, asset.type, ctx)
    return
  }
  if (method === 'GET' && path === '/api/state') {
    autoCleanupRuns({ includeAllModes: ctx.prebetaOrchestrator, cleanStale: false })
    sendJson(res, 200, {
      ...buildWebState({ prebetaOrchestrator: ctx.prebetaOrchestrator }),
      providers: listWebProviders(),
      prebeta: { orchestrator: ctx.prebetaOrchestrator },
      language: webLanguagePayload(),
      version: REEVESAGENTS_VERSION,
    })
    return
  }
  if (method === 'GET' && path === '/api/mcp-hosts') {
    try {
      sendJson(res, 200, mcpHostsPayload())
    } catch (err) {
      sendJson(res, 400, { error: errMessage(err) })
    }
    return
  }
  if (method === 'GET' && path === '/api/doctor') {
    try {
      sendJson(res, 200, runDoctor())
    } catch (err) {
      sendJson(res, 400, { error: errMessage(err) })
    }
    return
  }
  if (method === 'GET' && path === '/api/events') {
    ctx.sse.add(res)
    return
  }
  if (method === 'GET' && path === '/healthz') {
    send(res, 200, 'ok', 'text/plain; charset=utf-8')
    return
  }

  if (method === 'POST' && path === '/api/terminals') {
    try {
      const body = await readJsonBody(req)
      sendJson(res, 200, await createTerminal(body, ctx))
    } catch (err) {
      sendJson(res, 400, { error: errMessage(err) })
    }
    return
  }
  if (method === 'POST' && path === '/api/language') {
    try {
      const body = await readJsonBody(req)
      sendJson(res, 200, updateLanguage(body))
    } catch (err) {
      sendJson(res, 400, { error: errMessage(err) })
    }
    return
  }
  if (method === 'POST' && path === '/api/mcp-hosts/attach') {
    try {
      const body = await readJsonBody(req)
      sendJson(res, 200, attachMcpHostAction(body))
    } catch (err) {
      sendJson(res, 400, { error: errMessage(err) })
    }
    return
  }
  if (method === 'POST' && path === '/api/mcp-hosts/detach') {
    try {
      const body = await readJsonBody(req)
      sendJson(res, 200, detachMcpHostAction(body))
    } catch (err) {
      sendJson(res, 400, { error: errMessage(err) })
    }
    return
  }
  if (method === 'POST' && path === '/api/mcp-hosts/attach-all') {
    try {
      sendJson(res, 200, attachAllMcpHostsAction())
    } catch (err) {
      sendJson(res, 400, { error: errMessage(err) })
    }
    return
  }
  const killMatch = path.match(/^\/api\/terminals\/([^/]+)\/kill$/)
  if (method === 'POST' && killMatch) {
    try {
      const body = await readJsonBody(req)
      requireConfirm(body)
      killTerminal(decodeURIComponent(killMatch[1]!), ctx)
      sendJson(res, 200, { ok: true })
    } catch (err) {
      sendJson(res, 400, { error: errMessage(err) })
    }
    return
  }
  const deleteTerminalMatch = path.match(/^\/api\/terminals\/([^/]+)\/delete$/)
  if (method === 'POST' && deleteTerminalMatch) {
    try {
      const body = await readJsonBody(req)
      requireConfirm(body)
      deleteTerminal(decodeURIComponent(deleteTerminalMatch[1]!), ctx)
      sendJson(res, 200, { ok: true })
    } catch (err) {
      sendJson(res, 400, { error: errMessage(err) })
    }
    return
  }
  const stopMatch = path.match(/^\/api\/runs\/([^/]+)\/stop$/)
  if (method === 'POST' && stopMatch) {
    try {
      const body = await readJsonBody(req)
      requireConfirm(body)
      stopWebRun(decodeURIComponent(stopMatch[1]!), ctx)
      sendJson(res, 200, { ok: true })
    } catch (err) {
      sendJson(res, 400, { error: errMessage(err) })
    }
    return
  }
  const deleteRunMatch = path.match(/^\/api\/runs\/([^/]+)\/delete$/)
  if (method === 'POST' && deleteRunMatch) {
    try {
      const body = await readJsonBody(req)
      requireConfirm(body)
      deleteWebRun(decodeURIComponent(deleteRunMatch[1]!), ctx)
      sendJson(res, 200, { ok: true })
    } catch (err) {
      sendJson(res, 400, { error: errMessage(err) })
    }
    return
  }
  const deleteHistoryMatch = path.match(/^\/api\/history\/([^/]+)\/delete$/)
  if (method === 'POST' && deleteHistoryMatch) {
    try {
      const body = await readJsonBody(req)
      requireConfirm(body)
      deleteHistoryRecord(decodeURIComponent(deleteHistoryMatch[1]!), ctx)
      sendJson(res, 200, { ok: true })
    } catch (err) {
      sendJson(res, 400, { error: errMessage(err) })
    }
    return
  }
  const resolveApprovalMatch = path.match(/^\/api\/approvals\/([^/]+)\/resolve$/)
  if (method === 'POST' && resolveApprovalMatch) {
    try {
      const body = await readJsonBody(req)
      sendJson(res, 200, resolveApprovalAction(decodeURIComponent(resolveApprovalMatch[1]!), body))
    } catch (err) {
      sendJson(res, 400, { error: errMessage(err) })
    }
    return
  }

  send(res, 404, 'not found', 'text/plain; charset=utf-8')
}

function listenWithFallback(server: Server, basePort: number, range: number): Promise<number> {
  return new Promise((resolve, reject) => {
    let port = basePort
    const attempt = (): void => {
      const onError = (err: Error & { code?: string }): void => {
        if (err.code === 'EADDRINUSE' && port < basePort + range - 1) {
          port += 1
          setTimeout(attempt, 0)
          return
        }
        reject(err)
      }
      server.once('error', onError)
      server.listen(port, HOST, () => {
        server.removeListener('error', onError)
        resolve(port)
      })
    }
    attempt()
  })
}

export async function startWebServer(options: WebServerOptions = {}): Promise<WebServerHandle> {
  const basePort = options.port && Number.isFinite(options.port) ? options.port : DEFAULT_PORT
  const range = options.range && options.range > 0 ? options.range : DEFAULT_RANGE
  const webRoot = options.webRoot ?? DEFAULT_WEB_ROOT
  const prebetaOrchestrator = options.prebetaOrchestrator === true
  const orchestratorRuntime = prebetaOrchestrator
    ? await loadWebOrchestratorRuntime(options.orchestratorRuntime)
    : undefined
  const cache = new Map<string, Buffer>()
  const sse = createSseHub(prebetaOrchestrator)

  const sockets = new Set<Socket>()
  let boundPort = basePort
  const ctx: RequestContext = {
    port: () => boundPort,
    webRoot,
    cache,
    sse,
    prebetaOrchestrator,
    orchestratorRuntime,
  }
  const server = createServer((req, res) => {
    handleRequest(req, res, ctx).catch(() => {
      try { send(res, 500, 'internal error', 'text/plain; charset=utf-8') } catch { /* headers already sent */ }
    })
  })
  server.on('connection', socket => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })
  const bridge = attachTerminalBridge(server, () => boundPort, { prebetaOrchestrator })

  boundPort = await listenWithFallback(server, basePort, range)
  const url = `http://${HOST}:${boundPort}`

  if (options.open !== false) {
    const { openBrowser } = await import('./open-browser.js')
    openBrowser(url)
  }

  return {
    url,
    port: boundPort,
    close: async () => {
      sse.close()
      await bridge.close()
      await new Promise<void>(resolve => {
        for (const socket of sockets) socket.destroy()
        server.close(() => resolve())
      })
    },
  }
}
