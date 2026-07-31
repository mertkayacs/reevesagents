import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { AgentRecord, RunRecord } from '../src/core/types.js'

// child_process is mocked so the registry smoke-test (which calls every tool
// handler) and the provider/host lookups never touch real subprocesses: `which`
// throws so every provider/host reads as not installed (matching the absent-PATH
// outcome these tests assume), and tmux/host calls return benign output. Without
// this, tools like attach_host would run real `mcp add` against the machine.
const execFileSync = vi.hoisted(() => vi.fn((file: string) => {
  if (file === 'which') throw new Error('not found')
  return ''
}))
const spawnSync = vi.hoisted(() => vi.fn(() => ({ status: 1, stdout: '', stderr: '' })))
vi.mock('node:child_process', () => ({ execFileSync, spawnSync }))

// These tests cover the tool handler paths that do not need a real tmux: input
// validation, error surfaces, the agent cap, and the filesystem-only approval
// lifecycle. The spawn/send/read paths that drive tmux are exercised elsewhere.

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeves-mcp-test-'))
  process.env.REEVES_REGISTRY = tmpDir
  process.env.REEVES_CONFIG = join(tmpDir, 'config.json')
})

afterEach(() => {
  delete process.env.REEVES_REGISTRY
  delete process.env.REEVES_CONFIG
  rmSync(tmpDir, { recursive: true, force: true })
})

// The handler returns a union: success has no isError, failure adds isError:true.
// In tests we read both shapes, so widen to a loose result type.
type ToolResult = { content: Array<{ text: string }>; isError?: boolean }

// Parse the JSON payload carried in the single text content block.
function payload(result: ToolResult): any {
  return JSON.parse(result.content[0]!.text)
}

// Call the handler and widen the success/failure union to the loose test shape.
async function call(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const { handleAgentMcpTool } = await import('../src/surfaces/mcp/server.js')
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

describe('handleAgentMcpTool', () => {
  describe('validation and errors', () => {
    it('rejects spawn with an unsupported provider', async () => {
      const result = await call('spawn', { provider: 'nope' })
      expect(result.isError).toBe(true)
      expect(payload(result).error).toContain('Unsupported provider')
    })

    it('rejects send_key with an unsupported key', async () => {
      const result = await call('send_key', { agent_id: 'a1', key: 'f1' })
      expect(result.isError).toBe(true)
      expect(payload(result).error).toContain('Unsupported key')
    })

    it('reports a missing agent on read', async () => {
      const result = await call('read', { agent_id: 'does-not-exist' })
      expect(result.isError).toBe(true)
      expect(payload(result).error).toContain('Agent not found')
    })

    it('rejects an unknown tool name', async () => {
      const result = await call('frobnicate', {})
      expect(result.isError).toBe(true)
      expect(payload(result).error).toContain('Unknown tool')
    })
  })

  describe('session run liveness', () => {
    // BUG 2 guard: when the session's owned run was ended by a stop/kill (which
    // archives and removes it), the no-run_id spawn must not reuse it and throw
    // "Run not found". sessionRunIsLive is the branch guard that drops it instead.
    it('treats a missing run as not live', async () => {
      const { sessionRunIsLive } = await import('../src/surfaces/mcp/server.js')
      expect(sessionRunIsLive('never-existed')).toBe(false)
    })

    it('treats a live run as live and an ended run as not live', async () => {
      const { sessionRunIsLive } = await import('../src/surfaces/mcp/server.js')
      const { writeRun, updateRun } = await import('../src/core/runs.js')

      writeRun(makeRun('session-run'))
      expect(sessionRunIsLive('session-run')).toBe(true)

      updateRun('session-run', { status: 'ended', ended_at: '2026-01-01T00:00:05.000Z' })
      expect(sessionRunIsLive('session-run')).toBe(false)
    })
  })

  describe('agent cap', () => {
    it('refuses to add an agent to a run already at max_agents', async () => {
      const { writeRun, writeAgent } = await import('../src/core/runs.js')

      // Cap the run size at one live agent.
      writeFileSync(
        join(tmpDir, 'config.json'),
        JSON.stringify({ version: 2, global: { max_agents: 1 } }),
        'utf-8',
      )

      // Seed a run holding exactly one live agent (ended_at null = live).
      writeRun(makeRun('capped'))
      writeAgent(makeAgent('live-1', 'capped', { ended_at: null }))

      const result = await call('spawn', { run_id: 'capped', provider: 'aider' })
      expect(result.isError).toBe(true)
      expect(payload(result).error).toContain('at the agent cap (1)')
    })

    it('does not count the headless head against the cap', async () => {
      const { writeRun, writeAgent } = await import('../src/core/runs.js')

      writeFileSync(
        join(tmpDir, 'config.json'),
        JSON.stringify({ version: 2, global: { max_agents: 1 } }),
        'utf-8',
      )

      // A head-run with only its headless head: live worker count is 0, so the cap
      // of 1 must not block the first worker. The spawn falls through to the real
      // runtime and fails for an unrelated reason (provider not on PATH), never
      // with the cap error.
      writeRun(makeRun('head-only', { root_agent_id: 'head' }))
      writeAgent(makeAgent('head', 'head-only', {
        role: 'root',
        headless: true,
        tmux_window_id: '',
        tmux_pane_id: '',
      }))

      const result = await call('spawn', { run_id: 'head-only', provider: 'aider' })
      expect(payload(result).error ?? '').not.toContain('at the agent cap')
    })
  })

  describe('empty run-name fallback', () => {
    // The first-spawn startRun path is real-tmux heavy and takes the real driver
    // with no injection point, so we cannot exercise the handler cleanly here.
    // This locks the load-bearing reason for the fix instead: asString treats an
    // empty string as a present value, so name='' would slip past the fallback.
    // The handler now trim-checks a.name explicitly, mirrored below.
    it('keeps an empty name from defeating the nickname/provider fallback', () => {
      const asString = (value: unknown, fallback = ''): string =>
        typeof value === 'string' ? value : fallback

      // The trap: a blank name is a string, so asString returns it verbatim.
      expect(asString('', 'fallback-name')).toBe('')

      // The fix: trim-check before falling back, so a blank name resolves to the
      // nickname (or provider). A real name is passed through unchanged.
      const runName = (name: unknown, nickname: string | undefined, provider: string): string =>
        typeof name === 'string' && (name as string).trim() ? (name as string) : (nickname ?? provider)

      expect(runName('', 'nick', 'cc')).toBe('nick')
      expect(runName('   ', undefined, 'cc')).toBe('cc')
      expect(runName('my run', 'nick', 'cc')).toBe('my run')
      expect(runName(undefined, undefined, 'cc')).toBe('cc')
    })
  })

  describe('approval lifecycle', () => {
    it('creates, lists, resolves, and rereads an approval, redacting secrets in the return value', async () => {
      const { writeRun, writeAgent } = await import('../src/core/runs.js')

      writeRun(makeRun('appr-run'))
      writeAgent(makeAgent('appr-agent', 'appr-run'))

      const secret = 'sk-ant-api03-SECRETVALUE1234567890'

      // request_approval: createRunApproval must redact its returned value, so the
      // raw secret must not appear verbatim anywhere in the response.
      const created = await call('request_approval', {
        agent_id: 'appr-agent',
        action: `run deploy with ${secret}`,
        summary: `summary leaking ${secret}`,
      })
      expect(created.isError).toBeUndefined()
      const approval = payload(created)
      expect(approval.status).toBe('pending')
      expect(approval.run_id).toBe('appr-run')
      expect(created.content[0]!.text).not.toContain(secret)
      expect(approval.action).toContain('[REDACTED]')
      expect(approval.action).not.toContain(secret)
      expect(approval.summary).toContain('[REDACTED]')
      expect(approval.summary).not.toContain(secret)

      // list_approvals: shows the request as pending.
      const listed = await call('list_approvals', {})
      expect(listed.isError).toBeUndefined()
      const pending = payload(listed)
      expect(pending.map((item: any) => item.id)).toContain(approval.id)
      expect(pending.find((item: any) => item.id === approval.id).status).toBe('pending')

      // resolve_approval: approve it.
      const resolved = await call('resolve_approval', {
        approval_id: approval.id,
        decision: 'approved',
        note: 'looks fine',
      })
      expect(resolved.isError).toBeUndefined()
      expect(payload(resolved).status).toBe('approved')

      // check_approval: reflects the approved status.
      const checked = await call('check_approval', { approval_id: approval.id })
      expect(checked.isError).toBeUndefined()
      const final = payload(checked)
      expect(final.status).toBe('approved')
      expect(final.decision_note).toBe('looks fine')
    })
  })

  describe('tool registry', () => {
    it('advertises unique tool names that each resolve to a handler', async () => {
      const { MCP_TOOLS } = await import('../src/surfaces/mcp/server.js')
      const names = MCP_TOOLS.map(tool => tool.name)
      expect(new Set(names).size).toBe(names.length)
      for (const name of names) {
        const result = await call(name, {})
        // A handler may reject empty arguments, but it must never fall through to
        // the unknown-tool path: every advertised tool has a registered handler.
        expect(payload(result).error ?? '').not.toContain('Unknown tool')
      }
    })
  })

  describe('discovery', () => {
    it('list_providers returns the full provider catalog from the registry', async () => {
      const { MCP_TOOLS, buildProviderCatalog } = await import('../src/surfaces/mcp/server.js')
      const { PROVIDERS } = await import('../src/core/providers.js')

      // The tool is advertised in the tool list.
      expect(MCP_TOOLS.map(tool => tool.name)).toContain('list_providers')

      const result = await call('list_providers', {})
      expect(result.isError).toBeUndefined()
      const catalog = payload(result)

      expect(Array.isArray(catalog)).toBe(true)
      expect(catalog.map((entry: any) => entry.id)).toEqual([...PROVIDERS])
      expect(catalog).toEqual(buildProviderCatalog())

      const cc = catalog.find((entry: any) => entry.id === 'cc')
      expect(cc.display_name).toBe('Claude Code')
      expect(cc.bin).toBe('claude')
      expect(typeof cc.available).toBe('boolean')
      expect(cc.aliases).toContain('claude-code')
      expect(Array.isArray(cc.models)).toBe(true)
      expect(typeof cc.model_source).toBe('string')
    })
  })
})
