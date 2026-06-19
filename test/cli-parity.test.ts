import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { AgentRecord, RunRecord } from '../src/state/types.js'

// CLI feature-parity coverage: every command added for parity with the TUI and
// web UI is driven through the real commander program with a temp registry. The
// tmux side effects are intercepted through a single execFileSync mock, so no
// real tmux session is ever touched.

const execFileSync = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({ execFileSync, spawnSync: vi.fn(() => ({ status: 1, stdout: '' })) }))

let tmpDir: string
let savedTmux: string | undefined

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeves-cli-parity-'))
  process.env.REEVES_REGISTRY = tmpDir
  process.env.REEVES_CONFIG = join(tmpDir, 'config.json')
  savedTmux = process.env.TMUX
  delete process.env.TMUX
  execFileSync.mockReset()
})

afterEach(() => {
  delete process.env.REEVES_REGISTRY
  delete process.env.REEVES_CONFIG
  if (savedTmux === undefined) delete process.env.TMUX
  else process.env.TMUX = savedTmux
  rmSync(tmpDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

// Fresh commander program per call so option state from one command never leaks
// into the next. exitOverride turns commander's own exits into throws; we also
// stub process.exit so action-level error exits surface as throws too.
async function loadCli() {
  vi.resetModules()
  const { program } = await import('../src/cli.js')
  program.exitOverride()
  return program
}

interface RunArgs {
  out: string
  err: string
}

async function runCli(args: string[]): Promise<RunArgs> {
  const program = await loadCli()
  const out: string[] = []
  const err: string[] = []
  const logSpy = vi.spyOn(console, 'log').mockImplementation((...parts) => { out.push(parts.join(' ')) })
  const errSpy = vi.spyOn(console, 'error').mockImplementation((...parts) => { err.push(parts.join(' ')) })
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`process.exit(${code ?? 0})`)
  }) as never)
  try {
    await program.parseAsync(args, { from: 'user' })
    return { out: out.join('\n'), err: err.join('\n') }
  } finally {
    logSpy.mockRestore()
    errSpy.mockRestore()
    exitSpy.mockRestore()
  }
}

function makeRun(id: string, overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id,
    name: `run-${id}`,
    status: 'running',
    tmux_session: `reeves-${id}`,
    reeves_window_id: '@0',
    reeves_pane_id: '%0',
    root_agent_id: `${id}-root`,
    working_dir: '/tmp',
    preset_name: null,
    started_at: '2026-01-01T00:00:00.000Z',
    ended_at: null,
    ...overrides,
  }
}

function makeAgent(id: string, runId: string, overrides: Partial<AgentRecord> = {}): AgentRecord {
  return {
    id,
    run_id: runId,
    nickname: `agent-${id}`,
    provider: 'cc',
    model: '',
    role: 'worker',
    working_dir: '/tmp',
    task: 'do work',
    task_status: 'working',
    task_note: '',
    tmux_session: `reeves-${runId}`,
    tmux_window_id: '@1',
    tmux_pane_id: '%1',
    rc_enabled: false,
    permissions: 'ask',
    inbox: [],
    last_seen: Date.now(),
    started_at: '2026-01-01T00:00:01.000Z',
    ended_at: null,
    ...overrides,
  }
}

// tmux fake for the runtime real driver: every command the runtime issues goes
// through execFileSync('tmux', ...). new-window hands back stable ids; the rest
// returns empty output, which is all the spawn/send/key paths need.
function wireTmux(): void {
  let next = 1
  execFileSync.mockImplementation((file: string, args: string[]) => {
    if (file !== 'tmux') return Buffer.from('')
    if (args[0] === 'display-message') return '@0 %0'
    if (args[0] === 'new-window') {
      const id = next++
      return `@${id} %${id}`
    }
    if (args[0] === 'capture-pane') return 'ready'
    return ''
  })
}

describe('cli parity', () => {
  describe('spawn options', () => {
    it('spawns into an existing run with --run and applies --skip permissions', async () => {
      wireTmux()
      const { writeRun, writeAgent, listAgents } = await import('../src/state/runs.js')
      writeRun(makeRun('rr'))
      writeAgent(makeAgent('rr-root', 'rr', { role: 'root', id: 'rr-root' }))

      const { out } = await runCli(['spawn', 'cc:helper', '--run', 'rr', '--skip', '--prompt', 'hi'])
      expect(out).toMatch(/added 1 agents to/)

      const agents = listAgents('rr')
      const worker = agents.find(agent => agent.role === 'worker')!
      expect(worker.permissions).toBe('skip')
      expect(agents.find(agent => agent.role === 'root')!.id).toBe('rr-root')
    })

    it('starts a new run and sets skip permissions on root and workers with --skip', async () => {
      wireTmux()
      const { listAgents, listRuns } = await import('../src/state/runs.js')

      const { out } = await runCli(['spawn', 'cc:lead', 'codex:worker', '--skip', '--name', 'team'])
      expect(out).toMatch(/started/)

      const run = listRuns()[0]!
      expect(run.name).toBe('team')
      const perms = listAgents(run.id).map(agent => agent.permissions)
      expect(perms).toEqual(['skip', 'skip'])
    })
  })

  describe('remote control', () => {
    it('send pastes text into an agent pane', async () => {
      wireTmux()
      const { writeRun, writeAgent } = await import('../src/state/runs.js')
      writeRun(makeRun('s1'))
      writeAgent(makeAgent('s1-a', 's1'))

      const { out } = await runCli(['send', 's1-a', 'hello', 'world'])
      expect(out).toMatch(/sent to/)
      // The real driver passes the pasted text as the execFileSync `input` option.
      const load = execFileSync.mock.calls.find(c => c[0] === 'tmux' && c[1]?.[0] === 'load-buffer')
      expect((load?.[2] as { input?: string })?.input).toBe('hello world')
    })

    it('key sends a single keypress', async () => {
      wireTmux()
      const { writeRun, writeAgent } = await import('../src/state/runs.js')
      writeRun(makeRun('k1'))
      writeAgent(makeAgent('k1-a', 'k1'))

      const { out } = await runCli(['key', 'k1-a', 'enter'])
      expect(out).toMatch(/sent enter to/)
      const sent = execFileSync.mock.calls.find(c => c[0] === 'tmux' && c[1]?.[0] === 'send-keys')
      expect(sent?.[1]).toEqual(['send-keys', '-t', '%1', 'Enter'])
    })

    it('key rejects an unsupported key', async () => {
      wireTmux()
      const { writeRun, writeAgent } = await import('../src/state/runs.js')
      writeRun(makeRun('k2'))
      writeAgent(makeAgent('k2-a', 'k2'))

      await expect(runCli(['key', 'k2-a', 'f13'])).rejects.toThrow(/process\.exit/)
    })

    it('interrupt sends ctrl-c', async () => {
      wireTmux()
      const { writeRun, writeAgent } = await import('../src/state/runs.js')
      writeRun(makeRun('i1'))
      writeAgent(makeAgent('i1-a', 'i1'))

      const { out } = await runCli(['interrupt', 'i1-a'])
      expect(out).toMatch(/interrupted/)
      const sent = execFileSync.mock.calls.find(c => c[0] === 'tmux' && c[1]?.[0] === 'send-keys')
      expect(sent?.[1]).toEqual(['send-keys', '-t', '%1', 'C-c'])
    })
  })

  describe('delete agent', () => {
    it('deletes an ended agent with --yes', async () => {
      const { writeRun, writeAgent, listAgents } = await import('../src/state/runs.js')
      writeRun(makeRun('d1'))
      writeAgent(makeAgent('d1-a', 'd1', { ended_at: '2026-01-01T01:00:00.000Z', task_status: 'done' }))

      const { out } = await runCli(['delete', 'd1-a', '--yes'])
      expect(out).toMatch(/deleted/)
      expect(listAgents('d1')).toHaveLength(0)
    })

    it('refuses to delete an agent without --yes', async () => {
      const { writeRun, writeAgent, listAgents } = await import('../src/state/runs.js')
      writeRun(makeRun('d2'))
      writeAgent(makeAgent('d2-a', 'd2', { ended_at: '2026-01-01T01:00:00.000Z', task_status: 'done' }))

      await expect(runCli(['delete', 'd2-a'])).rejects.toThrow(/without --yes/)
      expect(listAgents('d2')).toHaveLength(1)
    })
  })

  describe('delete-run', () => {
    it('deletes an ended run with --yes', async () => {
      const { writeRun, listRuns, listRunHistory } = await import('../src/state/runs.js')
      writeRun(makeRun('dr1', { status: 'ended', ended_at: '2026-01-01T01:00:00.000Z' }))

      const { out } = await runCli(['delete-run', 'dr1', '--yes'])
      expect(out).toMatch(/deleted/)
      expect(listRuns()).toHaveLength(0)
      expect(listRunHistory().map(r => r.id)).toContain('dr1')
    })

    it('refuses to delete a run without --yes', async () => {
      const { writeRun } = await import('../src/state/runs.js')
      writeRun(makeRun('dr2', { status: 'ended', ended_at: '2026-01-01T01:00:00.000Z' }))

      await expect(runCli(['delete-run', 'dr2'])).rejects.toThrow(/without --yes/)
    })

    it('refuses to delete a still-running run even with --yes', async () => {
      const { writeRun, listRuns } = await import('../src/state/runs.js')
      writeRun(makeRun('dr3'))

      await expect(runCli(['delete-run', 'dr3', '--yes'])).rejects.toThrow(/Stop run before deleting/)
      expect(listRuns()).toHaveLength(1)
    })
  })

  describe('history', () => {
    it('lists run history as JSON', async () => {
      const { writeRun, archiveAndRemoveRun } = await import('../src/state/runs.js')
      writeRun(makeRun('h1', { status: 'ended', ended_at: '2026-01-01T01:00:00.000Z' }))
      archiveAndRemoveRun('h1', 'ended')

      const { out } = await runCli(['history', '--json'])
      const records = JSON.parse(out) as Array<{ id: string }>
      expect(records.map(r => r.id)).toContain('h1')
    })

    it('deletes a history record with --yes and refuses without it', async () => {
      const { writeRun, archiveAndRemoveRun, listRunHistory } = await import('../src/state/runs.js')
      writeRun(makeRun('h2', { status: 'ended', ended_at: '2026-01-01T01:00:00.000Z' }))
      archiveAndRemoveRun('h2', 'ended')

      await expect(runCli(['delete-history', 'h2'])).rejects.toThrow(/without --yes/)
      expect(listRunHistory().map(r => r.id)).toContain('h2')

      const { out } = await runCli(['delete-history', 'h2', '--yes'])
      expect(out).toMatch(/deleted history/)
      expect(listRunHistory()).toHaveLength(0)
    })
  })

  describe('providers', () => {
    it('lists providers with availability as JSON', async () => {
      execFileSync.mockImplementation(() => { throw new Error('which: not found') })
      const { out } = await runCli(['providers', '--json'])
      const providers = JSON.parse(out) as Array<{ id: string; name: string; available: boolean; color: string }>
      const cc = providers.find(p => p.id === 'cc')!
      expect(cc.name).toBe('Claude Code')
      expect(cc.available).toBe(false)
      expect(cc.color).toMatch(/^#/)
    })
  })

  describe('approvals', () => {
    it('lists pending approvals as JSON', async () => {
      const { writeRun, writeAgent } = await import('../src/state/runs.js')
      const { createRunApproval } = await import('../src/state/approvals.js')
      writeRun(makeRun('ap1'))
      writeAgent(makeAgent('ap1-a', 'ap1'))
      const approval = createRunApproval({ agent_id: 'ap1-a', action: 'deploy', summary: 'ship it', risk: 'high' })

      const { out } = await runCli(['approvals', '--json'])
      const items = JSON.parse(out) as Array<{ id: string; status: string }>
      expect(items.map(i => i.id)).toContain(approval.id)
    })

    it('approve resolves a pending approval', async () => {
      const { writeRun, writeAgent } = await import('../src/state/runs.js')
      const { createRunApproval, readRunApproval } = await import('../src/state/approvals.js')
      writeRun(makeRun('ap2'))
      writeAgent(makeAgent('ap2-a', 'ap2'))
      const approval = createRunApproval({ agent_id: 'ap2-a', action: 'deploy', summary: 'ship it' })

      const { out } = await runCli(['approve', approval.id, 'looks good'])
      expect(out).toMatch(/approved/)
      const reloaded = readRunApproval('ap2', approval.id)
      expect(reloaded.status).toBe('approved')
      expect(reloaded.decision_note).toBe('looks good')
    })

    it('deny resolves a pending approval', async () => {
      const { writeRun, writeAgent } = await import('../src/state/runs.js')
      const { createRunApproval, readRunApproval } = await import('../src/state/approvals.js')
      writeRun(makeRun('ap3'))
      writeAgent(makeAgent('ap3-a', 'ap3'))
      const approval = createRunApproval({ agent_id: 'ap3-a', action: 'deploy', summary: 'ship it' })

      const { out } = await runCli(['deny', approval.id])
      expect(out).toMatch(/denied/)
      expect(readRunApproval('ap3', approval.id).status).toBe('denied')
    })
  })

  describe('mcp hosts', () => {
    it('hosts lists host CLIs with attach state as JSON', async () => {
      execFileSync.mockImplementation((file: string, args: string[]) => {
        if (file === 'which' && args[0] === 'claude') return Buffer.from('/usr/bin/claude\n')
        if (file === 'claude' && args[1] === 'list') return 'reevesagents: reevesagents mcp - connected'
        throw new Error(`absent: ${file}`)
      })

      const { out } = await runCli(['hosts', '--json'])
      const hosts = JSON.parse(out) as Array<{ key: string; installed: boolean; attached: boolean }>
      const cc = hosts.find(h => h.key === 'cc')!
      expect(cc).toMatchObject({ installed: true, attached: true })
    })

    it('attach with a cli attaches one host', async () => {
      execFileSync.mockImplementation((file: string, args: string[]) => {
        if (file === 'which' && args[0] === 'claude') return Buffer.from('/usr/bin/claude\n')
        if (file === 'claude' && args[1] === 'list') return ''
        if (file === 'claude' && args[1] === 'add') return ''
        throw new Error(`absent: ${file}`)
      })

      const { out } = await runCli(['attach', 'cc'])
      expect(out).toMatch(/ok\s+cc\s+attached/)
      const addCall = execFileSync.mock.calls.find(c => c[0] === 'claude' && c[1]?.[1] === 'add')
      expect(addCall?.[1]).toEqual(['mcp', 'add', 'reevesagents', '--', 'reevesagents', 'mcp'])
    })

    it('attach without a cli attaches all installed drivable hosts', async () => {
      execFileSync.mockImplementation((file: string, args: string[]) => {
        if (file === 'which') return args[0] === 'claude' ? Buffer.from('/usr/bin/claude\n') : (() => { throw new Error('absent') })()
        if (file === 'claude' && args[1] === 'list') return ''
        if (file === 'claude' && args[1] === 'add') return ''
        throw new Error(`absent: ${file}`)
      })

      const { out } = await runCli(['attach'])
      expect(out).toMatch(/ok\s+cc/)
    })

    it('detach removes one host', async () => {
      execFileSync.mockImplementation((file: string, args: string[]) => {
        if (file === 'which' && args[0] === 'claude') return Buffer.from('/usr/bin/claude\n')
        if (file === 'claude' && args[1] === 'remove') return ''
        throw new Error(`absent: ${file}`)
      })

      const { out } = await runCli(['detach', 'cc'])
      expect(out).toMatch(/ok\s+cc\s+detached/)
      const removeCall = execFileSync.mock.calls.find(c => c[0] === 'claude' && c[1]?.[1] === 'remove')
      expect(removeCall?.[1]).toEqual(['mcp', 'remove', 'reevesagents'])
    })
  })
})
