import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rmSync } from 'node:fs'
import { randomInt } from 'node:crypto'

describe('config global fields', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = join(tmpdir(), `config-global-test-${randomInt(0, 1e9)}`)
    process.env.REEVES_CONFIG = join(tmpDir, 'config.json')
  })

  afterEach(() => {
    delete process.env.REEVES_CONFIG
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('loads global defaults when config missing', async () => {
    const { loadConfig } = await import('../src/core/config.js')
    const cfg = loadConfig()
    expect(cfg.global.peek_interval_ms).toBe(5000)
    expect(cfg.global.peek_lines).toBe(10)
    expect(cfg.global.max_depth).toBe(5)
    expect(cfg.global.max_agents).toBe(100)
    expect(cfg.global.ready_delay_ms).toBe(5000)
    expect(cfg.global.max_lifetime_ms).toBe(0)
    expect(cfg.global.default_permissions).toBe('ask')
    expect(cfg.global.language).toBe('en')
  })

  it('preserves global config on save and reload', async () => {
    const { loadConfig, saveConfig } = await import('../src/core/config.js')
    const cfg = loadConfig()
    cfg.global.peek_interval_ms = 5000
    cfg.global.default_permissions = 'ask'
    cfg.global.language = 'tr'
    saveConfig(cfg)
    const reloaded = loadConfig()
    expect(reloaded.global.peek_interval_ms).toBe(5000)
    expect(reloaded.global.default_permissions).toBe('ask')
    expect(reloaded.global.language).toBe('tr')
  })
})
