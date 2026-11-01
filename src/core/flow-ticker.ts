// The autonomous tick: who advances a flow when nobody types `flow tick`.
//
// The engine stays a pure function — `stepFlow` knows nothing about timers — and this module is the smallest
// possible surface-side driver: one step per flow per pass, for the flows that can actually move. Both the Web UI
// server loop and the `flow tick --all` CLI path call it, so a dashboard and a cron job advance flows the same way,
// and the existing claim/op_id protocol is what keeps them from pasting the same prompt twice.
//
// Two rules from the block's brief, both encoded here:
//
// - **a parked or closed flow is not ticked.** `paused`, `orphaned`, `done` are the operator's states; touching
//   them would resurrect a pipeline somebody stopped on purpose.
// - **an unchanged flow costs nothing.** `stepFlow` returns `skipped` for a hold that repeats itself, and the
//   journal entry is deduplicated there, so a minute-by-minute driver does not fill the log with "still waiting".

import { listFlowFiles, readFlow } from './flow-store.js'
import type { FlowPorts, FlowStepResult } from './flow-runner.js'
import { stepFlow } from './flow-runner.js'
import type { FlowStatus } from './flow.js'

// The states a tick may touch. `idle`, `fixing` and `reviewing` are the moving ones; everything else is either a
// human decision (`paused`, `orphaned`, `escalated`) or the end (`done`).
const TICKABLE: readonly FlowStatus[] = ['idle', 'fixing', 'reviewing']

export interface TickAllResult {
  // Runs whose flow took a decision that changed something.
  advanced: { run_id: string, status: string, reason: string }[]
  // Runs that were looked at and left alone (a hold), with the reason.
  held: { run_id: string, status: string, reason: string }[]
  // Runs whose flow was not ticked at all (parked, closed, unreadable).
  skipped: { run_id: string, why: string }[]
}

export interface TickAllOptions {
  // Registry root; defaults to the live one.
  root?: string
  // Passed through to `stepFlow` (a test or a `--dry-run` uses it).
  dryRun?: boolean
  now?: number
  at?: string
  // Test seam: the pane/git side of a step, so a test can drive a whole plan through the ticker without tmux.
  ports?: FlowPorts
}

// One pass over every flow. Synchronous on purpose: the Web UI loop and the CLI both want "advance what can be
// advanced, then return" — a promise here would let two passes overlap and re-do the same work.
export function tickAllFlows(options: TickAllOptions = {}): TickAllResult {
  const result: TickAllResult = { advanced: [], held: [], skipped: [] }
  for (const file of listFlowFiles(options.root)) {
    let state
    try {
      state = readFlow(file.run_id, { root: options.root })
    } catch {
      result.skipped.push({ run_id: file.run_id, why: 'state unreadable' })
      continue
    }
    if (!TICKABLE.includes(state.state)) {
      result.skipped.push({ run_id: file.run_id, why: state.state })
      continue
    }
    let step: FlowStepResult
    try {
      step = stepFlow(file.run_id, {
        root: options.root,
        dryRun: options.dryRun,
        ...(options.now === undefined ? {} : { now: options.now }),
        ...(options.at === undefined ? {} : { at: options.at }),
        ...(options.ports === undefined ? {} : { ports: options.ports }),
      })
    } catch (err) {
      // One broken flow must not stop the pass: the others are still waiting for their turn.
      result.skipped.push({ run_id: file.run_id, why: err instanceof Error ? err.message : String(err) })
      continue
    }
    const entry = { run_id: file.run_id, status: step.status, reason: step.decision.reason }
    if (step.status === 'applied' || step.status === 'unconfirmed') result.advanced.push(entry)
    else result.held.push(entry)
  }
  return result
}

// Does this flow deserve a tick in the next pass? Used by a surface that keeps its own per-flow schedule; the
// brief's rule is "not more often than `flow_tick_ms`", and a flow that is parked or closed never qualifies.
export function shouldTick(state: { state: FlowStatus }, lastTickAt: number | null, tickMs: number, now = Date.now()): boolean {
  if (tickMs <= 0) return false
  if (!TICKABLE.includes(state.state)) return false
  if (lastTickAt === null) return true
  return now - lastTickAt >= tickMs
}
