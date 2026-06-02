// Tests for Run › Agents list: real agent rows and navigation.

import React from 'react'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { render } from 'ink-testing-library'
import { Router } from '../../src/router.js'
import * as runsState from '../../src/state/runs.js'
import type { RunRecord, AgentRecord } from '../../src/state/types.js'

vi.mock('../../src/state/runs.js', async () => {
  const actual = await vi.importActual('../../src/state/runs.js')
  return {
    ...actual,
    readRun: vi.fn(() => ({
      id: 'run-1',
      mode: 'spawner',
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
    listAgents: vi.fn(() => [
      {
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
      } as AgentRecord,
      {
        id: 'agent-2',
        run_id: 'run-1',
        nickname: 'worker-1',
        provider: 'codex',
        model: 'gpt-4o',
        role: 'worker',
        working_dir: '/tmp/test',
        task: 'worker task',
        task_status: 'blocked',
        task_note: 'awaiting feedback',
        tmux_session: 'reeves-123',
        tmux_window_id: '2',
        tmux_pane_id: '0',
        rc_enabled: false,
        permissions: 'ask',
        inbox: [],
        last_seen: Date.now(),
        started_at: '2026-05-22T10:30:00Z',
        ended_at: null,
      } as AgentRecord,
    ]),
  }
})

describe('Run › Agents list screen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.REEVES_RUN_ID = 'run-1'
  })

  afterEach(() => {
    delete process.env.REEVES_RUN_ID
  })

  it('renders breadcrumb with run name and Agents', () => {
    const { lastFrame, unmount } = render(
      <Router initialScreen="RunAgents" />
    )
    const frame = lastFrame() ?? ''

    expect(frame).toContain('ReevesAgents')
    expect(frame).toContain('Runs')
    expect(frame).toContain('test-run')
    expect(frame).toContain('Agents')
    unmount()
  })

  it('does not render the Reeves TUI anchor as an agent row', () => {
    const { lastFrame, unmount } = render(
      <Router initialScreen="RunAgents" />
    )
    const frame = lastFrame() ?? ''

    expect(frame).not.toContain('TUI anchor')
    unmount()
  })

  it('displays root agent with root badge', () => {
    const { lastFrame, unmount } = render(
      <Router initialScreen="RunAgents" />
    )
    const frame = lastFrame() ?? ''

    expect(frame).toContain('root')
    expect(frame).toContain('Claude Code')
    unmount()
  })

  it('displays worker agents with provider badges', () => {
    const { lastFrame, unmount } = render(
      <Router initialScreen="RunAgents" />
    )
    const frame = lastFrame() ?? ''

    expect(frame).toContain('worker-1')
    expect(frame).toContain('Codex CLI')
    unmount()
  })

  it('includes action rows for Add Agent and Back', () => {
    const { lastFrame, unmount } = render(
      <Router initialScreen="RunAgents" />
    )
    const frame = lastFrame() ?? ''

    expect(frame).toContain('Add Agent')
    expect(frame).toContain('Back')
    unmount()
  })

  it('displays agent count in meta', () => {
    const { lastFrame, unmount } = render(
      <Router initialScreen="RunAgents" />
    )
    const frame = lastFrame() ?? ''

    expect(frame).toContain('count')
    expect(frame).toContain('2')
    unmount()
  })

  it('shows tagline about agents in this run', () => {
    const { lastFrame, unmount } = render(
      <Router initialScreen="RunAgents" />
    )
    const frame = lastFrame() ?? ''

    expect(frame).toContain('Independent CLI agents in this spawner run')
    unmount()
  })

  it('shows agent nickname in list when selected', () => {
    const { lastFrame, unmount } = render(
      <Router initialScreen="RunAgents" />
    )
    const frame = lastFrame() ?? ''

    expect(frame).toContain('root')
    unmount()
  })
})
