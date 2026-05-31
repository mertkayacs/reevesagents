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
      expect(modelSourceForProvider(provider)).toMatch(/^curated /)
    }
  })

  it('keeps provider-specific curated model IDs', () => {
    expect(MODEL_CATALOG.cc.models).toEqual(['sonnet', 'opus', 'haiku'])
    expect(MODEL_CATALOG.codex.models).toEqual(['gpt-5-codex', 'gpt-5'])
    expect(MODEL_CATALOG.opencode.models).toContain('anthropic/claude-sonnet-4-5')
    expect(MODEL_CATALOG.hermes.models).toContain('anthropic/claude-sonnet-4')
  })

  it('renders an empty model as the provider default label', () => {
    expect(modelDisplayName('')).toBe(PROVIDER_DEFAULT_MODEL_LABEL)
    expect(modelDisplayName('gpt-5-codex')).toBe('gpt-5-codex')
  })
})
