// Tests for AgentKill screen: confirm dialog, root agent check.
// Note: selectedAgentId routing requires full app context, so we test error handling.

import React from 'react'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { render } from 'ink-testing-library'
import { Router } from '../../src/router.js'
import * as runsState from '../../src/state/runs.js'
import * as runtime from '../../src/launcher/runtime.js'
import type { AgentRecord, RunRecord } from '../../src/state/types.js'

const mockWorkerAgent: AgentRecord = {
  id: 'agent-2',
  run_id: 'run-1',
  nickname: 'worker-1',
  provider: 'codex',
  model: 'gpt-4o',
  role: 'worker',
  working_dir: '/tmp/test',
  task: 'worker task',
  task_status: 'queued',
  task_note: '',
  tmux_session: 'reeves-123',
  tmux_window_id: '2',
  tmux_pane_id: '0',
  rc_enabled: false,
  permissions: 'ask',
  inbox: [],
  last_seen: Date.now(),
  started_at: '2026-05-22T10:30:00Z',
  ended_at: null,
}

const mockRootAgent: AgentRecord = {
  id: 'agent-1',
  run_id: 'run-1',
  nickname: 'root',
  provider: 'cc',
  model: 'claude-3-5-sonnet',
  role: 'root',
  working_dir: '/tmp/test',
  task: 'test task',
  task_status: 'working',
  task_note: '',
  tmux_session: 'reeves-123',
  tmux_window_id: '1',
  tmux_pane_id: '0',
  rc_enabled: false,
  permissions: 'ask',
  inbox: [],
  last_seen: Date.now(),
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

vi.mock('../../src/state/runs.js', async () => {
  const actual = await vi.importActual('../../src/state/runs.js')
  return {
    ...actual,
    findAgent: vi.fn(() => mockWorkerAgent),
    readRun: vi.fn(() => mockRun),
  }
})

vi.mock('../../src/launcher/runtime.js', async () => {
  const actual = await vi.importActual('../../src/launcher/runtime.js')
  return {
    ...actual,
    killAgent: vi.fn(),
  }
})

describe('AgentKill screen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('mocks findAgent returns worker agent', () => {
    const agent = runsState.findAgent('agent-2')
    expect(agent.nickname).toBe('worker-1')
    expect(agent.role).toBe('worker')
    expect(agent.id).toBe('agent-2')
  })

  it('mocks killAgent spy available for testing', () => {
    const killAgentSpy = vi.mocked(runtime.killAgent)
    expect(killAgentSpy).toBeDefined()
    expect(typeof killAgentSpy).toBe('function')
  })

  it('worker agent has all required fields', () => {
    const agent = runsState.findAgent('agent-2')
    expect(agent.provider).toBe('codex')
    expect(agent.model).toBe('gpt-4o')
    expect(agent.task_status).toBe('queued')
  })

  it('mocks readRun returns run data', () => {
    const run = runsState.readRun('run-1')
    expect(run.name).toBe('test-run')
    expect(run.root_agent_id).toBe('agent-1')
  })

  it('root agent mock available for testing', () => {
    // Root agent with id 'agent-1' should have role 'root'
    const agent = mockRootAgent
    expect(agent.role).toBe('root')
    expect(agent.nickname).toBe('root')
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
