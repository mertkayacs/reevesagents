// The work-items projection: which task each agent is on, derived on read.
//
// Contract: `docs/work-items-view.md` (revision 9). Every case below is one bullet of its Acceptance
// section, asserted against fixtures: the flow state and the journal in, rows out. The module is pure,
// so a fixture can describe a sequence the engine would need a pane and a clock to produce.

import { describe, expect, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createFlowState } from '../src/core/flow.js'
import type { FlowState, FlowLogEntry } from '../src/core/flow.js'
import { readWorkView, workItems, workNotesFor } from '../src/core/work-items.js'
import type { WorkItem, WorkNotesIndex } from '../src/core/work-items.js'
import type { FlowVerdict } from '../src/core/verdict.js'
import type { Plan, PlanItem } from '../src/core/plan.js'
import { flowsDir, saveFlow } from '../src/core/flow-store.js'
import { savePlan } from '../src/core/plan.js'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'

const H0 = 'aaaaaaa'
const H1 = 'bbbbbbb'
const H2 = 'ccccccc'

function spec(id: string, title = `${id} title`) {
  return { id, title, goal: 'g', requirements: [], checks: [], report: [] }
}

function flow(overrides: Partial<FlowState> = {}): FlowState {
  return {
    ...createFlowState({
      run_id: 'r',
      repo: '/tmp/work',
      roles: { dev: 'dev-1', review: 'rev-1' },
      at: '2026-11-01T00:00:00.000Z',
      specs: [spec('A'), spec('B')],
    }),
    claim: { head: H0, verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null },
    ...overrides,
  }
}

// Journal entries in the order the engine writes them; the timestamps only have to rise.
function journal(...entries: Array<[string, string]>): FlowLogEntry[] {
  return entries.map(([event, detail], index) => ({
    at: `2026-11-01T00:${String(index).padStart(2, '0')}:00.000Z`,
    event,
    detail,
  }))
}

const notes = (answers: Record<string, FlowVerdict>): WorkNotesIndex => ({
  answer: (head: string) => answers[head] ?? null,
})

const NO_NOTES = notes({})

function statuses(view: { items: WorkItem[] }): Record<string, string> {
  return Object.fromEntries(view.items.map(item => [item.id, item.status]))
}

function item(view: { items: WorkItem[] }, id: string): WorkItem {
  const found = view.items.find(row => row.id === id)
  if (!found) throw new Error(`no row ${id}`)
  return found
}

function planItem(overrides: Partial<PlanItem> & { id: string }): PlanItem {
  return {
    title: `${overrides.id} plan title`,
    status: 'pending',
    spec: null,
    spec_path: null,
    spec_hash: null,
    head: null,
    rounds: 0,
    notes_ref: null,
    updated_at: '2026-11-01T00:00:00.000Z',
    owner_action: false,
    missing_since: null,
    line: 1,
    ...overrides,
  }
}

function plan(items: PlanItem[]): Plan {
  return {
    schema_version: 1,
    run_id: 'r',
    source_path: 'docs/implementation-plan.md',
    source_hash: 'h',
    imported_at: '2026-11-01T00:00:00.000Z',
    items,
    conflicts: [],
  }
}

describe('the phase pass', () => {
  it('reports queued briefs that have never been dispatched', () => {
    const view = workItems(flow(), { notes: NO_NOTES })
    expect(view.total).toBe(2)
    expect(statuses(view)).toEqual({ A: 'queued', B: 'queued' })
    expect(view.current).toBeNull()
    expect(view.dispatch_unknown).toBe(false)
    expect(item(view, 'A')).toMatchObject({ origin: 'spec', plan_status: null, holder: null, head: null })
  })

  it('shows the settled handover as in work, with the dev agent the engine dispatches to', () => {
    const state = flow({
      dispatched_specs: ['A'],
      log: journal(['dispatch_spec', 'spec_dispatched A']),
      claim: { head: H0, verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null },
    })
    const view = workItems(state, { notes: NO_NOTES })
    expect(item(view, 'A')).toMatchObject({
      status: 'in_work',
      holder: { role: 'dev', agent_id: 'dev-1' },
      note: null,
    })
    expect(item(view, 'B').status).toBe('queued')
    expect(view.current?.id).toBe('A')
  })

  it('reviews the row the flow is reviewing — never in work, even with the claim still pointing at it', () => {
    const state = flow({
      state: 'reviewing',
      review_started_at: Date.parse('2026-11-01T00:00:30.000Z'),
      dispatched_specs: ['A'],
      claim: { head: H1, verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null },
      log: journal(['dispatch_spec', 'spec_dispatched A'], ['request_review', `review_requested ${H1}`]),
    })
    const view = workItems(state, { notes: NO_NOTES })
    expect(item(view, 'A')).toMatchObject({
      status: 'reviewing',
      holder: { role: 'reviewer', agent_id: 'rev-1' },
      // §2.6.3: a review with no answer yet is a review, not a degradation.
      note: "awaiting the reviewer's answer",
      head: H1,
    })
    expect(view.current?.id).toBe('A')
  })

  it('closes the row as done when the answer is already on disk, before the tick transitions', () => {
    const state = flow({
      state: 'reviewing',
      dispatched_specs: ['A'],
      claim: { head: H1, verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null },
      log: journal(['dispatch_spec', 'spec_dispatched A'], ['request_review', `review_requested ${H1}`]),
    })
    const view = workItems(state, { notes: notes({ [H1]: 'ACCEPT' }) })
    expect(item(view, 'A')).toMatchObject({ status: 'done', holder: null })
    // The row is closed, so nothing is current while the second brief still waits in the queue.
    expect(view.current).toBeNull()
    expect(item(view, 'B').status).toBe('queued')
  })

  it('keeps one row done through a fix cycle: one dispatch, a chain of rounds inside its interval', () => {
    const state = flow({
      state: 'reviewing',
      dispatched_specs: ['A'],
      claim: { head: H2, verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null },
      log: journal(
        ['dispatch_spec', 'spec_dispatched A'],
        ['request_review', `review_requested ${H1}`],
        ['dispatch_fix', `fix_dispatched ${H1}`],
        ['request_review', `review_requested ${H2}`],
      ),
    })
    // Round 1 requested changes, round 2 accepted — the middle of the chain is normal progress.
    const view = workItems(state, { notes: notes({ [H1]: 'CHANGES_REQUESTED', [H2]: 'ACCEPT' }) })
    expect(item(view, 'A')).toMatchObject({ status: 'done', head: H2 })
    expect(view.current).toBeNull()
  })

  it('never promotes an old dispatch when a later one closed: only the closing row is done', () => {
    const state = flow({
      state: 'done',
      dispatched_specs: ['A', 'B'],
      log: journal(
        ['dispatch_spec', 'spec_dispatched A'],
        ['dispatch_spec', 'spec_dispatched B'],
        ['request_review', `review_requested ${H2}`],
        ['flow_done', 'flow_done'],
      ),
    })
    const view = workItems(state, { notes: notes({ [H2]: 'ACCEPT' }) })
    expect(statuses(view)).toEqual({ A: 'handed_over', B: 'done' })
    expect(view.current).toBeNull()
  })

  it('marks a dispatched row handed_over when the rotated journal lost its interval', () => {
    const state = flow({ dispatched_specs: ['A'], log: journal(['dispatch_spec', 'spec_dispatched B']) })
    const view = workItems(state, { notes: notes({ [H1]: 'ACCEPT' }) })
    expect(item(view, 'A').status).toBe('handed_over')
    expect(item(view, 'B').status).toBe('handed_over')
  })
})

describe('dispatching: the paste is not the handover', () => {
  it('shows the row from the moment the engine claims the paste, with no journal entry', () => {
    const state = flow({
      pending: {
        op_id: 'op-1',
        kind: 'dispatch_spec',
        target: 'dev',
        head: null,
        spec_id: 'A',
        at: Date.parse('2026-11-01T00:05:00.000Z'),
      },
    })
    const view = workItems(state, { notes: NO_NOTES })
    expect(item(view, 'A')).toMatchObject({ status: 'dispatching', holder: null, note: 'dispatch in flight, not confirmed' })
    expect(view.current?.id).toBe('A')
  })

  it('attributes an unconfirmed attempt through the nearest preceding claim', () => {
    const state = flow({
      dispatched_specs: ['A'],
      log: journal(
        ['dispatch_spec', 'spec_dispatched A'],
        ['dispatch_claimed', 'spec_dispatched A'],
        ['dispatch_unconfirmed', 'paste_unconfirmed spec_dispatched A'],
      ),
    })
    const view = workItems(state, { notes: NO_NOTES })
    expect(item(view, 'A')).toMatchObject({ status: 'dispatching', holder: null })
    expect(item(view, 'A').status).not.toBe('in_work')
    expect(view.dispatch_unknown).toBe(false)
  })

  it('attributes an unconfirmed review request through the head it claimed', () => {
    const state = flow({
      state: 'reviewing',
      dispatched_specs: ['A'],
      claim: { head: H1, verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null },
      log: journal(
        ['dispatch_spec', 'spec_dispatched A'],
        ['dispatch_claimed', `review_requested ${H1}`],
        ['dispatch_unconfirmed', `paste_unconfirmed review_requested ${H1}`],
      ),
    })
    const view = workItems(state, { notes: NO_NOTES })
    expect(item(view, 'A').status).toBe('dispatching')
  })

  it('reports an unattributable attempt at the view level instead of inventing a status', () => {
    const state = flow({
      dispatched_specs: ['A'],
      log: journal(['dispatch_unconfirmed', `paste_unconfirmed review_requested ${H1}`]),
    })
    const view = workItems(state, { notes: NO_NOTES })
    expect(view.items.some(row => row.status === 'dispatching')).toBe(false)
    expect(view.dispatch_unknown).toBe(true)
    expect(view.current).toBeNull()
    // No holder is invented for the uncertainty either.
    expect(view.items.every(row => row.holder === null)).toBe(true)
  })

  it('returns a refused first handover to queued with no note', () => {
    const state = flow({
      log: journal(['dispatch_claimed', 'spec_dispatched A'], ['dispatch_refused', 'composer_dirty']),
    })
    const view = workItems(state, { notes: NO_NOTES })
    expect(item(view, 'A')).toMatchObject({ status: 'queued', note: null, holder: null })
    expect(view.current).toBeNull()
    expect(view.dispatch_unknown).toBe(false)
  })

  it('leaves the task phase untouched when a fix attempt is refused', () => {
    const state = flow({
      state: 'fixing',
      dispatched_specs: ['A'],
      claim: { head: H1, verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null },
      log: journal(
        ['dispatch_spec', 'spec_dispatched A'],
        ['request_review', `review_requested ${H1}`],
        ['dispatch_claimed', `fix_dispatched ${H1}`],
        ['dispatch_refused', 'composer_dirty'],
      ),
    })
    const view = workItems(state, { notes: notes({ [H1]: 'CHANGES_REQUESTED' }) })
    expect(item(view, 'A')).toMatchObject({ status: 'in_work', holder: { role: 'dev', agent_id: 'dev-1' } })
    expect(view.current?.id).toBe('A')
  })

  it('keeps the row dispatching when a retry after an unconfirmed attempt is refused', () => {
    const state = flow({
      dispatched_specs: ['A'],
      log: journal(
        ['dispatch_spec', 'spec_dispatched A'],
        ['dispatch_claimed', 'spec_dispatched A'],
        ['dispatch_unconfirmed', 'paste_unconfirmed spec_dispatched A'],
        ['dispatch_claimed', 'spec_dispatched A'],
        ['dispatch_refused', 'composer_dirty'],
      ),
    })
    const view = workItems(state, { notes: NO_NOTES })
    expect(item(view, 'A')).toMatchObject({
      status: 'dispatching',
      note: 'attempt refused; handover still unconfirmed',
    })
  })
})

describe('current and ambiguity', () => {
  it('never falls through to a queued row, even when one is waiting', () => {
    const state = flow({
      state: 'done',
      dispatched_specs: ['A'],
      log: journal(['dispatch_spec', 'spec_dispatched A'], ['request_review', `review_requested ${H1}`], ['flow_done', 'x']),
    })
    const view = workItems(state, { notes: notes({ [H1]: 'ACCEPT' }) })
    expect(statuses(view)).toEqual({ A: 'done', B: 'queued' })
    expect(view.current).toBeNull()
    expect(view.dispatch_unknown).toBe(false)
  })

  it('gives up the active row when two sources disagree, and says why on both rows', () => {
    const state = flow({
      dispatched_specs: ['A', 'B'],
      claim: { head: H0, verdict: null, verdict_count: 0, verdict_applied: false, spec_id: 'B' },
      pending: {
        op_id: 'op-1',
        kind: 'dispatch_spec',
        target: 'dev',
        head: null,
        spec_id: 'A',
        at: Date.parse('2026-11-01T00:05:00.000Z'),
      },
      log: journal(['dispatch_spec', 'spec_dispatched A']),
    })
    const view = workItems(state, { notes: NO_NOTES })
    expect(view.current).toBeNull()
    expect(item(view, 'A')).toMatchObject({ status: 'handed_over', note: 'ambiguous current work' })
    expect(item(view, 'B')).toMatchObject({ status: 'handed_over', note: 'ambiguous current work' })
  })

  it('does not call a closed row a disagreeing source', () => {
    // The normal case: the accepted row is evidence-closed while the next dispatch is in flight.
    const state = flow({
      dispatched_specs: ['A'],
      pending: {
        op_id: 'op-1',
        kind: 'dispatch_spec',
        target: 'dev',
        head: null,
        spec_id: 'B',
        at: Date.parse('2026-11-01T00:05:00.000Z'),
      },
      log: journal(['dispatch_spec', 'spec_dispatched A'], ['request_review', `review_requested ${H1}`]),
    })
    const view = workItems(state, { notes: notes({ [H1]: 'ACCEPT' }) })
    expect(item(view, 'A').status).toBe('done')
    expect(item(view, 'B').status).toBe('dispatching')
    expect(view.current?.id).toBe('B')
  })
})

describe('plan rows and the ownership gate', () => {
  it('passes plan statuses through with plan_status, and appends an off-plan spec', () => {
    const state = flow({
      state: 'reviewing',
      dispatched_specs: ['A'],
      specs: [spec('A')],
      claim: { head: H1, verdict: null, verdict_count: 0, verdict_applied: false, spec_id: 'P1' },
      log: journal(['dispatch_spec', 'plan_item_dispatched P1'], ['request_review', `review_requested ${H1}`]),
    })
    const view = workItems(state, {
      notes: NO_NOTES,
      plan: plan([planItem({ id: 'P1', status: 'reviewing', head: H1 }), planItem({ id: 'P2', status: 'queued' })]),
    })
    expect(view.total).toBe(3)
    expect(item(view, 'P1')).toMatchObject({
      origin: 'plan',
      status: 'reviewing',
      plan_status: 'reviewing',
      holder: { role: 'reviewer', agent_id: 'rev-1' },
      head: H1,
    })
    expect(item(view, 'P2')).toMatchObject({ origin: 'plan', status: 'queued', holder: null })
    // A brief queued beside the plan keeps its own origin and is not written into the plan.
    expect(item(view, 'A')).toMatchObject({ origin: 'spec' })
    expect(view.current?.id).toBe('P1')
  })

  it('keeps a stored status and removes the owner while the flow is paused', () => {
    const state = flow({ state: 'paused', paused_from: 'reviewing', paused_at: 1 })
    const view = workItems(state, {
      notes: NO_NOTES,
      plan: plan([planItem({ id: 'P1', status: 'reviewing', head: H1 })]),
    })
    expect(item(view, 'P1')).toMatchObject({
      status: 'reviewing',
      plan_status: 'reviewing',
      holder: null,
      note: 'flow paused: ownership unknown',
    })
    expect(view.current).toBeNull()
  })

  it('keeps a spec row that would have been active gated the same way', () => {
    const state = flow({
      state: 'paused',
      paused_from: 'idle',
      paused_at: 1,
      dispatched_specs: ['A'],
      log: journal(['dispatch_spec', 'spec_dispatched A']),
    })
    const view = workItems(state, { notes: NO_NOTES })
    expect(item(view, 'A')).toMatchObject({ status: 'in_work', holder: null, note: 'flow paused: ownership unknown' })
    expect(view.current).toBeNull()
  })

  it('holds the plan row in work when the history is gone — a live binding wins over lost history', () => {
    const state = flow({ state: 'fixing' })
    const view = workItems(state, {
      notes: NO_NOTES,
      plan: plan([planItem({ id: 'P1', status: 'in_work', head: H1 })]),
    })
    expect(item(view, 'P1')).toMatchObject({
      status: 'in_work',
      holder: { role: 'dev', agent_id: 'dev-1' },
    })
  })
})

describe('the notes chain', () => {
  it('accepts a verdict on the first line and lets the newest round decide', () => {
    const root = mkdtemp()
    const state = flow({ run_id: 'notes-run' })
    const inbox = join(flowsDir(root), 'notes-run', 'notes', 'inbox')
    mkdirSync(inbox, { recursive: true })
    // Round 1 asked for changes, round 2 accepted — both for the same head, the newest file wins.
    writeFileSync(join(inbox, `${H1}-r1.md`), `VERDICT: CHANGES_REQUESTED\nMAJOR: something\n`)
    writeFileSync(join(inbox, `${H1}-r2.md`), `VERDICT: ACCEPT\n`)
    const index = workNotesFor('notes-run', root)
    expect(index.answer(H1)).toBe('ACCEPT')
    // An unusable file is not an answer.
    expect(index.answer(H2)).toBeNull()
    void state
  })

  it('reads the evidence of a live flow through the same helpers', () => {
    const root = mkdtemp()
    const state = flow({
      run_id: 'notes-run',
      state: 'reviewing',
      dispatched_specs: ['A'],
      claim: { head: H1, verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null },
      log: journal(['dispatch_spec', 'spec_dispatched A'], ['request_review', `review_requested ${H1}`]),
    })
    saveFlow(state, { root })
    const inbox = join(flowsDir(root), 'notes-run', 'notes', 'inbox')
    mkdirSync(inbox, { recursive: true })
    writeFileSync(join(inbox, `${H1}-r1.md`), 'VERDICT: ACCEPT\n')
    const view = readWorkView('notes-run', { root })
    expect(view?.items.find(row => row.id === 'A')?.status).toBe('done')
  })
})

describe('no writes', () => {
  it('hashes the flow state, the plan and the notes directory identically before and after a read', () => {
    const root = mkdtemp()
    const state = flow({
      run_id: 'read-only',
      state: 'reviewing',
      dispatched_specs: ['P1'],
      claim: { head: H1, verdict: null, verdict_count: 0, verdict_applied: false, spec_id: 'P1' },
      log: journal(['dispatch_spec', 'plan_item_dispatched P1'], ['request_review', `review_requested ${H1}`]),
    })
    saveFlow(state, { root })
    savePlan(plan([planItem({ id: 'P1', status: 'reviewing', head: H1 })]) as Plan, { root, run_id: 'read-only' } as never)
    const inbox = join(flowsDir(root), 'read-only', 'notes', 'inbox')
    mkdirSync(inbox, { recursive: true })
    writeFileSync(join(inbox, `${H1}-r1.md`), 'VERDICT: ACCEPT\n')

    const before = hashTree(join(flowsDir(root), 'read-only'))
    const view = readWorkView('read-only', { root })
    const after = hashTree(join(flowsDir(root), 'read-only'))

    expect(view?.total).toBeGreaterThan(0)
    expect(after).toEqual(before)
  })
})

function mkdtemp(): string {
  const base = join(process.env.TMPDIR ?? '/tmp', `work-items-${Math.random().toString(36).slice(2)}`)
  mkdirSync(base, { recursive: true })
  return base
}

function hashTree(dir: string): Record<string, string> {
  const out: Record<string, string> = {}
  const walk = (path: string, prefix: string) => {
    for (const name of readdirSync(path).sort()) {
      const full = join(path, name)
      const stat = statSync(full)
      if (stat.isDirectory()) {
        out[`${prefix}${name}/`] = String(stat.mtimeMs)
        walk(full, `${prefix}${name}/`)
      } else {
        out[`${prefix}${name}`] = `${stat.size}:${createHash('sha256').update(readFileSync(full)).digest('hex')}`
      }
    }
  }
  walk(dir, '')
  return out
}

describe('evidence that outlives its notes file', () => {
  it('reads a pruned answer from the journal entry that consumed it and moved the flow on', () => {
    // Notes pruning keeps one round of a closed flow: the file is gone, the fact that the engine accepted it is not. The
    // `notes_ref` on the dispatch of the *next* brief is that record — only an ACCEPT dispatches one.
    const state = flow({
      state: 'done',
      dispatched_specs: ['A', 'B'],
      log: [
        { at: '2026-11-01T00:00:00.000Z', event: 'dispatch_spec', detail: 'spec_dispatched A' },
        { at: '2026-11-01T00:01:00.000Z', event: 'request_review', detail: `review_requested ${H1}` },
        {
          at: '2026-11-01T00:02:00.000Z',
          event: 'dispatch_spec',
          detail: 'spec_dispatched B',
          notes_ref: `notes/${H1}-r1.md`,
          notes_counts: { blocker: 0, major: 0, minor: 0 },
        },
        { at: '2026-11-01T00:03:00.000Z', event: 'request_review', detail: `review_requested ${H2}` },
        { at: '2026-11-01T00:04:00.000Z', event: 'flow_done', detail: 'flow_done', notes_ref: `notes/${H2}-r1.md` },
      ],
    })
    // No notes at all: every answer was pruned.
    const view = workItems(state, { notes: NO_NOTES })
    expect(item(view, 'A').status).toBe('done')
    expect(item(view, 'B').status).toBe('done')
    expect(view.current).toBeNull()
  })

  it('does not read a fix dispatch as an acceptance, and leaves a row handed_over without either evidence', () => {
    const state = flow({
      state: 'fixing',
      dispatched_specs: ['A'],
      claim: { head: H1, verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null },
      log: [
        { at: '2026-11-01T00:00:00.000Z', event: 'dispatch_spec', detail: 'spec_dispatched A' },
        { at: '2026-11-01T00:01:00.000Z', event: 'request_review', detail: `review_requested ${H1}` },
        {
          at: '2026-11-01T00:02:00.000Z',
          event: 'dispatch_fix',
          detail: `fix_dispatched ${H1}`,
          notes_ref: `notes/${H1}-r1.md`,
          notes_counts: { blocker: 0, major: 1, minor: 0 },
        },
      ],
    })
    // The fix dispatch consumed the answer, but it did not *accept* it: the row is still in work.
    const view = workItems(state, { notes: notes({ [H1]: 'CHANGES_REQUESTED' }) })
    expect(item(view, 'A').status).toBe('in_work')

    const lost = flow({
      state: 'done',
      dispatched_specs: ['A'],
      log: [
        { at: '2026-11-01T00:00:00.000Z', event: 'dispatch_spec', detail: 'spec_dispatched A' },
        { at: '2026-11-01T00:01:00.000Z', event: 'request_review', detail: `review_requested ${H1}` },
        { at: '2026-11-01T00:02:00.000Z', event: 'flow_done', detail: 'flow_done' },
      ],
    })
    expect(item(workItems(lost, { notes: NO_NOTES }), 'A').status).toBe('handed_over')
  })
})
