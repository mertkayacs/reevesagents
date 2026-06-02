import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { request } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { startWebServer, type WebServerHandle } from '../../src/web/server.js'

let tmpDir: string
let handles: WebServerHandle[]

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeves-web-server-'))
  process.env.REEVES_REGISTRY = tmpDir
  handles = []
})

afterEach(async () => {
  for (const handle of handles) await handle.close()
  delete process.env.REEVES_REGISTRY
  rmSync(tmpDir, { recursive: true, force: true })
})

async function start(port?: number): Promise<WebServerHandle> {
  const handle = await startWebServer({ port, open: false })
  handles.push(handle)
  return handle
}

interface RawResponse { status: number | undefined; body: string }

function raw(port: number, opts: { path?: string; method?: string; headers?: Record<string, string> } = {}): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: '127.0.0.1', port, path: opts.path ?? '/', method: opts.method ?? 'GET', headers: opts.headers, agent: false },
      res => {
        let body = ''
        res.on('data', chunk => { body += chunk })
        res.on('end', () => resolve({ status: res.statusCode, body }))
      },
    )
    req.on('error', reject)
    req.end()
  })
}

describe('startWebServer', () => {
  it('binds loopback and serves the page, state, and health', async () => {
    const handle = await start()
    expect(handle.url).toBe(`http://127.0.0.1:${handle.port}`)

    const page = await raw(handle.port)
    expect(page.status).toBe(200)
    expect(page.body).toContain('ReevesAgents')

    const state = await raw(handle.port, { path: '/api/state' })
    expect(state.status).toBe(200)
    const parsed = JSON.parse(state.body)
    expect(parsed.runs).toEqual([])
    expect(parsed.history).toEqual([])
    expect(Array.isArray(parsed.providers)).toBe(true)
    expect(parsed.providers).toHaveLength(9)
    expect(parsed.providers[0]).toHaveProperty('available')
    expect(parsed.providers[0]).toHaveProperty('name')

    const health = await raw(handle.port, { path: '/healthz' })
    expect(health.status).toBe(200)
    expect(health.body).toBe('ok')
  })

  it('returns 404 for unknown paths', async () => {
    const handle = await start()
    const res = await raw(handle.port, { path: '/nope' })
    expect(res.status).toBe(404)
  })

  it('rejects a foreign Host header', async () => {
    const handle = await start()
    const res = await raw(handle.port, { headers: { host: 'evil.com' } })
    expect(res.status).toBe(403)
  })

  it('rejects a state-changing request with a foreign or missing Origin', async () => {
    const handle = await start()
    const foreign = await raw(handle.port, { method: 'POST', path: '/api/state', headers: { origin: 'http://evil.com' } })
    expect(foreign.status).toBe(403)
    const missing = await raw(handle.port, { method: 'POST', path: '/api/state' })
    expect(missing.status).toBe(403)
  })

  it('allows a state-changing request from our own origin (no route yet -> 404)', async () => {
    const handle = await start()
    const res = await raw(handle.port, {
      method: 'POST',
      path: '/api/state',
      headers: { origin: `http://127.0.0.1:${handle.port}` },
    })
    expect(res.status).toBe(404)
  })

  it('falls back to the next free port when the preferred one is taken', async () => {
    const first = await start()
    const second = await start(first.port)
    expect(second.port).toBe(first.port + 1)
  })

  it('requires the separate orchestrator package for pre-beta orchestrator mode', async () => {
    await expect(startWebServer({
      open: false,
      port: 19085,
      prebetaOrchestrator: true,
    })).rejects.toThrow(/requires the separate orchestrator package/i)
  })
})
