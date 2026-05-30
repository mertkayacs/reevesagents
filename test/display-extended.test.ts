import { describe, it, expect } from 'vitest'
import type { Provider } from '../src/state/types.js'

describe('providerColor — extended providers', () => {
  it('hermes returns muted rose hex', async () => {
    const { providerColor } = await import('../src/utils/display.js')
    expect(providerColor('hermes')).toBe('#c97b9b')
  })

  it('all focused providers return distinct colors', async () => {
    const { providerColor } = await import('../src/utils/display.js')
    const providers: Provider[] = ['cc', 'codex', 'opencode', 'hermes']
    const colors = providers.map(providerColor)
    const unique = new Set(colors)
    expect(unique.size).toBe(providers.length)
  })

  it('all focused providers return non-empty strings', async () => {
    const { providerColor } = await import('../src/utils/display.js')
    const providers: Provider[] = ['cc', 'codex', 'opencode', 'hermes']
    for (const p of providers) {
      const color = providerColor(p)
      expect(typeof color).toBe('string')
      expect(color.length).toBeGreaterThan(0)
    }
  })
})
