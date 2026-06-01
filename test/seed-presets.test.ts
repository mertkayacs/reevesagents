import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let tmpHome: string
let oldHome: string | undefined

beforeEach(() => {
  oldHome = process.env.HOME
  tmpHome = mkdtempSync(join(tmpdir(), 'reeves-seed-test-'))
  process.env.HOME = tmpHome
})

afterEach(() => {
  if (oldHome === undefined) delete process.env.HOME
  else process.env.HOME = oldHome
  rmSync(tmpHome, { recursive: true, force: true })
})

describe('seed-presets', () => {
  it('defaultPresets returns the two expected trees with correct providers', async () => {
    const { defaultPresets } = await import('../src/state/seed-presets.js')
    const presets = defaultPresets()
    expect(presets).toHaveLength(2)

    const research = presets.find(p => p.name === 'research-team')
    expect(research?.root.provider).toBe('hermes')
    expect(research?.workers.map(w => w.provider)).toEqual(['cc', 'codex', 'opencode'])

    const pair = presets.find(p => p.name === 'claude-code-pair')
    expect(pair?.root.provider).toBe('cc')
    expect(pair?.workers.map(w => w.provider)).toEqual(['cc', 'codex'])
  })

  it('every slot has a non-empty initial_prompt', async () => {
    const { defaultPresets } = await import('../src/state/seed-presets.js')
    for (const p of defaultPresets()) {
      expect(p.root.initial_prompt.length).toBeGreaterThan(0)
      for (const w of p.workers) {
        expect(w.initial_prompt.length).toBeGreaterThan(0)
      }
    }
  })

  it('seedDefaultPresetsIfEmpty writes both presets when the dir is empty', async () => {
    const { seedDefaultPresetsIfEmpty } = await import('../src/state/seed-presets.js')
    const { listSavedTrees } = await import('../src/state/store.js')

    const written = seedDefaultPresetsIfEmpty()
    expect(written.sort()).toEqual(['claude-code-pair', 'research-team'])

    const loaded = listSavedTrees()
    expect(loaded.map(t => t.name).sort()).toEqual(['claude-code-pair', 'research-team'])
    expect(loaded.find(t => t.name === 'research-team')?.workers).toHaveLength(3)
    expect(loaded.find(t => t.name === 'claude-code-pair')?.workers).toHaveLength(2)
  })

  it('seedDefaultPresetsIfEmpty is a no-op when any preset already exists', async () => {
    const { seedDefaultPresetsIfEmpty } = await import('../src/state/seed-presets.js')
    const { savedTreesDir, saveSavedTree } = await import('../src/state/store.js')

    // Pre-seed a single user preset.
    saveSavedTree({
      name: 'my-thing',
      description: 'user-owned',
      working_dir_pattern: '',
      root: {
        nickname_template: 'root',
        provider: 'cc',
        model: '',
        auth_mode: 'default',
        effort: 'default',
        initial_prompt: 'do the work',
        working_dir: '',
        permissions: 'ask',
        rc_enabled: false,
      },
      workers: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    expect(existsSync(savedTreesDir())).toBe(true)

    const written = seedDefaultPresetsIfEmpty()
    expect(written).toEqual([])

    const { listSavedTrees } = await import('../src/state/store.js')
    const names = listSavedTrees().map(t => t.name)
    expect(names).toEqual(['my-thing'])
  })

  it('survives an unreadable presets dir', async () => {
    // Pre-create the dir as a regular file so readdir fails. seed should
    // catch the error and either skip or write through saveSavedTree (which
    // will fail too); either way it must not throw.
    const { savedTreesDir } = await import('../src/state/store.js')
    const dir = savedTreesDir()
    mkdirSync(join(dir, '..'), { recursive: true })
    writeFileSync(dir, 'not a dir', 'utf-8')

    const { seedDefaultPresetsIfEmpty } = await import('../src/state/seed-presets.js')
    expect(() => seedDefaultPresetsIfEmpty()).not.toThrow()
  })
})
