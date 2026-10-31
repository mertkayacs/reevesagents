// sendWhenIdle: the only write path an automated caller may use.
//
// Every rule here exists because the alternative is a prompt pasted into a working agent, or a
// queued Enter answering a prompt nobody was ready for. The fake driver makes the pane text
// scriptable, so a whole send — gate, paste, Enter, confirm — runs without tmux.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { AgentRecord, Provider, RunRecord } from '../src/core/types.js'
import type { RuntimeDriver } from '../src/core/runtime.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeves-send-idle-'))
  process.env.REEVES_REGISTRY = tmpDir
  process.env.REEVES_CONFIG = join(tmpDir, 'config.json')
})

afterEach(() => {
  delete process.env.REEVES_REGISTRY
  delete process.env.REEVES_CONFIG
  rmSync(tmpDir, { recursive: true, force: true })
})

class PaneDriver implements RuntimeDriver {
  calls: Array<{ args: string[], input?: string }> = []
  delays: number[] = []
  windows = new Set(['@0', '@1'])
  panes = new Set(['%0', '%1'])
  // Scripted pane text: each capture-pane shifts one value, the last one repeats.
  captures: string[] = ['> idle']

  tmux(args: string[], input?: string): string {
    this.calls.push(input === undefined ? { args } : { args, input })
    if (args[0] === 'list-windows') return [...this.windows].join('\n')
    if (args[0] === 'list-panes') return [...this.panes].join('\n')
    if (args[0] === 'capture-pane') {
      return this.captures.length > 1 ? this.captures.shift()! : (this.captures[0] ?? '')
    }
    return ''
  }

  delay(fn: () => void, ms: number): void {
    this.delays.push(ms)
    fn()
  }

  count(kind: string): number {
    return this.calls.filter(call => call.args[0] === kind).length
  }

  pasted(): string[] {
    return this.calls.filter(call => call.args[0] === 'load-buffer').map(call => call.input ?? '')
  }
}

function makeRun(): RunRecord {
  return {
    id: 'run-1',
    name: 'flow run',
    status: 'running',
    tmux_session: 'reeves_test-11111111',
    reeves_window_id: '@0',
    reeves_pane_id: '%0',
    root_agent_id: 'agent-1',
    working_dir: '/tmp',
    preset_name: null,
    started_at: '2026-01-01T00:00:00.000Z',
    ended_at: null,
  }
}

function makeAgent(overrides: Partial<AgentRecord> = {}): AgentRecord {
  return {
    id: 'agent-1',
    run_id: 'run-1',
    nickname: 'dev',
    provider: 'codex',
    model: '',
    role: 'worker',
    working_dir: '/tmp',
    task: '',
    task_status: 'queued',
    task_note: '',
    tmux_session: 'reeves_test-11111111',
    tmux_window_id: '@1',
    tmux_pane_id: '%1',
    rc_enabled: false,
    permissions: 'skip',
    inbox: [],
    last_seen: 0,
    started_at: '2026-01-01T00:00:01.000Z',
    ended_at: null,
    ...overrides,
  }
}

async function seed(agentOverrides: Partial<AgentRecord> = {}) {
  const { writeRun, writeAgent } = await import('../src/core/runs.js')
  writeRun(makeRun())
  writeAgent(makeAgent(agentOverrides))
  return import('../src/core/runtime.js')
}

const FAST = { timings: { pasteSettleMs: 0, submitWaitMs: 0 } }

// Real pane shapes (see test/activity.test.ts): the gate needs a positive idle signal, and a
// send reads the pane three times — gate, pre-Enter re-check, post-Enter confirm.
const CODEX_IDLE = [
  '› Ask Codex to do anything',
  '',
  '  GPT-6-Luna high · ~/projects/reevesagents-flow',
  '  ← for agents · ? for shortcuts',
].join('\n')

const CODEX_BUSY = [
  '  ◦ Working (3s • esc to interrupt)',
  '',
  '› Ask Codex to do anything',
  '  GPT-6-Luna high · ~/projects/reevesagents-flow',
].join('\n')

const HERMES_IDLE = [
  '❯ fix the failing test',
  '────────────────────────────────────────────',
  ' ☤ deepseek-v4.1-flash · 282K/1M · ✓ 6m · ~/projects/salon-dashboard (main)',
].join('\n')

describe('paneBusy', () => {
  it('reads the pane through the injected driver', async () => {
    const { paneBusy } = await seed()
    const driver = new PaneDriver()
    driver.captures = [CODEX_BUSY]
    expect(paneBusy('agent-1', { driver })).toBe('busy')

    driver.captures = [CODEX_IDLE]
    expect(paneBusy('agent-1', { driver })).toBe('idle')
  })

  it('classifies a hermes pane through the same gate', async () => {
    const { paneBusy } = await seed({ provider: 'hermes' as Provider })
    const driver = new PaneDriver()
    driver.captures = [HERMES_IDLE]
    expect(paneBusy('agent-1', { driver })).toBe('idle')
  })

  it('is unknown for an unverified provider, a headless agent, a stale pane, a missing agent', async () => {
    const { paneBusy } = await seed({ provider: 'cc' as Provider })
    expect(paneBusy('agent-1', { driver: new PaneDriver() })).toBe('unknown')

    const headless = await seed({ headless: true })
    expect(headless.paneBusy('agent-1', { driver: new PaneDriver() })).toBe('unknown')

    const { writeAgent } = await import('../src/core/runs.js')
    writeAgent(makeAgent())
    const driver = new PaneDriver()
    driver.panes.delete('%1')
    expect((await import('../src/core/runtime.js')).paneBusy('agent-1', { driver })).toBe('unknown')
    expect((await import('../src/core/runtime.js')).paneBusy('ghost', { driver })).toBe('unknown')
  })
})

describe('sendWhenIdle', () => {
  it('refuses a busy pane without touching it', async () => {
    const { sendWhenIdle } = await seed()
    const driver = new PaneDriver()
    driver.captures = [CODEX_BUSY]

    expect(sendWhenIdle('agent-1', 'hello', { driver, ...FAST })).toEqual({ sent: false, reason: 'busy' })
    expect(driver.count('load-buffer')).toBe(0)
    expect(driver.count('send-keys')).toBe(0)
  })

  it('refuses an unknown pane instead of guessing it is free', async () => {
    const { sendWhenIdle } = await seed({ provider: 'opencode' as Provider })
    const driver = new PaneDriver()

    expect(sendWhenIdle('agent-1', 'hello', { driver, ...FAST })).toEqual({ sent: false, reason: 'unknown' })
    expect(driver.count('load-buffer')).toBe(0)
  })

  it('pastes once and submits with exactly one Enter when the pane goes busy', async () => {
    const { sendWhenIdle } = await seed()
    const driver = new PaneDriver()
    driver.captures = [CODEX_IDLE, CODEX_IDLE, CODEX_BUSY]

    expect(sendWhenIdle('agent-1', 'block brief', { driver, ...FAST })).toEqual({ sent: true })
    expect(driver.pasted()).toEqual(['block brief'])
    expect(driver.count('send-keys')).toBe(1)
    expect(driver.calls.find(call => call.args[0] === 'send-keys')?.args).toEqual(['send-keys', '-t', '%1', 'Enter'])
  })

  it('reports unconfirmed and never sends a second Enter', async () => {
    const { sendWhenIdle } = await seed()
    const driver = new PaneDriver()
    driver.captures = [CODEX_IDLE, CODEX_IDLE, CODEX_IDLE]

    expect(sendWhenIdle('agent-1', 'hello', { driver, ...FAST })).toEqual({ sent: false, reason: 'unconfirmed' })
    expect(driver.count('send-keys')).toBe(1)
    expect(driver.pasted()).toHaveLength(1)
  })

  it('refuses to submit when the pane stops being idle during the settle window', async () => {
    const { sendWhenIdle } = await seed()
    const driver = new PaneDriver()
    // Gate sees an idle agent; by the time the Enter would go in, a turn has started.
    driver.captures = [CODEX_IDLE, CODEX_BUSY]

    expect(sendWhenIdle('agent-1', 'hello', { driver, ...FAST })).toEqual({ sent: false, reason: 'pane_changed' })
    expect(driver.count('send-keys')).toBe(0)
    expect(driver.pasted()).toEqual(['hello'])
  })

  it('waits the full confirm window by default', async () => {
    const { sendWhenIdle } = await seed()
    const driver = new PaneDriver()
    driver.captures = [CODEX_IDLE, CODEX_IDLE, CODEX_BUSY]

    expect(sendWhenIdle('agent-1', 'hello', { driver })).toEqual({ sent: true })
    // 9 s after the paste, 6 s after the Enter: the timings the design settled on.
    expect(driver.delays).toEqual([9000, 6000])
  })

  it('refuses a stale pane, a headless agent and a missing agent', async () => {
    const { sendWhenIdle } = await import('../src/core/runtime.js')
    const { writeRun, writeAgent } = await import('../src/core/runs.js')
    writeRun(makeRun())
    writeAgent(makeAgent())

    const stale = new PaneDriver()
    stale.panes.delete('%1')
    expect(sendWhenIdle('agent-1', 'text', { driver: stale, ...FAST })).toEqual({ sent: false, reason: 'stale_pane' })
    expect(stale.count('load-buffer')).toBe(0)

    expect(sendWhenIdle('ghost', 'text', { driver: new PaneDriver(), ...FAST })).toEqual({ sent: false, reason: 'stale_pane' })

    writeAgent(makeAgent({ id: 'agent-2', headless: true }))
    expect(sendWhenIdle('agent-2', 'text', { driver: new PaneDriver(), ...FAST })).toEqual({ sent: false, reason: 'headless' })
  })

  it('flips a queued agent to working, like every other send path', async () => {
    const { sendWhenIdle } = await seed()
    const driver = new PaneDriver()
    driver.captures = [CODEX_IDLE, CODEX_IDLE, CODEX_BUSY]

    sendWhenIdle('agent-1', 'hello', { driver, ...FAST })
    const { readAgent } = await import('../src/core/runs.js')
    expect(readAgent('run-1', 'agent-1').task_status).toBe('working')
  })
})
