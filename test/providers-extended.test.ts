import { describe, it, expect } from 'vitest'
import { buildCommand } from '../src/launcher/providers.js'

describe('buildCommand — extended providers', () => {
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
})
