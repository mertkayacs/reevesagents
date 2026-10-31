import { describe, it, expect } from 'vitest'
import { buildCommand, coerceExtraArgs, helpCommand, missingHelpFeatures, normalizeProvider, PROVIDERS } from '../src/core/providers.js'
import type { BuildCommandOptions } from '../src/core/providers.js'
import type { Provider } from '../src/core/types.js'

describe('providers', () => {
  describe('coerceExtraArgs', () => {
    it('splits a string on whitespace', () => {
      expect(coerceExtraArgs('--remote-control --foo bar')).toEqual(['--remote-control', '--foo', 'bar'])
    })
    it('passes an array through, trimming and dropping blanks', () => {
      expect(coerceExtraArgs([' --foo ', '', 'bar'])).toEqual(['--foo', 'bar'])
    })
    it('treats blank, undefined, and non-strings as no flags', () => {
      expect(coerceExtraArgs('   ')).toEqual([])
      expect(coerceExtraArgs(undefined)).toEqual([])
      expect(coerceExtraArgs(42)).toEqual([])
      expect(coerceExtraArgs([1, 'ok', null])).toEqual(['ok'])
    })
  })

  describe('normalizeProvider', () => {
    it('accepts readable provider aliases for CLI and API input', () => {
      expect(normalizeProvider('claude-code')).toBe('cc')
      expect(normalizeProvider('Claude Code')).toBe('cc')
      expect(normalizeProvider('codex-cli')).toBe('codex')
      expect(normalizeProvider('qwen-code')).toBe('qwen')
      expect(normalizeProvider('not-real')).toBeNull()
    })
  })

  describe('buildCommand', () => {
    it('Claude Code with skip permissions includes --dangerously-skip-permissions', () => {
      const opts: BuildCommandOptions = { provider: 'cc', permissions: 'skip', model: '' }
      expect(buildCommand(opts)).toContain('--dangerously-skip-permissions')
    })

    it('Claude Code with ask permissions does not include skip flag', () => {
      const opts: BuildCommandOptions = { provider: 'cc', permissions: 'ask', model: '' }
      expect(buildCommand(opts)).not.toContain('--dangerously-skip-permissions')
    })

    it('Claude Code with model includes --model flag', () => {
      const opts: BuildCommandOptions = { provider: 'cc', permissions: 'ask', model: 'opus' }
      const cmd = buildCommand(opts)
      expect(cmd).toContain('--model')
      expect(cmd).toContain('opus')
    })

    it('Claude Code with api-key auth includes --bare', () => {
      const opts: BuildCommandOptions = { provider: 'cc', permissions: 'ask', model: '', auth_mode: 'api-key' }
      expect(buildCommand(opts)).toContain('--bare')
    })

    it('Claude Code with effort includes --effort', () => {
      const opts: BuildCommandOptions = { provider: 'cc', permissions: 'ask', model: '', effort: 'high' }
      const cmd = buildCommand(opts)
      expect(cmd).toContain('--effort')
      expect(cmd).toContain('high')
    })

    it('Codex with effort adds a model_reasoning_effort config override, not --effort', () => {
      const cmd = buildCommand({ provider: 'codex', permissions: 'ask', model: '', effort: 'high' })
      expect(cmd).toContain('-c')
      expect(cmd).toContain('model_reasoning_effort=high')
      expect(cmd).not.toContain('--effort')
    })

    it('Codex maps effort "max" to the highest codex level (xhigh)', () => {
      const cmd = buildCommand({ provider: 'codex', permissions: 'ask', model: '', effort: 'max' })
      expect(cmd).toContain('model_reasoning_effort=xhigh')
    })

    it('appends extra_args verbatim after the flags it builds', () => {
      const opts: BuildCommandOptions = { provider: 'cc', permissions: 'skip', model: 'opus', extra_args: ['--remote-control'] }
      const cmd = buildCommand(opts)
      expect(cmd[cmd.length - 1]).toBe('--remote-control')
      // and it does not disturb the flags ReevesAgents sets
      expect(cmd).toContain('--dangerously-skip-permissions')
      expect(cmd).toContain('opus')
    })

    it('appends extra_args for any provider, not just Claude Code', () => {
      const cmd = buildCommand({ provider: 'codex', permissions: 'ask', model: '', extra_args: ['--foo', 'bar'] })
      expect(cmd.slice(-2)).toEqual(['--foo', 'bar'])
    })

    it('with no extra_args, the command is unchanged', () => {
      const withEmpty = buildCommand({ provider: 'cc', permissions: 'ask', model: '', extra_args: [] })
      const without = buildCommand({ provider: 'cc', permissions: 'ask', model: '' })
      expect(withEmpty).toEqual(without)
    })

    it('codex with skip permissions includes correct flag', () => {
      const opts: BuildCommandOptions = { provider: 'codex', permissions: 'skip', model: '' }
      expect(buildCommand(opts)).toContain('--dangerously-bypass-approvals-and-sandbox')
    })

    it('codex with ask permissions does not include skip flag', () => {
      const opts: BuildCommandOptions = { provider: 'codex', permissions: 'ask', model: '' }
      expect(buildCommand(opts)).not.toContain('--dangerously-bypass-approvals-and-sandbox')
    })

    it('codex with rc_enabled does not add removed remote_control feature flag', () => {
      const opts: BuildCommandOptions = { provider: 'codex', permissions: 'ask', model: '', rc_enabled: true }
      const cmd = buildCommand(opts)
      expect(cmd).toEqual(['codex'])
    })

    it('opencode with skip permissions does not add undocumented skip flags', () => {
      const opts: BuildCommandOptions = { provider: 'opencode', permissions: 'skip', model: '' }
      const cmd = buildCommand(opts)
      expect(cmd).toEqual(['opencode'])
    })

    it('opencode with ask permissions does not include skip flags', () => {
      const opts: BuildCommandOptions = { provider: 'opencode', permissions: 'ask', model: '' }
      const cmd = buildCommand(opts)
      expect(cmd).not.toContain('--yolo')
      expect(cmd).not.toContain('--skip-trust')
    })

    it('opencode with model includes --model flag', () => {
      const opts: BuildCommandOptions = { provider: 'opencode', permissions: 'ask', model: 'anthropic/claude-sonnet-4-5' }
      const cmd = buildCommand(opts)
      expect(cmd).toEqual(['opencode', '--model', 'anthropic/claude-sonnet-4-5'])
    })

    it('first element is the binary name', () => {
      expect(buildCommand({ provider: 'cc', permissions: 'ask', model: '' })[0]).toBe('claude')
      expect(buildCommand({ provider: 'codex', permissions: 'ask', model: '' })[0]).toBe('codex')
      expect(buildCommand({ provider: 'opencode', permissions: 'ask', model: '' })[0]).toBe('opencode')
      expect(buildCommand({ provider: 'hermes', permissions: 'ask', model: '' })[0]).toBe('hermes')
      expect(buildCommand({ provider: 'kimi', permissions: 'ask', model: '' })[0]).toBe('kimi')
      expect(buildCommand({ provider: 'deepseek', permissions: 'ask', model: '' })[0]).toBe('deepseek')
      expect(buildCommand({ provider: 'pi', permissions: 'ask', model: '' })[0]).toBe('pi')
      expect(buildCommand({ provider: 'qwen', permissions: 'ask', model: '' })[0]).toBe('qwen')
      expect(buildCommand({ provider: 'aider', permissions: 'ask', model: '' })[0]).toBe('aider')
      expect(buildCommand({ provider: 'gemini', permissions: 'ask', model: '' })[0]).toBe('gemini')
      expect(buildCommand({ provider: 'cline', permissions: 'ask', model: '' })[0]).toBe('cline')
      expect(buildCommand({ provider: 'crush', permissions: 'ask', model: '' })[0]).toBe('crush')
      expect(buildCommand({ provider: 'goose', permissions: 'ask', model: '' })[0]).toBe('goose')
      expect(buildCommand({ provider: 'kilo', permissions: 'ask', model: '' })[0]).toBe('kilo')
      expect(buildCommand({ provider: 'letta', permissions: 'ask', model: '' })[0]).toBe('letta')
      expect(buildCommand({ provider: 'vibe', permissions: 'ask', model: '' })[0]).toBe('vibe')
      expect(buildCommand({ provider: 'grok', permissions: 'ask', model: '' })[0]).toBe('grok')
      expect(buildCommand({ provider: 'kiro', permissions: 'ask', model: '' })[0]).toBe('kiro-cli')
      expect(buildCommand({ provider: 'droid', permissions: 'ask', model: '' })[0]).toBe('droid')
      expect(buildCommand({ provider: 'qoder', permissions: 'ask', model: '' })[0]).toBe('qodercli')
      expect(buildCommand({ provider: 'warp', permissions: 'ask', model: '' })[0]).toBe('warp')
      expect(buildCommand({ provider: 'junie', permissions: 'ask', model: '' })[0]).toBe('junie')
      expect(buildCommand({ provider: 'copilot', permissions: 'ask', model: '' })[0]).toBe('copilot')
      expect(buildCommand({ provider: 'cursor', permissions: 'ask', model: '' })[0]).toBe('cursor-agent')
      expect(buildCommand({ provider: 'rovo', permissions: 'ask', model: '' })[0]).toBe('acli')
    })

    it('always returns an array for all providers', () => {
      for (const provider of PROVIDERS) {
        const cmd = buildCommand({ provider, permissions: 'ask', model: '' })
        expect(Array.isArray(cmd)).toBe(true)
        expect(cmd.length).toBeGreaterThan(0)
        expect(typeof cmd[0]).toBe('string')
      }
    })

    it('every element is a string', () => {
      const cmd = buildCommand({ provider: 'cc', permissions: 'skip', model: 'opus' })
      for (const arg of cmd) {
        expect(typeof arg).toBe('string')
      }
    })

    it('rejects unsupported providers', () => {
      expect(() => buildCommand({ provider: 'unknown' as never, permissions: 'ask', model: '' })).toThrow(/Unsupported provider/)
    })

    it('builds commands for one of each provider without flag bleed', () => {
      const ccCmd     = buildCommand({ provider: 'cc',     permissions: 'skip', model: 'sonnet', auth_mode: 'api-key', effort: 'high' })
      const codexCmd  = buildCommand({ provider: 'codex',  permissions: 'skip', model: 'gpt-5',  rc_enabled: true })
      const opencodeCmd = buildCommand({ provider: 'opencode', permissions: 'skip', model: 'pro' })
      const hermesCmd = buildCommand({ provider: 'hermes', permissions: 'skip', model: 'haiku' })
      const kimiCmd = buildCommand({ provider: 'kimi', permissions: 'skip', model: 'kimi-code/kimi-for-coding' })
      const deepseekCmd = buildCommand({ provider: 'deepseek', permissions: 'skip', model: 'deepseek-coder:6.7b' })
      const piCmd = buildCommand({ provider: 'pi', permissions: 'skip', model: 'sonnet' })
      const qwenCmd = buildCommand({ provider: 'qwen', permissions: 'skip', model: 'qwen3-coder-plus' })
      const aiderCmd = buildCommand({ provider: 'aider', permissions: 'skip', model: 'deepseek/deepseek-chat' })
      const geminiCmd = buildCommand({ provider: 'gemini', permissions: 'skip', model: 'gemini-3.5-flash' })
      const clineCmd = buildCommand({ provider: 'cline', permissions: 'skip', model: 'anthropic/claude-sonnet-4-6' })
      const crushCmd = buildCommand({ provider: 'crush', permissions: 'skip', model: 'anthropic/claude-sonnet-4-6' })
      const gooseCmd = buildCommand({ provider: 'goose', permissions: 'skip', model: 'claude-sonnet-4-6' })
      const kiloCmd = buildCommand({ provider: 'kilo', permissions: 'skip', model: 'kilo/~anthropic/claude-sonnet-latest' })
      const lettaCmd = buildCommand({ provider: 'letta', permissions: 'skip', model: 'zai-org/GLM-5.3-max' })

      // Each starts with its own binary
      expect(ccCmd[0]).toBe('claude')
      expect(codexCmd[0]).toBe('codex')
      expect(opencodeCmd[0]).toBe('opencode')
      expect(hermesCmd[0]).toBe('hermes')
      expect(kimiCmd[0]).toBe('kimi')
      expect(deepseekCmd[0]).toBe('deepseek')
      expect(piCmd[0]).toBe('pi')
      expect(qwenCmd[0]).toBe('qwen')
      expect(aiderCmd[0]).toBe('aider')
      expect(geminiCmd[0]).toBe('gemini')
      expect(clineCmd[0]).toBe('cline')
      expect(crushCmd[0]).toBe('crush')
      expect(gooseCmd[0]).toBe('goose')
      expect(kiloCmd[0]).toBe('kilo')
      expect(lettaCmd[0]).toBe('letta')

      // Each carries its own model
      expect(ccCmd).toContain('sonnet')
      expect(codexCmd).toContain('gpt-5')
      expect(opencodeCmd).toContain('pro')
      expect(hermesCmd).toContain('haiku')
      expect(kimiCmd).toContain('kimi-code/kimi-for-coding')
      expect(deepseekCmd).toContain('deepseek-coder:6.7b')
      expect(piCmd).toContain('sonnet')
      expect(qwenCmd).toContain('qwen3-coder-plus')
      expect(aiderCmd).toContain('deepseek/deepseek-chat')
      expect(geminiCmd).toContain('gemini-3.5-flash')
      expect(clineCmd).toContain('anthropic/claude-sonnet-4-6')
      // crush has no interactive --model flag, so its model knob is not launched
      expect(crushCmd).toEqual(['crush', '--yolo'])
      expect(gooseCmd).toContain('claude-sonnet-4-6')
      expect(kiloCmd).toContain('kilo/~anthropic/claude-sonnet-latest')
      expect(lettaCmd).toContain('zai-org/GLM-5.3-max')

      // Claude Code-only flags never appear elsewhere.
      expect(ccCmd).toContain('--bare')
      expect(ccCmd).toContain('--effort')
      expect(codexCmd).not.toContain('--bare')
      expect(opencodeCmd).not.toContain('--bare')
      expect(hermesCmd).not.toContain('--bare')
      expect(kimiCmd).not.toContain('--bare')
      expect(deepseekCmd).not.toContain('--bare')
      expect(piCmd).not.toContain('--bare')
      expect(qwenCmd).not.toContain('--bare')
      expect(aiderCmd).not.toContain('--bare')
      expect(geminiCmd).not.toContain('--bare')
      expect(clineCmd).not.toContain('--bare')
      expect(crushCmd).not.toContain('--bare')
      expect(gooseCmd).not.toContain('--bare')
      expect(kiloCmd).not.toContain('--bare')
      expect(lettaCmd).not.toContain('--bare')
      expect(codexCmd).not.toContain('--effort')
      expect(opencodeCmd).not.toContain('--effort')
      expect(kimiCmd).not.toContain('--effort')
      expect(deepseekCmd).not.toContain('--effort')
      expect(piCmd).not.toContain('--effort')
      expect(qwenCmd).not.toContain('--effort')
      expect(aiderCmd).not.toContain('--effort')
      expect(geminiCmd).not.toContain('--effort')
      expect(clineCmd).not.toContain('--effort')
      expect(crushCmd).not.toContain('--effort')
      expect(gooseCmd).not.toContain('--effort')
      expect(kiloCmd).not.toContain('--effort')
      expect(lettaCmd).not.toContain('--effort')

      // codex-only flag never appears elsewhere
      expect(codexCmd).toContain('--dangerously-bypass-approvals-and-sandbox')
      expect(ccCmd).not.toContain('--dangerously-bypass-approvals-and-sandbox')
      expect(opencodeCmd).not.toContain('--dangerously-bypass-approvals-and-sandbox')
      expect(hermesCmd).not.toContain('--dangerously-bypass-approvals-and-sandbox')
      expect(kimiCmd).not.toContain('--dangerously-bypass-approvals-and-sandbox')
      expect(deepseekCmd).not.toContain('--dangerously-bypass-approvals-and-sandbox')
      expect(piCmd).not.toContain('--dangerously-bypass-approvals-and-sandbox')
      expect(qwenCmd).not.toContain('--dangerously-bypass-approvals-and-sandbox')
      expect(aiderCmd).not.toContain('--dangerously-bypass-approvals-and-sandbox')
      expect(geminiCmd).not.toContain('--dangerously-bypass-approvals-and-sandbox')
      expect(clineCmd).not.toContain('--dangerously-bypass-approvals-and-sandbox')
      expect(crushCmd).not.toContain('--dangerously-bypass-approvals-and-sandbox')
      expect(gooseCmd).not.toContain('--dangerously-bypass-approvals-and-sandbox')
      expect(kiloCmd).not.toContain('--dangerously-bypass-approvals-and-sandbox')
      expect(lettaCmd).not.toContain('--dangerously-bypass-approvals-and-sandbox')

      // Claude Code-only skip flag never appears elsewhere.
      expect(ccCmd).toContain('--dangerously-skip-permissions')
      expect(codexCmd).not.toContain('--dangerously-skip-permissions')
      expect(opencodeCmd).not.toContain('--dangerously-skip-permissions')
      expect(hermesCmd).not.toContain('--dangerously-skip-permissions')
      expect(kimiCmd).not.toContain('--dangerously-skip-permissions')
      expect(deepseekCmd).not.toContain('--dangerously-skip-permissions')
      expect(piCmd).not.toContain('--dangerously-skip-permissions')
      expect(qwenCmd).not.toContain('--dangerously-skip-permissions')
      expect(aiderCmd).not.toContain('--dangerously-skip-permissions')
      expect(geminiCmd).not.toContain('--dangerously-skip-permissions')
      expect(clineCmd).not.toContain('--dangerously-skip-permissions')
      expect(crushCmd).not.toContain('--dangerously-skip-permissions')
      expect(gooseCmd).not.toContain('--dangerously-skip-permissions')
      expect(kiloCmd).not.toContain('--dangerously-skip-permissions')
      expect(lettaCmd).not.toContain('--dangerously-skip-permissions')

      // OpenCode has no documented trust-bypass launch flags here.
      expect(opencodeCmd).not.toContain('--yolo')
      expect(opencodeCmd).not.toContain('--skip-trust')
      expect(ccCmd).not.toContain('--skip-trust')
      expect(codexCmd).not.toContain('--skip-trust')
      expect(hermesCmd).not.toContain('--skip-trust')
      expect(kimiCmd).not.toContain('--skip-trust')
      expect(deepseekCmd).not.toContain('--skip-trust')
      expect(piCmd).not.toContain('--skip-trust')
      expect(qwenCmd).not.toContain('--skip-trust')
      expect(aiderCmd).not.toContain('--skip-trust')
      expect(geminiCmd).not.toContain('--skip-trust')
      expect(clineCmd).not.toContain('--skip-trust')
      expect(crushCmd).not.toContain('--skip-trust')
      expect(gooseCmd).not.toContain('--skip-trust')
      expect(kiloCmd).not.toContain('--skip-trust')
      expect(lettaCmd).not.toContain('--skip-trust')

      // hermes uses chat subcommand
      expect(hermesCmd).toContain('chat')
      expect(ccCmd).not.toContain('chat')
      expect(codexCmd).not.toContain('chat')
      expect(opencodeCmd).not.toContain('chat')
      expect(kimiCmd).not.toContain('chat')
      expect(deepseekCmd).not.toContain('chat')
      expect(piCmd).not.toContain('chat')
      expect(qwenCmd).not.toContain('chat')
      expect(aiderCmd).not.toContain('chat')
      expect(geminiCmd).not.toContain('chat')
      expect(clineCmd).not.toContain('chat')
      expect(crushCmd).not.toContain('chat')
      expect(gooseCmd).not.toContain('chat')
      expect(kiloCmd).not.toContain('chat')
      expect(lettaCmd).not.toContain('chat')

      // Codex remote control is not a per-agent launch flag.
      expect(codexCmd).not.toContain('remote_control')
      expect(ccCmd).not.toContain('remote_control')
      expect(opencodeCmd).not.toContain('remote_control')
      expect(hermesCmd).not.toContain('remote_control')
      expect(kimiCmd).not.toContain('remote_control')
      expect(deepseekCmd).not.toContain('remote_control')
      expect(piCmd).not.toContain('remote_control')
      expect(qwenCmd).not.toContain('remote_control')
      expect(aiderCmd).not.toContain('remote_control')
      expect(geminiCmd).not.toContain('remote_control')
      expect(clineCmd).not.toContain('remote_control')
      expect(crushCmd).not.toContain('remote_control')
      expect(gooseCmd).not.toContain('remote_control')
      expect(kiloCmd).not.toContain('remote_control')
      expect(lettaCmd).not.toContain('remote_control')

      // cline keeps the TUI running with --tui; no other provider passes it.
      expect(clineCmd).toContain('--tui')
      expect(ccCmd).not.toContain('--tui')
      expect(codexCmd).not.toContain('--tui')
      expect(opencodeCmd).not.toContain('--tui')
      expect(hermesCmd).not.toContain('--tui')
      expect(kimiCmd).not.toContain('--tui')
      expect(deepseekCmd).not.toContain('--tui')
      expect(piCmd).not.toContain('--tui')
      expect(qwenCmd).not.toContain('--tui')
      expect(aiderCmd).not.toContain('--tui')
      expect(geminiCmd).not.toContain('--tui')
      expect(crushCmd).not.toContain('--tui')
      expect(gooseCmd).not.toContain('--tui')
      expect(kiloCmd).not.toContain('--tui')
      expect(lettaCmd).not.toContain('--tui')

      // cline's interactive auto-approve flag never appears elsewhere.
      expect(clineCmd).toContain('--auto-approve')
      expect(ccCmd).not.toContain('--auto-approve')
      expect(codexCmd).not.toContain('--auto-approve')
      expect(opencodeCmd).not.toContain('--auto-approve')
      expect(hermesCmd).not.toContain('--auto-approve')
      expect(kimiCmd).not.toContain('--auto-approve')
      expect(deepseekCmd).not.toContain('--auto-approve')
      expect(piCmd).not.toContain('--auto-approve')
      expect(qwenCmd).not.toContain('--auto-approve')
      expect(aiderCmd).not.toContain('--auto-approve')
      expect(geminiCmd).not.toContain('--auto-approve')
      expect(crushCmd).not.toContain('--auto-approve')
      expect(gooseCmd).not.toContain('--auto-approve')
      expect(kiloCmd).not.toContain('--auto-approve')
      expect(lettaCmd).not.toContain('--auto-approve')

      // goose launches through its session subcommand, like hermes uses chat.
      expect(gooseCmd).toContain('session')
      expect(ccCmd).not.toContain('session')
      expect(codexCmd).not.toContain('session')
      expect(opencodeCmd).not.toContain('session')
      expect(hermesCmd).not.toContain('session')
      expect(kimiCmd).not.toContain('session')
      expect(deepseekCmd).not.toContain('session')
      expect(piCmd).not.toContain('session')
      expect(qwenCmd).not.toContain('session')
      expect(aiderCmd).not.toContain('session')
      expect(geminiCmd).not.toContain('session')
      expect(clineCmd).not.toContain('session')
      expect(crushCmd).not.toContain('session')
      expect(kiloCmd).not.toContain('session')
      expect(lettaCmd).not.toContain('session')

      // letta's permission-mode flag never appears elsewhere.
      expect(lettaCmd).toContain('--permission-mode')
      expect(ccCmd).not.toContain('--permission-mode')
      expect(codexCmd).not.toContain('--permission-mode')
      expect(opencodeCmd).not.toContain('--permission-mode')
      expect(hermesCmd).not.toContain('--permission-mode')
      expect(kimiCmd).not.toContain('--permission-mode')
      expect(deepseekCmd).not.toContain('--permission-mode')
      expect(piCmd).not.toContain('--permission-mode')
      expect(qwenCmd).not.toContain('--permission-mode')
      expect(aiderCmd).not.toContain('--permission-mode')
      expect(geminiCmd).not.toContain('--permission-mode')
      expect(clineCmd).not.toContain('--permission-mode')
      expect(crushCmd).not.toContain('--permission-mode')
      expect(gooseCmd).not.toContain('--permission-mode')
      expect(kiloCmd).not.toContain('--permission-mode')

      // kilo's exact --auto arg (cline's --auto-approve is a different flag,
      // so absence is checked by exact equality here, not substring).
      expect(kiloCmd).toEqual(['kilo', '--auto', '--model', 'kilo/~anthropic/claude-sonnet-latest'])

      // gemini skips approvals through approval-mode yolo, not the --yolo shorthand.
      expect(geminiCmd).toContain('--approval-mode')
      expect(geminiCmd).toContain('yolo')
      expect(geminiCmd).not.toContain('--yolo')

      // crush skips approvals with --yolo like hermes and kimi.
      expect(crushCmd).toContain('--yolo')
    })
  })

  describe('ten later providers', () => {
    it('build exact launch commands without flag bleed', () => {
      const skip = (provider: Provider, model: string) => buildCommand({ provider, permissions: 'skip', model, auth_mode: 'api-key', effort: 'high' })
      expect(skip('vibe', 'mistral-medium-3.5')).toEqual(['vibe', '--auto-approve'])
      expect(skip('grok', 'grok-4.6')).toEqual(['grok', '--always-approve', '--model', 'grok-4.6'])
      expect(skip('kiro', 'claude-sonnet-4.6')).toEqual(['kiro-cli', 'chat', '--trust-all-tools', '--model', 'claude-sonnet-4.6'])
      expect(skip('droid', 'gpt-6-sol')).toEqual(['droid', '--auto', 'high'])
      expect(skip('qoder', 'auto')).toEqual(['qodercli', '--dangerously-skip-permissions', '--model', 'auto'])
      expect(skip('warp', 'gpt-5.4')).toEqual(['warp', '--auto-approve'])
      expect(skip('junie', 'sonnet')).toEqual(['junie', '--brave', '--model', 'sonnet'])
      expect(skip('copilot', 'auto')).toEqual(['copilot', '--allow-all', '--model', 'auto'])
      expect(skip('cursor', 'gpt-5')).toEqual(['cursor-agent', '--force', '--model', 'gpt-5'])
      expect(skip('rovo', 'auto')).toEqual(['acli', 'rovodev', 'run', '--yolo'])
    })

    it('ask permissions add no approval flag', () => {
      const ask = (provider: Provider) => buildCommand({ provider, permissions: 'ask', model: '' })
      expect(ask('vibe')).toEqual(['vibe'])
      expect(ask('grok')).toEqual(['grok'])
      expect(ask('kiro')).toEqual(['kiro-cli', 'chat'])
      expect(ask('droid')).toEqual(['droid'])
      expect(ask('qoder')).toEqual(['qodercli'])
      expect(ask('warp')).toEqual(['warp'])
      expect(ask('junie')).toEqual(['junie'])
      expect(ask('copilot')).toEqual(['copilot'])
      expect(ask('cursor')).toEqual(['cursor-agent'])
      expect(ask('rovo')).toEqual(['acli', 'rovodev', 'run'])
    })

    it('never pass the task at launch', () => {
      for (const provider of ['vibe', 'grok', 'kiro', 'droid', 'qoder', 'warp', 'junie', 'copilot', 'cursor', 'rovo'] as const) {
        const cmd = buildCommand({ provider, permissions: 'skip', model: '' })
        for (const bad of ['-p', '--print', '--prompt', '-i', '--single', '--no-interactive', '--task']) {
          expect(cmd, `${provider} ${bad}`).not.toContain(bad)
        }
      }
    })
  })

  describe('letta fresh conversation', () => {
    it('always starts a new conversation', () => {
      expect(buildCommand({ provider: 'letta', permissions: 'ask', model: '' })).toEqual(['letta', '--new'])
      expect(buildCommand({ provider: 'letta', permissions: 'skip', model: 'zai-org/GLM-5.3-max' })).toEqual(['letta', '--new', '--permission-mode', 'unrestricted', '--model', 'zai-org/GLM-5.3-max'])
    })
  })

  describe('detectAvailable', () => {
    it('returns object with supported provider keys', async () => {
      const { detectAvailable } = await import('../src/core/providers.js')
      const result = detectAvailable()
      expect(typeof result.cc).toBe('boolean')
      expect(typeof result.codex).toBe('boolean')
      expect(typeof result.opencode).toBe('boolean')
      expect(typeof result.hermes).toBe('boolean')
      expect(typeof result.kimi).toBe('boolean')
      expect(typeof result.deepseek).toBe('boolean')
      expect(typeof result.pi).toBe('boolean')
      expect(typeof result.qwen).toBe('boolean')
      expect(typeof result.aider).toBe('boolean')
      expect(typeof result.gemini).toBe('boolean')
      expect(typeof result.cline).toBe('boolean')
      expect(typeof result.crush).toBe('boolean')
      expect(typeof result.goose).toBe('boolean')
      expect(typeof result.kilo).toBe('boolean')
      expect(typeof result.letta).toBe('boolean')
      expect(typeof result.vibe).toBe('boolean')
      expect(typeof result.grok).toBe('boolean')
      expect(typeof result.kiro).toBe('boolean')
      expect(typeof result.droid).toBe('boolean')
      expect(typeof result.qoder).toBe('boolean')
      expect(typeof result.warp).toBe('boolean')
      expect(typeof result.junie).toBe('boolean')
      expect(typeof result.copilot).toBe('boolean')
      expect(typeof result.cursor).toBe('boolean')
      expect(typeof result.rovo).toBe('boolean')
      expect(Object.keys(result)).toEqual(PROVIDERS)
    })
  })

  describe('provider compatibility helpers', () => {
    it('uses hermes chat --help for compatibility inspection', () => {
      expect(helpCommand('hermes')).toEqual(['hermes', 'chat', '--help'])
      expect(helpCommand('opencode')).toEqual(['opencode', '--help'])
      expect(helpCommand('kimi')).toEqual(['kimi', '--help'])
      expect(helpCommand('deepseek')).toEqual(['deepseek', '--help'])
      expect(helpCommand('pi')).toEqual(['pi', '--help'])
      expect(helpCommand('qwen')).toEqual(['qwen', '--help'])
      expect(helpCommand('aider')).toEqual(['aider', '--help'])
      expect(helpCommand('gemini')).toEqual(['gemini', '--help'])
      expect(helpCommand('cline')).toEqual(['cline', '--help'])
      expect(helpCommand('crush')).toEqual(['crush', '--help'])
      expect(helpCommand('goose')).toEqual(['goose', 'session', '--help'])
      expect(helpCommand('kilo')).toEqual(['kilo', '--help'])
      expect(helpCommand('letta')).toEqual(['letta', '--help'])
      expect(helpCommand('vibe')).toEqual(['vibe', '--help'])
      expect(helpCommand('grok')).toEqual(['grok', '--help'])
      expect(helpCommand('kiro')).toEqual(['kiro-cli', 'chat', '--help'])
      expect(helpCommand('droid')).toEqual(['droid', '--help'])
      expect(helpCommand('qoder')).toEqual(['qodercli', '--help'])
      expect(helpCommand('warp')).toEqual(['warp', '--help'])
      expect(helpCommand('junie')).toEqual(['junie', '--help'])
      expect(helpCommand('copilot')).toEqual(['copilot', '--help'])
      expect(helpCommand('cursor')).toEqual(['cursor-agent', '--help'])
      expect(helpCommand('rovo')).toEqual(['acli', 'rovodev', 'run', '--help'])
    })

    it('detects missing opencode prompt and model support', () => {
      expect(missingHelpFeatures('opencode', 'Usage: opencode --prompt')).toEqual(['model selection'])
      expect(missingHelpFeatures('opencode', 'Usage: opencode --prompt --model')).toEqual([])
    })

    it('detects missing hermes chat support details', () => {
      expect(missingHelpFeatures('hermes', 'usage: hermes chat --model x')).toEqual(['skip permissions'])
      expect(missingHelpFeatures('hermes', 'usage: hermes chat --model x --yolo')).toEqual([])
    })

    it('detects missing kimi support details', () => {
      expect(missingHelpFeatures('kimi', 'usage: kimi --model x')).toEqual(['skip permissions'])
      expect(missingHelpFeatures('kimi', 'usage: kimi --model x --yolo')).toEqual([])
    })

    it('detects missing deepseek and pi model support details', () => {
      expect(missingHelpFeatures('deepseek', 'usage: deepseek')).toEqual(['model selection'])
      expect(missingHelpFeatures('deepseek', 'usage: deepseek --model')).toEqual([])
      expect(missingHelpFeatures('pi', 'usage: pi')).toEqual(['model selection'])
      expect(missingHelpFeatures('pi', 'usage: pi --model')).toEqual([])
    })

    it('detects missing qwen and aider support details', () => {
      expect(missingHelpFeatures('qwen', 'usage: qwen --model x')).toEqual(['skip permissions'])
      expect(missingHelpFeatures('qwen', 'usage: qwen --model x --approval-mode')).toEqual([])
      expect(missingHelpFeatures('aider', 'usage: aider --model x')).toEqual(['skip confirmations'])
      expect(missingHelpFeatures('aider', 'usage: aider --model x --yes-always')).toEqual([])
    })

    it('detects missing gemini, cline, and crush support details', () => {
      expect(missingHelpFeatures('gemini', 'usage: gemini --model x')).toEqual(['skip permissions'])
      expect(missingHelpFeatures('gemini', 'usage: gemini --model x --approval-mode')).toEqual([])
      expect(missingHelpFeatures('cline', 'usage: cline --model x')).toEqual(['skip permissions'])
      expect(missingHelpFeatures('cline', 'usage: cline --model x --auto-approve')).toEqual([])
      expect(missingHelpFeatures('crush', 'usage: crush')).toEqual(['skip permissions'])
      expect(missingHelpFeatures('crush', 'usage: crush --yolo')).toEqual([])
    })

    it('detects missing goose, kilo, and letta support details', () => {
      expect(missingHelpFeatures('goose', 'usage: goose session')).toEqual(['model selection'])
      expect(missingHelpFeatures('goose', 'usage: goose session --model x')).toEqual([])
      expect(missingHelpFeatures('kilo', 'usage: kilo --model x')).toEqual(['skip permissions'])
      expect(missingHelpFeatures('kilo', 'usage: kilo --model x --auto')).toEqual([])
      expect(missingHelpFeatures('letta', 'usage: letta')).toEqual(['fresh conversation', 'model selection'])
      expect(missingHelpFeatures('letta', 'usage: letta --new')).toEqual(['model selection'])
      expect(missingHelpFeatures('letta', 'usage: letta --new --model x')).toEqual([])
    })

    it('detects missing vibe, grok, kiro, droid, and qoder support details', () => {
      expect(missingHelpFeatures('vibe', 'usage: vibe')).toEqual(['skip permissions'])
      expect(missingHelpFeatures('vibe', 'usage: vibe --auto-approve')).toEqual([])
      expect(missingHelpFeatures('grok', 'usage: grok --model x')).toEqual(['skip permissions'])
      expect(missingHelpFeatures('grok', 'usage: grok --model x --always-approve')).toEqual([])
      expect(missingHelpFeatures('kiro', 'usage: kiro-cli chat --model x')).toEqual(['skip permissions'])
      expect(missingHelpFeatures('kiro', 'usage: kiro-cli chat --model x --trust-all-tools')).toEqual([])
      expect(missingHelpFeatures('droid', 'usage: droid')).toEqual(['skip permissions'])
      expect(missingHelpFeatures('droid', 'usage: droid --auto <level>')).toEqual([])
      expect(missingHelpFeatures('qoder', 'usage: qodercli --model x')).toEqual(['skip permissions'])
      expect(missingHelpFeatures('qoder', 'usage: qodercli --model x --dangerously-skip-permissions')).toEqual([])
    })

    it('detects missing warp, junie, copilot, cursor, and rovo support details', () => {
      expect(missingHelpFeatures('warp', 'usage: warp')).toEqual(['skip permissions'])
      expect(missingHelpFeatures('warp', 'usage: warp --auto-approve')).toEqual([])
      expect(missingHelpFeatures('junie', 'usage: junie --model=x')).toEqual(['skip permissions'])
      expect(missingHelpFeatures('junie', 'usage: junie --model=x --brave')).toEqual([])
      expect(missingHelpFeatures('copilot', 'usage: copilot --model x')).toEqual(['skip permissions'])
      expect(missingHelpFeatures('copilot', 'usage: copilot --model x --allow-all')).toEqual([])
      expect(missingHelpFeatures('cursor', 'usage: agent --model x')).toEqual(['skip permissions'])
      expect(missingHelpFeatures('cursor', 'usage: agent --model x --force')).toEqual([])
      expect(missingHelpFeatures('rovo', 'usage: acli rovodev run')).toEqual(['skip permissions'])
      expect(missingHelpFeatures('rovo', 'usage: acli rovodev run --yolo')).toEqual([])
    })
  })
})
