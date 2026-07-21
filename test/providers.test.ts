import { describe, it, expect } from 'vitest'
import { buildCommand, coerceExtraArgs, helpCommand, missingHelpFeatures, normalizeProvider, PROVIDERS } from '../src/core/providers.js'
import type { BuildCommandOptions } from '../src/core/providers.js'

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
      expect(codexCmd).not.toContain('--effort')
      expect(opencodeCmd).not.toContain('--effort')
      expect(kimiCmd).not.toContain('--effort')
      expect(deepseekCmd).not.toContain('--effort')
      expect(piCmd).not.toContain('--effort')
      expect(qwenCmd).not.toContain('--effort')
      expect(aiderCmd).not.toContain('--effort')

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
  })
})
