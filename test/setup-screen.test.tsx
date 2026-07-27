import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { ScreenName } from '../src/tui/types.js'

// Mock child_process so the setup screen's environment probe (which / tmux -V /
// mcp list) is fast and deterministic and never runs a real CLI.
const execFileSync = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({
  execFileSync,
  spawnSync: vi.fn(() => ({ status: 1, stdout: '', stderr: '' })),
}))

let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'reeves-setup-screen-'))
  process.env.REEVES_REGISTRY = tmp
  process.env.REEVES_CONFIG = join(tmp, 'config.json')
  execFileSync.mockReset()
  execFileSync.mockImplementation((file: string, args: string[]) => {
    if (file === 'tmux') return 'tmux 3.4\n'
    if (file === 'which') return args[0] === 'claude' ? '/usr/bin/claude\n' : (() => { throw new Error('absent') })()
    return '' // mcp list: claude installed but not attached
  })
})
afterEach(() => {
  delete process.env.REEVES_REGISTRY
  delete process.env.REEVES_CONFIG
  rmSync(tmp, { recursive: true, force: true })
})

describe('Setup screen', () => {
  it('renders the wizard in English', async () => {
    const { Router } = await import('../src/tui/router.js')
    const Component = Router as React.ComponentType<{ initialScreen?: ScreenName }>
    const { lastFrame, unmount } = render(React.createElement(Component, { initialScreen: 'Setup' }))
    expect(lastFrame() ?? '').toContain('Get started')
    unmount()
  })

  it('localizes the wizard from the saved language', async () => {
    writeFileSync(join(tmp, 'config.json'), JSON.stringify({ version: 2, global: { language: 'tr' } }), 'utf8')
    const { Router } = await import('../src/tui/router.js')
    const Component = Router as React.ComponentType<{ initialScreen?: ScreenName }>
    const { lastFrame, unmount } = render(React.createElement(Component, { initialScreen: 'Setup' }))
    expect(lastFrame() ?? '').toContain('Başlarken')
    unmount()
  })
})
