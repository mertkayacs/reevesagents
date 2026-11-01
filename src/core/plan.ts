// The plan as an object: the project's own `docs/implementation-plan.md`, mirrored in state.
//
// Design: `docs/plan-model-design.md`. Two rules from it drive everything here.
//
// - **The document is the list of work; the mirror is the record of what happened.** Membership (which
//   items exist, in what order) comes from the document. The status of an item the engine moved
//   (`in_work` … `done`) comes from the mirror, and a document that disagrees produces a *conflict*,
//   never a silent rewrite. That is why `importPlan` can add, retire and retitle, but never demote a
//   `done`.
// - **`done` is evidence, not a checkbox.** Nothing in this module sets `done` from `- [x]`: the engine
//   sets it on a substantiated ACCEPT of the closing commit, and a human sets it with an explicit
//   `plan set --status done --yes --note`. A ticked box is logged as `ticked_by_hand` and ignored.
//
// The parser accepts exactly the two shapes the live plans use, because guessing a third is how a plan
// silently becomes empty:
//
//     - [x] **P1.7.1** — text of the item          (id-bearing)
//     - [x] Text of the item.                      (id-less; id is derived, see `deriveId`)

import { createHash } from 'node:crypto'
import { chmodSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { flowsDir, flowPath, readFlow, saveFlow } from './flow-store.js'
import { withRunsLock } from './runs.js'
import { renderDispatchPrompt, SPEC_ID_PATTERN, validateSpec } from './spec.js'
import type { BlockSpec } from './spec.js'
import type { FlowState } from './flow.js'
import { displayPath } from '../utils/paths.js'

export const PLAN_SCHEMA_VERSION = 1

// Caps from the design's §3.1/§9. A plan of a thousand items is already larger than anything real; over
// the cap the import refuses and changes nothing, so a runaway document cannot turn the state into a
// file nobody can open.
export const PLAN_LIMITS = {
  items: 1000,
  planBytes: 512 * 1024,
  documentBytes: 1024 * 1024,
  conflicts: 50,
  title: 500,
} as const

export type PlanStatus =
  | 'pending'
  | 'needs_brief'
  | 'queued'
  | 'in_work'
  | 'reviewing'
  | 'done'
  | 'blocked_owner'
  | 'skipped'

export const PLAN_STATUSES: readonly PlanStatus[] = [
  'pending', 'needs_brief', 'queued', 'in_work', 'reviewing', 'done', 'blocked_owner', 'skipped',
]

// Statuses that cannot move again. `done` and `skipped` both stop `plan next`; only `done` claims work
// was delivered, which is why the progress line counts them apart.
const TERMINAL_STATUSES: readonly PlanStatus[] = ['done', 'skipped']

// The one gate every status change goes through, the way `FLOW_TRANSITIONS` gates the flow lifecycle. It
// exists because the eight statuses are not a free-for-all: an item in flight cannot be skipped out from
// under its round, and a terminal item cannot be reopened — `done` is a claim about a commit that was
// reviewed, and a checkbox a human flips later must not become a claim the engine never made.
//
// Read it as "from -> what it may become":
//   pending      -> needs_brief, queued, skipped, blocked_owner, done   (the import/triage moves; a manual
//                                                                        done covers work finished before the
//                                                                        flow existed)
//   needs_brief  -> pending, queued, skipped, blocked_owner, done       (a brief arrived, or a human triaged)
//   queued       -> pending, needs_brief, in_work, done, skipped, blocked_owner
//   in_work      -> queued, reviewing, blocked_owner                    (a round is running: no closing)
//   reviewing    -> in_work, queued, done, blocked_owner                (done only through the ACCEPT path)
//   blocked_owner-> pending, needs_brief, queued, skipped               (the human unblocked it)
//   done         -> (nothing: terminal)
//   skipped      -> (nothing: terminal)
export const PLAN_TRANSITIONS: Record<PlanStatus, readonly PlanStatus[]> = {
  pending: ['needs_brief', 'queued', 'skipped', 'blocked_owner', 'done'],
  needs_brief: ['pending', 'queued', 'skipped', 'blocked_owner', 'done'],
  queued: ['pending', 'needs_brief', 'in_work', 'done', 'skipped', 'blocked_owner'],
  in_work: ['queued', 'reviewing', 'blocked_owner'],
  reviewing: ['in_work', 'queued', 'done', 'blocked_owner'],
  blocked_owner: ['pending', 'needs_brief', 'queued', 'skipped', 'done'],
  done: [],
  skipped: [],
}

export function canTransition(from: PlanStatus, to: PlanStatus): boolean {
  return from === to || PLAN_TRANSITIONS[from].includes(to)
}

// What a **human command** may do, as opposed to what the engine may do. The difference is not cosmetic:
// `queued -> in_work` is the engine's own transition when it claims a dispatch, and a human marking it by
// hand would make an item look active while nothing was ever sent — the plan would claim work in flight
// that does not exist. `in_work -> queued` is worse in the other direction: it frees an item whose round is
// still running, and the next `plan next` would dispatch a second brief on top of the first.
//
// So a human may triage (pending/needs_brief/queued/blocked_owner), close (done/skipped) and unblock. The two
// statuses that describe a round in flight are the engine's alone; to intervene there, the operator pauses or
// stops the flow, which is a decision about the pipeline rather than about one row of the plan.
export const HUMAN_TRANSITIONS: Record<PlanStatus, readonly PlanStatus[]> = {
  pending: ['needs_brief', 'queued', 'skipped', 'blocked_owner', 'done'],
  needs_brief: ['pending', 'queued', 'skipped', 'blocked_owner', 'done'],
  queued: ['pending', 'needs_brief', 'skipped', 'blocked_owner', 'done'],
  in_work: [],
  reviewing: [],
  blocked_owner: ['pending', 'needs_brief', 'queued', 'skipped', 'done'],
  done: [],
  skipped: [],
}

export function canSetStatus(from: PlanStatus, to: PlanStatus): boolean {
  return from === to || HUMAN_TRANSITIONS[from].includes(to)
}

// Why a human transition was refused, in the terms the operator can act on.
function humanRefusal(item: PlanItem, to: PlanStatus): PlanError {
  if (BUSY_STATUSES.includes(item.status)) {
    return new PlanError(
      `cannot move ${item.id} from ${item.status} to ${to}: the engine owns ${item.status} while a round is in flight — pause or stop the flow to intervene, or wait for the verdict`,
      'refused',
    )
  }
  const allowed = HUMAN_TRANSITIONS[item.status]
  const why = allowed.length === 0
    ? `${item.status} is terminal: an item closed on evidence does not reopen, and a manual reopen would be a claim the engine never made`
    : `${item.status} may only become ${allowed.join(', ')}`
  return new PlanError(`cannot move ${item.id} from ${item.status} to ${to}: ${why}`, 'refused')
}

// The message a refused transition deserves: what was asked, and what was allowed instead.
function transitionRefusal(item: PlanItem, to: PlanStatus): PlanError {
  const allowed = PLAN_TRANSITIONS[item.status]
  const why = allowed.length === 0
    ? `${item.status} is terminal: an item closed on evidence does not reopen, and a manual reopen would be a claim the engine never made`
    : `${item.status} may only become ${allowed.join(', ')}${BUSY_STATUSES.includes(item.status) ? ' — a round is in flight, so the item cannot be closed from here' : ''}`
  return new PlanError(`cannot move ${item.id} from ${item.status} to ${to}: ${why}`, 'refused')
}

// Statuses where a round is in flight: the brief the round rendered must not be swapped underneath it.
const BUSY_STATUSES: readonly PlanStatus[] = ['in_work', 'reviewing']

export type PlanConflictKind = 'unticked' | 'ticked_by_hand' | 'duplicate_id' | 'spec_changed'

export interface PlanConflict {
  at: string
  item_id: string
  kind: PlanConflictKind
  // One line. Never a slice of the document beyond the item id and a line number.
  detail: string
}

export interface PlanItem {
  id: string
  title: string
  status: PlanStatus
  // The validated record as it was at attach time (§4.2 of the design): a dispatch stays reproducible
  // from state alone, and an edited brief is a logged refusal rather than a silent change.
  spec: BlockSpec | null
  spec_path: string | null
  spec_hash: string | null
  head: string | null
  rounds: number
  notes_ref: string | null
  updated_at: string
  // Derived on write: true when the item cannot move without a human (`needs_brief`, `blocked_owner`).
  owner_action: boolean
  missing_since: string | null
  line: number | null
  // Why an item waits for a human, when the reason is not the status itself: `rounds_exhausted` today.
  block_reason?: string | null
}

export interface Plan {
  schema_version: number
  run_id: string
  source_path: string
  source_hash: string
  imported_at: string
  items: PlanItem[]
  conflicts: PlanConflict[]
}

export type PlanErrorCode = 'not_found' | 'invalid' | 'refused' | 'conflict' | 'ambiguous'

export class PlanError extends Error {
  readonly code: PlanErrorCode

  constructor(message: string, code: PlanErrorCode = 'invalid') {
    super(message)
    this.name = 'PlanError'
    this.code = code
  }
}

// ---------------------------------------------------------------------------------------------------
// Document parsing
// ---------------------------------------------------------------------------------------------------

const ITEM_LINE = /^- \[( |x|X)\]\s+(.*)$/
const ID_ITEM = /^\*\*([^*]+)\*\*\s*[—–-]\s*(.*)$/
const HEADING_LINE = /^#{1,6}\s/
const BLOCKQUOTE_LINE = /^>/
const CONTINUATION_LINE = /^(\s+\S|\*\*)/
const EXPLICIT_ID = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/

export interface ParsedItem {
  id: string
  title: string
  checked: boolean
  line: number
}

export interface PlanDocument {
  // `ids` when every item carries an explicit id, `plain` when ids had to be derived. Mixed documents
  // are `mixed`, and the design treats them as ids where present and derived elsewhere.
  format: 'ids' | 'plain' | 'mixed'
  items: ParsedItem[]
  source_hash: string
}

// Normalised before hashing and before parsing, so a CRLF checkout, a trailing space or a final-newline
// edit is a no-op — the two real plans are checked out on different machines.
export function normalizeDocument(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n+$/, '')
}

export function hashDocument(text: string): string {
  return createHash('sha256').update(normalizeDocument(text), 'utf8').digest('hex')
}

// Stable for the id-less shape: survives moving a line between stages and re-ticking, breaks on rewording
// (which produces a new item and leaves the old one `missing`, §3.2 of the design).
export function deriveId(title: string): string {
  const normalised = title.replace(/\s+/g, ' ').trim().toLowerCase()
  return `auto:${createHash('sha256').update(normalised, 'utf8').digest('hex').slice(0, 8)}`
}

export function parsePlanDocument(text: string): PlanDocument {
  const normalised = normalizeDocument(text)
  if (Buffer.byteLength(normalised, 'utf8') > PLAN_LIMITS.documentBytes) {
    throw new PlanError(
      `the plan document is larger than ${PLAN_LIMITS.documentBytes} bytes and was not imported`,
      'refused',
    )
  }
  const lines = normalised.split('\n')
  const items: ParsedItem[] = []
  let explicit = 0
  let current: ParsedItem | null = null
  let sample: string | null = null

  const close = (): void => {
    if (!current) return
    current.title = current.title.replace(/\s+/g, ' ').trim().slice(0, PLAN_LIMITS.title)
    if (current.title) items.push(current)
    current = null
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!
    const match = ITEM_LINE.exec(line)
    if (match) {
      close()
      const checked = match[1] !== ' '
      const rest = match[2]!.trim()
      const withId = ID_ITEM.exec(rest)
      if (withId) {
        const id = withId[1]!.trim()
        if (!EXPLICIT_ID.test(id) || !SPEC_ID_PATTERN.test(id)) {
          throw new PlanError(
            `line ${index + 1}: "${id}" is not usable as an item id (it must satisfy ${SPEC_ID_PATTERN.source})`,
            'refused',
          )
        }
        explicit += 1
        current = { id, title: withId[2] ?? '', checked, line: index + 1 }
      } else {
        current = { id: '', title: rest, checked, line: index + 1 }
        sample ??= `line ${index + 1}: ${line.trim()}`
      }
      continue
    }
    if (current && line.trim() !== '' && !HEADING_LINE.test(line) && !BLOCKQUOTE_LINE.test(line)
      && CONTINUATION_LINE.test(line)) {
      // A folded item (the id-less plan has two). Only an indented or bold continuation belongs to the
      // item; anything else is a new paragraph and closes it.
      current.title = `${current.title} ${line.trim()}`.trim()
      continue
    }
    close()
  }
  close()

  if (items.length === 0) {
    throw new PlanError(
      sample
        ? `no plan items found; expected "- [ ] **ID** — text" or "- [ ] text" (first candidate: ${sample})`
        : 'no plan items found; expected lines like "- [ ] **ID** — text" or "- [ ] text"',
      'refused',
    )
  }
  if (items.length > PLAN_LIMITS.items) {
    throw new PlanError(`the plan has ${items.length} items, more than the ${PLAN_LIMITS.items} allowed`, 'refused')
  }

  const seen = new Map<string, number>()
  for (const item of items) {
    if (!item.id) item.id = deriveId(item.title)
    const previous = seen.get(item.id)
    if (previous !== undefined) {
      throw new PlanError(
        `duplicate item id "${item.id}" on lines ${previous} and ${item.line}; ids must be unique`,
        'refused',
      )
    }
    seen.set(item.id, item.line)
  }

  const format = explicit === items.length ? 'ids' : explicit === 0 ? 'plain' : 'mixed'
  return { format, items, source_hash: hashDocument(normalised) }
}

// ---------------------------------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------------------------------

export interface ImportOptions {
  run_id: string
  source_path: string
  text: string
  now: number
  at?: string
}

export interface ImportResult {
  plan: Plan
  added: string[]
  missing: string[]
  conflicts: PlanConflict[]
  unchanged: boolean
  source_hash: string
}

function isoAt(options: { at?: string, now: number }): string {
  return options.at ?? new Date(options.now).toISOString()
}

export function createPlan(options: ImportOptions): ImportResult {
  return importInto(null, options)
}

// Add, retire and retitle — never demote. The three conflict kinds are the whole of "the document and
// the record disagree", and each of them is logged once per item and kind.
export function importInto(plan: Plan | null, options: ImportOptions): ImportResult {
  const document = parsePlanDocument(options.text)
  const at = isoAt(options)

  if (plan && plan.source_hash === document.source_hash) {
    return { plan, added: [], missing: [], conflicts: [], unchanged: true, source_hash: document.source_hash }
  }

  // A first import has no record to disagree with: a ticked line simply means "done before this flow
  // existed", and turning every one of them into a conflict would bury the real ones (the id-bearing plan
  // opens with 83 ticked items). Disagreements are only meaningful once a mirror exists.
  const firstImport = plan === null
  const existing = new Map((plan?.items ?? []).map(item => [item.id, item]))
  const byId = new Map(document.items.map(item => [item.id, item]))
  const added: string[] = []
  const missing: string[] = []
  const conflicts: PlanConflict[] = [...(plan?.conflicts ?? [])]
  // What *this* import recorded. Collected as the list is written, not by slicing the merged list: once the
  // bounded list is full the slice would drop the very conflict that was just found, and the import would
  // report "no conflicts" while the state holds 50 stale ones.
  const recorded: PlanConflict[] = []

  const items: PlanItem[] = []
  for (const parsed of document.items) {
    const previous = existing.get(parsed.id)
    if (!previous) {
      added.push(parsed.id)
      items.push({
        id: parsed.id,
        title: parsed.title,
        status: 'pending',
        spec: null,
        spec_path: null,
        spec_hash: null,
        head: null,
        rounds: 0,
        notes_ref: null,
        updated_at: at,
        owner_action: false,
        missing_since: null,
        line: parsed.line,
        block_reason: null,
      })
      continue
    }
    items.push({
      ...previous,
      // Text and position follow the document; status, brief and history do not.
      title: parsed.title,
      line: parsed.line,
      missing_since: null,
      updated_at: previous.title === parsed.title && previous.line === parsed.line ? previous.updated_at : at,
    })
    // Only a real disagreement is a conflict: an unchecked line under an open item, or a ticked line
    // under one the mirror has not closed. Anything else is the normal case and must stay quiet.
    if (previous.status === 'done' && !parsed.checked) {
      recordConflict(conflicts, recorded, {
        at,
        item_id: parsed.id,
        kind: 'unticked',
        detail: `line ${parsed.line}: the document unticks ${parsed.id}, but the mirror closed it on an ACCEPT`,
      })
    } else if (!firstImport && parsed.checked && previous.status !== 'done') {
      recordConflict(conflicts, recorded, {
        at,
        item_id: parsed.id,
        kind: 'ticked_by_hand',
        detail: `line ${parsed.line}: the document ticks ${parsed.id}, but only an ACCEPT or an explicit "plan set" closes an item`,
      })
    }
  }

  for (const previous of plan?.items ?? []) {
    if (byId.has(previous.id)) continue
    missing.push(previous.id)
    items.push({ ...previous, missing_since: previous.missing_since ?? at, line: null })
  }

  const next: Plan = {
    schema_version: PLAN_SCHEMA_VERSION,
    run_id: options.run_id,
    source_path: options.source_path,
    source_hash: document.source_hash,
    imported_at: at,
    items,
    conflicts: capConflicts(conflicts),
  }
  return { plan: next, added, missing, conflicts: recorded, unchanged: false, source_hash: document.source_hash }
}

// The newest conflicts are the ones a human still has to look at; the oldest are the ones they had the time
// to read. Capping therefore drops from the front — and `recorded` keeps what this run actually wrote, so the
// caller reports the truth even when the list is already full.
function capConflicts(conflicts: PlanConflict[]): PlanConflict[] {
  return conflicts.length > PLAN_LIMITS.conflicts ? conflicts.slice(-PLAN_LIMITS.conflicts) : conflicts
}

// A conflict is recorded once per (item, kind): a re-import of the same disagreement must not fill the
// bounded list with copies of itself. Returns whether it was new.
function recordConflict(conflicts: PlanConflict[], recorded: PlanConflict[], candidate: PlanConflict): boolean {
  const already = conflicts.some(entry => entry.item_id === candidate.item_id && entry.kind === candidate.kind)
  if (already) return false
  conflicts.push(candidate)
  recorded.push(candidate)
  return true
}

// Ticking and unticking are two different disagreements: an item the document ticks without an ACCEPT is
// not the same problem as an item the mirror closed and the document reopened, and a flow with both needs
// to see both. `importInto` computes the kind per item, so the "once per kind" rule keeps them apart.
export function conflictsFor(plan: Plan, itemId: string): PlanConflict[] {
  return plan.conflicts.filter(entry => entry.item_id === itemId)
}

// ---------------------------------------------------------------------------------------------------
// Status, progress, summary
// ---------------------------------------------------------------------------------------------------

export function isTerminal(status: PlanStatus): boolean {
  return TERMINAL_STATUSES.includes(status)
}

export function deriveOwnerAction(status: PlanStatus): boolean {
  return status === 'needs_brief' || status === 'blocked_owner'
}

export interface PlanProgress {
  done: number
  total: number
  skipped: number
  by_status: Record<PlanStatus, number>
}

export function planProgress(plan: Plan): PlanProgress {
  const byStatus = Object.fromEntries(PLAN_STATUSES.map(status => [status, 0])) as Record<PlanStatus, number>
  for (const item of plan.items) byStatus[item.status] += 1
  return {
    done: byStatus.done,
    total: plan.items.length,
    skipped: byStatus.skipped,
    by_status: byStatus,
  }
}

// The flow state keeps this, never the items (§3.1): a surface can draw `plan 12/23` from the state it
// already reads, and the file stays the record.
export interface PlanSummary {
  imported_at: string
  source_hash: string
  done: number
  total: number
  // Items that cannot move without a human.
  waiting: number
}

export function planSummary(plan: Plan): PlanSummary {
  const progress = planProgress(plan)
  return {
    imported_at: plan.imported_at,
    source_hash: plan.source_hash,
    done: progress.done,
    total: progress.total,
    waiting: plan.items.filter(item => item.owner_action).length,
  }
}

// The plan is complete when every item is `done` or `skipped`. `missing` items are incomplete by
// definition: an import that lost half a document must not let a flow declare itself finished.
export function planComplete(plan: Plan): boolean {
  return plan.items.every(item => isTerminal(item.status))
}

export interface SetStatusInput {
  id: string
  status: PlanStatus
  note?: string
  yes?: boolean
  now: number
  at?: string
}

export function setItemStatus(plan: Plan, input: SetStatusInput): { plan: Plan, previous: PlanStatus } {
  const item = plan.items.find(entry => entry.id === input.id)
  if (!item) throw new PlanError(`no plan item ${input.id}`, 'not_found')
  if (!PLAN_STATUSES.includes(input.status)) {
    throw new PlanError(`unknown status "${input.status}"; expected one of: ${PLAN_STATUSES.join(', ')}`, 'invalid')
  }
  if (input.status === item.status) return { plan, previous: item.status }
  // The human subset, not the engine's table: see `HUMAN_TRANSITIONS` for why `queued -> in_work` and
  // `in_work -> queued` are not a human's to make.
  if (!canSetStatus(item.status, input.status)) throw humanRefusal(item, input.status)
  const at = isoAt(input)

  if ((input.status === 'done' || input.status === 'skipped') && input.yes !== true) {
    throw new PlanError(`closing ${item.id} as ${input.status} needs --yes`, 'refused')
  }
  if (input.status === 'done' && !item.head) {
    if (input.yes !== true || !input.note) {
      throw new PlanError(
        `${item.id} has no accepted commit; a manual done needs --yes and --note <why>`,
        'refused',
      )
    }
    const conflicts = [...plan.conflicts, {
      at,
      item_id: item.id,
      kind: 'ticked_by_hand' as const,
      detail: `set done by hand without an accepted commit: ${input.note}`,
    }].slice(-PLAN_LIMITS.conflicts)
    return {
      previous: item.status,
      plan: {
        ...plan,
        conflicts,
        items: plan.items.map(entry => (entry.id === item.id
          ? { ...entry, status: input.status, owner_action: deriveOwnerAction(input.status), updated_at: at }
          : entry)),
      },
    }
  }

  return {
    previous: item.status,
    plan: {
      ...plan,
      items: plan.items.map(entry => (entry.id === item.id
        ? { ...entry, status: input.status, owner_action: deriveOwnerAction(input.status), updated_at: at }
        : entry)),
    },
  }
}

// A status move by the **engine**, gated by the engine table rather than the human one: a dispatch moves an
// item into `in_work`, a review request into `reviewing`, a spent budget into `blocked_owner`. Same guards on
// terminal items, same refusal text — the difference is only which table is consulted.
export function moveItemByEngine(
  plan: Plan,
  input: { id: string, status: PlanStatus, block_reason?: string | null, now: number, at?: string },
): Plan {
  const item = plan.items.find(entry => entry.id === input.id)
  if (!item) throw new PlanError(`no plan item ${input.id}`, 'not_found')
  if (item.status === input.status) return plan
  if (!canTransition(item.status, input.status)) throw transitionRefusal(item, input.status)
  const at = isoAt(input)
  return {
    ...plan,
    items: plan.items.map(entry => (entry.id === item.id
      ? {
        ...entry,
        status: input.status,
        owner_action: deriveOwnerAction(input.status),
        block_reason: input.status === 'blocked_owner' ? (input.block_reason ?? entry.block_reason ?? null) : null,
        updated_at: at,
      }
      : entry)),
  }
}

// A fix round belongs to the item in flight: the counter is what `max_rounds` is measured against.
export function addItemRound(plan: Plan, id: string, now: number, at?: string): Plan {
  const item = plan.items.find(entry => entry.id === id)
  if (!item) return plan
  const iso = isoAt({ now, at })
  return {
    ...plan,
    items: plan.items.map(entry => (entry.id === id ? { ...entry, rounds: entry.rounds + 1, updated_at: iso } : entry)),
  }
}

// A `done` the engine can trust: it needs the commit the round accepted (§4.4). Called by the engine when
// a substantiated ACCEPT consumes a round; a human path goes through `setItemStatus`.
export function closeItemOnAccept(
  plan: Plan,
  input: { id: string, head: string, rounds: number, notes_ref: string | null, now: number, at?: string },
): Plan {
  const item = plan.items.find(entry => entry.id === input.id)
  if (!item) throw new PlanError(`no plan item ${input.id}`, 'not_found')
  // The engine path obeys the same table: a verdict can close an item that is `reviewing` (or `queued`, when
  // the round was already settled), not one that never started.
  if (!canTransition(item.status, 'done')) throw transitionRefusal(item, 'done')
  const at = isoAt(input)
  return {
    ...plan,
    items: plan.items.map(item => (item.id === input.id
      ? {
        ...item,
        status: 'done' as const,
        owner_action: false,
        head: input.head,
        rounds: input.rounds,
        notes_ref: input.notes_ref,
        updated_at: at,
      }
      : item)),
  }
}

// ---------------------------------------------------------------------------------------------------
// Attach
// ---------------------------------------------------------------------------------------------------

export interface AttachInput {
  id: string
  // The brief as written on disk; `format` decides which reader validates it, exactly like `add-spec`.
  text: string
  format: 'json' | 'markdown'
  spec_path: string
  now: number
  at?: string
}

export interface AttachResult {
  plan: Plan
  item: PlanItem
  // The validated record, for the caller that also wants to queue it (`--queue`).
  spec: BlockSpec
}

export function attachSpec(plan: Plan, input: AttachInput): AttachResult {
  const item = plan.items.find(entry => entry.id === input.id)
  if (!item) throw new PlanError(`no plan item ${input.id}`, 'not_found')
  if (BUSY_STATUSES.includes(item.status)) {
    throw new PlanError(
      `${item.id} is ${item.status}: the round in flight renders the brief it started with, so attach waits until it is queued again`,
      'refused',
    )
  }

  const validation = input.format === 'json'
    ? validateSpecFromJson(input.text)
    : validateSpecFromMarkdown(input.text, input.spec_path, item.id)
  if (!validation.spec) {
    throw new PlanError(`the brief for ${input.id} was refused: ${validation.issues.map(issue => `${issue.field}: ${issue.message}`).join('; ')}`, 'refused')
  }
  const spec = validation.spec
  if (spec.id !== item.id) {
    throw new PlanError(
      `spec_id_mismatch: the brief is "${spec.id}" but the item is "${item.id}"; they must be equal, because the queue dedupes on the spec id`,
      'refused',
    )
  }

  const at = isoAt(input)
  const status: PlanStatus = item.status === 'pending' || item.status === 'needs_brief' ? 'queued' : item.status
  const updated: PlanItem = {
    ...item,
    spec,
    spec_path: input.spec_path,
    spec_hash: hashDocument(input.text),
    status,
    owner_action: deriveOwnerAction(status),
    updated_at: at,
  }
  return {
    spec,
    item: updated,
    plan: { ...plan, items: plan.items.map(entry => (entry.id === item.id ? updated : entry)) },
  }
}

// The two readers `add-spec` uses, imported lazily to keep this module's import graph flat: `spec.ts` has
// no dependency on the plan, and the plan must not become one more reason to load it twice.
function validateSpecFromJson(text: string) {
  return validateSpec(parseJsonOrReport(text))
}

function parseJsonOrReport(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    throw new PlanError('the brief is not valid JSON', 'refused')
  }
}

// A markdown brief is prose, not a record: its `id` is derived from the heading, and that slug can never equal
// an item id such as `P1.7.1` (`p1-7-1` != `P1.7.1`). The item id is the identity here — the plan already
// knows which item the brief belongs to, and `attach` was asked for that item — so it is passed in instead of
// being re-derived and then rejected by the mismatch check. A JSON brief still carries its own id, and a
// mismatch there remains an error: a structured record that names another block is a real mistake.
function validateSpecFromMarkdown(text: string, sourcePath: string, itemId: string) {
  return validateSpec(markdownSpec(text, sourcePath, itemId), { allowUnstructured: true })
}

function markdownSpec(text: string, sourcePath: string, itemId: string): Record<string, unknown> {
  const normalised = text.replace(/\r\n/g, '\n').trim()
  const heading = normalised.split('\n').find(line => /^#\s+\S/.test(line.trim()))
  const title = (heading ? heading.replace(/^#\s+/, '') : normalised.split('\n')[0] ?? '').trim()
  return { id: itemId, title, body: normalised, source_path: sourcePath }
}

export function renderPlanItemPrompt(plan: Plan, id: string): string {
  const item = plan.items.find(entry => entry.id === id)
  if (!item) throw new PlanError(`no plan item ${id}`, 'not_found')
  if (!item.spec) throw new PlanError(`${item.id} has no brief; attach one before it can be dispatched`, 'refused')
  return renderDispatchPrompt(item.spec)
}

// What a payload may say about an item. The brief is stored as a snapshot for the *dispatch*, not for the
// transcript: `body`, `goal`, `requirements`, `checks` and `report` are the work itself, and a payload that
// carried them would duplicate the brief in every `flow plan --json` and in every MCP answer. A surface gets
// the shape of the brief (`id`, `title`, `unstructured`) and a path to read the rest if it really needs it.
export interface PlanItemView {
  id: string
  title: string
  status: PlanStatus
  spec: { id: string, title: string, unstructured: boolean } | null
  spec_path: string | null
  spec_hash: string | null
  head: string | null
  rounds: number
  notes_ref: string | null
  owner_action: boolean
  missing_since: string | null
  line: number | null
  block_reason: string | null
  updated_at: string
}

export function planItemView(item: PlanItem): PlanItemView {
  return {
    id: item.id,
    title: item.title,
    status: item.status,
    spec: item.spec
      ? { id: item.spec.id, title: item.spec.title, unstructured: item.spec.unstructured === true }
      : null,
    spec_path: item.spec_path,
    spec_hash: item.spec_hash,
    head: item.head,
    rounds: item.rounds,
    notes_ref: item.notes_ref,
    owner_action: item.owner_action,
    missing_since: item.missing_since,
    line: item.line,
    block_reason: item.block_reason ?? null,
    updated_at: item.updated_at,
  }
}

// ---------------------------------------------------------------------------------------------------
// Store: `flows/<run-id>/plan.json`, beside the notes directory
// ---------------------------------------------------------------------------------------------------

export interface PlanStoreOptions {
  root?: string
}

// The run id is a path component, so it is validated by `flowPath` (which refuses anything that is not a
// flow id) rather than trusted: `../x` from a CLI argument must not write outside the flows directory.
export function planDir(runId: string, options: PlanStoreOptions = {}): string {
  flowPath(runId, options.root)
  return join(flowsDir(options.root), runId)
}

export function planPath(runId: string, options: PlanStoreOptions = {}): string {
  return join(planDir(runId, options), 'plan.json')
}

export function planExists(runId: string, options: PlanStoreOptions = {}): boolean {
  try {
    statSync(planPath(runId, options))
    return true
  } catch {
    return false
  }
}

export function readPlan(runId: string, options: PlanStoreOptions = {}): Plan {
  const path = planPath(runId, options)
  let raw: string
  try {
    raw = readFileSync(path, 'utf-8')
  } catch (err) {
    if ((err as { code?: string }).code === 'ENOENT') throw new PlanError(`no plan for run ${runId}`, 'not_found')
    throw new PlanError(`the plan could not be read: ${displayPath(path)}`, 'invalid')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new PlanError(`the plan at ${displayPath(path)} is not valid JSON`, 'invalid')
  }
  return parsePlan(parsed, path)
}

export function parsePlan(raw: unknown, path = 'plan.json'): Plan {
  const record = raw as Record<string, unknown> | null
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new PlanError(`the plan at ${displayPath(path)} is not an object`, 'invalid')
  }
  if (record.schema_version !== PLAN_SCHEMA_VERSION) {
    throw new PlanError(
      `the plan at ${displayPath(path)} has schema_version ${String(record.schema_version)}; this build reads ${PLAN_SCHEMA_VERSION}`,
      'invalid',
    )
  }
  const items = Array.isArray(record.items) ? record.items : null
  if (!items) throw new PlanError(`the plan at ${displayPath(path)} has no items array`, 'invalid')
  return {
    schema_version: PLAN_SCHEMA_VERSION,
    run_id: String(record.run_id ?? ''),
    source_path: String(record.source_path ?? ''),
    source_hash: String(record.source_hash ?? ''),
    imported_at: String(record.imported_at ?? ''),
    items: items.map(entry => parseItem(entry as Record<string, unknown>)),
    conflicts: Array.isArray(record.conflicts)
      ? (record.conflicts as Record<string, unknown>[]).map(entry => ({
        at: String(entry.at ?? ''),
        item_id: String(entry.item_id ?? ''),
        kind: String(entry.kind ?? 'ticked_by_hand') as PlanConflictKind,
        detail: String(entry.detail ?? ''),
      }))
      : [],
  }
}

function parseItem(record: Record<string, unknown>): PlanItem {
  const status = String(record.status ?? 'pending') as PlanStatus
  return {
    id: String(record.id ?? ''),
    title: String(record.title ?? ''),
    status: PLAN_STATUSES.includes(status) ? status : 'pending',
    spec: (record.spec as BlockSpec | null | undefined) ?? null,
    spec_path: typeof record.spec_path === 'string' ? record.spec_path : null,
    spec_hash: typeof record.spec_hash === 'string' ? record.spec_hash : null,
    head: typeof record.head === 'string' ? record.head : null,
    rounds: typeof record.rounds === 'number' ? record.rounds : 0,
    notes_ref: typeof record.notes_ref === 'string' ? record.notes_ref : null,
    updated_at: String(record.updated_at ?? ''),
    owner_action: record.owner_action === true,
    missing_since: typeof record.missing_since === 'string' ? record.missing_since : null,
    line: typeof record.line === 'number' ? record.line : null,
    block_reason: typeof record.block_reason === 'string' ? record.block_reason : null,
  }
}

// Atomic, 0600 in a 0700 directory, following the flow store: temp + rename, no fallback write. A plan that
// fails to save must leave the previous document, never a torn one.
export function savePlan(plan: Plan, options: PlanStoreOptions = {}): string {
  const path = planPath(plan.run_id, options)
  const text = JSON.stringify({ ...plan, schema_version: PLAN_SCHEMA_VERSION }, null, 2)
  if (Buffer.byteLength(text, 'utf8') > PLAN_LIMITS.planBytes) {
    throw new PlanError(
      `the plan would be ${Buffer.byteLength(text, 'utf8')} bytes, over the ${PLAN_LIMITS.planBytes} limit; nothing was written`,
      'refused',
    )
  }
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const tmpPath = `${path}.tmp`
  try {
    writeFileSync(tmpPath, text, { encoding: 'utf-8', mode: 0o600 })
    chmodSync(tmpPath, 0o600)
    renameSync(tmpPath, path)
  } catch {
    try { unlinkSync(tmpPath) } catch { /* already gone */ }
    throw new PlanError(`the plan was not saved: ${displayPath(path)}`, 'invalid')
  }
  return path
}

// The one-line summary the flow state carries. Callers outside a mutation use `mutatePlan`, which writes both
// files inside one lock; this one exists for a caller that already holds the lock (it must not take it twice:
// the lock is not reentrant).
export function writePlanSummary(plan: Plan, options: PlanStoreOptions = {}): void {
  withRunsLock(() => applyPlanSummary(plan, options))
}

function applyPlanSummary(plan: Plan, options: PlanStoreOptions): void {
  let state: FlowState
  try {
    state = readFlow(plan.run_id, { root: options.root })
  } catch {
    return   // no flow file: a plan may exist for a run whose flow was removed; nothing to point at
  }
  saveFlow({ ...state, plan: planSummary(plan) }, { root: options.root })
}

// Read, change and write under **one** lock. The CLI and the MCP server were doing
// read-plan → mutate → save-plan → update-summary as separate steps, so two of them racing lost one update
// and could leave the summary describing a plan that no longer existed. `mutator` receives the plan that was
// read inside the lock and returns the one to write (or the same object to write nothing); the two files are
// then saved together, which is what §3.1 promises.
export function mutatePlan<T>(
  runId: string,
  mutator: (_plan: Plan | null) => { plan: Plan, value: T } | { plan: null, value: T },
  options: PlanStoreOptions = {},
): T {
  return withRunsLock(() => {
    const current = planExists(runId, options) ? readPlan(runId, options) : null
    const result = mutator(current)
    if (result.plan === null) {
      // Nothing to write — but a crash between the two writes of an earlier mutation can have left the
      // summary behind, and the next no-op is the first moment anybody notices. Repair it here: the plan file
      // is the record, the summary is a cache, and a cache that cannot be repaired is worse than none.
      if (current) applyPlanSummary(current, options)
      return result.value
    }
    savePlan(result.plan, options)
    applyPlanSummary(result.plan, options)
    return result.value
  })
}

// The read path a surface uses before showing anything: repair the summary if it drifted, under the same lock
// a mutation would take. A `flow stop`/`delete-history` race is not worth a stuck counter on the run card.
export function ensurePlanSummary(runId: string, options: PlanStoreOptions = {}): void {
  withRunsLock(() => {
    if (!planExists(runId, options)) return
    try {
      applyPlanSummary(readPlan(runId, options), options)
    } catch {
      // A damaged plan is reported where it is read, not here.
    }
  })
}

// A path the plan stores must be inside the repository: `~/…` in `source_path` is a leak (it names the
// operator's home in every later payload) and an absolute path outside the checkout is not something a plan
// can mean. Refused rather than shortened, because a shortened path cannot be re-read by `plan import`.
//
// The check is on **real** paths, both sides: a lexical comparison passes a file inside the checkout that is a
// symlink to one outside it, and then the reader happily reads the outside file. The returned `absolute` is the
// resolved path, so the caller reads exactly the file that was checked instead of re-resolving a name that
// could change between the two steps.
export interface RepositoryPath {
  absolute: string
  relative: string
}

export function resolveRepositoryPath(path: string, root = process.cwd()): RepositoryPath {
  const absolute = path.startsWith('/') ? path : `${root}/${path}`
  let realRoot: string
  let realFile: string
  try {
    realRoot = realpathSync(root)
  } catch {
    throw new PlanError(`the project directory ${displayPath(root)} does not exist`, 'refused')
  }
  try {
    realFile = realpathSync(absolute)
  } catch {
    // A missing file is a read error, not a containment question; the caller turns it into its own message.
    throw new PlanError(`cannot read ${displayPath(path)}: it does not exist`, 'invalid')
  }
  const inside = realFile === realRoot || realFile.startsWith(`${realRoot}/`)
  if (!inside || realFile === realRoot) {
    throw new PlanError(
      `${displayPath(path)} is outside the repository (${displayPath(root)}); run the command from the project root or pass a path inside it`,
      'refused',
    )
  }
  return { absolute: realFile, relative: relative(realRoot, realFile) }
}

// The relative form on its own, for a caller that only needs what to store.
export function repositoryRelativePath(path: string, root = process.cwd()): string {
  return resolveRepositoryPath(path, root).relative
}
