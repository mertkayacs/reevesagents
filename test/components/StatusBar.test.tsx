import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import React from 'react'
import { StatusBar } from '../../src/components/StatusBar.js'
import { ToastProvider } from '../../src/state/ToastContext.js'

// Mock Toast context for testing.
const renderWithToast = (component: React.ReactNode) => {
  return render(
    <ToastProvider>
      {component}
    </ToastProvider>
  )
}

describe('StatusBar', () => {
  it('renders context on line 1 when no toast is active', () => {
    const { stdout } = renderWithToast(
      <StatusBar context="my-run running 3 agents" rows={24} cols={80} />
    )
    expect(stdout.lastFrame()).toContain('my-run')
    expect(stdout.lastFrame()).toContain('running')
    expect(stdout.lastFrame()).toContain('3 agents')
  })

  it('shows both lines when rows >= 22', () => {
    const { stdout } = renderWithToast(
      <StatusBar context="context line" keys="move activate" rows={24} cols={80} />
    )
    expect(stdout.lastFrame()).toContain('context line')
    expect(stdout.lastFrame()).toContain('move')
    expect(stdout.lastFrame()).toContain('activate')
  })

  it('shows only line 1 when rows < 22', () => {
    const { stdout } = renderWithToast(
      <StatusBar context="context line" keys="move activate" rows={20} cols={80} />
    )
    expect(stdout.lastFrame()).toContain('context line')
    // Keys should not appear on tight height.
    expect(stdout.lastFrame()).not.toContain('activate')
  })

  it('uses default keys when not provided and rows >= 22', () => {
    const { stdout } = renderWithToast(
      <StatusBar context="my-run" rows={24} cols={80} />
    )
    expect(stdout.lastFrame()).toContain('move')
    expect(stdout.lastFrame()).toContain('select')
    expect(stdout.lastFrame()).toContain('back')
  })

  it('renders empty context when not provided', () => {
    const { stdout } = renderWithToast(
      <StatusBar rows={24} cols={80} />
    )
    expect(stdout.lastFrame()).toBeDefined()
  })

  it('does not show keys on tight height even when provided', () => {
    const { stdout } = renderWithToast(
      <StatusBar
        context="context"
        keys="custom keys"
        rows={18} cols={80}
      />
    )
    expect(stdout.lastFrame()).toContain('context')
    expect(stdout.lastFrame()).not.toContain('custom keys')
  })

  it('renders at boundary height (rows === 22)', () => {
    const { stdout } = renderWithToast(
      <StatusBar context="context" keys="keys" rows={22} cols={80} />
    )
    expect(stdout.lastFrame()).toContain('context')
    expect(stdout.lastFrame()).toContain('keys')
  })

  it('renders at boundary height (rows === 21)', () => {
    const { stdout } = renderWithToast(
      <StatusBar context="context" keys="keys" rows={21} cols={80} />
    )
    expect(stdout.lastFrame()).toContain('context')
    expect(stdout.lastFrame()).not.toContain('keys')
  })
})
