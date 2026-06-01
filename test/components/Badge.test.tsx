import { describe, it, expect } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'
import { Badge } from '../../src/components/Badge.js'
import { colors } from '../../src/utils/tokens.js'

describe('Badge', () => {
  it('renders glyph and label', () => {
    const { lastFrame } = render(
      <Badge glyph="●" label="running" color={colors.status.ok} />
    )
    const frame = lastFrame()
    expect(frame).toContain('●')
    expect(frame).toContain('running')
  })

  it('renders in specified color', () => {
    const { lastFrame } = render(
      <Badge
        glyph="●"
        label="success"
        color={colors.status.ok}
      />
    )
    const frame = lastFrame()
    expect(frame).toContain('●')
    expect(frame).toContain('success')
  })

  it('renders provider color badge', () => {
    const { lastFrame } = render(
      <Badge
        glyph="CL"
        label="Claude Code"
        color={colors.provider.cc}
      />
    )
    const frame = lastFrame()
    expect(frame).toContain('CL')
    expect(frame).toContain('Claude Code')
  })

  it('renders status warn badge', () => {
    const { lastFrame } = render(
      <Badge
        glyph="◐"
        label="warn"
        color={colors.status.warn}
      />
    )
    const frame = lastFrame()
    expect(frame).toContain('◐')
    expect(frame).toContain('warn')
  })

  it('renders status error badge', () => {
    const { lastFrame } = render(
      <Badge
        glyph="○"
        label="failed"
        color={colors.status.error}
      />
    )
    const frame = lastFrame()
    expect(frame).toContain('○')
    expect(frame).toContain('failed')
  })

  it('has space between glyph and label', () => {
    const { lastFrame } = render(
      <Badge glyph="●" label="test" color={colors.text.primary} />
    )
    const frame = lastFrame()
    expect(frame).toMatch(/● test/)
  })
})
