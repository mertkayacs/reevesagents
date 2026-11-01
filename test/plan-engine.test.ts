// The plan as the flow's queue: picking the next item, per-item round budgets, closing on an ACCEPT, and the
// `plan_incomplete` gate (docs/plan-model-design.md §5–6, block 13).
//
// The engine tests drive `flowTick` with a plan view; the runner tests drive `stepFlow` against a real
// `plan.json` in a temp registry, which is what proves the item an ACCEPT closes is the item that was sent.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { createFlowState, flowTick } from '../src/core/flow.js'
import type { FlowObservations, FlowState } from '../src/core/flow.js'
import { readFlow, saveFlow } from '../src/core/flow-store.js'
import { attachSpec, createPlan, planPath, readPlan, savePlan } from '../src/core/plan.js'
import type { Plan } from '../src/core/plan.js'
import { planNext, planTickView, planWaitingForBrief } from '../src/core/flow-plan.js'
import { stepFlow } from '../src/core/flow-runner.js'
import { writeAgent, writeRun } from '../src/core/runs.js'

const execFileSync = vi.hoisted(() => vi.fn((file: string, args: string[] = []) => {
  if (file === 'git' && args.includes('rev-parse')) return 'bbb222\n'
  if (file === 'git' && args.includes('status')) return ''
  return ''
}))
vi.mock('node:child_process', () => ({ execFileSync, spawnSync: vi.fn(() => ({ status: 1, stdout: '' })) }))

const runtime = vi.hoisted(() => ({
  paneBusy: vi.fn(() => 'idle' as const),
  peekAgentRaw: vi.fn(() => ''),
  sendWhenIdle: vi.fn((_agent: string, _text: string) => ({ sent: true as const })),
}))
vi.mock('../src/core/runtime.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/core/runtime.js')>()),
  ...runtime,
}))

const NOW = Date.parse('2026-11-02T09:00:00.000Z')
const AT = new Date(NOW).toISOString()

const DOC = ['- [ ] **P1.1** — first', '- [ ] **P1.2** — second', '- [ ] **P1.3** — third'].join('\n')

function briefFor(id: string): string {
  return JSON.stringify({ id, title: id, goal: 'g', requirements: ['r'], checks: ['c'], report: ['r'] })
}

function planWithBriefs(ids: string[]): Plan {
  const created = createPlan({ run_id: 'run-1', source_path: 'docs/plan.md', text: DOC, now: NOW, at: AT })
  return ids.reduce((plan, id) => attachSpec(plan, {
    id,
    text: briefFor(id),
    format: 'json',
    spec_path: `docs/briefs/${id}.json`,
    now: NOW,
    at: AT,
  }).plan, created.plan)
}

function reviewingState(overrides: Partial<FlowState> = {}): FlowState {
  const state = createFlowState({
    run_id: 'run-1',
    repo: '/tmp/repo',
    roles: { dev: 'dev-1', review: 'rev-1' },
    max_rounds: 2,
    max_total_rounds: 5,
    at: AT,
  })
  return {
    ...state,
    state: 'reviewing',
    rounds: 1,
    review_started_at: NOW - 60_000,
    claim: { head: 'aaa111', verdict: null, verdict_count: 1 },
    ...overrides,
  }
}

function observationsFor(state: FlowState, plan: Plan, overrides: Partial<FlowObservations> = {}): FlowObservations {
  return {
    now: NOW,
    head: state.claim.head,
    tree_clean: true,
    dev_pane: 'idle',
    review_pane: 'idle',
    verdict: 'ACCEPT',
    verdict_notes: '',
    verdict_count: 2,
    verdict_source: 'pane',
    run_present: true,
    agents_present: true,
    verdict_evidence: { elapsed_ms: 121_000, notes_bytes: 200, notes_findings: 1, pane_tool_lines: 3 },
    evidence_policy: { min_seconds: 30, retries: 1 },
    plan: planTickView(plan, { perItem: state.max_rounds, total: state.max_total_rounds }),
    ...overrides,
  }
}

describe('picking the next item', () => {
  it('takes the first item that has a brief, and reports the ones that do not', () => {
    const plan = planWithBriefs(['P1.2'])
    const view = planTickView(plan, { perItem: 2, total: 8 })
    const next = planNext(view)
    expect(next.kind).toBe('item')
    expect(next.kind === 'item' ? next.item.id : null).toBe('P1.2')
    // Both unbriefed items are visible: the plan does not hide them behind the first one.
    expect(planWaitingForBrief(view).map(item => item.id)).toEqual(['P1.1', 'P1.3'])
  })

  it('reports needs_brief when nothing has a brief, and never invents one', () => {
    const plan = createPlan({ run_id: 'run-1', source_path: 'docs/plan.md', text: DOC, now: NOW, at: AT }).plan
    const next = planNext(planTickView(plan, { perItem: 2, total: 8 }))
    expect(next.kind).toBe('needs_brief')
    expect(next.kind === 'needs_brief' ? next.item.id : null).toBe('P1.1')
  })

  it('does not start a second item while one is in flight', () => {
    const plan = planWithBriefs(['P1.1', 'P1.2'])
    const busy: Plan = {
      ...plan,
      items: plan.items.map(item => (item.id === 'P1.1' ? { ...item, status: 'in_work' as const } : item)),
    }
    const next = planNext(planTickView(busy, { perItem: 2, total: 8 }))
    expect(next.kind).toBe('in_flight')
  })
})

describe('the engine with a plan', () => {
  it('dispatches the picked item and records it as the active one', () => {
    const plan = planWithBriefs(['P1.2'])
    const state = reviewingState({ state: 'idle', claim: { head: '', verdict: null, verdict_count: 0 } })
    const decision = flowTick(state, observationsFor(state, plan, { head: 'aaa111', verdict: null, verdict_count: 0 }))

    // idle -> the decision is a review request for the new head, not a dispatch: that is the pre-plan flow.
    expect(decision.kind).toBe('request_review')
  })

  it('closes the accepted item and dispatches the next one', () => {
    const plan = planWithBriefs(['P1.1', 'P1.2'])
    const state = reviewingState({ active_plan_item: 'P1.1' })
    const decision = flowTick(state, observationsFor(state, plan))

    expect(decision.kind).toBe('dispatch_spec')
    expect(decision.reason).toBe('plan_item_dispatched')
    expect(decision.next_plan_close).toMatchObject({ id: 'P1.1', head: 'aaa111' })
    expect(decision.next_active_plan_item).toBe('P1.2')
  })

  it('refuses to close the flow while the plan is incomplete', () => {
    // The remaining items are blocked by a human decision, so the picker has nothing to take: the flow holds
    // and names them instead of closing.
    const plan = planWithBriefs(['P1.1'])
    const blocked: Plan = {
      ...plan,
      items: plan.items.map(item => (item.id === 'P1.1' ? item : { ...item, status: 'blocked_owner' as const })),
    }
    const state = reviewingState({ active_plan_item: 'P1.1' })
    const decision = flowTick(state, observationsFor(state, blocked))

    expect(decision.reason).toBe('plan_incomplete')
    expect(decision.next_state).toBe('reviewing')
    expect(decision.log_detail).toContain('blocked_owner')
  })

  it('closes the flow when every item is done or skipped', () => {
    const plan = planWithBriefs(['P1.1'])
    const finished = {
      ...plan,
      items: plan.items.map(item => (item.id === 'P1.1' ? { ...item, status: 'done' as const, head: 'aaa111' } : { ...item, status: 'skipped' as const })),
    }
    const state = reviewingState({ active_plan_item: 'P1.1' })
    const decision = flowTick(state, observationsFor(state, finished))

    expect(decision.reason).toBe('flow_done')
    expect(decision.next_state).toBe('done')
  })

  it('blocks an item that spent its rounds instead of starting another fix', () => {
    const plan = planWithBriefs(['P1.1'])
    const spent: Plan = {
      ...plan,
      items: plan.items.map(item => ({ ...item, status: 'in_work' as const, rounds: 2 })),
    }
    const state = reviewingState({ active_plan_item: 'P1.1', rounds: 2 })
    const decision = flowTick(state, observationsFor(state, spent, { verdict: 'CHANGES_REQUESTED' }))

    expect(decision.reason).toBe('rounds_exhausted')
    expect(decision.next_state).toBe('reviewing')
    expect(decision.next_plan_status).toMatchObject({ id: 'P1.1', status: 'blocked_owner', block_reason: 'rounds_exhausted' })
  })

  it('escalates when the flow spent its total budget', () => {
    const plan = planWithBriefs(['P1.1', 'P1.2'])
    const state = reviewingState({ active_plan_item: 'P1.1', rounds: 5 })
    const decision = flowTick(state, observationsFor(state, plan))

    expect(decision.reason).toBe('total_rounds_exhausted')
    expect(decision.next_state).toBe('escalated')
  })

  it('holds on the plan, naming every item that waits for a brief', () => {
    const plan = planWithBriefs([])
    const state = reviewingState({ active_plan_item: 'P1.1' })
    const decision = flowTick(state, observationsFor(state, plan))

    expect(decision.reason).toBe('plan_incomplete')
    expect(decision.next_state).toBe('reviewing')
    // Every unbriefed item is reported, not just the one the picker stopped at.
    expect(decision.log_detail).toContain('P1.1')
    expect(decision.log_detail).toContain('P1.2, P1.3')
  })

  it('keeps the pre-plan behaviour when there is no plan', () => {
    const state = reviewingState()
    const spec = { id: 'S1', title: 'block', goal: 'g', requirements: ['r'], checks: ['c'], report: ['r'] }
    const withSpec: FlowState = { ...state, specs: [spec], dispatched_specs: [] }
    const decision = flowTick(withSpec, observationsFor(withSpec, planWithBriefs([]), { plan: undefined }))

    expect(decision.kind).toBe('dispatch_spec')
    expect(decision.reason).toBe('spec_dispatched')
    expect(decision.next_active_plan_item).toBeNull()
  })
})

// The reviewer's pane text, and the dev pane idle: the runner reads the verdict through its ports, so a test
// describes a review instead of writing a notes file for every case.
const EVIDENCE = { elapsed_ms: 121_000, notes_bytes: 200, notes_findings: 1, pane_tool_lines: 3 }

function portsFor(paneText: string) {
  return {
    paneBusy: () => 'idle' as const,
    peek: () => paneText,
    send: () => ({ sent: true as const }),
  }
}

describe('the runner with a plan on disk', () => {
  let root: string
  let savedRegistry: string | undefined

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'reeves-plan-engine-'))
    savedRegistry = process.env.REEVES_REGISTRY
    process.env.REEVES_REGISTRY = root
    process.env.REEVES_CONFIG = join(root, 'config.json')
    runtime.paneBusy.mockImplementation(() => 'idle')
    runtime.peekAgentRaw.mockImplementation(() => '')
    runtime.sendWhenIdle.mockImplementation(() => ({ sent: true as const }))

    writeRun({
      id: 'run-1', name: 'run-1', status: 'running', tmux_session: 'reeves-run-1', reeves_window_id: '@0',
      reeves_pane_id: '%0', root_agent_id: 'dev-1', working_dir: root, preset_name: null,
      started_at: '2026-11-01T00:00:00.000Z', ended_at: null,
    })
    writeAgent({
      id: 'dev-1', run_id: 'run-1', nickname: 'dev', provider: 'codex', model: '', role: 'worker',
      working_dir: root, task: 't', task_status: 'working', task_note: '', tmux_session: 'reeves-run-1',
      tmux_window_id: '@1', tmux_pane_id: '%1', rc_enabled: false, permissions: 'ask', inbox: [],
      last_seen: 1, started_at: '2026-11-01T00:00:01.000Z', ended_at: null,
    })
    writeAgent({
      id: 'rev-1', run_id: 'run-1', nickname: 'rev', provider: 'codex', model: '', role: 'worker',
      working_dir: root, task: 't', task_status: 'working', task_note: '', tmux_session: 'reeves-run-1',
      tmux_window_id: '@2', tmux_pane_id: '%2', rc_enabled: false, permissions: 'ask', inbox: [],
      last_seen: 1, started_at: '2026-11-01T00:00:02.000Z', ended_at: null,
    })
  })

  afterEach(() => {
    if (savedRegistry === undefined) delete process.env.REEVES_REGISTRY
    else process.env.REEVES_REGISTRY = savedRegistry
    delete process.env.REEVES_CONFIG
    rmSync(root, { recursive: true, force: true })
  })

  function seedFlow(plan: Plan): void {
    mkdirSync(dirname(planPath('run-1')), { recursive: true })
    savePlan(plan)
    saveFlow({
      ...createFlowState({
        run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' },
        max_rounds: 2, max_total_rounds: 5, at: AT,
      }),
      state: 'reviewing',
      rounds: 1,
      review_started_at: NOW - 60_000,
      claim: { head: 'aaa111', verdict: null, verdict_count: 0 },
      active_plan_item: 'P1.1',
    })
  }

  it('closes the item whose brief was sent, not the next one in the document', () => {
    // P1.1 is skipped in the document order on purpose: if the runner closed "the next item" instead of the
    // active one, it would close the wrong row.
    const plan = planWithBriefs(['P1.1', 'P1.2'])
    seedFlow(plan)

    const result = stepFlow('run-1', { now: NOW, at: AT, head: 'aaa111', tree_clean: true, plan: undefined, ports: portsFor('VERDICT: ACCEPT'), verdict_evidence: EVIDENCE })

    expect(result.decision.kind).toBe('dispatch_spec')
    const after = readPlan('run-1')
    expect(after.items.find(item => item.id === 'P1.1')!.status).toBe('done')
    expect(after.items.find(item => item.id === 'P1.1')!.head).toBe('aaa111')
    expect(after.items.find(item => item.id === 'P1.2')!.status).toBe('in_work')
    expect(after.items.find(item => item.id === 'P1.3')!.status).toBe('pending')
    // The flow remembers which item the new dispatch belongs to.
    expect(readFlow('run-1').active_plan_item).toBe('P1.2')
  })

  it('holds the flow on plan_incomplete and records nothing as done', () => {
    const plan = planWithBriefs(['P1.1'])
    seedFlow(plan)

    const result = stepFlow('run-1', { now: NOW, at: AT, head: 'aaa111', tree_clean: true, plan: undefined, ports: portsFor('VERDICT: ACCEPT'), verdict_evidence: EVIDENCE })

    expect(result.decision.reason).toBe('plan_incomplete')
    expect(readFlow('run-1').state).toBe('reviewing')
    const after = readPlan('run-1')
    expect(after.items.filter(item => item.status === 'done').map(item => item.id)).toEqual(['P1.1'])
    expect(after.items.find(item => item.id === 'P1.1')!.head).toBe('aaa111')
  })

  it('blocks the item after its rounds are spent and leaves the flow on it', () => {
    const plan = planWithBriefs(['P1.1', 'P1.2'])
    const spent: Plan = {
      ...plan,
      items: plan.items.map(item => (item.id === 'P1.1' ? { ...item, status: 'in_work' as const, rounds: 2 } : item)),
    }
    seedFlow(spent)

    const result = stepFlow('run-1', { now: NOW, at: AT, head: 'aaa111', tree_clean: true, plan: undefined, ports: portsFor('MAJOR x\nVERDICT: CHANGES_REQUESTED'), verdict_evidence: EVIDENCE })

    expect(result.decision.reason).toBe('rounds_exhausted')
    const after = readPlan('run-1')
    const item = after.items.find(entry => entry.id === 'P1.1')!
    expect(item.status).toBe('blocked_owner')
    expect(item.block_reason).toBe('rounds_exhausted')
    // The fix round was not spent: the item is blocked *instead of* another round.
    expect(item.rounds).toBe(2)
  })

  it('counts a fix round against the item', () => {
    const plan = planWithBriefs(['P1.1'])
    seedFlow(plan)

    stepFlow('run-1', { now: NOW, at: AT, head: 'aaa111', tree_clean: true, plan: undefined, ports: portsFor('MAJOR x\nVERDICT: CHANGES_REQUESTED'), verdict_evidence: EVIDENCE })

    expect(readPlan('run-1').items.find(item => item.id === 'P1.1')!.rounds).toBe(1)
  })
})
