import { describe, it, expect } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'
import stripAnsi from 'strip-ansi'
import { LayoutProvider } from '../../src/tui/components/LayoutContext.js'
import { Row } from '../../src/tui/components/Row.js'
import { Section, SectionEnd } from '../../src/tui/components/Section.js'

describe('Section', () => {
  it('renders label with dashes', () => {
    const { lastFrame } = render(
      <Section label="Actions" />
    )
    const frame = lastFrame()
    expect(frame).toContain('╭')
    expect(frame).toContain('╮')
    expect(frame).toContain('Actions')
  })

  it('renders in text.muted color', () => {
    const { lastFrame } = render(
      <Section label="Test Section" />
    )
    const frame = lastFrame()
    expect(frame).toContain('Test Section')
  })

  it('renders as a capped section line', () => {
    const { lastFrame } = render(
      <Section label="Middle" />
    )
    const frame = lastFrame()
    expect(frame).toMatch(/╭─ Middle ─+╮/)
  })

  it('handles empty label', () => {
    const { lastFrame } = render(
      <Section label="" />
    )
    const frame = lastFrame()
    expect(frame).toContain('╭')
  })

  it('handles long labels', () => {
    const { lastFrame } = render(
      <Section label="This is a very long label for testing" />
    )
    const frame = lastFrame()
    expect(frame).toContain('This is a very long label for testing')
  })

  it('aligns cap corners with row rails', () => {
    const { lastFrame } = render(
      <LayoutProvider columns={50}>
        <Section label="Main Menu" />
        <Row selected primary="New Run" hint="create root and workers" />
      </LayoutProvider>
    )

    const lines = stripAnsi(lastFrame() ?? '').split('\n')
    const cap = lines.find(line => line.includes('Main Menu')) ?? ''
    const row = lines.find(line => line.includes('New Run')) ?? ''

    expect(cap.indexOf('╭')).toBe(row.indexOf('│'))
    expect(cap.lastIndexOf('╮')).toBe(row.lastIndexOf('│'))
  })

  it('aligns bottom cap corners with row rails', () => {
    const { lastFrame } = render(
      <LayoutProvider columns={50}>
        <Section label="Main Menu" />
        <Row selected primary="New Run" hint="create root and workers" />
        <SectionEnd />
      </LayoutProvider>
    )

    const lines = stripAnsi(lastFrame() ?? '').split('\n')
    const row = lines.find(line => line.includes('New Run')) ?? ''
    const end = lines.find(line => line.includes('╰')) ?? ''

    expect(end.indexOf('╰')).toBe(row.indexOf('│'))
    expect(end.lastIndexOf('╯')).toBe(row.lastIndexOf('│'))
  })

  it('expands cap and row rails at wide widths', () => {
    const { lastFrame } = render(
      <LayoutProvider columns={96}>
        <Section label="Main Menu" />
        <Row selected primary="New Run" hint="create root and workers" />
      </LayoutProvider>
    )

    const lines = stripAnsi(lastFrame() ?? '').split('\n')
    const cap = lines.find(line => line.includes('Main Menu')) ?? ''
    const row = lines.find(line => line.includes('New Run')) ?? ''

    expect(cap.indexOf('╭')).toBe(row.indexOf('│'))
    expect(cap.lastIndexOf('╮')).toBe(row.lastIndexOf('│'))
    expect(cap.lastIndexOf('╮')).toBeGreaterThan(88)
  })
})
