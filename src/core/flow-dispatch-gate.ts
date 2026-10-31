// The dispatch gate: the mutual exclusion held for the whole act — verify, paste, settle.
//
// Why a second lock at all. The `pending` claim (`pending`/`op_id`, §2.4) keeps two tickers from
// pasting the same prompt, but it says nothing about an operator: `flow pause` and `flow stop` drop
// the claim on purpose, and a check-then-paste without mutual exclusion still lets one of them land
// between the check and the paste, so a flow the operator just stopped receives one more prompt.
//
// The runs lock cannot do this job either: `sendWhenIdle` takes the runs lock itself
// (`sendText` → `updateAgent`), and `withRunsLock` is not reentrant, so holding it across the send
// deadlocks and then steals the lock from the same process. So the act gets a gate of its own:
//
// - the runner takes the gate, re-checks its claim, pastes, settles, releases the gate;
// - `pause` and `stop` take the same gate before touching the flow, so they either land before the
//   claim check (the runner sees the claim gone and pastes nothing) or after the settle (there is
//   nothing left to cancel) — never in between;
// - nobody needs to wait long: a control command waits up to `DISPATCH_GATE_TIMEOUT_MS` for a paste
//   to finish, and answers a clear "a dispatch is in flight" instead of hanging when it cannot.
//
// Why it is not "one lock file plus a takeover" (rounds 8–12). A single file has to be removed to be
// taken over, and POSIX has no conditional removal: every takeover — stat-then-unlink, rename the
// stale file aside, a token keyed by inode, an age-cleared or pid-checked token, a takeover
// serialised by another lock that itself expires by age — leaves the same defect one level down. A
// check that a second process can invalidate before the removal. The gate therefore never removes
// anybody else's file: it uses Lamport's bakery.
//
// - Every contender publishes a **ticket** (`<state>/.flow-dispatch.cand.<pid>.<token>`, written to a
//   temp file and renamed into place, so a reader never sees half of it) whose `ts` is one more than
//   the largest ticket it can see.
// - Before that it raises a **choosing** marker (`<state>/.flow-dispatch.choosing.<pid>.<token>`), so
//   nobody computes "the minimum" while a ticket is being selected. Waiters treat a live marker as
//   "come back in a moment".
// - A contender enters when it is the smallest live `(ts, pid, token)` and no live marker exists.
//   Between that check and its entry nobody can obtain a smaller ticket: a chooser would pick a
//   larger `ts`, and a plain contender would see this ticket and wait.
// - A participant that dies leaves its files behind; they are ignored the moment its pid is gone
//   (`process.kill(pid, 0)` → `ESRCH`), and any contender may delete them — a dead participant can
//   neither read nor be waited on again, so collecting its file is the one removal that needs no
//   coordination. Nothing else is ever deleted by someone who did not create it.
//
// Lock ordering stays one-way: **nothing waits for the gate while holding the runs lock.** The runner
// writes its claim under the runs lock, releases it, and only then takes the gate; a control command
// takes the gate first and the runs lock inside it.

import { mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { stateRoot } from './state-path.js'

// How long a control command (or a runner) waits for the gate before giving up. A send is a paste
// plus a submit confirmation, so a few seconds; 15 s is generous without hiding a stuck process.
export const DISPATCH_GATE_TIMEOUT_MS = 15_000

// Poll interval while waiting for the gate. Small enough to be invisible next to a paste.
const GATE_POLL_MS = 25

const PREFIX = '.flow-dispatch'

export function gateCandidatesPath(root = stateRoot()): string {
  return join(root, PREFIX)
}

export type DispatchGateOutcome<T> =
  | { acquired: true, value: T }
  | { acquired: false }

export interface DispatchGateOptions {
  root?: string
  // Injected by tests and by a caller that would rather fail fast.
  timeoutMs?: number
}

interface Ticket {
  path: string
  pid: number
  token: string
  ts: number
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

// `kill(pid, 0)` is the only portable liveness probe: `ESRCH` means gone, `EPERM` means alive but
// owned by another user, and an unparseable answer means "assume alive" — a contender is never
// dropped on a guess.
function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as { code?: string }).code !== 'ESRCH'
  }
}

// Publish `data` under `path` with a rename, so a reader never observes a partially written file.
function publish(path: string, data: Record<string, unknown>): void {
  const temp = `${path}.tmp.${randomUUID()}`
  writeFileSync(temp, JSON.stringify(data), { encoding: 'utf-8', mode: 0o600 })
  try {
    renameSync(temp, path)
  } catch (err) {
    try { unlinkSync(temp) } catch { /* the temp file is already gone */ }
    throw err
  }
}

function pathFor(root: string, kind: 'cand' | 'choosing', pid: number, token: string): string {
  return join(root, `${PREFIX}.${kind}.${pid}.${token}`)
}

// Every readable entry of one kind. A file that cannot be parsed is skipped: tickets and markers are
// published with a rename, so a half-written one is not something this process wrote. Entries whose
// owner is gone are collected here — see the header for why that removal needs no coordination.
function entries(root: string, kind: 'cand' | 'choosing'): Ticket[] {
  let names: string[]
  try {
    names = readdirSync(root)
  } catch {
    return []
  }
  const found: Ticket[] = []
  for (const name of names) {
    if (!name.startsWith(`${PREFIX}.${kind}.`)) continue
    const path = join(root, name)
    let record: { pid?: unknown, token?: unknown, ts?: unknown }
    try {
      record = JSON.parse(readFileSync(path, 'utf-8')) as typeof record
    } catch {
      continue
    }
    if (typeof record.pid !== 'number' || !Number.isFinite(record.pid)) continue
    const token = typeof record.token === 'string' ? record.token : ''
    const ts = typeof record.ts === 'number' && Number.isFinite(record.ts) ? record.ts : 0
    if (!pidAlive(record.pid)) {
      // The owner is gone: the entry can never be consulted again, so collecting it is safe.
      try { unlinkSync(path) } catch { /* another contender collected it first */ }
      continue
    }
    found.push({ path, pid: record.pid, token, ts })
  }
  return found
}

function liveTickets(root: string): Ticket[] {
  return entries(root, 'cand').sort((a, b) => a.ts - b.ts || a.pid - b.pid || a.token.localeCompare(b.token))
}

// Take the gate: publish a ticket, then wait until it is the smallest live one. Returns false when
// the deadline passes first — the ticket is withdrawn in that case, so a waiter never leaves a
// phantom contender behind.
function acquire(root: string, token: string, timeoutMs: number): boolean {
  const deadline = Date.now() + timeoutMs
  const choosing = pathFor(root, 'choosing', process.pid, token)
  const ticket = pathFor(root, 'cand', process.pid, token)

  publish(choosing, { pid: process.pid, token })
  const maxTs = liveTickets(root).reduce((max, entry) => Math.max(max, entry.ts), 0)
  publish(ticket, { pid: process.pid, token, ts: maxTs + 1 })
  try { unlinkSync(choosing) } catch { /* the marker is ours; someone collected a stale one */ }

  while (true) {
    // A live chooser means "the ticket set is in flux": its ts is not visible yet, so any minimum
    // read now could be overtaken. Wait for it to publish or vanish.
    if (entries(root, 'choosing').length > 0) {
      if (Date.now() > deadline) return withdraw(ticket)
      sleepSync(GATE_POLL_MS)
      continue
    }
    const tickets = liveTickets(root)
    if (tickets.length === 0 || tickets[0]!.token === token) return true
    if (Date.now() > deadline) return withdraw(ticket)
    sleepSync(GATE_POLL_MS)
  }
}

function withdraw(ticket: string): boolean {
  try { unlinkSync(ticket) } catch { /* already gone */ }
  return false
}

// Run `fn` with the gate held. `acquired: false` means someone else held it for the whole timeout:
// the caller changed nothing and can answer "busy" honestly.
export function withDispatchGate<T>(fn: () => T, options: DispatchGateOptions = {}): DispatchGateOutcome<T> {
  const root = options.root ?? stateRoot()
  mkdirSync(dirname(gateCandidatesPath(root)), { recursive: true })
  const token = randomUUID()

  if (!acquire(root, token, options.timeoutMs ?? DISPATCH_GATE_TIMEOUT_MS)) return { acquired: false }

  try {
    return { acquired: true, value: fn() }
  } finally {
    // Only our own ticket: it is the one name this call created, so releasing cannot touch anybody
    // else's claim to the gate.
    try { unlinkSync(pathFor(root, 'cand', process.pid, token)) } catch { /* already collected */ }
  }
}
