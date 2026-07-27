// Display utilities: provider/model colors and labels.
// Invariant: providerColor and modelColor always return a valid hex string or named color.
// Secret redaction lives in core/redact.ts.

import type { Provider } from '../core/types.js'
import { PROVIDER_DEFS, PROVIDER_REGISTRY } from '../core/provider-registry.js'

// Model family colors. Kept distinct from the TUI selection cursor
// (tokens.ts accent.bright) so a focused row does not collide visually
// with the cursor; tokens.test.ts pins that invariant.
export const MODEL_COLORS = {
  default:  '#9b9488',  // CLI default or unset model
  claude:   '#e0a06f',  // Claude family
  openai:   '#72b7d6',  // OpenAI family
  deepseek: '#7ac8bc',  // DeepSeek family
  qwen:     '#d1a25d',  // Qwen family
  kimi:     '#d0c268',  // Kimi family
  local:    '#92b37a',  // local/open model family
  other:    '#9ca8bd',  // known provider, unclassified model
} as const

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
  if (!lower) return MODEL_COLORS.default
  if (lower.includes('claude') || lower.includes('sonnet') || lower.includes('opus') || lower.includes('haiku')) return MODEL_COLORS.claude
  if (lower.includes('gpt') || lower.includes('codex') || /\bo[134]\b/.test(lower)) return MODEL_COLORS.openai
  if (lower.includes('deepseek')) return MODEL_COLORS.deepseek
  if (lower.includes('qwen')) return MODEL_COLORS.qwen
  if (lower.includes('kimi') || lower.includes('moonshot')) return MODEL_COLORS.kimi
  if (
    lower.includes('llama') ||
    lower.includes('mistral') ||
    lower.includes('mixtral') ||
    lower.includes('ollama') ||
    lower.includes('lmstudio') ||
    lower.includes('local')
  ) return MODEL_COLORS.local

  if (provider === 'cc') return MODEL_COLORS.claude
  if (provider === 'codex') return MODEL_COLORS.openai
  if (provider === 'deepseek') return MODEL_COLORS.deepseek
  if (provider === 'qwen') return MODEL_COLORS.qwen
  if (provider === 'kimi') return MODEL_COLORS.kimi
  return MODEL_COLORS.other
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
