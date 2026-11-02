// The plan as the flow's queue: picking the next item, per-item round budgets, closing on an ACCEPT, and the
// `plan_incomplete` gate (docs/plan-model-design.md §5–6, block 13).
//
// The engine tests drive `flowTick` with a plan view; the runner tests drive `stepFlow` against a real
// `plan.json` in a temp registry, which is what proves the item an ACCEPT closes is the item that was sent.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
    claim: { head: 'aaa111', verdict: null, verdict_count: 1, verdict_applied: false },
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

  it('stops on a blocked item instead of routing around it', () => {
    // A ready item later in the document must not hide a blocked one earlier: `blocked_owner` is a decision the
    // owner already made, and jumping over it turns that decision into a suggestion.
    const plan = planWithBriefs(['P1.2', 'P1.3'])
    const withBlocked: Plan = {
      ...plan,
      items: plan.items.map(item => (item.id === 'P1.1' ? { ...item, status: 'blocked_owner' as const } : item)),
    }
    const next = planNext(planTickView(withBlocked, { perItem: 2, total: 8 }))
    expect(next.kind).toBe('blocked_owner')
    expect(next.kind === 'blocked_owner' ? next.item.id : null).toBe('P1.1')
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

describe('starting the plan from idle', () => {
  // A fresh flow has nothing in flight and its head is the commit it started on, so `idle` used to hold on
  // `head_unchanged` for ever: no dispatch → no commit → no review → no ACCEPT → no picker. These cases are that loop,
  // closed.
  function freshState(overrides: Partial<FlowState> = {}): FlowState {
    const state = createFlowState({
      run_id: 'run-1', repo: '/tmp/repo', roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 2, max_total_rounds: 5, at: AT,
    })
    return { ...state, claim: { head: 'aaa111', verdict: null, verdict_count: 0, verdict_applied: false }, ...overrides }
  }

  it('dispatches the first item with a brief on the very first tick, with the head unmoved', () => {
    const plan = planWithBriefs(['P1.1'])
    const state = freshState()
    const decision = flowTick(state, observationsFor(state, plan, { verdict: null, verdict_count: 0 }))

    expect(decision.kind).toBe('dispatch_spec')
    expect(decision.reason).toBe('plan_item_dispatched')
    expect(decision.target).toBe('dev')
    expect(decision.next_active_plan_item).toBe('P1.1')
    expect(decision.message).toContain('P1.1')
  })

  it('sends once: the tick after the dispatch holds instead of pasting the same item again', () => {
    const plan = planWithBriefs(['P1.1'])
    const state = freshState({ active_plan_item: 'P1.1' })
    const decision = flowTick(state, observationsFor(state, plan, { verdict: null, verdict_count: 0 }))

    expect(decision.kind).not.toBe('dispatch_spec')
    expect(decision.reason).toBe('head_unchanged')
    expect(decision.message).toBeUndefined()
  })

  it('reviews a moved head instead of jumping into the plan', () => {
    const plan = planWithBriefs(['P1.1'])
    const state = freshState()
    const decision = flowTick(state, observationsFor(state, plan, {
      head: 'bbb222', verdict: null, verdict_count: 0, plan: planTickView(plan, { perItem: 2, total: 5 }),
    }))

    expect(decision.kind).toBe('request_review')
    expect(decision.reason).toBe('review_requested')
    expect(decision.message).toContain('bbb222')
  })

  it('takes the second item when the first has no brief, and names the first as waiting', () => {
    const plan = planWithBriefs(['P1.2'])
    const state = freshState()
    const decision = flowTick(state, observationsFor(state, plan, { verdict: null, verdict_count: 0 }))

    expect(decision.kind).toBe('dispatch_spec')
    expect(decision.next_active_plan_item).toBe('P1.2')
    expect(planWaitingForBrief(planTickView(plan, { perItem: 2, total: 5 })).map(item => item.id)).toEqual(['P1.1', 'P1.3'])
  })

  it('holds on a dirty tree and on a dev pane that is not positively idle, and pastes nothing', () => {
    const plan = planWithBriefs(['P1.1'])
    const state = freshState()

    const dirty = flowTick(state, observationsFor(state, plan, { verdict: null, verdict_count: 0, tree_clean: false }))
    expect(dirty.reason).toBe('tree_dirty')
    expect(dirty.message).toBeUndefined()

    const busy = flowTick(state, observationsFor(state, plan, { verdict: null, verdict_count: 0, dev_pane: 'busy' }))
    expect(busy.reason).toBe('dev_busy')
    expect(busy.message).toBeUndefined()

    const unknown = flowTick(state, observationsFor(state, plan, { verdict: null, verdict_count: 0, dev_pane: 'unknown' }))
    expect(unknown.reason).toBe('dev_pane_unknown')
    expect(unknown.message).toBeUndefined()
  })

  it('says nothing about a plan that has nothing to start', () => {
    // Every item without a brief: the document is not an instruction yet, and a hold per tick would drown the journal.
    const plan = createPlan({ run_id: 'run-1', source_path: 'docs/plan.md', text: DOC, now: NOW, at: AT }).plan
    const state = freshState()
    const decision = flowTick(state, observationsFor(state, plan, { verdict: null, verdict_count: 0 }))

    expect(decision.reason).toBe('head_unchanged')
  })

  it('does not start an item from paused, escalated or done', () => {
    const plan = planWithBriefs(['P1.1'])
    for (const parked of ['paused', 'escalated', 'done'] as const) {
      const state = freshState({ state: parked })
      const decision = flowTick(state, observationsFor(state, plan, { verdict: null, verdict_count: 0 }))
      expect(decision.kind).not.toBe('dispatch_spec')
      expect(decision.message).toBeUndefined()
    }
  })
})

describe('the engine with a plan', () => {
  it('dispatches the picked item and records it as the active one', () => {
    const plan = planWithBriefs(['P1.2'])
    const state = reviewingState({ state: 'idle', claim: { head: '', verdict: null, verdict_count: 0, verdict_applied: false } })
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

  it('allows the last round the fuse permits, and escalates on the next one', () => {
    const plan = planWithBriefs(['P1.1', 'P1.2'])
    // `max_total_rounds` is 5: four spent rounds still allow the fifth.
    const fourSpent = reviewingState({ active_plan_item: 'P1.1', rounds: 4, claim: { head: 'aaa111', verdict: null, verdict_count: 1, verdict_applied: false } })
    const allowed = flowTick(fourSpent, observationsFor(fourSpent, plan, { verdict: 'CHANGES_REQUESTED' }))
    expect(allowed.kind).toBe('dispatch_fix')

    const fiveSpent = reviewingState({ active_plan_item: 'P1.1', rounds: 5 })
    const escalated = flowTick(fiveSpent, observationsFor(fiveSpent, plan, { verdict: 'CHANGES_REQUESTED' }))
    expect(escalated.reason).toBe('total_rounds_exhausted')
    expect(escalated.next_state).toBe('escalated')
  })

  it('dispatches a spec queued outside the plan before taking the next item', () => {
    // `add-spec` is allowed with a plan; without this the spec would sit in `state.specs` for ever, journalled
    // as `off_plan_spec` and never sent.
    const plan = planWithBriefs(['P1.1', 'P1.2'])
    const offPlan = { id: 'X9', title: 'side task', goal: 'g', requirements: ['r'], checks: ['c'], report: ['r'] }
    const state = reviewingState({ active_plan_item: 'P1.1', specs: [offPlan], dispatched_specs: [] })
    const decision = flowTick(state, observationsFor(state, plan))

    expect(decision.kind).toBe('dispatch_spec')
    expect(decision.reason).toBe('spec_dispatched')
    expect(decision.spec_id).toBe('X9')
    expect(decision.next_active_plan_item).toBeNull()
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
      claim: { head: 'aaa111', verdict: null, verdict_count: 0, verdict_applied: false },
      active_plan_item: 'P1.1',
    })
  }

  it('starts the first item of a fresh flow, and sends it once across two ticks', () => {
    // The defect this block fixes, at the level that actually pastes: a flow that has never sent anything, a plan with
    // one ready item and an unmoved head. The first tick must dispatch; the second must find the claim and hold.
    const plan = planWithBriefs(['P1.1'])
    mkdirSync(dirname(planPath('run-1')), { recursive: true })
    savePlan(plan)
    saveFlow({
      ...createFlowState({
        run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' },
        max_rounds: 2, max_total_rounds: 5, at: AT,
      }),
      state: 'idle',
      claim: { head: 'aaa111', verdict: null, verdict_count: 0, verdict_applied: false },
    })

    const sent: string[] = []
    const ports = { paneBusy: () => 'idle' as const, peek: () => '', send: (_pane: string, text: string) => { sent.push(text); return { sent: true as const } } }

    const first = stepFlow('run-1', { now: NOW, at: AT, head: 'aaa111', tree_clean: true, plan: undefined, ports })
    expect(first.decision.reason).toBe('plan_item_dispatched')
    expect(sent).toHaveLength(1)
    expect(sent[0]).toContain('P1.1')
    expect(readFlow('run-1').active_plan_item).toBe('P1.1')

    // The same tick again: the item is in flight now, so nothing is pasted a second time.
    const second = stepFlow('run-1', { now: NOW + 5_000, at: AT, head: 'aaa111', tree_clean: true, plan: undefined, ports })
    expect(second.decision.kind).not.toBe('dispatch_spec')
    expect(sent).toHaveLength(1)
  })

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

  it('records the item\'s own rounds when it closes, not the flow\'s', () => {
    const plan = planWithBriefs(['P1.1', 'P1.2'])
    const withRounds: Plan = {
      ...plan,
      items: plan.items.map(item => (item.id === 'P1.1' ? { ...item, status: 'in_work' as const, rounds: 2 } : item)),
    }
    // The flow has spent five rounds, the item two: the item's row records two.
    const state = reviewingState({ active_plan_item: 'P1.1', rounds: 5 })
    const decision = flowTick(state, observationsFor(state, withRounds, { verdict: 'ACCEPT' }))

    expect(decision.next_plan_close).toMatchObject({ id: 'P1.1', rounds: 2 })
  })

  it('refuses to tick on a damaged plan instead of behaving as if there were none', () => {
    seedFlow(planWithBriefs(['P1.1']))
    writeFileSync(planPath('run-1'), '{ not json')
    expect(() => stepFlow('run-1', { now: NOW, at: AT, head: 'aaa111', tree_clean: true, plan: undefined, ports: portsFor('VERDICT: ACCEPT'), verdict_evidence: EVIDENCE }))
      .toThrow(/not valid JSON|plan/)
    // Nothing was closed and nothing was dispatched on the strength of a missing plan.
    const flow = readFlow('run-1')
    expect(flow.state).toBe('reviewing')
  })

  it('tells a human when an escalation came from a dirty composer, not only from a decision', async () => {
    // `composer_dirty` escalates the flow while the settle reports `unconfirmed`; the journal must still learn
    // about it, or the one escalation a human has to act on is the one nobody is told about.
    // Every item has a brief, so the ACCEPT dispatches the next one — the send is what hits the dirty composer.
    const plan = planWithBriefs(['P1.1', 'P1.2', 'P1.3'])
    seedFlow(plan)
    const ports = {
      paneBusy: () => 'idle' as const,
      peek: () => 'VERDICT: ACCEPT',
      send: () => ({ sent: false as const, reason: 'composer_dirty' as const }),
    }
    const result = stepFlow('run-1', {
      now: NOW, at: AT, head: 'aaa111', tree_clean: true, plan: undefined, ports,
      verdict_evidence: EVIDENCE,
    })
    expect(result.status).toBe('unconfirmed')
    expect(readFlow('run-1').state).toBe('escalated')

    const { readNotifications } = await import('../src/core/notifications.js')
    const { events } = readNotifications()
    const escalated = events.find(event => event.kind === 'flow.escalated')
    expect(escalated).toBeTruthy()
    expect(escalated!.detail).toContain('composer_dirty')
  })

  it('counts a fix round against the item', () => {
    const plan = planWithBriefs(['P1.1'])
    seedFlow(plan)

    stepFlow('run-1', { now: NOW, at: AT, head: 'aaa111', tree_clean: true, plan: undefined, ports: portsFor('MAJOR x\nVERDICT: CHANGES_REQUESTED'), verdict_evidence: EVIDENCE })

    expect(readPlan('run-1').items.find(item => item.id === 'P1.1')!.rounds).toBe(1)
  })
})
