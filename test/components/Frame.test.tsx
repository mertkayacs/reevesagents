import { afterEach, describe, it, expect, vi } from 'vitest'
import { render } from 'ink-testing-library'
import React from 'react'
import { Text } from 'ink'
import { Frame, FLOOR_COLS, FLOOR_ROWS, DETAIL_BREAKPOINT } from '../../src/components/Frame.js'
import { Header } from '../../src/components/Header.js'
import { StatusBar } from '../../src/components/StatusBar.js'
import { ToastProvider } from '../../src/state/ToastContext.js'

function wrap(children: React.ReactNode) {
  return <ToastProvider>{children}</ToastProvider>
}

const originalIsTTY = process.stdout.isTTY

afterEach(() => {
  Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true })
  vi.restoreAllMocks()
})

describe('Frame', () => {
  it('renders children inside the frame', () => {
    const { lastFrame } = render(
      wrap(
        <Frame breadcrumb={['Reeves', 'Runs']}>
          <Text>hello body</Text>
        </Frame>,
      ),
    )
    expect(lastFrame()).toContain('hello body')
  })

  it('renders the current breadcrumb segment', () => {
    const { lastFrame } = render(
      wrap(
        <Frame breadcrumb={['Reeves', 'Runs', 'my-run']}>
          <Text>body</Text>
        </Frame>,
      ),
    )
    expect(lastFrame()).toContain('my-run')
  })

  it('renders the tagline when provided', () => {
    const { lastFrame } = render(
      wrap(
        <Frame breadcrumb={['Reeves']} tagline="Local tmux run manager.">
          <Text>body</Text>
        </Frame>,
      ),
    )
    expect(lastFrame()).toContain('Local tmux run manager.')
  })

  it('renders the status context line when provided', () => {
    const { lastFrame } = render(
      wrap(
        <Frame breadcrumb={['Reeves']} statusContext="my-run · running">
          <Text>body</Text>
        </Frame>,
      ),
    )
    expect(lastFrame()).toContain('my-run')
  })

  it('renders without crashing when only required props are passed', () => {
    const { lastFrame } = render(
      wrap(
        <Frame breadcrumb={['Reeves']}>
          <Text>body</Text>
        </Frame>,
      ),
    )
    expect(lastFrame()).toBeTruthy()
  })

  it('does not clear stdout on initial mount', async () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    const { unmount } = render(
      wrap(
        <Frame breadcrumb={['Reeves']}>
          <Text>body</Text>
        </Frame>,
      ),
    )
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(writeSpy).not.toHaveBeenCalledWith('\x1b[2J\x1b[H')
    unmount()
  })
})

// Floor values are the single source of truth for the resize refusal.
// Tests here verify they match §15 of the spec; changing these constants
// breaks the floor across every page.
describe('Frame floor constants (spec §15)', () => {
  it('FLOOR_COLS is 40', () => expect(FLOOR_COLS).toBe(40))
  it('FLOOR_ROWS is 12', () => expect(FLOOR_ROWS).toBe(12))
  it('DETAIL_BREAKPOINT is 90', () => expect(DETAIL_BREAKPOINT).toBe(90))
})

describe('Frame detail pane', () => {
  it('renders detail content when detail prop is provided (default test width >= 90)', () => {
    const { lastFrame } = render(
      wrap(
        <Frame breadcrumb={['Reeves']} detail={<Text>detail body</Text>} detailTitle="Info">
          <Text>main body</Text>
        </Frame>,
      ),
    )
    expect(lastFrame()).toContain('main body')
    expect(lastFrame()).toContain('detail body')
  })

  it('does not render detail pane when detail prop is undefined', () => {
    const { lastFrame } = render(
      wrap(
        <Frame breadcrumb={['Reeves']}>
          <Text>main body</Text>
        </Frame>,
      ),
    )
    expect(lastFrame()).toContain('main body')
    expect(lastFrame()).not.toContain('detail body')
  })
})

// Header accepts columns as a prop so width-tier behavior is testable without
// mocking useStdout. Spec §15.1: narrow = cols < 60, standard = 60-89.
describe('Header width tiers', () => {
  it('narrow (cols < 60): shows only current breadcrumb segment', () => {
    const { lastFrame } = render(
      <Header breadcrumb={['ReevesAgents', 'Runs', 'my-run']} columns={55} />,
    )
    expect(lastFrame()).toContain('my-run')
    expect(lastFrame()).not.toContain('ReevesAgents')
  })

  it('narrow (cols < 60): hides meta', () => {
    const { lastFrame } = render(
      <Header breadcrumb={['Reeves']} meta={[{ label: 'count', value: '5' }]} columns={55} />,
    )
    expect(lastFrame()).not.toContain('count')
  })

  it('standard (cols >= 60): shows full breadcrumb with chevron separators', () => {
    const { lastFrame } = render(
      <Header breadcrumb={['ReevesAgents', 'Runs', 'my-run']} columns={80} />,
    )
    expect(lastFrame()).toContain('my-run')
    expect(lastFrame()).toContain('ReevesAgents')
  })

  it('standard (cols >= 60): shows meta label and value', () => {
    const { lastFrame } = render(
      <Header breadcrumb={['Reeves']} meta={[{ label: 'count', value: '5' }]} columns={80} />,
    )
    expect(lastFrame()).toContain('count')
    expect(lastFrame()).toContain('5')
  })

  it('boundary at 60 is standard, 59 is narrow', () => {
    const narrow = render(<Header breadcrumb={['Root', 'Child']} columns={59} />)
    const standard = render(<Header breadcrumb={['Root', 'Child']} columns={60} />)
    expect(narrow.lastFrame()).not.toContain('Root')
    expect(standard.lastFrame()).toContain('Root')
  })
})

// StatusBar accepts rows as a prop so height-tier behavior is directly testable.
// Spec §15.2: tight height uses one packed line; standard height can show
// context plus keys on two lines.
describe('StatusBar height tiers', () => {
  it('rows < 22 without context: shows key legend as the packed line', () => {
    const { lastFrame } = render(
      wrap(<StatusBar keys="enter activate · esc back" rows={20} cols={80} />),
    )
    expect(lastFrame()).toContain('enter activate')
  })

  it('rows >= 22: shows key legend', () => {
    const { lastFrame } = render(
      wrap(<StatusBar keys="enter activate · esc back" rows={22} cols={80} />),
    )
    expect(lastFrame()).toContain('enter activate')
  })

  it('rows >= 22: shows default key legend when keys not provided', () => {
    const { lastFrame } = render(
      wrap(<StatusBar rows={22} cols={80} />),
    )
    expect(lastFrame()).toContain('enter select')
  })

  it('boundary without context: rows 21 and 22 show the packed key legend', () => {
    const below = render(wrap(<StatusBar keys="custom keys" rows={21} cols={80} />))
    const at = render(wrap(<StatusBar keys="custom keys" rows={22} cols={80} />))
    expect(below.lastFrame()).toContain('custom keys')
    expect(at.lastFrame()).toContain('custom keys')
  })

  it('shows default key legend on tight height when context is present', () => {
    const { lastFrame } = render(
      wrap(<StatusBar context="my-run · running" rows={20} cols={80} />),
    )
    expect(lastFrame()).toContain('enter select')
    expect(lastFrame()).not.toContain('my-run · running')
  })
})
