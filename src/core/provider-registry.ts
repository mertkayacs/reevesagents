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
  GEMINI_MODELS, GEMINI_MODEL_SOURCE,
  CLINE_MODELS, CLINE_MODEL_SOURCE,
  CRUSH_MODELS, CRUSH_MODEL_SOURCE,
  GOOSE_MODELS, GOOSE_MODEL_SOURCE,
  KILO_MODELS, KILO_MODEL_SOURCE,
  LETTA_MODELS, LETTA_MODEL_SOURCE,
  VIBE_MODELS, VIBE_MODEL_SOURCE,
  GROK_MODELS, GROK_MODEL_SOURCE,
  KIRO_MODELS, KIRO_MODEL_SOURCE,
  DROID_MODELS, DROID_MODEL_SOURCE,
  QODER_MODELS, QODER_MODEL_SOURCE,
  WARP_MODELS, WARP_MODEL_SOURCE,
  JUNIE_MODELS, JUNIE_MODEL_SOURCE,
  COPILOT_MODELS, COPILOT_MODEL_SOURCE,
  CURSOR_MODELS, CURSOR_MODEL_SOURCE,
  ROVO_MODELS, ROVO_MODEL_SOURCE,
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
  gemini: {
    id: 'gemini',
    bin: 'gemini',
    displayName: 'Gemini CLI',
    color: '#8b7fe8', // muted blue-violet, the Gemini spark gradient
    aliases: ['gemini', 'gemini cli', 'gemini-cli'],
    models: GEMINI_MODELS,
    modelSource: GEMINI_MODEL_SOURCE,
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
  cline: {
    id: 'cline',
    bin: 'cline',
    displayName: 'Cline CLI',
    color: '#6b9fd6', // muted Cline blue
    aliases: ['cline', 'cline cli', 'cline-cli'],
    models: CLINE_MODELS,
    modelSource: CLINE_MODEL_SOURCE,
    helpRequirements: [
      { feature: 'model selection', tokens: ['--model'] },
      { feature: 'skip permissions', tokens: ['--auto-approve'] },
    ],
    buildArgs: ({ permissions, model }) => {
      // --tui keeps the interactive session running; without it a prompt
      // argument would run one turn and exit.
      const args: string[] = ['--tui']
      if (permissions === 'skip') args.push('--auto-approve', 'true')
      if (model) args.push('--model', model)
      return args
    },
  },
  crush: {
    id: 'crush',
    bin: 'crush',
    displayName: 'Crush',
    color: '#e092b8', // muted Charm pink
    aliases: ['crush', 'charm crush', 'charm-crush'],
    models: CRUSH_MODELS,
    modelSource: CRUSH_MODEL_SOURCE,
    helpRequirements: [
      { feature: 'skip permissions', tokens: ['--yolo'] },
    ],
    buildArgs: ({ permissions }) => {
      // Interactive crush has no --model flag (model is picked in the TUI
      // with /models), so the model knob is not passed to the launch.
      const args: string[] = []
      if (permissions === 'skip') args.push('--yolo')
      return args
    },
  },
  goose: {
    id: 'goose',
    bin: 'goose',
    displayName: 'Goose',
    color: '#b39a80', // muted goose tan
    aliases: ['goose'],
    models: GOOSE_MODELS,
    modelSource: GOOSE_MODEL_SOURCE,
    helpRequirements: [
      { feature: 'interactive session', tokens: ['session'] },
      { feature: 'model selection', tokens: ['--model'] },
    ],
    helpArgs: ['session', '--help'],
    buildArgs: ({ model }) => {
      // Auto-approval has no launch flag; goose reads GOOSE_MODE from its
      // config (auto approves all tool actions), like opencode's entry.
      const args: string[] = ['session']
      if (model) args.push('--model', model)
      return args
    },
  },
  kilo: {
    id: 'kilo',
    bin: 'kilo',
    displayName: 'Kilo Code',
    color: '#c46f6f', // muted soft red
    aliases: ['kilo', 'kilo code', 'kilo-code', 'kilocode'],
    models: KILO_MODELS,
    modelSource: KILO_MODEL_SOURCE,
    helpRequirements: [
      { feature: 'model selection', tokens: ['--model'] },
      { feature: 'skip permissions', tokens: ['--auto'] },
    ],
    buildArgs: ({ permissions, model }) => {
      const args: string[] = []
      if (permissions === 'skip') args.push('--auto')
      if (model) args.push('--model', model)
      return args
    },
  },
  letta: {
    id: 'letta',
    bin: 'letta',
    displayName: 'Letta Code',
    color: '#6fb387', // muted starling green
    aliases: ['letta', 'letta code', 'letta-code'],
    models: LETTA_MODELS,
    modelSource: LETTA_MODEL_SOURCE,
    helpRequirements: [
      { feature: 'fresh conversation', tokens: ['--new'] },
      { feature: 'model selection', tokens: ['--model'] },
    ],
    buildArgs: ({ permissions, model }) => {
      // Bare letta resumes the last conversation for the project; --new always
      // starts a fresh one so a new worker never inherits old context.
      const args: string[] = ['--new']
      // --permission-mode is real but hidden from --help, so doctor cannot require it.
      if (permissions === 'skip') args.push('--permission-mode', 'unrestricted')
      if (model) args.push('--model', model)
      return args
    },
  },
  vibe: {
    id: 'vibe',
    bin: 'vibe',
    displayName: 'Mistral Vibe',
    color: '#e3a35e', // muted Mistral amber
    aliases: ['vibe', 'mistral vibe', 'mistral-vibe', 'mistral'],
    models: VIBE_MODELS,
    modelSource: VIBE_MODEL_SOURCE,
    helpRequirements: [
      { feature: 'skip permissions', tokens: ['--auto-approve'] },
    ],
    buildArgs: ({ permissions }) => {
      // Interactive vibe has no model flag (the model comes from config
      // active_model or VIBE_ACTIVE_MODEL), so the model knob is not passed.
      const args: string[] = []
      if (permissions === 'skip') args.push('--auto-approve')
      return args
    },
  },
  grok: {
    id: 'grok',
    bin: 'grok',
    displayName: 'Grok Build',
    color: '#9a9a96', // muted xAI graphite
    aliases: ['grok', 'grok build', 'grok-build', 'xai'],
    models: GROK_MODELS,
    modelSource: GROK_MODEL_SOURCE,
    helpRequirements: [
      { feature: 'model selection', tokens: ['--model'] },
      { feature: 'skip permissions', tokens: ['--always-approve'] },
    ],
    buildArgs: ({ permissions, model }) => {
      const args: string[] = []
      if (permissions === 'skip') args.push('--always-approve')
      if (model) args.push('--model', model)
      return args
    },
  },
  kiro: {
    id: 'kiro',
    bin: 'kiro-cli',
    displayName: 'Kiro CLI',
    color: '#b070c8', // muted Kiro violet
    aliases: ['kiro', 'kiro cli', 'kiro-cli'],
    models: KIRO_MODELS,
    modelSource: KIRO_MODEL_SOURCE,
    helpRequirements: [
      { feature: 'model selection', tokens: ['--model'] },
      { feature: 'skip permissions', tokens: ['--trust-all-tools'] },
    ],
    helpArgs: ['chat', '--help'],
    buildArgs: ({ permissions, model }) => {
      // The chat subcommand is the interactive session; the task is pasted later.
      const args: string[] = ['chat']
      if (permissions === 'skip') args.push('--trust-all-tools')
      if (model) args.push('--model', model)
      return args
    },
  },
  droid: {
    id: 'droid',
    bin: 'droid',
    displayName: 'Factory Droid',
    color: '#7f8fa3', // muted slate
    aliases: ['droid', 'factory', 'factory droid', 'factory-droid'],
    models: DROID_MODELS,
    modelSource: DROID_MODEL_SOURCE,
    helpRequirements: [
      { feature: 'skip permissions', tokens: ['--auto'] },
    ],
    buildArgs: ({ permissions }) => {
      // Interactive droid sets autonomy with --auto and has no model flag
      // (--skip-permissions-unsafe and --model exist only on `droid exec`).
      const args: string[] = []
      if (permissions === 'skip') args.push('--auto', 'high')
      return args
    },
  },
  qoder: {
    id: 'qoder',
    bin: 'qodercli',
    displayName: 'Qoder CLI',
    color: '#57c785', // muted Qoder green
    aliases: ['qoder', 'qoder cli', 'qoder-cli', 'qodercli'],
    models: QODER_MODELS,
    modelSource: QODER_MODEL_SOURCE,
    helpRequirements: [
      { feature: 'model selection', tokens: ['--model'] },
      { feature: 'skip permissions', tokens: ['--dangerously-skip-permissions'] },
    ],
    buildArgs: ({ permissions, model }) => {
      const args: string[] = []
      if (permissions === 'skip') args.push('--dangerously-skip-permissions')
      if (model) args.push('--model', model)
      return args
    },
  },
  warp: {
    id: 'warp',
    bin: 'warp',
    displayName: 'Warp',
    color: '#4aa3b0', // muted Warp teal
    aliases: ['warp', 'warp agent', 'warp-agent'],
    models: WARP_MODELS,
    modelSource: WARP_MODEL_SOURCE,
    helpRequirements: [
      { feature: 'skip permissions', tokens: ['--auto-approve'] },
    ],
    buildArgs: ({ permissions }) => {
      // The Warp TUI has no model flag (the model is chosen per conversation
      // in the UI), so the model knob is not passed to the launch.
      const args: string[] = []
      if (permissions === 'skip') args.push('--auto-approve')
      return args
    },
  },
  junie: {
    id: 'junie',
    bin: 'junie',
    displayName: 'Junie CLI',
    color: '#a9c256', // muted Junie lime
    aliases: ['junie', 'junie cli', 'junie-cli', 'jetbrains junie'],
    models: JUNIE_MODELS,
    modelSource: JUNIE_MODEL_SOURCE,
    helpRequirements: [
      { feature: 'model selection', tokens: ['--model'] },
      { feature: 'skip permissions', tokens: ['--brave'] },
    ],
    buildArgs: ({ permissions, model }) => {
      // Brave mode runs sensitive actions without approval (interactive only).
      const args: string[] = []
      if (permissions === 'skip') args.push('--brave')
      if (model) args.push('--model', model)
      return args
    },
  },
  copilot: {
    id: 'copilot',
    bin: 'copilot',
    displayName: 'GitHub Copilot CLI',
    color: '#7d8ce8', // muted Copilot indigo
    aliases: ['copilot', 'copilot cli', 'copilot-cli', 'github copilot'],
    models: COPILOT_MODELS,
    modelSource: COPILOT_MODEL_SOURCE,
    helpRequirements: [
      { feature: 'model selection', tokens: ['--model'] },
      { feature: 'skip permissions', tokens: ['--allow-all'] },
    ],
    buildArgs: ({ permissions, model }) => {
      // --allow-all covers tools, paths and URLs; --allow-all-tools alone
      // would still stop at path and URL prompts in the interactive session.
      const args: string[] = []
      if (permissions === 'skip') args.push('--allow-all')
      if (model) args.push('--model', model)
      return args
    },
  },
  cursor: {
    id: 'cursor',
    bin: 'cursor-agent',
    displayName: 'Cursor CLI',
    color: '#cfd8dc', // muted Cursor silver
    aliases: ['cursor', 'cursor cli', 'cursor-cli', 'cursor-agent'],
    models: CURSOR_MODELS,
    modelSource: CURSOR_MODEL_SOURCE,
    helpRequirements: [
      { feature: 'model selection', tokens: ['--model'] },
      { feature: 'skip permissions', tokens: ['--force'] },
    ],
    buildArgs: ({ permissions, model }) => {
      const args: string[] = []
      if (permissions === 'skip') args.push('--force')
      if (model) args.push('--model', model)
      return args
    },
  },
  rovo: {
    id: 'rovo',
    bin: 'acli',
    displayName: 'Rovo Dev CLI',
    color: '#3f7fd0', // muted Atlassian blue
    aliases: ['rovo', 'rovo dev', 'rovo-dev', 'rovodev'],
    models: ROVO_MODELS,
    modelSource: ROVO_MODEL_SOURCE,
    helpRequirements: [
      { feature: 'skip permissions', tokens: ['--yolo'] },
    ],
    helpArgs: ['rovodev', 'run', '--help'],
    buildArgs: ({ permissions }) => {
      // `run` without an instruction is the interactive session. It has no
      // launch model flag (/models in the TUI or agent.modelId in config).
      // The help text is behind Atlassian login, so doctor warns until signed in.
      const args: string[] = ['rovodev', 'run']
      if (permissions === 'skip') args.push('--yolo')
      return args
    },
  },
}

export const PROVIDER_DEFS: readonly ProviderDef[] = Object.values(PROVIDER_REGISTRY)
