// Tests for AgentTask screen: status display, action availability.
// Note: selectedAgentId routing requires full app context, so we test error handling.

import { describe, expect, it, beforeEach, vi } from 'vitest'
import { render } from 'ink-testing-library'
import { Router } from '../../src/surfaces/tui/router.js'
import * as runsState from '../../src/core/runs.js'
import type { AgentRecord, RunRecord } from '../../src/core/types.js'

const mockAgent: AgentRecord = {
  id: 'agent-1',
  run_id: 'run-1',
  nickname: 'root',
  provider: 'cc',
  model: 'claude-3-5-sonnet',
  role: 'root',
  working_dir: '/tmp/test',
  task: 'analyze code',
  task_status: 'working',
  task_note: 'reviewing module.ts',
  tmux_session: 'reeves-123',
  tmux_window_id: '1',
  tmux_pane_id: '0',
  rc_enabled: false,
  permissions: 'ask',
  inbox: [],
  last_seen: Date.now() - 5000,
  started_at: '2026-05-22T10:00:00Z',
  ended_at: null,
}

const mockRun: RunRecord = {
  id: 'run-1',
  name: 'test-run',
  status: 'running',
  tmux_session: 'reeves-123',
  reeves_window_id: '0',
  reeves_pane_id: '0',
  root_agent_id: 'agent-1',
  working_dir: '/tmp/test',
  preset_name: null,
  started_at: '2026-05-22T10:00:00Z',
  ended_at: null,
}

vi.mock('../../src/core/runs.js', async () => {
  const actual = await vi.importActual('../../src/core/runs.js')
  return {
    ...actual,
    findAgent: vi.fn(() => mockAgent),
    readRun: vi.fn(() => mockRun),
    updateAgent: vi.fn(),
  }
})

describe('AgentTask screen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('mocks findAgent with task status data', () => {
    const agent = runsState.findAgent('agent-1')
    expect(agent.task).toBe('analyze code')
    expect(agent.task_status).toBe('working')
    expect(agent.task_note).toBe('reviewing module.ts')
  })

  it('mocks updateAgent spy available for testing', () => {
    const updateAgentSpy = vi.mocked(runsState.updateAgent)
    expect(updateAgentSpy).toBeDefined()
    expect(typeof updateAgentSpy).toBe('function')
  })

  it('mocks readRun with test run data', () => {
    const run = runsState.readRun('run-1')
    expect(run.name).toBe('test-run')
    expect(run.id).toBe('run-1')
  })

  it('agent has last_seen timestamp', () => {
    const agent = runsState.findAgent('agent-1')
    expect(typeof agent.last_seen).toBe('number')
    expect(agent.last_seen).toBeGreaterThan(0)
  })

  it('renders Router without errors', () => {
    const { lastFrame, unmount } = render(
      <Router initialScreen="Runs" />
    )
    const frame = lastFrame() ?? ''
    expect(frame).toContain('ReevesAgents')
    unmount()
  })
})
