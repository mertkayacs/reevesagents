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

    it('skip permissions includes --yolo', () => {
      const cmd = buildCommand({ provider: 'hermes', permissions: 'skip', model: '' })
      expect(cmd).toContain('--yolo')
    })

    it('ask permissions does not include --yolo', () => {
      const cmd = buildCommand({ provider: 'hermes', permissions: 'ask', model: '' })
      expect(cmd).not.toContain('--yolo')
    })
  })
})
