import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
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
    const { configExists } = await import('../src/state/config.js')
    expect(configExists()).toBe(false)
  })

  it('defaultConfig returns valid v4 structure', async () => {
    const { defaultConfig } = await import('../src/state/config.js')
    const cfg = defaultConfig()
    expect(cfg.version).toBe(2)
    expect(typeof cfg.global).toBe('object')
    expect(typeof cfg.global.peek_interval_ms).toBe('number')
    expect(typeof cfg.global.max_agents).toBe('number')
  })

  it('saveConfig then loadConfig roundtrip', async () => {
    const { saveConfig, loadConfig, defaultConfig } = await import('../src/state/config.js')
    const original = defaultConfig()
    original.global.peek_lines = 20
    original.global.max_agents = 5
    saveConfig(original)
    const loaded = loadConfig()
    expect(loaded.global.peek_lines).toBe(20)
    expect(loaded.global.max_agents).toBe(5)
  })

  it('loadConfig returns defaults when file missing', async () => {
    const { loadConfig, defaultConfig } = await import('../src/state/config.js')
    const loaded = loadConfig()
    const defaults = defaultConfig()
    expect(loaded.version).toBe(defaults.version)
    expect(loaded.global.peek_interval_ms).toBe(defaults.global.peek_interval_ms)
  })

  it('configExists returns true after save', async () => {
    const { saveConfig, defaultConfig, configExists } = await import('../src/state/config.js')
    saveConfig(defaultConfig())
    expect(configExists()).toBe(true)
  })
})
