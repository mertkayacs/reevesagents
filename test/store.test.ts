import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Preset } from '../src/core/types.js'

let testName: string
let tmpHome: string
let oldHome: string | undefined

beforeEach(() => {
  oldHome = process.env.HOME
  tmpHome = mkdtempSync(join(tmpdir(), 'reeves-store-test-'))
  process.env.HOME = tmpHome
  testName = `_test-${randomUUID().slice(0, 8)}`
})

afterEach(async () => {
  const { deletePreset } = await import('../src/core/store.js')
  deletePreset(testName)
  if (oldHome === undefined) delete process.env.HOME
  else process.env.HOME = oldHome
  rmSync(tmpHome, { recursive: true, force: true })
})

function makeTree(name: string, overrides: Partial<Preset> = {}): Preset {
  const now = new Date().toISOString()
  return {
    name,
    description: 'test tree',
    root: {
      nickname_template: 'root',
      provider: 'cc',
      model: '',
      auth_mode: 'default',
      effort: 'default',
      initial_prompt: 'do the work',
      working_dir: '/tmp',
      permissions: 'skip',
      rc_enabled: false,
    },
    workers: [],
    working_dir_pattern: '/tmp',
    created_at: now,
    updated_at: now,
    ...overrides,
  }
}

describe('store', () => {
  it('listPresets returns an array', async () => {
    const { listPresets } = await import('../src/core/store.js')
    expect(Array.isArray(listPresets())).toBe(true)
  })

  it('savePreset + loadPreset roundtrip', async () => {
    const { savePreset, loadPreset } = await import('../src/core/store.js')
    savePreset(makeTree(testName))
    const loaded = loadPreset(testName)
    expect(loaded?.name).toBe(testName)
    expect(loaded?.description).toBe('test tree')
    expect(loaded?.root.provider).toBe('cc')
    expect(loaded?.root.initial_prompt).toBe('do the work')
  })

  it('savePreset makes tree appear in listPresets', async () => {
    const { savePreset, listPresets } = await import('../src/core/store.js')
    savePreset(makeTree(testName))
    expect(listPresets().map(t => t.name)).toContain(testName)
  })

  it('savePreset with workers preserves worker array', async () => {
    const { savePreset, loadPreset } = await import('../src/core/store.js')
    const tree = makeTree(testName, {
      workers: [{
        nickname_template: 'worker-1',
        provider: 'codex',
        model: 'gpt-4o',
        auth_mode: 'default',
        effort: 'default',
        initial_prompt: 'help with research',
        working_dir: '/tmp',
        permissions: 'ask',
        rc_enabled: false,
      }]
    })
    savePreset(tree)
    const loaded = loadPreset(testName)
    expect(loaded?.workers).toHaveLength(1)
    expect(loaded?.workers[0]?.provider).toBe('codex')
    expect(loaded?.workers[0]?.initial_prompt).toBe('help with research')
  })

  it('deletePreset removes tree from listPresets', async () => {
    const { savePreset, deletePreset, listPresets } = await import('../src/core/store.js')
    savePreset(makeTree(testName))
    deletePreset(testName)
    expect(listPresets().map(t => t.name)).not.toContain(testName)
  })

  it('loadPreset returns null for a missing tree', async () => {
    const { loadPreset } = await import('../src/core/store.js')
    expect(loadPreset('definitely-does-not-exist-xyzzy-999')).toBeNull()
  })

  it('deletePreset on a missing tree does not throw', async () => {
    const { deletePreset } = await import('../src/core/store.js')
    expect(() => deletePreset('definitely-does-not-exist-xyzzy-999')).not.toThrow()
  })

  it('overwriting a tree with savePreset updates it', async () => {
    const { savePreset, loadPreset } = await import('../src/core/store.js')
    savePreset(makeTree(testName, { description: 'original' }))
    savePreset(makeTree(testName, { description: 'updated' }))
    expect(loadPreset(testName)?.description).toBe('updated')
  })

  it('persists a tree with one worker of every provider', async () => {
    const { savePreset, loadPreset } = await import('../src/core/store.js')
    const tree = makeTree(testName, {
      workers: [
        { nickname_template: 'claude-w', provider: 'cc',     model: 'sonnet',   auth_mode: 'default', effort: 'high', initial_prompt: 'cc prompt',     working_dir: '/tmp', permissions: 'ask', rc_enabled: true  },
        { nickname_template: 'codex-w',  provider: 'codex',  model: 'gpt-5',    auth_mode: 'default', effort: 'default', initial_prompt: 'codex prompt', working_dir: '/tmp', permissions: 'ask', rc_enabled: true  },
        { nickname_template: 'opencode-w', provider: 'opencode', model: 'pro',      auth_mode: 'default', effort: 'default', initial_prompt: 'opencode prompt',working_dir: '/tmp', permissions: 'skip',rc_enabled: false },
        { nickname_template: 'hermes-w', provider: 'hermes', model: 'haiku',    auth_mode: 'default', effort: 'default', initial_prompt: 'hermes prompt',working_dir: '/tmp', permissions: 'ask', rc_enabled: false },
        { nickname_template: 'kimi-w', provider: 'kimi', model: 'kimi-code/kimi-for-coding', auth_mode: 'default', effort: 'default', initial_prompt: 'kimi prompt', working_dir: '/tmp', permissions: 'ask', rc_enabled: false },
        { nickname_template: 'deepseek-w', provider: 'deepseek', model: 'deepseek-coder:6.7b', auth_mode: 'default', effort: 'default', initial_prompt: 'deepseek prompt', working_dir: '/tmp', permissions: 'ask', rc_enabled: false },
        { nickname_template: 'pi-w', provider: 'pi', model: 'sonnet', auth_mode: 'default', effort: 'default', initial_prompt: 'pi prompt', working_dir: '/tmp', permissions: 'ask', rc_enabled: false },
        { nickname_template: 'qwen-w', provider: 'qwen', model: 'qwen3-coder-plus', auth_mode: 'default', effort: 'default', initial_prompt: 'qwen prompt', working_dir: '/tmp', permissions: 'skip', rc_enabled: false },
        { nickname_template: 'aider-w', provider: 'aider', model: 'deepseek/deepseek-chat', auth_mode: 'default', effort: 'default', initial_prompt: 'aider prompt', working_dir: '/tmp', permissions: 'skip', rc_enabled: false },
      ],
    })
    savePreset(tree)
    const loaded = loadPreset(testName)
    expect(loaded?.workers).toHaveLength(9)
    expect(loaded?.workers.map(w => w.provider)).toEqual(['cc', 'codex', 'opencode', 'hermes', 'kimi', 'deepseek', 'pi', 'qwen', 'aider'])
    expect(loaded?.workers.map(w => w.nickname_template)).toEqual(['claude-w', 'codex-w', 'opencode-w', 'hermes-w', 'kimi-w', 'deepseek-w', 'pi-w', 'qwen-w', 'aider-w'])
    expect(loaded?.workers.map(w => w.initial_prompt)).toEqual(['cc prompt', 'codex prompt', 'opencode prompt', 'hermes prompt', 'kimi prompt', 'deepseek prompt', 'pi prompt', 'qwen prompt', 'aider prompt'])
    expect(loaded?.workers.map(w => w.model)).toEqual(['sonnet', 'gpt-5', 'pro', 'haiku', 'kimi-code/kimi-for-coding', 'deepseek-coder:6.7b', 'sonnet', 'qwen3-coder-plus', 'deepseek/deepseek-chat'])
    // permissions/rc per-worker should not leak between slots
    expect(loaded?.workers[2]?.permissions).toBe('skip')
    expect(loaded?.workers[0]?.rc_enabled).toBe(true)
    expect(loaded?.workers[3]?.rc_enabled).toBe(false)
  })

  it('persists heterogeneous workers with their own providers and prompts', async () => {
    const { savePreset, loadPreset } = await import('../src/core/store.js')
    const tree = makeTree(testName, {
      workers: [
        {
          nickname_template: 'researcher',
          provider: 'cc',
          model: 'sonnet',
          auth_mode: 'default',
          effort: 'high',
          initial_prompt: 'research the topic',
          working_dir: '/tmp',
          permissions: 'ask',
          rc_enabled: false,
        },
        {
          nickname_template: 'tester',
          provider: 'codex',
          model: 'gpt-5',
          auth_mode: 'default',
          effort: 'default',
          initial_prompt: 'write the tests',
          working_dir: '/tmp',
          permissions: 'ask',
          rc_enabled: true,
        },
        {
          nickname_template: 'docs',
          provider: 'opencode',
          model: '',
          auth_mode: 'default',
          effort: 'default',
          initial_prompt: 'document the API',
          working_dir: '/tmp',
          permissions: 'skip',
          rc_enabled: false,
        },
      ],
    })
    savePreset(tree)
    const loaded = loadPreset(testName)
    expect(loaded?.workers).toHaveLength(3)
    expect(loaded?.workers[0]?.provider).toBe('cc')
    expect(loaded?.workers[0]?.nickname_template).toBe('researcher')
    expect(loaded?.workers[0]?.initial_prompt).toBe('research the topic')
    expect(loaded?.workers[1]?.provider).toBe('codex')
    expect(loaded?.workers[1]?.nickname_template).toBe('tester')
    expect(loaded?.workers[1]?.initial_prompt).toBe('write the tests')
    expect(loaded?.workers[2]?.provider).toBe('opencode')
    expect(loaded?.workers[2]?.nickname_template).toBe('docs')
    expect(loaded?.workers[2]?.permissions).toBe('skip')
  })

  it('loads legacy task_template field as initial_prompt', async () => {
    const { loadPreset, presetsDir } = await import('../src/core/store.js')
    const dir = presetsDir()
    mkdirSync(dir, { recursive: true })
    const legacy = {
      name: testName,
      description: 'legacy preset',
      root: {
        nickname_template: 'root',
        provider: 'cc',
        model: '',
        auth_mode: 'default',
        effort: 'default',
        task_template: 'inherited from old preset',
        working_dir: '/tmp',
        permissions: 'ask',
        rc_enabled: false,
      },
      workers: [{
        nickname_template: 'worker-1',
        provider: 'codex',
        model: '',
        auth_mode: 'default',
        effort: 'default',
        task_template: 'legacy worker prompt',
        working_dir: '/tmp',
        permissions: 'ask',
        rc_enabled: false,
      }],
      working_dir_pattern: '/tmp',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    writeFileSync(join(dir, `${testName}.json`), JSON.stringify(legacy), 'utf-8')
    const loaded = loadPreset(testName)
    expect(loaded?.root.initial_prompt).toBe('inherited from old preset')
    expect(loaded?.workers[0]?.initial_prompt).toBe('legacy worker prompt')
  })
})
