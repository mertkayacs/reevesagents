import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { AgentRecord, Provider, RunRecord, PresetSlot } from '../src/core/types.js'
import { PROVIDERS } from '../src/core/providers.js'
import type { RuntimeDriver } from '../src/core/runtime.js'

// Coverage for the two shared preset helpers every interface reuses:
// savePresetFromRun (run -> preset) and startRunFromPreset (preset -> run).

let tmpDir: string
let savedTmux: string | undefined

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeves-presets-domain-'))
  process.env.REEVES_REGISTRY = tmpDir
  process.env.REEVES_CONFIG = join(tmpDir, 'config.json')
  savedTmux = process.env.TMUX
  delete process.env.TMUX
})

afterEach(() => {
  delete process.env.REEVES_REGISTRY
  delete process.env.REEVES_CONFIG
  if (savedTmux === undefined) delete process.env.TMUX
  else process.env.TMUX = savedTmux
  rmSync(tmpDir, { recursive: true, force: true })
})

const available = Object.fromEntries(PROVIDERS.map(p => [p, true])) as Record<Provider, boolean>

class FakeDriver implements RuntimeDriver {
  nextWindow = 1
  tmux(args: string[]): string {
    if (args[0] === 'display-message') return '@0 %0'
    if (args[0] === 'new-window') { const id = this.nextWindow++; return `@${id} %${id}` }
    if (args[0] === 'capture-pane') return 'ready'
    return ''
  }
  delay(fn: () => void): void { fn() }
}

function makeRun(id: string, overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id,
    name: `run-${id}`,
    status: 'running',
    tmux_session: `reeves-${id}`,
    reeves_window_id: '@0',
    reeves_pane_id: '%0',
    root_agent_id: `${id}-root`,
    working_dir: '/tmp',
    preset_name: null,
    started_at: '2026-01-01T00:00:00.000Z',
    ended_at: null,
    ...overrides,
  }
}

function makeAgent(id: string, runId: string, overrides: Partial<AgentRecord> = {}): AgentRecord {
  return {
    id,
    run_id: runId,
    nickname: `agent-${id}`,
    provider: 'cc',
    model: '',
    role: 'worker',
    working_dir: '/tmp',
    task: 'do work',
    task_status: 'working',
    task_note: '',
    tmux_session: `reeves-${runId}`,
    tmux_window_id: '@1',
    tmux_pane_id: '%1',
    rc_enabled: false,
    permissions: 'ask',
    inbox: [],
    last_seen: 0,
    started_at: '2026-01-01T00:00:01.000Z',
    ended_at: null,
    ...overrides,
  }
}

function slot(overrides: Partial<PresetSlot>): PresetSlot {
  return {
    nickname_template: 'worker',
    provider: 'cc',
    model: '',
    auth_mode: 'default',
    effort: 'default',
    initial_prompt: '',
    working_dir: '',
    permissions: 'ask',
    rc_enabled: false,
    ...overrides,
  }
}

describe('savePresetFromRun', () => {
  it('captures the root and workers into a sanitized preset', async () => {
    const { writeRun, writeAgent } = await import('../src/core/runs.js')
    const { savePresetFromRun, loadPreset } = await import('../src/core/store.js')
    writeRun(makeRun('r1'))
    writeAgent(makeAgent('r1-root', 'r1', { role: 'root', nickname: 'lead', provider: 'cc', model: 'opus', task: 'plan it', permissions: 'skip', started_at: '2026-01-01T00:00:01.000Z' }))
    writeAgent(makeAgent('r1-w', 'r1', { role: 'worker', nickname: 'builder', provider: 'codex', task: 'build it', started_at: '2026-01-01T00:00:02.000Z' }))

    const tree = savePresetFromRun('r1', 'My Team!')
    expect(tree.name).toBe('My-Team')
    expect(tree.root.nickname_template).toBe('lead')
    expect(tree.root.provider).toBe('cc')
    expect(tree.root.model).toBe('opus')
    expect(tree.root.initial_prompt).toBe('plan it')
    expect(tree.root.permissions).toBe('skip')
    expect(tree.workers.map(w => w.nickname_template)).toEqual(['builder'])
    expect(loadPreset('My-Team')?.workers).toHaveLength(1)
  })

  it('keeps created_at when re-saving under the same name', async () => {
    const { writeRun, writeAgent } = await import('../src/core/runs.js')
    const { savePresetFromRun } = await import('../src/core/store.js')
    writeRun(makeRun('r2'))
    writeAgent(makeAgent('r2-root', 'r2', { role: 'root' }))
    const first = savePresetFromRun('r2', 'keepme')
    const second = savePresetFromRun('r2', 'keepme')
    expect(second.created_at).toBe(first.created_at)
  })

  it('rejects an empty name and a run with no capturable agents', async () => {
    const { writeRun, writeAgent } = await import('../src/core/runs.js')
    const { savePresetFromRun } = await import('../src/core/store.js')
    writeRun(makeRun('r3'))
    writeAgent(makeAgent('r3-h', 'r3', { role: 'root', headless: true }))
    expect(() => savePresetFromRun('r3', '   ')).toThrow(/name is required/)
    expect(() => savePresetFromRun('r3', 'only-headless')).toThrow(/no agents/)
  })
})

describe('startRunFromPreset', () => {
  it('starts a run from a saved preset, root first then workers', async () => {
    const { savePreset } = await import('../src/core/store.js')
    const { startRunFromPreset } = await import('../src/core/runtime.js')
    const { listRuns, listAgents } = await import('../src/core/runs.js')
    savePreset({
      name: 'duo',
      description: '',
      working_dir_pattern: '',
      root: slot({ nickname_template: 'lead', provider: 'cc', initial_prompt: 'lead the work' }),
      workers: [slot({ nickname_template: 'hand', provider: 'codex', initial_prompt: 'do the work' })],
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    })

    const result = startRunFromPreset('duo', { working_dir: '/tmp' }, { driver: new FakeDriver(), available })
    expect(result.run.preset_name).toBe('duo')
    expect(result.run.name).toBe('duo')
    expect(result.agents.map(a => a.nickname)).toEqual(['lead', 'hand'])
    expect(listRuns()).toHaveLength(1)
    expect(listAgents(result.run.id)).toHaveLength(2)
  })

  it('throws for an unknown preset', async () => {
    const { startRunFromPreset } = await import('../src/core/runtime.js')
    expect(() => startRunFromPreset('ghost', {}, { driver: new FakeDriver(), available })).toThrow(/preset not found/)
  })
})
