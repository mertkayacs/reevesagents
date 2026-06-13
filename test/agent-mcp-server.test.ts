import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { AgentRecord, RunRecord } from '../src/state/types.js'

// These tests cover the tool handler paths that do not need a real tmux: input
// validation, error surfaces, the agent cap, and the filesystem-only approval
// lifecycle. The spawn/send/read paths that drive tmux are exercised elsewhere.

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeves-agent-mcp-test-'))
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
  const { handleAgentMcpTool } = await import('../src/agent-mcp/server.js')
  return handleAgentMcpTool(name, args) as ToolResult
}

function makeRun(id: string, overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id,
    mode: 'spawner',
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

  describe('agent cap', () => {
    it('refuses to add an agent to a run already at max_agents', async () => {
      const { writeRun, writeAgent } = await import('../src/state/runs.js')

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
  })

  describe('approval lifecycle', () => {
    it('creates, lists, resolves, and rereads an approval, redacting secrets in the return value', async () => {
      const { writeRun, writeAgent } = await import('../src/state/runs.js')

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
})
