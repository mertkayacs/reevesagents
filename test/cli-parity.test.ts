import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { AgentRecord, RunRecord } from '../src/core/types.js'

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

// Same as wireTmux, but makes `which <bin>` throw for the listed binaries so the
// spawn preflight sees them as not installed.
function wireTmuxWithMissing(missingBins: string[]): void {
  let next = 1
  execFileSync.mockImplementation((file: string, args: string[]) => {
    if (file === 'which') {
      if (missingBins.includes(args[0] as string)) throw new Error(`which: no ${args[0]}`)
      return Buffer.from('')
    }
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
      const { writeRun, writeAgent, listAgents } = await import('../src/core/runs.js')
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
      const { listAgents, listRuns } = await import('../src/core/runs.js')

      const { out } = await runCli(['spawn', 'cc:lead', 'codex:worker', '--skip', '--name', 'team'])
      expect(out).toMatch(/started/)
      // watch/steer hints are always shown; the permission-prompt hint is suppressed when skipping.
      expect(out).toContain('watch & steer')
      expect(out).not.toContain('re-run with --skip')

      const run = listRuns()[0]!
      expect(run.name).toBe('team')
      const perms = listAgents(run.id).map(agent => agent.permissions)
      expect(perms).toEqual(['skip', 'skip'])
    })

    it('shows the permission-prompt hint when --skip is not set', async () => {
      wireTmux()
      const { out } = await runCli(['spawn', 'cc:lead', '--name', 'team'])
      expect(out).toContain('re-run with --skip')
      expect(out).toContain('watch & steer')
    })

    it('prints JSON with the run id and agent ids under --json', async () => {
      wireTmux()
      const { out } = await runCli(['spawn', 'cc:lead', 'codex:worker', '--json', '--name', 'team'])
      const parsed = JSON.parse(out)
      expect(parsed.run.id).toBeTruthy()
      expect(parsed.agents).toHaveLength(2)
      expect(parsed.agents[0].role).toBe('root')
      expect(parsed.agents.every((agent: { id: string }) => typeof agent.id === 'string' && agent.id.length > 0)).toBe(true)
    })

    it('refuses to spawn and does not start a run when a provider CLI is missing', async () => {
      wireTmuxWithMissing(['deepseek'])
      const { listRuns } = await import('../src/core/runs.js')
      await expect(runCli(['spawn', 'cc:lead', 'deepseek:x'])).rejects.toThrow()
      expect(listRuns()).toHaveLength(0)
    })
  })

  describe('add command', () => {
    it('adds an agent to the most recent active run without a run id', async () => {
      wireTmux()
      const { writeRun, writeAgent, listAgents } = await import('../src/core/runs.js')
      writeRun(makeRun('old', { started_at: '2026-01-01T00:00:00.000Z' }))
      writeAgent(makeAgent('old-root', 'old', { role: 'root', id: 'old-root' }))
      writeRun(makeRun('new', { started_at: '2026-02-01T00:00:00.000Z' }))
      writeAgent(makeAgent('new-root', 'new', { role: 'root', id: 'new-root' }))

      const { out } = await runCli(['add', 'codex:helper'])
      expect(out).toMatch(/added 1 agents to/)
      // it joined the newer run, not the older one
      expect(listAgents('new').some(agent => agent.nickname === 'helper')).toBe(true)
      expect(listAgents('old').some(agent => agent.nickname === 'helper')).toBe(false)
    })

    it('targets a specific run with --run', async () => {
      wireTmux()
      const { writeRun, writeAgent, listAgents } = await import('../src/core/runs.js')
      writeRun(makeRun('old', { started_at: '2026-01-01T00:00:00.000Z' }))
      writeAgent(makeAgent('old-root', 'old', { role: 'root', id: 'old-root' }))
      writeRun(makeRun('new', { started_at: '2026-02-01T00:00:00.000Z' }))
      writeAgent(makeAgent('new-root', 'new', { role: 'root', id: 'new-root' }))

      await runCli(['add', 'codex:helper', '--run', 'old'])
      expect(listAgents('old').some(agent => agent.nickname === 'helper')).toBe(true)
      expect(listAgents('new').some(agent => agent.nickname === 'helper')).toBe(false)
    })

    it('errors when there is no active workspace', async () => {
      wireTmux()
      await expect(runCli(['add', 'codex'])).rejects.toThrow()
    })

    it('errors when no agent spec is given', async () => {
      wireTmux()
      const { writeRun, writeAgent } = await import('../src/core/runs.js')
      writeRun(makeRun('rr'))
      writeAgent(makeAgent('rr-root', 'rr', { role: 'root', id: 'rr-root' }))
      await expect(runCli(['add'])).rejects.toThrow()
    })
  })

  describe('remote control', () => {
    it('send pastes text into an agent pane', async () => {
      wireTmux()
      const { writeRun, writeAgent } = await import('../src/core/runs.js')
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
      const { writeRun, writeAgent } = await import('../src/core/runs.js')
      writeRun(makeRun('k1'))
      writeAgent(makeAgent('k1-a', 'k1'))

      const { out } = await runCli(['key', 'k1-a', 'enter'])
      expect(out).toMatch(/sent enter to/)
      const sent = execFileSync.mock.calls.find(c => c[0] === 'tmux' && c[1]?.[0] === 'send-keys')
      expect(sent?.[1]).toEqual(['send-keys', '-t', '%1', 'Enter'])
    })

    it('key rejects an unsupported key', async () => {
      wireTmux()
      const { writeRun, writeAgent } = await import('../src/core/runs.js')
      writeRun(makeRun('k2'))
      writeAgent(makeAgent('k2-a', 'k2'))

      await expect(runCli(['key', 'k2-a', 'f13'])).rejects.toThrow(/process\.exit/)
    })

    it('interrupt sends ctrl-c', async () => {
      wireTmux()
      const { writeRun, writeAgent } = await import('../src/core/runs.js')
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
      const { writeRun, writeAgent, listAgents } = await import('../src/core/runs.js')
      writeRun(makeRun('d1'))
      writeAgent(makeAgent('d1-a', 'd1', { ended_at: '2026-01-01T01:00:00.000Z', task_status: 'done' }))

      const { out } = await runCli(['delete', 'd1-a', '--yes'])
      expect(out).toMatch(/deleted/)
      expect(listAgents('d1')).toHaveLength(0)
    })

    it('refuses to delete an agent without --yes', async () => {
      const { writeRun, writeAgent, listAgents } = await import('../src/core/runs.js')
      writeRun(makeRun('d2'))
      writeAgent(makeAgent('d2-a', 'd2', { ended_at: '2026-01-01T01:00:00.000Z', task_status: 'done' }))

      await expect(runCli(['delete', 'd2-a'])).rejects.toThrow(/without --yes/)
      expect(listAgents('d2')).toHaveLength(1)
    })
  })

  describe('delete-run', () => {
    it('deletes an ended run with --yes', async () => {
      const { writeRun, listRuns, listRunHistory } = await import('../src/core/runs.js')
      writeRun(makeRun('dr1', { status: 'ended', ended_at: '2026-01-01T01:00:00.000Z' }))

      const { out } = await runCli(['delete-run', 'dr1', '--yes'])
      expect(out).toMatch(/deleted/)
      expect(listRuns()).toHaveLength(0)
      expect(listRunHistory().map(r => r.id)).toContain('dr1')
    })

    it('refuses to delete a run without --yes', async () => {
      const { writeRun } = await import('../src/core/runs.js')
      writeRun(makeRun('dr2', { status: 'ended', ended_at: '2026-01-01T01:00:00.000Z' }))

      await expect(runCli(['delete-run', 'dr2'])).rejects.toThrow(/without --yes/)
    })

    it('refuses to delete a still-running run even with --yes', async () => {
      const { writeRun, listRuns } = await import('../src/core/runs.js')
      writeRun(makeRun('dr3'))

      await expect(runCli(['delete-run', 'dr3', '--yes'])).rejects.toThrow(/Stop run before deleting/)
      expect(listRuns()).toHaveLength(1)
    })
  })

  describe('history', () => {
    it('lists run history as JSON', async () => {
      const { writeRun, archiveAndRemoveRun } = await import('../src/core/runs.js')
      writeRun(makeRun('h1', { status: 'ended', ended_at: '2026-01-01T01:00:00.000Z' }))
      archiveAndRemoveRun('h1', 'ended')

      const { out } = await runCli(['history', '--json'])
      const records = JSON.parse(out) as Array<{ id: string }>
      expect(records.map(r => r.id)).toContain('h1')
    })

    it('deletes a history record with --yes and refuses without it', async () => {
      const { writeRun, archiveAndRemoveRun, listRunHistory } = await import('../src/core/runs.js')
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
      const { writeRun, writeAgent } = await import('../src/core/runs.js')
      const { createRunApproval } = await import('../src/core/approvals.js')
      writeRun(makeRun('ap1'))
      writeAgent(makeAgent('ap1-a', 'ap1'))
      const approval = createRunApproval({ agent_id: 'ap1-a', action: 'deploy', summary: 'ship it', risk: 'high' })

      const { out } = await runCli(['approvals', '--json'])
      const items = JSON.parse(out) as Array<{ id: string; status: string }>
      expect(items.map(i => i.id)).toContain(approval.id)
    })

    it('approve resolves a pending approval', async () => {
      const { writeRun, writeAgent } = await import('../src/core/runs.js')
      const { createRunApproval, readRunApproval } = await import('../src/core/approvals.js')
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
      const { writeRun, writeAgent } = await import('../src/core/runs.js')
      const { createRunApproval, readRunApproval } = await import('../src/core/approvals.js')
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

  describe('spawn launch knobs', () => {
    it('passes --auth-mode and --effort to the launch command', async () => {
      wireTmux()
      const { out } = await runCli(['spawn', 'cc', '--auth-mode', 'api-key', '--effort', 'high'])
      expect(out).toMatch(/started/)
      const newWindow = execFileSync.mock.calls.find(c => c[0] === 'tmux' && c[1]?.[0] === 'new-window')!
      const shellCommand = String(newWindow[1]![newWindow[1]!.length - 1])
      expect(shellCommand).toContain('--effort')
      expect(shellCommand).toContain('high')
      expect(shellCommand).toContain('--bare')
    })

    it('rejects an invalid --auth-mode or --effort', async () => {
      wireTmux()
      await expect(runCli(['spawn', 'cc', '--auth-mode', 'bogus'])).rejects.toThrow(/process\.exit/)
      await expect(runCli(['spawn', 'cc', '--effort', 'turbo'])).rejects.toThrow(/process\.exit/)
    })
  })

  describe('agents listing', () => {
    it('lists agents as JSON and filtered by run', async () => {
      const { writeRun, writeAgent } = await import('../src/core/runs.js')
      writeRun(makeRun('ag'))
      writeAgent(makeAgent('ag-root', 'ag', { role: 'root', nickname: 'lead' }))
      writeAgent(makeAgent('ag-w', 'ag', { role: 'worker', nickname: 'hand' }))

      const { out } = await runCli(['agents', '--json'])
      const ids = (JSON.parse(out) as Array<{ id: string }>).map(a => a.id)
      expect(ids).toEqual(expect.arrayContaining(['ag-root', 'ag-w']))

      const { out: text } = await runCli(['agents', 'ag'])
      expect(text).toMatch(/lead/)
      expect(text).toMatch(/hand/)
    })
  })

  describe('providers models', () => {
    it('includes models in JSON and prints them with --models', async () => {
      execFileSync.mockImplementation(() => { throw new Error('which: not found') })
      const { out } = await runCli(['providers', '--json'])
      const cc = (JSON.parse(out) as Array<{ id: string; models: string[] }>).find(p => p.id === 'cc')!
      expect(Array.isArray(cc.models)).toBe(true)
      expect(cc.models.length).toBeGreaterThan(0)

      const { out: text } = await runCli(['providers', '--models'])
      expect(text.split('\n').some(line => line.startsWith('      '))).toBe(true)
    })
  })

  describe('config', () => {
    it('shows, gets, and sets a config value', async () => {
      const { out: shown } = await runCli(['config'])
      expect(shown).toMatch(/max_agents\s+10/)

      const { out: set } = await runCli(['config', 'max_agents', '25'])
      expect(set).toMatch(/max_agents = 25/)

      const { out: got } = await runCli(['config', 'max_agents'])
      expect(got.trim()).toBe('25')
    })

    it('sets language and rejects invalid input', async () => {
      const { out } = await runCli(['config', 'language', 'tr'])
      expect(out).toMatch(/language = tr/)
      await expect(runCli(['config', 'max_agents', '0'])).rejects.toThrow(/process\.exit/)
      await expect(runCli(['config', 'bogus', '1'])).rejects.toThrow(/process\.exit/)
    })
  })

  describe('presets', () => {
    it('saves a run as a preset, lists, starts, and deletes it', async () => {
      wireTmux()
      const { writeRun, writeAgent } = await import('../src/core/runs.js')
      writeRun(makeRun('pr'))
      writeAgent(makeAgent('pr-root', 'pr', { role: 'root', nickname: 'lead', provider: 'cc', task: '' }))
      writeAgent(makeAgent('pr-w', 'pr', { role: 'worker', nickname: 'hand', provider: 'codex', task: '' }))

      const { out: saved } = await runCli(['save-preset', 'pr', 'my-team'])
      expect(saved).toMatch(/saved preset my-team\s+2 agents/)

      const { out: listed } = await runCli(['presets', '--json'])
      expect((JSON.parse(listed) as Array<{ name: string }>).map(p => p.name)).toContain('my-team')

      const { out: started } = await runCli(['start-preset', 'my-team', '--cwd', '/tmp'])
      expect(started).toMatch(/started/)

      await expect(runCli(['delete-preset', 'my-team'])).rejects.toThrow(/without --yes/)
      const { out: deleted } = await runCli(['delete-preset', 'my-team', '--yes'])
      expect(deleted).toMatch(/deleted preset my-team/)
      const { out: empty } = await runCli(['presets'])
      expect(empty).toMatch(/no presets/)
    })

    it('rejects starting or deleting an unknown preset', async () => {
      await expect(runCli(['start-preset', 'ghost'])).rejects.toThrow(/process\.exit/)
      await expect(runCli(['delete-preset', 'ghost', '--yes'])).rejects.toThrow(/preset not found/)
    })
  })
})
