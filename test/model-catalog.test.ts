import { describe, expect, it } from 'vitest'
import {
  MODEL_CATALOG,
  PROVIDER_DEFAULT_MODEL_LABEL,
  modelDisplayName,
  modelSourceForProvider,
  modelValuesForProvider,
} from '../src/launcher/model-catalog.js'
import { PROVIDERS } from '../src/launcher/providers.js'

describe('model catalog', () => {
  it('adds provider default before provider model files', () => {
    for (const provider of PROVIDERS) {
      const values = modelValuesForProvider(provider)
      expect(values[0]).toBe('')
      expect(values.length).toBeGreaterThan(1)
      expect(modelSourceForProvider(provider)).toMatch(/^curated /)
    }
  })

  it('keeps provider-specific curated model IDs', () => {
    expect(MODEL_CATALOG.cc.models).toEqual(['sonnet', 'opus', 'haiku'])
    expect(MODEL_CATALOG.codex.models).toEqual(['gpt-5-codex', 'gpt-5'])
    expect(MODEL_CATALOG.opencode.models).toContain('anthropic/claude-sonnet-4-5')
    expect(MODEL_CATALOG.hermes.models).toContain('anthropic/claude-sonnet-4')
    expect(MODEL_CATALOG.kimi.models).toEqual(['kimi-code/kimi-for-coding'])
    expect(MODEL_CATALOG.deepseek.models).toContain('deepseek-coder:6.7b')
    expect(MODEL_CATALOG.pi.models).toContain('sonnet')
    expect(MODEL_CATALOG.qwen.models).toContain('qwen3-coder-plus')
    expect(MODEL_CATALOG.aider.models).toContain('deepseek/deepseek-chat')
  })

  it('renders an empty model as the provider default label', () => {
    expect(modelDisplayName('')).toBe(PROVIDER_DEFAULT_MODEL_LABEL)
    expect(modelDisplayName('gpt-5-codex')).toBe('gpt-5-codex')
  })
})
