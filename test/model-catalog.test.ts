import { describe, expect, it } from 'vitest'
import {
  MODEL_CATALOG,
  PROVIDER_DEFAULT_MODEL_LABEL,
  modelDisplayName,
  modelSourceForProvider,
  modelValuesForProvider,
} from '../src/core/model-catalog.js'
import { PROVIDERS } from '../src/core/providers.js'

// Providers whose interactive launch has no model flag: the picker offers
// only the provider default, and the source note says where the model is set.
const NO_LAUNCH_MODEL_FLAG = ['crush', 'vibe', 'warp', 'rovo', 'droid'] as const

describe('model catalog', () => {
  it('adds provider default before provider model files', () => {
    for (const provider of PROVIDERS) {
      const values = modelValuesForProvider(provider)
      expect(values[0]).toBe('')
      if ((NO_LAUNCH_MODEL_FLAG as readonly string[]).includes(provider)) {
        expect(values).toEqual([''])
        expect(modelSourceForProvider(provider)).toMatch(/no model flag$/)
      } else {
        expect(values.length).toBeGreaterThan(1)
        expect(modelSourceForProvider(provider)).toMatch(/^curated /)
      }
    }
  })

  it('keeps provider-specific curated model IDs', () => {
    expect(MODEL_CATALOG.cc.models).toEqual(['fable', 'opus', 'sonnet', 'haiku'])
    expect(MODEL_CATALOG.codex.models).toEqual(['gpt-5.6-sol', 'gpt-5.5', 'gpt-5.4-mini'])
    expect(MODEL_CATALOG.opencode.models).toContain('anthropic/claude-opus-4-8')
    expect(MODEL_CATALOG.hermes.models).toContain('anthropic:claude-opus-4-8')
    expect(MODEL_CATALOG.kimi.models).toEqual(['kimi-code/k3', 'kimi-code/kimi-for-coding', 'kimi-code/kimi-for-coding-highspeed'])
    expect(MODEL_CATALOG.deepseek.models).toContain('deepseek-v4-pro')
    expect(MODEL_CATALOG.pi.models).toContain('sonnet')
    expect(MODEL_CATALOG.qwen.models).toContain('qwen3-coder-plus')
    expect(MODEL_CATALOG.aider.models).toContain('deepseek/deepseek-chat')
    expect(MODEL_CATALOG.gemini.models).toEqual(['gemini-3.1-pro-preview', 'gemini-3.5-flash', 'gemini-3.1-flash-lite'])
    expect(MODEL_CATALOG.cline.models).toContain('anthropic/claude-sonnet-4-6')
    expect(MODEL_CATALOG.crush.models).toEqual([])
    expect(MODEL_CATALOG.goose.models).toContain('claude-sonnet-4-6')
    expect(MODEL_CATALOG.kilo.models).toContain('kilo/~anthropic/claude-sonnet-latest')
    expect(MODEL_CATALOG.letta.models).toContain('zai-org/GLM-5.3-max')
    expect(MODEL_CATALOG.vibe.models).toEqual([])
    expect(MODEL_CATALOG.grok.models).toEqual(['grok-4.6', 'grok-4.5', 'grok-4.7'])
    expect(MODEL_CATALOG.kiro.models).toEqual(['claude-sonnet-4.6', 'claude-opus-4.7', 'claude-opus-4.6'])
    expect(MODEL_CATALOG.droid.models).toEqual([])
    expect(MODEL_CATALOG.qoder.models).toEqual(['auto', 'performance', 'lite'])
    expect(MODEL_CATALOG.warp.models).toEqual([])
    expect(MODEL_CATALOG.junie.models).toEqual(['sonnet', 'opus', 'gpt-sol'])
    expect(MODEL_CATALOG.copilot.models).toEqual(['auto', 'gpt-5.4', 'claude-opus-4.8'])
    expect(MODEL_CATALOG.cursor.models).toEqual(['gpt-5', 'sonnet-4-thinking', 'claude-opus-4-8'])
    expect(MODEL_CATALOG.rovo.models).toEqual([])
  })

  it('renders an empty model as the provider default label', () => {
    expect(modelDisplayName('')).toBe(PROVIDER_DEFAULT_MODEL_LABEL)
    expect(modelDisplayName('gpt-5.5')).toBe('gpt-5.5')
  })
})
