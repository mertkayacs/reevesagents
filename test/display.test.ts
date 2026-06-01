import { describe, it, expect } from 'vitest'
import { PROVIDERS } from '../src/launcher/providers.js'
import type { Provider } from '../src/state/types.js'

describe('display utilities', () => {
  describe('providerColor', () => {
    it('cc returns Claude brand peach hex', async () => {
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

  describe('redactSecrets', () => {
    it('replaces anthropic keys with [REDACTED]', async () => {
      const { redactSecrets } = await import('../src/utils/display.js')
      const input = 'auth: sk-ant-api03-abcdef1234567890abcdef1234567890 trailing'
      expect(redactSecrets(input)).toBe('auth: [REDACTED] trailing')
    })

    it('replaces openai-shaped keys with [REDACTED]', async () => {
      const { redactSecrets } = await import('../src/utils/display.js')
      const input = 'token=sk-proj1234567890abcdefghij1234567890'
      expect(redactSecrets(input)).toContain('[REDACTED]')
      expect(redactSecrets(input)).not.toContain('sk-proj')
    })

    it('replaces google api keys with [REDACTED]', async () => {
      const { redactSecrets } = await import('../src/utils/display.js')
      // pattern requires exactly 35 chars after AIza
      const input = 'key=AIzaSyA1234567890abcdefghijklmnopqrstuv'
      expect(redactSecrets(input)).toBe('key=[REDACTED]')
    })

    it('replaces groq keys with [REDACTED]', async () => {
      const { redactSecrets } = await import('../src/utils/display.js')
      const input = 'GROQ=gsk_abcdefghij1234567890abcdef'
      expect(redactSecrets(input)).toContain('[REDACTED]')
    })

    it('leaves clean text alone', async () => {
      const { redactSecrets } = await import('../src/utils/display.js')
      const input = 'just a normal task description'
      expect(redactSecrets(input)).toBe(input)
    })

    it('is idempotent on already-redacted text', async () => {
      const { redactSecrets } = await import('../src/utils/display.js')
      const once = redactSecrets('sk-ant-abcdefghij1234567890abcd')
      const twice = redactSecrets(once)
      expect(twice).toBe(once)
    })
  })
})
