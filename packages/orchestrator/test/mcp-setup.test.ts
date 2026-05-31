import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

let tmpDir: string
let oldPath: string | undefined

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeves-mcp-setup-test-'))
  process.env.REEVES_SETUP_HOME = tmpDir
  oldPath = process.env.PATH
})

afterEach(() => {
  delete process.env.REEVES_SETUP_HOME
  process.env.PATH = oldPath
  rmSync(tmpDir, { recursive: true, force: true })
})

function addFakeBin(name: string): void {
  const binDir = join(tmpDir, 'bin')
  mkdirSync(binDir, { recursive: true })
  const path = join(binDir, name)
  writeFileSync(path, '#!/bin/sh\nexit 0\n', 'utf-8')
  chmodSync(path, 0o755)
  process.env.PATH = `${binDir}:${oldPath ?? ''}`
}

describe('mcp-setup', () => {
  describe('isRegistered', () => {
    it('returns false when config file does not exist', async () => {
      const { isRegistered } = await import('../src/mcp-setup.js')
      expect(isRegistered(join(tmpDir, 'nonexistent.json'))).toBe(false)
    })

    it('returns false when mcpServers key is absent', async () => {
      const { isRegistered } = await import('../src/mcp-setup.js')
      const path = join(tmpDir, 'settings.json')
      writeFileSync(path, JSON.stringify({ theme: 'dark' }), 'utf-8')
      expect(isRegistered(path)).toBe(false)
    })

    it('returns false when mcpServers exists but reevesagents key is absent', async () => {
      const { isRegistered } = await import('../src/mcp-setup.js')
      const path = join(tmpDir, 'settings.json')
      writeFileSync(path, JSON.stringify({ mcpServers: { other: {} } }), 'utf-8')
      expect(isRegistered(path)).toBe(false)
    })

    it('returns true when reevesagents entry exists in mcpServers', async () => {
      const { isRegistered } = await import('../src/mcp-setup.js')
      const path = join(tmpDir, 'settings.json')
      writeFileSync(path, JSON.stringify({
        mcpServers: { reevesagents: { command: 'reevesagents', args: ['mcp'] } }
      }), 'utf-8')
      expect(isRegistered(path)).toBe(true)
    })

    it('returns false for empty mcpServers object', async () => {
      const { isRegistered } = await import('../src/mcp-setup.js')
      const path = join(tmpDir, 'settings.json')
      writeFileSync(path, JSON.stringify({ mcpServers: {} }), 'utf-8')
      expect(isRegistered(path)).toBe(false)
    })
  })

  describe('registerAll', () => {
    it('returns an array', async () => {
      const { registerAll } = await import('../src/mcp-setup.js')
      expect(Array.isArray(registerAll())).toBe(true)
    })

    it('includes entries for all focused providers', async () => {
      const { registerAll } = await import('../src/mcp-setup.js')
      const names = registerAll().map(r => r.cli)
      expect(names).toContain('Claude Code')
      expect(names).toContain('Codex CLI')
      expect(names).toContain('OpenCode CLI')
      expect(names).toContain('Hermes')
    })

    it('each entry has cli, detected, registered, configPath fields', async () => {
      const { registerAll } = await import('../src/mcp-setup.js')
      for (const r of registerAll()) {
        expect(typeof r.cli).toBe('string')
        expect(typeof r.detected).toBe('boolean')
        expect(typeof r.registered).toBe('boolean')
        expect(typeof r.configPath).toBe('string')
      }
    })

    it('registers OpenCode in ~/.config/opencode/opencode.json when opencode is detected', async () => {
      addFakeBin('opencode')
      const { register, isRegistered } = await import('../src/mcp-setup.js')
      const result = register('opencode')
      const path = join(tmpDir, '.config', 'opencode', 'opencode.json')
      expect(result.registered).toBe(true)
      expect(isRegistered('opencode')).toBe(true)
      const server = JSON.parse(readFileSync(path, 'utf-8')).mcp.reevesagents
      expect(server.type).toBe('local')
      expect(server.enabled).toBe(true)
      expect(server.command).toEqual([expect.any(String), 'mcp'])
    })

    it('does not overwrite malformed JSON provider config', async () => {
      addFakeBin('claude')
      const path = join(tmpDir, '.claude', 'settings.json')
      mkdirSync(join(tmpDir, '.claude'), { recursive: true })
      writeFileSync(path, '{ bad json', 'utf-8')

      const { register } = await import('../src/mcp-setup.js')
      const result = register('cc')

      expect(result.registered).toBe(false)
      expect(result.note).toContain('Invalid JSON')
      expect(readFileSync(path, 'utf-8')).toBe('{ bad json')
    })

    it('registers Codex in ~/.codex/config.toml when codex is detected', async () => {
      addFakeBin('codex')
      const { register, isRegistered } = await import('../src/mcp-setup.js')
      const result = register('codex')
      const path = join(tmpDir, '.codex', 'config.toml')
      expect(result.registered).toBe(true)
      expect(isRegistered('codex')).toBe(true)
      expect(readFileSync(path, 'utf-8')).toContain('[mcp_servers.reevesagents]')
    })

    it('registers Hermes in ~/.hermes/config.yaml under mcp_servers', async () => {
      addFakeBin('hermes')
      const { register, isRegistered } = await import('../src/mcp-setup.js')
      const result = register('hermes')
      const path = join(tmpDir, '.hermes', 'config.yaml')
      expect(result.registered).toBe(true)
      expect(isRegistered('hermes')).toBe(true)
      expect(readFileSync(path, 'utf-8')).toContain('mcp_servers:')
      expect(readFileSync(path, 'utf-8')).toContain('  reevesagents:')
    })

    it('unregister removes provider-specific reevesagents entries', async () => {
      addFakeBin('hermes')
      const { register, unregister, isRegistered } = await import('../src/mcp-setup.js')
      register('hermes')
      unregister('hermes')
      expect(isRegistered('hermes')).toBe(false)
    })
  })
})
