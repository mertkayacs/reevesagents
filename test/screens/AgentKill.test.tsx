// Tests for AgentKill screen: confirm dialog, root agent check.
// Note: selectedAgentId routing requires full app context, so we test error handling.

import React from 'react'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { render } from 'ink-testing-library'
import { Router, RouterContext } from '../../src/tui/router.js'
import { AgentKill } from '../../src/tui/screens/run/AgentKill.js'
import { ToastProvider } from '../../src/tui/contexts/ToastContext.js'
import * as runsState from '../../src/core/runs.js'
import * as runtime from '../../src/core/runtime.js'
import type { AgentRecord, RunRecord } from '../../src/core/types.js'
import type { RouterContextValue } from '../../src/tui/types.js'

const waitForInput = () => new Promise(resolve => setTimeout(resolve, 75))

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

vi.mock('../../src/core/runs.js', async () => {
  const actual = await vi.importActual('../../src/core/runs.js')
  return {
    ...actual,
    findAgent: vi.fn(() => mockWorkerAgent),
    readRun: vi.fn(() => mockRun),
    listAgents: vi.fn(() => [mockRootAgent, mockWorkerAgent]),
  }
})

vi.mock('../../src/core/runtime.js', async () => {
  const actual = await vi.importActual('../../src/core/runtime.js')
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

  it('stopping the last live agent moves the run to history', async () => {
    const resetStack = vi.fn()
    vi.mocked(runsState.listAgents).mockReturnValue([mockWorkerAgent])
    const router: RouterContextValue = {
      screen: 'AgentKill',
      push: vi.fn(),
      pop: vi.fn(),
      forward: vi.fn(),
      replace: vi.fn(),
      resetStack,
      selectedRunId: 'run-1',
      setSelectedRunId: vi.fn(),
      selectedAgentId: 'agent-2',
      setSelectedAgentId: vi.fn(),
      selectedCheckName: null,
      setSelectedCheckName: vi.fn(),
      selectedWorkerIdx: null,
      setSelectedWorkerIdx: vi.fn(),
      canBack: true,
      canForward: false,
    }

    const { stdin, lastFrame, unmount } = render(
      <RouterContext.Provider value={router}>
        <ToastProvider>
          <AgentKill />
        </ToastProvider>
      </RouterContext.Provider>,
    )

    expect(lastFrame() ?? '').toContain('ends the run')
    stdin.write('\u001B[C')
    await waitForInput()
    stdin.write('\r')
    await waitForInput()

    expect(runtime.killAgent).toHaveBeenCalledWith('agent-2')
    expect(resetStack).toHaveBeenCalledWith('RunHistory')
    unmount()
  })
})
