import { describe, it, expect } from 'vitest'
import { buildCommand } from '../src/core/providers.js'

describe('buildCommand: extended providers', () => {
  describe('hermes', () => {
    it('binary is hermes', () => {
      expect(buildCommand({ provider: 'hermes', permissions: 'ask', model: '' })[0]).toBe('hermes')
    })

    it('includes chat subcommand', () => {
      expect(buildCommand({ provider: 'hermes', permissions: 'ask', model: '' })).toContain('chat')
    })

    it('includes --model when set', () => {
      const cmd = buildCommand({ provider: 'hermes', permissions: 'ask', model: 'claude-opus-4' })
      expect(cmd).toContain('--model')
      expect(cmd).toContain('claude-opus-4')
    })

    it('splits provider-prefixed model catalog values', () => {
      const cmd = buildCommand({ provider: 'hermes', permissions: 'ask', model: 'openrouter:anthropic/claude-sonnet-4.6' })
      expect(cmd).toEqual(['hermes', 'chat', '--provider', 'openrouter', '--model', 'anthropic/claude-sonnet-4.6'])
    })

    it('does not split plain model ids that contain colons', () => {
      const cmd = buildCommand({ provider: 'hermes', permissions: 'ask', model: 'gpt-oss:120b' })
      expect(cmd).toEqual(['hermes', 'chat', '--model', 'gpt-oss:120b'])
    })

    it('skip permissions includes --yolo', () => {
      const cmd = buildCommand({ provider: 'hermes', permissions: 'skip', model: '' })
      expect(cmd).toContain('--yolo')
    })

    it('ask permissions does not include --yolo', () => {
      const cmd = buildCommand({ provider: 'hermes', permissions: 'ask', model: '' })
      expect(cmd).not.toContain('--yolo')
    })
  })

  describe('kimi', () => {
    it('binary is kimi', () => {
      expect(buildCommand({ provider: 'kimi', permissions: 'ask', model: '' })[0]).toBe('kimi')
    })

    it('includes --model when set', () => {
      const cmd = buildCommand({ provider: 'kimi', permissions: 'ask', model: 'kimi-code/kimi-for-coding' })
      expect(cmd).toEqual(['kimi', '--model', 'kimi-code/kimi-for-coding'])
    })

    it('skip permissions includes --yolo', () => {
      const cmd = buildCommand({ provider: 'kimi', permissions: 'skip', model: '' })
      expect(cmd).toContain('--yolo')
    })
  })

  describe('deepseek', () => {
    it('includes --model when set', () => {
      const cmd = buildCommand({ provider: 'deepseek', permissions: 'ask', model: 'deepseek-coder:6.7b' })
      expect(cmd).toEqual(['deepseek', '--model', 'deepseek-coder:6.7b'])
    })

    it('skip permissions does not add undocumented flags', () => {
      expect(buildCommand({ provider: 'deepseek', permissions: 'skip', model: '' })).toEqual(['deepseek'])
    })
  })

  describe('pi', () => {
    it('includes --model when set', () => {
      const cmd = buildCommand({ provider: 'pi', permissions: 'ask', model: 'sonnet' })
      expect(cmd).toEqual(['pi', '--model', 'sonnet'])
    })

    it('skip permissions does not add undocumented flags', () => {
      expect(buildCommand({ provider: 'pi', permissions: 'skip', model: '' })).toEqual(['pi'])
    })
  })

  describe('qwen', () => {
    it('includes --model when set', () => {
      const cmd = buildCommand({ provider: 'qwen', permissions: 'ask', model: 'qwen3-coder-plus' })
      expect(cmd).toEqual(['qwen', '--model', 'qwen3-coder-plus'])
    })

    it('skip permissions uses approval mode yolo', () => {
      const cmd = buildCommand({ provider: 'qwen', permissions: 'skip', model: '' })
      expect(cmd).toEqual(['qwen', '--approval-mode', 'yolo'])
    })
  })

  describe('aider', () => {
    it('includes --model when set', () => {
      const cmd = buildCommand({ provider: 'aider', permissions: 'ask', model: 'deepseek/deepseek-chat' })
      expect(cmd).toEqual(['aider', '--model', 'deepseek/deepseek-chat'])
    })

    it('skip permissions uses yes-always', () => {
      const cmd = buildCommand({ provider: 'aider', permissions: 'skip', model: '' })
      expect(cmd).toEqual(['aider', '--yes-always'])
    })
  })

  describe('gemini', () => {
    it('binary is gemini', () => {
      expect(buildCommand({ provider: 'gemini', permissions: 'ask', model: '' })[0]).toBe('gemini')
    })

    it('includes --model when set', () => {
      const cmd = buildCommand({ provider: 'gemini', permissions: 'ask', model: 'gemini-3.5-flash' })
      expect(cmd).toEqual(['gemini', '--model', 'gemini-3.5-flash'])
    })

    it('skip permissions uses approval mode yolo, not the --yolo shorthand', () => {
      const cmd = buildCommand({ provider: 'gemini', permissions: 'skip', model: '' })
      expect(cmd).toEqual(['gemini', '--approval-mode', 'yolo'])
    })

    it('ask permissions does not include approval mode', () => {
      const cmd = buildCommand({ provider: 'gemini', permissions: 'ask', model: '' })
      expect(cmd).not.toContain('--approval-mode')
      expect(cmd).not.toContain('yolo')
    })
  })

  describe('cline', () => {
    it('binary is cline and launches the TUI', () => {
      expect(buildCommand({ provider: 'cline', permissions: 'ask', model: '' })).toEqual(['cline', '--tui'])
    })

    it('includes --model when set', () => {
      const cmd = buildCommand({ provider: 'cline', permissions: 'ask', model: 'anthropic/claude-sonnet-4-6' })
      expect(cmd).toEqual(['cline', '--tui', '--model', 'anthropic/claude-sonnet-4-6'])
    })

    it('skip permissions uses interactive auto-approve', () => {
      const cmd = buildCommand({ provider: 'cline', permissions: 'skip', model: '' })
      expect(cmd).toEqual(['cline', '--tui', '--auto-approve', 'true'])
    })

    it('ask permissions does not include auto-approve', () => {
      const cmd = buildCommand({ provider: 'cline', permissions: 'ask', model: '' })
      expect(cmd).not.toContain('--auto-approve')
    })
  })

  describe('crush', () => {
    it('binary is crush', () => {
      expect(buildCommand({ provider: 'crush', permissions: 'ask', model: '' })).toEqual(['crush'])
    })

    it('skip permissions includes --yolo', () => {
      const cmd = buildCommand({ provider: 'crush', permissions: 'skip', model: '' })
      expect(cmd).toEqual(['crush', '--yolo'])
    })

    it('interactive session has no model flag, so the model knob is not launched', () => {
      const cmd = buildCommand({ provider: 'crush', permissions: 'ask', model: 'anthropic/claude-sonnet-4-6' })
      expect(cmd).toEqual(['crush'])
    })
  })

  describe('goose', () => {
    it('binary is goose and launches the session subcommand', () => {
      expect(buildCommand({ provider: 'goose', permissions: 'ask', model: '' })).toEqual(['goose', 'session'])
    })

    it('includes --model when set', () => {
      const cmd = buildCommand({ provider: 'goose', permissions: 'ask', model: 'claude-sonnet-4-6' })
      expect(cmd).toEqual(['goose', 'session', '--model', 'claude-sonnet-4-6'])
    })

    it('skip permissions adds no flag; goose reads GOOSE_MODE from its config', () => {
      expect(buildCommand({ provider: 'goose', permissions: 'skip', model: '' })).toEqual(['goose', 'session'])
    })
  })

  describe('kilo', () => {
    it('binary is kilo', () => {
      expect(buildCommand({ provider: 'kilo', permissions: 'ask', model: '' })).toEqual(['kilo'])
    })

    it('includes --model when set', () => {
      const cmd = buildCommand({ provider: 'kilo', permissions: 'ask', model: 'kilo/~google/gemini-pro-latest' })
      expect(cmd).toEqual(['kilo', '--model', 'kilo/~google/gemini-pro-latest'])
    })

    it('skip permissions includes --auto', () => {
      const cmd = buildCommand({ provider: 'kilo', permissions: 'skip', model: '' })
      expect(cmd).toEqual(['kilo', '--auto'])
    })
  })

  describe('letta', () => {
    it('binary is letta', () => {
      expect(buildCommand({ provider: 'letta', permissions: 'ask', model: '' })).toEqual(['letta', '--new'])
    })

    it('includes --model when set', () => {
      const cmd = buildCommand({ provider: 'letta', permissions: 'ask', model: 'zai-org/GLM-5.3-max' })
      expect(cmd).toEqual(['letta', '--new', '--model', 'zai-org/GLM-5.3-max'])
    })

    it('skip permissions uses permission mode unrestricted', () => {
      const cmd = buildCommand({ provider: 'letta', permissions: 'skip', model: '' })
      expect(cmd).toEqual(['letta', '--new', '--permission-mode', 'unrestricted'])
    })
  })

  describe('vibe', () => {
    it('launch command starts with vibe', () => {
      expect(buildCommand({ provider: 'vibe', permissions: 'ask', model: '' })).toEqual(['vibe'])
    })

    it('skip permissions uses --auto-approve', () => {
      expect(buildCommand({ provider: 'vibe', permissions: 'skip', model: '' })).toEqual(['vibe', '--auto-approve'])
    })

    it('has no launch model flag, so the model knob adds nothing', () => {
      expect(buildCommand({ provider: 'vibe', permissions: 'ask', model: 'mistral-medium-3.5' })).toEqual(buildCommand({ provider: 'vibe', permissions: 'ask', model: '' }))
    })
  })

  describe('grok', () => {
    it('launch command starts with grok', () => {
      expect(buildCommand({ provider: 'grok', permissions: 'ask', model: '' })).toEqual(['grok'])
    })

    it('skip permissions uses --always-approve', () => {
      expect(buildCommand({ provider: 'grok', permissions: 'skip', model: '' })).toEqual(['grok', '--always-approve'])
    })

    it('includes --model when set', () => {
      expect(buildCommand({ provider: 'grok', permissions: 'ask', model: 'grok-4.6' })).toEqual(['grok', '--model', 'grok-4.6'])
    })
  })

  describe('kiro', () => {
    it('launch command starts with kiro-cli', () => {
      expect(buildCommand({ provider: 'kiro', permissions: 'ask', model: '' })).toEqual(['kiro-cli', 'chat'])
    })

    it('skip permissions uses --trust-all-tools', () => {
      expect(buildCommand({ provider: 'kiro', permissions: 'skip', model: '' })).toEqual(['kiro-cli', 'chat', '--trust-all-tools'])
    })

    it('includes --model when set', () => {
      expect(buildCommand({ provider: 'kiro', permissions: 'ask', model: 'claude-sonnet-4.6' })).toEqual(['kiro-cli', 'chat', '--model', 'claude-sonnet-4.6'])
    })
  })

  describe('droid', () => {
    it('launch command starts with droid', () => {
      expect(buildCommand({ provider: 'droid', permissions: 'ask', model: '' })).toEqual(['droid'])
    })

    it('skip permissions sets autonomy high with --auto and never passes a model', () => {
      expect(buildCommand({ provider: 'droid', permissions: 'skip', model: '' })).toEqual(['droid', '--auto', 'high'])
      expect(buildCommand({ provider: 'droid', permissions: 'skip', model: 'gpt-6-sol' })).toEqual(['droid', '--auto', 'high'])
    })

    it('has no launch model flag, so the model knob adds nothing', () => {
      expect(buildCommand({ provider: 'droid', permissions: 'ask', model: 'gpt-6-sol' })).toEqual(buildCommand({ provider: 'droid', permissions: 'ask', model: '' }))
    })
  })

  describe('qoder', () => {
    it('launch command starts with qodercli', () => {
      expect(buildCommand({ provider: 'qoder', permissions: 'ask', model: '' })).toEqual(['qodercli'])
    })

    it('skip permissions uses --dangerously-skip-permissions', () => {
      expect(buildCommand({ provider: 'qoder', permissions: 'skip', model: '' })).toEqual(['qodercli', '--dangerously-skip-permissions'])
    })

    it('includes --model when set', () => {
      expect(buildCommand({ provider: 'qoder', permissions: 'ask', model: 'auto' })).toEqual(['qodercli', '--model', 'auto'])
    })
  })

  describe('warp', () => {
    it('launch command starts with warp', () => {
      expect(buildCommand({ provider: 'warp', permissions: 'ask', model: '' })).toEqual(['warp'])
    })

    it('skip permissions uses --auto-approve', () => {
      expect(buildCommand({ provider: 'warp', permissions: 'skip', model: '' })).toEqual(['warp', '--auto-approve'])
    })

    it('has no launch model flag, so the model knob adds nothing', () => {
      expect(buildCommand({ provider: 'warp', permissions: 'ask', model: 'gpt-5.4' })).toEqual(buildCommand({ provider: 'warp', permissions: 'ask', model: '' }))
    })
  })

  describe('junie', () => {
    it('launch command starts with junie', () => {
      expect(buildCommand({ provider: 'junie', permissions: 'ask', model: '' })).toEqual(['junie'])
    })

    it('skip permissions uses --brave', () => {
      expect(buildCommand({ provider: 'junie', permissions: 'skip', model: '' })).toEqual(['junie', '--brave'])
    })

    it('includes --model when set', () => {
      expect(buildCommand({ provider: 'junie', permissions: 'ask', model: 'sonnet' })).toEqual(['junie', '--model', 'sonnet'])
    })
  })

  describe('copilot', () => {
    it('launch command starts with copilot', () => {
      expect(buildCommand({ provider: 'copilot', permissions: 'ask', model: '' })).toEqual(['copilot'])
    })

    it('skip permissions uses --allow-all', () => {
      expect(buildCommand({ provider: 'copilot', permissions: 'skip', model: '' })).toEqual(['copilot', '--allow-all'])
    })

    it('includes --model when set', () => {
      expect(buildCommand({ provider: 'copilot', permissions: 'ask', model: 'auto' })).toEqual(['copilot', '--model', 'auto'])
    })
  })

  describe('cursor', () => {
    it('launch command starts with cursor-agent', () => {
      expect(buildCommand({ provider: 'cursor', permissions: 'ask', model: '' })).toEqual(['cursor-agent'])
    })

    it('skip permissions uses --force', () => {
      expect(buildCommand({ provider: 'cursor', permissions: 'skip', model: '' })).toEqual(['cursor-agent', '--force'])
    })

    it('includes --model when set', () => {
      expect(buildCommand({ provider: 'cursor', permissions: 'ask', model: 'gpt-5' })).toEqual(['cursor-agent', '--model', 'gpt-5'])
    })
  })

  describe('rovo', () => {
    it('launch command starts with acli', () => {
      expect(buildCommand({ provider: 'rovo', permissions: 'ask', model: '' })).toEqual(['acli', 'rovodev', 'run'])
    })

    it('skip permissions uses --yolo', () => {
      expect(buildCommand({ provider: 'rovo', permissions: 'skip', model: '' })).toEqual(['acli', 'rovodev', 'run', '--yolo'])
    })

    it('has no launch model flag, so the model knob adds nothing', () => {
      expect(buildCommand({ provider: 'rovo', permissions: 'ask', model: 'auto' })).toEqual(buildCommand({ provider: 'rovo', permissions: 'ask', model: '' }))
    })
  })
})
