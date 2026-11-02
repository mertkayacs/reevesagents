// MINOR of block 27: the snapshot was built without `agent_pulse_ms`, so every plan badge fell back to fifteen minutes
// and the configured value — including `0`, "never pulse" — could not reach the screen.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { writeAgent, writeRun } from '../../src/core/runs.js'

let root: string
let savedRegistry: string | undefined

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'reeves-pulse-config-'))
  savedRegistry = process.env.REEVES_REGISTRY
  process.env.REEVES_REGISTRY = root
  process.env.REEVES_CONFIG = join(root, 'config.json')

  writeRun({
    id: 'run-1', name: 'demo', status: 'running', tmux_session: 'reeves-demo-1', reeves_window_id: '@0',
    reeves_pane_id: '%0', root_agent_id: 'dev-1', working_dir: root, preset_name: null,
    started_at: '2026-11-02T12:00:00.000Z', ended_at: null,
  })
  writeAgent({
    id: 'dev-1', run_id: 'run-1', nickname: 'dev', provider: 'codex', model: '', role: 'worker', working_dir: root,
    task: 't', task_status: 'working', task_note: '', tmux_session: 'reeves-demo-1', tmux_window_id: '@1',
    tmux_pane_id: '%1', rc_enabled: false, permissions: 'ask', inbox: [], last_seen: 1,
    started_at: '2026-11-02T12:00:00.000Z', ended_at: null,
  })

  // A finished plan, written a moment ago: fresh under any sensible window, stale under none.
  const now = new Date().toISOString()
  mkdirSync(join(root, 'flows'), { recursive: true })
  writeFileSync(join(root, 'flows', 'run-1.json'), JSON.stringify({
    schema_version: 1, run_id: 'run-1', flow_id: 'f1', notify_episode: 0, repo: root,
    roles: { dev: 'dev-1', review: 'dev-1' }, state: 'done', rounds: 1, max_rounds: 3, max_total_rounds: 12,
    review_started_at: null, review_timeout_sec: 1800,
    claim: { head: 'a'.repeat(40), verdict: null, verdict_count: 0, verdict_applied: false },
    pending: null, specs: [], dispatched_specs: [], active_plan_item: null, answered_round: null,
    verdict_handled_for: null, verdict_handled_item: null, unsubstantiated_attempts: 0,
    paused_from: null, paused_at: null, orphan_reason: null, close_reason: null,
    log: [], created_at: now, updated_at: now,
  }))
  mkdirSync(join(root, 'flows', 'run-1'), { recursive: true })
  writeFileSync(join(root, 'flows', 'run-1', 'plan.json'), JSON.stringify({
    schema_version: 1, run_id: 'run-1', source_path: 'docs/plan.md', source_hash: 'h',
    imported_at: now, updated_at: now,
    items: [{
      id: 'P1.1', title: 't', status: 'done', head: 'a'.repeat(40), rounds: 1, spec: null, spec_path: null,
      spec_hash: null, notes_ref: null, owner_action: false, missing_since: null, updated_at: now,
    }],
    conflicts: [],
    budgets: { max_rounds_per_item: 3, max_total_rounds: 12 },
  }))
})

afterEach(() => {
  if (savedRegistry === undefined) delete process.env.REEVES_REGISTRY
  else process.env.REEVES_REGISTRY = savedRegistry
  delete process.env.REEVES_CONFIG
  rmSync(root, { recursive: true, force: true })
})

describe('the configured pulse reaches the badge', () => {
  it('passes agent_pulse_ms in every buildWebState call the server makes', () => {
    const source = readFileSync(join(process.cwd(), 'src/surfaces/webui/server.ts'), 'utf-8')
    // Both the SSE frame and `/api/state`: a badge that pulses on one surface and not the other is worse than neither.
    const calls = source.match(/buildWebState\([^)]*\)/g) ?? []
    expect(calls.length).toBeGreaterThanOrEqual(2)
    for (const call of calls) expect(call).toContain('agent_pulse_ms')
  })

  it('turns the pulse off for 0 and keeps it for a real window', async () => {
    const { buildWebState } = await import('../../src/surfaces/webui/state.js')
    const now = Date.now()

    // `liveTmuxTarget` keeps the run in `runs` instead of `history`: this test is about the badge, not about tmux.
    const live = () => true
    const off = buildWebState({ now, agent_pulse_ms: 0, liveTmuxTarget: live }).runs.find(run => run.id === 'run-1')!.flow!
    expect(off.tone).toBe('done')
    expect(off.pulse).toBe(false)

    const on = buildWebState({ now, agent_pulse_ms: 60_000, liveTmuxTarget: live }).runs.find(run => run.id === 'run-1')!.flow!
    expect(on.pulse).toBe(true)
  })
})
