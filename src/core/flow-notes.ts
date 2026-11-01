// Flow notes: the reviewer's findings as files, per head and per round.
//
// The engine used to keep a review only in the reviewer's pane: `verdictNotes()` scraped the last 400
// lines and pasted them into the dev's prompt, and nothing survived the round. This module is the
// durable half (docs/notifications-design.md §11): the reviewer writes a staging file, the engine reads
// it, sanitises it and publishes the record; the pane scan stays as the fallback.
//
// Three rules shape everything here:
// - **the reviewer's file is untrusted input.** It is validated (regular file, no symlink, size cap,
//   verdict line, finding lines), and it is sanitised — `redactSecrets` and the path shorthand —
//   *before* anything durable exists, so `notes/<head>-r<N>.md` never holds a key or `/home/<user>/…`;
// - **history is keyed by (head, round), never rewritten.** Two rounds of one head coexist; a replaced
//   flow starts from an empty directory (`startFlow` removes it), so a stale reference cannot survive;
// - **everything is bounded.** One file per round (64 KiB findings, 256 KiB pane capture, tail-kept),
//   a fixed number of heads and rounds per flow, and a total byte budget; pruning runs on publish and
//   again when the flow closes.
//
// Paths in messages are rendered with `displayPath` (§4.1 of the flow design): a record that leaks the
// account layout into a transcript is worse than one that names a file only by its last component.

import {
  chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync,
  statSync, unlinkSync, writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { redactSecrets } from './redact.js'
import { displayPath } from '../utils/paths.js'
import type { FlowVerdict } from './verdict.js'
import { FlowStateError } from './flow.js'
import { flowsDir } from './flow-store.js'

// A round's findings are a review, not a document: 64 KiB is far more than 30 lines of remarks and
// still small enough that twenty of them are a rounding error in the state tree.
export const NOTES_FILE_MAX_BYTES = 64 * 1024
// The pane capture is evidence, not content: it exists to survive a parser mismatch, so the tail (what
// the scanner reads) is kept and the rest is dropped.
export const NOTES_PANE_MAX_BYTES = 256 * 1024
// Retention. A flow that escalates after six rounds and then has two heads of context is already
// unusual; ten heads x three rounds covers every case a human reads back, and the byte budget stops a
// pathological spec-heavy round from filling the tree even inside those bounds.
export const NOTES_KEEP_HEADS = 10
export const NOTES_KEEP_ROUNDS_PER_HEAD = 3
export const NOTES_TOTAL_MAX_BYTES = 4 * 1024 * 1024
// When the flow closes there is nothing left to iterate on: the newest round is the one a human reads
// to understand why it stopped, and the rest are history nobody asked for.
export const NOTES_CLOSED_KEEP_ROUNDS = 1

// A git sha, short or full. Anything else cannot name a head and must not become a file name.
const HEAD_PATTERN = /^[0-9a-f]{7,40}$/i
const ROUND_PATTERN = /^\d+$/
const FINDING_PATTERN = /^(BLOCKER|MAJOR|MINOR)\b/
const VERDICT_LINE_PATTERN = /(?:VERDICT|ВЕРДИКТ)\s*[:\-—]?\s*(ACCEPT|CHANGES_REQUESTED)\s*$/i
// A token that starts with `/` and contains at least one more separator: an absolute path. The lead
// class is "anything that is not part of a path", because a path in a finding is routinely written as
// `file=/home/…`, `` `/home/…` ``, `"/home/…"` or `(/home/…)` — the earlier version only accepted
// whitespace and `(`, and let those three through. Windows drive letters are not a target here (the
// state tree is POSIX), `~` is left alone because it is already the shorthand we print, and a `:`
// immediately before the slash is skipped by the replacer so `https://…` is not rewritten.
const ABSOLUTE_PATH_PATTERN = /(^|[^A-Za-z0-9_/.-])((?:\/[^\s:;,'"()[\]`<>]+)+)/g

export interface NotesOptions {
  // Defaults to the state root, like every other store here.
  root?: string
  // Timestamp used for the log-free writes; the caller's clock, so a test can pin it.
  now?: number
}

export interface NotesCounts {
  blocker: number
  major: number
  minor: number
}

export type NotesSource = 'file' | 'pane' | 'foreign'

export interface NotesRound {
  head: string
  round: number
  // Sanitised text: what the reviewer said, with secrets and absolute paths removed.
  text: string
  // Path relative to the flow directory (`notes/<head>-r<N>.md`), which is what the journal stores.
  ref: string
  counts: NotesCounts
  source: NotesSource
  // Absolute path of the file the text came from.
  path: string
}

// Why a round could not be read. `missing` is data, not an error: the reviewer wrote nothing.
export type NotesMiss = 'missing' | 'invalid' | 'wrong-head'

export function notesDir(runId: string, root?: string): string {
  return join(flowsDir(root), runId, 'notes')
}

function inboxDir(runId: string, root?: string): string {
  return join(notesDir(runId, root), 'inbox')
}

export function notesRef(head: string, round: number): string {
  return `notes/${head}-r${round}.md`
}

export function stagingPath(runId: string, head: string, round: number, root?: string): string {
  return join(inboxDir(runId, root), `${head}-r${round}.md`)
}

export function durablePath(runId: string, head: string, round: number, root?: string): string {
  return join(notesDir(runId, root), `${head}-r${round}.md`)
}

export function panePath(runId: string, head: string, round: number, root?: string): string {
  return join(notesDir(runId, root), `${head}-r${round}.pane.txt`)
}

// A head can only become a file name if it looks like a commit id; the runner asks this before it
// tries to read a round, because a hand-edited or pre-release state may carry something else.
export function isCommitId(value: string): boolean {
  return HEAD_PATTERN.test(value.trim())
}

function assertHead(head: string): string {
  const value = head.trim()
  if (!HEAD_PATTERN.test(value)) throw new FlowStateError(`not a commit id: ${JSON.stringify(head)}`)
  return value
}

function assertRound(round: number): number {
  if (!Number.isFinite(round) || round < 1) throw new FlowStateError(`a round must be a positive integer, got ${round}`)
  return Math.floor(round)
}

// --- sanitising ---------------------------------------------------------------
//
// One pass over a line: every absolute path becomes its `displayPath` form (which is `~/…` under the
// home directory and the last component outside it), and the whole text goes through the redactor. The
// replacement is per *token*, so a finding keeps its wording and its `file:line` reference.
export function sanitizeNotesText(text: string): string {
  const shortened = text.replace(ABSOLUTE_PATH_PATTERN, (match, lead: string, path: string) => {
    // `scheme://host/path` is a URL, not a file on this machine: keep it as written.
    if (lead === ':') return match
    return `${lead}${displayPath(path)}`
  })
  return redactSecrets(shortened)
}

// The findings of a round, one per line, already sanitised. This is what the fix prompt receives and
// what `flow notes` prints — never the whole file, because the file can carry headings and a verdict
// line that belong to the round, not to the dev's instructions.
export function findingsText(text: string): string {
  return sanitizeNotesText(text)
    .split('\n')
    .map(line => line.trimEnd())
    .filter(line => FINDING_PATTERN.test(line))
    .join('\n')
}

export function countFindings(text: string): NotesCounts {
  const counts: NotesCounts = { blocker: 0, major: 0, minor: 0 }
  for (const line of text.split('\n')) {
    const match = FINDING_PATTERN.exec(line.trim())
    if (!match) continue
    const kind = match[1]!.toLowerCase() as keyof NotesCounts
    counts[kind] += 1
  }
  return counts
}

export interface NotesValidation {
  verdict: FlowVerdict | null
  counts: NotesCounts
  // Set when the file is not usable; the caller falls back to the pane and journals this.
  reason?: string
}

// What counts as a usable findings file (§11.2): non-empty, ending on a verdict line, and carrying at
// least one finding unless the verdict is ACCEPT — "nothing to fix" is a legitimate round.
export function validateNotesText(text: string): NotesValidation {
  const trimmed = text.trim()
  if (!trimmed) return { verdict: null, counts: { blocker: 0, major: 0, minor: 0 }, reason: 'empty' }
  const lines = trimmed.split('\n')
  const lastLine = lines.at(-1)!.trim()
  const verdictMatch = VERDICT_LINE_PATTERN.exec(lastLine)
  if (!verdictMatch) {
    return { verdict: null, counts: { blocker: 0, major: 0, minor: 0 }, reason: 'no verdict line at the end' }
  }
  const verdict = verdictMatch[1]!.toUpperCase() === 'ACCEPT' ? 'ACCEPT' : 'CHANGES_REQUESTED'
  const counts = countFindings(trimmed)
  const findings = counts.blocker + counts.major + counts.minor
  if (verdict === 'CHANGES_REQUESTED' && findings === 0) {
    return { verdict, counts, reason: 'CHANGES_REQUESTED without a BLOCKER/MAJOR/MINOR line' }
  }
  return { verdict, counts }
}

// --- files --------------------------------------------------------------------
//
// Every durable write is temp + rename with mode 0600, and the directory is 0700: a note is as private
// as the flow state next to it.
function writePrivate(path: string, text: string): void {
  const dir = dirname(path)
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  // `mkdir` filters its mode through the umask, so the directory is set explicitly: a note is as
  // private as the flow state beside it, and 0755 on `notes/` would let any local user read findings.
  try { chmodSync(dir, 0o700) } catch { /* the directory may be owned elsewhere */ }
  const temp = `${path}.tmp.${randomUUID()}`
  writeFileSync(temp, text, { encoding: 'utf-8', mode: 0o600 })
  try {
    chmodSync(temp, 0o600)
    renameSync(temp, path)
  } catch (err) {
    try { unlinkSync(temp) } catch { /* the temp file is already gone */ }
    throw err
  }
  try { chmodSync(path, 0o600) } catch { /* the rename already applied the mode */ }
}

// A symlink is refused rather than followed: a link inside the flow directory could point at a file
// the reviewer was never asked to write, and copying its content into the record is the same class of
// mistake as reading a spec through a symlink (§3.2 of the flow design).
function refuseSymlink(path: string): void {
  try {
    if (lstatSync(path).isSymbolicLink()) {
      throw new FlowStateError(`refusing to read a symlinked notes file: ${displayPath(path)}`)
    }
  } catch (err) {
    if (err instanceof FlowStateError) throw err
    // Missing file: the caller decides what that means.
  }
}

export type StagingRead =
  | { ok: true, text: string, verdict: FlowVerdict, counts: NotesCounts, source: 'staging' }
  | { ok: false, reason: NotesMiss | string }

// The durable record of one round, validated the same way. It answers ticks *after* the staging file was
// published and removed — which is every tick that held on a busy dev pane after the file arrived, so
// without this the round could never be answered at all. Already sanitised on disk; the text is
// re-sanitised by the readers.
export function readDurable(
  runId: string,
  head: string,
  round: number,
  options: NotesOptions = {},
): StagingRead {
  const path = durablePath(runId, assertHead(head), assertRound(round), options.root)
  refuseSymlink(path)
  let raw: string
  try {
    if (!statSync(path).isFile()) return { ok: false, reason: 'not a regular file' }
    raw = readFileSync(path, 'utf-8')
  } catch {
    return { ok: false, reason: 'missing' }
  }
  const validation = validateNotesText(raw)
  if (validation.reason || !validation.verdict) return { ok: false, reason: validation.reason ?? 'invalid' }
  return { ok: true, text: raw, verdict: validation.verdict, counts: validation.counts, source: 'staging' }
}

// Read and validate the staging file of one round. Never throws for the ordinary misses — a missing or
// unusable file is an answer the tick journals, not an exception that stops the pipeline.
export function readStaging(
  runId: string,
  head: string,
  round: number,
  options: NotesOptions = {},
): StagingRead {
  const path = stagingPath(runId, assertHead(head), assertRound(round), options.root)
  refuseSymlink(path)
  let stats
  try {
    stats = statSync(path)
  } catch {
    return { ok: false, reason: 'missing' }
  }
  if (!stats.isFile()) return { ok: false, reason: 'not a regular file' }
  if (stats.size > NOTES_FILE_MAX_BYTES) return { ok: false, reason: `larger than ${NOTES_FILE_MAX_BYTES} bytes` }
  let raw: string
  try {
    raw = readFileSync(path, 'utf-8')
  } catch {
    return { ok: false, reason: 'unreadable' }
  }
  const validation = validateNotesText(raw)
  if (validation.reason || !validation.verdict) return { ok: false, reason: validation.reason ?? 'invalid' }
  return { ok: true, text: raw, verdict: validation.verdict, counts: validation.counts, source: 'staging' }
}

export interface PublishResult {
  ref: string
  path: string
  counts: NotesCounts
  verdict: FlowVerdict
}

// The sanitiser in the middle of the pipeline: the staging text becomes the durable record (sanitised,
// capped at a line boundary) and the staging copy is removed. A crash before the rename leaves the
// staging file in place, which is exactly what a retry needs.
export function publishNotes(
  runId: string,
  head: string,
  round: number,
  rawText: string,
  options: NotesOptions = {},
): PublishResult {
  const validHead = assertHead(head)
  const validRound = assertRound(round)
  const validation = validateNotesText(rawText)
  if (validation.reason || !validation.verdict) {
    throw new FlowStateError(`cannot publish notes for ${validHead}-r${validRound}: ${validation.reason ?? 'invalid'}`)
  }
  const sanitized = capRecord(sanitizeNotesText(rawText.trim()), NOTES_FILE_MAX_BYTES)
  const path = durablePath(runId, validHead, validRound, options.root)
  writePrivate(path, sanitized.endsWith('\n') ? sanitized : `${sanitized}\n`)
  try { unlinkSync(stagingPath(runId, validHead, validRound, options.root)) } catch { /* already gone */ }
  return { ref: notesRef(validHead, validRound), path, counts: validation.counts, verdict: validation.verdict }
}

// The pane capture: the same sanitiser, the tail kept (that is what the verdict scanner reads), and the
// same 0600. Written on every reviewing tick, whether or not the file answered.
export function writePaneCapture(
  runId: string,
  head: string,
  round: number,
  paneText: string,
  options: NotesOptions = {},
): { ref: string, path: string } {
  const validHead = assertHead(head)
  const validRound = assertRound(round)
  const tail = tailBytes(paneText, NOTES_PANE_MAX_BYTES)
  const sanitized = sanitizeNotesText(tail)
  const path = panePath(runId, validHead, validRound, options.root)
  writePrivate(path, sanitized)
  return { ref: `notes/${validHead}-r${validRound}.pane.txt`, path }
}

// A record that has to be cut still has to be a record: the verdict line is what makes it one, so the
// budget is spent on findings and the verdict is appended last, with a visible marker where the
// truncation happened — a silent cut would read as "the reviewer said nothing more".
function capRecord(text: string, max: number): string {
  if (Buffer.byteLength(text, 'utf-8') <= max) return text
  const lines = text.split('\n')
  const verdict = lines.at(-1) ?? ''
  const marker = `(notes truncated at ${max} bytes)`
  const reserved = Buffer.byteLength(`${marker}\n${verdict}\n`, 'utf-8')
  let out = ''
  for (const line of lines.slice(0, -1)) {
    const next = out ? `${out}\n${line}` : line
    if (Buffer.byteLength(next, 'utf-8') + reserved > max) break
    out = next
  }
  return `${out ? `${out}\n` : ''}${marker}\n${verdict}\n`
}

function tailBytes(text: string, max: number): string {
  if (Buffer.byteLength(text, 'utf-8') <= max) return text
  const buffer = Buffer.from(text, 'utf-8')
  const tail = buffer.subarray(buffer.length - max).toString('utf-8')
  // Start at the first newline so the capture does not begin mid-line.
  const firstBreak = tail.indexOf('\n')
  return firstBreak === -1 ? tail : tail.slice(firstBreak + 1)
}

// --- reading a round ----------------------------------------------------------

export interface NotesQuery {
  // Defaults to the flow's current claim head.
  head?: string
  // Defaults to the newest round that has a file for that head.
  round?: number
}

function durableRounds(runId: string, head: string, root?: string): number[] {
  let names: string[]
  try {
    names = readdirSync(notesDir(runId, root))
  } catch {
    return []
  }
  const rounds: number[] = []
  for (const name of names) {
    const match = new RegExp(`^${head}-r(\\d+)\\.md$`).exec(name)
    if (match) rounds.push(Number(match[1]))
  }
  return rounds.sort((a, b) => a - b)
}

export function listNotesHeads(runId: string, root?: string): string[] {
  let names: string[]
  try {
    names = readdirSync(notesDir(runId, root))
  } catch {
    return []
  }
  const heads = new Set<string>()
  for (const name of names) {
    const match = /^([0-9a-f]{7,40})-r\d+\.md$/i.exec(name)
    if (match) heads.add(match[1]!.toLowerCase())
  }
  return [...heads].sort()
}

// One round, for `flow notes`. Every failure is a named answer rather than an exception, because
// "the reviewer wrote nothing" is data (exit 0) while "that round does not exist" is a mistake.
export type NotesLookup =
  | { ok: true, round: NotesRound }
  | { ok: false, reason: NotesMiss, head: string, round?: number, rounds?: number[], heads?: string[] }

export function readNotesRound(runId: string, query: NotesQuery = {}, options: NotesOptions = {}): NotesLookup {
  const head = query.head ? assertHead(query.head) : ''
  if (!head) return { ok: false, reason: 'wrong-head', head: '' }
  const rounds = durableRounds(runId, head, options.root)
  if (rounds.length === 0) {
    return { ok: false, reason: 'missing', head, heads: listNotesHeads(runId, options.root) }
  }
  const round = query.round ?? rounds.at(-1)!
  if (!ROUND_PATTERN.test(String(round)) || !rounds.includes(round)) {
    return { ok: false, reason: 'missing', head, round, rounds }
  }
  const path = durablePath(runId, head, round, options.root)
  let raw: string
  try {
    raw = readFileSync(path, 'utf-8')
  } catch {
    return { ok: false, reason: 'missing', head, round, rounds }
  }
  // Sanitised again on read: a file that was not written by this build (an older one, a human edit)
  // must not reach a transcript unsanitised.
  const text = sanitizeNotesText(raw)
  return {
    ok: true,
    round: {
      head,
      round,
      text,
      ref: notesRef(head, round),
      counts: countFindings(text),
      source: 'file',
      path,
    },
  }
}

// --- retention -----------------------------------------------------------------

interface NotesFile {
  path: string
  name: string
  head: string
  round: number
  size: number
  mtimeMs: number
}

function listNotesFiles(runId: string, root?: string): NotesFile[] {
  let names: string[]
  try {
    names = readdirSync(notesDir(runId, root))
  } catch {
    return []
  }
  const files: NotesFile[] = []
  for (const name of names) {
    const match = /^([0-9a-f]{7,40})-r(\d+)\.(md|pane\.txt)$/i.exec(name)
    if (!match) continue
    const path = join(notesDir(runId, root), name)
    try {
      const stats = statSync(path)
      if (!stats.isFile()) continue
      files.push({ path, name, head: match[1]!.toLowerCase(), round: Number(match[2]), size: stats.size, mtimeMs: stats.mtimeMs })
    } catch {
      // A file that vanished mid-scan is already gone.
    }
  }
  return files
}

export interface PruneResult {
  removed: string[]
  kept: number
}

// Retention, run after a durable publish and again when the flow closes. Order of decisions: newest
// heads first, then the newest rounds inside a head, then the total byte budget — so a single huge
// round can only evict older rounds, never the round that just landed.
export function pruneNotes(
  runId: string,
  options: NotesOptions & { keepHeads?: number, keepRounds?: number, maxBytes?: number } = {},
): PruneResult {
  const keepHeads = options.keepHeads ?? NOTES_KEEP_HEADS
  const keepRounds = options.keepRounds ?? NOTES_KEEP_ROUNDS_PER_HEAD
  const maxBytes = options.maxBytes ?? NOTES_TOTAL_MAX_BYTES
  const files = listNotesFiles(runId, options.root)
  if (files.length === 0) return { removed: [], kept: 0 }

  // Heads ranked by the newest file they own.
  const headsByRecency: string[] = []
  for (const file of [...files].sort((a, b) => b.mtimeMs - a.mtimeMs)) {
    if (!headsByRecency.includes(file.head)) headsByRecency.push(file.head)
  }
  const keptHeads = new Set(headsByRecency.slice(0, keepHeads))

  const removed: string[] = []
  let kept: NotesFile[] = []
  for (const file of files) {
    if (!keptHeads.has(file.head)) {
      removed.push(file.path)
      continue
    }
    const sameHead = files.filter(entry => entry.head === file.head)
    const newestRounds = [...new Set(sameHead.map(entry => entry.round))].sort((a, b) => b - a).slice(0, keepRounds)
    if (!newestRounds.includes(file.round)) removed.push(file.path)
    else kept.push(file)
  }

  // Byte budget: drop the oldest heads' files until the total fits. `kept` is ordered by head recency
  // through `files`, so removing from the tail keeps the newest material.
  let total = kept.reduce((sum, file) => sum + file.size, 0)
  for (const file of [...kept].sort((a, b) => a.mtimeMs - b.mtimeMs)) {
    if (total <= maxBytes) break
    removed.push(file.path)
    total -= file.size
    kept = kept.filter(entry => entry.path !== file.path)
  }

  for (const path of removed) {
    try { unlinkSync(path) } catch { /* already gone */ }
  }
  // An empty notes directory is noise in every `ls`; drop it once nothing is left.
  if (kept.length === 0 && removed.length > 0) {
    try { rmSync(notesDir(runId, options.root), { recursive: true, force: true }) } catch { /* best effort */ }
  }
  return { removed, kept: kept.length }
}

// On close the flow will not produce another round: keep the newest one (the evidence a human reads)
// and drop the rest.
export function pruneClosedFlowNotes(runId: string, options: NotesOptions = {}): PruneResult {
  return pruneNotes(runId, { ...options, keepRounds: NOTES_CLOSED_KEEP_ROUNDS, keepHeads: 1 })
}

// The whole directory, used when the flow file itself goes away (`deleteFlowFileForRun`) and when
// `flow start --replace` takes the run over: a new flow must not inherit round references.
export function removeNotesDir(runId: string, root?: string): boolean {
  const path = notesDir(runId, root)
  if (!existsSync(path)) return false
  rmSync(path, { recursive: true, force: true })
  return true
}

// Does this run have any notes at all? Used by `flow status`/tests to prove a directory was cleaned.
export function notesExist(runId: string, root?: string): boolean {
  return existsSync(notesDir(runId, root))
}

// The file a `flow notes` caller should show for a run without an explicit head: the newest durable
// file, whatever its head.
export function newestNotesHead(runId: string, root?: string): string | null {
  const files = listNotesFiles(runId, root).sort((a, b) => b.mtimeMs - a.mtimeMs)
  return files[0]?.head ?? null
}
