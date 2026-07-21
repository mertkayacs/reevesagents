// Single source of truth for every provider reevesagents can launch and control.
// One entry per provider holds its identity (binary, display name, brand color,
// aliases), its curated model list, the CLI features we require, and how to build
// the launch arguments. Everything the rest of the app uses (BIN, PROVIDERS, the
// alias map, the model catalog, display names, provider colors) is derived from
// this map, so adding a provider is one entry here instead of edits across six files.

import type { Provider, Permissions, AuthMode, Effort } from './types.js'
import {
  CC_MODELS, CC_MODEL_SOURCE,
  CODEX_MODELS, CODEX_MODEL_SOURCE,
  OPENCODE_MODELS, OPENCODE_MODEL_SOURCE,
  HERMES_MODELS, HERMES_MODEL_SOURCE,
  KIMI_MODELS, KIMI_MODEL_SOURCE,
  DEEPSEEK_MODELS, DEEPSEEK_MODEL_SOURCE,
  PI_MODELS, PI_MODEL_SOURCE,
  QWEN_MODELS, QWEN_MODEL_SOURCE,
  AIDER_MODELS, AIDER_MODEL_SOURCE,
} from './model-data.js'

// The user-chosen knobs that shape a launch. The provider is implicit: each entry
// builds its own args, so only these are passed in.
export interface BuildArgsOptions {
  permissions: Permissions
  model: string
  auth_mode: AuthMode
  effort: Effort
}

// A CLI feature we need from a provider, identified by tokens that must all appear
// in its --help output. Drives the doctor/compatibility checks.
export interface HelpRequirement {
  feature: string
  tokens: string[]
}

export interface ProviderDef {
  id: Provider
  bin: string
  displayName: string
  color: string
  // Lowercase names that normalize to this provider; always includes the id itself.
  aliases: readonly string[]
  models: readonly string[]
  modelSource: string
  helpRequirements: readonly HelpRequirement[]
  // Launch knobs this provider honors. UI surfaces read these so their auth-mode
  // and effort pickers never drift from buildArgs; absent means no launch effect.
  supportsAuthMode?: boolean
  supportsEffort?: boolean
  // Launch args after the binary. Excludes the binary name itself.
  buildArgs: (_opts: BuildArgsOptions) => string[]
  // Args for the --help inspection, after the binary. Defaults to ['--help'].
  helpArgs?: readonly string[]
}

// Hermes addresses a model as `provider:model`. Only a known provider prefix is
// split out; anything else (including model ids that happen to contain a colon)
// is treated as a bare model name.
const HERMES_PROVIDER_PREFIXES = new Set([
  'auto', 'openrouter', 'nous', 'openai-codex', 'copilot-acp', 'copilot', 'anthropic',
  'huggingface', 'novita', 'zai', 'kimi-coding', 'kimi-coding-cn', 'minimax', 'minimax-cn',
  'minimax-oauth', 'kilocode', 'xiaomi', 'arcee', 'gmi', 'alibaba', 'alibaba-coding-plan',
  'deepseek', 'nvidia', 'ollama-cloud', 'xai', 'xai-oauth', 'qwen-oauth', 'bedrock',
  'opencode-zen', 'opencode-go', 'azure-foundry', 'lmstudio', 'stepfun',
  'tencent-tokenhub', 'custom',
])

function parseHermesModel(value: string): { provider?: string; model: string } {
  const separator = value.indexOf(':')
  if (separator <= 0) return { model: value }

  const provider = value.slice(0, separator).trim()
  const model = value.slice(separator + 1).trim()
  if (!provider || !model || !HERMES_PROVIDER_PREFIXES.has(provider)) return { model: value }

  return { provider, model }
}

// Insertion order here is the canonical provider order used by PROVIDERS and every
// UI list derived from it.
export const PROVIDER_REGISTRY: Record<Provider, ProviderDef> = {
  cc: {
    id: 'cc',
    bin: 'claude',
    displayName: 'Claude Code',
    color: '#d97757', // Anthropic Orange (Claude brand); the one warm color in the palette
    aliases: ['cc', 'claude', 'claude code', 'claude-code', 'claudecode'],
    models: CC_MODELS,
    modelSource: CC_MODEL_SOURCE,
    helpRequirements: [
      { feature: 'skip permissions', tokens: ['--dangerously-skip-permissions'] },
    ],
    supportsAuthMode: true,
    supportsEffort: true,
    buildArgs: ({ permissions, model, auth_mode, effort }) => {
      const args: string[] = []
      if (permissions === 'skip') args.push('--dangerously-skip-permissions')
      if (auth_mode === 'api-key') args.push('--bare')
      if (effort !== 'default') args.push('--effort', effort)
      if (model) args.push('--model', model)
      // RC injected via send-keys after startup; not a launch flag for Claude Code.
      return args
    },
  },
  codex: {
    id: 'codex',
    bin: 'codex',
    displayName: 'Codex CLI',
    color: '#7aa8c4', // cool teal-blue
    aliases: ['codex', 'codex cli', 'codex-cli'],
    models: CODEX_MODELS,
    modelSource: CODEX_MODEL_SOURCE,
    helpRequirements: [
      { feature: 'skip permissions', tokens: ['--dangerously-bypass-approvals-and-sandbox'] },
      { feature: 'config override', tokens: ['--config'] },
    ],
    supportsEffort: true,
    buildArgs: ({ permissions, model, effort }) => {
      const args: string[] = []
      if (permissions === 'skip') args.push('--dangerously-bypass-approvals-and-sandbox')
      if (effort !== 'default') {
        // Codex sets reasoning effort through a config override, not a flag. It
        // accepts minimal|low|medium|high|xhigh; reeves 'max' has no codex level, so
        // map it to the highest codex effort instead of failing the launch on it.
        const codexEffort = effort === 'max' ? 'xhigh' : effort
        args.push('-c', `model_reasoning_effort=${codexEffort}`)
      }
      if (model) args.push('--model', model)
      return args
    },
  },
  opencode: {
    id: 'opencode',
    bin: 'opencode',
    displayName: 'OpenCode CLI',
    color: '#a890d1', // muted purple
    aliases: ['opencode', 'opencode cli', 'opencode-cli', 'open_code'],
    models: OPENCODE_MODELS,
    modelSource: OPENCODE_MODEL_SOURCE,
    helpRequirements: [
      { feature: 'prompt launch', tokens: ['--prompt'] },
      { feature: 'model selection', tokens: ['--model'] },
    ],
    buildArgs: ({ model }) => {
      const args: string[] = []
      if (model) args.push('--model', model)
      return args
    },
  },
  hermes: {
    id: 'hermes',
    bin: 'hermes',
    displayName: 'Hermes',
    color: '#c97b9b', // muted rose
    aliases: ['hermes'],
    models: HERMES_MODELS,
    modelSource: HERMES_MODEL_SOURCE,
    helpRequirements: [
      { feature: 'chat launch', tokens: ['--model'] },
      { feature: 'skip permissions', tokens: ['--yolo'] },
    ],
    helpArgs: ['chat', '--help'],
    buildArgs: ({ permissions, model }) => {
      const args: string[] = ['chat']
      if (permissions === 'skip') args.push('--yolo')
      if (model) {
        const parsed = parseHermesModel(model)
        if (parsed.provider) args.push('--provider', parsed.provider)
        args.push('--model', parsed.model)
      }
      return args
    },
  },
  kimi: {
    id: 'kimi',
    bin: 'kimi',
    displayName: 'Kimi Code',
    color: '#b6a45d', // muted gold
    aliases: ['kimi', 'kimi code', 'kimi-code'],
    models: KIMI_MODELS,
    modelSource: KIMI_MODEL_SOURCE,
    helpRequirements: [
      { feature: 'model selection', tokens: ['--model'] },
      { feature: 'skip permissions', tokens: ['--yolo'] },
    ],
    buildArgs: ({ permissions, model }) => {
      const args: string[] = []
      if (permissions === 'skip') args.push('--yolo')
      if (model) args.push('--model', model)
      return args
    },
  },
  deepseek: {
    id: 'deepseek',
    bin: 'deepseek',
    displayName: 'DeepSeek CLI',
    color: '#6fb0a8', // muted cyan
    aliases: ['deepseek', 'deepseek cli', 'deepseek-cli'],
    models: DEEPSEEK_MODELS,
    modelSource: DEEPSEEK_MODEL_SOURCE,
    helpRequirements: [
      { feature: 'model selection', tokens: ['--model'] },
    ],
    buildArgs: ({ model }) => {
      const args: string[] = []
      if (model) args.push('--model', model)
      return args
    },
  },
  pi: {
    id: 'pi',
    bin: 'pi',
    displayName: 'Pi',
    color: '#86a76b', // muted olive
    aliases: ['pi'],
    models: PI_MODELS,
    modelSource: PI_MODEL_SOURCE,
    helpRequirements: [
      { feature: 'model selection', tokens: ['--model'] },
    ],
    buildArgs: ({ model }) => {
      const args: string[] = []
      if (model) args.push('--model', model)
      return args
    },
  },
  qwen: {
    id: 'qwen',
    bin: 'qwen',
    displayName: 'Qwen Code',
    color: '#c58c63', // muted copper
    aliases: ['qwen', 'qwen code', 'qwen-code'],
    models: QWEN_MODELS,
    modelSource: QWEN_MODEL_SOURCE,
    helpRequirements: [
      { feature: 'model selection', tokens: ['--model'] },
      { feature: 'skip permissions', tokens: ['--approval-mode'] },
    ],
    buildArgs: ({ permissions, model }) => {
      const args: string[] = []
      if (permissions === 'skip') args.push('--approval-mode', 'yolo')
      if (model) args.push('--model', model)
      return args
    },
  },
  aider: {
    id: 'aider',
    bin: 'aider',
    displayName: 'Aider',
    color: '#8fa6d4', // muted periwinkle
    aliases: ['aider'],
    models: AIDER_MODELS,
    modelSource: AIDER_MODEL_SOURCE,
    helpRequirements: [
      { feature: 'model selection', tokens: ['--model'] },
      { feature: 'skip confirmations', tokens: ['--yes-always'] },
    ],
    buildArgs: ({ permissions, model }) => {
      const args: string[] = []
      if (permissions === 'skip') args.push('--yes-always')
      if (model) args.push('--model', model)
      return args
    },
  },
}

export const PROVIDER_DEFS: readonly ProviderDef[] = Object.values(PROVIDER_REGISTRY)
