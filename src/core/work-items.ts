// Work items: which task each agent is on, derived on read.
//
// Contract: `docs/work-items-view.md` (revision 9, accepted). One record — `state.specs`,
// `state.claim`, `state.pending` and the journal — and one read-only projection over it. Nothing
// here writes, locks, migrates or decides a dispatch: a second writer of the same truth is exactly
// the defect class the design rejected (rounds 1–2), and a projection cannot reproduce it.
//
// The rules, in the order §2 of the contract states them:
// - one phase pass per row, first match wins: done, dispatching, reviewing, in_work, handed_over,
//   queued (§2.1);
// - `done` is a chain of rounds inside one dispatch interval, decided by the newest notes file of
//   the last round (§2.2) — through `readNewestNotes` + `validateNotesText`, never by parsing here;
// - `dispatching` is the paste, not the handover: `pending` or an unsettled dispatch attributed to
//   the row (§2.3), and an unattributable one is reported at the view level, never parked on
//   whichever row looks convenient;
// - `current` is recomputed last, may only be a dispatching/in_work/reviewing row, and never falls
//   through to `queued` (§2.4);
// - plan rows keep their stored `plan_status`; the ownership gate (§2.0) only removes the holder
//   and names the state in the note, so the plan file is never rewritten on read (§2.5).
//
// Everything is a function of the arguments. The caller supplies the plan (it is a separate file)
// and an index of the notes directory, which is what makes the module unit-testable from fixtures
// and lets a test prove that a read changes no byte on disk.

import type { FlowLogEntry, FlowState, FlowStatus } from './flow.js'
import { SETTLED_DISPATCH_EVENTS, flowDispatchNote } from './flow-view.js'
import { readFlow } from './flow-store.js'
import { isCommitId, readNewestNotes, validateNotesText } from './flow-notes.js'
import { planExists, readPlan } from './plan.js'
import type { Plan, PlanItem } from './plan.js'
import { redactSecrets } from './redact.js'
import type { FlowVerdict } from './verdict.js'

export type WorkItemStatus =
  // Spec rows: work the flat queue put on the flow.
  | 'queued' | 'dispatching' | 'in_work' | 'reviewing' | 'handed_over'
  // Plan rows: the eight statuses `plan.json` stores.
  | 'pending' | 'needs_brief' | 'done' | 'blocked_owner' | 'skipped'

export interface WorkItemHolder {
  role: 'dev' | 'reviewer'
  // The real agent the engine dispatches to (`state.roles`, set at `flow start --dev/--review`), not
  // merely the part it plays.
  agent_id: string
}

export interface WorkItem {
  id: string
  title: string
  // Where the row came from. A view field: never written into `plan.json`.
  origin: 'plan' | 'spec'
  // Effective status for the panel.
  status: WorkItemStatus
  // Plan rows only: what `plan.json` says, untouched by the ownership gate.
  plan_status: WorkItemStatus | null
  holder: WorkItemHolder | null
  // The commit this row's current round is about, when known.
  head: string | null
  // Why the status is what it is, e.g. `flow paused: ownership unknown`.
  note: string | null
}

export interface WorkView {
  total: number
  items: WorkItem[]
  // Recomputed after the phases: only a dispatching/in_work/reviewing row, or null.
  current: WorkItem | null
  // An unsettled dispatch exists but cannot be attributed to any row.
  dispatch_unknown: boolean
}

// The engine's own words, so an operator can match the note against the journal instead of
// translating a paraphrase.
const DISPATCH_IN_FLIGHT = 'dispatch in flight, not confirmed'
const DISPATCH_REFUSED_RETRY = 'attempt refused; handover still unconfirmed'
const AMBIGUOUS = 'ambiguous current work'
const AWAITING_ANSWER = "awaiting the reviewer's answer"

// §2.0: a flow owns work only in these three. Everywhere else the projection reports no owner.
const OWNING_STATES = new Set<FlowStatus>(['idle', 'reviewing', 'fixing'])
const GATED_STATES = new Set<FlowStatus>(['paused', 'escalated', 'orphaned', 'done'])

// The round events of one dispatch interval. `dispatch_fix` stays *inside* the interval: a fix
// belongs to the same item (§2.2).
const ROUND_EVENTS = new Set(['request_review', 'dispatch_fix'])
// An unsettled attempt is a round too: a review request whose submit was never confirmed still
// applied its transition, and the reviewer may answer the commit it pasted.
const UNSETTLED_EVENTS = new Set(['dispatch_unconfirmed', 'dispatch_retry_enter'])

// The notes directory, indexed. `answer(head)` is the newest round's validated verdict for a commit,
// or null when there is none. Injected so the derivation itself performs no I/O; built by
// `workNotesFor` for the surfaces.
export interface WorkNotesIndex {
  answer: (_head: string) => FlowVerdict | null
}

export interface WorkItemsOptions {
  plan?: Plan | null
  notes?: WorkNotesIndex
  // The moment the panel is rendered at. It bounds the evidence: a journal entry stamped after it
  // (a clock that runs ahead, a hand-edited file) has not happened yet and is not read as proof.
  at?: number
}

const EMPTY_NOTES: WorkNotesIndex = { answer: () => null }

// One dispatch of the journal and its interval: from the `dispatch_spec` entry to the next
// `dispatch_spec` or `flow_done`, or to now. `heads` are the rounds the interval holds, in order.
interface DispatchInterval {
  id: string | null
  // Index of the last entry inside the interval (exclusive).
  end: number
  heads: string[]
  // The last round of the chain holds a valid ACCEPT (§2.2).
  done: boolean
}

export function workItems(state: FlowState, options: WorkItemsOptions = {}): WorkView {
  const now = options.at ?? Date.now()
  const plan = options.plan ?? null
  const notes = options.notes ?? EMPTY_NOTES

  const intervals = dispatchIntervals(state, notes, now)
  const gated = GATED_STATES.has(state.state)
  // While paused the phases must answer for the state the flow resumes into, or every row that was
  // active would silently demote to `handed_over` and the gate would have nothing to name.
  const owning = owningState(state)

  const claim = state.claim
  const pendingId = state.pending !== null && state.pending.kind === 'dispatch_spec'
    ? state.pending.spec_id
    : null
  const newestInterval = intervals.at(-1) ?? null
  const unsettled = unsettledIndex(state)
  const attributed = unsettled === null ? null : attributedSpecId(state, unsettled, intervals)
  const refusedRetry = unsettled !== null && hasRefusalAfter(state, unsettled)

  const planIds = new Set<string>()
  const items: WorkItem[] = []

  for (const item of plan?.items ?? []) {
    planIds.add(item.id)
    items.push(planRow(item, gated, state))
  }

  const specRow = (id: string, title: string): WorkItem => {
    const current = intervals.filter(interval => interval.id === id).at(-1) ?? null
    const isNewest = newestInterval?.id === id
    const head = current?.heads.at(-1) ?? null

    // 1. done — completion evidence for this row's dispatch interval.
    if (current?.done === true) return specItem(state, id, title, 'done', null, head)
    // 2. dispatching — an unsettled dispatch attributed to this row. The paste is not the handover:
    //    no holder is named and the row is not in work.
    if (pendingId === id || attributed === id) {
      const note = attributed === id && refusedRetry ? DISPATCH_REFUSED_RETRY : DISPATCH_IN_FLIGHT
      return specItem(state, id, title, 'dispatching', note, head)
    }
    // 3. reviewing — the flow is reviewing and this row is the subject. Notes are not part of the
    //    test: a review with no answer yet is still a review (§2.6.3).
    if (owning === 'reviewing' && reviewSubject(claim, current, isNewest)) {
      const answered = head !== null && notes.answer(head) !== null
      return specItem(state, id, title, 'reviewing', answered ? null : AWAITING_ANSWER, head)
    }
    // 4. in_work — the flow is idle or fixing and this row is the settled current handover. A claim
    //    that survives into `reviewing` cannot produce `in_work`, because phase 3 matched first.
    if ((owning === 'idle' || owning === 'fixing') && settledHandover(state, claim, current, isNewest)) {
      return specItem(state, id, title, 'in_work', null, head)
    }
    // 5. handed_over — dispatched at some point, none of the above.
    if (current !== null || state.dispatched_specs.includes(id)) {
      return specItem(state, id, title, 'handed_over', null, head)
    }
    // 6. queued — still in the queue, never dispatched.
    return specItem(state, id, title, 'queued', null, null)
  }

  for (const spec of state.specs) {
    if (planIds.has(spec.id)) continue
    items.push(specRow(spec.id, spec.title))
  }
  // A brief that was dispatched and then dropped from the queue still has a history worth showing:
  // its row would otherwise vanish from the panel the moment it left `state.specs`.
  for (const id of state.dispatched_specs) {
    if (planIds.has(id) || state.specs.some(spec => spec.id === id)) continue
    items.push(specRow(id, id))
  }

  // §2.4: two disagreeing sources mean no active row. Only *live* sources compete: the journal's
  // last dispatch is history and never contradicts a binding the engine still trusts (§2.6.1), and
  // a row that already resolved to `done` is not a candidate for current work at all.
  const candidates = new Set<string>()
  for (const id of [pendingId, claim.spec_id, newestInterval?.id ?? null]) {
    if (!id || closedByEvidence(id, intervals)) continue
    const row = items.find(item => item.id === id)
    if (row && (row.status === 'done' || row.status === 'skipped')) continue
    candidates.add(id)
  }
  const ambiguous = candidates.size > 1
  if (ambiguous) {
    for (const item of items) {
      if (!candidates.has(item.id)) continue
      item.status = 'handed_over'
      item.holder = null
      item.note = AMBIGUOUS
    }
  }

  // §2.0: the gate removes the owner everywhere and names the state on the rows that would still be
  // active. The status stays — an operator reading the panel sees what the work was doing.
  if (gated) {
    for (const item of items) {
      item.holder = null
      if (isActive(item.status) && item.note !== AMBIGUOUS) {
        item.note = `flow ${state.state}: ownership unknown`
      }
    }
  }

  const current = gated || ambiguous ? null : pickCurrent(items, owning)

  return {
    total: items.length,
    items,
    current,
    // §2.3: an unsettled dispatch that no row could be charged with is reported at the view level.
    // The absence of a reliable binding is not the same fact as an idle flow, and inventing a status
    // for whichever row looks convenient is the failure the design forbids.
    dispatch_unknown: flowDispatchNote(state) !== null && !items.some(item => item.status === 'dispatching'),
  }
}

function specItem(
  state: FlowState,
  id: string,
  title: string,
  status: WorkItemStatus,
  note: string | null,
  head: string | null,
): WorkItem {
  return {
    id,
    // The title is repository- or operator-authored text and this shape travels in a payload (a
    // transcript), so the redactor runs on it the way it runs on the queue summary.
    title: redactSecrets(title),
    origin: 'spec',
    status,
    plan_status: null,
    holder: holderFor(status, state),
    head,
    note,
  }
}

// A plan row: `plan.json` said it and the gate does not rewrite it (§2.5). The effective status
// equals the stored one; a gated row keeps it and names the state in the note.
function planRow(item: PlanItem, gated: boolean, state: FlowState): WorkItem {
  const status = item.status as WorkItemStatus
  return {
    id: item.id,
    title: redactSecrets(item.title),
    origin: 'plan',
    status,
    plan_status: status,
    holder: gated ? null : holderFor(status, state),
    head: item.head,
    note: gated && isActive(status) ? `flow ${state.state}: ownership unknown` : null,
  }
}

function holderFor(status: WorkItemStatus, state: FlowState | null): WorkItemHolder | null {
  if (state === null) return null
  // §3.1: the holder comes from the flow's own record of which agent plays which part, and only for
  // the two statuses that name an agent.
  if (status === 'in_work') return { role: 'dev', agent_id: state.roles.dev }
  if (status === 'reviewing') return { role: 'reviewer', agent_id: state.roles.review }
  return null
}

function isActive(status: WorkItemStatus): boolean {
  return status === 'dispatching' || status === 'in_work' || status === 'reviewing'
}

// The state whose phases apply: `paused` answers for the state a resume returns to, and `paused_from`
// is the engine's own record of it.
function owningState(state: FlowState): FlowStatus {
  if (state.state === 'paused' && state.paused_from && OWNING_STATES.has(state.paused_from)) {
    return state.paused_from
  }
  return state.state
}

// §2.4: dispatching first (an in-flight handover is the newest intent), then the row the flow's own
// state is about, then whatever is still in work. Never a `queued` or `done` row: after the active
// row closes, `current` is null until a confirmed candidate appears.
function pickCurrent(items: readonly WorkItem[], owning: FlowStatus): WorkItem | null {
  const last = (status: WorkItemStatus): WorkItem | null => items.filter(item => item.status === status).at(-1) ?? null
  const dispatching = last('dispatching')
  if (dispatching) return dispatching
  if (owning === 'reviewing') return last('reviewing') ?? last('in_work')
  return last('in_work') ?? last('reviewing')
}

// --- the journal ------------------------------------------------------------------------------

// Walk the journal once for the `dispatch_spec` entries; each one opens an interval (§2.2).
function dispatchIntervals(state: FlowState, notes: WorkNotesIndex, now: number): DispatchInterval[] {
  const log = state.log
  const starts: number[] = []
  for (let index = 0; index < log.length; index += 1) {
    if (log[index]!.event === 'dispatch_spec') starts.push(index)
  }
  return starts.map((start, position) => {
    const limit = position + 1 < starts.length ? starts[position + 1]! : log.length
    const interval: DispatchInterval = {
      id: detailSpecId(log[start]!.detail),
      end: limit,
      heads: [],
      done: false,
    }
    for (let index = start + 1; index < limit; index += 1) {
      const entry = log[index]!
      if (entry.event === 'flow_done') {
        interval.end = index
        break
      }
      if (!ROUND_EVENTS.has(entry.event) && !UNSETTLED_EVENTS.has(entry.event)) continue
      // Evidence from the future is not evidence: the caller's clock bounds what has happened.
      if (stamp(entry.at) > now) continue
      const head = detailHead(entry.detail)
      if (head) interval.heads.push(head)
    }
    // The newest round of the chain decides, through the existing notes reader: a file that is
    // unusable is not an answer, and a `CHANGES_REQUESTED` in the middle of a chain is normal
    // progress rather than ambiguity.
    const head = interval.heads.at(-1)
    interval.done = head !== undefined
      && (notes.answer(head) === 'ACCEPT' || consumedAccept(state.log[interval.end], head))
    return interval
  })
}

// The answer file can be gone while the fact that it was accepted is not: notes pruning keeps one
// round of a closed flow, and a live flow's older heads are pruned too. The journal still records
// the engine *consuming* an answer in the entry that ended the interval (`notes_ref`, written by
// `withNotes`). Only an ACCEPT moves the flow on — a `CHANGES_REQUESTED` dispatches a fix, and the
// budget paths escalate or hold — so a `dispatch_spec` / `flow_done` entry that says it consumed
// `notes/<head>-r<N>.md` is the engine's own record that this round was accepted. Without that
// entry (a rotated journal, a hold that dispatched nothing) there is no evidence, and the row stays
// `handed_over` (§2.6.5: the view never invents a completion).
function consumedAccept(entry: FlowLogEntry | undefined, head: string): boolean {
  if (!entry) return false
  if (entry.event !== 'dispatch_spec' && entry.event !== 'flow_done') return false
  const ref = entry.notes_ref
  if (!ref) return false
  return ref.toLowerCase().startsWith(`notes/${head.toLowerCase()}-r`)
}

function stamp(iso: string): number {
  const parsed = Date.parse(iso)
  return Number.isFinite(parsed) ? parsed : 0
}

// The id a dispatch entry names: the live shape is `spec_dispatched <ID>` (`plan_item_dispatched
// <ID>` for a plan item). `logDetail` joins reason, head and spec id, so the id is the token after
// the reason — never a commit id, which is what tells this apart from a review entry.
function detailSpecId(detail: string): string | null {
  const [reason, ...rest] = detail.trim().split(/\s+/)
  if (reason !== 'spec_dispatched' && reason !== 'plan_item_dispatched') return null
  return rest.find(token => token.length > 0 && !isCommitId(token)) ?? null
}

// The head a review/fix/unconfirmed entry names. `dispatch_unconfirmed` prefixes the reason
// (`unconfirmed review_requested <head>`), so the head is the first commit-shaped token after the
// first one.
function detailHead(detail: string): string | null {
  const [, ...rest] = detail.trim().split(/\s+/)
  return rest.find(token => isCommitId(token)) ?? null
}

// §2.3: the newest unsettled attempt, found the way `flowDispatchNote` finds it — a settled decision
// closes the dispatch, while `dispatch_claimed` and `dispatch_refused` say nothing about it.
function unsettledIndex(state: FlowState): number | null {
  for (let index = state.log.length - 1; index >= 0; index -= 1) {
    const entry = state.log[index]!
    if (UNSETTLED_EVENTS.has(entry.event)) return index
    if (entry.event === 'dispatch_claimed' || entry.event === 'dispatch_refused') continue
    if (SETTLED_DISPATCH_EVENTS.test(entry.event)) return null
  }
  return null
}

// A refusal *after* the unsettled attempt leaves the row dispatching and keeps the warning:
// `flowDispatchNote` deliberately skips `dispatch_refused`, so the note must not be dropped here
// either (§2.3, the third row of the refusal table). The first handover is the other case and needs
// no special handling: a dispatch that never reached the pane is not in `dispatched_specs`, so the
// row falls through to `queued` with no note.
function hasRefusalAfter(state: FlowState, unsettled: number): boolean {
  for (let index = unsettled + 1; index < state.log.length; index += 1) {
    const entry = state.log[index]!
    if (entry.event === 'dispatch_refused') return true
    if (SETTLED_DISPATCH_EVENTS.test(entry.event)) return false
  }
  return false
}

// §2.3 B: which row the unsettled attempt belongs to. The nearest preceding `dispatch_claimed` /
// `dispatch_spec` names it — as a spec id directly, or as the head of a review/fix request, which is
// resolved to the row whose interval holds that head. Nothing recoverable means nothing invented.
function attributedSpecId(
  state: FlowState,
  unsettled: number,
  intervals: readonly DispatchInterval[],
): string | null {
  for (let index = unsettled - 1; index >= 0; index -= 1) {
    const entry = state.log[index]!
    if (entry.event !== 'dispatch_claimed' && entry.event !== 'dispatch_spec') continue
    const id = detailSpecId(entry.detail)
    if (id) return id
    const head = detailHead(entry.detail)
    return head ? specIdForHead(state, head, intervals) : null
  }
  return null
}

// The row whose interval contains a head: a journaled round names it directly, and a head that was
// only claimed (an unconfirmed review request) belongs to the newest open interval.
function specIdForHead(
  state: FlowState,
  head: string,
  intervals: readonly DispatchInterval[],
): string | null {
  for (const interval of intervals) {
    if (interval.id && interval.heads.includes(head)) return interval.id
  }
  const newest = intervals.at(-1)
  if (newest?.id && state.claim.head === head) return newest.id
  return null
}

function reviewSubject(
  claim: FlowState['claim'],
  interval: DispatchInterval | null,
  isNewest: boolean,
): boolean {
  if (interval === null) return false
  if (claim.spec_id !== null && claim.spec_id === interval.id) return true
  if (!claim.head) return false
  if (interval.heads.includes(claim.head)) return true
  // An unconfirmed request never journalled its head; the flow's own state still names the commit
  // under review, and that round belongs to the newest dispatch.
  return isNewest
}

function settledHandover(
  state: FlowState,
  claim: FlowState['claim'],
  interval: DispatchInterval | null,
  isNewest: boolean,
): boolean {
  if (interval === null || interval.id === null) return false
  // A live binding the engine still trusts wins over lost history (§2.6.1).
  if (claim.spec_id !== null && claim.spec_id === interval.id) return true
  return isNewest && state.dispatched_specs.includes(interval.id)
}

function closedByEvidence(id: string, intervals: readonly DispatchInterval[]): boolean {
  return intervals.filter(interval => interval.id === id).at(-1)?.done === true
}

// The newest round's verdict for a commit, read through the existing notes helpers: `readNewestNotes`
// owns "which round of this head is the answer" and `validateNotesText` owns what counts as one, so
// this projection never parses a notes file itself (§2.2 of the contract, `flow-notes.ts`).
export function workNotesFor(runId: string, root?: string): WorkNotesIndex {
  const cache = new Map<string, FlowVerdict | null>()
  return {
    answer: (head: string): FlowVerdict | null => {
      if (!head) return null
      if (cache.has(head)) return cache.get(head) ?? null
      let verdict: FlowVerdict | null = null
      try {
        const read = readNewestNotes(runId, head, root === undefined ? {} : { root })
        if (read.ok && typeof read.text === 'string') verdict = validateNotesText(read.text).verdict
      } catch {
        // A head that is not a commit id, a symlinked file, a directory that cannot be read: no
        // answer is a fact about the evidence, not a reason to break the panel.
        verdict = null
      }
      cache.set(head, verdict)
      return verdict
    },
  }
}

// The projection for one run, read from disk: the flow state, its plan when one exists, and an index
// of the notes directory. Read-only by construction — `readFlow`, `readPlan` and `readNewestNotes`
// all open files for reading, and nothing in this module holds a path it could write.
export function readWorkView(
  runId: string,
  options: { at?: number, root?: string } = {},
): WorkView | null {
  try {
    const state = readFlow(runId, options.root === undefined ? {} : { root: options.root })
    const plan = planExists(runId, options.root === undefined ? {} : { root: options.root })
      ? readPlan(runId, options.root === undefined ? {} : { root: options.root })
      : null
    return workItems(state, {
      plan,
      notes: workNotesFor(runId, options.root),
      at: options.at,
    })
  } catch {
    // A flow that cannot be read has no work view, the way it has no badge: the dashboard skips a
    // damaged file instead of breaking the board.
    return null
  }
}
