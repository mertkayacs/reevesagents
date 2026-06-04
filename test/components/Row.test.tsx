import { describe, it, expect } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'
import { Row } from '../../src/components/Row.js'
import { LayoutProvider } from '../../src/components/LayoutContext.js'
import { colors } from '../../src/utils/tokens.js'
import { glyphs } from '../../src/utils/glyphs.js'

describe('Row', () => {
  it('renders focused cursor when selected', () => {
    const { lastFrame } = render(
      <Row selected={true} primary="Test Item" />
    )
    const frame = lastFrame()
    expect(frame).toContain(glyphs.cursor.focused)
  })

  it('renders unfocused cursor when not selected', () => {
    const { lastFrame } = render(
      <Row selected={false} primary="Test Item" />
    )
    const frame = lastFrame()
    expect(frame).toBeTruthy()
  })

  it('renders primary text bold when selected', () => {
    const { lastFrame } = render(
      <Row selected={true} primary="Test Item" />
    )
    const frame = lastFrame()
    expect(frame).toContain('Test Item')
  })

  it('renders glyph in specified color', () => {
    const { lastFrame } = render(
      <Row
        selected={false}
        primary="Test Item"
        glyph={{ char: '●', color: colors.status.ok }}
      />
    )
    const frame = lastFrame()
    expect(frame).toContain('●')
  })

  it('renders badge inline with label', () => {
    const { lastFrame } = render(
      <Row
        selected={false}
        primary="Test Item"
        badge={{ label: 'running', color: colors.status.ok }}
      />
    )
    const frame = lastFrame()
    expect(frame).toContain('running')
  })

  it('renders multiple badges inline with labels', () => {
    const { lastFrame } = render(
      <Row
        selected={false}
        primary="Test Item"
        badges={[
          { label: 'codex', color: colors.provider.codex },
          { label: 'gpt-5', color: colors.model.openai },
        ]}
      />
    )
    const frame = lastFrame()
    expect(frame).toContain('codex')
    expect(frame).toContain('gpt-5')
  })

  it('renders hint in text.dim color', () => {
    const { lastFrame } = render(
      <Row
        selected={false}
        primary="Test Item"
        hint="3 agents"
      />
    )
    const frame = lastFrame()
    expect(frame).toContain('3 agents')
  })

  it('renders trailing text in text.muted color', () => {
    const { lastFrame } = render(
      <Row
        selected={false}
        primary="Test Item"
        trailing="5 min"
      />
    )
    const frame = lastFrame()
    expect(frame).toContain('5 min')
  })

  it('hides forced trailing text when the row is too narrow to fit it', () => {
    const { lastFrame } = render(
      <LayoutProvider columns={23}>
        <Row
          selected={false}
          primary="Run"
          trailing="important trailing value"
          alwaysShowTrailing
        />
      </LayoutProvider>
    )
    const frame = lastFrame()
    expect(frame).toContain('Run')
    expect(frame).not.toContain('important trailing value')
  })

  it('renders disabled state with text.faint color', () => {
    const { lastFrame } = render(
      <Row
        selected={false}
        primary="Disabled Item"
        disabled={true}
      />
    )
    const frame = lastFrame()
    expect(frame).toContain('Disabled Item')
  })

  it('renders danger state in error color when selected', () => {
    const { lastFrame } = render(
      <Row
        selected={true}
        primary="Dangerous Item"
        danger={true}
      />
    )
    const frame = lastFrame()
    expect(frame).toContain('Dangerous Item')
  })

  it('combines all features in a single row', () => {
    const { lastFrame } = render(
      <Row
        selected={true}
        primary="Complex Item"
        glyph={{ char: '●', color: colors.status.ok }}
        badge={{ label: 'active', color: colors.status.ok }}
        hint="detail text"
        trailing="trailing"
      />
    )
    const frame = lastFrame()
    expect(frame).toContain('Complex Item')
    expect(frame).toContain('●')
    expect(frame).toContain('active')
    expect(frame).toContain('detail text')
    expect(frame).toContain('trailing')
  })
})
