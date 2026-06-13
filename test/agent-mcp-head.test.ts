import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Provider } from '../src/state/types.js'
import { PROVIDERS } from '../src/launcher/providers.js'
import type { RuntimeDriver } from '../src/launcher/runtime.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeves-runtime-test-'))
  process.env.REEVES_REGISTRY = tmpDir
  process.env.REEVES_CONFIG = join(tmpDir, 'config.json')
})

afterEach(() => {
  delete process.env.REEVES_REGISTRY
  delete process.env.REEVES_CONFIG
  rmSync(tmpDir, { recursive: true, force: true })
})

const available = Object.fromEntries(PROVIDERS.map(provider => [provider, true])) as Record<Provider, boolean>

class FakeDriver implements RuntimeDriver {
  calls: Array<{ args: string[], input?: string }> = []
  delays: number[] = []
  nextWindow = 1
  captureOutput = '\u001b[31mready\u001b[0m sk-ant-api03-abcdefghij1234567890abcdef'

  tmux(args: string[], input?: string): string {
    this.calls.push(input === undefined ? { args } : { args, input })
    if (args[0] === 'display-message') return '@0 %0'
    if (args[0] === 'new-window') {
      const id = this.nextWindow++
      return `@${id} %${id}`
    }
    if (args[0] === 'capture-pane') return this.captureOutput
    return ''
  }

  delay(fn: () => void, ms: number): void {
    this.delays.push(ms)
    fn()
  }
}

describe('startRunWithHead', () => {
  it('returns a run plus a head agent and a first worker', async () => {
    const driver = new FakeDriver()
    const { startRunWithHead } = await import('../src/launcher/runtime.js')

    const result = startRunWithHead('cc', { provider: 'aider', model: '', task: '' }, { driver, available })

    expect(result.run).toBeDefined()
    expect(result.agents).toHaveLength(2)
  })

  it('makes agents[0] the headless head bound to the host provider with no tmux window', async () => {
    const driver = new FakeDriver()
    const { startRunWithHead } = await import('../src/launcher/runtime.js')

    const result = startRunWithHead('cc', { provider: 'aider', model: '', task: '' }, { driver, available })
    const head = result.agents[0]!

    expect(head.role).toBe('root')
    expect(head.headless).toBe(true)
    expect(head.provider).toBe('cc')
    expect(head.tmux_window_id).toBe('')
    expect(head.tmux_pane_id).toBe('')
  })

  it('makes agents[1] the first worker with a real tmux window', async () => {
    const driver = new FakeDriver()
    const { startRunWithHead } = await import('../src/launcher/runtime.js')

    const result = startRunWithHead('cc', { provider: 'aider', model: '', task: '' }, { driver, available })
    const worker = result.agents[1]!

    expect(worker.role).toBe('worker')
    expect(worker.provider).toBe('aider')
    expect(worker.headless).toBeFalsy()
    expect(worker.tmux_window_id).toMatch(/^@\d+$/)
    expect(worker.tmux_pane_id).toMatch(/^%\d+$/)
  })

  it('points the run at the head as root and uses spawner mode', async () => {
    const driver = new FakeDriver()
    const { startRunWithHead } = await import('../src/launcher/runtime.js')

    const result = startRunWithHead('cc', { provider: 'aider', model: '', task: '' }, { driver, available })

    expect(result.run.root_agent_id).toBe(result.agents[0]!.id)
    expect(result.run.mode).toBe('spawner')
  })

  it('persists both agents so the head shows up in list', async () => {
    const driver = new FakeDriver()
    const { startRunWithHead } = await import('../src/launcher/runtime.js')
    const { listAgents } = await import('../src/state/runs.js')

    const result = startRunWithHead('cc', { provider: 'aider', model: '', task: '' }, { driver, available })

    const listed = listAgents(result.run.id)
    expect(listed.map(agent => agent.id).sort()).toEqual(result.agents.map(agent => agent.id).sort())
    const head = listed.find(agent => agent.id === result.agents[0]!.id)
    expect(head?.headless).toBe(true)
    expect(head?.role).toBe('root')
  })

  it('validates the worker provider and throws when it is unavailable', async () => {
    const driver = new FakeDriver()
    const { startRunWithHead } = await import('../src/launcher/runtime.js')
    const unavailable = { ...available, aider: false }

    expect(() => startRunWithHead('cc', { provider: 'aider', model: '', task: '' }, { driver, available: unavailable }))
      .toThrow(/not found on PATH/)
  })

  it('tears the head-run down once its last worker is killed', async () => {
    const driver = new FakeDriver()
    const { startRunWithHead, killAgent } = await import('../src/launcher/runtime.js')
    const { listRuns, listRunHistory } = await import('../src/state/runs.js')

    const result = startRunWithHead('cc', { provider: 'aider', model: '', task: '' }, { driver, available })
    const worker = result.agents[1]!

    killAgent(worker.id, { driver, available })

    // The headless head alone must not keep the run live: killing the worker ends
    // it, kills the tmux session, and archives the record (no leaked session/run).
    expect(listRuns().map(run => run.id)).not.toContain(result.run.id)
    expect(listRunHistory().map(record => record.id)).toContain(result.run.id)
    expect(driver.calls).toEqual(expect.arrayContaining([
      { args: ['kill-session', '-t', result.run.tmux_session] },
    ]))
  })
})
