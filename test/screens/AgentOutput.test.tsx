// Tests for AgentOutput screen: output peek display, refresh, actions.

import React from 'react'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { render } from 'ink-testing-library'
import { Router, RouterContext } from '../../src/tui/router.js'
import { AgentOutput } from '../../src/tui/screens/run/AgentOutput.js'
import { ToastProvider } from '../../src/tui/contexts/ToastContext.js'
import * as runsState from '../../src/core/runs.js'
import * as runtime from '../../src/core/runtime.js'
import type { RunRecord, AgentRecord } from '../../src/core/types.js'
import type { RouterContextValue } from '../../src/tui/types.js'

const waitForInput = () => vi.advanceTimersByTimeAsync(75)

vi.mock('../../src/core/runs.js', async () => {
  const actual = await vi.importActual('../../src/core/runs.js')
  return {
    ...actual,
    readRun: vi.fn(() => ({
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
    } as RunRecord)),
    findAgent: vi.fn(() => ({
      id: 'agent-1',
      run_id: 'run-1',
      nickname: 'root',
      provider: 'cc',
      model: 'claude-3-5-sonnet',
      role: 'root',
      working_dir: '/tmp/test',
      task: 'test task',
      task_status: 'working',
      task_note: 'in progress',
      tmux_session: 'reeves-123',
      tmux_window_id: '1',
      tmux_pane_id: '0',
      rc_enabled: false,
      permissions: 'ask',
      inbox: [],
      last_seen: Date.now(),
      started_at: '2026-05-22T10:00:00Z',
      ended_at: null,
    } as AgentRecord)),
  }
})

vi.mock('../../src/core/runtime.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/core/runtime.js')>('../../src/core/runtime.js')
  return {
    ...actual,
    openRunTabs: vi.fn(),
    openAgent: vi.fn(),
    peekAgent: vi.fn(() => 'line 1\nline 2\nline 3\nsample output'),
    killAgent: vi.fn(),
  }
})

describe('AgentOutput screen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.REEVES_RUN_ID = 'run-1'
    vi.useFakeTimers()
  })

  afterEach(() => {
    delete process.env.REEVES_RUN_ID
    vi.useRealTimers()
  })

  it('shows agent not found message when findAgent throws', () => {
    vi.mocked(runsState.findAgent).mockImplementation(() => {
      throw new Error('not found')
    })

    const { lastFrame, unmount } = render(
      <Router initialScreen="AgentOutput" />
    )
    const frame = lastFrame() ?? ''

    expect(frame).toContain('Agent not found')
    unmount()
  })

  it('shows agent not found when readRun throws', () => {
    vi.mocked(runsState.readRun).mockImplementation(() => {
      throw new Error('not found')
    })

    const { lastFrame, unmount } = render(
      <Router initialScreen="AgentOutput" />
    )
    const frame = lastFrame() ?? ''

    expect(frame).toContain('Agent not found')
    unmount()
  })

  it('includes Back action in error state', () => {
    vi.mocked(runsState.findAgent).mockImplementation(() => {
      throw new Error('not found')
    })

    const { lastFrame, unmount } = render(
      <Router initialScreen="AgentOutput" />
    )
    const frame = lastFrame() ?? ''

    expect(frame).toContain('Back')
    unmount()
  })

  it('renders breadcrumb structure', () => {
    const { lastFrame, unmount } = render(
      <Router initialScreen="AgentOutput" />
    )
    const frame = lastFrame() ?? ''

    expect(frame).toContain('ReevesAgents')
    expect(frame).toContain('Runs')
    unmount()
  })

  it('renders the Frame component', () => {
    const { lastFrame, unmount } = render(
      <Router initialScreen="AgentOutput" />
    )
    const frame = lastFrame() ?? ''

    expect(frame).toBeTruthy()
    expect(frame.length > 0).toBe(true)
    unmount()
  })

  it('does not open an ended agent', async () => {
    const endedAgent: AgentRecord = {
      id: 'agent-1',
      run_id: 'run-1',
      nickname: 'root',
      provider: 'cc',
      model: 'claude-3-5-sonnet',
      role: 'root',
      working_dir: '/tmp/test',
      task: 'test task',
      task_status: 'done',
      task_note: '',
      tmux_session: 'reeves-123',
      tmux_window_id: '1',
      tmux_pane_id: '0',
      rc_enabled: false,
      permissions: 'ask',
      inbox: [],
      last_seen: Date.now(),
      started_at: '2026-05-22T10:00:00Z',
      ended_at: '2026-05-22T10:10:00Z',
    }
    vi.mocked(runsState.findAgent).mockReturnValue(endedAgent)
    vi.mocked(runsState.readRun).mockReturnValue({
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
    } as RunRecord)
    const router: RouterContextValue = {
      screen: 'AgentOutput',
      push: vi.fn(),
      pop: vi.fn(),
      forward: vi.fn(),
      replace: vi.fn(),
      resetStack: vi.fn(),
      selectedRunId: 'run-1',
      setSelectedRunId: vi.fn(),
      selectedAgentId: 'agent-1',
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
          <AgentOutput />
        </ToastProvider>
      </RouterContext.Provider>,
    )

    stdin.write('\u001B[B')
    await waitForInput()
    expect(lastFrame() ?? '').toContain('agent has ended')
    stdin.write('\r')
    await waitForInput()

    expect(runtime.openAgent).not.toHaveBeenCalled()
    unmount()
  })
})
