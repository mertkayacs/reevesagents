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
// claim under the runs lock, releases it, and only then takes the gate.
//
// Reclaiming a lock left behind by a dead process (review round 8). A file lock can only be taken
// over by removing the stale file, and "stat then unlink" is a use-after-check bug: two waiters can
// both decide an expired lock is dead, the first one reclaims it and acquires a fresh gate, and the
// second one then unlinks *that fresh gate* and enters as well. Two rules remove it:
//
// 1. **A live holder is never reclaimed, whatever its age.** The recorded pid is probed with
//    `process.kill(pid, 0)` first; anything but a definite `ESRCH` keeps the lock where it is. Age
//    alone proves nothing — a slow paste is older than the window and still alive.
// 2. **Reclamation moves the file it judged; it never unlinks the path.** `rename` is the
//    compare-and-swap here: of two waiters that both saw the dead lock only one can move it (the
//    other gets `ENOENT`), and a fresh gate that appears at the path afterwards is never touched by
//    the loser. The winner deletes the file it moved, and only after re-reading the moved copy and
//    confirming its owner is still gone.
//
// Release verifies its own token first, so a process that was reclaimed while it believed it held
// the gate cannot delete somebody else's.

import { closeSync, linkSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { stateRoot } from './state-path.js'

// How long a control command (or a runner) waits for the gate before giving up. A send is a paste
// plus a submit confirmation, so a few seconds; 15 s is generous without hiding a stuck process.
export const DISPATCH_GATE_TIMEOUT_MS = 15_000

// How old a lock must be before it may be reclaimed, *in addition* to its owner being gone. The age
// guard covers a recycled pid: a lock younger than this belongs to a process that has just started
// pasting, and waiting is always cheaper than taking a live gate away.
export const DISPATCH_GATE_STALE_MS = 60_000

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

// Can this lock be taken over? Both conditions, never one: a dead owner **and** an old file.
function reclaimable(path: string): boolean {
  const owner = readOwner(path)
  if (!owner || pidAlive(owner.pid)) return false
  try {
    return Date.now() - statSync(path).mtimeMs > DISPATCH_GATE_STALE_MS
  } catch {
    return false
  }
}

// Move a dead owner's gate aside and delete exactly that file. The caller's loop simply tries
// `open(..., 'wx')` again whether this call won or lost.
function reclaim(path: string): void {
  const moved = `${path}.dead.${process.pid}.${randomUUID()}`
  try {
    renameSync(path, moved)
  } catch {
    // ENOENT: another waiter moved it first, which is exactly what rename is here for.
    return
  }
  try {
    const owner = readOwner(moved)
    if (owner && pidAlive(owner.pid)) {
      // The file turned out to belong to a live process (our judgement came from a stale read). Put
      // it back without clobbering anything that appeared meanwhile.
      try {
        linkSync(moved, path)
      } catch {
        // A newer gate owns the path now; the owner we moved will find its token gone on release
        // and therefore will not delete that newer gate.
      }
      unlinkSync(moved)
      return
    }
    unlinkSync(moved)
  } catch {
    // The moved file vanished under us: nothing to clean up.
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

  while (true) {
    try {
      const fd = openSync(path, 'wx', 0o600)
      try {
        writeFileSync(fd, JSON.stringify(mine))
      } finally {
        closeSync(fd)
      }
      break
    } catch (err) {
      if ((err as { code?: string }).code !== 'EEXIST') throw err
    }
    // The path is taken: reclaim only a lock whose owner is provably gone, then try again.
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
