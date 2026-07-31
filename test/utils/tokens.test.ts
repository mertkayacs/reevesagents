import { describe, it, expect } from 'vitest'
import { colors, sep, space } from '../../src/surfaces/tui/utils/tokens.js'
import { glyphs } from '../../src/surfaces/tui/utils/glyphs.js'
import { MODEL_COLORS } from '../../src/utils/display.js'

describe('tokens', () => {
  // Provider colors moved to the provider registry; their invariants live in
  // test/provider-registry.test.ts. Model colors live in utils/display.ts but
  // must stay distinct from the tokens cursor color, so both are checked here.
  it('every model color is unique', () => {
    const values = Object.values(MODEL_COLORS)
    expect(new Set(values).size).toBe(values.length)
  })

  it('every model color is distinct from accent.bright', () => {
    const cursor = colors.accent.bright
    for (const model of Object.keys(MODEL_COLORS) as Array<keyof typeof MODEL_COLORS>) {
      expect(MODEL_COLORS[model]).not.toBe(cursor)
    }
  })

  it('all accent.* colors are bluish (locked to redesign spec §5)', () => {
    expect(colors.accent.bright).toBe('#7eb8f5')
    expect(colors.accent.primary).toBe('#5a96e0')
    expect(colors.accent.deep).toBe('#4a6fa5')
    expect(colors.accent.ink).toBe('#1e2d3e')
  })

  it('semantic status colors are present and non-empty', () => {
    expect(colors.status.ok).toMatch(/^#[0-9a-f]{6}$/i)
    expect(colors.status.warn).toMatch(/^#[0-9a-f]{6}$/i)
    expect(colors.status.error).toMatch(/^#[0-9a-f]{6}$/i)
    expect(colors.status.info).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('brand gradient is at least three stops', () => {
    expect(colors.brand.gradient.length).toBeGreaterThanOrEqual(3)
  })

  it('separator glyphs have padding', () => {
    expect(sep.dot.startsWith(' ')).toBe(true)
    expect(sep.dot.endsWith(' ')).toBe(true)
  })

  it('spacing scale is strictly monotonic non-decreasing', () => {
    expect(space.none).toBe(0)
    expect(space.sm).toBeGreaterThan(space.none)
    expect(space.md).toBeGreaterThan(space.sm)
    expect(space.lg).toBeGreaterThan(space.md)
  })
})

describe('glyphs', () => {
  it('cursor focused is a single visible char', () => {
    expect(glyphs.cursor.focused.length).toBeGreaterThan(0)
    expect(glyphs.cursor.focused).not.toBe(' ')
  })

  it('cursor unfocused is a single space', () => {
    expect(glyphs.cursor.unfocused).toBe(' ')
  })

  it('status glyphs are all distinct', () => {
    const values = Object.values(glyphs.status)
    expect(new Set(values).size).toBe(values.length)
  })

  it('command prefix is /', () => {
    expect(glyphs.commandPrefix).toBe('/')
  })
})
