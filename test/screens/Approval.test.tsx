// Tests for shared Approval detail page.

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
  }
})

describe('Approval (detail page)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing when no approval is selected', () => {
    vi.mocked(runsState.listRunApprovals).mockReturnValue([])

    const { lastFrame } = render(
      <Router initialScreen="Approval" />
    )

    const text = lastFrame()
    expect(text).toBeTruthy()
    expect(text).toContain('Approval')
  })

  it('shows not found message when no approval exists', () => {
    vi.mocked(runsState.listRunApprovals).mockReturnValue([])

    const { lastFrame } = render(
      <Router initialScreen="Approval" />
    )

    const text = lastFrame()
    expect(text).toContain('not found')
  })

  it('displays Back action row', () => {
    vi.mocked(runsState.listRunApprovals).mockReturnValue([])

    const { lastFrame } = render(
      <Router initialScreen="Approval" />
    )

    const text = lastFrame()
    expect(text).toContain('Back')
  })
})
