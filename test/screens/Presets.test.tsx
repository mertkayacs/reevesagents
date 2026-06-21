import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Presets } from '../../src/tui/screens/Presets.js'
import * as RouterModule from '../../src/tui/router.js'
import { ToastProvider } from '../../src/tui/contexts/ToastContext.js'
import { saveSavedTree } from '../../src/core/store.js'
import type { SavedTreeSlot } from '../../src/core/types.js'

vi.mock('../../src/tui/router.js')

let tmpDir: string

function slot(overrides: Partial<SavedTreeSlot>): SavedTreeSlot {
  return {
    nickname_template: 'agent',
    provider: 'cc',
    model: '',
    auth_mode: 'default',
    effort: 'default',
    initial_prompt: '',
    working_dir: '',
    permissions: 'ask',
    rc_enabled: false,
    ...overrides,
  }
}

function mockRouter(): void {
  vi.spyOn(RouterModule, 'useRouter').mockReturnValue({
    push: vi.fn(),
    pop: vi.fn(),
    replace: vi.fn(),
    forward: vi.fn(),
    resetStack: vi.fn(),
    screen: 'Presets',
    selectedRunId: null,
    setSelectedRunId: vi.fn(),
    selectedAgentId: null,
    setSelectedAgentId: vi.fn(),
    selectedCheckName: null,
    setSelectedCheckName: vi.fn(),
    selectedWorkerIdx: null,
    setSelectedWorkerIdx: vi.fn(),
    canBack: false,
    canForward: false,
  } as any)
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeves-presets-screen-'))
  process.env.REEVES_REGISTRY = tmpDir
  mockRouter()
})

afterEach(() => {
  delete process.env.REEVES_REGISTRY
  rmSync(tmpDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('Presets screen', () => {
  it('shows the empty state and the actions with no presets', () => {
    const { lastFrame } = render(
      <ToastProvider>
        <Presets />
      </ToastProvider>
    )
    const output = lastFrame()!
    expect(output).toContain('No presets yet')
    expect(output).toContain('Start')
    expect(output).toContain('Save Current Run')
  })

  it('lists saved presets', () => {
    saveSavedTree({
      name: 'my-team',
      description: 'two builders',
      working_dir_pattern: '',
      root: slot({ nickname_template: 'lead', provider: 'cc' }),
      workers: [slot({ nickname_template: 'hand', provider: 'codex' })],
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    })

    const { lastFrame } = render(
      <ToastProvider>
        <Presets />
      </ToastProvider>
    )
    expect(lastFrame()!).toContain('my-team')
  })
})
