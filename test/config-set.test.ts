import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Coverage for the shared config-edit path that CLI/MCP/TUI/Web all route through:
// the field list, validated writes, and the string coercion CLI input uses.

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeves-config-set-'))
  process.env.REEVES_CONFIG = join(tmpDir, 'config.json')
})

afterEach(() => {
  delete process.env.REEVES_CONFIG
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('config editing', () => {
  it('CONFIG_FIELDS lists every editable global field in order', async () => {
    const { CONFIG_FIELDS } = await import('../src/core/config.js')
    expect(CONFIG_FIELDS.map(f => f.key)).toEqual([
      'peek_interval_ms', 'peek_lines', 'max_depth', 'max_agents', 'ready_delay_ms', 'max_lifetime_ms', 'default_permissions', 'language',
    ])
  })

  it('setConfigValues validates and persists a patch', async () => {
    const { setConfigValues, loadConfig } = await import('../src/core/config.js')
    setConfigValues({ max_agents: 20, default_permissions: 'skip', language: 'tr' })
    const cfg = loadConfig()
    expect(cfg.global.max_agents).toBe(20)
    expect(cfg.global.default_permissions).toBe('skip')
    expect(cfg.global.language).toBe('tr')
  })

  it('setConfigValues rejects invalid values and persists nothing', async () => {
    const { setConfigValues, loadConfig } = await import('../src/core/config.js')
    expect(() => setConfigValues({ max_agents: 0 })).toThrow(/positive integer/)
    expect(() => setConfigValues({ max_agents: -3 })).toThrow(/positive integer/)
    expect(() => setConfigValues({ peek_lines: 1.5 })).toThrow(/positive integer/)
    expect(() => setConfigValues({ ready_delay_ms: -1 })).toThrow(/zero or a positive/)
    expect(() => setConfigValues({ default_permissions: 'maybe' })).toThrow(/ask or skip/)
    expect(() => setConfigValues({ language: 'xx' })).toThrow(/unknown language/)
    expect(() => setConfigValues({ nonsense: 1 } as never)).toThrow(/unknown config field/)
    expect(loadConfig().global.max_agents).toBe(100)
  })

  it('ready_delay_ms accepts zero', async () => {
    const { setConfigValues, loadConfig } = await import('../src/core/config.js')
    setConfigValues({ ready_delay_ms: 0 })
    expect(loadConfig().global.ready_delay_ms).toBe(0)
  })

  it('max_lifetime_ms accepts zero and positive, rejects negative and non-integer', async () => {
    const { setConfigValues, loadConfig } = await import('../src/core/config.js')
    setConfigValues({ max_lifetime_ms: 0 })
    expect(loadConfig().global.max_lifetime_ms).toBe(0)
    setConfigValues({ max_lifetime_ms: 3_600_000 })
    expect(loadConfig().global.max_lifetime_ms).toBe(3_600_000)
    expect(() => setConfigValues({ max_lifetime_ms: -1 })).toThrow(/zero or a positive/)
    expect(() => setConfigValues({ max_lifetime_ms: 1.5 })).toThrow(/zero or a positive/)
    // the rejected writes left the last good value in place
    expect(loadConfig().global.max_lifetime_ms).toBe(3_600_000)
  })

  it('parseConfigValue coerces numeric strings and validates the key', async () => {
    const { parseConfigValue } = await import('../src/core/config.js')
    expect(parseConfigValue('max_agents', '15')).toBe(15)
    expect(parseConfigValue('default_permissions', 'skip')).toBe('skip')
    expect(parseConfigValue('language', 'de')).toBe('de')
    expect(() => parseConfigValue('max_agents', 'abc')).toThrow(/must be a number/)
    expect(() => parseConfigValue('bogus', '1')).toThrow(/unknown config field/)
  })
})
