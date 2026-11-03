// Writing a closed plan item back into the document that lists the work.
//
// The mirror is the record and the document is the list (docs/plan-model-design.md §3), and that direction is one-way: an
// ACCEPT or an explicit `plan set --status done` closes an item in the mirror, and this module ticks its line in the
// document afterwards. A ticked box never closes anything — `importPlan` still records `ticked_by_hand` for a box a human
// ticked (plan.ts), which is the half that must not change.
//
// Why a commit and not a dirty file: a dirty tree stops the next dispatch (`tree_dirty`), so a write-back that stayed
// uncommitted would stall a flow that had just made progress. The engine therefore makes exactly one docs-only commit for
// the marks it wrote in one pass, and the existing `docs_only_since_claim` → `reanchor` path means that commit asks for no
// review and spends no round (block 72).
//
// Everything here is best effort by design: a missing document, an unreadable line or a git that refuses to commit is
// journalled and never undoes the close in the mirror.

import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, relative, isAbsolute } from 'node:path'
import type { Plan } from './plan.js'
import { parsePlanDocument, planExists, readPlan } from './plan.js'
import { readFlow, saveFlow } from './flow-store.js'
import { withRunsLock } from './runs.js'
import { appendLogEntries } from './flow.js'
import { emitNotification } from './notifications.js'
import { displayPath } from '../utils/paths.js'

// The same two shapes the parser accepts (`plan.ts`): `- [ ] **ID** — text` and `- [ ] text`. Nothing else is a plan item,
// so nothing else is touched.
const ITEM_LINE = /^- \[( |x|X)\](\s+)(.*)$/
const EXPLICIT_ID = /^\*\*([^*]+)\*\*/
// The commit this engine makes for its own marks, and only for them.
export const PLAN_MARK_MESSAGE = 'chore(flow): mark'

export interface MarkPlanOptions {
  // The flow's project directory. The document lives inside it and the commit is made there.
  repo: string
  // Repository-relative path of the document, as the mirror recorded it when it was imported.
  source_path: string
  // The ids whose lines should be ticked.
  ids: string[]
  // The mirror, for each item's line number.
  plan: Plan
  // What the caller saw. A dirty tree defers the mark: committing on top of half-finished work would put someone else's
  // changes into the engine's commit.
  tree_clean: boolean
}

export interface MarkPlanOutcome {
  marked: { id: string, line: number }[]
  // Ids whose line already said `[x]`: nothing written, nothing committed (idempotence).
  already: string[]
  // The tree was dirty; nothing was written and the next clean pass retries.
  deferred: boolean
  failures: { id: string, reason: string }[]
  sha: string | null
}

export function emptyMarkOutcome(): MarkPlanOutcome {
  return { marked: [], already: [], deferred: false, failures: [], sha: null }
}

// Is this the unchecked, id-bearing line of `id`? The id check is what keeps a stale line number (a document edited
// between the import and the close) from ticking somebody else's item.
function lineMatchesId(line: string, id: string): { ok: boolean, checked: boolean } | null {
  const match = ITEM_LINE.exec(line)
  if (!match) return null
  const explicit = EXPLICIT_ID.exec(match[3]!.trim())
  if (explicit && explicit[1]!.trim() !== id) return null
  return { ok: true, checked: match[1] !== ' ' }
}

// Tick one line, changing exactly the one character: the checkbox. Everything else — indentation, the bold id, the em
// dash, trailing spaces — stays byte for byte.
function tickLine(line: string): string {
  const index = line.indexOf('[ ]')
  return `${line.slice(0, index)}[x]${line.slice(index + 3)}`
}

function git(repo: string, args: string[]): string {
  return String(execFileSync('git', ['-C', repo, ...args], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }))
}

// The document as the mirror named it, with the reason when it cannot be used: a path outside the project is not this
// engine's to commit, and a missing file is not a mark that can be written.
type DocumentProbe = { ok: true, path: string, text: string } | { ok: false, reason: string }

function probeDocument(repo: string, sourcePath: string): DocumentProbe {
  const wanted = sourcePath.trim()
  if (!wanted || isAbsolute(wanted)) return { ok: false, reason: `the plan document ${displayPath(sourcePath)} is not inside the project` }
  const target = join(repo, wanted)
  const inside = relative(repo, target)
  if (inside === '' || inside.startsWith('..') || isAbsolute(inside)) {
    return { ok: false, reason: `the plan document ${displayPath(sourcePath)} is not inside the project` }
  }
  try {
    if (!statSync(target).isFile()) return { ok: false, reason: `the plan document ${displayPath(sourcePath)} is not a file` }
  } catch (err) {
    return {
      ok: false,
      reason: (err as { code?: string }).code === 'ENOENT'
        ? `the plan document ${displayPath(sourcePath)} was not found`
        : `the plan document ${displayPath(sourcePath)} could not be read`,
    }
  }
  const text = readDocument(target)
  if (text === null) return { ok: false, reason: `the plan document ${displayPath(sourcePath)} could not be read` }
  return { ok: true, path: target, text }
}

// Read the document exactly as it is on disk: `split('\n')` keeps the bytes, so the lines the parser counted
// (`parsed.line`, 1-based) are the same lines here.
function readDocument(path: string): string | null {
  try {
    return readFileSync(path, 'utf-8')
  } catch {
    return null
  }
}

export function markPlanItems(options: MarkPlanOptions): MarkPlanOutcome {
  const outcome = emptyMarkOutcome()
  if (options.ids.length === 0) return outcome
  if (!options.tree_clean) return { ...outcome, deferred: true }

  const document = probeDocument(options.repo, options.source_path)
  if (!document.ok) {
    return { ...outcome, failures: options.ids.map(id => ({ id, reason: document.reason })) }
  }
  const target = document.path
  const raw = document.text
  // The document has to *parse* before a line in it is ticked: a checkbox written into a file whose format the plan reader
  // no longer understands would be committed as if the plan were fine, and the next import would have nothing to read
  // (block 72, review round 1).
  try {
    parsePlanDocument(raw)
  } catch (err) {
    const reason = `the plan document does not parse: ${err instanceof Error ? err.message : String(err)}`
    return { ...outcome, failures: options.ids.map(id => ({ id, reason })) }
  }

  const lines = raw.split('\n')
  const marked: { id: string, line: number }[] = []
  for (const id of options.ids) {
    const item = options.plan.items.find(entry => entry.id === id)
    const line = item?.line ?? null
    if (line === null || line < 1 || line > lines.length) {
      outcome.failures.push({ id, reason: 'no line in the document for this item' })
      continue
    }
    const text = lines[line - 1]!
    const match = lineMatchesId(text, id)
    if (!match) {
      outcome.failures.push({ id, reason: `line ${line} is not this item's unchecked line` })
      continue
    }
    if (match.checked) {
      outcome.already.push(id)
      continue
    }
    lines[line - 1] = tickLine(text)
    marked.push({ id, line })
  }
  if (marked.length === 0) return { ...outcome, marked, failures: outcome.failures }

  const updated = lines.join('\n')
  try {
    writeFileSync(target, updated, 'utf-8')
  } catch {
    return { ...outcome, marked: [], failures: [...outcome.failures, ...marked.map(entry => ({ id: entry.id, reason: 'the plan document could not be written' }))] }
  }

  // The commit is the point of the write: an uncommitted tick would leave the tree dirty and stop the next dispatch.
  const ids = marked.map(entry => entry.id)
  const message = `${PLAN_MARK_MESSAGE} ${ids.join(', ')} done in the plan`
  try {
    git(options.repo, ['add', '--', target])
    git(options.repo, ['commit', '-q', '-m', message])
    const sha = git(options.repo, ['rev-parse', 'HEAD']).trim()
    return { ...outcome, marked, sha, failures: outcome.failures }
  } catch (err) {
    // Nothing was committed, so the file goes back to what it was: a mark that cannot be committed must not leave the
    // repository dirty behind it.
    try { writeFileSync(target, raw, 'utf-8') } catch { /* the tree is dirty either way; the journal says so */ }
    const reason = err instanceof Error ? err.message.split('\n')[0]!.trim() : String(err)
    return {
      ...outcome,
      marked: [],
      failures: [...outcome.failures, ...marked.map(entry => ({ id: entry.id, reason: `git commit failed: ${reason}` }))],
    }
  }
}

// Which done items still have an unticked line? The retry path after a deferred mark, and the honest way to ask: the
// mirror says done, the document says not — that difference is the work left to do here.
export function pendingPlanMarks(plan: Plan, documentText: string): string[] {
  const lines = documentText.split('\n')
  const pending: string[] = []
  for (const item of plan.items) {
    if (item.status !== 'done') continue
    const line = item.line ?? null
    if (line === null || line < 1 || line > lines.length) continue
    const match = lineMatchesId(lines[line - 1]!, item.id)
    if (match && !match.checked) pending.push(item.id)
  }
  return pending
}

export interface PlanMarksOptions {
  // State root for the plan and the flow file.
  root?: string
  // The project directory (the flow's repo).
  repo: string
  // What the caller saw of the tree.
  tree_clean: boolean
  // The item this tick closed in the mirror. It is always part of the pass — together with every done item whose line is
  // still unticked — and it is the id a document that cannot be read is reported against.
  closed?: string | null
  // Explicit ids, when the caller knows exactly what it closed (the manual `plan set --status done`).
  ids?: string[]
  // `close` reports a deferred mark in the journal (one line, at the moment the close happened); `reconcile` stays quiet
  // about a dirty tree — that tick already says `tree_dirty`.
  attempt?: 'close' | 'reconcile'
  at?: string
}

// Mark, commit and journal for one run. Returns the outcome so a command can report it.
// One pass per tick, and therefore one commit: the item this tick closed and every done item an earlier tick had to defer
// go into the same call (block 72, review round 1). Two calls would mean two commits for one tick's worth of marking.
export function applyPlanMarks(runId: string, options: PlanMarksOptions): MarkPlanOutcome {
  const attempt = options.attempt ?? 'close'
  let plan: Plan
  try {
    if (!planExists(runId, { root: options.root })) return emptyMarkOutcome()
    plan = readPlan(runId, { root: options.root })
  } catch {
    return emptyMarkOutcome()
  }
  // What the caller already knows it closed, plus whatever the document still owes. The requested ids are kept even when
  // the document cannot be read: a close that could not be written is reported by name, not silently dropped.
  const requested = options.ids ?? (options.closed ? [options.closed] : [])
  const document = probeDocument(options.repo, plan.source_path)
  let pending: string[] = []
  if (document.ok) {
    // The document has to parse before any of it is written: a checkbox committed into a file the plan reader cannot read
    // is worse than no mark at all (block 72, review round 1). One fact, one line — the same text on every tick, so the
    // journal does not repeat it.
    try {
      parsePlanDocument(document.text)
    } catch (err) {
      const outcome: MarkPlanOutcome = {
        ...emptyMarkOutcome(),
        failures: [{ id: '', reason: `the plan document does not parse: ${err instanceof Error ? err.message : String(err)}` }],
      }
      journalPlanMarks(runId, outcome, { root: options.root, at: options.at, attempt })
      return outcome
    }
    pending = pendingPlanMarks(plan, document.text)
  }
  const ids = [...new Set([...requested, ...pending])]
  if (ids.length === 0) return emptyMarkOutcome()

  const outcome = markPlanItems({
    repo: options.repo,
    source_path: plan.source_path,
    ids,
    plan,
    tree_clean: options.tree_clean,
  })
  journalPlanMarks(runId, outcome, { root: options.root, at: options.at, attempt })
  return outcome
}

// The journal is where an operator learns that a mark happened, was deferred or failed. The flow log carries the line
// `plan_item_marked <ID> <sha>` (visible in `flow logs`); the notification carries the same fact to the panel's journal.
export function journalPlanMarks(
  runId: string,
  outcome: MarkPlanOutcome,
  options: { root?: string, at?: string, attempt?: 'close' | 'reconcile' } = {},
): void {
  const at = options.at ?? new Date().toISOString()
  const attempt = options.attempt ?? 'close'
  const lines: { event: string, detail: string }[] = []
  if (outcome.deferred && attempt === 'close') lines.push({ event: 'plan_mark_deferred', detail: 'tree_dirty' })
  for (const entry of outcome.marked) lines.push({ event: 'plan_item_marked', detail: `${entry.id} ${outcome.sha ?? ''}`.trim() })
  // A document-wide refusal (no file, no parse) has no id to name.
  for (const failure of outcome.failures) {
    lines.push({ event: 'plan_mark_failed', detail: failure.id ? `${failure.id}: ${failure.reason}` : failure.reason })
  }
  if (lines.length === 0) return
  if (outcome.marked.length === 0 && attempt === 'reconcile' && outcome.failures.length === 0) return

  let flow
  try {
    flow = readFlow(runId, { root: options.root })
  } catch {
    return
  }
  try {
    withRunsLock(() => {
      const current = readFlow(runId, { root: options.root })
      // A failure that is the same as the one already recorded is not news: a document that stays broken must not write a
      // line on every tick (the close names it once, the reconciliation retries silently).
      const lastFailure = [...current.log].reverse().find(entry => entry.event === 'plan_mark_failed')
      const fresh = lines.filter(line => !(line.event === 'plan_mark_failed' && lastFailure?.detail === line.detail))
      if (fresh.length === 0) return
      const log = fresh.reduce((entries, line) => appendLogEntries(entries, { at, event: line.event, detail: line.detail }), current.log)
      saveFlow({ ...current, log }, { root: options.root })
    })
  } catch {
    // A journal that cannot be written is not a reason to fail the mark that already happened.
  }

  // The panel's journal is the notification list: one row per mark, deduped by flow and commit so a retry cannot duplicate
  // it. Deferrals and failures are left to `flow logs` — they are not news a human has to act on.
  for (const entry of outcome.marked) {
    emitNotification({
      kind: 'plan.item_marked',
      title: `plan item ${entry.id} marked in the document`,
      detail: `${flow.repo} · ${outcome.sha ?? ''}`.trim(),
      run_id: runId,
      project: flow.repo.split(/[\\/]+/).filter(Boolean).at(-1)?.slice(0, 64) ?? '',
      source: 'product',
      dedupe_key: `${flow.flow_id}:plan.item_marked:${entry.id}:${outcome.sha ?? ''}`,
    })
  }
}
