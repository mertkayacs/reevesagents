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

describe('spawner runtime', () => {
  it('parses stable tmux window and pane ids', async () => {
    const { parseTmuxIds } = await import('../src/launcher/runtime.js')
    expect(parseTmuxIds('@12 %34')).toEqual({ windowId: '@12', paneId: '%34' })
    expect(() => parseTmuxIds('0 1')).toThrow(/Could not parse/)
  })

  it('starts spawner runs as independent terminals without MCP or Reeves context injection', async () => {
    const driver = new FakeDriver()
    const { startRun } = await import('../src/launcher/runtime.js')
    const { readRun, listAgents } = await import('../src/state/runs.js')

    const result = startRun({
      mode: 'spawner',
      name: 'manual team',
      working_dir: '/tmp',
      root: { provider: 'codex', model: '', task: 'build the thing', nickname: 'builder' },
      workers: [
        { provider: 'cc', model: '', task: 'review the thing', nickname: 'reviewer' },
      ],
    }, { driver, available })

    expect(driver.calls[0]?.args).toEqual(['new-session', '-d', '-s', 'reeves', '-n', 'reeves'])
    expect(driver.calls).toEqual(expect.arrayContaining([
      { args: ['new-session', '-d', '-s', result.run.tmux_session, '-n', 'reeves', '-c', '/tmp'] },
      { args: ['link-window', '-k', '-s', '@0', '-t', `${result.run.tmux_session}:0`] },
    ]))
    expect(driver.calls.filter(call => call.args[0] === 'new-window')).toHaveLength(2)
    expect(driver.delays).toEqual([5000, 1000, 5000, 1000])

    const launchCommands = driver.calls
      .filter(call => call.args[0] === 'new-window')
      .map(call => call.args.at(-1) ?? '')
      .join('\n')
    const pasted = driver.calls
      .filter(call => call.args[0] === 'load-buffer')
      .map(call => call.input)

    expect(readRun(result.run.id).mode).toBe('spawner')
    expect(readRun(result.run.id).reeves_session).toBe('reeves')
    expect(readRun(result.run.id).reeves_window_id).toBe('@0')
    expect(readRun(result.run.id).reeves_pane_id).toBe('%0')
    expect(listAgents(result.run.id).map(agent => [agent.role, agent.nickname])).toEqual([
      ['root', 'builder'],
      ['worker', 'reviewer'],
    ])
    expect(listAgents(result.run.id).map(agent => agent.task_status)).toEqual(['working', 'working'])
    expect(launchCommands).not.toContain('REEVES_SESSION_ID')
    expect(launchCommands).not.toContain('REEVES_AGENT_ID')
    expect(launchCommands).not.toContain('REEVES_RUN_ID')
    expect(launchCommands).not.toContain('--mcp-config')
    expect(launchCommands).not.toContain('mcp_servers.reevesagents')
    expect(pasted).toEqual(['build the thing', 'review the thing'])
    expect(pasted.join('\n')).not.toContain('ReevesAgents context')
    expect(pasted.join('\n')).not.toContain('You are the root agent')
    expect(pasted.join('\n')).not.toContain('You are a worker agent')
  })

  it('rejects orchestrator starts in the root package', async () => {
    const driver = new FakeDriver()
    const { startRun } = await import('../src/launcher/runtime.js')

    expect(() => startRun({
      mode: 'orchestrator',
      name: 'beta',
      working_dir: '/tmp',
      root: { provider: 'codex', model: '', task: 'lead' },
    } as never, { driver, available })).toThrow(/spawner package/)
  })

  it('spawns a terminal into an existing spawner run session', async () => {
    const driver = new FakeDriver()
    const { startRun, spawnWorker } = await import('../src/launcher/runtime.js')
    const { listAgents } = await import('../src/state/runs.js')
    const result = startRun({
      mode: 'spawner',
      name: 'terminals',
      working_dir: '/tmp',
      root: { provider: 'cc', model: '', task: 'lead', nickname: 'first' },
    }, { driver, available })

    const terminal = spawnWorker({
      run_id: result.run.id,
      provider: 'hermes',
      model: 'haiku',
      task: 'test',
      nickname: 'tester',
    }, { driver, available })

    expect(terminal.run_id).toBe(result.run.id)
    expect(terminal.role).toBe('worker')
    expect(listAgents(result.run.id).map(agent => agent.id)).toContain(terminal.id)
    expect(listAgents(result.run.id).map(agent => agent.task_status)).toEqual(['working', 'working'])
    expect(driver.calls.filter(call => call.args[0] === 'new-window')).toHaveLength(2)
  })

  it('opens, peeks, sends input, interrupts, closes terminals, and stops runs by stable ids', async () => {
    const driver = new FakeDriver()
    const {
      startRun,
      openReeves,
      openAgent,
      peekAgent,
      sendText,
      sendKey,
      interrupt,
      killAgent,
      stopRun,
    } = await import('../src/launcher/runtime.js')

    const result = startRun({
      mode: 'spawner',
      name: 'control',
      working_dir: '/tmp',
      root: { provider: 'codex', model: '', task: 'lead', nickname: 'first' },
      workers: [{ provider: 'opencode', model: '', task: 'review', nickname: 'reviewer' }],
    }, { driver, available })
    const terminal = result.agents.find(agent => agent.role === 'worker')!

    openReeves(result.run.id, { driver })
    openAgent(terminal.id, { driver })
    expect(peekAgent(terminal.id, 5, { driver })).toBe('ready [REDACTED]')
    sendText(terminal.id, 'hello', { driver })
    const helloLoad = driver.calls.find(call => call.args[0] === 'load-buffer' && call.input === 'hello')
    expect(helloLoad?.args).toEqual(['load-buffer', '-b', expect.stringMatching(/^reeves_[a-f0-9]{8}$/), '-'])
    const helloBuffer = helloLoad!.args[2]!
    sendKey(terminal.id, 'enter', { driver })
    interrupt(terminal.id, { driver })
    expect(killAgent(terminal.id, { driver }).ended_at).not.toBeNull()
    expect(stopRun(result.run.id, { driver }).status).toBe('ended')

    expect(driver.calls).toEqual(expect.arrayContaining([
      { args: ['select-window', '-t', `${terminal.tmux_session}:${terminal.tmux_window_id}`] },
      { args: ['capture-pane', '-p', '-e', '-S', '-5', '-t', terminal.tmux_pane_id] },
      { args: ['paste-buffer', '-b', helloBuffer, '-t', terminal.tmux_pane_id] },
      { args: ['delete-buffer', '-b', helloBuffer] },
      { args: ['send-keys', '-t', terminal.tmux_pane_id, 'Enter'] },
      { args: ['send-keys', '-t', terminal.tmux_pane_id, 'C-c'] },
      { args: ['kill-window', '-t', terminal.tmux_window_id] },
      { args: ['kill-session', '-t', result.run.tmux_session] },
    ]))
  })
})
