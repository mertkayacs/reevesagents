import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Provider } from '../src/core/types.js'
import { PROVIDERS } from '../src/core/providers.js'
import type { RuntimeDriver } from '../src/core/runtime.js'

let tmpDir: string
let savedTmux: string | undefined

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeves-runtime-test-'))
  process.env.REEVES_REGISTRY = tmpDir
  process.env.REEVES_CONFIG = join(tmpDir, 'config.json')
  // Pin the tmux-detection branch off so the anchor always falls back to a fresh
  // 'reeves' session, regardless of whether the test runner is itself inside tmux.
  savedTmux = process.env.TMUX
  delete process.env.TMUX
})

afterEach(() => {
  delete process.env.REEVES_REGISTRY
  delete process.env.REEVES_CONFIG
  if (savedTmux === undefined) delete process.env.TMUX
  else process.env.TMUX = savedTmux
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

describe('agent-run runtime', () => {
  it('parses stable tmux window and pane ids', async () => {
    const { parseTmuxIds } = await import('../src/core/runtime.js')
    expect(parseTmuxIds('@12 %34')).toEqual({ windowId: '@12', paneId: '%34' })
    expect(() => parseTmuxIds('0 1')).toThrow(/Could not parse/)
  })

  it('starts agent runs as independent agents without MCP or Reeves context injection', async () => {
    const driver = new FakeDriver()
    const { startRun } = await import('../src/core/runtime.js')
    const { readRun, listAgents } = await import('../src/core/runs.js')

    const result = startRun({
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

  it('spawns an agent into an existing agent-run session', async () => {
    const driver = new FakeDriver()
    const { startRun, spawnWorker } = await import('../src/core/runtime.js')
    const { listAgents } = await import('../src/core/runs.js')
    const result = startRun({
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

  it('opens, peeks, sends input, interrupts, closes agents, and stops runs by stable ids', async () => {
    const driver = new FakeDriver()
    const {
      listRunHistory,
      readRun,
    } = await import('../src/core/runs.js')

    const {
      startRun,
      openReeves,
      openRunTabs,
      openAgent,
      peekAgent,
      sendText,
      sendKey,
      interrupt,
      killAgent,
      stopRun,
    } = await import('../src/core/runtime.js')

    const result = startRun({
      name: 'control',
      working_dir: '/tmp',
      root: { provider: 'codex', model: '', task: 'lead', nickname: 'first' },
      workers: [{ provider: 'opencode', model: '', task: 'review', nickname: 'reviewer' }],
    }, { driver, available })
    const terminal = result.agents.find(agent => agent.role === 'worker')!

    openReeves(result.run.id, { driver })
    openRunTabs(result.run.id, { driver })
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
    expect(() => readRun(result.run.id)).toThrow(/Run not found/)
    expect(listRunHistory().map(record => record.id)).toContain(result.run.id)

    expect(driver.calls).toEqual(expect.arrayContaining([
      { args: ['select-window', '-t', `${result.run.tmux_session}:reeves`] },
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

  it('ends a run when the last live agent is closed', async () => {
    const driver = new FakeDriver()
    const { startRun, killAgent } = await import('../src/core/runtime.js')
    const { listRunHistory, readRun } = await import('../src/core/runs.js')

    const result = startRun({
      name: 'solo',
      working_dir: '/tmp',
      root: { provider: 'codex', model: '', task: 'lead', nickname: 'first' },
    }, { driver, available })

    killAgent(result.agents[0]!.id, { driver })

    expect(() => readRun(result.run.id)).toThrow(/Run not found/)
    expect(listRunHistory()).toHaveLength(1)
    expect(listRunHistory()[0]).toMatchObject({ id: result.run.id, status: 'ended' })
    expect(driver.calls).toEqual(expect.arrayContaining([
      { args: ['kill-session', '-t', result.run.tmux_session] },
    ]))
  })

  it('creates the reeves anchor window with an append target, not a bare name', async () => {
    // When display-message is unparseable, readDisplayIds returns null and pickReevesAnchor creates
    // the anchor window explicitly. That new-window must append (reeves:), not target a bare "reeves"
    // that would collide with the same-named window and fail "index 1 in use".
    class NoDisplayDriver extends FakeDriver {
      tmux(args: string[], input?: string): string {
        if (args[0] === 'display-message') { this.calls.push({ args }); return '' }
        return super.tmux(args, input)
      }
    }
    const driver = new NoDisplayDriver()
    const { startRun } = await import('../src/core/runtime.js')
    try {
      startRun({
        name: 'anchor',
        working_dir: '/tmp',
        root: { provider: 'codex', model: '', task: '', nickname: 'a' },
      }, { driver, available })
    } catch { /* the anchor new-window is recorded before any later failure */ }
    const anchor = driver.calls.find(call =>
      call.args[0] === 'new-window' && !call.args.includes('-P') &&
      call.args[call.args.indexOf('-n') + 1] === 'reeves')
    expect(anchor, 'anchor new-window call').toBeTruthy()
    const target = anchor!.args[anchor!.args.indexOf('-t') + 1]
    expect(target).toBe('reeves:')
    expect(target).not.toBe('reeves')
  })
})
