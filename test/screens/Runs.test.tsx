// Tests for Runs screen: empty state, runs list, action rows, cleanup behavior.

import React from 'react'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { render } from 'ink-testing-library'
import { Runs } from '../../src/screens/Runs.js'
import { Router } from '../../src/router.js'
import * as runsState from '../../src/state/runs.js'

const waitForInput = () => new Promise(resolve => setTimeout(resolve, 50))

vi.mock('../../src/state/runs.js', async () => {
  const actual = await vi.importActual('../../src/state/runs.js')
  return {
    ...actual,
    listRuns: vi.fn(() => []),
    listAgents: vi.fn(() => []),
    autoCleanupRuns: vi.fn(() => ({ removed: [] })),
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
    expect(frame).toContain('Main Menu')
    expect(frame).toContain('Quit')
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
    expect(lastFrame() ?? '').toContain('Local tmux-first run manager')

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

    expect(lastFrame() ?? '').toContain('Preset')
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
    expect(frame).toContain('Manage local agent runs')
    unmount()
  })
})
