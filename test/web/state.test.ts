import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { archiveAndRemoveRun, writeRun, writeAgent } from '../../src/state/runs.js'
import { buildWebState, listWebProviders } from '../../src/web/state.js'
import { PROVIDERS } from '../../src/launcher/providers.js'
import { providerColor, providerDisplayName } from '../../src/utils/display.js'
import type { AgentRecord, RunRecord } from '../../src/state/types.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeves-web-state-'))
  process.env.REEVES_REGISTRY = tmpDir
})

afterEach(() => {
  delete process.env.REEVES_REGISTRY
  rmSync(tmpDir, { recursive: true, force: true })
})

function makeRun(id: string): RunRecord {
  return {
    id,
    mode: 'spawner',
    name: `run-${id}`,
    status: 'running',
    tmux_session: `reeves_${id}`,
    reeves_window_id: '@0',
    reeves_pane_id: '%0',
    root_agent_id: `${id}-root`,
    working_dir: '/tmp/work',
    preset_name: null,
    started_at: '2026-01-01T00:00:00.000Z',
    ended_at: null,
  }
}

function makeAgent(id: string, runId: string, overrides: Partial<AgentRecord> = {}): AgentRecord {
  return {
    id,
    run_id: runId,
    nickname: id,
    provider: 'cc',
    model: '',
    role: 'worker',
    working_dir: '/tmp/work',
    task: '',
    task_status: 'queued',
    task_note: '',
    tmux_session: `reeves_${runId}`,
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

describe('buildWebState', () => {
  it('returns no runs on empty state', () => {
    expect(buildWebState()).toEqual({ runs: [], history: [] })
  })

  it('groups terminals under their run with monogram and provider color', () => {
    writeRun(makeRun('r1'))
    writeAgent(makeAgent('planner', 'r1', { provider: 'cc', role: 'root', model: 'opus' }))
    writeAgent(makeAgent('worker', 'r1', { provider: 'codex', task_status: 'working' }))

    const state = buildWebState()
    expect(state.runs).toHaveLength(1)

    const run = state.runs[0]!
    expect(run.id).toBe('r1')
    expect(run.mode).toBe('spawner')
    expect(run.name).toBe('run-r1')
    expect(run.canStop).toBe(true)
    expect(run.terminals).toHaveLength(2)

    const planner = run.terminals.find(t => t.nickname === 'planner')!
    expect(planner.monogram).toBe('PL')
    expect(planner.color).toBe(providerColor('cc'))
    expect(planner.provider_label).toBe('Claude Code')
    expect(planner.role).toBe('root')
    expect(planner.status).toBe('queued')
    expect(planner.model).toBe('opus')
    expect(planner.canAttach).toBe(true)
    expect(planner.canKill).toBe(true)

    const worker = run.terminals.find(t => t.nickname === 'worker')!
    expect(worker.color).toBe(providerColor('codex'))
    expect(worker.status).toBe('working')
  })

  it('reports ended terminals as ended regardless of task status', () => {
    writeRun(makeRun('r2'))
    writeAgent(makeAgent('gone', 'r2', { task_status: 'working', ended_at: '2026-01-01T01:00:00.000Z' }))

    const term = buildWebState().runs[0]!.terminals[0]!
    expect(term.status).toBe('ended')
    expect(term.canAttach).toBe(false)
    expect(term.canKill).toBe(false)
  })

  it('includes shared simple history records', () => {
    writeRun(makeRun('old'))
    writeAgent(makeAgent('root', 'old', { role: 'root', provider: 'codex' }))
    archiveAndRemoveRun('old', 'ended')

    const state = buildWebState()
    expect(state.runs).toEqual([])
    expect(state.history).toHaveLength(1)
    expect(state.history[0]).toMatchObject({
      id: 'old',
      name: 'run-old',
      status: 'ended',
      working_dir: '/tmp/work',
      agent_count: 1,
      root_provider: 'codex',
      root_provider_label: 'Codex CLI',
    })
  })
})

describe('listWebProviders', () => {
  it('lists every provider with availability and color', () => {
    const list = listWebProviders()
    expect(list).toHaveLength(PROVIDERS.length)
    expect(list.map(p => p.id).sort()).toEqual([...PROVIDERS].sort())
    for (const p of list) {
      expect(typeof p.available).toBe('boolean')
      expect(p.name).toBe(providerDisplayName(p.id))
      expect(p.color).toBe(providerColor(p.id))
    }
  })
})
