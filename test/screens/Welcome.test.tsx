import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'
import { Welcome } from '../../src/screens/Welcome.js'
import * as RouterModule from '../../src/router.js'

vi.mock('../../src/router.js')

const waitForInput = () => new Promise(resolve => setTimeout(resolve, 50))
const originalIsTTY = process.stdout.isTTY

describe('Welcome', () => {
  let mockPush: any

  beforeEach(() => {
    mockPush = vi.fn()
    vi.spyOn(RouterModule, 'useRouter').mockReturnValue({
      replace: vi.fn(),
      push: mockPush,
      pop: vi.fn(),
      forward: vi.fn(),
      resetStack: vi.fn(),
      selectedRunId: null,
    } as any)
  })

  afterEach(() => {
    Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true })
    vi.restoreAllMocks()
  })

  it('renders the Wordmark pixel art', () => {
    const { lastFrame } = render(<Welcome />)
    const output = lastFrame()
    expect(output).toContain('████')
  })

  it('renders the Mascot', () => {
    const { lastFrame } = render(<Welcome />)
    const output = lastFrame()
    expect(output).toBeDefined()
  })

  it('renders the tagline with two lines', () => {
    const { lastFrame } = render(<Welcome />)
    const output = lastFrame()
    expect(output).toContain('Local tmux-first workspace manager for AI CLI agents')
    expect(output).toContain('Spawner')
    expect(output).toContain('TUI')
  })

  it('renders the main menu actions', () => {
    const { lastFrame } = render(<Welcome />)
    const output = lastFrame()
    expect(output).toContain('Main Menu')
    expect(output).toContain('New Run')
    expect(output).toContain('Runs')
    expect(output).toContain('Doctor')
    expect(output).toContain('Start Web UI')
    expect(output).toContain('Settings')
    expect(output).toContain('Reference')
    expect(output).toContain('Credits')
  })

  it('renders the key hint', () => {
    const { lastFrame } = render(<Welcome />)
    const output = lastFrame()
    expect(output).toContain('enter select')
  })

  it('shows Current Run when opened with run context', () => {
    vi.mocked(RouterModule.useRouter).mockReturnValue({
      replace: vi.fn(),
      push: mockPush,
      pop: vi.fn(),
      forward: vi.fn(),
      resetStack: vi.fn(),
      selectedRunId: 'run-1',
    } as any)

    const { lastFrame } = render(<Welcome />)
    expect(lastFrame() ?? '').toContain('Current Run')
  })

  it('does not auto-skip to Runs', () => {
    render(<Welcome />)
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('clears stale terminal output before initial paint', async () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    const { lastFrame, unmount } = render(<Welcome />)
    await waitForInput()

    expect(writeSpy).toHaveBeenCalledWith('\x1b[3J\x1b[2J\x1b[H')
    expect(lastFrame()).toContain('Main Menu')
    unmount()
  })

  it('opens the selected main menu item on Enter', () => {
    const { stdin } = render(<Welcome />)
    stdin.write('\r')
    expect(mockPush).toHaveBeenCalledWith('NewRun')
  })

  it('moves selection before opening a menu item', async () => {
    const { stdin } = render(<Welcome />)
    stdin.write('\u001B[B')
    await waitForInput()
    stdin.write('\u001B[B')
    await waitForInput()
    stdin.write('\r')
    await waitForInput()
    expect(mockPush).toHaveBeenCalledWith('Doctor')
  })
})
