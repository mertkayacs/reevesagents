import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { AgentRecord, RunRecord } from '../src/core/types.js'

// Extra coverage for the agent-control MCP that needs no real tmux: the tool
// handler error surfaces, the run/agent listing, the approval lifecycle edge
// cases, and the installer attach/detach/status logic. child_process is mocked
// so spawn's provider PATH check and the installer's `which`/`mcp` calls are
// fully controlled.

// One hoisted fake for the whole file. `which <bin>` and each host's `mcp`
// subcommand route through wireEnv; spawnSync is a benign stub because runs.ts
// uses it only for best-effort tmux probes that are allowed to fail.
const execFileSync = vi.hoisted(() => vi.fn())
const spawnSync = vi.hoisted(() => vi.fn(() => ({ status: 1, stdout: '', stderr: '' })))

vi.mock('node:child_process', () => ({ execFileSync, spawnSync }))

// `installed` is the set of bins `which` finds; `listOutput` maps a host bin to
// its `mcp list` text. Anything else reads as not installed / empty.
interface FakeEnv {
  installed: Set<string>
  listOutput?: Record<string, string>
}

function wireEnv(env: FakeEnv): void {
  const listOutput = env.listOutput ?? {}
  execFileSync.mockImplementation((file: string, args: string[]) => {
    if (file === 'which') {
      const bin = args[0]!
      if (env.installed.has(bin)) return Buffer.from(`/usr/bin/${bin}\n`)
      throw new Error(`which: ${bin} not found`)
    }
    const sub = args[1]
    if (sub === 'list') return listOutput[file] ?? ''
    return ''
  })
}

// Default: every bin is installed, so the spawn path's detectAvailable() reports
// the provider as present and the handler reaches readRun. Individual installer
// tests override this with their own wireEnv call.
beforeEach(() => {
  execFileSync.mockReset()
  spawnSync.mockClear()
  wireEnv({ installed: new Set(['claude', 'codex', 'kimi', 'qwen', 'hermes', 'opencode', 'aider']) })
})

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeves-mcp-extra-'))
  process.env.REEVES_REGISTRY = tmpDir
  process.env.REEVES_CONFIG = join(tmpDir, 'config.json')
})

afterEach(() => {
  delete process.env.REEVES_REGISTRY
  delete process.env.REEVES_CONFIG
  rmSync(tmpDir, { recursive: true, force: true })
})

// The handler returns a union: success has no isError, failure adds isError:true.
type ToolResult = { content: Array<{ text: string }>; isError?: boolean }

function payload(result: ToolResult): any {
  return JSON.parse(result.content[0]!.text)
}

async function call(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const { handleAgentMcpTool } = await import('../src/mcp/server.js')
  return handleAgentMcpTool(name, args) as ToolResult
}

function makeRun(id: string, overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id,
    name: `run-${id}`,
    status: 'running',
    tmux_session: `reeves_${id}`,
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
    task: 'test task',
    task_status: 'queued',
    task_note: '',
    tmux_session: `reeves_${runId}`,
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

describe('handleAgentMcpTool extra surfaces', () => {
  describe('missing-id error surfaces', () => {
    it('reports Run not found when spawn targets a run that does not exist', async () => {
      const result = await call('spawn', { run_id: 'ghost-run', provider: 'cc' })
      expect(result.isError).toBe(true)
      expect(payload(result).error).toContain('Run not found')
    })

    it('reports a missing agent on kill', async () => {
      const result = await call('kill', { agent_id: 'no-such-agent' })
      expect(result.isError).toBe(true)
      expect(payload(result).error).toContain('Agent not found')
    })

    it('reports Run not found on stop with a missing run_id', async () => {
      const result = await call('stop', { run_id: 'no-such-run' })
      expect(result.isError).toBe(true)
      expect(payload(result).error).toContain('Run not found')
    })

    it('reports a missing agent on send_text', async () => {
      const result = await call('send_text', { agent_id: 'no-such-agent', text: 'hello' })
      expect(result.isError).toBe(true)
      expect(payload(result).error).toContain('Agent not found')
    })

    it('reports a missing agent on interrupt', async () => {
      const result = await call('interrupt', { agent_id: 'no-such-agent' })
      expect(result.isError).toBe(true)
      expect(payload(result).error).toContain('Agent not found')
    })
  })

  describe('list', () => {
    it('returns each seeded run with an agents array holding its agents', async () => {
      const { writeRun, writeAgent } = await import('../src/core/runs.js')

      writeRun(makeRun('run-a'))
      writeRun(makeRun('run-b'))
      writeAgent(makeAgent('a-root', 'run-a', { role: 'root' }))
      writeAgent(makeAgent('a-worker', 'run-a'))
      writeAgent(makeAgent('b-root', 'run-b', { role: 'root' }))

      const result = await call('list', {})
      expect(result.isError).toBeUndefined()
      const runs = payload(result) as Array<{ id: string; agents: Array<{ id: string }> }>

      const byId = Object.fromEntries(runs.map(run => [run.id, run]))
      expect(byId['run-a']).toBeDefined()
      expect(byId['run-b']).toBeDefined()

      expect(Array.isArray(byId['run-a'].agents)).toBe(true)
      expect(byId['run-a'].agents.map(agent => agent.id).sort()).toEqual(['a-root', 'a-worker'])

      expect(Array.isArray(byId['run-b'].agents)).toBe(true)
      expect(byId['run-b'].agents.map(agent => agent.id)).toEqual(['b-root'])
    })
  })

  describe('approval edge cases', () => {
    it('errors when resolving or checking an approval id that does not exist', async () => {
      const resolved = await call('resolve_approval', { approval_id: 'nope', decision: 'approved' })
      expect(resolved.isError).toBe(true)
      expect(payload(resolved).error).toContain('Approval not found')

      const checked = await call('check_approval', { approval_id: 'nope' })
      expect(checked.isError).toBe(true)
      expect(payload(checked).error).toContain('Approval not found')
    })

    it('decides once: a second resolve returns the first decision unchanged', async () => {
      const { writeRun, writeAgent } = await import('../src/core/runs.js')
      writeRun(makeRun('twice-run'))
      writeAgent(makeAgent('twice-agent', 'twice-run'))

      const created = await call('request_approval', {
        agent_id: 'twice-agent',
        action: 'deploy',
        summary: 'ship it',
      })
      const approvalId = payload(created).id

      const first = await call('resolve_approval', {
        approval_id: approvalId,
        decision: 'approved',
        note: 'first decision',
      })
      expect(first.isError).toBeUndefined()
      expect(payload(first).status).toBe('approved')
      expect(payload(first).decision_note).toBe('first decision')

      // The second call must return the already-decided record, not flip it.
      const second = await call('resolve_approval', {
        approval_id: approvalId,
        decision: 'denied',
        note: 'second decision',
      })
      expect(second.isError).toBeUndefined()
      expect(payload(second).status).toBe('approved')
      expect(payload(second).decision_note).toBe('first decision')
    })

    it('list_approvals with status pending returns only the pending requests', async () => {
      const { writeRun, writeAgent } = await import('../src/core/runs.js')
      writeRun(makeRun('mix-run'))
      writeAgent(makeAgent('mix-agent', 'mix-run'))

      const stillPending = payload(await call('request_approval', {
        agent_id: 'mix-agent',
        action: 'keep open',
        summary: 'stays pending',
      }))
      const toResolve = payload(await call('request_approval', {
        agent_id: 'mix-agent',
        action: 'close this',
        summary: 'gets approved',
      }))

      await call('resolve_approval', { approval_id: toResolve.id, decision: 'approved' })

      const listed = await call('list_approvals', { status: 'pending' })
      expect(listed.isError).toBeUndefined()
      const pending = payload(listed) as Array<{ id: string; status: string }>

      expect(pending.every(item => item.status === 'pending')).toBe(true)
      expect(pending.map(item => item.id)).toContain(stillPending.id)
      expect(pending.map(item => item.id)).not.toContain(toResolve.id)
    })
  })
})

describe('mcp installer extra', () => {
  async function loadInstaller() {
    return import('../src/mcp/installer.js')
  }

  it('detaches a drivable host: runs mcp remove and returns ok:true', async () => {
    wireEnv({ installed: new Set(['claude']) })
    const { detach } = await loadInstaller()

    const result = detach('cc')
    expect(result).toEqual({ key: 'cc', label: 'Claude Code', ok: true, message: 'detached' })

    const removeCall = execFileSync.mock.calls.find(c => c[0] === 'claude' && c[1]?.[1] === 'remove')!
    expect(removeCall[1]).toEqual(['mcp', 'remove', 'reevesagents'])
  })

  it('attachAll returns results only for installed drivable hosts', async () => {
    // claude + hermes installed and drivable; opencode installed but manual;
    // codex/kimi/qwen not installed.
    wireEnv({ installed: new Set(['claude', 'hermes', 'opencode']) })
    const { attachAll } = await loadInstaller()

    const results = attachAll()
    expect(results.map(r => r.key).sort()).toEqual(['cc', 'hermes'])
    expect(results.every(r => r.ok)).toBe(true)
    // opencode is manual and the rest are uninstalled, so none of them appear.
    expect(results.find(r => r.key === 'opencode')).toBeUndefined()
    expect(results.find(r => r.key === 'codex')).toBeUndefined()
  })

  it('hostStatus marks opencode manual and a which-throwing host not installed', async () => {
    // Only opencode resolves; claude's `which` throws, so it must read as not
    // installed (and therefore not attached).
    wireEnv({
      installed: new Set(['opencode']),
      listOutput: { opencode: 'reevesagents: reevesagents mcp' },
    })
    const { hostStatus } = await loadInstaller()
    const status = hostStatus()

    const opencode = status.find(h => h.key === 'opencode')!
    expect(opencode.manual).toBe(true)
    expect(opencode.installed).toBe(true)

    const cc = status.find(h => h.key === 'cc')!
    expect(cc.installed).toBe(false)
    expect(cc.attached).toBe(false)
    expect(cc.manual).toBe(false)
  })
})
