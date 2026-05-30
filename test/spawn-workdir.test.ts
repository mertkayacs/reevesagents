import { describe, it, expect } from 'vitest'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, rmSync } from 'node:fs'
import { randomInt } from 'node:crypto'

describe('spawn working directory resolution', () => {
  describe('expandHome', () => {
    it('expands ~ to homedir', async () => {
      const { expandHome } = await import('../src/launcher/provider-launch.js')
      expect(expandHome('~')).toBe(homedir())
    })

    it('expands ~/foo to homedir/foo', async () => {
      const { expandHome } = await import('../src/launcher/provider-launch.js')
      expect(expandHome('~/projects')).toBe(join(homedir(), 'projects'))
    })

    it('leaves absolute paths unchanged', async () => {
      const { expandHome } = await import('../src/launcher/provider-launch.js')
      expect(expandHome('/usr/local/bin')).toBe('/usr/local/bin')
    })

    it('leaves relative paths unchanged', async () => {
      const { expandHome } = await import('../src/launcher/provider-launch.js')
      expect(expandHome('relative/path')).toBe('relative/path')
    })
  })

  describe('resolveWorkingDir', () => {
    it('returns fallback when requested is undefined', async () => {
      const { resolveWorkingDir } = await import('../src/launcher/provider-launch.js')
      expect(resolveWorkingDir(undefined, '/fallback')).toBe('/fallback')
    })

    it('returns fallback when requested is empty string', async () => {
      const { resolveWorkingDir } = await import('../src/launcher/provider-launch.js')
      expect(resolveWorkingDir('', '/fallback')).toBe('/fallback')
    })

    it('returns the path when directory exists', async () => {
      const { resolveWorkingDir } = await import('../src/launcher/provider-launch.js')
      const dir = tmpdir()
      expect(resolveWorkingDir(dir, '/fallback')).toBe(dir)
    })

    it('throws when requested directory does not exist', async () => {
      const { resolveWorkingDir } = await import('../src/launcher/provider-launch.js')
      const nonexistent = join(tmpdir(), `nonexistent-${randomInt(0, 1e9)}`)
      expect(() => resolveWorkingDir(nonexistent, '/fallback')).toThrow(/Working directory does not exist/)
    })

    it('expands ~ and returns path when expanded dir exists', async () => {
      const { resolveWorkingDir } = await import('../src/launcher/provider-launch.js')
      // homedir() always exists
      expect(resolveWorkingDir('~', '/fallback')).toBe(homedir())
    })

    it('trims leading/trailing whitespace from path', async () => {
      const { resolveWorkingDir } = await import('../src/launcher/provider-launch.js')
      const dir = tmpdir()
      expect(resolveWorkingDir(`  ${dir}  `, '/fallback')).toBe(dir)
    })

    it('creates a real tmpdir and resolves it correctly', async () => {
      const { resolveWorkingDir } = await import('../src/launcher/provider-launch.js')
      const dir = join(tmpdir(), `spawn-wd-test-${randomInt(0, 1e9)}`)
      mkdirSync(dir, { recursive: true })
      try {
        expect(resolveWorkingDir(dir, '/fallback')).toBe(dir)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
  })

  describe('launch command helpers', () => {
    it('adds Codex MCP env override as TOML inline table', async () => {
      const { codexMcpEnvOverride } = await import('../src/launcher/provider-launch.js')
      expect(codexMcpEnvOverride({
        REEVES_SESSION_ID: 'abc',
        REEVES_REGISTRY: '/tmp/reeves "registry"',
      })).toBe('mcp_servers.reevesagents.env={REEVES_SESSION_ID="abc",REEVES_REGISTRY="/tmp/reeves \\"registry\\""}')
    })

    it('builds explicit Codex MCP command overrides', async () => {
      const { codexMcpOverrides } = await import('../src/launcher/provider-launch.js')
      const node = process.execPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      expect(codexMcpOverrides({
        REEVES_SESSION_ID: 'abc',
        REEVES_REGISTRY: '/tmp/reeves',
      }, '/repo/dist/cli.js')).toEqual([
        '-c',
        `mcp_servers.reevesagents.command="${node}"`,
        '-c',
        'mcp_servers.reevesagents.args=["/repo/dist/cli.js","mcp"]',
        '-c',
        'mcp_servers.reevesagents.env={REEVES_SESSION_ID="abc",REEVES_REGISTRY="/tmp/reeves"}',
      ])
    })

    it('uses PATH command directly for MCP launch fallback', async () => {
      const { reevesMcpServerLaunch } = await import('../src/launcher/provider-launch.js')
      expect(reevesMcpServerLaunch('reevesagents')).toEqual({ command: 'reevesagents', args: ['mcp'] })
    })

    it('builds explicit Claude MCP config with Reeves session env', async () => {
      const { claudeMcpConfig } = await import('../src/launcher/provider-launch.js')
      expect(claudeMcpConfig({
        REEVES_SESSION_ID: 'abc',
        REEVES_REGISTRY: '/tmp/reeves',
      }, '/repo/dist/cli.js')).toEqual({
        mcpServers: {
          reevesagents: {
            command: process.execPath,
            args: ['/repo/dist/cli.js', 'mcp'],
            env: {
              REEVES_SESSION_ID: 'abc',
              REEVES_REGISTRY: '/tmp/reeves',
            },
          },
        },
      })
    })

    it('falls back to reevesagents path for test runner argv', async () => {
      const { resolveReevesMcpCommand } = await import('../src/launcher/provider-launch.js')
      expect(resolveReevesMcpCommand('/repo/node_modules/vitest/vitest.mjs')).toBe('reevesagents')
    })

    it('does not pass initial Codex task as a launch argument', async () => {
      const { launchCommandWithInitialTask } = await import('../src/launcher/provider-launch.js')
      expect(launchCommandWithInitialTask('codex', ['codex', '--model', 'gpt'], 'do work'))
        .toEqual(['codex', '--model', 'gpt'])
    })

    it('does not use Claude Code print mode for startup tasks', async () => {
      const { launchCommandWithInitialTask } = await import('../src/launcher/provider-launch.js')
      expect(launchCommandWithInitialTask('cc', ['claude', '--bare'], 'do work'))
        .toEqual(['claude', '--bare'])
    })

    it('does not pass OpenCode initial tasks with --prompt', async () => {
      const { launchCommandWithInitialTask } = await import('../src/launcher/provider-launch.js')
      expect(launchCommandWithInitialTask('opencode', ['opencode'], 'do work')).toEqual(['opencode'])
    })

    it('leaves empty tasks for paste-buffer injection', async () => {
      const { launchCommandWithInitialTask } = await import('../src/launcher/provider-launch.js')
      expect(launchCommandWithInitialTask('opencode', ['opencode'], '   ')).toEqual(['opencode'])
      expect(launchCommandWithInitialTask('cc', ['claude'], '   ')).toEqual(['claude'])
    })

    it('execs Claude Code launch commands without prompt arguments', async () => {
      const { fullLaunchShellCommand } = await import('../src/launcher/provider-launch.js')
      expect(fullLaunchShellCommand('cc', 'export REEVES_SESSION_ID=abc', ['claude'], 'do work'))
        .toBe('export REEVES_SESSION_ID=abc && exec \'claude\'')
    })

    it('builds a one-shot runner that gives the child non-tty stdio', async () => {
      const { oneShotRunnerSource } = await import('../src/launcher/provider-launch.js')
      const source = oneShotRunnerSource(['claude', '--bare', '--print', 'do work'])
      expect(source).toContain('const command = ["claude","--bare","--print","do work"]')
      expect(source).toContain("stdio: ['ignore', 'pipe', 'pipe']")
    })

    it('execs non-one-shot launch commands', async () => {
      const { fullLaunchShellCommand } = await import('../src/launcher/provider-launch.js')
      expect(fullLaunchShellCommand('codex', 'export REEVES_SESSION_ID=abc', ['codex'], 'do work'))
        .toBe('export REEVES_SESSION_ID=abc && exec \'codex\'')
      expect(fullLaunchShellCommand('opencode', 'export REEVES_SESSION_ID=abc', ['opencode'], 'do work'))
        .toBe('export REEVES_SESSION_ID=abc && exec \'opencode\'')
    })
  })
})
