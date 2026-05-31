import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { AgentRecord, RunRecord } from '../../../src/state/types.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeves-approvals-test-'))
  process.env.REEVES_REGISTRY = tmpDir
})

afterEach(() => {
  delete process.env.REEVES_REGISTRY
  rmSync(tmpDir, { recursive: true, force: true })
})

function makeRun(id: string): RunRecord {
  return {
    id,
    mode: 'orchestrator',
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
  }
}

function makeAgent(id: string, runId: string): AgentRecord {
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
  }
}

describe('orchestrator approvals', () => {
  it('creates, lists, and resolves approvals inside the run folder', async () => {
    const { writeRun, writeAgent } = await import('../../../src/state/runs.js')
    const {
      createRunApproval,
      listRunApprovals,
      resolveRunApproval,
      readRunApproval,
    } = await import('../src/approvals.js')
    writeRun(makeRun('r9'))
    writeAgent(makeAgent('a4', 'r9'))

    const approval = createRunApproval({
      agent_id: 'a4',
      action: 'deploy',
      summary: 'deploy review app',
      risk: 'high',
    })

    expect(approval.run_id).toBe('r9')
    expect(existsSync(join(tmpDir, 'runs', 'r9', 'approvals', `${approval.id}.json`))).toBe(true)
    expect(listRunApprovals('r9', 'pending')).toHaveLength(1)

    const resolved = resolveRunApproval(approval.id, 'approved', 'ok')
    expect(resolved.status).toBe('approved')
    expect(resolved.decision_note).toBe('ok')
    expect(readRunApproval('r9', approval.id).status).toBe('approved')
  })

  it('redacts approval text and details before writing', async () => {
    const { writeRun, writeAgent } = await import('../../../src/state/runs.js')
    const { createRunApproval, readRunApproval } = await import('../src/approvals.js')
    writeRun(makeRun('r10'))
    writeAgent(makeAgent('a5', 'r10'))
    const approval = createRunApproval({
      agent_id: 'a5',
      action: 'use token',
      summary: 'send sk-ant-api03-abcdefghij1234567890abcdef',
      details: { token: 'sk-ant-api03-abcdefghij1234567890abcdef' },
    })

    const loaded = readRunApproval('r10', approval.id)
    expect(loaded.summary).toContain('[REDACTED]')
    expect(String(loaded.details.token)).toContain('[REDACTED]')
  })
})
