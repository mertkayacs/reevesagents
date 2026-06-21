import { describe, it, expect } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'
import { Legend } from '../../src/tui/components/Legend.js'
import { colors } from '../../src/utils/tokens.js'
import { glyphs } from '../../src/utils/glyphs.js'

describe('Legend', () => {
  it('renders single item', () => {
    const { lastFrame } = render(
      <Legend
        items={[
          { glyph: glyphs.status.ok, label: 'running', color: colors.status.ok }
        ]}
      />
    )
    const frame = lastFrame()
    expect(frame).toContain(glyphs.status.ok)
    expect(frame).toContain('running')
  })

  it('renders multiple items separated by three spaces', () => {
    const { lastFrame } = render(
      <Legend
        items={[
          { glyph: glyphs.status.ok, label: 'running', color: colors.status.ok },
          { glyph: glyphs.status.warn, label: 'stale', color: colors.status.warn },
        ]}
      />
    )
    const frame = lastFrame()
    expect(frame).toContain(glyphs.status.ok)
    expect(frame).toContain('running')
    expect(frame).toContain(glyphs.status.warn)
    expect(frame).toContain('stale')
  })

  it('uses each items color for its glyph', () => {
    const { lastFrame } = render(
      <Legend
        items={[
          { glyph: glyphs.status.ok, label: 'ok', color: colors.status.ok },
          { glyph: glyphs.status.warn, label: 'warn', color: colors.status.warn },
          { glyph: glyphs.status.fail, label: 'fail', color: colors.status.error },
        ]}
      />
    )
    const frame = lastFrame()
    expect(frame).toContain(glyphs.status.ok)
    expect(frame).toContain(glyphs.status.warn)
    expect(frame).toContain(glyphs.status.fail)
  })

  it('renders empty legend', () => {
    const { lastFrame } = render(
      <Legend items={[]} />
    )
    const frame = lastFrame()
    expect(frame).toBeDefined()
  })

  it('renders labels in text.dim color', () => {
    const { lastFrame } = render(
      <Legend
        items={[
          { glyph: '●', label: 'active', color: colors.status.ok },
        ]}
      />
    )
    const frame = lastFrame()
    expect(frame).toContain('active')
  })

  it('renders multiple status glyphs', () => {
    const { lastFrame } = render(
      <Legend
        items={[
          { glyph: glyphs.status.ok, label: 'ok', color: colors.status.ok },
          { glyph: glyphs.status.warn, label: 'warn', color: colors.status.warn },
          { glyph: glyphs.status.fail, label: 'fail', color: colors.status.error },
          { glyph: glyphs.status.pending, label: 'pending', color: colors.status.info },
        ]}
      />
    )
    const frame = lastFrame()
    expect(frame).toContain(glyphs.status.ok)
    expect(frame).toContain(glyphs.status.warn)
    expect(frame).toContain(glyphs.status.fail)
    expect(frame).toContain(glyphs.status.pending)
  })
})
