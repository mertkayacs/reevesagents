// Curated model lists per provider: the raw data the provider registry and the
// model catalog derive from. One block per provider, in registry order.

export const CC_MODEL_SOURCE = 'curated Claude Code aliases'
export const CC_MODELS = [
  'fable',
  'opus',
  'sonnet',
  'haiku',
] as const

export const CODEX_MODEL_SOURCE = 'curated Codex CLI model ids'
export const CODEX_MODELS = [
  'gpt-5.6-sol',
  'gpt-5.5',
  'gpt-5.4-mini',
] as const

export const OPENCODE_MODEL_SOURCE = 'curated OpenCode provider/model ids'
// OpenCode Zen ids (opencode's own recommended provider, CLI-verified) come first,
// then a couple of direct anthropic/openai ids for users who auth those providers.
export const OPENCODE_MODELS = [
  'opencode/claude-sonnet-4-6',
  'opencode/claude-opus-4-8',
  'opencode/gpt-5.2-codex',
  'anthropic/claude-opus-4-8',
  'anthropic/claude-haiku-4-5',
  'openai/gpt-5.5',
] as const

export const HERMES_MODEL_SOURCE = 'curated Hermes model ids'
export const HERMES_MODELS = [
  'anthropic:claude-opus-4-8',
  'anthropic:claude-fable-5',
  'openai-codex:gpt-5.5',
  'openai-codex:gpt-5.4-mini',
] as const

export const KIMI_MODEL_SOURCE = 'curated Kimi Code model aliases'
export const KIMI_MODELS = [
  'kimi-code/k3',
  'kimi-code/kimi-for-coding',
  'kimi-code/kimi-for-coding-highspeed',
] as const

export const DEEPSEEK_MODEL_SOURCE = 'curated DeepSeek CLI model ids'
export const DEEPSEEK_MODELS = [
  'deepseek-v4-pro',
  'deepseek-v4-flash',
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
  'qwen3-coder-next',
] as const

export const AIDER_MODEL_SOURCE = 'curated Aider model aliases'
export const AIDER_MODELS = [
  'sonnet',
  'opus',
  'haiku',
  'deepseek/deepseek-chat',
] as const
