import type { Provider } from '../state/types.js'
import { PROVIDER_DEFS } from './provider-registry.js'

interface ProviderModelCatalog {
  source: string
  models: readonly string[]
}

export const PROVIDER_DEFAULT_MODEL = ''
export const PROVIDER_DEFAULT_MODEL_LABEL = 'provider default'

// Derived from the provider registry: each provider's curated model list and the
// human note describing where that list comes from.
export const MODEL_CATALOG = Object.fromEntries(
  PROVIDER_DEFS.map(def => [def.id, { source: def.modelSource, models: def.models }]),
) as Record<Provider, ProviderModelCatalog>

export function modelValuesForProvider(provider: Provider): readonly string[] {
  return [PROVIDER_DEFAULT_MODEL, ...MODEL_CATALOG[provider].models]
}

export function modelDisplayName(model: string): string {
  return model || PROVIDER_DEFAULT_MODEL_LABEL
}

export function modelSourceForProvider(provider: Provider): string {
  return MODEL_CATALOG[provider].source
}
