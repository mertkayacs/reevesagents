import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

let tmpDir: string
let cfgPath: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeves-config-test-'))
  cfgPath = join(tmpDir, 'config.json')
  process.env.REEVES_CONFIG = cfgPath
})

afterEach(() => {
  delete process.env.REEVES_CONFIG
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('config', () => {
  it('configExists returns false when no file', async () => {
    const { configExists } = await import('../src/core/config.js')
    expect(configExists()).toBe(false)
  })

  it('defaultConfig returns valid v4 structure', async () => {
    const { defaultConfig } = await import('../src/core/config.js')
    const cfg = defaultConfig()
    expect(cfg.version).toBe(2)
    expect(typeof cfg.global).toBe('object')
    expect(typeof cfg.global.peek_interval_ms).toBe('number')
    expect(typeof cfg.global.max_agents).toBe('number')
    expect(cfg.global.language).toBe('en')
  })

  it('saveConfig then loadConfig roundtrip', async () => {
    const { saveConfig, loadConfig, defaultConfig } = await import('../src/core/config.js')
    const original = defaultConfig()
    original.global.peek_lines = 20
    original.global.max_agents = 5
    saveConfig(original)
    const loaded = loadConfig()
    expect(loaded.global.peek_lines).toBe(20)
    expect(loaded.global.max_agents).toBe(5)
  })

  it('loadConfig returns defaults when file missing', async () => {
    const { loadConfig, defaultConfig } = await import('../src/core/config.js')
    const loaded = loadConfig()
    const defaults = defaultConfig()
    expect(loaded.version).toBe(defaults.version)
    expect(loaded.global.peek_interval_ms).toBe(defaults.global.peek_interval_ms)
  })

  it('configExists returns true after save', async () => {
    const { saveConfig, defaultConfig, configExists } = await import('../src/core/config.js')
    saveConfig(defaultConfig())
    expect(configExists()).toBe(true)
  })

  it('ignores a pre-block-68 flow_tick_ms and warns exactly once (block 68)', async () => {
    // The setting is gone; the key in an existing config is not an error and not a setting — it is ignored, and the
    // operator is told once, because a file that is silently ignored is a file that keeps misleading its owner.
    writeFileSync(cfgPath, JSON.stringify({ version: 2, global: { flow_tick_ms: 60000, peek_lines: 7 } }), 'utf-8')
    const writes: string[] = []
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: unknown) => {
      writes.push(String(chunk))
      return true
    }) as never)
    try {
      const { loadConfig } = await import('../src/core/config.js')
      const loaded = loadConfig()
      // The rest of the file still loads, and the removed key is not part of the config any more.
      expect(loaded.global.peek_lines).toBe(7)
      expect('flow_tick_ms' in loaded.global).toBe(false)

      loadConfig()
      loadConfig()
      const warned = writes.filter(line => line.includes('flow_tick_ms is ignored'))
      expect(warned).toHaveLength(1)
      expect(warned[0]).toContain('flow_tick_ms is ignored: the flow driver is the external ticker (reeves-flow-tick.timer / cron)')
    } finally {
      spy.mockRestore()
    }
  })
})
