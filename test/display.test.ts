import { describe, it, expect } from 'vitest'
import { PROVIDERS } from '../src/core/providers.js'
import type { Provider } from '../src/core/types.js'

describe('display utilities', () => {
  describe('providerDisplayName', () => {
    it('renders full provider names for visible UI', async () => {
      const { providerDisplayName } = await import('../src/utils/display.js')
      expect(providerDisplayName('cc')).toBe('Claude Code')
      expect(providerDisplayName('codex')).toBe('Codex CLI')
      expect(providerDisplayName('opencode')).toBe('OpenCode CLI')
    })
  })

  describe('providerColor', () => {
    it('Claude Code returns Claude brand peach hex', async () => {
      const { providerColor } = await import('../src/utils/display.js')
      expect(providerColor('cc')).toBe('#d97757')
    })

    it('codex returns cool teal hex', async () => {
      const { providerColor } = await import('../src/utils/display.js')
      expect(providerColor('codex')).toBe('#7aa8c4')
    })

    it('opencode returns muted purple hex', async () => {
      const { providerColor } = await import('../src/utils/display.js')
      expect(providerColor('opencode')).toBe('#a890d1')
    })

    it('unknown provider returns fallback gray', async () => {
      const { providerColor } = await import('../src/utils/display.js')
      expect(providerColor('unknown' as unknown as Provider)).toBe('gray')
    })

    it('always returns a non-empty string', async () => {
      const { providerColor } = await import('../src/utils/display.js')
      for (const p of PROVIDERS) {
        expect(providerColor(p).length).toBeGreaterThan(0)
      }
    })
  })

  describe('modelColor', () => {
    it('returns a neutral color for CLI default models', async () => {
      const { modelColor } = await import('../src/utils/display.js')
      expect(modelColor('')).toBe('#9b9488')
    })

    it('groups Claude family aliases together', async () => {
      const { modelColor } = await import('../src/utils/display.js')
      expect(modelColor('sonnet')).toBe('#e0a06f')
      expect(modelColor('anthropic/claude-opus-4')).toBe('#e0a06f')
    })

    it('groups OpenAI family model ids together', async () => {
      const { modelColor } = await import('../src/utils/display.js')
      expect(modelColor('openai/gpt-5')).toBe('#72b7d6')
      expect(modelColor('gpt-5-codex')).toBe('#72b7d6')
    })

    it('uses provider fallback for unknown model ids', async () => {
      const { modelColor } = await import('../src/utils/display.js')
      expect(modelColor('latest', 'qwen')).toBe('#d1a25d')
    })
  })

  describe('modelBadgeLabel', () => {
    it('labels empty model as default', async () => {
      const { modelBadgeLabel } = await import('../src/utils/display.js')
      expect(modelBadgeLabel('')).toBe('default')
    })

    it('removes provider prefixes from model labels', async () => {
      const { modelBadgeLabel } = await import('../src/utils/display.js')
      expect(modelBadgeLabel('anthropic/claude-sonnet-4-5')).toBe('claude-sonnet-4-5')
      expect(modelBadgeLabel('deepseek-coder:33b')).toBe('deepseek-coder:33b')
    })
  })
})
