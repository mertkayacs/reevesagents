import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { AgentRecord, RunRecord } from '../src/state/types.js'

// Parity coverage for the MCP control surface: the spawn launch knobs
// (permissions / auth_mode / effort) reaching the runtime, the three delete
// tools and their ended-state guards, the run-history listing, and that the new
// tools are advertised in the tool list. child_process is mocked so the real
// tmux driver inside spawnWorker is fully controlled and never touches tmux.

// Each `new-window` returns a fresh @<id> %<id> pair so parseTmuxIds succeeds;
// everything else returns a benign value. spawnSync stays a no-op stub: runs.ts
// uses it only for best-effort tmux probes that are allowed to fail.
const execFileSync = vi.hoisted(() => vi.fn())
const spawnSync = vi.hoisted(() => vi.fn(() => ({ status: 1, stdout: '', stderr: '' })))

vi.mock('node:child_process', () => ({ execFileSync, spawnSync }))

let windowSeq = 0

beforeEach(() => {
  windowSeq = 0
  spawnSync.mockClear()
  execFileSync.mockReset()
  // The real tmux driver does execFileSync(...).trim(), so every return is a
  // string. `which` output is unused (the call only needs to not throw).
  execFileSync.mockImplementation((file: string, args: string[]) => {
    if (file === 'which') return `/usr/bin/${args[0]}\n`
    if (file !== 'tmux') return ''
    if (args[0] === 'new-window') {
      windowSeq += 1
      return `@${windowSeq} %${windowSeq}\n`
    }
    if (args[0] === 'display-message') return '@0 %0\n'
    if (args[0] === 'capture-pane') return 'ready\n'
    return ''
  })
})

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeves-agent-mcp-parity-'))
  process.env.REEVES_REGISTRY = tmpDir
  process.env.REEVES_CONFIG = join(tmpDir, 'config.json')
})

afterEach(() => {
  delete process.env.REEVES_REGISTRY
  delete process.env.REEVES_CONFIG
  rmSync(tmpDir, { recursive: true, force: true })
})

type ToolResult = { content: Array<{ text: string }>; isError?: boolean }

function payload(result: ToolResult): any {
  return JSON.parse(result.content[0]!.text)
}

async function call(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const { handleAgentMcpTool } = await import('../src/agent-mcp/server.js')
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

describe('agent-mcp parity tools', () => {
  describe('spawn launch knobs', () => {
    it('honors permissions:skip on the spawned worker', async () => {
      const { writeRun } = await import('../src/state/runs.js')
      writeRun(makeRun('skip-run'))

      const result = await call('spawn', { run_id: 'skip-run', provider: 'cc', permissions: 'skip' })
      expect(result.isError).toBeUndefined()
      const agent = payload(result)
      expect(agent.permissions).toBe('skip')

      // The persisted record carries the same mode, so a later reader sees it too.
      const { readAgent } = await import('../src/state/runs.js')
      expect(readAgent('skip-run', agent.id).permissions).toBe('skip')
    })

    it('falls back to the global default for an unknown permissions value', async () => {
      const { writeRun } = await import('../src/state/runs.js')
      writeRun(makeRun('bad-perm-run'))

      // The global default is 'ask'; an unknown value must normalize away, not pass through.
      const result = await call('spawn', { run_id: 'bad-perm-run', provider: 'cc', permissions: 'nonsense' })
      expect(result.isError).toBeUndefined()
      expect(payload(result).permissions).toBe('ask')
    })

    it('passes auth_mode and effort through to the launched command', async () => {
      const { writeRun } = await import('../src/state/runs.js')
      writeRun(makeRun('knobs-run'))

      // cc renders both knobs as launch flags (--bare for api-key, --effort high),
      // so its shell command is where the pass-through is observable.
      const result = await call('spawn', {
        run_id: 'knobs-run',
        provider: 'cc',
        auth_mode: 'api-key',
        effort: 'high',
      })
      expect(result.isError).toBeUndefined()

      // The runtime builds the CLI command from these knobs and shells it via the
      // tmux new-window call, so the rendered shell command must carry both flags.
      const newWindow = execFileSync.mock.calls.find(c => c[0] === 'tmux' && c[1]?.[0] === 'new-window')!
      const shellCommand = String(newWindow[1]![newWindow[1]!.length - 1])
      expect(shellCommand).toContain('--effort')
      expect(shellCommand).toContain('high')
      expect(shellCommand).toContain('--bare')
    })
  })

  describe('delete', () => {
    it('deletes an ended agent and refuses a live one', async () => {
      const { writeRun, writeAgent, listAgents } = await import('../src/state/runs.js')
      writeRun(makeRun('del-run'))
      writeAgent(makeAgent('live-agent', 'del-run', { ended_at: null }))
      writeAgent(makeAgent('ended-agent', 'del-run', { ended_at: '2026-01-01T00:02:00.000Z' }))

      const live = await call('delete', { agent_id: 'live-agent' })
      expect(live.isError).toBe(true)
      expect(payload(live).error).toMatch(/stop agent before deleting/i)

      const ended = await call('delete', { agent_id: 'ended-agent' })
      expect(ended.isError).toBeUndefined()
      expect(payload(ended).id).toBe('ended-agent')

      expect(listAgents('del-run').map(a => a.id)).toEqual(['live-agent'])
    })

    it('reports a missing agent on delete', async () => {
      const result = await call('delete', { agent_id: 'ghost' })
      expect(result.isError).toBe(true)
      expect(payload(result).error).toContain('Agent not found')
    })
  })

  describe('delete_run', () => {
    it('deletes an ended run, archiving it to history', async () => {
      const { writeRun, listRuns, listRunHistory } = await import('../src/state/runs.js')
      writeRun(makeRun('ended-run', { status: 'ended', ended_at: '2026-01-01T00:03:00.000Z' }))

      const result = await call('delete_run', { run_id: 'ended-run' })
      expect(result.isError).toBeUndefined()
      expect(payload(result).id).toBe('ended-run')

      expect(listRuns().map(r => r.id)).not.toContain('ended-run')
      expect(listRunHistory().map(r => r.id)).toContain('ended-run')
    })

    it('refuses to delete a still-running run', async () => {
      const { writeRun } = await import('../src/state/runs.js')
      writeRun(makeRun('running-run'))

      const result = await call('delete_run', { run_id: 'running-run' })
      expect(result.isError).toBe(true)
      expect(payload(result).error).toMatch(/stop run before deleting/i)
    })

    it('reports a missing run on delete_run', async () => {
      const result = await call('delete_run', { run_id: 'no-such-run' })
      expect(result.isError).toBe(true)
      expect(payload(result).error).toContain('Run not found')
    })
  })

  describe('delete_history and list_history', () => {
    it('lists then deletes an existing history record', async () => {
      const { writeRun, archiveAndRemoveRun } = await import('../src/state/runs.js')
      // Seed a real history record by archiving an ended run.
      writeRun(makeRun('hist-run', { status: 'ended', ended_at: '2026-01-01T00:04:00.000Z' }))
      archiveAndRemoveRun('hist-run', 'ended')

      const listed = await call('list_history', {})
      expect(listed.isError).toBeUndefined()
      expect(payload(listed).map((r: any) => r.id)).toContain('hist-run')

      const deleted = await call('delete_history', { id: 'hist-run' })
      expect(deleted.isError).toBeUndefined()
      expect(payload(deleted)).toEqual({ deleted: true, id: 'hist-run' })

      const after = await call('list_history', {})
      expect(payload(after).map((r: any) => r.id)).not.toContain('hist-run')
    })

    it('refuses to delete a history record that does not exist', async () => {
      const result = await call('delete_history', { id: 'ghost-history' })
      expect(result.isError).toBe(true)
      expect(payload(result).error).toContain('history record not found')
    })
  })

  describe('open', () => {
    it('switches the tmux client to a run reeves tab', async () => {
      const { writeRun } = await import('../src/state/runs.js')
      writeRun(makeRun('open-run'))

      const result = await call('open', { id: 'open-run' })
      expect(result.isError).toBeUndefined()
      expect(payload(result)).toEqual({ session: 'reeves_open-run', window: 'reeves', label: 'run-open-run' })

      const switched = execFileSync.mock.calls.find(c => c[0] === 'tmux' && c[1]?.[0] === 'switch-client')!
      expect(switched[1]).toEqual(['switch-client', '-t', 'reeves_open-run:reeves'])
    })

    it('opens a specific agent window when given an agent id', async () => {
      const { writeRun, writeAgent } = await import('../src/state/runs.js')
      writeRun(makeRun('open-run2'))
      writeAgent(makeAgent('open-agent', 'open-run2', { tmux_window_id: '@7' }))

      const result = await call('open', { id: 'open-agent' })
      expect(result.isError).toBeUndefined()
      expect(payload(result)).toEqual({ session: 'reeves_open-run2', window: '@7', label: 'agent-open-agent' })
    })

    it('reports when no run or agent matches the id', async () => {
      const result = await call('open', { id: 'nothing' })
      expect(result.isError).toBe(true)
      expect(payload(result).error).toContain('no run or agent found')
    })
  })

  describe('tool registry', () => {
    it('advertises the new parity tools in tools/list', async () => {
      const { MCP_TOOLS } = await import('../src/agent-mcp/server.js')
      const names = MCP_TOOLS.map(tool => tool.name)
      for (const name of ['delete', 'delete_run', 'delete_history', 'list_history', 'open']) {
        expect(names).toContain(name)
      }
    })

    it('advertises the spawn launch knobs in the spawn input schema', async () => {
      const { MCP_TOOLS } = await import('../src/agent-mcp/server.js')
      const spawn = MCP_TOOLS.find(tool => tool.name === 'spawn')!
      const props = spawn.inputSchema.properties as Record<string, any>
      expect(props.permissions.enum).toEqual(['ask', 'skip'])
      expect(props.auth_mode.enum).toEqual(['default', 'api-key'])
      expect(props.effort.enum).toContain('high')
    })
  })
})
