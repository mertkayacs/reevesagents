import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SavedTree } from '../src/state/types.js'

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
  const { deleteSavedTree } = await import('../src/state/store.js')
  deleteSavedTree(testName)
  if (oldHome === undefined) delete process.env.HOME
  else process.env.HOME = oldHome
  rmSync(tmpHome, { recursive: true, force: true })
})

function makeTree(name: string, overrides: Partial<SavedTree> = {}): SavedTree {
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
  it('listSavedTrees returns an array', async () => {
    const { listSavedTrees } = await import('../src/state/store.js')
    expect(Array.isArray(listSavedTrees())).toBe(true)
  })

  it('saveSavedTree + loadSavedTree roundtrip', async () => {
    const { saveSavedTree, loadSavedTree } = await import('../src/state/store.js')
    saveSavedTree(makeTree(testName))
    const loaded = loadSavedTree(testName)
    expect(loaded?.name).toBe(testName)
    expect(loaded?.description).toBe('test tree')
    expect(loaded?.root.provider).toBe('cc')
    expect(loaded?.root.initial_prompt).toBe('do the work')
  })

  it('saveSavedTree makes tree appear in listSavedTrees', async () => {
    const { saveSavedTree, listSavedTrees } = await import('../src/state/store.js')
    saveSavedTree(makeTree(testName))
    expect(listSavedTrees().map(t => t.name)).toContain(testName)
  })

  it('saveSavedTree with workers preserves worker array', async () => {
    const { saveSavedTree, loadSavedTree } = await import('../src/state/store.js')
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
    saveSavedTree(tree)
    const loaded = loadSavedTree(testName)
    expect(loaded?.workers).toHaveLength(1)
    expect(loaded?.workers[0]?.provider).toBe('codex')
    expect(loaded?.workers[0]?.initial_prompt).toBe('help with research')
  })

  it('deleteSavedTree removes tree from listSavedTrees', async () => {
    const { saveSavedTree, deleteSavedTree, listSavedTrees } = await import('../src/state/store.js')
    saveSavedTree(makeTree(testName))
    deleteSavedTree(testName)
    expect(listSavedTrees().map(t => t.name)).not.toContain(testName)
  })

  it('loadSavedTree returns null for a missing tree', async () => {
    const { loadSavedTree } = await import('../src/state/store.js')
    expect(loadSavedTree('definitely-does-not-exist-xyzzy-999')).toBeNull()
  })

  it('deleteSavedTree on a missing tree does not throw', async () => {
    const { deleteSavedTree } = await import('../src/state/store.js')
    expect(() => deleteSavedTree('definitely-does-not-exist-xyzzy-999')).not.toThrow()
  })

  it('overwriting a tree with saveSavedTree updates it', async () => {
    const { saveSavedTree, loadSavedTree } = await import('../src/state/store.js')
    saveSavedTree(makeTree(testName, { description: 'original' }))
    saveSavedTree(makeTree(testName, { description: 'updated' }))
    expect(loadSavedTree(testName)?.description).toBe('updated')
  })

  it('persists a tree with one worker of every provider', async () => {
    const { saveSavedTree, loadSavedTree } = await import('../src/state/store.js')
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
    saveSavedTree(tree)
    const loaded = loadSavedTree(testName)
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
    const { saveSavedTree, loadSavedTree } = await import('../src/state/store.js')
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
    saveSavedTree(tree)
    const loaded = loadSavedTree(testName)
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
    const { loadSavedTree, savedTreesDir } = await import('../src/state/store.js')
    const dir = savedTreesDir()
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
    const loaded = loadSavedTree(testName)
    expect(loaded?.root.initial_prompt).toBe('inherited from old preset')
    expect(loaded?.workers[0]?.initial_prompt).toBe('legacy worker prompt')
  })
})
