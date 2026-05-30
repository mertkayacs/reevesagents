import { describe, expect, it } from 'vitest'
import { DUCK_RENDERED } from '../../src/brand/duck-rendered.js'

const ESC = String.fromCharCode(27)
const CSI = `${ESC}[`

describe('rendered duck', () => {
  it('contains all four variants', () => {
    expect(DUCK_RENDERED.hero).toBeDefined()
    expect(DUCK_RENDERED.single).toBeDefined()
    expect(DUCK_RENDERED.duckling).toBeDefined()
    expect(DUCK_RENDERED.mini).toBeDefined()
  })

  it('each variant is non-empty', () => {
    for (const variant of Object.values(DUCK_RENDERED)) {
      expect(variant.length).toBeGreaterThan(0)
    }
  })

  it('each variant contains ANSI color escapes', () => {
    for (const variant of Object.values(DUCK_RENDERED)) {
      expect(variant.includes(CSI)).toBe(true)
    }
  })

  it('hero has more rows than single, single has more than duckling', () => {
    const heroRows = DUCK_RENDERED.hero.split('\n').length
    const singleRows = DUCK_RENDERED.single.split('\n').length
    const ducklingRows = DUCK_RENDERED.duckling.split('\n').length
    const miniRows = DUCK_RENDERED.mini.split('\n').length
    expect(heroRows).toBeGreaterThan(singleRows)
    expect(singleRows).toBeGreaterThan(ducklingRows)
    expect(ducklingRows).toBeGreaterThan(miniRows)
  })

  it('does not contain the cursor show/hide escape codes (stripped at render time)', () => {
    for (const variant of Object.values(DUCK_RENDERED)) {
      expect(variant.includes(`${CSI}?25l`)).toBe(false)
      expect(variant.includes(`${CSI}?25h`)).toBe(false)
    }
  })
})
