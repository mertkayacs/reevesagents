import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Provider } from '../../../src/state/types.js'
import { PROVIDERS } from '../../../src/launcher/providers.js'
import type { RuntimeDriver } from '../src/runtime.js'

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
    if (args[0] === 'new-session' && args.includes('-P')) {
      const id = this.nextWindow++
      return `@${id} %${id}`
    }
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

describe('v1 runtime', () => {
  it('builds startup context for root and worker roles', async () => {
    const { startupTask } = await import('../src/runtime.js')
    expect(startupTask('root', 'fix tests')).toContain('You are the root agent')
    expect(startupTask('root', 'fix tests')).toContain('Root-scoped MCP tools default to your current run')
    expect(startupTask('root', 'fix tests')).toContain('context() returns your identity')
    expect(startupTask('root', 'fix tests')).toContain('Call check_messages() at the start of every prompt cycle')
    expect(startupTask('root', 'fix tests')).toContain('wait briefly, then use tree/list_agents/peek')
    expect(startupTask('worker', 'review')).toContain('You are a worker agent')
    expect(startupTask('worker', 'review')).toContain('context() tells you who you are')
    expect(startupTask('worker', 'review')).toContain('Your first MCP calls before starting the User task should be context() then check_messages()')
    expect(startupTask('worker', 'review')).toContain('check again after each major step')
    expect(startupTask('worker', 'review')).toContain('User task:\nreview')
  })

  it('parses stable tmux window and pane ids', async () => {
    const { parseTmuxIds } = await import('../src/runtime.js')
    expect(parseTmuxIds('@12 %34')).toEqual({ windowId: '@12', paneId: '%34' })
    expect(() => parseTmuxIds('0 1')).toThrow(/Could not parse/)
  })

  it('starts one run with one tmux window per agent', async () => {
    const driver = new FakeDriver()
    const { startRun } = await import('../src/runtime.js')
    const { readRun, listAgents } = await import('../../../src/state/runs.js')

    const result = startRun({
      mode: 'orchestrator',
      name: 'project api',
      working_dir: '/tmp',
      root: { provider: 'codex', model: 'gpt-5', task: 'plan work', nickname: 'lead' },
      workers: [
        { provider: 'opencode', model: 'anthropic/claude-sonnet-4-5', task: 'review work', nickname: 'reviewer' },
      ],
    }, { driver, available })

    // Tests run outside tmux, so pickReevesAnchor creates a fallback "reeves"
    // TUI session. The run itself owns a separate tmux session with Reeves linked at tab 0.
    expect(driver.calls[0]?.args).toEqual(['new-session', '-d', '-s', 'reeves', '-n', 'reeves'])
    expect(driver.calls).toEqual(expect.arrayContaining([
      { args: ['new-session', '-d', '-s', result.run.tmux_session, '-n', 'reeves', '-c', '/tmp'] },
      { args: ['link-window', '-k', '-s', '@0', '-t', `${result.run.tmux_session}:0`] },
    ]))
    expect(driver.calls.filter(call => call.args[0] === 'new-session' && call.args.includes('-P'))).toHaveLength(0)
    expect(driver.calls.filter(call => call.args[0] === 'new-window')).toHaveLength(2)
    expect(driver.delays).toEqual([5000, 1000, 5000, 1000])
    expect(driver.calls.filter(call => call.args[0] === 'load-buffer').map(call => call.input)).toEqual([
      expect.stringContaining('User task:\nplan work'),
      expect.stringContaining('User task:\nreview work'),
    ])
    const launchCommands = driver.calls
      .filter(call => call.args[0] === 'new-window')
      .map(call => call.args.at(-1) ?? '')
    expect(launchCommands.join('\n')).not.toContain('plan work')
    expect(launchCommands.join('\n')).not.toContain('review work')
    expect(readRun(result.run.id).tmux_session).toMatch(/^reeves-project-api-/)
    expect(readRun(result.run.id).reeves_session).toBe('reeves')
    expect(readRun(result.run.id).reeves_window_id).toBe('@0')
    expect(readRun(result.run.id).reeves_pane_id).toBe('%0')
    expect(listAgents(result.run.id).map(agent => [agent.role, agent.tmux_window_id, agent.tmux_pane_id])).toEqual([
      ['root', '@1', '%1'],
      ['worker', '@2', '%2'],
    ])
    expect(listAgents(result.run.id).map(agent => agent.task_status)).toEqual(['working', 'working'])
    expect(listAgents(result.run.id).map(agent => agent.task)).toEqual(['plan work', 'review work'])
  })

  it('injects v1 agent environment variables into launch commands', async () => {
    const driver = new FakeDriver()
    const { startRun } = await import('../src/runtime.js')
    const result = startRun({
      mode: 'orchestrator',
      name: 'env',
      working_dir: '/tmp',
      root: { provider: 'opencode', model: 'model', task: 'hello', nickname: 'root' },
    }, { driver, available })

    const agent = result.agents[0]!
    const launch = driver.calls.find(call => call.args[0] === 'new-window')?.args.at(-1) ?? ''
    expect(launch).toContain(`REEVES_SESSION_ID='${agent.id}'`)
    expect(launch).toContain(`REEVES_AGENT_ID='${agent.id}'`)
    expect(launch).toContain(`REEVES_RUN_ID='${result.run.id}'`)
    expect(launch).toContain("REEVES_ROLE='root'")
    expect(launch).toContain(`REEVES_REGISTRY='${tmpDir}'`)
  })

  it('starts spawner runs as independent terminals without MCP or Reeves context injection', async () => {
    const driver = new FakeDriver()
    const { startRun } = await import('../src/runtime.js')
    const { readRun, listAgents } = await import('../../../src/state/runs.js')

    const result = startRun({
      mode: 'spawner',
      name: 'manual team',
      working_dir: '/tmp',
      root: { provider: 'codex', model: '', task: 'build the thing', nickname: 'builder' },
      workers: [
        { provider: 'cc', model: '', task: 'review the thing', nickname: 'reviewer' },
      ],
    }, { driver, available })

    const launchCommands = driver.calls
      .filter(call => call.args[0] === 'new-window')
      .map(call => call.args.at(-1) ?? '')
      .join('\n')
    const pasted = driver.calls
      .filter(call => call.args[0] === 'load-buffer')
      .map(call => call.input)

    expect(readRun(result.run.id).mode).toBe('spawner')
    expect(listAgents(result.run.id).map(agent => agent.nickname)).toEqual(['builder', 'reviewer'])
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

  it('spawns a worker into an existing run session', async () => {
    const driver = new FakeDriver()
    const { startRun, spawnWorker } = await import('../src/runtime.js')
    const { listAgents } = await import('../../../src/state/runs.js')
    const result = startRun({
      mode: 'orchestrator',
      name: 'workers',
      working_dir: '/tmp',
      root: { provider: 'cc', model: '', task: 'lead', nickname: 'root' },
    }, { driver, available })

    const worker = spawnWorker({
      run_id: result.run.id,
      provider: 'hermes',
      model: 'haiku',
      task: 'test',
      nickname: 'tester',
    }, { driver, available })

    expect(worker.run_id).toBe(result.run.id)
    expect(worker.role).toBe('worker')
    expect(listAgents(result.run.id).map(agent => agent.id)).toContain(worker.id)
    expect(listAgents(result.run.id).map(agent => agent.task_status)).toEqual(['working', 'working'])
    expect(driver.calls.filter(call => call.args[0] === 'new-session' && call.args.includes('-P'))).toHaveLength(0)
    expect(driver.calls.filter(call => call.args[0] === 'new-window')).toHaveLength(2)
  })

  it('waits for startup output to settle before pasting the initial task', async () => {
    const driver = new FakeDriver()
    driver.captureOutput = 'starting provider'
    const { startRun } = await import('../src/runtime.js')
    startRun({
      mode: 'orchestrator',
      name: 'startup-wait',
      working_dir: '/tmp',
      root: { provider: 'codex', model: '', task: 'lead', nickname: 'root' },
    }, { driver, available })

    const captureIndexes = driver.calls
      .map((call, idx) => ({ call, idx }))
      .filter(item => item.call.args[0] === 'capture-pane')
      .map(item => item.idx)
    const pasteIndex = driver.calls.findIndex(call => call.args[0] === 'load-buffer')

    expect(driver.delays).toEqual([5000, 1000, 1000])
    expect(captureIndexes).toHaveLength(2)
    expect(captureIndexes.every(idx => idx < pasteIndex)).toBe(true)
  })

  it('waits for Claude Code readiness before sending remote control and task input', async () => {
    const driver = new FakeDriver()
    const { startRun } = await import('../src/runtime.js')
    const result = startRun({
      mode: 'orchestrator',
      name: 'cc-remote-control',
      working_dir: '/tmp',
      root: { provider: 'cc', model: '', task: 'lead', nickname: 'root', rc_enabled: true },
    }, { driver, available })

    const root = result.agents[0]!
    const remoteControlIndex = driver.calls.findIndex(call =>
      call.args[0] === 'send-keys' && call.args.includes('/remote-control'))
    const pasteIndex = driver.calls.findIndex(call => call.args[0] === 'load-buffer')
    const enterIndex = driver.calls.findIndex((call, idx) =>
      idx > pasteIndex && call.args[0] === 'send-keys' && call.args.includes('Enter'))

    expect(root.rc_enabled).toBe(true)
    expect(driver.delays).toEqual([5000, 1500, 1000])
    expect(remoteControlIndex).toBeGreaterThan(-1)
    expect(pasteIndex).toBeGreaterThan(remoteControlIndex)
    expect(enterIndex).toBeGreaterThan(pasteIndex)
  })

  it('does not persist remote control as enabled for Codex agent launches', async () => {
    const driver = new FakeDriver()
    const { startRun } = await import('../src/runtime.js')
    const result = startRun({
      mode: 'orchestrator',
      name: 'codex-remote-control',
      working_dir: '/tmp',
      root: { provider: 'codex', model: '', task: 'lead', nickname: 'root', rc_enabled: true },
    }, { driver, available })

    const root = result.agents[0]!
    const launch = driver.calls.find(call => call.args[0] === 'new-window')?.args.at(-1) ?? ''

    expect(root.rc_enabled).toBe(false)
    expect(launch).not.toContain('remote_control')
  })

  it('opens, peeks, sends input, interrupts, kills workers, and stops runs by stable ids', async () => {
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
    } = await import('../src/runtime.js')

    const result = startRun({
      mode: 'orchestrator',
      name: 'control',
      working_dir: '/tmp',
      root: { provider: 'codex', model: '', task: 'lead', nickname: 'root' },
      workers: [{ provider: 'opencode', model: '', task: 'review', nickname: 'reviewer' }],
    }, { driver, available })
    const root = result.agents.find(agent => agent.role === 'root')!
    const worker = result.agents.find(agent => agent.role === 'worker')!

    openReeves(result.run.id, { driver })
    openAgent(worker.id, { driver })
    expect(peekAgent(worker.id, 5, { driver })).toBe('ready [REDACTED]')
    sendText(worker.id, 'hello', { driver })
    const helloLoad = driver.calls.find(call => call.args[0] === 'load-buffer' && call.input === 'hello')
    expect(helloLoad?.args).toEqual(['load-buffer', '-b', expect.stringMatching(/^reeves_[a-f0-9]{8}$/), '-'])
    const helloBuffer = helloLoad!.args[2]!
    sendKey(worker.id, 'enter', { driver })
    interrupt(worker.id, { driver })
    expect(() => killAgent(root.id, { driver })).toThrow(/Root agent/)
    expect(killAgent(worker.id, { driver }).ended_at).not.toBeNull()
    expect(stopRun(result.run.id, { driver }).status).toBe('ended')

    expect(driver.calls).toEqual(expect.arrayContaining([
      { args: ['select-window', '-t', `${worker.tmux_session}:${worker.tmux_window_id}`] },
      { args: ['capture-pane', '-p', '-e', '-S', '-5', '-t', worker.tmux_pane_id] },
      { args: ['paste-buffer', '-b', helloBuffer, '-t', worker.tmux_pane_id] },
      { args: ['delete-buffer', '-b', helloBuffer] },
      { args: ['send-keys', '-t', worker.tmux_pane_id, 'Enter'] },
      { args: ['send-keys', '-t', worker.tmux_pane_id, 'C-c'] },
      { args: ['kill-window', '-t', worker.tmux_window_id] },
      { args: ['kill-session', '-t', result.run.tmux_session] },
    ]))
  })

  it('keeps headless roots out of pane/window controls', async () => {
    const driver = new FakeDriver()
    const {
      startRun,
      openAgent,
      peekAgent,
      sendText,
      sendKey,
    } = await import('../src/runtime.js')
    const { readAgent } = await import('../../../src/state/runs.js')

    const result = startRun({
      mode: 'orchestrator',
      name: 'headless-root',
      working_dir: '/tmp',
      root: { provider: 'codex', model: '', task: 'coordinate', nickname: 'root' },
      root_is_caller: true,
    }, { driver, available })
    const root = result.agents[0]!

    expect(readAgent(result.run.id, root.id).headless).toBe(true)
    expect(readAgent(result.run.id, root.id).provider).toBe('codex')
    expect(driver.calls.filter(call => call.args[0] === 'new-window')).toHaveLength(0)
    expect(peekAgent(root.id, 5, { driver })).toContain('headless root')
    expect(() => openAgent(root.id, { driver })).toThrow(/headless/)
    expect(() => sendText(root.id, 'hello', { driver })).toThrow(/headless/)
    expect(() => sendKey(root.id, 'enter', { driver })).toThrow(/headless/)
  })
})
