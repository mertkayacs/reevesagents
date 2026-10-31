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

import { closeSync, mkdirSync, openSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { stateRoot } from './state-path.js'

// How long a control command (or a runner) waits for the gate before giving up. A send is a paste
// plus a submit confirmation, so a few seconds; 15 s is generous without hiding a stuck process.
export const DISPATCH_GATE_TIMEOUT_MS = 15_000

// A gate older than this belongs to a process that died mid-paste. It is far longer than any send,
// so a live paste is never broken out from under itself — the runs lock's 5 s would be too eager
// here, because a send legitimately takes longer than that.
export const DISPATCH_GATE_STALE_MS = 60_000

export function dispatchGatePath(root = stateRoot()): string {
  return join(root, '.flow-dispatch.lock')
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

// Run `fn` with the gate held. `acquired: false` means someone else held it for the whole timeout:
// the caller changed nothing and can answer "busy" honestly.
export function withDispatchGate<T>(fn: () => T, options: DispatchGateOptions = {}): DispatchGateOutcome<T> {
  const path = dispatchGatePath(options.root)
  const timeoutMs = options.timeoutMs ?? DISPATCH_GATE_TIMEOUT_MS
  mkdirSync(dirname(path), { recursive: true })
  const deadline = Date.now() + timeoutMs

  while (true) {
    try {
      const fd = openSync(path, 'wx', 0o600)
      try {
        writeFileSync(fd, JSON.stringify({ pid: process.pid, created_at: new Date().toISOString() }))
      } finally {
        closeSync(fd)
      }
      break
    } catch (err) {
      if ((err as { code?: string }).code !== 'EEXIST') throw err
      try {
        if (Date.now() - statSync(path).mtimeMs > DISPATCH_GATE_STALE_MS) unlinkSync(path)
      } catch {
        // the gate disappeared between attempts
      }
      if (Date.now() > deadline) return { acquired: false }
      sleepSync(25)
    }
  }

  try {
    return { acquired: true, value: fn() }
  } finally {
    try { unlinkSync(path) } catch { /* the gate is already gone */ }
  }
}
