import type { Provider } from '../state/types.js'
import { CC_MODELS, CC_MODEL_SOURCE } from './model-data/cc.js'
import { CODEX_MODELS, CODEX_MODEL_SOURCE } from './model-data/codex.js'
import { OPENCODE_MODELS, OPENCODE_MODEL_SOURCE } from './model-data/opencode.js'
import { HERMES_MODELS, HERMES_MODEL_SOURCE } from './model-data/hermes.js'
import { KIMI_MODELS, KIMI_MODEL_SOURCE } from './model-data/kimi.js'
import { DEEPSEEK_MODELS, DEEPSEEK_MODEL_SOURCE } from './model-data/deepseek.js'
import { PI_MODELS, PI_MODEL_SOURCE } from './model-data/pi.js'
import { QWEN_MODELS, QWEN_MODEL_SOURCE } from './model-data/qwen.js'
import { AIDER_MODELS, AIDER_MODEL_SOURCE } from './model-data/aider.js'

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
  kimi: { source: KIMI_MODEL_SOURCE, models: KIMI_MODELS },
  deepseek: { source: DEEPSEEK_MODEL_SOURCE, models: DEEPSEEK_MODELS },
  pi: { source: PI_MODEL_SOURCE, models: PI_MODELS },
  qwen: { source: QWEN_MODEL_SOURCE, models: QWEN_MODELS },
  aider: { source: AIDER_MODEL_SOURCE, models: AIDER_MODELS },
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
