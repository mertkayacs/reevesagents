// The close in the mirror is written back into the document that lists the work (block 72).
//
// A live run finished 5/5 in the panel while `docs/implementation-plan.md` still said `- [ ]` on every line; the next
// `flow plan import` would have recorded an `unticked` conflict for each of them. These tests drive a real git repository
// and a real document: the line is ticked, the tick is committed as one docs-only commit, and that commit is what the
// re-anchor path already knows how to skip.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { createFlowState } from '../src/core/flow.js'
import type { FlowState } from '../src/core/flow.js'
import { readFlow, saveFlow } from '../src/core/flow-store.js'
import { attachSpec, createPlan, importInto, planPath, readPlan, savePlan } from '../src/core/plan.js'
import type { Plan } from '../src/core/plan.js'
import { applyPlanMarks, markPlanItems } from '../src/core/plan-mark.js'
import { stepFlow } from '../src/core/flow-runner.js'
import { readNotifications } from '../src/core/notifications.js'
import { writeAgent, writeRun } from '../src/core/runs.js'

// The engine's git calls are real here: the point of the block is a commit that exists. Only tmux is stubbed, by the ports
// the runner takes.
const NOW = Date.parse('2026-11-03T10:00:00.000Z')
const AT = new Date(NOW).toISOString()
const EVIDENCE = { elapsed_ms: 120_000, notes_bytes: 200, notes_findings: 1, pane_tool_lines: 3 }
const DOC_PATH = 'docs/implementation-plan.md'
const DOC = [
  '# plan',
  '',
  '- [ ] **P1.1** — first item',
  '- [ ] **P1.2** — second item',
  '- [ ] **P1.3** — third item',
  '',
].join('\n')

let root: string
let repo: string
let savedRegistry: string | undefined

function git(...args: string[]): string {
  return String(execFileSync('git', ['-C', repo, ...args], { encoding: 'utf-8' })).trim()
}

function document(): string {
  return readFileSync(join(repo, DOC_PATH), 'utf-8')
}

function briefFor(id: string): string {
  return JSON.stringify({ id, title: id, goal: 'g', requirements: ['r'], checks: ['c'], report: ['r'] })
}

function planWith(ids: string[]): Plan {
  const created = createPlan({ run_id: 'run-1', source_path: DOC_PATH, text: DOC, now: NOW, at: AT })
  return ids.reduce((plan, id) => attachSpec(plan, {
    id, text: briefFor(id), format: 'json', spec_path: `docs/briefs/${id}.json`, now: NOW, at: AT,
  }).plan, created.plan)
}

function reviewingState(overrides: Partial<FlowState> = {}): FlowState {
  const state = createFlowState({
    run_id: 'run-1', repo, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 2, max_total_rounds: 5, at: AT,
  })
  return {
    ...state,
    state: 'reviewing',
    rounds: 1,
    review_started_at: NOW - 120_000,
    // No verdict seen yet, so the pane's ACCEPT is the fresh answer to this round.
    claim: { head: git('rev-parse', 'HEAD'), verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null },
    active_plan_item: 'P1.1',
    ...overrides,
  }
}

function seed(plan: Plan, state: FlowState): void {
  mkdirSync(dirname(planPath('run-1')), { recursive: true })
  savePlan(plan)
  saveFlow(state)
}

function portsFor(paneText = ''): { paneBusy: () => 'idle', peek: () => string, send: () => { sent: true } } {
  return { paneBusy: () => 'idle' as const, peek: () => paneText, send: () => ({ sent: true as const }) }
}

function tick(options: Record<string, unknown> = {}) {
  return stepFlow('run-1', {
    now: NOW, at: AT, head: git('rev-parse', 'HEAD'), tree_clean: true, plan: undefined,
    ports: portsFor('VERDICT: ACCEPT'), verdict_evidence: EVIDENCE, evidence_policy: { min_seconds: 0, retries: 1 },
    ...options,
  })
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'reeves-plan-mark-'))
  repo = join(root, 'project')
  mkdirSync(join(repo, 'docs'), { recursive: true })
  savedRegistry = process.env.REEVES_REGISTRY
  process.env.REEVES_REGISTRY = root
  process.env.REEVES_CONFIG = join(root, 'config.json')
  execFileSync('git', ['init', '-q', repo], { encoding: 'utf-8' })
  git('config', 'user.email', 't@t')
  git('config', 'user.name', 't')
  writeFileSync(join(repo, DOC_PATH), DOC, 'utf-8')
  git('add', '-A')
  git('commit', '-qm', 'base')
  writeRun({
    id: 'run-1', name: 'run-1', status: 'running', tmux_session: 'reeves-run-1', reeves_window_id: '@0',
    reeves_pane_id: '%0', root_agent_id: 'dev-1', working_dir: repo, preset_name: null,
    started_at: '2026-11-03T09:00:00.000Z', ended_at: null,
  })
  for (const [id, pane] of [['dev-1', '%1'], ['rev-1', '%2']] as const) {
    writeAgent({
      id, run_id: 'run-1', nickname: id, provider: 'codex', model: '', role: 'worker', working_dir: repo,
      task: 't', task_status: 'working', task_note: '', tmux_session: 'reeves-run-1',
      tmux_window_id: '@1', tmux_pane_id: pane, rc_enabled: false, permissions: 'ask', inbox: [],
      last_seen: 1, started_at: '2026-11-03T09:00:00.000Z', ended_at: null,
    })
  }
})

afterEach(() => {
  if (savedRegistry === undefined) delete process.env.REEVES_REGISTRY
  else process.env.REEVES_REGISTRY = savedRegistry
  delete process.env.REEVES_CONFIG
  rmSync(root, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('an ACCEPT ticks the item in the document (block 72)', () => {
  it('turns exactly its own line into [x] and leaves every other byte alone', () => {
    const before = document()
    seed(planWith(['P1.1', 'P1.2']), reviewingState())

    const result = tick()

    expect(result.decision.reason).toBe('plan_item_dispatched')
    expect(readPlan('run-1').items.find(item => item.id === 'P1.1')!.status).toBe('done')
    const after = document()
    expect(after).toContain('- [x] **P1.1** — first item')
    // One character changed, nothing else: the rest of the file is the same bytes, in the same order.
    expect(after.replace('- [x] **P1.1**', '- [ ] **P1.1**')).toBe(before)
  })

  it('commits the mark as one docs-only commit that names the item', () => {
    seed(planWith(['P1.1', 'P1.2']), reviewingState())

    tick()

    expect(git('log', '-1', '--format=%s')).toBe('chore(flow): mark P1.1 done in the plan')
    expect(git('status', '--porcelain')).toBe('')
    const sha = git('rev-parse', 'HEAD')
    // The flow's own journal carries the line an operator reads in `flow logs`.
    expect(readFlow('run-1').log.at(-1)).toMatchObject({ event: 'plan_item_marked', detail: `P1.1 ${sha}` })
    // And the panel's journal (the notification list) carries the same fact.
    const marked = readNotifications().events.filter(event => event.kind === 'plan.item_marked')
    expect(marked).toHaveLength(1)
    expect(marked[0]!.title).toContain('P1.1')
  })

  it('spends no round on the mark commit: the next tick re-anchors instead of asking for a review', () => {
    seed(planWith(['P1.1', 'P1.2']), reviewingState())
    tick()
    const afterClose = readFlow('run-1')
    const markSha = git('rev-parse', 'HEAD')

    // The mark commit moved HEAD. That commit touches only the plan, so the existing docs-only path takes it as the new
    // baseline: no review request, no round.
    const next = tick({ head: markSha })

    expect(next.decision.reason).toBe('head_reanchored')
    expect(next.send).toBeUndefined()
    const after = readFlow('run-1')
    expect(after.rounds).toBe(afterClose.rounds)
    expect(after.claim.head).toBe(markSha)
    expect(after.log.some(entry => entry.event === 'review_requested')).toBe(false)
  })

  it('does not hand the re-import an `unticked` conflict for a marked item', () => {
    seed(planWith(['P1.1', 'P1.2']), reviewingState())
    tick()
    expect(document()).toContain('- [x] **P1.1**')

    const reimported = importInto(readPlan('run-1'), {
      run_id: 'run-1', source_path: DOC_PATH, text: document(), now: NOW + 60_000,
    })

    expect(reimported.conflicts.filter(conflict => conflict.kind === 'unticked')).toEqual([])
  })
})

describe('the mark is best effort, and retried when it could not be written (block 72)', () => {
  it('defers on a dirty tree, journals it once, and writes nothing', () => {
    seed(planWith(['P1.1']), reviewingState())
    const before = document()

    const outcome = applyPlanMarks('run-1', { repo, tree_clean: false, ids: ['P1.1'], attempt: 'close', at: AT })

    expect(outcome.deferred).toBe(true)
    expect(outcome.sha).toBeNull()
    expect(document()).toBe(before)
    expect(git('status', '--porcelain')).toBe('')
    expect(readFlow('run-1').log.at(-1)).toMatchObject({ event: 'plan_mark_deferred', detail: 'tree_dirty' })
  })

  it('marks on the next clean pass, so a deferred tick is not lost', () => {
    seed(planWith(['P1.1']), reviewingState())
    // Close the mirror by hand (what the tick did) and leave the document unticked: the state a deferred mark leaves.
    const plan = readPlan('run-1')
    savePlan({ ...plan, items: plan.items.map(item => (item.id === 'P1.1' ? { ...item, status: 'done' as const } : item)) })

    const outcome = applyPlanMarks('run-1', { repo, tree_clean: true, attempt: 'reconcile', at: AT })

    expect(outcome.marked.map(entry => entry.id)).toEqual(['P1.1'])
    expect(document()).toContain('- [x] **P1.1** — first item')
    expect(readFlow('run-1').log.at(-1)).toMatchObject({ event: 'plan_item_marked', detail: `P1.1 ${outcome.sha}` })
  })

  it('journals a failure without undoing the close when the document is gone', () => {
    seed(planWith(['P1.1', 'P1.2']), reviewingState())
    rmSync(join(repo, DOC_PATH))

    const result = tick()

    // The mirror closed the item anyway: the mark is bookkeeping, the close is the decision.
    expect(readPlan('run-1').items.find(item => item.id === 'P1.1')!.status).toBe('done')
    const failure = readFlow('run-1').log.find(entry => entry.event === 'plan_mark_failed')
    expect(failure?.detail).toContain('P1.1')
    expect(failure?.detail).toContain('was not found')
    expect(result.status).toBe('applied')
  })

  it('refuses a document outside the project, and says so', () => {
    const outside = join(root, 'elsewhere.md')
    writeFileSync(outside, DOC, 'utf-8')
    const plan = { ...planWith(['P1.1']), source_path: '../elsewhere.md' }
    seed(plan, reviewingState())

    const outcome = markPlanItems({ repo, source_path: plan.source_path, ids: ['P1.1'], plan, tree_clean: true })

    expect(outcome.marked).toEqual([])
    expect(outcome.failures[0]!.reason).toContain('not inside the project')
  })

  it('writes nothing twice: a line already ticked is reported and no commit is made', () => {
    seed(planWith(['P1.1']), reviewingState())
    tick()
    const head = git('rev-parse', 'HEAD')

    const again = markPlanItems({ repo, source_path: DOC_PATH, ids: ['P1.1'], plan: readPlan('run-1'), tree_clean: true })

    expect(again.marked).toEqual([])
    expect(again.already).toEqual(['P1.1'])
    expect(git('rev-parse', 'HEAD')).toBe(head)
  })

  it('never ticks a line that belongs to another item', () => {
    // A document edited between the import and the close: the mirror's line number now points at P1.2.
    const plan = planWith(['P1.1'])
    seed(plan, reviewingState())
    writeFileSync(join(repo, DOC_PATH), DOC.replace('- [ ] **P1.1** — first item', '- [ ] **P9.9** — something else'), 'utf-8')

    const outcome = markPlanItems({ repo, source_path: DOC_PATH, ids: ['P1.1'], plan, tree_clean: true })

    expect(outcome.marked).toEqual([])
    expect(outcome.failures[0]!.reason).toContain('not this item')
    expect(document()).toContain('- [ ] **P9.9**')
  })
})
