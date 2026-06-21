// Display utilities: provider/model colors, color capability checks, secret redaction.
// Invariant: providerColor and modelColor always return a valid hex string or named color.

import type { Provider } from '../core/types.js'
import { PROVIDER_DEFS, PROVIDER_REGISTRY } from '../core/provider-registry.js'
import { colors } from './tokens.js'

// Derived from the provider registry, the single source of truth for provider identity.
export const PROVIDER_DISPLAY_NAMES = Object.fromEntries(
  PROVIDER_DEFS.map(def => [def.id, def.displayName]),
) as Record<Provider, string>

export function providerDisplayName(provider: Provider): string {
  return PROVIDER_DISPLAY_NAMES[provider] ?? provider
}

export function providerColor(p: Provider): string {
  return PROVIDER_REGISTRY[p]?.color ?? 'gray'
}

export function modelColor(model: string, provider?: Provider): string {
  const lower = model.trim().toLowerCase()
  if (!lower) return colors.model.default
  if (lower.includes('claude') || lower.includes('sonnet') || lower.includes('opus') || lower.includes('haiku')) return colors.model.claude
  if (lower.includes('gpt') || lower.includes('codex') || /\bo[134]\b/.test(lower)) return colors.model.openai
  if (lower.includes('deepseek')) return colors.model.deepseek
  if (lower.includes('qwen')) return colors.model.qwen
  if (lower.includes('kimi') || lower.includes('moonshot')) return colors.model.kimi
  if (
    lower.includes('llama') ||
    lower.includes('mistral') ||
    lower.includes('mixtral') ||
    lower.includes('ollama') ||
    lower.includes('lmstudio') ||
    lower.includes('local')
  ) return colors.model.local

  if (provider === 'cc') return colors.model.claude
  if (provider === 'codex') return colors.model.openai
  if (provider === 'deepseek') return colors.model.deepseek
  if (provider === 'qwen') return colors.model.qwen
  if (provider === 'kimi') return colors.model.kimi
  return colors.model.other
}

export function modelBadgeLabel(model: string): string {
  const value = model.trim()
  if (!value) return 'default'

  const slashIdx = value.lastIndexOf('/')
  const label = slashIdx >= 0 && slashIdx < value.length - 1
    ? value.slice(slashIdx + 1)
    : value

  return truncateLabel(label, 24)
}

function truncateLabel(label: string, max: number): string {
  if (label.length <= max) return label
  return `${label.slice(0, Math.max(1, max - 3))}...`
}

// Ordered: longer prefix patterns must come before shorter ones (e.g. sk-ant before sk-)
const SECRET_PATTERNS = [
  /sk-ant-[A-Za-z0-9\-_]{20,}/g,
  /sk-[A-Za-z0-9\-_]{20,}/g,
  /AIza[A-Za-z0-9\-_]{35}/g,
  /gsk_[A-Za-z0-9\-_]{20,}/g,
]

export function redactSecrets(text: string): string {
  let result = text
  for (const pattern of SECRET_PATTERNS) result = result.replace(pattern, '[REDACTED]')
  return result
}
