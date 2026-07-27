// Tests for Runs screen: empty state, runs list, action rows, cleanup behavior.

import React from 'react'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { render } from 'ink-testing-library'
import { Router } from '../../src/tui/router.js'
import * as runsState from '../../src/core/runs.js'

const waitForInput = () => new Promise(resolve => setTimeout(resolve, 50))

vi.mock('../../src/core/runs.js', async () => {
  const actual = await vi.importActual('../../src/core/runs.js')
  return {
    ...actual,
    listRuns: vi.fn(() => []),
    listAgents: vi.fn(() => []),
    listRunHistory: vi.fn(() => []),
    autoCleanupRuns: vi.fn(() => ({ removed: [], archived: [] })),
  }
})

describe('Runs screen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('shows empty state when no runs exist', () => {
    vi.mocked(runsState.listRuns).mockReturnValue([])
    vi.mocked(runsState.listAgents).mockReturnValue([])

    const { lastFrame, unmount } = render(<Router initialScreen="Runs" />)
    const frame = lastFrame() ?? ''

    expect(frame).toContain('No runs yet')
    expect(frame).toContain('choose New Run below')
    unmount()
  })

  it('calls autoCleanupRuns on mount', () => {
    vi.mocked(runsState.listRuns).mockReturnValue([])
    vi.mocked(runsState.listAgents).mockReturnValue([])

    const { unmount } = render(<Router initialScreen="Runs" />)

    expect(vi.mocked(runsState.autoCleanupRuns)).toHaveBeenCalled()
    unmount()
  })

  it('renders action rows below data rows', () => {
    vi.mocked(runsState.listRuns).mockReturnValue([])
    vi.mocked(runsState.listAgents).mockReturnValue([])

    const { lastFrame, unmount } = render(<Router initialScreen="Runs" />)
    const frame = lastFrame() ?? ''

    expect(frame).toContain('New Run')
    expect(frame).toContain('History')
    expect(frame).toContain('Main Menu')
    expect(frame).toContain('Quit')
    unmount()
  })

  it('opens shared history from the action list', async () => {
    vi.mocked(runsState.listRuns).mockReturnValue([])
    vi.mocked(runsState.listAgents).mockReturnValue([])
    vi.mocked(runsState.listRunHistory).mockReturnValue([{
      id: 'old',
      name: 'old run',
      status: 'ended',
      working_dir: '/tmp',
      started_at: '2026-01-01T00:00:00.000Z',
      ended_at: '2026-01-01T00:05:00.000Z',
      archived_at: '2026-01-01T00:05:01.000Z',
      agent_count: 1,
      root_provider: 'codex',
    }])

    const { lastFrame, stdin, unmount } = render(<Router initialScreen="Runs" />)

    await waitForInput()
    stdin.write('\u001B[B')
    await waitForInput()
    stdin.write('\r')
    await waitForInput()

    const frame = lastFrame() ?? ''
    expect(frame).toContain('History')
    expect(frame).toContain('old run')
    expect(frame).toContain('Codex CLI')
    unmount()
  })

  it('esc returns from Runs to Welcome when history exists', async () => {
    vi.mocked(runsState.listRuns).mockReturnValue([])
    vi.mocked(runsState.listAgents).mockReturnValue([])

    const { lastFrame, stdin, unmount } = render(<Router />)

    stdin.write('\u001B[B')
    await waitForInput()
    stdin.write('\r')
    await waitForInput()
    expect(lastFrame() ?? '').toContain('Runs')

    stdin.write('\u001B')
    await waitForInput()
    expect(lastFrame() ?? '').toContain('Local tmux-first workspace manager')

    unmount()
  })

  it('starts New Run on Enter when the list is empty', async () => {
    vi.mocked(runsState.listRuns).mockReturnValue([])
    vi.mocked(runsState.listAgents).mockReturnValue([])

    const { lastFrame, stdin, unmount } = render(<Router initialScreen="Runs" />)

    await waitForInput()
    expect(lastFrame() ?? '').toContain('❯ │ [ New Run')

    stdin.write('\r')
    await waitForInput()

    expect(lastFrame() ?? '').toContain('Run Name')
    unmount()
  })

  it('renders legend with status glyphs', () => {
    vi.mocked(runsState.listRuns).mockReturnValue([])
    vi.mocked(runsState.listAgents).mockReturnValue([])

    const { lastFrame, unmount } = render(<Router initialScreen="Runs" />)
    const frame = lastFrame() ?? ''

    expect(frame).toContain('running')
    expect(frame).toContain('stale')
    unmount()
  })

  it('shows breadcrumb and tagline', () => {
    vi.mocked(runsState.listRuns).mockReturnValue([])
    vi.mocked(runsState.listAgents).mockReturnValue([])

    const { lastFrame, unmount } = render(<Router initialScreen="Runs" />)
    const frame = lastFrame() ?? ''

    expect(frame).toContain('ReevesAgents')
    expect(frame).toContain('Runs')
    expect(frame).toContain('Manage active runs')
    unmount()
  })
})
