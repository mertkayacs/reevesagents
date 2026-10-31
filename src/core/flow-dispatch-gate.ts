// The dispatch gate: one lock held for the whole act — verify, paste, settle.
//
// Why a second lock at all. The `pending` claim (`pending`/`op_id`, §2.4) keeps two tickers from
// pasting the same prompt, but it says nothing about an operator: `flow pause` and `flow stop` drop
// the claim on purpose, and a check-then-paste without mutual exclusion still lets one of them land
// between the check and the paste, so a flow the operator just stopped receives one more prompt.
//
// The runs lock cannot close that window either: `sendWhenIdle` takes the runs lock itself
// (`sendText` → `updateAgent`), and `withRunsLock` is not reentrant, so holding it across the send
// deadlocks and then steals the lock from the same process. So the act gets a lock of its own:
//
// - the runner takes the gate, re-checks its claim, pastes, settles, releases the gate;
// - `pause` and `stop` take the same gate before touching the flow, so they either land before the
//   claim check (the runner sees the claim gone and pastes nothing) or after the settle (there is
//   nothing left to cancel) — never in between;
// - nobody needs to wait long: a control command waits up to `DISPATCH_GATE_TIMEOUT_MS` for a paste
//   to finish, and answers a clear "a dispatch is in flight" instead of hanging when it cannot.
//
// Lock ordering, and the only rule that keeps this deadlock-free: **the gate first, the runs lock
// second**. No path here takes the runs lock and then waits for the gate — the runner writes the
// claim under the runs lock, releases it, and only then takes the gate, and reclamation takes the
// runs lock for a moment *before* the gate exists.
//
// Three properties make the file safe, and each one closes a failure a review named:
//
// 1. **A gate is never visible without its content** (round 9). Acquisition writes the owner to a
//    unique temp file and publishes it with `link`, which is atomic and fails with `EEXIST` when a
//    gate is already there. `open('wx')` followed by a write leaves a window in which the gate exists
//    and cannot be attributed to anybody — exactly the state a reclaimer must never see.
// 2. **A live holder is never reclaimed, whatever the file's age** (round 8). The recorded pid is
//    probed with `process.kill(pid, 0)`; only a definite `ESRCH` counts as gone, and the file must
//    also be older than `DISPATCH_GATE_STALE_MS`, so a recycled pid cannot make an old lock look dead.
//    A gate whose owner cannot be read at all is left for a human instead of guessed at.
// 3. **Reclamation is serialised by the runs lock, not by a lock of its own** (rounds 10–11). Every
//    attempt to write a second exclusion (a reclaim token, an identity tag, a rename-and-restore)
//    produced the same defect one level down: a check that a second waiter could invalidate before
//    the removal. The runs lock already exists, is already trusted for the state tree, and gives what
//    the takeover needs — one reclaimer at a time, so the judgement and the removal become a single
//    decision. While a reclaimer holds it, nobody else can judge or remove that gate, and no
//    publisher can put a fresh gate in its place: publication needs the name to be free, and only a
//    reclaimer frees it. An attempt that cannot get the runs lock simply skips this round.
//
// Release verifies its own token first, so a process that was reclaimed while it believed it held the
// gate cannot delete somebody else's file.

import { linkSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { stateRoot } from './state-path.js'
import { isRunsLockTimeout, withRunsLock } from './runs.js'

// How long a control command (or a runner) waits for the gate before giving up. A send is a paste
// plus a submit confirmation, so a few seconds; 15 s is generous without hiding a stuck process.
export const DISPATCH_GATE_TIMEOUT_MS = 15_000

// How old a lock must be before it may be reclaimed, *in addition* to its owner being gone. The age
// guard covers a recycled pid: a lock younger than this belongs to a process that has just started
// pasting, and waiting is always cheaper than taking a live gate away.
export const DISPATCH_GATE_STALE_MS = 60_000

// Mirrors the stale window `withRunsLock` applies to its own lock file. It is only used to skip a
// reclaim attempt cheaply instead of blocking inside `withRunsLock` for its whole deadline; the
// authoritative check stays inside that lock.
const RUNS_LOCK_WINDOW_MS = 5_000

export function dispatchGatePath(root = stateRoot()): string {
  return join(root, '.flow-dispatch.lock')
}

export interface GateOwner {
  pid: number
  token: string
  created_at: string
}

export type DispatchGateOutcome<T> =
  | { acquired: true, value: T }
  | { acquired: false }

export interface DispatchGateOptions {
  root?: string
  // Injected by tests and by a caller that would rather fail fast.
  timeoutMs?: number
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function readOwner(path: string): GateOwner | null {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as Partial<GateOwner>
    if (typeof parsed.pid !== 'number' || !Number.isFinite(parsed.pid)) return null
    return {
      pid: parsed.pid,
      token: typeof parsed.token === 'string' ? parsed.token : '',
      created_at: typeof parsed.created_at === 'string' ? parsed.created_at : '',
    }
  } catch {
    // Unreadable or not JSON: the owner cannot be identified, so it is treated as alive and the lock
    // is left alone. A human removes a damaged gate; guessing is how two holders appear.
    return null
  }
}

// Is the recorded pid still running? `kill(pid, 0)` is the only portable probe: `ESRCH` means gone,
// `EPERM` means alive but owned by another user, and an unparseable answer means "assume alive".
function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as { code?: string }).code !== 'ESRCH'
  }
}

function ageOf(path: string): number | null {
  try {
    return Date.now() - statSync(path).mtimeMs
  } catch {
    return null
  }
}

// Publish `mine` at `path` without ever exposing a gate that has no content: write a unique temp file
// holding the whole payload, then `link` it into place. `link` is atomic and fails with `EEXIST` when
// another process owns the gate, so exactly one publisher wins and the winner's file is complete.
function publish(path: string, mine: GateOwner): boolean {
  const temp = `${path}.owner.${process.pid}.${mine.token}`
  try {
    writeFileSync(temp, JSON.stringify(mine), { encoding: 'utf-8', mode: 0o600 })
    linkSync(temp, path)
    return true
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code === 'EEXIST') return false
    throw err
  } finally {
    try { unlinkSync(temp) } catch { /* the temp file was never created */ }
  }
}

// Can this lock be taken over? Both conditions, never one: a dead owner **and** an old file.
function reclaimable(path: string): boolean {
  const owner = readOwner(path)
  if (!owner || pidAlive(owner.pid)) return false
  const age = ageOf(path)
  return age !== null && age > DISPATCH_GATE_STALE_MS
}

// Is the runs lock currently held? A cheap peek that keeps the wait loop from spending five seconds
// inside `withRunsLock` on every spin; the decision itself is re-made under that lock.
function runsLockBusy(path: string): boolean {
  const age = ageOf(join(dirname(path), '.runs.lock'))
  return age !== null && age < RUNS_LOCK_WINDOW_MS
}

// Take over a gate whose owner is gone, serialised by the runs lock. Inside it the judgement and the
// removal are one decision: no second reclaimer can be here, and no publisher can fill the path while
// the dead file still occupies it.
function reclaim(path: string): void {
  if (runsLockBusy(path)) return
  try {
    withRunsLock(() => {
      if (!reclaimable(path)) return
      try { unlinkSync(path) } catch { /* another reclaimer already freed it */ }
    })
  } catch (err) {
    // Somebody is writing the state tree right now: skip this attempt, the next one will do it.
    if (!isRunsLockTimeout(err)) throw err
  }
}

// Run `fn` with the gate held. `acquired: false` means someone else held it for the whole timeout:
// the caller changed nothing and can answer "busy" honestly.
export function withDispatchGate<T>(fn: () => T, options: DispatchGateOptions = {}): DispatchGateOutcome<T> {
  const path = dispatchGatePath(options.root)
  const timeoutMs = options.timeoutMs ?? DISPATCH_GATE_TIMEOUT_MS
  mkdirSync(dirname(path), { recursive: true })
  const deadline = Date.now() + timeoutMs
  const mine: GateOwner = { pid: process.pid, token: randomUUID(), created_at: new Date().toISOString() }

  while (!publish(path, mine)) {
    // The path is taken: reclaim only a lock whose owner is provably gone and whose file is old,
    // then try to publish again.
    if (reclaimable(path)) reclaim(path)
    if (Date.now() > deadline) return { acquired: false }
    sleepSync(25)
  }

  try {
    return { acquired: true, value: fn() }
  } finally {
    // Only our own gate: if this process was reclaimed while it believed it held the lock, the file
    // at the path belongs to somebody else and deleting it would let a third process in.
    const owner = readOwner(path)
    if (owner?.token === mine.token) {
      try { unlinkSync(path) } catch { /* the gate is already gone */ }
    }
  }
}
