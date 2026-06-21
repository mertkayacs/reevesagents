// Curated model lists per provider: the raw data the provider registry and the
// model catalog derive from. One block per provider, in registry order.

export const CC_MODEL_SOURCE = 'curated Claude Code aliases'
export const CC_MODELS = [
  'sonnet',
  'opus',
  'haiku',
] as const

export const CODEX_MODEL_SOURCE = 'curated Codex CLI model ids'
export const CODEX_MODELS = [
  'gpt-5-codex',
  'gpt-5',
] as const

export const OPENCODE_MODEL_SOURCE = 'curated OpenCode provider/model ids'
export const OPENCODE_MODELS = [
  'anthropic/claude-sonnet-4-5',
  'anthropic/claude-opus-4-1',
  'anthropic/claude-haiku-4-5',
  'openai/gpt-5-codex',
  'openai/gpt-5',
] as const

export const HERMES_MODEL_SOURCE = 'curated Hermes model ids'
export const HERMES_MODELS = [
  'anthropic/claude-sonnet-4',
  'anthropic/claude-opus-4',
  'anthropic/claude-haiku-4-5',
  'openai/gpt-5',
] as const

export const KIMI_MODEL_SOURCE = 'curated Kimi Code model aliases'
export const KIMI_MODELS = [
  'kimi-code/kimi-for-coding',
] as const

export const DEEPSEEK_MODEL_SOURCE = 'curated DeepSeek CLI model ids'
export const DEEPSEEK_MODELS = [
  'deepseek-coder:6.7b',
  'deepseek-coder:1.3b',
  'deepseek-coder:33b',
] as const

export const PI_MODEL_SOURCE = 'curated Pi model aliases'
export const PI_MODELS = [
  'sonnet',
  'opus',
  'deepseek/deepseek-chat',
  'openai/gpt-4o',
] as const

export const QWEN_MODEL_SOURCE = 'curated Qwen Code model ids'
export const QWEN_MODELS = [
  'qwen3-coder-plus',
  'qwen3-coder-flash',
] as const

export const AIDER_MODEL_SOURCE = 'curated Aider model aliases'
export const AIDER_MODELS = [
  'sonnet',
  'opus',
  'haiku',
  'deepseek/deepseek-chat',
] as const
