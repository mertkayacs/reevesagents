import type { Provider } from '../state/types.js'
import { CC_MODELS, CC_MODEL_SOURCE } from './model-data/cc.js'
import { CODEX_MODELS, CODEX_MODEL_SOURCE } from './model-data/codex.js'
import { OPENCODE_MODELS, OPENCODE_MODEL_SOURCE } from './model-data/opencode.js'
import { HERMES_MODELS, HERMES_MODEL_SOURCE } from './model-data/hermes.js'

interface ProviderModelCatalog {
  source: string
  models: readonly string[]
}

export const PROVIDER_DEFAULT_MODEL = ''
export const PROVIDER_DEFAULT_MODEL_LABEL = 'provider default'

export const MODEL_CATALOG: Record<Provider, ProviderModelCatalog> = {
  cc: { source: CC_MODEL_SOURCE, models: CC_MODELS },
  codex: { source: CODEX_MODEL_SOURCE, models: CODEX_MODELS },
  opencode: { source: OPENCODE_MODEL_SOURCE, models: OPENCODE_MODELS },
  hermes: { source: HERMES_MODEL_SOURCE, models: HERMES_MODELS },
}

export function modelValuesForProvider(provider: Provider): readonly string[] {
  return [PROVIDER_DEFAULT_MODEL, ...MODEL_CATALOG[provider].models]
}

export function modelDisplayName(model: string): string {
  return model || PROVIDER_DEFAULT_MODEL_LABEL
}

export function modelSourceForProvider(provider: Provider): string {
  return MODEL_CATALOG[provider].source
}
