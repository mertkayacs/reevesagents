// Tests for AgentDetail screen: metadata display, sub-page links, actions.

import React from 'react'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { render } from 'ink-testing-library'
import { Router } from '../../src/router.js'
import * as runsState from '../../src/state/runs.js'
import * as runtime from '../../src/launcher/runtime.js'
import type { RunRecord, AgentRecord } from '../../src/state/types.js'

vi.mock('../../src/state/runs.js', async () => {
  const actual = await vi.importActual('../../src/state/runs.js')
  const mockAgent: AgentRecord = {
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
  }
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
    findAgent: vi.fn(() => mockAgent),
    listAgents: vi.fn(() => [mockAgent]),
  }
})

vi.mock('../../src/launcher/runtime.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/launcher/runtime.js')>('../../src/launcher/runtime.js')
  return {
    ...actual,
    openRunTabs: vi.fn(),
    openAgent: vi.fn(),
    peekAgent: vi.fn(() => 'sample output'),
    killAgent: vi.fn(),
  }
})

describe('AgentDetail screen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.REEVES_RUN_ID = 'run-1'
  })

  afterEach(() => {
    delete process.env.REEVES_RUN_ID
  })

  it('shows agent not found message when findAgent throws', () => {
    vi.mocked(runsState.findAgent).mockImplementation(() => {
      throw new Error('not found')
    })

    const { lastFrame, unmount } = render(
      <Router initialScreen="AgentDetail" />
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
      <Router initialScreen="AgentDetail" />
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
      <Router initialScreen="AgentDetail" />
    )
    const frame = lastFrame() ?? ''

    expect(frame).toContain('Back')
    unmount()
  })

  it('renders breadcrumb structure', () => {
    const { lastFrame, unmount } = render(
      <Router initialScreen="AgentDetail" />
    )
    const frame = lastFrame() ?? ''

    expect(frame).toContain('ReevesAgents')
    expect(frame).toContain('Runs')
    unmount()
  })

  it('renders the Frame component', () => {
    const { lastFrame, unmount } = render(
      <Router initialScreen="AgentDetail" />
    )
    const frame = lastFrame() ?? ''

    expect(frame).toBeTruthy()
    expect(frame.length > 0).toBe(true)
    unmount()
  })
})
