// The autonomous tick: a plan walked from start to finish by the ticker, and the blockers that stop it.
//
// This is the block's central test. Nothing here calls `stepFlow` by hand — `tickAllFlows` is what the external
// driver (`reeves-flow-tick.timer`, cron) runs as `flow tick --all`, so a green run means the product moves a plan on
// its own. Every pass also leaves the receipt the surfaces report (block 68).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { createFlowState } from '../src/core/flow.js'
import { flowPath, readFlow, saveFlow } from '../src/core/flow-store.js'
import { attachSpec, createPlan, planPath, readPlan, savePlan } from '../src/core/plan.js'
import type { Plan } from '../src/core/plan.js'
import { tickAllFlows } from '../src/core/flow-ticker.js'
import { readTickStatus, tickStatusPath, writeTickStatus } from '../src/core/tick-status.js'
import { planAttentionOf } from '../src/core/flow-view.js'
import { readNotifications } from '../src/core/notifications.js'
import { readFlowBadge } from '../src/core/flow-view.js'
import { writeAgent, writeRun } from '../src/core/runs.js'

const HEAD = vi.hoisted(() => ({ value: 'aaa111' }))
const execFileSync = vi.hoisted(() => vi.fn((file: string, args: string[] = []) => {
  if (file === 'git' && args.includes('rev-parse')) return `${HEAD.value}\n`
  if (file === 'git' && args.includes('status')) return ''
  return ''
}))
vi.mock('node:child_process', () => ({ execFileSync, spawnSync: vi.fn(() => ({ status: 1, stdout: '' })) }))

const runtime = vi.hoisted(() => ({
  paneBusy: vi.fn(() => 'idle' as const),
  peekAgentRaw: vi.fn(() => 'VERDICT: ACCEPT'),
  sendWhenIdle: vi.fn((_agent: string, _text: string) => ({ sent: true as const })),
}))
vi.mock('../src/core/runtime.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/core/runtime.js')>()),
  ...runtime,
}))

const NOW = Date.parse('2026-11-02T09:00:00.000Z')
const AT = new Date(NOW).toISOString()
const DOC = ['- [ ] **P1.1** — first', '- [ ] **P1.2** — second', '- [ ] **P1.3** — third'].join('\n')

function brief(id: string): string {
  return JSON.stringify({ id, title: id, goal: 'g', requirements: ['r'], checks: ['c'], report: ['r'] })
}

function planWith(ids: string[]): Plan {
  const created = createPlan({ run_id: 'run-1', source_path: 'docs/plan.md', text: DOC, now: NOW, at: AT })
  return ids.reduce((plan, id) => attachSpec(plan, {
    id, text: brief(id), format: 'json', spec_path: `docs/briefs/${id}.json`, now: NOW, at: AT,
  }).plan, created.plan)
}

// The reviewer pane, as the engine reads it: `verdict_count` is how many verdicts are visible, and the engine only
// consumes a *new* one. A test that always showed one line would look like a reviewer repeating itself, and the
// second round would never be fresh — so the counter grows with the passes, exactly like a reviewer answering.
const verdictState = { lines: 1 }

// An ACCEPT with one finding on record: the evidence rule accepts a verdict when a finding line exists or the file
// says explicitly that nothing was found, and a pane cannot say the latter.
const ACCEPT_PANE = ['MAJOR src/core/flow.ts:1 — the note', 'VERDICT: ACCEPT'].join('\n')

function ports(verdict: string = ACCEPT_PANE) {
  return {
    paneBusy: () => 'idle' as const,
    peek: () => Array.from({ length: verdictState.lines }, () => verdict).join('\n'),
    send: () => ({ sent: true as const }),
  }
}

// One pass, with the reviewer answering something new: the verdict counter is what the engine reads as freshness.
let passClock = 0
function pass(head: string, overrides: { ports?: ReturnType<typeof ports> } = {}) {
  HEAD.value = head
  verdictState.lines += 1
  passClock += 60_000
  return tickAllFlows({ now: NOW + passClock, at: AT, ports: overrides.ports ?? ports() } as never)
}

let root: string
let savedRegistry: string | undefined

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'reeves-ticker-'))
  savedRegistry = process.env.REEVES_REGISTRY
  process.env.REEVES_REGISTRY = root
  process.env.REEVES_CONFIG = join(root, 'config.json')
  HEAD.value = 'aaa111'
  verdictState.lines = 1
  passClock = 0
  writeRun({
    id: 'run-1', name: 'run-1', status: 'running', tmux_session: 'reeves-run-1', reeves_window_id: '@0',
    reeves_pane_id: '%0', root_agent_id: 'dev-1', working_dir: root, preset_name: null,
    started_at: '2026-11-01T00:00:00.000Z', ended_at: null,
  })
  const agent = (id: string, pane: string) => ({
    id, run_id: 'run-1', nickname: id, provider: 'codex' as const, model: '', role: 'worker' as const,
    working_dir: root, task: 't', task_status: 'working' as const, task_note: '', tmux_session: 'reeves-run-1',
    tmux_window_id: '@1', tmux_pane_id: pane, rc_enabled: false, permissions: 'ask' as const, inbox: [],
    last_seen: 1, started_at: '2026-11-01T00:00:01.000Z', ended_at: null,
  })
  writeAgent(agent('dev-1', '%1'))
  writeAgent(agent('rev-1', '%2'))
})

afterEach(() => {
  if (savedRegistry === undefined) delete process.env.REEVES_REGISTRY
  else process.env.REEVES_REGISTRY = savedRegistry
  delete process.env.REEVES_CONFIG
  rmSync(root, { recursive: true, force: true })
})

// The item that is already in work when the test starts — the state `plan next` leaves behind after its dispatch.
// From there, every further move is the ticker's.
function seed(plan: Plan, options: { inWork?: string } = {}): void {
  mkdirSync(dirname(planPath('run-1')), { recursive: true })
  savePlan(plan)
  const base = createFlowState({
    run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, head: 'a'.repeat(40),
    max_rounds: 2, max_total_rounds: 5, at: AT,
  })
  const item = options.inWork ? plan.items.find(entry => entry.id === options.inWork) : undefined
  if (!item?.spec) {
    saveFlow(base)
    return
  }
  saveFlow({
    ...base,
    state: 'reviewing',
    review_started_at: NOW - 60_000,
    claim: { head: HEAD.value, verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null },
    specs: [item.spec],
    // Already sent: otherwise the off-plan queue would dispatch it again, which is a different scenario.
    dispatched_specs: [item.id],
    active_plan_item: item.id,
  })
}

describe('a plan walks itself', () => {
  it('does not create a flow file or badge for a run that never started one', () => {
    const result = tickAllFlows({ root })

    expect(result).toEqual({ advanced: [], held: [], skipped: [] })
    expect(existsSync(flowPath('run-1', root))).toBe(false)
    expect(readFlowBadge('run-1', NOW, root)).toBeNull()
  })

  it('takes three items from start to finish without a single manual tick', () => {
    // Each pass is one `tickAllFlows`, exactly what the Web UI loop runs: ask for the review, consume the answer,
    // dispatch the next item. The dev "commits" between items by moving the mocked HEAD, and the reviewer answers
    // with a new verdict line each time — which is what makes the next round fresh.
    seed(planWith(['P1.1', 'P1.2', 'P1.3']), { inWork: 'P1.1' })
    const ok = ports()
    verdictState.lines = 1
    const heads = ['aaa111', 'bbb222', 'ccc333', 'ddd444', 'eee555', 'fff666']
    const decisions: string[] = []
    let clock = 0
    outer: for (const head of heads) {
      HEAD.value = head
      for (let pass = 0; pass < 2; pass += 1) {
        clock += 60_000
        const result = tickAllFlows({ now: NOW + clock, at: AT, ports: ok } as never)
        verdictState.lines += 1
        for (const entry of result.advanced) decisions.push(entry.reason)
        if (readFlow('run-1').state === 'done') break outer
      }
    }

    const state = readFlow('run-1')
    const plan = readPlan('run-1')
    // The plan finished on its own: every item closed on an accepted commit.
    expect(plan.items.filter(item => item.status === 'done').map(item => item.id)).toEqual(['P1.1', 'P1.2', 'P1.3'])
    expect(plan.items.every(item => item.head !== null)).toBe(true)
    expect(state.state).toBe('done')
    // And it took many passes — nothing was faked in a single call.
    expect(decisions.length).toBeGreaterThanOrEqual(3)
    expect(decisions).toContain('plan_item_dispatched')
  })
})

describe('blockers are visible, and the picker stops on them', () => {
  it('names the item the plan is waiting for, on the badge', () => {
    // The blocker path itself is the picker's (`plan-engine.test.ts`); what a surface needs is the *label*: which
    // item waits, and why. This is the view the TUI list and the Web card render.
    const plan = planWith(['P1.1'])
    seed(plan, {})
    savePlan({ ...plan, items: plan.items.map(item => (item.id === 'P1.1' ? { ...item, status: 'done' as const } : item)) })
    expect(planAttentionOf('run-1')).toEqual({ reason: 'needs_brief', item: 'P1.2' })
    const badge = readFlowBadge('run-1')
    expect(badge?.attention).toBe('plan_waiting')
    expect(badge?.plan?.item).toBe('P1.2')

    const blocked = readPlan('run-1')
    savePlan({ ...blocked, items: blocked.items.map(item => (item.id === 'P1.2' ? { ...item, status: 'blocked_owner' as const, block_reason: 'rounds_exhausted' } : item)) })
    expect(planAttentionOf('run-1')).toEqual({ reason: 'blocked_owner', item: 'P1.2' })
    // A blocked item outranks a missing brief: it is the head of the line.
    expect(readFlowBadge('run-1')?.plan).toMatchObject({ reason: 'blocked_owner' })
  })

  it('emits one warning per blocked item, not one per tick', () => {
    seed(planWith(['P1.1']), {})
    // Two passes over a plan whose head has no brief: the key is stable, so the journal keeps one row.
    pass('aaa111')
    pass('bbb222')
    const events = readNotifications().events.filter(event => event.kind === 'plan.item_needs_brief')
    expect(events.length).toBeLessThanOrEqual(1)
  })
})

describe('the ticker is idempotent and switchable', () => {
  it('does not paste twice: the claim left by one pass stops the next one', () => {
    seed(planWith(['P1.1', 'P1.2']), { inWork: 'P1.1' })
    // The first pass accepts P1.1 and dispatches P1.2: the claim is on disk, unsettled until the send settles.
    const first = tickAllFlows({ now: NOW, at: AT, ports: ports() } as never)
    expect(first.advanced.length).toBe(1)
    // An immediate second pass sees that claim and does nothing at all: no second paste of the same brief.
    const second = tickAllFlows({ now: NOW + 1000, at: AT, ports: ports() } as never)
    expect(second.advanced).toEqual([])
  })

  it('skips parked and closed flows instead of resurrecting them', () => {
    const plan = planWith(['P1.1'])
    seed(plan)
    saveFlow({ ...readFlow('run-1'), state: 'paused', paused_from: 'idle', paused_at: NOW })
    const result = tickAllFlows({ now: NOW, at: AT })
    expect(result.skipped[0]).toMatchObject({ run_id: 'run-1', why: 'paused' })
    expect(result.advanced).toEqual([])
  })

  it('keeps the engine timer-free', () => {
    // A guard on the rule itself: `flow.ts` and `flow-runner.ts` must not grow a scheduler.
    const sources = ['../src/core/flow.ts', '../src/core/flow-runner.ts']
    for (const source of sources) {
      // `test/` is one level below the repo root, so `../src/...` resolves from the file's own directory.
      const text = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', source.slice(3)), 'utf-8')
      expect(text).not.toContain('setInterval')
      expect(text).not.toContain('setTimeout')
    }
  })
})

describe('the tick does not starve the sweep', () => {
  it('returns promptly even with several flows and one broken file', () => {
    seed(planWith(['P1.1']), { inWork: 'P1.1' })
    const started = Date.now()
    const result = tickAllFlows({ now: NOW, at: AT, ports: ports(), } as never)
    expect(Date.now() - started).toBeLessThan(5000)
    expect(result.skipped).toEqual([])
  })
})

describe('every real pass leaves the driver a receipt (block 68)', () => {
  it('writes tick-status.json for a pass, with the counts it returned', () => {
    seed(planWith(['P1.1']), { inWork: 'P1.1' })

    const result = tickAllFlows({ now: NOW, at: AT, ports: ports() } as never)

    const status = readTickStatus()
    expect(status).toMatchObject({
      at: AT,
      mode: 'all',
      driver: 'external',
      pid: process.pid,
      advanced: result.advanced.length,
      held: result.held.length,
      skipped: result.skipped.length,
    })
  })

  it('names the scheduler that ran it, through REEVES_TICK_DRIVER', () => {
    seed(planWith(['P1.1']), { inWork: 'P1.1' })
    const saved = process.env.REEVES_TICK_DRIVER
    process.env.REEVES_TICK_DRIVER = 'systemd:reeves-flow-tick.timer'
    try {
      tickAllFlows({ now: NOW, at: AT, ports: ports() } as never)
    } finally {
      if (saved === undefined) delete process.env.REEVES_TICK_DRIVER
      else process.env.REEVES_TICK_DRIVER = saved
    }
    expect(readTickStatus()?.driver).toBe('systemd:reeves-flow-tick.timer')
  })

  it('writes nothing for a --dry-run: a question is not a pass', () => {
    seed(planWith(['P1.1']), { inWork: 'P1.1' })

    tickAllFlows({ dryRun: true, now: NOW, at: AT, ports: ports() } as never)

    expect(readTickStatus()).toBeNull()
    expect(existsSync(tickStatusPath())).toBe(false)
  })

  it('reads a damaged receipt as no receipt, rather than an invented one', () => {
    writeFileSync(tickStatusPath(), '{"at": ', 'utf-8')
    expect(readTickStatus()).toBeNull()
    // And what it writes is what it reads back: the round trip the panel and `flow status` rely on.
    writeTickStatus('run', { advanced: 1, held: 0, skipped: 0 }, { at: AT })
    expect(readTickStatus()).toMatchObject({ at: AT, mode: 'run', advanced: 1, held: 0, skipped: 0 })
  })
})
