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

export const GEMINI_MODEL_SOURCE = 'curated Gemini CLI model ids'
export const GEMINI_MODELS = [
  'gemini-3.1-pro-preview',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
] as const

export const CLINE_MODEL_SOURCE = 'curated Cline CLI model ids'
export const CLINE_MODELS = [
  'anthropic/claude-sonnet-4-6',
  'anthropic/claude-opus-4-8',
  'google/gemini-3.1-pro',
] as const

export const CRUSH_MODEL_SOURCE = 'chosen inside Crush (its TUI model picker); the launch has no model flag'
export const CRUSH_MODELS = [] as const

export const GOOSE_MODEL_SOURCE = 'curated Goose model ids'
export const GOOSE_MODELS = [
  'claude-sonnet-4-6',
  'claude-opus-4-8',
  'deepseek-v4-pro',
] as const

export const KILO_MODEL_SOURCE = 'curated Kilo Code model ids'
export const KILO_MODELS = [
  'kilo/~anthropic/claude-sonnet-latest',
  'kilo/~anthropic/claude-opus-latest',
  'kilo/~google/gemini-pro-latest',
  'kilo/~openai/gpt-sol-latest',
] as const

export const LETTA_MODEL_SOURCE = 'curated Letta Code model ids'
export const LETTA_MODELS = [
  'zai-org/GLM-5.3-max',
  'moonshotai/Kimi-K2-Instruct',
  'Qwen/Qwen3-Coder-480B-A35B-Instruct',
] as const

export const VIBE_MODEL_SOURCE = 'set in vibe config (active_model or VIBE_ACTIVE_MODEL); the launch has no model flag'
export const VIBE_MODELS = [] as const

export const GROK_MODEL_SOURCE = 'curated Grok Build model ids'
export const GROK_MODELS = [
  'grok-4.6',
  'grok-4.5',
  'grok-4.7',
] as const

export const KIRO_MODEL_SOURCE = 'curated Kiro CLI model ids'
export const KIRO_MODELS = [
  'claude-sonnet-4.6',
  'claude-opus-4.7',
  'claude-opus-4.6',
] as const

export const DROID_MODEL_SOURCE = 'chosen inside Factory Droid itself; the launch has no model flag'
export const DROID_MODELS = [] as const

export const QODER_MODEL_SOURCE = 'curated Qoder CLI model ids'
export const QODER_MODELS = [
  'auto',
  'performance',
  'lite',
] as const

export const WARP_MODEL_SOURCE = 'chosen inside the Warp TUI; the launch has no model flag'
export const WARP_MODELS = [] as const

export const JUNIE_MODEL_SOURCE = 'curated Junie CLI model ids'
export const JUNIE_MODELS = [
  'sonnet',
  'opus',
  'gpt-sol',
] as const

export const COPILOT_MODEL_SOURCE = 'curated GitHub Copilot CLI model ids'
export const COPILOT_MODELS = [
  'auto',
  'gpt-5.4',
  'claude-opus-4.8',
] as const

export const CURSOR_MODEL_SOURCE = 'curated Cursor CLI model ids'
export const CURSOR_MODELS = [
  'gpt-5',
  'sonnet-4-thinking',
  'claude-opus-4-8',
] as const

export const ROVO_MODEL_SOURCE = 'set in Rovo Dev itself (/models or agent.modelId in config); the launch has no model flag'
export const ROVO_MODELS = [] as const
