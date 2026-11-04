// The autonomous tick: who advances a flow when nobody types `flow tick`.
//
// The engine stays a pure function — `stepFlow` knows nothing about timers — and this module is the smallest
// possible driver-side entry point: one step per flow per pass, for the flows that can actually move. There is
// exactly one caller on purpose, an external scheduler running `flow tick --all` (`reeves-flow-tick.timer`, cron):
// a second, surface-side timer used to live in the Web UI, which meant the automatic run of work died with the
// browser tab while a systemd timer kept ticking, and the two could race a dispatch (block 68). Every pass leaves a
// receipt (`tick-status.json`) instead, so a surface reports the driver instead of guessing at a setting.
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
import { writeTickStatus } from './tick-status.js'
import { reconcileFlowIncidents } from './flow-incidents.js'

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
  // A pass can include many flows, but a single interactive send can spend up to the pane's settle window. Letting
  // every run send in one sweep made the systemd service time out halfway through a claimed dispatch. The remaining
  // flows are still observed in dry-run mode and wait for the next minute's pass.
  let sendUsed = false
  for (const file of listFlowFiles(options.root)) {
    let state
    try {
      state = readFlow(file.run_id, { root: options.root })
    } catch {
      result.skipped.push({ run_id: file.run_id, why: 'state unreadable' })
      continue
    }
    if (!TICKABLE.includes(state.state)) {
      if (options.dryRun !== true) {
        try {
          reconcileFlowIncidents(state, undefined, undefined, {
            root: options.root,
            ...(options.now === undefined ? {} : { now: options.now }),
            ...(options.at === undefined ? {} : { at: options.at }),
          })
        } catch {
          // An incident delivery failure must not make a parked flow advance or block the rest of the sweep.
        }
      }
      result.skipped.push({ run_id: file.run_id, why: state.state })
      continue
    }
    let step: FlowStepResult
    try {
      step = stepFlow(file.run_id, {
        root: options.root,
        dryRun: options.dryRun === true || sendUsed,
        ...(options.now === undefined ? {} : { now: options.now }),
        ...(options.at === undefined ? {} : { at: options.at }),
        ...(options.ports === undefined ? {} : { ports: options.ports }),
      })
    } catch (err) {
      // One broken flow must not stop the pass: the others are still waiting for their turn.
      result.skipped.push({ run_id: file.run_id, why: err instanceof Error ? err.message : String(err) })
      continue
    }
    if (step.send !== undefined) sendUsed = true
    const entry = { run_id: file.run_id, status: step.status, reason: step.decision.reason }
    if (options.dryRun !== true && sendUsed && step.send === undefined && result.advanced.length + result.held.length > 0) {
      result.held.push({ run_id: file.run_id, status: step.decision.next_state, reason: 'pass_send_limit' })
      continue
    }
    if (step.status === 'applied' || step.status === 'unconfirmed') result.advanced.push(entry)
    else result.held.push(entry)
  }
  // The receipt of a real pass, so `flow status` and the panel can name the driver from a fact. `--dry-run` writes
  // nothing: it asks what a pass would do, and a receipt for work that never happened is the lie this file exists to
  // end (block 68). A state directory that cannot be written does not fail the pass that just moved the flows.
  if (options.dryRun !== true) {
    writeTickStatus('all', {
      advanced: result.advanced.length,
      held: result.held.length,
      skipped: result.skipped.length,
    }, {
      ...(options.root === undefined ? {} : { root: options.root }),
      ...(options.at === undefined ? {} : { at: options.at }),
    })
  }
  return result
}
