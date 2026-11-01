// The Web UI's autonomous tick: off means off, and the frame path obeys the same interval as the timer.
//
// The bug this file exists for: `flow_tick_ms = 0` stopped the dedicated timer, but `snapshot()` — the function that
// builds every SSE frame — called `tickAllFlows()` unconditionally, so an open dashboard kept advancing flows after
// the operator had switched the tick off.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { request as requestFn } from 'node:http'
import { createFlowState } from '../src/core/flow.js'
import { readFlow, saveFlow } from '../src/core/flow-store.js'
import { attachSpec, createPlan, planPath, savePlan } from '../src/core/plan.js'
import { writeAgent, writeRun } from '../src/core/runs.js'

const execFileSync = vi.hoisted(() => vi.fn((file: string, args: string[] = []) => {
  if (file === 'git' && args.includes('rev-parse')) return 'aaa111\n'
  if (file === 'git' && args.includes('status')) return ''
  return ''
}))
vi.mock('node:child_process', () => ({ execFileSync, spawnSync: vi.fn(() => ({ status: 1, stdout: '' })) }))

const runtime = vi.hoisted(() => ({
  paneBusy: vi.fn(() => 'idle' as const),
  peekAgentRaw: vi.fn(() => 'VERDICT: ACCEPT'),
  sendWhenIdle: vi.fn((_a: string, _t: string) => ({ sent: true as const })),
}))
vi.mock('../src/core/runtime.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/core/runtime.js')>()),
  ...runtime,
}))

const NOW = Date.parse('2026-11-02T09:00:00.000Z')

let root: string
let savedRegistry: string | undefined

// The SSE frame is where the tick lives (`snapshot()`), and `/api/state` deliberately does not tick — so the
// assertion has to read a real frame, not the JSON route.
function sseFirstFrame(url: string, timeoutMs = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new (globalThis as unknown as {
      URL: new (_input: string) => { hostname: string, port: string, pathname: string, search: string }
    }).URL(url)
    const req = requestFn({
      hostname: parsed.hostname, port: parsed.port, path: parsed.pathname, method: 'GET',
      agent: false, headers: { connection: 'close', accept: 'text/event-stream' },
    }, res => {
      let buffer = ''
      res.setEncoding('utf-8')
      res.on('data', (chunk: string) => {
        buffer += chunk
        if (buffer.includes('\n\n')) {
          req.destroy()
          resolve(buffer)
        }
      })
      res.on('end', () => resolve(buffer))
    })
    req.on('error', (err: Error) => {
      // A destroyed request is how this helper ends after the first frame.
      if ((err as { code?: string }).code === 'ECONNRESET') return
      reject(err)
    })
    const timer = setTimeout(() => { req.destroy(); resolve('') }, timeoutMs)
    req.on('close', () => clearTimeout(timer))
    req.end()
  })
}

// A stream that stays open: the hub stops its timers when the last client disconnects, so a test that closes the
// connection immediately measures nothing.
function openSse(url: string): { firstFrame: Promise<string>, close: () => void } {
  const parsed = new (globalThis as unknown as {
    URL: new (_input: string) => { hostname: string, port: string, pathname: string }
  }).URL(url)
  let resolveFrame: (_value: string) => void = () => {}
  const firstFrame = new Promise<string>(resolve => { resolveFrame = resolve })
  const req = requestFn({
    hostname: parsed.hostname, port: parsed.port, path: parsed.pathname, method: 'GET',
    agent: false, headers: { accept: 'text/event-stream' },
  }, res => {
    let buffer = ''
    res.setEncoding('utf-8')
    res.on('data', (chunk: string) => {
      buffer += chunk
      if (buffer.includes('\n\n')) resolveFrame(buffer)
    })
  })
  req.on('error', () => { /* the close() below is what ends it */ })
  req.end()
  return { firstFrame, close: () => req.destroy() }
}

function httpGet(url: string): Promise<{ status: number, text: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new (globalThis as unknown as {
      URL: new (_input: string) => { hostname: string, port: string, pathname: string, search: string }
    }).URL(url)
    const req = requestFn({
      hostname: parsed.hostname, port: parsed.port, path: `${parsed.pathname}${parsed.search}`,
      method: 'GET', agent: false, headers: { connection: 'close' },
    }, res => {
      let text = ''
      res.setEncoding('utf-8')
      res.on('data', (chunk: string) => { text += chunk })
      res.on('end', () => resolve({ status: res.statusCode ?? 0, text }))
    })
    req.on('error', reject)
    req.end()
  })
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'reeves-web-tick-'))
  savedRegistry = process.env.REEVES_REGISTRY
  process.env.REEVES_REGISTRY = root
  process.env.REEVES_CONFIG = join(root, 'config.json')
  writeRun({
    id: 'run-1', name: 'run-1', status: 'running', tmux_session: 'reeves-run-1', reeves_window_id: '@0',
    reeves_pane_id: '%0', root_agent_id: 'dev-1', working_dir: root, preset_name: null,
    started_at: '2026-11-01T00:00:00.000Z', ended_at: null,
  })
  const agent = (id: string, pane: string) => ({
    id, run_id: 'run-1', nickname: id, provider: 'codex' as const, model: '', role: 'worker' as const,
    working_dir: root, task: 't', task_status: 'working' as const, task_note: '', tmux_session: 'reeves-run-1',
    tmux_window_id: '@1', tmux_pane_id: pane, rc_enabled: false, permissions: 'ask' as const, inbox: [],
    last_seen: 1, started_at: '2026-11-01T00:00:01.000Z', ended_at: null,
  })
  writeAgent(agent('dev-1', '%1'))
  writeAgent(agent('rev-1', '%2'))

  // A flow that a tick would advance: it has a plan item with a brief and no claim yet.
  const created = createPlan({ run_id: 'run-1', source_path: 'docs/plan.md', text: '- [ ] **P1.1** — first', now: NOW })
  const plan = attachSpec(created.plan, {
    id: 'P1.1',
    text: JSON.stringify({ id: 'P1.1', title: 'first', goal: 'g', requirements: ['r'], checks: ['c'], report: ['r'] }),
    format: 'json', spec_path: 'docs/briefs/P1.1.json', now: NOW,
  }).plan
  mkdirSync(dirname(planPath('run-1')), { recursive: true })
  savePlan(plan)
  saveFlow(createFlowState({
    run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 2, max_total_rounds: 5,
  }))
})

afterEach(() => {
  if (savedRegistry === undefined) delete process.env.REEVES_REGISTRY
  else process.env.REEVES_REGISTRY = savedRegistry
  delete process.env.REEVES_CONFIG
  rmSync(root, { recursive: true, force: true })
})

describe('the Web UI does not tick when the tick is off', () => {
  it('leaves the flow alone with flow_tick_ms = 0, even while the dashboard polls', async () => {
    // `0` is the documented off switch; the SSE frame used to ignore it and advance every flow on every frame.
    await (
      await import('../src/core/config.js')
    ).setConfigValues({ flow_tick_ms: 0 })

    vi.resetModules()
    const { startWebServer } = await import('../src/surfaces/webui/server.js')
    const handle = await startWebServer({ port: 0 })
    try {
      const before = readFlow('run-1')
      const frame = await sseFirstFrame(`${handle.url}/api/events`)
      expect(frame).toContain('data:')
      await httpGet(`${handle.url}/api/state`)
      const after = readFlow('run-1')
      // Nothing moved: no review request, no claim, same updated_at.
      expect(after.state).toBe('idle')
      expect(after.claim.head).toBe(before.claim.head)
      expect(after.updated_at).toBe(before.updated_at)
    } finally {
      await handle.close()
    }
  })

  it('still lets a manual tick work when the autonomous one is off', async () => {
    await (
      await import('../src/core/config.js')
    ).setConfigValues({ flow_tick_ms: 0 })
    const { tickAllFlows } = await import('../src/core/flow-ticker.js')
    // The CLI path is not gated by the setting: it *is* the automation.
    const result = tickAllFlows({ now: NOW })
    expect(result.advanced.length + result.held.length).toBe(1)
  })
})

describe('the interval stops when the setting is turned off', () => {
  it('does not tick again after flow_tick_ms becomes 0 while a dashboard is connected', async () => {
    // The interval is created when the first client connects; an off switch that only affects *new* connections
    // would leave the flow moving behind an open dashboard.
    const config = await import('../src/core/config.js')
    config.setConfigValues({ flow_tick_ms: 40 })

    vi.resetModules()
    const calls = { count: 0 }
    vi.doMock('../src/core/flow-ticker.js', async (importOriginal) => {
      const original = await importOriginal<typeof import('../src/core/flow-ticker.js')>()
      return {
        ...original,
        tickAllFlows: (...args: Parameters<typeof original.tickAllFlows>) => {
          calls.count += 1
          return original.tickAllFlows(...args)
        },
      }
    })

    const { startWebServer } = await import('../src/surfaces/webui/server.js')
    const handle = await startWebServer({ port: 0 })
    try {
      // Connect and keep the stream open, so the hub's timers keep running.
      const stream = openSse(`${handle.url}/api/events`)
      await stream.firstFrame
      await new Promise(resolve => setTimeout(resolve, 200))
      const beforeSwitch = calls.count
      expect(beforeSwitch).toBeGreaterThan(0)

      config.setConfigValues({ flow_tick_ms: 0 })
      await new Promise(resolve => setTimeout(resolve, 200))
      // No new passes after the switch: the beat re-reads the setting and returns.
      expect(calls.count).toBe(beforeSwitch)
      stream.close()
    } finally {
      await handle.close()
      vi.doUnmock('../src/core/flow-ticker.js')
    }
  })
})
