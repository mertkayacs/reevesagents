// Tests for global Approvals list: render, Show All toggle, navigation.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render } from 'ink-testing-library'
import React from 'react'
import { Router } from '../../src/router.js'
import * as runsState from '../../src/state/runs.js'

vi.mock('../../src/state/runs.js', async () => {
  const actual = await vi.importActual('../../src/state/runs.js')
  return {
    ...actual,
    listRunApprovals: vi.fn(),
    readRun: vi.fn(),
  }
})

describe('Approvals (global list)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing with empty approvals', () => {
    vi.mocked(runsState.listRunApprovals).mockReturnValue([])
    vi.mocked(runsState.readRun).mockReturnValue({
      id: 'r1',
      name: 'test-run',
      status: 'running' as const,
      tmux_session: 'sess',
      reeves_window_id: '0',
      reeves_pane_id: '0.0',
      root_agent_id: 'ag1',
      working_dir: '/tmp',
      preset_name: null,
      started_at: new Date().toISOString(),
      ended_at: null,
    } as any)

    const { lastFrame } = render(
      <Router initialScreen="Approvals" />
    )

    const text = lastFrame()
    expect(text).toBeTruthy()
    expect(text).toContain('Approvals')
  })

  it('shows Show All action when no pending approvals', () => {
    vi.mocked(runsState.listRunApprovals).mockReturnValue([])

    const { lastFrame } = render(
      <Router initialScreen="Approvals" />
    )

    const text = lastFrame()
    expect(text).toContain('Show All')
  })

  it('renders breadcrumb with Approvals title', () => {
    vi.mocked(runsState.listRunApprovals).mockReturnValue([])

    const { lastFrame } = render(
      <Router initialScreen="Approvals" />
    )

    const text = lastFrame()
    expect(text).toContain('ReevesAgents')
  })
})
