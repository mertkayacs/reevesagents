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
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { basename, dirname, join } from 'node:path'
import { stateRoot } from './state-path.js'
import { displayPath } from '../utils/paths.js'

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
  // The process-instance probe. A test uses it to describe a host where the probe gives nothing.
  instanceProbe?: InstanceProbe
}

interface Ticket {
  path: string
  pid: number
  token: string
  ts: number
  // The process instance behind `pid`; empty when this platform has no probe for it.
  instance: string
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

// `kill(pid, 0)` is the portable liveness probe: `ESRCH` means gone, `EPERM` means alive but owned by
// another user, and an unparseable answer means "assume alive" — a contender is never dropped on a
// guess.
function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as { code?: string }).code !== 'ESRCH'
  }
}

// The identity of one process *instance*, so a recycled pid cannot pass for its predecessor. Two
// probes, both of which answer with a value that never changes for a live process:
// - `linux:<starttime>` from `/proc/<pid>/stat` field 22 (clock ticks since boot);
// - `ps:<lstart>` from `ps -o lstart= -p <pid>`, which is what a host without `/proc` offers
//   (macOS, the BSDs). The tag is part of the value, so an entry written on one platform and read on
//   another is never mistaken for a different process — the tags simply do not compare.
// `null` means "this host cannot tell", and a caller must then treat the participant as alive.
const instanceCache = new Map<number, string | null>()

export type InstanceProbe = (_pid: number) => string | null

const defaultProbe: InstanceProbe = (pid) => {
  let found: string | null = null
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf-8')
    // `comm` may contain spaces and parentheses, so everything after the last ')' is the field list
    // starting at field 3 (state); starttime is field 22, i.e. index 19 from there.
    const start = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19]
    if (start && /^\d+$/.test(start)) found = `linux:${start}`
  } catch {
    // No /proc here: fall through to `ps`.
  }
  if (found === null) {
    try {
      const out = execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 2000,
      }).trim()
      if (out) found = `ps:${out}`
    } catch {
      // Neither probe answered: the caller falls back to the conservative answer.
    }
  }
  return found
}

function probeInstance(pid: number, probe: InstanceProbe): string | null {
  if (instanceCache.has(pid)) return instanceCache.get(pid) ?? null
  const found = probe(pid)
  instanceCache.set(pid, found)
  return found
}

// Is the participant that wrote `record` still running? A reused pid answers "alive" to
// `kill(pid, 0)` while its owner is long gone, so the instance has to match as well.
//
// Three cases, and the unidentifiable one matters most: an entry with no instance at all — written by
// a build that did not record one — cannot be judged, and guessing either way is wrong (treating it
// as alive blocks the gate for ever, treating it as dead admits a second holder). It is reported to
// the operator instead, who can see whether a dispatch is still running.
function participantAlive(record: { pid: number, instance: string }, path: string, probe: InstanceProbe): boolean {
  if (!pidAlive(record.pid)) return false
  if (!record.instance) {
    throw new Error(
      `gate file ${basename(path)} records no process instance (written by an older reevesagents);`
      + ` check that no dispatch is running, then remove ${displayPath(path)}`,
    )
  }
  const current = probeInstance(record.pid, probe)
  if (current === null) return true              // this host cannot tell: assume alive
  const sameProbe = current.split(':')[0] === record.instance.split(':')[0]
  if (!sameProbe) return true                    // different probe: nothing to compare
  return current === record.instance
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
function entries(root: string, kind: 'cand' | 'choosing', probe: InstanceProbe): Ticket[] {
  let names: string[]
  try {
    names = readdirSync(root)
  } catch (err) {
    // Not an empty field: entering here would race a contender this process cannot see. Refuse, and
    // name the directory home-shortened the way every other error does (§4.1).
    const code = (err as { code?: string }).code ?? 'unknown'
    throw new Error(
      `cannot read the state directory ${displayPath(root)} (${code}); the dispatch gate needs read access to it`,
      { cause: err },
    )
  }
  const found: Ticket[] = []
  for (const name of names) {
    if (!name.startsWith(`${PREFIX}.${kind}.`)) continue
    const path = join(root, name)
    let record: { pid?: unknown, token?: unknown, ts?: unknown, instance?: unknown }
    try {
      record = JSON.parse(readFileSync(path, 'utf-8')) as typeof record
    } catch {
      continue
    }
    if (typeof record.pid !== 'number' || !Number.isFinite(record.pid)) continue
    const token = typeof record.token === 'string' ? record.token : ''
    const ts = typeof record.ts === 'number' && Number.isFinite(record.ts) ? record.ts : 0
    const instance = typeof record.instance === 'string' ? record.instance : ''
    if (!participantAlive({ pid: record.pid, instance }, path, probe)) {
      // The owner is gone: the entry can never be consulted again, so collecting it is safe.
      try { unlinkSync(path) } catch { /* another contender collected it first */ }
      continue
    }
    found.push({ path, pid: record.pid, token, ts, instance })
  }
  return found
}

function liveTickets(root: string, probe: InstanceProbe): Ticket[] {
  return entries(root, 'cand', probe).sort((a, b) => a.ts - b.ts || a.pid - b.pid || a.token.localeCompare(b.token))
}

// Take the gate: publish a ticket, then wait until it is the smallest live one. Returns false when
// the deadline passes first — the ticket is withdrawn in that case, so a waiter never leaves a
// phantom contender behind.
function acquire(root: string, token: string, timeoutMs: number, probe: InstanceProbe): boolean {
  const deadline = Date.now() + timeoutMs
  const choosing = pathFor(root, 'choosing', process.pid, token)
  const ticket = pathFor(root, 'cand', process.pid, token)

  // Prove the field is readable before publishing anything into it: a directory this process cannot
  // list is not an empty field, and a marker written into one would be a leak nobody can read away.
  entries(root, 'cand', probe)

  // A bid has to carry an identity this host can verify later. Publishing an empty one would leave a
  // file that the next scan refuses as "written by an older reevesagents" — a self-inflicted, sticky
  // breakage (round 15) — so a host that cannot identify its own process instance does not bid at all.
  const instance = probeInstance(process.pid, probe)
  if (!instance) {
    throw new Error(
      'cannot identify this process instance (no /proc and no working ps), so the dispatch gate'
      + ' cannot tell a dead contender from a live one; nothing was dispatched',
    )
  }

  let held = false
  try {
    publish(choosing, { pid: process.pid, token, instance })
    const maxTs = liveTickets(root, probe).reduce((max, entry) => Math.max(max, entry.ts), 0)
    publish(ticket, { pid: process.pid, token, ts: maxTs + 1, instance })
    try { unlinkSync(choosing) } catch { /* the marker is ours; someone collected a stale one */ }

    while (true) {
      // A live chooser means "the ticket set is in flux": its ts is not visible yet, so any minimum
      // read now could be overtaken. Wait for it to publish or vanish.
      if (entries(root, 'choosing', probe).length > 0) {
        if (Date.now() > deadline) return withdraw(ticket)
        sleepSync(GATE_POLL_MS)
        continue
      }
      const tickets = liveTickets(root, probe)
      if (tickets.length === 0 || tickets[0]!.token === token) {
        held = true
        return true
      }
      if (Date.now() > deadline) return withdraw(ticket)
      sleepSync(GATE_POLL_MS)
    }
  } catch (err) {
    // Any failure — ours or one this process cannot judge — must not leave our own bid behind: a
    // leftover ticket would be the next scan's problem, for ever.
    if (!held) {
      try { unlinkSync(choosing) } catch { /* nothing to remove */ }
      try { unlinkSync(ticket) } catch { /* nothing to remove */ }
    }
    throw err
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
  const probe = options.instanceProbe ?? defaultProbe
  // One probe per pid per acquisition: the answer is stable for a live process, and re-asking on
  // every 25 ms poll would spawn `ps` forty times a second on hosts without /proc.
  instanceCache.clear()

  if (!acquire(root, token, options.timeoutMs ?? DISPATCH_GATE_TIMEOUT_MS, probe)) return { acquired: false }

  try {
    return { acquired: true, value: fn() }
  } finally {
    // Only our own ticket: it is the one name this call created, so releasing cannot touch anybody
    // else's claim to the gate.
    try { unlinkSync(pathFor(root, 'cand', process.pid, token)) } catch { /* already collected */ }
  }
}
