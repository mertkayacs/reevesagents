import { afterEach, describe, expect, it } from 'vitest'

describe('theme', () => {
  const original = process.env.REEVES_THEME

  afterEach(() => {
    process.env.REEVES_THEME = original
  })

  it('themeMode defaults to dark', async () => {
    delete process.env.REEVES_THEME
    const { themeMode } = await import('../../src/utils/theme.js')
    expect(themeMode()).toBe('dark')
  })

  it('themeMode honors REEVES_THEME=light', async () => {
    process.env.REEVES_THEME = 'light'
    const { themeMode } = await import('../../src/utils/theme.js')
    expect(themeMode()).toBe('light')
  })

  it('colorLevel returns a number 0-3', async () => {
    const { colorLevel } = await import('../../src/utils/theme.js')
    const level = colorLevel()
    expect(typeof level).toBe('number')
    expect(level).toBeGreaterThanOrEqual(0)
    expect(level).toBeLessThanOrEqual(3)
  })
})
