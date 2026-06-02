import React from 'react'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { render } from 'ink-testing-library'
import { Router } from '../../src/router.js'
import * as runtime from '../../src/launcher/runtime.js'
import type { RunRecord } from '../../src/state/types.js'

const waitForInput = () => new Promise(resolve => setTimeout(resolve, 75))

const mockRun: RunRecord = {
  id: 'run-1',
  name: 'test-run',
  status: 'running',
  tmux_session: 'reeves-run-1',
  reeves_session: 'reeves',
  reeves_window_id: '@0',
  reeves_pane_id: '%0',
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
    readRun: vi.fn(() => mockRun),
    archiveAndRemoveRun: vi.fn(() => ({
      id: mockRun.id,
      name: mockRun.name,
      mode: 'spawner',
      status: 'ended',
      working_dir: mockRun.working_dir,
      started_at: mockRun.started_at,
      ended_at: '2026-05-22T10:01:00Z',
      archived_at: '2026-05-22T10:02:00Z',
      agent_count: 1,
      root_provider: 'cc',
    })),
    listRuns: vi.fn(() => []),
    listAgents: vi.fn(() => []),
    autoCleanupRuns: vi.fn(() => ({ removed: [], archived: [] })),
  }
})

vi.mock('../../src/launcher/runtime.js', async () => {
  const actual = await vi.importActual('../../src/launcher/runtime.js')
  return {
    ...actual,
    openReeves: vi.fn(),
    stopRun: vi.fn(() => ({ ...mockRun, status: 'ended', ended_at: '2026-05-22T10:01:00Z' })),
  }
})

describe('RunStop screen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.REEVES_RUN_ID = 'run-1'
  })

  afterEach(() => {
    delete process.env.REEVES_RUN_ID
  })

  it('moves to history after stopping the run', async () => {
    const { stdin, lastFrame, unmount } = render(<Router initialScreen="RunStop" />)

    expect(lastFrame() ?? '').toContain('Return and stop "test-run"?')
    stdin.write('\u001B[C')
    await waitForInput()
    stdin.write('\r')
    await waitForInput()

    expect(runtime.openReeves).toHaveBeenCalledWith('run-1')
    expect(runtime.stopRun).toHaveBeenCalledWith('run-1')
    expect(lastFrame() ?? '').toContain('History')
    unmount()
  })

  it('deletes an already stopped run into history', async () => {
    const runs = await import('../../src/state/runs.js')
    vi.mocked(runs.readRun).mockReturnValue({
      ...mockRun,
      status: 'ended',
      ended_at: '2026-05-22T10:01:00Z',
    })

    const { stdin, lastFrame, unmount } = render(<Router initialScreen="RunStop" />)

    expect(lastFrame() ?? '').toContain('Delete stopped run "test-run"?')
    stdin.write('\u001B[C')
    await waitForInput()
    stdin.write('\r')
    await waitForInput()

    expect(runs.archiveAndRemoveRun).toHaveBeenCalledWith('run-1', 'ended')
    expect(lastFrame() ?? '').toContain('History')
    unmount()
  })
})
