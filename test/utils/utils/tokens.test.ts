import { describe, it, expect } from 'vitest'
import { colors, sep, space } from '../../src/utils/tokens.js'
import { glyphs } from '../../src/utils/glyphs.js'

describe('tokens', () => {
  it('every provider color is distinct from accent.primary', () => {
    const accent = colors.accent.primary
    for (const provider of Object.keys(colors.provider) as Array<keyof typeof colors.provider>) {
      expect(colors.provider[provider]).not.toBe(accent)
    }
  })

  it('every provider color is distinct from accent.bright (selection cursor)', () => {
    const cursor = colors.accent.bright
    for (const provider of Object.keys(colors.provider) as Array<keyof typeof colors.provider>) {
      expect(colors.provider[provider]).not.toBe(cursor)
    }
  })

  it('every provider color is unique', () => {
    const values = Object.values(colors.provider)
    expect(new Set(values).size).toBe(values.length)
  })

  it('cc provider is Anthropic Orange #d97757 (Claude brand)', () => {
    expect(colors.provider.cc).toBe('#d97757')
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
