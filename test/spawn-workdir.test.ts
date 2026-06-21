import { describe, it, expect } from 'vitest'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, rmSync } from 'node:fs'
import { randomInt } from 'node:crypto'

describe('spawn working directory resolution', () => {
  describe('expandHome', () => {
    it('expands ~ to homedir', async () => {
      const { expandHome } = await import('../src/core/provider-launch.js')
      expect(expandHome('~')).toBe(homedir())
    })

    it('expands ~/foo to homedir/foo', async () => {
      const { expandHome } = await import('../src/core/provider-launch.js')
      expect(expandHome('~/projects')).toBe(join(homedir(), 'projects'))
    })

    it('leaves absolute paths unchanged', async () => {
      const { expandHome } = await import('../src/core/provider-launch.js')
      expect(expandHome('/usr/local/bin')).toBe('/usr/local/bin')
    })

    it('leaves relative paths unchanged', async () => {
      const { expandHome } = await import('../src/core/provider-launch.js')
      expect(expandHome('relative/path')).toBe('relative/path')
    })
  })

  describe('resolveWorkingDir', () => {
    it('returns fallback when requested is undefined', async () => {
      const { resolveWorkingDir } = await import('../src/core/provider-launch.js')
      expect(resolveWorkingDir(undefined, '/fallback')).toBe('/fallback')
    })

    it('returns fallback when requested is empty string', async () => {
      const { resolveWorkingDir } = await import('../src/core/provider-launch.js')
      expect(resolveWorkingDir('', '/fallback')).toBe('/fallback')
    })

    it('returns the path when directory exists', async () => {
      const { resolveWorkingDir } = await import('../src/core/provider-launch.js')
      const dir = tmpdir()
      expect(resolveWorkingDir(dir, '/fallback')).toBe(dir)
    })

    it('throws when requested directory does not exist', async () => {
      const { resolveWorkingDir } = await import('../src/core/provider-launch.js')
      const nonexistent = join(tmpdir(), `nonexistent-${randomInt(0, 1e9)}`)
      expect(() => resolveWorkingDir(nonexistent, '/fallback')).toThrow(/Working directory does not exist/)
    })

    it('expands ~ and returns path when expanded dir exists', async () => {
      const { resolveWorkingDir } = await import('../src/core/provider-launch.js')
      // homedir() always exists
      expect(resolveWorkingDir('~', '/fallback')).toBe(homedir())
    })

    it('trims leading/trailing whitespace from path', async () => {
      const { resolveWorkingDir } = await import('../src/core/provider-launch.js')
      const dir = tmpdir()
      expect(resolveWorkingDir(`  ${dir}  `, '/fallback')).toBe(dir)
    })

    it('creates a real tmpdir and resolves it correctly', async () => {
      const { resolveWorkingDir } = await import('../src/core/provider-launch.js')
      const dir = join(tmpdir(), `spawn-wd-test-${randomInt(0, 1e9)}`)
      mkdirSync(dir, { recursive: true })
      try {
        expect(resolveWorkingDir(dir, '/fallback')).toBe(dir)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
  })
})
