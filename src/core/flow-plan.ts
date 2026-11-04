// The bridge between the plan (a document mirror with its own statuses) and the flow engine (a pure function
// over observations). It is deliberately a *view*: the engine never reads `plan.json`, it receives the items
// it needs and answers with decisions, so a tick stays a pure function of its arguments and a test can describe
// any plan without touching the disk.
//
// Design: `docs/plan-model-design.md` §5–6. Two rules live here:
//
// - **the plan decides the order.** The next item is the first in document order that can move; a `needs_brief`
//   item stops the line instead of being skipped, because silently reordering the project is worse than
//   waiting.
// - **the plan decides the budget.** `max_rounds` is per item (a flow carries dozens of items; one counter for
//   all of them either cuts a healthy item or lets a bad one eat the budget), and `max_total_rounds` is the
//   global fuse.

import type { BlockSpec } from './spec.js'
import type { Plan, PlanItem, PlanStatus } from './plan.js'

export interface PlanItemTick {
  id: string
  title: string
  status: PlanStatus
  block_reason?: string | null
  rounds: number
  spec: BlockSpec | null
  // Where the brief came from, so a surface can queue it (`flow plan next`) or show it (`flow plan`).
  spec_path: string | null
  head: string | null
  notes_ref: string | null
  // The document no longer lists it: it never becomes work and it never counts as complete.
  missing: boolean
}

export interface PlanTickView {
  items: PlanItemTick[]
  // How many rounds one item may spend before it blocks.
  max_rounds_per_item: number
  // The fuse for the whole flow.
  max_total_rounds: number
}

export const DEFAULT_TOTAL_ROUNDS_FACTOR = 4
export const MAX_TOTAL_ROUNDS_CAP = 100

// `max_total_rounds` is a fuse, not a second opinion about a single item: four times the per-item budget by
// default, never more than a hundred.
export function defaultTotalRounds(maxRoundsPerItem: number): number {
  return Math.min(Math.max(maxRoundsPerItem, 1) * DEFAULT_TOTAL_ROUNDS_FACTOR, MAX_TOTAL_ROUNDS_CAP)
}

export function planTickView(plan: Plan, budgets: { perItem: number, total: number }): PlanTickView {
  return {
    max_rounds_per_item: budgets.perItem,
    max_total_rounds: budgets.total,
    items: plan.items.map((item: PlanItem) => ({
      id: item.id,
      title: item.title,
      status: item.status,
      block_reason: item.block_reason,
      rounds: item.rounds,
      spec: item.spec,
      spec_path: item.spec_path,
      head: item.head,
      notes_ref: item.notes_ref,
      missing: item.missing_since !== null,
    })),
  }
}

const TERMINAL = new Set<PlanStatus>(['done', 'skipped'])

export function planItemOpen(item: PlanItemTick): boolean {
  return !TERMINAL.has(item.status) && !item.missing
}

// Every item that is neither closed nor gone, in document order: the list `plan_incomplete` names.
export function planOpenItems(view: PlanTickView): PlanItemTick[] {
  return view.items.filter(planItemOpen)
}

export function planIsComplete(view: PlanTickView): boolean {
  return view.items.every(item => TERMINAL.has(item.status)) && view.items.length > 0
}

export type PlanNextOutcome =
  // Ready to dispatch: a brief is attached and nothing else is in flight.
  | { kind: 'item', item: PlanItemTick }
  // The head of the line has no brief. The engine escalates; it never invents scope.
  | { kind: 'needs_brief', item: PlanItemTick }
  // The head of the line waits for a human for another reason (`blocked_owner`, rounds exhausted).
  | { kind: 'blocked_owner', item: PlanItemTick }
  // Nothing left to do, or the only open items are missing from the document.
  | { kind: 'none' }
  | { kind: 'in_flight', item: PlanItemTick }

// The next item, in document order, skipping the one an ACCEPT just closed.
//
// One task per flow, and a brief is mandatory: an item without one is *reported*, never dispatched, and never
// blocks the items that do have a brief — the owner's rule for block 13 is "take the first item with a brief",
// with the ones missing a brief visible as "waiting for a brief". The order is still honoured among the items
// that can move, which is what keeps a plan a plan rather than a bag.
export function planNext(view: PlanTickView, options: { skip?: string | null } = {}): PlanNextOutcome {
  const open = planOpenItems(view).filter(item => item.id !== options.skip)
  const inFlight = open.find(item => item.status === 'in_work' || item.status === 'reviewing')
  if (inFlight) return { kind: 'in_flight', item: inFlight }
  // A blocked item stops the picker *before* the ready ones: `blocked_owner` is a decision the owner already
  // made about this point of the plan, and routing around it turns that decision into a suggestion. A missing
  // brief is different — it is work not yet described, and the owner's rule is to report it and move on.
  const blocked = open.find(item => item.status === 'blocked_owner')
  if (blocked) return { kind: 'blocked_owner', item: blocked }
  const ready = open.find(item => item.spec !== null)
  if (ready) return { kind: 'item', item: ready }
  const needsBrief = open.find(item => !item.spec)
  if (needsBrief) return { kind: 'needs_brief', item: needsBrief }
  return { kind: 'none' }
}

// Every open item waiting for a brief, for the "waiting for you" line: a plan with three unbriefed items must
// show three, not the first one the picker stopped at.
export function planWaitingForBrief(view: PlanTickView): PlanItemTick[] {
  return planOpenItems(view).filter(item => !item.spec && item.status !== 'blocked_owner')
}

// Is this item's budget spent? Checked before a dispatch, so an item that already used its rounds blocks
// instead of starting a sixth fix round.
export function itemBudgetSpent(view: PlanTickView, item: PlanItemTick): boolean {
  return item.rounds >= view.max_rounds_per_item
}

// The flow's fuse: the rounds the flow has spent, against `max_total_rounds`.
export function totalBudgetSpent(view: PlanTickView, flowRounds: number): boolean {
  return flowRounds >= view.max_total_rounds
}

// A one-line summary for the journal and for `flow status`: how far the plan got and what it is waiting for.
export function planTickSummary(view: PlanTickView): string {
  const done = view.items.filter(item => item.status === 'done').length
  const skipped = view.items.filter(item => item.status === 'skipped').length
  const open = planOpenItems(view)
  const needsBrief = open.filter(item => !item.spec && item.status !== 'blocked_owner').length
  const blocked = open.filter(item => item.status === 'blocked_owner').length
  const missing = view.items.filter(item => item.missing).length
  const parts = [`${done}/${view.items.length} done`]
  if (skipped > 0) parts.push(`${skipped} skipped`)
  if (open.length > 0) parts.push(`${open.length} open`)
  if (needsBrief > 0) parts.push(`${needsBrief} needs brief`)
  if (blocked > 0) parts.push(`${blocked} blocked`)
  if (missing > 0) parts.push(`${missing} missing`)
  return parts.join(' · ')
}
