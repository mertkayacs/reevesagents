import { describe, it, expect } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
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
    const tmp = mkdtempSync(join(tmpdir(), 'reeves-router-test-'))
    process.env.REEVES_CONFIG = join(tmp, 'config.json')
    writeFileSync(process.env.REEVES_CONFIG, JSON.stringify({ version: 2, global: { language: 'en' } }), 'utf8')
    process.env.REEVES_RUN_ID = 'run-1'
    try {
      const { lastFrame, unmount } = render(React.createElement(Router))
      const frame = lastFrame() ?? ''

      expect(frame).toContain('Main Menu')
      expect(frame).toContain('Current Run')
      unmount()
    } finally {
      delete process.env.REEVES_RUN_ID
      delete process.env.REEVES_CONFIG
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('asks for language on first launch when config is missing', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'reeves-router-language-test-'))
    process.env.REEVES_CONFIG = join(tmp, 'config.json')
    try {
      const { lastFrame, unmount } = render(React.createElement(Router))
      const frame = lastFrame() ?? ''

      expect(frame).toContain('Choose language')
      expect(frame).toContain('English')
      unmount()
    } finally {
      delete process.env.REEVES_CONFIG
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('localizes shared TUI chrome from the saved language', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'reeves-router-i18n-test-'))
    process.env.REEVES_CONFIG = join(tmp, 'config.json')
    process.env.REEVES_REGISTRY = tmp
    writeFileSync(process.env.REEVES_CONFIG, JSON.stringify({ version: 2, global: { language: 'tr' } }), 'utf8')
    try {
      const Component = Router as React.ComponentType<{ initialScreen?: ScreenName }>
      const { lastFrame, unmount } = render(React.createElement(Component, { initialScreen: 'Runs' }))
      const frame = lastFrame() ?? ''

      expect(frame).toContain('Runlar')
      expect(frame).toContain('İşlemler')
      expect(frame).toContain('Yeni run')
      expect(frame).not.toContain('New Run')
      unmount()
    } finally {
      delete process.env.REEVES_CONFIG
      delete process.env.REEVES_REGISTRY
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})
