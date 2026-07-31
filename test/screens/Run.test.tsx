// Tests for Run hub screen: metadata display, primary rows, navigation.

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { render } from 'ink-testing-library'
import { Router } from '../../src/surfaces/tui/router.js'
import * as runsState from '../../src/core/runs.js'
import * as runtime from '../../src/core/runtime.js'
import type { RunRecord, AgentRecord } from '../../src/core/types.js'

const waitForInput = () => new Promise(resolve => setTimeout(resolve, 75))

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
      } as AgentRecord,
    ]),
  }
})

vi.mock('../../src/core/runtime.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/core/runtime.js')>('../../src/core/runtime.js')
  return {
    ...actual,
    openRunTabs: vi.fn(),
  }
})

describe('Run hub screen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
    process.env.REEVES_RUN_ID = 'run-1'
  })

  afterEach(() => {
    delete process.env.REEVES_RUN_ID
  })

  it('renders breadcrumb with run name', () => {
    const { lastFrame, unmount } = render(
      <Router initialScreen="Run" />
    )
    const frame = lastFrame() ?? ''

    expect(frame).toContain('ReevesAgents')
    expect(frame).toContain('Runs')
    expect(frame).toContain('test-run')
    unmount()
  })

  it('displays run status and agent count in meta', () => {
    const { lastFrame, unmount } = render(
      <Router initialScreen="Run" />
    )
    const frame = lastFrame() ?? ''

    expect(frame).toContain('running')
    expect(frame).toContain('2')
    unmount()
  })

  it('includes primary action rows', () => {
    const { lastFrame, unmount } = render(
      <Router initialScreen="Run" />
    )
    const frame = lastFrame() ?? ''

    expect(frame).toContain('Agents')
    expect(frame).toContain('Output')
    expect(frame).toContain('Switch to tmux tabs')
    expect(frame).toContain('Add Agent')
    unmount()
  })

  it('opens the run tmux tab set from the action row', async () => {
    const { stdin, unmount } = render(
      <Router initialScreen="Run" />
    )

    await waitForInput()
    stdin.write('\u001B[B')
    await waitForInput()
    stdin.write('\u001B[B')
    await waitForInput()
    stdin.write('\r')
    await waitForInput()

    expect(runtime.openRunTabs).toHaveBeenCalledWith('run-1')
    unmount()
  })

  it('includes run-level actions', () => {
    const { lastFrame, unmount } = render(
      <Router initialScreen="Run" />
    )
    const frame = lastFrame() ?? ''

    expect(frame).toContain('Stop Run')
    expect(frame).toContain('Back')
    unmount()
  })

  it('changes stop into delete after the run ends', () => {
    vi.mocked(runsState.readRun).mockReturnValue({
      id: 'run-1',
      name: 'test-run',
      status: 'ended',
      tmux_session: 'reeves-123',
      reeves_window_id: '0',
      reeves_pane_id: '0',
      root_agent_id: 'agent-1',
      working_dir: '/tmp/test',
      preset_name: null,
      started_at: '2026-05-22T10:00:00Z',
      ended_at: '2026-05-22T11:00:00Z',
    } as RunRecord)

    const { lastFrame, unmount } = render(
      <Router initialScreen="Run" />
    )
    const frame = lastFrame() ?? ''

    expect(frame).toContain('Delete Run')
    expect(frame).not.toContain('Stop Run')
    unmount()
  })

  it('shows tagline plus tmux session in the inline summary', () => {
    const { lastFrame, unmount } = render(
      <Router initialScreen="Run" />
    )
    const frame = lastFrame() ?? ''

    expect(frame).toContain('Open, add, stop')
    expect(frame).toContain('reeves-123')
    unmount()
  })

  it('shows run metadata inline above the actions', () => {
    const { lastFrame, unmount } = render(
      <Router initialScreen="Run" />
    )
    const frame = lastFrame() ?? ''

    // B12: right Detail pane dropped; the summary line carries agent count
    // and session id; the header meta carries status + agents.
    expect(frame).toContain('agents')
    expect(frame).toContain('session')
    expect(frame).toContain('reeves-123')
    unmount()
  })

  it('shows "run not found" when selectedRunId is null', () => {
    vi.mocked(runsState.readRun).mockImplementation(() => {
      throw new Error('not found')
    })

    const { unmount } = render(
      <Router initialScreen="Runs" />
    )
    unmount()
  })
})
