import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { request } from 'node:http'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { tmpdir } from 'node:os'
import { startWebServer, type WebServerHandle } from '../../src/web/server.js'
import {
  listAgents,
  readAgent,
  readRun,
  readRunAny,
  updateAgent,
  updateRun,
  writeAgent,
  writeRun,
} from '../../src/state/runs.js'
import type { AgentRecord, Provider, RunRecord } from '../../src/state/types.js'
import type { WebOrchestratorRuntime } from '../../src/web/prebeta-orchestrator.js'

let tmpDir: string
let handles: WebServerHandle[]
let originalPath: string | undefined
let originalConfig: string | undefined

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeves-web-actions-'))
  originalPath = process.env.PATH
  originalConfig = process.env.REEVES_CONFIG
  process.env.REEVES_REGISTRY = tmpDir
  process.env.REEVES_CONFIG = join(tmpDir, 'config.json')
  handles = []
})

afterEach(async () => {
  for (const handle of handles) await handle.close()
  delete process.env.REEVES_REGISTRY
  if (originalConfig === undefined) delete process.env.REEVES_CONFIG
  else process.env.REEVES_CONFIG = originalConfig
  if (originalPath === undefined) delete process.env.PATH
  else process.env.PATH = originalPath
  delete process.env.REEVES_FAKE_TMUX_COUNTER
  rmSync(tmpDir, { recursive: true, force: true })
})

async function start(opts: {
  webRoot?: string
  prebetaOrchestrator?: boolean
  orchestratorRuntime?: WebOrchestratorRuntime
} = {}): Promise<WebServerHandle> {
  const handle = await startWebServer({
    open: false,
    webRoot: opts.webRoot,
    prebetaOrchestrator: opts.prebetaOrchestrator,
    orchestratorRuntime: opts.orchestratorRuntime,
  })
  handles.push(handle)
  return handle
}

interface RawResponse { status: number | undefined; body: string; contentType?: string }

// POST helper that stamps our own Origin so the request clears the CSRF guard.
function post(port: number, path: string, body: unknown): Promise<RawResponse> {
  const payload = body === undefined ? '' : JSON.stringify(body)
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port,
        path,
        method: 'POST',
        agent: false,
        headers: {
          origin: `http://127.0.0.1:${port}`,
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload),
        },
      },
      res => {
        let data = ''
        res.on('data', chunk => { data += chunk })
        res.on('end', () => resolve({ status: res.statusCode, body: data }))
      },
    )
    req.on('error', reject)
    req.end(payload)
  })
}

function get(port: number, path: string): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: '127.0.0.1', port, path, method: 'GET', agent: false },
      res => {
        let data = ''
        res.on('data', chunk => { data += chunk })
        res.on('end', () => resolve({ status: res.statusCode, body: data, contentType: res.headers['content-type'] })) },
    )
    req.on('error', reject)
    req.end()
  })
}

function writeExecutable(path: string, source: string): void {
  writeFileSync(path, source, 'utf8')
  chmodSync(path, 0o755)
}

function installFakeRuntimeBins(): void {
  const binDir = join(tmpDir, 'bin')
  mkdirSync(binDir, { recursive: true })
  process.env.PATH = `${binDir}${delimiter}${originalPath ?? ''}`
  process.env.REEVES_FAKE_TMUX_COUNTER = join(tmpDir, 'tmux-counter')

  writeExecutable(join(binDir, 'tmux'), [
    '#!/bin/sh',
    'if [ "$1" = "-V" ]; then echo "tmux 3.6"; exit 0; fi',
    'case "$1" in',
    '  display-message) echo "@0 %0"; exit 0 ;;',
    '  new-window)',
    '    for arg in "$@"; do',
    '      if [ "$arg" = "-P" ]; then',
    '        n=$(cat "$REEVES_FAKE_TMUX_COUNTER" 2>/dev/null || echo 1)',
    '        echo $((n + 1)) > "$REEVES_FAKE_TMUX_COUNTER"',
    '        echo "@$n %$n"',
    '        exit 0',
    '      fi',
    '    done',
    '    exit 0 ;;',
    '  capture-pane) echo "ready"; exit 0 ;;',
    '  *) exit 0 ;;',
    'esac',
    '',
  ].join('\n'))

  for (const bin of ['claude', 'codex', 'opencode', 'hermes', 'kimi', 'deepseek', 'pi', 'qwen', 'aider']) {
    writeExecutable(join(binDir, bin), [
      '#!/bin/sh',
      'if [ "$1" = "--help" ]; then echo "--model"; exit 0; fi',
      'exit 0',
      '',
    ].join('\n'))
  }
}

function makeRun(id: string, mode: RunRecord['mode']): RunRecord {
  return {
    id,
    mode,
    name: `run-${id}`,
    status: 'running',
    tmux_session: `reeves_${id}`,
    reeves_window_id: '@0',
    reeves_pane_id: '%0',
    root_agent_id: `${id}-root`,
    working_dir: tmpDir,
    preset_name: null,
    started_at: '2026-01-01T00:00:00.000Z',
    ended_at: null,
  }
}

function makeAgent(id: string, runId: string, provider: Provider, role: AgentRecord['role']): AgentRecord {
  return {
    id,
    run_id: runId,
    nickname: id,
    provider,
    model: '',
    role,
    working_dir: tmpDir,
    task: '',
    task_status: 'queued',
    task_note: '',
    tmux_session: `reeves_${runId}`,
    tmux_window_id: role === 'root' ? '@1' : '@2',
    tmux_pane_id: role === 'root' ? '%1' : '%2',
    rc_enabled: false,
    permissions: 'ask',
    inbox: [],
    last_seen: 0,
    started_at: '2026-01-01T00:00:01.000Z',
    ended_at: null,
  }
}

function fakeOrchestratorRuntime(): WebOrchestratorRuntime {
  return {
    startRun(request) {
      const run = makeRun('orch', 'orchestrator')
      run.name = request.name
      run.working_dir = request.working_dir
      run.root_agent_id = 'root'
      const root = makeAgent('root', run.id, request.root.provider, 'root')
      root.nickname = request.root.nickname || 'root'
      root.task = request.root.task
      writeRun(run)
      writeAgent(root)
      return { run, agents: [root] }
    },
    spawnWorker(request) {
      const worker = makeAgent('worker', request.run_id, request.provider, 'worker')
      worker.nickname = request.nickname || 'worker'
      worker.task = request.task
      writeAgent(worker)
      return worker
    },
    killAgent(agentId) {
      const agent = readAgent('orch', agentId)
      if (agent.role === 'root') throw new Error('Root agent cannot be killed directly')
      updateAgent(agent.run_id, agent.id, { ended_at: '2026-01-01T00:05:00.000Z', task_status: 'done' })
      return readAgent(agent.run_id, agent.id)
    },
    stopRun(runId) {
      updateRun(runId, { status: 'ended', ended_at: '2026-01-01T00:10:00.000Z' })
      return readRunAny(runId)
    },
  }
}

// Reads only the first SSE frame, then tears the request down (the stream never ends).
function firstSseFrame(port: number, path: string): Promise<{ contentType?: string; frame: string }> {
  return new Promise((resolve, reject) => {
    let done = false
    const req = request(
      { host: '127.0.0.1', port, path, method: 'GET', agent: false },
      res => {
        const contentType = res.headers['content-type']
        let buf = ''
        res.on('data', chunk => {
          buf += chunk
          if (!done && buf.includes('\n\n')) {
            done = true
            req.destroy()
            resolve({ contentType, frame: buf })
          }
        })
      },
    )
    // destroy() surfaces as a socket error after we have already resolved; ignore it.
    req.on('error', err => { if (!done) reject(err) })
    req.end()
  })
}

describe('create terminal', () => {
  it('creates a run, adds a terminal, kills it, and stops the run through HTTP actions', async () => {
    installFakeRuntimeBins()
    const handle = await start()

    const created = await post(handle.port, '/api/terminals', {
      provider: 'codex-cli',
      nickname: 'Builder One',
      run_name: 'Release Check',
      working_dir: tmpDir,
    })
    expect(created.status).toBe(200)
    const createdBody = JSON.parse(created.body) as { id: string; run_id: string }
    expect(readRun(createdBody.run_id).name).toBe('Release Check')
    expect(readAgent(createdBody.run_id, createdBody.id).nickname).toBe('Builder-One')

    const added = await post(handle.port, '/api/terminals', {
      provider: 'claude-code',
      nickname: 'Reviewer',
      run_id: createdBody.run_id,
    })
    expect(added.status).toBe(200)
    const addedBody = JSON.parse(added.body) as { id: string; run_id: string }
    expect(addedBody.run_id).toBe(createdBody.run_id)
    expect(listAgents(createdBody.run_id).map(agent => agent.nickname)).toEqual(['Builder-One', 'Reviewer'])

    const killed = await post(handle.port, `/api/terminals/${encodeURIComponent(addedBody.id)}/kill`, { confirm: true })
    expect(killed.status).toBe(200)
    expect(JSON.parse(killed.body)).toEqual({ ok: true })
    expect(readAgent(createdBody.run_id, addedBody.id).ended_at).not.toBeNull()

    const stopped = await post(handle.port, `/api/runs/${encodeURIComponent(createdBody.run_id)}/stop`, { confirm: true })
    expect(stopped.status).toBe(200)
    expect(JSON.parse(stopped.body)).toEqual({ ok: true })
    expect(readRun(createdBody.run_id).status).toBe('ended')
  })

  it('rejects an unknown provider', async () => {
    const handle = await start()
    const res = await post(handle.port, '/api/terminals', { provider: 'notreal' })
    expect(res.status).toBe(400)
    expect(JSON.parse(res.body).error).toMatch(/unknown provider/i)
  })

  it('rejects a missing provider', async () => {
    const handle = await start()
    const res = await post(handle.port, '/api/terminals', { nickname: 'x' })
    expect(res.status).toBe(400)
    expect(JSON.parse(res.body).error).toMatch(/unknown provider/i)
  })

  it('rejects orchestrator creation unless pre-beta mode is enabled', async () => {
    const handle = await start()
    const res = await post(handle.port, '/api/terminals', {
      provider: 'codex',
      mode: 'orchestrator',
      working_dir: tmpDir,
    })
    expect(res.status).toBe(400)
    expect(JSON.parse(res.body).error).toMatch(/pre-beta orchestrator web mode is not enabled/i)
  })

  it('creates and controls orchestrator runs when pre-beta mode is enabled', async () => {
    const handle = await start({
      prebetaOrchestrator: true,
      orchestratorRuntime: fakeOrchestratorRuntime(),
    })

    const state = await get(handle.port, '/api/state')
    expect(JSON.parse(state.body).prebeta).toEqual({ orchestrator: true })

    const created = await post(handle.port, '/api/terminals', {
      provider: 'codex-cli',
      nickname: 'Lead',
      run_name: 'Orchestrator Check',
      mode: 'orchestrator',
      working_dir: tmpDir,
    })
    expect(created.status).toBe(200)
    const createdBody = JSON.parse(created.body) as { id: string; run_id: string }
    expect(readRunAny(createdBody.run_id).mode).toBe('orchestrator')
    expect(readRunAny(createdBody.run_id).name).toBe('Orchestrator Check')

    const added = await post(handle.port, '/api/terminals', {
      provider: 'claude-code',
      nickname: 'Worker',
      run_id: createdBody.run_id,
    })
    expect(added.status).toBe(200)
    const addedBody = JSON.parse(added.body) as { id: string; run_id: string }
    expect(addedBody.run_id).toBe(createdBody.run_id)

    const rootKill = await post(handle.port, `/api/terminals/${encodeURIComponent(createdBody.id)}/kill`, { confirm: true })
    expect(rootKill.status).toBe(400)
    expect(JSON.parse(rootKill.body).error).toMatch(/root agent cannot be killed/i)

    const workerKill = await post(handle.port, `/api/terminals/${encodeURIComponent(addedBody.id)}/kill`, { confirm: true })
    expect(workerKill.status).toBe(200)
    expect(readAgent(createdBody.run_id, addedBody.id).ended_at).not.toBeNull()

    const stopped = await post(handle.port, `/api/runs/${encodeURIComponent(createdBody.run_id)}/stop`, { confirm: true })
    expect(stopped.status).toBe(200)
    expect(readRunAny(createdBody.run_id).status).toBe('ended')
  })
})

describe('kill terminal', () => {
  it('requires confirmation', async () => {
    const handle = await start()
    const res = await post(handle.port, '/api/terminals/ghost/kill', {})
    expect(res.status).toBe(400)
    expect(JSON.parse(res.body).error).toMatch(/confirmation required/i)
  })

  it('returns not found for an unknown terminal', async () => {
    const handle = await start()
    const res = await post(handle.port, '/api/terminals/ghost/kill', { confirm: true })
    expect(res.status).toBe(400)
    expect(JSON.parse(res.body).error).toMatch(/not found/i)
  })
})

describe('stop run', () => {
  it('requires confirmation', async () => {
    const handle = await start()
    const res = await post(handle.port, '/api/runs/ghost/stop', {})
    expect(res.status).toBe(400)
    expect(JSON.parse(res.body).error).toMatch(/confirmation required/i)
  })

  it('returns not found for an unknown run', async () => {
    const handle = await start()
    const res = await post(handle.port, '/api/runs/ghost/stop', { confirm: true })
    expect(res.status).toBe(400)
    expect(JSON.parse(res.body).error).toMatch(/not found/i)
  })
})

describe('state stream', () => {
  it('serves an event-stream that opens with the current state', async () => {
    const handle = await start()
    const { contentType, frame } = await firstSseFrame(handle.port, '/api/events')
    expect(contentType).toContain('text/event-stream')
    expect(frame).toContain('data:')
    expect(frame).toContain('"runs"')
  })
})

describe('static assets', () => {
  it('serves an allowlisted asset from the web root and 404s a missing one', async () => {
    writeFileSync(join(tmpDir, 'app.js'), '// fixture\n')
    const handle = await start({ webRoot: tmpDir })

    const present = await get(handle.port, '/app.js')
    expect(present.status).toBe(200)
    expect(present.contentType).toContain('text/javascript')

    const missing = await get(handle.port, '/xterm.js')
    expect(missing.status).toBe(404)
  })
})
