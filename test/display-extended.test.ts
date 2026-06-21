import { describe, it, expect } from 'vitest'
import { PROVIDERS } from '../src/core/providers.js'

describe('providerColor — extended providers', () => {
  it('hermes returns muted rose hex', async () => {
    const { providerColor } = await import('../src/utils/display.js')
    expect(providerColor('hermes')).toBe('#c97b9b')
  })

  it('all focused providers return distinct colors', async () => {
    const { providerColor } = await import('../src/utils/display.js')
    const colors = PROVIDERS.map(providerColor)
    const unique = new Set(colors)
    expect(unique.size).toBe(PROVIDERS.length)
  })

  it('all focused providers return non-empty strings', async () => {
    const { providerColor } = await import('../src/utils/display.js')
    for (const p of PROVIDERS) {
      const color = providerColor(p)
      expect(typeof color).toBe('string')
      expect(color.length).toBeGreaterThan(0)
    }
  })
})
