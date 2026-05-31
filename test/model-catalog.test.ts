import { describe, expect, it } from 'vitest'
import {
  MODEL_CATALOG,
  PROVIDER_DEFAULT_MODEL_LABEL,
  modelDisplayName,
  modelSourceForProvider,
  modelValuesForProvider,
} from '../src/launcher/model-catalog.js'
import type { Provider } from '../src/state/types.js'

describe('model catalog', () => {
  it('adds provider default before provider model files', () => {
    const providers: Provider[] = ['cc', 'codex', 'opencode', 'hermes']

    for (const provider of providers) {
      const values = modelValuesForProvider(provider)
      expect(values[0]).toBe('')
      expect(values.length).toBeGreaterThan(1)
      expect(modelSourceForProvider(provider)).toMatch(/^https:\/\//)
    }
  })

  it('keeps provider-specific direct model IDs', () => {
    expect(MODEL_CATALOG.cc.models).toContain('claude-sonnet-4-6')
    expect(MODEL_CATALOG.codex.models).toContain('gpt-5.3-codex')
    expect(MODEL_CATALOG.opencode.models).toContain('openai/gpt-5.3-codex')
    expect(MODEL_CATALOG.hermes.models).toContain('openrouter:anthropic/claude-sonnet-4.6')
  })

  it('renders an empty model as the provider default label', () => {
    expect(modelDisplayName('')).toBe(PROVIDER_DEFAULT_MODEL_LABEL)
    expect(modelDisplayName('gpt-5.3-codex')).toBe('gpt-5.3-codex')
  })
})
