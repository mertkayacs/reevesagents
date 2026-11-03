// The dashboard is not a flow driver.
//
// Until block 68 the Web UI kept its own `flow_tick_ms` timer *and* the SSE frame ticked on every pass: a second
// driver that died with the browser tab, raced `reeves-flow-tick.timer` over the same dispatch claim, and left every
// surface describing a setting instead of the driver that was actually running. These tests pin the replacement: an
// open dashboard advances nothing, whatever an old config says, and the frame reports the driver's own receipt.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { request as requestFn } from 'node:http'
import { createFlowState } from '../src/core/flow.js'
import { readFlow, saveFlow } from '../src/core/flow-store.js'
import { attachSpec, createPlan, planPath, savePlan } from '../src/core/plan.js'
import { writeAgent, writeRun } from '../src/core/runs.js'

// The probe for the systemd timer goes through `execFileSync`: answering with nothing keeps every test on this host
// identical to a machine without systemd, which is the case the optional fields exist for.
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
let savedDriver: string | undefined

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

// A frame as `createSseHub` writes it: `data: <json>\n\n`.
function framePayload(frame: string): Record<string, unknown> {
  const line = frame.split('\n').find(entry => entry.startsWith('data: ')) ?? 'data: {}'
  return JSON.parse(line.slice('data: '.length)) as Record<string, unknown>
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'reeves-web-tick-'))
  savedRegistry = process.env.REEVES_REGISTRY
  savedDriver = process.env.REEVES_TICK_DRIVER
  delete process.env.REEVES_TICK_DRIVER
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

  // A flow a tick would advance: it has a plan item with a brief and no claim yet.
  const created = createPlan({ run_id: 'run-1', source_path: 'docs/plan.md', text: '- [ ] **P1.1** — first', now: NOW })
  const plan = attachSpec(created.plan, {
    id: 'P1.1',
    text: JSON.stringify({ id: 'P1.1', title: 'first', goal: 'g', requirements: ['r'], checks: ['c'], report: ['r'] }),
    format: 'json', spec_path: 'docs/briefs/P1.1.json', now: NOW,
  }).plan
  mkdirSync(dirname(planPath('run-1')), { recursive: true })
  savePlan(plan)
  saveFlow(createFlowState({
    run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, head: 'a'.repeat(40),
    max_rounds: 2, max_total_rounds: 5,
  }))
})

afterEach(() => {
  if (savedRegistry === undefined) delete process.env.REEVES_REGISTRY
  else process.env.REEVES_REGISTRY = savedRegistry
  if (savedDriver === undefined) delete process.env.REEVES_TICK_DRIVER
  else process.env.REEVES_TICK_DRIVER = savedDriver
  delete process.env.REEVES_CONFIG
  rmSync(root, { recursive: true, force: true })
})

describe('the dashboard advances nothing', () => {
  it('leaves the flow alone while a client is connected, even with a pre-block-68 config', async () => {
    // `flow_tick_ms` is not a setting any more, but an old config may still carry it — and 40 ms is as aggressive as
    // the removed timer ever got. The dashboard must ignore it: the only driver is the external ticker.
    writeFileSync(join(root, 'config.json'), JSON.stringify({ version: 2, global: { flow_tick_ms: 40 } }), 'utf-8')
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

    vi.resetModules()
    const { startWebServer } = await import('../src/surfaces/webui/server.js')
    const handle = await startWebServer({ port: 0 })
    try {
      const before = readFlow('run-1')
      const stream = openSse(`${handle.url}/api/events`)
      await stream.firstFrame
      // Long enough for at least one screen-poll frame on top of the connect frame.
      await new Promise(resolve => setTimeout(resolve, 1800))
      await httpGet(`${handle.url}/api/state`)
      stream.close()

      // No pass was run, and nothing moved: no review request, no claim, the same `updated_at`.
      expect(calls.count).toBe(0)
      const after = readFlow('run-1')
      expect(after.state).toBe('idle')
      expect(after.claim.head).toBe(before.claim.head)
      expect(after.updated_at).toBe(before.updated_at)
      expect(after.log.length).toBe(before.log.length)
    } finally {
      await handle.close()
      vi.doUnmock('../src/core/flow-ticker.js')
    }
  })

  it('ships the pulse length with the state summary', async () => {
    // The client has no access to the config; a summary without `agent_pulse_ms` made every card compute 0 ms, so the
    // pulse never drew at all.
    await (await import('../src/core/config.js')).setConfigValues({ agent_pulse_ms: 4321 })
    vi.resetModules()
    const { startWebServer } = await import('../src/surfaces/webui/server.js')
    const handle = await startWebServer({ port: 0 })
    try {
      const state = JSON.parse((await httpGet(`${handle.url}/api/state`)).text) as { notifications: { agent_pulse_ms: number } }
      expect(state.notifications.agent_pulse_ms).toBe(4321)
    } finally {
      await handle.close()
    }
  })

  it('ships the same summary in the SSE frame, which is what a live dashboard actually reads', async () => {
    // `/api/state` is the first load; every later update arrives as an SSE frame from `snapshot()`. Both must carry
    // the pulse length and the per-target unread list, or the pulse works once and then stops.
    await (await import('../src/core/config.js')).setConfigValues({ agent_pulse_ms: 4321 })
    const { appendNotification } = await import('../src/core/notifications.js')
    appendNotification({
      kind: 'run.created', title: 'fresh', run_id: 'run-1', run_name: 'run-1', project: 'proj', agent_id: 'dev-1',
    })

    vi.resetModules()
    const { startWebServer } = await import('../src/surfaces/webui/server.js')
    const handle = await startWebServer({ port: 0 })
    const stream = openSse(`${handle.url}/api/events`)
    try {
      const payload = framePayload(await stream.firstFrame) as {
        notifications: { agent_pulse_ms: number, unread_by: { run_id: string, agent_id: string }[] }
      }
      expect(payload.notifications.agent_pulse_ms).toBe(4321)
      expect(payload.notifications.unread_by).toContainEqual(expect.objectContaining({ run_id: 'run-1', agent_id: 'dev-1' }))
    } finally {
      stream.close()
      await handle.close()
    }
  })
})

describe('the panel shows the driver, not a setting', () => {
  it('answers tick: null on a machine that has never recorded a pass', async () => {
    vi.resetModules()
    const { startWebServer } = await import('../src/surfaces/webui/server.js')
    const handle = await startWebServer({ port: 0 })
    const stream = openSse(`${handle.url}/api/events`)
    try {
      expect((JSON.parse((await httpGet(`${handle.url}/api/state`)).text) as { tick: unknown }).tick).toBeNull()
      expect(framePayload(await stream.firstFrame).tick).toBeNull()
    } finally {
      stream.close()
      await handle.close()
    }
  })

  it('fills tick from the receipt a real pass left, and the frame carries the same fields', async () => {
    // The scheduler names itself through the environment; the panel prints what it wrote, not what a config claims.
    process.env.REEVES_TICK_DRIVER = 'systemd:reeves-flow-tick.timer'
    const at = new Date(Date.now() - 5000).toISOString()
    writeFileSync(join(root, 'tick-status.json'), JSON.stringify({
      at, mode: 'all', driver: 'systemd:reeves-flow-tick.timer', pid: 4242, advanced: 1, held: 2, skipped: 3,
    }), 'utf-8')

    vi.resetModules()
    const { startWebServer } = await import('../src/surfaces/webui/server.js')
    const handle = await startWebServer({ port: 0 })
    const stream = openSse(`${handle.url}/api/events`)
    try {
      const state = JSON.parse((await httpGet(`${handle.url}/api/state`)).text) as {
        tick: { driver: string, at: string, age_s: number, advanced: number, held: number, skipped: number }
      }
      expect(state.tick).toMatchObject({
        driver: 'systemd:reeves-flow-tick.timer', at, advanced: 1, held: 2, skipped: 3,
      })
      expect(state.tick.age_s).toBeGreaterThanOrEqual(4)
      // `active`/`next_in_s` are absent here: this host's probe (mocked to answer nothing) has no timer to report, and
      // a machine without systemd must not gain invented fields.
      expect(state.tick).not.toHaveProperty('active')
      expect(state.tick).not.toHaveProperty('next_in_s')

      const frame = framePayload(await stream.firstFrame) as { tick: { driver: string, advanced: number } }
      expect(frame.tick.driver).toBe('systemd:reeves-flow-tick.timer')
      expect(frame.tick.advanced).toBe(1)
    } finally {
      stream.close()
      await handle.close()
    }
  })
})
