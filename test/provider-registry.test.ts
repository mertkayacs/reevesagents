import { describe, it, expect } from 'vitest'
import { PROVIDER_REGISTRY, PROVIDER_DEFS } from '../src/core/provider-registry.js'
import { PROVIDERS, BIN, buildCommand, helpCommand, normalizeProvider } from '../src/core/providers.js'
import { providerColor, providerDisplayName, PROVIDER_DISPLAY_NAMES } from '../src/utils/display.js'
import { MODEL_CATALOG } from '../src/core/model-catalog.js'
import { colors } from '../src/utils/tokens.js'

describe('provider registry', () => {
  it('has a complete, self-consistent entry for every provider', () => {
    for (const provider of PROVIDERS) {
      const def = PROVIDER_REGISTRY[provider]
      expect(def, `missing registry entry for ${provider}`).toBeDefined()
      expect(def.id).toBe(provider)
      expect(def.bin.length).toBeGreaterThan(0)
      expect(def.displayName.length).toBeGreaterThan(0)
      expect(def.color).toMatch(/^#[0-9a-fA-F]{6}$/)
      expect(def.aliases).toContain(provider) // the id is always an alias of itself
      expect(Array.isArray(def.models)).toBe(true)
      expect(def.modelSource.length).toBeGreaterThan(0)
      expect(def.helpRequirements.length).toBeGreaterThan(0)
      for (const req of def.helpRequirements) {
        expect(req.feature.length).toBeGreaterThan(0)
        expect(req.tokens.length).toBeGreaterThan(0)
      }
    }
  })

  it('iterates in a stable order matching PROVIDERS', () => {
    expect(PROVIDER_DEFS.map(def => def.id)).toEqual(PROVIDERS)
  })

  it('derives the public lookups from the registry without drift', () => {
    for (const provider of PROVIDERS) {
      const def = PROVIDER_REGISTRY[provider]
      expect(BIN[provider]).toBe(def.bin)
      expect(providerDisplayName(provider)).toBe(def.displayName)
      expect(PROVIDER_DISPLAY_NAMES[provider]).toBe(def.displayName)
      expect(providerColor(provider)).toBe(def.color)
      expect(MODEL_CATALOG[provider].models).toEqual(def.models)
      expect(MODEL_CATALOG[provider].source).toBe(def.modelSource)
      expect(buildCommand({ provider, permissions: 'ask', model: '' })[0]).toBe(def.bin)
      expect(helpCommand(provider)[0]).toBe(def.bin)
    }
  })

  it('aliases are lowercase, collision-free, and normalize back to their provider', () => {
    const seen = new Map<string, string>()
    for (const def of PROVIDER_DEFS) {
      for (const alias of def.aliases) {
        expect(alias).toBe(alias.toLowerCase())
        expect(seen.has(alias), `alias "${alias}" is claimed by ${seen.get(alias)} and ${def.id}`).toBe(false)
        seen.set(alias, def.id)
        expect(normalizeProvider(alias)).toBe(def.id)
      }
    }
  })

  it('provider colors are unique and distinct from the accent/cursor colors', () => {
    const used = PROVIDER_DEFS.map(def => def.color)
    expect(new Set(used).size).toBe(used.length)
    for (const def of PROVIDER_DEFS) {
      expect(def.color).not.toBe(colors.accent.primary)
      expect(def.color).not.toBe(colors.accent.bright) // the selection cursor color
    }
    expect(PROVIDER_REGISTRY.cc.color).toBe('#d97757') // Anthropic Orange (Claude brand)
  })
})
