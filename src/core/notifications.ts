// The notification journal: what a human was told, in the order it happened.
//
// Design: `docs/notifications-design.md` §2 (the event), §3 (storage). The invariants this module keeps:
//
// - **`seq` is the only order.** It is assigned by the server, never by the producer, and never reused — the
//   read watermark and every badge are `seq > read_seq`. `ts` is context (the producer's clock), `received_at`
//   is the server's, and every time-derived behaviour uses the latter.
// - **One writer at a time, and it is synchronous.** Append, rotation and the key index all run inside
//   `withNotificationsLock`, and nothing in that critical section awaits. A rotation that is only locked against
//   itself is not locked against the append that makes it necessary.
// - **A reader never blocks and never trusts the last line.** Append is `O_APPEND`; a reader may observe a
//   partial tail, so every line is parsed on its own and a fragment is skipped until the write completes.
// - **At-least-once with a durable key.** A producer that supplies `dedupe_key` gets one row per key for as long
//   as the key is in the bounded index, which is what makes a retried flow notification harmless.

import {
  closeSync, fstatSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync,
  writeSync,
} from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { stateRoot } from './state-path.js'
import { redactSecrets } from './redact.js'
import { displayPath } from '../utils/paths.js'

export type NotificationSource = 'product' | 'external'
export type NotificationSeverity = 'info' | 'warn' | 'error'

export const NOTIFICATION_KINDS = [
  'run.created', 'run.stopped', 'run.archived',
  'agent.needs_human', 'agent.failed', 'agent.finished',
  'probe.failed', 'flow.escalated', 'flow.review_timeout',
  // Two plan kinds: an item closing is the progress the owner asked to see, and a blocked item is the one thing a
  // plan cannot move by itself. Both are produced by the engine only.
  'plan.item_done', 'plan.item_blocked',
  'external',
] as const
export type NotificationKind = typeof NOTIFICATION_KINDS[number]

// The flow kinds are the engine's own attention. An ingest caller that could write them would be able to fake a
// "a human is required" state, so they are refused at the HTTP boundary (§2.2).
export const PRODUCT_ONLY_KINDS: readonly NotificationKind[] = [
  'flow.escalated', 'flow.review_timeout', 'plan.item_done', 'plan.item_blocked',
]

export const DEFAULT_SEVERITY: Record<NotificationKind, NotificationSeverity> = {
  'run.created': 'info',
  'run.stopped': 'info',
  'run.archived': 'info',
  'agent.needs_human': 'warn',
  'agent.failed': 'error',
  'agent.finished': 'info',
  'probe.failed': 'warn',
  'flow.escalated': 'warn',
  'flow.review_timeout': 'warn',
  'plan.item_done': 'info',
  'plan.item_blocked': 'warn',
  external: 'info',
}

export interface NotificationEvent {
  seq: number
  id: string
  ts: string
  received_at: string
  run_id: string
  run_name: string
  project: string
  agent_id: string
  agent_nickname: string
  kind: NotificationKind
  severity: NotificationSeverity
  title: string
  detail: string
  source: NotificationSource
  dedupe_key?: string
}

export interface NotificationInput {
  kind: NotificationKind
  title: string
  detail?: string
  severity?: NotificationSeverity
  run_id?: string
  run_name?: string
  project?: string
  agent_id?: string
  agent_nickname?: string
  source?: NotificationSource
  ts?: string
  dedupe_key?: string
}

export const NOTIFICATION_LIMITS = {
  title: 200,
  detail: 1000,
  run_name: 80,
  project: 64,
  nickname: 80,
  body: 64 * 1024,
  // The ring, §3.3: rotate on either trigger, and leave 25 % headroom under the byte cap so the next
  // rotation is not on the very next append.
  max_events: 2000,
  max_bytes: 2 * 1024 * 1024,
  keep_events: 1500,
  keep_bytes: Math.floor(1.5 * 1024 * 1024),
  // How many keys the dedupe index remembers; the newest win.
  dedupe_keys: 2000,
} as const

export class NotificationError extends Error {
  readonly code: 'invalid' | 'refused' | 'unavailable'

  constructor(message: string, code: 'invalid' | 'refused' | 'unavailable' = 'invalid') {
    super(message)
    this.name = 'NotificationError'
    this.code = code
  }
}

export interface NotificationPaths {
  log: string
  read: string
  dedupe: string
  seq: string
  lock: string
}

export function notificationPaths(root = stateRoot()): NotificationPaths {
  return {
    log: join(root, 'notifications.jsonl'),
    read: join(root, 'notifications-read.json'),
    dedupe: join(root, 'notifications-dedupe.json'),
    seq: join(root, 'notifications-seq'),
    lock: join(root, '.notifications.lock'),
  }
}

// ---------------------------------------------------------------------------------------------------
// Sanitising and validation
// ---------------------------------------------------------------------------------------------------

// One line, bounded, redacted, and with no home path in it. A notification is history: it outlives the run and
// may be quoted into a message, so it carries the same guarantees the notes channel already keeps (§11.3).
// A single backslash, spelled out so the intent survives editing: `'\\'` in source is one character at runtime,
// and `'\\\\'` would be two — which would make the check compare a two-character string with a one-character path.
const BACKSLASH = '\\'

function clean(value: unknown, limit: number): string {
  if (typeof value !== 'string') return ''
  const single = value.replace(/\r\n/g, '\n').replace(/\s*\n+\s*/g, ' · ').trim()
  const shortened = displayPathInText(single)
  const redacted = redactSecrets(shortened)
  return redacted.length > limit ? `${redacted.slice(0, limit - 1).trimEnd()}…` : redacted
}

// `displayPath` takes a whole path; a title may contain one inside a sentence. Anything that looks like an
// absolute home path is therefore shortened to its last component, which is the only part a human needs and the
// only part that cannot leak a directory tree.
// Three shapes, each with its own pattern so the escape count stays readable: `/home/u/a/b`, `C:\Users\Alice\work`,
// and `\\server\share\file.txt`. The last one needs two leading backslashes in the text, which means four in a
// regex literal — folded into one pattern with the other two, that is where the first version got it wrong.
//
// The components are **Unicode**: this journal is written by agents working in Polish, Ukrainian and Russian
// checkouts, so `/home/Дмитро/Проект/secret.txt` is an ordinary path here. A `\w`-based class would treat it as
// prose and leave the whole tree in the event.
// The lead is "any character that cannot be part of a path", not a short list of punctuation: a path also follows
// `path:`, `file:`, `->` and a dozen other joins, and a whitelist silently misses each one. The exception is a
// colon that introduces a `scheme://…` URL — that is not a path on this machine (see `shortenPath`).
const LEAD = '(^|[^\\p{L}\\p{N}._@+\\-/\\\\])'
const UNIX_PATH = new RegExp(`${LEAD}((?:\\/[\\p{L}\\p{N}._@+-]+){2,}\\/?)`, 'gu')
const WINDOWS_PATH = new RegExp(`${LEAD}([A-Za-z]:\\\\[\\p{L}\\p{N}.@+ -]+(?:\\\\[\\p{L}\\p{N}.@+ -]+){1,})`, 'gu')
const UNC_PATH = new RegExp(`${LEAD}(\\\\\\\\[\\p{L}\\p{N}.@+ -]+(?:\\\\[\\p{L}\\p{N}.@+ -]+){1,})`, 'gu')

function shortenPath(match: string, lead: string, path: string): string {
  // A URL is not a path on this machine: `https://host/x` reaches here with `lead: ':'` and a path that starts
  // with `//`, and rewriting it would corrupt the link instead of protecting anything.
  if (lead === ':' && path.startsWith('//')) return match
  if (path.startsWith('//')) return match
  // The last component only: the file name is what a human needs, the tree is what must not leak.
  const parts = path.split(/[\\/]+/).filter(Boolean)
  const last = parts[parts.length - 1] ?? ''
  return `${lead}${last}`
}

function displayPathInText(text: string): string {
  return text
    .replace(UNIX_PATH, shortenPath)
    .replace(WINDOWS_PATH, shortenPath)
    .replace(UNC_PATH, shortenPath)
}

export function normalizeNotificationInput(raw: unknown): NotificationInput {
  const record = raw as Record<string, unknown> | null
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new NotificationError('a notification must be an object')
  }
  const kind = String(record.kind ?? '') as NotificationKind
  if (!NOTIFICATION_KINDS.includes(kind)) {
    throw new NotificationError(`unknown kind "${String(record.kind ?? '')}"; expected one of: ${NOTIFICATION_KINDS.join(', ')}`)
  }
  const severityInput = record.severity === undefined ? DEFAULT_SEVERITY[kind] : String(record.severity)
  if (severityInput !== 'info' && severityInput !== 'warn' && severityInput !== 'error') {
    throw new NotificationError(`unknown severity "${severityInput}"; expected info, warn or error`)
  }
  const title = clean(record.title, NOTIFICATION_LIMITS.title)
  if (!title) throw new NotificationError('a notification needs a title')
  // Checked on the raw value, before the path shortener runs: `C:\Users\Alice` would otherwise be shortened to
  // `Alice` and pass a check that is supposed to refuse the input.
  const rawProject = typeof record.project === 'string' ? record.project.trim() : ''
  if (rawProject.includes('/') || rawProject.includes(BACKSLASH)) {
    throw new NotificationError('project must be a name, not a path')
  }
  const project = clean(record.project, NOTIFICATION_LIMITS.project)
  const source = record.source === undefined ? 'product' : String(record.source)
  if (source !== 'product' && source !== 'external') {
    throw new NotificationError(`unknown source "${source}"; expected product or external`)
  }
  if (PRODUCT_ONLY_KINDS.includes(kind) && source !== 'product') {
    throw new NotificationError(`kind ${kind} is produced by the product; an ingest caller cannot forge it`, 'refused')
  }
  const dedupeKey = typeof record.dedupe_key === 'string' && record.dedupe_key.trim()
    ? clean(record.dedupe_key, 200)
    : undefined

  const input: NotificationInput = {
    kind,
    title,
    detail: clean(record.detail, NOTIFICATION_LIMITS.detail),
    severity: severityInput,
    run_id: clean(record.run_id, 64),
    run_name: clean(record.run_name, NOTIFICATION_LIMITS.run_name),
    project,
    agent_id: clean(record.agent_id, 64),
    agent_nickname: clean(record.agent_nickname, NOTIFICATION_LIMITS.nickname),
    source,
  }
  if (dedupeKey) input.dedupe_key = dedupeKey
  if (typeof record.ts === 'string' && record.ts) input.ts = clampTimestamp(record.ts)
  return input
}

// The producer's clock is context; a value far in the future would make every "3 min ago" label wrong, so it is
// clamped to the server's now when it is ahead of it.
function clampTimestamp(value: string): string {
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) return new Date().toISOString()
  return new Date(Math.min(parsed, Date.now())).toISOString()
}

// ---------------------------------------------------------------------------------------------------
// The lock: separate from `.runs.lock` so journal traffic never contends with run-state writers
// ---------------------------------------------------------------------------------------------------

export const NOTIFICATIONS_LOCK_TIMEOUT = 'Timed out waiting for notifications lock:'

export function withNotificationsLock<T>(fn: () => T, root = stateRoot()): T {
  mkdirSync(root, { recursive: true })
  const { lock } = notificationPaths(root)
  const deadline = Date.now() + 5000
  while (true) {
    try {
      const fd = openSync(lock, 'wx', 0o600)
      try {
        writeFileSync(fd, JSON.stringify({ pid: process.pid, created_at: new Date().toISOString() }))
      } finally {
        closeSync(fd)
      }
      break
    } catch {
      try {
        if (Date.now() - statSync(lock).mtimeMs > 5000) unlinkSync(lock)
      } catch { /* the lock went away by itself */ }
      if (Date.now() > deadline) throw new NotificationError(`${NOTIFICATIONS_LOCK_TIMEOUT} ${displayPath(lock)}`, 'unavailable')
      // A synchronous pause: the append path must not yield (§3.3).
      const until = Date.now() + 25
      while (Date.now() < until) { /* spin */ }
    }
  }
  try {
    return fn()
  } finally {
    try { unlinkSync(lock) } catch { /* already gone */ }
  }
}

// ---------------------------------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------------------------------

export interface ReadOptions {
  limit?: number
  run?: string
  since?: number
  unread?: boolean
  root?: string
}

export interface ReadResult {
  events: NotificationEvent[]
  read_seq: number
  latest_seq: number
  total: number
}

export function readNotifications(options: ReadOptions = {}): ReadResult {
  const root = options.root ?? stateRoot()
  const { events, latest } = scanLog(root)
  const readSeq = readWatermark(root)
  const filtered = events.filter(event => {
    if (options.run && event.run_id !== options.run) return false
    if (options.since !== undefined && event.seq <= options.since) return false
    if (options.unread === true && event.seq <= readSeq) return false
    return true
  })
  const limit = options.limit && options.limit > 0 ? Math.min(options.limit, NOTIFICATION_LIMITS.max_events) : 200
  // Newest first: the dialog opens on what just happened.
  const events_ = filtered.slice(-limit).reverse()
  return { events: events_, read_seq: readSeq, latest_seq: latest, total: filtered.length }
}

// Every well-formed line, oldest first. A partial tail is skipped by construction: a line without a numeric
// `seq` is not an event yet.
function scanLog(root: string): { events: NotificationEvent[], latest: number } {
  const { log } = notificationPaths(root)
  let text: string
  try {
    text = readFileSync(log, 'utf-8')
  } catch (err) {
    if ((err as { code?: string }).code === 'ENOENT') return { events: [], latest: 0 }
    throw new NotificationError(`the notification log could not be read: ${displayPath(log)}`, 'unavailable')
  }
  const events: NotificationEvent[] = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    const parsed = parseLine(line)
    if (parsed) events.push(parsed)
  }
  const latest = events.length > 0 ? events[events.length - 1]!.seq : 0
  return { events, latest }
}

function parseLine(line: string): NotificationEvent | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    return null   // a partial tail, or a damaged line: never trusted, never fatal
  }
  const record = parsed as Partial<NotificationEvent>
  if (typeof record.seq !== 'number' || !Number.isFinite(record.seq)) return null
  if (typeof record.kind !== 'string' || !NOTIFICATION_KINDS.includes(record.kind as NotificationKind)) return null
  return record as NotificationEvent
}

export interface NotificationSummary {
  latest_seq: number
  unread: number
  latest_ts: string | null
}

export function notificationSummary(root = stateRoot()): NotificationSummary {
  const { events, latest } = scanLog(root)
  const readSeq = readWatermark(root)
  const unread = events.filter(event => event.seq > readSeq).length
  const newest = events.length > 0 ? events[events.length - 1]! : null
  return { latest_seq: latest, unread, latest_ts: newest ? newest.received_at : null }
}

function readWatermark(root: string): number {
  const { read } = notificationPaths(root)
  try {
    const parsed = JSON.parse(readFileSync(read, 'utf-8')) as { read_seq?: unknown }
    return typeof parsed.read_seq === 'number' && Number.isFinite(parsed.read_seq) ? parsed.read_seq : 0
  } catch {
    return 0   // a missing or damaged watermark means "nothing read yet"
  }
}

// Marking read is monotonic and happens inside the lock, so two concurrent calls cannot roll the watermark back.
export function markNotificationsRead(upTo?: number, root = stateRoot()): { read_seq: number, changed: boolean } {
  return withNotificationsLock(() => {
    const { latest } = scanLog(root)
    const current = readWatermark(root)
    const target = Math.min(upTo === undefined ? latest : upTo, latest)
    if (target <= current) return { read_seq: current, changed: false }
    atomicWriteJson(notificationPaths(root).read, { read_seq: target, updated_at: new Date().toISOString() }, root)
    return { read_seq: target, changed: true }
  }, root)
}

// ---------------------------------------------------------------------------------------------------
// Appending
// ---------------------------------------------------------------------------------------------------

export interface AppendResult {
  event: NotificationEvent
  duplicate: boolean
  rotated: boolean
}

// What this process left the file in, so the next append can tell "nobody wrote since" from "somebody did"
// without rescanning. The inode is what makes it sound: rotation publishes through `rename`.
interface LogCache {
  dev: number
  ino: number
  size: number
  count: number
}

const cacheByPath = new Map<string, LogCache>()

// The product's emit point. A journal that cannot be written must never break the action it describes — a run
// that failed to start because the notification log was unavailable would be a bug with a nasty blast radius — so
// this swallows the error and keeps the caller on its own path. The event is then simply not in history, which is
// what the design calls "a lost last event is not worth an fsync" taken one step further.
export function emitNotification(input: NotificationInput): void {
  try {
    appendNotification(input)
  } catch {
    // deliberately silent: see above
  }
}

export function appendNotification(input: NotificationInput | unknown, root = stateRoot()): AppendResult {
  const normalized = normalizeNotificationInput(input)
  return withNotificationsLock(() => appendUnlocked(normalized, root), root)
}

function appendUnlocked(input: NotificationInput, root: string): AppendResult {
  const paths = notificationPaths(root)
  const before = statForAppend(paths.log)
  const cached = cacheByPath.get(paths.log)
  let count: number
  let sizeBefore: number
  let dedupe = readDedupe(root)

  if (before === null) {
    count = 0
    sizeBefore = 0
    dedupe = []
  } else {
    sizeBefore = before.size
    const sameFile = cached !== undefined && cached.ino === before.ino && cached.dev === before.dev
    if (sameFile && cached.size === before.size) {
      count = cached.count
    } else {
      // A foreign write or a rotation: recompute the truth, and reconcile the key index with it in the same pass.
      const scan = scanFileKeys(paths.log)
      count = scan.count
      dedupe = mergeKeys(dedupe, scan.keys)
    }
  }

  if (input.dedupe_key) {
    const known = dedupe.find(entry => entry.key === input.dedupe_key)
    if (known) {
      const existing = findEventByKey(root, input.dedupe_key)
      if (existing) return { event: existing, duplicate: true, rotated: false }
      // The index remembers a key whose row was rotated away: the retry gets a fresh row, which is why the index
      // is bounded and the row can be gone.
      dedupe = dedupe.filter(entry => entry.key !== input.dedupe_key)
    }
  }

  const seq = nextSeq(root)
  const event: NotificationEvent = {
    seq,
    id: `n_${seq}_${randomBytes(3).toString('hex')}`,
    ts: input.ts ?? new Date().toISOString(),
    received_at: new Date().toISOString(),
    run_id: input.run_id ?? '',
    run_name: input.run_name ?? '',
    project: input.project ?? '',
    agent_id: input.agent_id ?? '',
    agent_nickname: input.agent_nickname ?? '',
    kind: input.kind,
    severity: input.severity ?? DEFAULT_SEVERITY[input.kind],
    title: input.title,
    detail: input.detail ?? '',
    source: input.source ?? 'product',
  }
  if (input.dedupe_key) event.dedupe_key = input.dedupe_key

  const line = `${JSON.stringify(event)}\n`
  const bytes = Buffer.byteLength(line, 'utf8')
  const fd = openSync(paths.log, 'a', 0o600)
  try {
    writeSync(fd, line)
  } finally {
    closeSync(fd)
  }

  const sizeAfter = sizeBefore + bytes
  const countAfter = count + 1
  const stat = fstatFor(paths.log)
  cacheByPath.set(paths.log, { dev: stat.dev, ino: stat.ino, size: sizeAfter, count: countAfter })

  if (input.dedupe_key) {
    dedupe = [...dedupe, { key: input.dedupe_key, seq }].slice(-NOTIFICATION_LIMITS.dedupe_keys)
    atomicWriteJson(paths.dedupe, { keys: dedupe }, root)
  }

  let rotated = false
  if (sizeAfter > NOTIFICATION_LIMITS.max_bytes || countAfter > NOTIFICATION_LIMITS.max_events) {
    rotateUnlocked(root)
    rotated = true
  }
  return { event, duplicate: false, rotated }
}

function statForAppend(path: string): { size: number, dev: number, ino: number } | null {
  try {
    const stat = statSync(path)
    return { size: stat.size, dev: Number(stat.dev), ino: Number(stat.ino) }
  } catch (err) {
    // `ENOENT` is the first run of a fresh state directory, not an error (§3.1). Anything else is real.
    if ((err as { code?: string }).code === 'ENOENT') return null
    throw new NotificationError(`the notification log cannot be checked: ${displayPath(path)}`, 'unavailable')
  }
}

function fstatFor(path: string): { dev: number, ino: number } {
  const fd = openSync(path, 'r')
  try {
    const stat = fstatSync(fd)
    return { dev: Number(stat.dev), ino: Number(stat.ino) }
  } finally {
    closeSync(fd)
  }
}

// Rotation rewrites whole lines only, keeps the newest ones while both budgets hold, and leaves the file on a
// line boundary (§3.3). It is called from the append critical section and never takes the lock itself.
function rotateUnlocked(root: string): void {
  const paths = notificationPaths(root)
  let lines: string[]
  try {
    lines = readFileSync(paths.log, 'utf-8').split('\n').filter(line => line.trim() !== '')
  } catch {
    return
  }
  const kept: string[] = []
  let bytes = 0
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]!
    if (kept.length >= NOTIFICATION_LIMITS.keep_events) break
    const size = Buffer.byteLength(line, 'utf8') + 1
    if (bytes + size > NOTIFICATION_LIMITS.keep_bytes && kept.length > 0) break
    kept.push(line)
    bytes += size
  }
  const text = kept.length > 0 ? `${kept.reverse().join('\n')}\n` : ''
  const tmp = `${paths.log}.tmp`
  writeFileSync(tmp, text, { encoding: 'utf-8', mode: 0o600 })
  renameSync(tmp, paths.log)
  const stat = statSync(paths.log)
  cacheByPath.set(paths.log, {
    dev: Number(stat.dev),
    ino: Number(stat.ino),
    size: Buffer.byteLength(text, 'utf8'),
    count: kept.length,
  })
}

function scanFileKeys(path: string): { count: number, keys: string[] } {
  let text: string
  try {
    text = readFileSync(path, 'utf-8')
  } catch {
    return { count: 0, keys: [] }
  }
  const lines = text.split('\n').filter(line => line.trim() !== '')
  const keys: string[] = []
  for (const line of lines) {
    const parsed = parseLine(line)
    if (parsed?.dedupe_key) keys.push(parsed.dedupe_key)
  }
  return { count: lines.length, keys }
}

interface DedupeEntry { key: string, seq: number }

function readDedupe(root: string): DedupeEntry[] {
  try {
    const parsed = JSON.parse(readFileSync(notificationPaths(root).dedupe, 'utf-8')) as { keys?: unknown }
    if (!Array.isArray(parsed.keys)) return []
    return parsed.keys
      .filter((entry): entry is DedupeEntry => typeof (entry as DedupeEntry)?.key === 'string')
      .map(entry => ({ key: entry.key, seq: typeof entry.seq === 'number' ? entry.seq : 0 }))
  } catch {
    return []
  }
}

function mergeKeys(existing: DedupeEntry[], fromFile: string[]): DedupeEntry[] {
  const merged = new Map(existing.map(entry => [entry.key, entry]))
  for (const key of fromFile) if (!merged.has(key)) merged.set(key, { key, seq: 0 })
  return [...merged.values()].slice(-NOTIFICATION_LIMITS.dedupe_keys)
}

function findEventByKey(root: string, key: string): NotificationEvent | null {
  const { events } = scanLog(root)
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index]!.dedupe_key === key) return events[index]!
  }
  return null
}

// `seq` comes from the file, the watermark and the counter: after a rotation dropped every old event the number
// must still grow, or the watermark would start matching old rows.
function nextSeq(root: string): number {
  const paths = notificationPaths(root)
  const fromFile = scanLog(root).latest
  const fromWatermark = readWatermark(root)
  let fromCounter = 0
  try {
    const parsed = Number.parseInt(readFileSync(paths.seq, 'utf-8').trim(), 10)
    if (Number.isFinite(parsed)) fromCounter = parsed
  } catch { /* first run */ }
  const next = Math.max(fromFile, fromWatermark, fromCounter) + 1
  writeFileSync(paths.seq, String(next), { encoding: 'utf-8', mode: 0o600 })
  return next
}

function atomicWriteJson(path: string, value: unknown, root: string): void {
  mkdirSync(root, { recursive: true })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(value), { encoding: 'utf-8', mode: 0o600 })
  renameSync(tmp, path)
}

// Test seam: the cache is process state, and a test that resets the registry must not inherit it.
export function resetNotificationCache(): void {
  cacheByPath.clear()
}
