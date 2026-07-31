import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { request } from 'node:http'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { tmpdir } from 'node:os'
import { startWebServer, type WebServerHandle } from '../../src/surfaces/webui/server.js'
import {
  listAgents,
  listRunHistory,
  readAgent,
  readRun,
  writeAgent,
  writeRun,
} from '../../src/core/runs.js'
import { loadConfig } from '../../src/core/config.js'
import type { AgentRecord, Provider, RunRecord } from '../../src/core/types.js'

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
} = {}): Promise<WebServerHandle> {
  const handle = await startWebServer({
    open: false,
    webRoot: opts.webRoot,
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
    '  list-windows) echo "@0"; echo "@1"; echo "@2"; echo "@3"; echo "@4"; exit 0 ;;',
    '  list-panes) echo "%0"; echo "%1"; echo "%2"; echo "%3"; echo "%4"; exit 0 ;;',
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

function makeRun(id: string): RunRecord {
  return {
    id,
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
      model: 'gpt-5-codex',
      permissions: 'skip',
      nickname: 'Builder One',
      run_name: 'Release Check',
      working_dir: tmpDir,
    })
    expect(created.status).toBe(200)
    const createdBody = JSON.parse(created.body) as { id: string; run_id: string }
    expect(readRun(createdBody.run_id).name).toBe('Release Check')
    const root = readAgent(createdBody.run_id, createdBody.id)
    expect(root.nickname).toBe('Builder-One')
    expect(root.model).toBe('gpt-5-codex')
    expect(root.permissions).toBe('skip')

    const added = await post(handle.port, '/api/terminals', {
      provider: 'claude-code',
      model: 'sonnet',
      permissions: 'ask',
      nickname: 'Reviewer',
      run_id: createdBody.run_id,
    })
    expect(added.status).toBe(200)
    const addedBody = JSON.parse(added.body) as { id: string; run_id: string }
    expect(addedBody.run_id).toBe(createdBody.run_id)
    expect(listAgents(createdBody.run_id).map(agent => agent.nickname)).toEqual(['Builder-One', 'Reviewer'])
    expect(readAgent(createdBody.run_id, addedBody.id).model).toBe('sonnet')
    expect(readAgent(createdBody.run_id, addedBody.id).permissions).toBe('ask')

    const killed = await post(handle.port, `/api/terminals/${encodeURIComponent(addedBody.id)}/kill`, { confirm: true })
    expect(killed.status).toBe(200)
    expect(JSON.parse(killed.body)).toEqual({ ok: true })
    expect(readAgent(createdBody.run_id, addedBody.id).ended_at).not.toBeNull()

    const deletedAgent = await post(handle.port, `/api/terminals/${encodeURIComponent(addedBody.id)}/delete`, { confirm: true })
    expect(deletedAgent.status).toBe(200)
    expect(JSON.parse(deletedAgent.body)).toEqual({ ok: true })
    expect(listAgents(createdBody.run_id).map(agent => agent.id)).not.toContain(addedBody.id)

    const stopped = await post(handle.port, `/api/runs/${encodeURIComponent(createdBody.run_id)}/stop`, { confirm: true })
    expect(stopped.status).toBe(200)
    expect(JSON.parse(stopped.body)).toEqual({ ok: true })
    expect(() => readRun(createdBody.run_id)).toThrow(/Run not found/)

    const stateAfterStop = await get(handle.port, '/api/state')
    const parsed = JSON.parse(stateAfterStop.body)
    expect(parsed.runs).toEqual([])
    expect(parsed.history.map((record: { id: string }) => record.id)).toContain(createdBody.run_id)

    const deleted = await post(handle.port, `/api/history/${encodeURIComponent(createdBody.run_id)}/delete`, { confirm: true })
    expect(deleted.status).toBe(200)
    expect(JSON.parse(deleted.body)).toEqual({ ok: true })
    expect(listRunHistory()).toEqual([])
  })

  it('ends a run when its only web terminal is killed', async () => {
    installFakeRuntimeBins()
    const handle = await start()

    const created = await post(handle.port, '/api/terminals', {
      provider: 'codex-cli',
      nickname: 'Solo',
      run_name: 'Solo Run',
      working_dir: tmpDir,
    })
    expect(created.status).toBe(200)
    const createdBody = JSON.parse(created.body) as { id: string; run_id: string }

    const killed = await post(handle.port, `/api/terminals/${encodeURIComponent(createdBody.id)}/kill`, { confirm: true })
    expect(killed.status).toBe(200)
    expect(() => readRun(createdBody.run_id)).toThrow(/Run not found/)

    const stateAfterKill = await get(handle.port, '/api/state')
    const parsed = JSON.parse(stateAfterKill.body)
    expect(parsed.runs).toEqual([])
    expect(parsed.history.map((record: { id: string }) => record.id)).toContain(createdBody.run_id)
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

  it('accepts an uncatalogued model but rejects unknown permission values', async () => {
    installFakeRuntimeBins()
    const handle = await start()

    // The curated catalog is a suggestion list, not a whitelist: a model that is
    // not curated yet is accepted and reaches the agent record (mirrors CLI/MCP).
    const customModel = await post(handle.port, '/api/terminals', {
      provider: 'codex',
      model: 'gpt-6-codex-preview',
    })
    expect(customModel.status).toBe(200)
    const created = JSON.parse(customModel.body)
    expect(readAgent(created.run_id, created.id).model).toBe('gpt-6-codex-preview')

    const badPermissions = await post(handle.port, '/api/terminals', {
      provider: 'codex',
      permissions: 'always',
    })
    expect(badPermissions.status).toBe(400)
    expect(JSON.parse(badPermissions.body).error).toMatch(/unknown permission mode/i)
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

describe('delete terminal', () => {
  it('requires confirmation', async () => {
    const handle = await start()
    const res = await post(handle.port, '/api/terminals/ghost/delete', {})
    expect(res.status).toBe(400)
    expect(JSON.parse(res.body).error).toMatch(/confirmation required/i)
  })

  it('requires the terminal to be stopped first', async () => {
    installFakeRuntimeBins()
    const handle = await start()
    const created = await post(handle.port, '/api/terminals', {
      provider: 'codex-cli',
      nickname: 'Live Delete Guard',
      working_dir: tmpDir,
    })
    const createdBody = JSON.parse(created.body) as { id: string; run_id: string }

    const res = await post(handle.port, `/api/terminals/${encodeURIComponent(createdBody.id)}/delete`, { confirm: true })

    expect(res.status).toBe(400)
    expect(JSON.parse(res.body).error).toMatch(/stop agent before deleting/i)
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

describe('delete run', () => {
  it('requires confirmation', async () => {
    const handle = await start()
    const res = await post(handle.port, '/api/runs/ghost/delete', {})
    expect(res.status).toBe(400)
    expect(JSON.parse(res.body).error).toMatch(/confirmation required/i)
  })

  it('requires the run to be stopped first', async () => {
    installFakeRuntimeBins()
    const handle = await start()
    const created = await post(handle.port, '/api/terminals', {
      provider: 'codex-cli',
      nickname: 'Run Delete Guard',
      working_dir: tmpDir,
    })
    const createdBody = JSON.parse(created.body) as { id: string; run_id: string }

    const res = await post(handle.port, `/api/runs/${encodeURIComponent(createdBody.run_id)}/delete`, { confirm: true })

    expect(res.status).toBe(400)
    expect(JSON.parse(res.body).error).toMatch(/stop run before deleting/i)
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

describe('agent control (mcp hosts)', () => {
  // Every case installs fake host bins on PATH first, so attach/detach/list run
  // the fakes (which just exit 0) and never touch the real CLIs' MCP config.
  it('lists the MCP-capable host CLIs with their status', async () => {
    installFakeRuntimeBins()
    const handle = await start()

    const res = await get(handle.port, '/api/mcp-hosts')
    expect(res.status).toBe(200)
    const body = JSON.parse(res.body) as { hosts: Array<{ key: string; bin: string; installed: boolean; attached: boolean; manual: boolean }> }
    const cc = body.hosts.find(h => h.key === 'cc')!
    expect(cc).toMatchObject({ key: 'cc', bin: 'claude', installed: true, attached: false, manual: false })
    const opencode = body.hosts.find(h => h.key === 'opencode')!
    expect(opencode.manual).toBe(false)
  })

  it('attaches and detaches a drivable host', async () => {
    installFakeRuntimeBins()
    const handle = await start()

    const attached = await post(handle.port, '/api/mcp-hosts/attach', { key: 'cc' })
    expect(attached.status).toBe(200)
    const attachBody = JSON.parse(attached.body) as { result: { ok: boolean }; hosts: unknown[] }
    expect(attachBody.result.ok).toBe(true)
    expect(Array.isArray(attachBody.hosts)).toBe(true)

    const detached = await post(handle.port, '/api/mcp-hosts/detach', { key: 'cc' })
    expect(detached.status).toBe(200)
    expect((JSON.parse(detached.body) as { result: { ok: boolean } }).result.ok).toBe(true)
  })

  it('attaches every installed drivable host at once', async () => {
    installFakeRuntimeBins()
    const handle = await start()

    const res = await post(handle.port, '/api/mcp-hosts/attach-all', {})
    expect(res.status).toBe(200)
    const body = JSON.parse(res.body) as { results: Array<{ key: string; ok: boolean }>; hosts: unknown[] }
    expect(body.results.length).toBeGreaterThan(0)
    expect(body.results.every(r => r.ok)).toBe(true)
  })

  it('rejects an unknown host key', async () => {
    installFakeRuntimeBins()
    const handle = await start()
    const res = await post(handle.port, '/api/mcp-hosts/attach', { key: 'nope' })
    expect(res.status).toBe(400)
    expect(JSON.parse(res.body).error).toMatch(/unknown cli/i)
  })

  it('rejects a missing host key', async () => {
    const handle = await start()
    const res = await post(handle.port, '/api/mcp-hosts/attach', {})
    expect(res.status).toBe(400)
    expect(JSON.parse(res.body).error).toMatch(/host key is required/i)
  })
})

describe('approvals', () => {
  it('lists pending approvals in state and resolves one through HTTP', async () => {
    const { createRunApproval, listRunApprovals } = await import('../../src/core/approvals.js')

    writeRun(makeRun('appr-run'))
    writeAgent(makeAgent('appr-agent', 'appr-run', 'cc', 'root'))
    const approval = createRunApproval({
      agent_id: 'appr-agent',
      action: 'deploy to prod',
      summary: 'please approve the deploy',
      risk: 'high',
    })

    const handle = await start()

    // The pending approval shows up in the web state, enriched with run/agent info.
    const state = JSON.parse((await get(handle.port, '/api/state')).body)
    expect(state.approvals).toHaveLength(1)
    expect(state.approvals[0]).toMatchObject({
      id: approval.id,
      run_id: 'appr-run',
      run_name: 'run-appr-run',
      agent_id: 'appr-agent',
      agent_nickname: 'appr-agent',
      provider: 'cc',
      provider_label: 'Claude Code',
      action: 'deploy to prod',
      summary: 'please approve the deploy',
      risk: 'high',
    })

    // A non-approve/deny decision is rejected.
    const bad = await post(handle.port, `/api/approvals/${encodeURIComponent(approval.id)}/resolve`, { decision: 'maybe' })
    expect(bad.status).toBe(400)
    expect(JSON.parse(bad.body).error).toMatch(/approved or denied/i)

    // Approve it.
    const resolved = await post(handle.port, `/api/approvals/${encodeURIComponent(approval.id)}/resolve`, { decision: 'approved', note: 'ok' })
    expect(resolved.status).toBe(200)
    expect(JSON.parse(resolved.body)).toMatchObject({ status: 'approved', decision_note: 'ok' })
    expect(listRunApprovals('appr-run', 'approved').map(a => a.id)).toContain(approval.id)

    // Once resolved it is no longer pending, so it leaves the web state queue.
    const after = JSON.parse((await get(handle.port, '/api/state')).body)
    expect(after.approvals).toEqual([])
  })
})

describe('doctor', () => {
  it('returns environment health checks', async () => {
    const handle = await start()
    const res = await get(handle.port, '/api/doctor')
    expect(res.status).toBe(200)
    const body = JSON.parse(res.body) as { checks: Array<{ name: string; status: string; detail: string }> }
    expect(Array.isArray(body.checks)).toBe(true)
    expect(body.checks.length).toBeGreaterThan(0)
    const node = body.checks.find(check => check.name === 'node')
    expect(node).toBeDefined()
    expect(['ok', 'warn', 'fail']).toContain(node!.status)
  })
})

describe('about / version', () => {
  it('exposes the package version in /api/state', async () => {
    const handle = await start()
    const state = JSON.parse((await get(handle.port, '/api/state')).body)
    expect(typeof state.version).toBe('string')
    expect(state.version.length).toBeGreaterThan(0)
  })
})

describe('static assets', () => {
  it('serves an allowlisted asset from the web root and 404s a missing one', async () => {
    writeFileSync(join(tmpDir, 'app.js'), '// fixture\n')
    writeFileSync(join(tmpDir, 'brand-duck.json'), '{"ok":true}\n')
    const handle = await start({ webRoot: tmpDir })

    const present = await get(handle.port, '/app.js')
    expect(present.status).toBe(200)
    expect(present.contentType).toContain('text/javascript')

    const brandDuck = await get(handle.port, '/brand-duck.json')
    expect(brandDuck.status).toBe(200)
    expect(brandDuck.contentType).toContain('application/json')
    expect(JSON.parse(brandDuck.body)).toEqual({ ok: true })

    const missing = await get(handle.port, '/xterm.js')
    expect(missing.status).toBe(404)
  })
})

describe('config and presets web actions', () => {
  it('reads and updates global config through HTTP', async () => {
    const handle = await start()

    const read = await get(handle.port, '/api/config')
    expect(read.status).toBe(200)
    const readBody = JSON.parse(read.body) as { config: { max_agents: number }; fields: Array<{ key: string }> }
    expect(readBody.config.max_agents).toBe(100)
    expect(readBody.fields.map(f => f.key)).not.toContain('language')

    const updated = await post(handle.port, '/api/config', { max_agents: 25, default_permissions: 'skip' })
    expect(updated.status).toBe(200)
    expect((JSON.parse(updated.body) as { config: { max_agents: number } }).config.max_agents).toBe(25)
    expect(loadConfig().global.max_agents).toBe(25)

    const bad = await post(handle.port, '/api/config', { max_agents: 0 })
    expect(bad.status).toBe(400)
    expect(JSON.parse(bad.body).error).toMatch(/positive integer/)

    const empty = await post(handle.port, '/api/config', {})
    expect(empty.status).toBe(400)
    expect(JSON.parse(empty.body).error).toMatch(/no config fields/)

    // Language is not settable here (handled by /api/language); it is filtered out,
    // so a language-only patch leaves nothing to set and must not change the config.
    const lang = await post(handle.port, '/api/config', { language: 'fr' })
    expect(lang.status).toBe(400)
    expect(JSON.parse(lang.body).error).toMatch(/no config fields/)
    expect(loadConfig().global.language).not.toBe('fr')
  })

  it('saves a run as a preset, lists, starts, and deletes it through HTTP', async () => {
    installFakeRuntimeBins()
    const handle = await start()

    writeRun(makeRun('pr'))
    writeAgent(makeAgent('pr-root', 'pr', 'cc', 'root'))
    writeAgent(makeAgent('pr-worker', 'pr', 'codex', 'worker'))

    const saved = await post(handle.port, '/api/presets/save', { run_id: 'pr', name: 'web-team' })
    expect(saved.status).toBe(200)
    expect((JSON.parse(saved.body) as { preset: { name: string } }).preset.name).toBe('web-team')

    const listed = await get(handle.port, '/api/presets')
    expect(listed.status).toBe(200)
    expect((JSON.parse(listed.body) as { presets: Array<{ name: string }> }).presets.map(p => p.name)).toContain('web-team')

    const started = await post(handle.port, '/api/presets/web-team/start', {})
    expect(started.status).toBe(200)
    const startedBody = JSON.parse(started.body) as { run: { preset_name: string }; agents: unknown[] }
    expect(startedBody.run.preset_name).toBe('web-team')
    expect(startedBody.agents.length).toBe(2)

    const noConfirm = await post(handle.port, '/api/presets/web-team/delete', {})
    expect(noConfirm.status).toBe(400)
    expect(JSON.parse(noConfirm.body).error).toMatch(/confirmation required/)

    const deleted = await post(handle.port, '/api/presets/web-team/delete', { confirm: true })
    expect(deleted.status).toBe(200)
    expect(JSON.parse(deleted.body)).toEqual({ ok: true })

    const afterDelete = await get(handle.port, '/api/presets')
    expect((JSON.parse(afterDelete.body) as { presets: unknown[] }).presets).toEqual([])
  })

  it('rejects starting an unknown preset', async () => {
    const handle = await start()
    const res = await post(handle.port, '/api/presets/ghost/start', {})
    expect(res.status).toBe(400)
    expect(JSON.parse(res.body).error).toMatch(/preset not found/)
  })

  it('passes auth_mode and effort to create, rejecting invalid values', async () => {
    installFakeRuntimeBins()
    const handle = await start()

    const ok = await post(handle.port, '/api/terminals', { provider: 'claude-code', model: '', auth_mode: 'api-key', effort: 'high' })
    expect(ok.status).toBe(200)

    const badAuth = await post(handle.port, '/api/terminals', { provider: 'claude-code', model: '', auth_mode: 'nope' })
    expect(badAuth.status).toBe(400)
    expect(JSON.parse(badAuth.body).error).toMatch(/unknown auth mode/)

    const badEffort = await post(handle.port, '/api/terminals', { provider: 'claude-code', model: '', effort: 'turbo' })
    expect(badEffort.status).toBe(400)
    expect(JSON.parse(badEffort.body).error).toMatch(/unknown effort/)
  })
})
