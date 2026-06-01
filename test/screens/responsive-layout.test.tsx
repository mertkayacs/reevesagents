import { afterEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'
import stripAnsi from 'strip-ansi'
import { Text } from 'ink'
import { Frame } from '../../src/components/Frame.js'
import { Row } from '../../src/components/Row.js'
import { Section, SectionEnd } from '../../src/components/Section.js'
import { Welcome } from '../../src/screens/Welcome.js'
import { RouterContext } from '../../src/router.js'
import { ToastProvider } from '../../src/state/ToastContext.js'
import type { RouterContextValue } from '../../src/state/types.js'

const viewport = vi.hoisted(() => ({
  current: { columns: 100, rows: 24 },
}))

const originalIsTTY = process.stdout.isTTY

vi.mock('ink', async () => {
  const actual = await vi.importActual<typeof import('ink')>('ink')
  return {
    ...actual,
    useWindowSize: () => viewport.current,
  }
})

function setViewport(columns: number, rows: number): void {
  viewport.current = { columns, rows }
}

afterEach(() => {
  setViewport(100, 24)
  Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true })
  vi.restoreAllMocks()
})

function assertFits(frame: string, columns: number): void {
  for (const line of frame.split('\n')) {
    expect(stripAnsi(line).length).toBeLessThanOrEqual(columns)
  }
}

function menuSeparatorColumns(frame: string): number[] {
  return stripAnsi(frame)
    .split('\n')
    .filter(line => line.includes('[ New Run') || line.includes('[ Runs') || line.includes('[ Reference'))
    .map(line => line.indexOf('] │'))
}

function routerContext(patch: Partial<RouterContextValue> = {}): RouterContextValue {
  return {
    screen: 'Welcome',
    push: vi.fn(),
    pop: vi.fn(),
    forward: vi.fn(),
    replace: vi.fn(),
    resetStack: vi.fn(),
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
    ...patch,
  }
}

describe('responsive layout', () => {
  it('keeps the welcome menu inside a 60x18 frame', () => {
    setViewport(60, 18)
    const { lastFrame, unmount } = render(
      <RouterContext.Provider value={routerContext({ selectedRunId: 'run-1' })}>
        <Welcome />
      </RouterContext.Provider>,
    )

    const frame = lastFrame() ?? ''
    expect(frame).toContain('Main Menu')
    expect(frame).toContain('New Run')
    expect(frame).toContain('1-4 of 9')
    assertFits(frame, 60)
    unmount()
  })

  it('packs the welcome menu card and closes the frame below the key hint', () => {
    setViewport(120, 40)
    const { lastFrame, unmount } = render(
      <RouterContext.Provider value={routerContext({ selectedRunId: 'run-1' })}>
        <Welcome />
      </RouterContext.Provider>,
    )

    const frame = stripAnsi(lastFrame() ?? '')
    const lines = frame.split('\n')
    const cap = lines.find(line => line.includes('Main Menu')) ?? ''
    const keyIndex = lines.findIndex(line => line.includes('enter select'))

    expect(cap.lastIndexOf('╮') - cap.indexOf('╭')).toBeLessThanOrEqual(72)
    expect(lines[keyIndex - 1]).toContain('╰')
    expect(lines[keyIndex + 1]).toContain('└')
    assertFits(frame, 120)
    unmount()
  })

  it('aligns welcome menu descriptions after equal-width buttons', () => {
    setViewport(120, 40)
    const { lastFrame, unmount } = render(
      <RouterContext.Provider value={routerContext()}>
        <Welcome />
      </RouterContext.Provider>,
    )

    const separatorColumns = menuSeparatorColumns(lastFrame() ?? '')

    expect(separatorColumns).toHaveLength(3)
    expect(new Set(separatorColumns).size).toBe(1)
    unmount()
  })

  it('keeps welcome menu alignment stable when resizing compact and wide', async () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const content = () => (
      <RouterContext.Provider value={routerContext()}>
        <Welcome />
      </RouterContext.Provider>
    )

    setViewport(120, 40)
    const { lastFrame, rerender, unmount } = render(content())
    let frame = lastFrame() ?? ''
    expect(new Set(menuSeparatorColumns(frame)).size).toBe(1)
    assertFits(frame, 120)

    setViewport(60, 18)
    rerender(content())
    await new Promise(resolve => setTimeout(resolve, 30))
    frame = lastFrame() ?? ''
    expect(frame).toContain('Main Menu')
    expect(frame).not.toContain('start a spawner workspace')
    expect(frame).toContain('1-')
    assertFits(frame, 60)

    setViewport(120, 40)
    rerender(content())
    await new Promise(resolve => setTimeout(resolve, 30))
    frame = lastFrame() ?? ''
    expect(frame).toContain('start a spawner workspace')
    expect(new Set(menuSeparatorColumns(frame)).size).toBe(1)
    assertFits(frame, 120)
    expect(writeSpy).toHaveBeenCalledWith('\x1b[3J\x1b[2J\x1b[H')
    unmount()
  })

  it('keeps long row content inside a narrow frame', () => {
    setViewport(60, 18)
    const { lastFrame, unmount } = render(
      <ToastProvider>
        <Frame breadcrumb={['ReevesAgents', 'Settings']} tagline="Local setup and paths.">
          <Row
            selected
            primary="Working Dir"
            trailing="/Users/example/development/reevesagents/some/deep/path/that/must/not/overflow"
          />
          <Row
            selected={false}
            primary="Show Config"
            hint="show a very long config path that should collapse on narrow screens"
          />
          <Text>body</Text>
        </Frame>
      </ToastProvider>,
    )

    const frame = lastFrame() ?? ''
    expect(frame).toContain('Working Dir')
    expect(frame).not.toContain('show a very long config path')
    assertFits(frame, 60)
    unmount()
  })

  it('packs framed pages around short enclosed content', () => {
    setViewport(120, 40)
    const { lastFrame, unmount } = render(
      <ToastProvider>
        <Frame breadcrumb={['ReevesAgents', 'Runs']} statusKeys="enter open">
          <Section label="Actions" />
          <Row selected primary="Back" hint="return" />
          <SectionEnd />
        </Frame>
      </ToastProvider>,
    )

    const frame = stripAnsi(lastFrame() ?? '')
    const lines = frame.split('\n')
    const sectionEnd = lines.findIndex(line => line.includes('╰'))
    const keyIndex = lines.findIndex(line => line.includes('enter open'))

    expect(sectionEnd).toBeGreaterThan(0)
    expect(keyIndex).toBeGreaterThan(sectionEnd)
    expect(lines[keyIndex + 1]).toContain('└')
    expect(lines.length).toBeLessThan(16)
    assertFits(frame, 120)
    unmount()
  })

  it('renders page content after resizing out of the minimum-size alert', async () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const content = () => (
      <ToastProvider>
        <Frame breadcrumb={['ReevesAgents', 'Runs']}>
          <Text>ready body</Text>
        </Frame>
      </ToastProvider>
    )

    setViewport(40, 10)
    const { lastFrame, rerender, unmount } = render(content())
    expect(lastFrame()).toContain('needs at least')
    await new Promise(resolve => setTimeout(resolve, 0))

    setViewport(80, 24)
    rerender(content())
    await new Promise(resolve => setTimeout(resolve, 30))

    const frame = lastFrame() ?? ''
    expect(writeSpy).toHaveBeenCalledWith('\x1b[3J\x1b[2J\x1b[H')
    expect(frame).toContain('ready body')
    expect(frame).not.toContain('needs at least')
    assertFits(frame, 80)
    unmount()
  })
})
