import { describe, it, expect } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'
import { nextHistoryOnPush, nextHistoryOnReset } from '../src/router.js'
import { Router } from '../src/router.js'
import type { ScreenName } from '../src/state/types.js'

function state(entries: ScreenName[], index: number) {
  return { entries, index }
}

describe('nextHistoryOnPush', () => {
  it('returns the same state when target equals current', () => {
    const prev = state(['Runs', 'Run'], 1)
    expect(nextHistoryOnPush(prev, 'Run')).toBe(prev)
  })

  it('steps back when target equals immediate previous entry', () => {
    const prev = state(['Runs', 'Run', 'NewRun'], 2)
    const next = nextHistoryOnPush(prev, 'Run')
    expect(next.index).toBe(1)
    expect(next.entries).toEqual(['Runs', 'Run', 'NewRun'])
  })

  it('pushes a new entry when target is novel', () => {
    const prev = state(['Runs', 'Run'], 1)
    const next = nextHistoryOnPush(prev, 'NewRun')
    expect(next.index).toBe(2)
    expect(next.entries).toEqual(['Runs', 'Run', 'NewRun'])
  })

  it('truncates forward history on a new push', () => {
    const prev = state(['Runs', 'Run', 'NewRun'], 1)
    const next = nextHistoryOnPush(prev, 'Settings')
    expect(next.index).toBe(2)
    expect(next.entries).toEqual(['Runs', 'Run', 'Settings'])
  })

  it('keeps forward history when stepping back via dedupe', () => {
    const prev = state(['Runs', 'Run', 'NewRun'], 2)
    const next = nextHistoryOnPush(prev, 'Run')
    expect(next.entries).toEqual(['Runs', 'Run', 'NewRun'])
    expect(next.index).toBe(1)
  })

  it('pushes when target is two steps back, not the immediate previous', () => {
    const prev = state(['Runs', 'Run', 'NewRun', 'Settings'], 3)
    const next = nextHistoryOnPush(prev, 'Run')
    expect(next.entries).toEqual(['Runs', 'Run', 'NewRun', 'Settings', 'Run'])
    expect(next.index).toBe(4)
  })
})

describe('nextHistoryOnReset', () => {
  it('replaces wizard history with Welcome, Runs, and target screen', () => {
    expect(nextHistoryOnReset('Run')).toEqual({
      entries: ['Welcome', 'Runs', 'Run'],
      index: 2,
    })
  })

  it('does not duplicate target when base already ends there', () => {
    expect(nextHistoryOnReset('Runs', ['Welcome', 'Runs'])).toEqual({
      entries: ['Welcome', 'Runs'],
      index: 1,
    })
  })
})

describe('Router startup', () => {
  it('starts at the main menu even when launched from a run context', () => {
    process.env.REEVES_RUN_ID = 'run-1'
    try {
      const { lastFrame, unmount } = render(React.createElement(Router))
      const frame = lastFrame() ?? ''

      expect(frame).toContain('Main Menu')
      expect(frame).toContain('Current Run')
      unmount()
    } finally {
      delete process.env.REEVES_RUN_ID
    }
  })
})
