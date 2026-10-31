// Flow commands: `flow status` and `flow tick`.
//
// `status` is read-only and is the one place a human reads the pipeline without opening a JSON
// file. `tick` runs one engine step: it observes, decides, and — unless `--dry-run` — applies the
// decision through the guarded send path. A payload never carries the review prompt or a raw
// absolute home path (§4.1 of docs/flows-design.md): paths print home-shortened and the log detail
// goes through the secret redactor.

import type { Command } from 'commander'
import type { FlowState } from '../../core/flow.js'
import { FlowStateError } from '../../core/flow.js'
import { flowPath, listFlowFiles, readFlow } from '../../core/flow-store.js'
import type { FlowStepResult } from '../../core/flow-runner.js'
import { stepFlow } from '../../core/flow-runner.js'
import { redactSecrets } from '../../core/redact.js'
import { shortHomePath } from '../../utils/paths.js'

// A run id is what a flow is keyed by. Flows of archived runs must still resolve, so this reads
// the flow directory rather than the live run registry.
function resolveFlowId(input: string): string {
  const files = listFlowFiles()
  const exact = files.find(file => file.run_id === input)
  if (exact) return exact.run_id
  const matches = files.filter(file => file.run_id.startsWith(input))
  if (matches.length === 1) return matches[0]!.run_id
  if (matches.length > 1) throw new FlowStateError(`ambiguous run id: ${matches.map(file => file.run_id).join(', ')}`)
  throw new FlowStateError(`no flow for run ${input}`)
}

function pendingSpecs(state: FlowState): FlowState['specs'] {
  return state.specs.filter(spec => !state.dispatched_specs.includes(spec.id))
}

function flowPayload(state: FlowState, path: string) {
  return {
    schema_version: state.schema_version,
    run_id: state.run_id,
    state: state.state,
    rounds: state.rounds,
    max_rounds: state.max_rounds,
    review_started_at: state.review_started_at,
    review_timeout_sec: state.review_timeout_sec,
    head: state.claim.head,
    claim: {
      head: state.claim.head,
      verdict: state.claim.verdict,
      verdict_count: state.claim.verdict_count,
    },
    queue: pendingSpecs(state).map(spec => ({ id: spec.id, title: spec.title })),
    dispatched_specs: state.dispatched_specs,
    repo: shortHomePath(state.repo),
    updated_at: state.updated_at,
    log: state.log.slice(-5).map(entry => ({
      at: entry.at,
      event: entry.event,
      detail: redactSecrets(entry.detail),
    })),
    path: shortHomePath(path),
  }
}

function tickPayload(result: FlowStepResult, dryRun: boolean) {
  const { decision } = result
  return {
    dry_run: dryRun,
    status: result.status,
    decision: {
      kind: decision.kind,
      reason: decision.reason,
      next_state: decision.next_state,
      next_rounds: decision.next_rounds,
      target: decision.target ?? null,
      head: decision.head ?? null,
      spec_id: decision.spec_id ?? null,
      // The message is summarised, never dumped: it can embed a reviewer's remarks.
      message: decision.message
        ? { lines: decision.message.split('\n').length, chars: decision.message.length }
        : null,
    },
    send: result.send ?? null,
    observations: {
      head: result.observations.head,
      tree_clean: result.observations.tree_clean,
      dev_pane: result.observations.dev_pane,
      review_pane: result.observations.review_pane,
      verdict: result.observations.verdict,
      verdict_count: result.observations.verdict_count,
    },
    state: result.path ? flowPayload(result.state, result.path) : flowPayload(result.state, flowPath(result.state.run_id)),
  }
}

function printStatus(state: FlowState, path: string): void {
  const head = state.claim.head ? state.claim.head.slice(0, 12) : '(none)'
  const verdict = state.claim.verdict ?? 'none'
  const last = state.log.at(-1)
  console.log(`flow      ${state.run_id}`)
  console.log(`state     ${state.state}  round ${state.rounds}/${state.max_rounds}`)
  console.log(`head      ${head}`)
  console.log(`verdict   ${verdict}  (baseline ${state.claim.verdict_count} in the reviewer pane)`)
  const review = state.review_started_at === null
    ? 'not waiting'
    : `started ${new Date(state.review_started_at).toISOString()}, timeout ${state.review_timeout_sec}s`
  console.log(`review    ${review}`)
  console.log(`queue     ${pendingSpecs(state).length} pending, ${state.dispatched_specs.length} dispatched`)
  console.log(`repo      ${shortHomePath(state.repo)}`)
  console.log(`updated   ${state.updated_at}`)
  console.log(`last      ${last ? `${last.event} ${redactSecrets(last.detail)}` : '(no events)'}`)
  console.log(`file      ${shortHomePath(path)}`)
}

function printTick(result: FlowStepResult, dryRun: boolean): void {
  const { decision } = result
  const target = decision.target ? ` -> ${decision.target}` : ''
  console.log(`decision  ${decision.kind}${target}`)
  console.log(`reason    ${decision.reason}`)
  if (decision.head) console.log(`head      ${decision.head.slice(0, 12)}`)
  if (decision.spec_id) console.log(`block     ${decision.spec_id}`)
  if (result.send) {
    console.log(`send      ${result.send.sent ? 'confirmed' : `refused (${result.send.reason})`}`)
  }
  if (dryRun) {
    console.log('dry run   nothing sent, nothing written')
    return
  }
  console.log(`result    ${result.status}`)
  console.log(`state     ${result.state.state}  round ${result.state.rounds}/${result.state.max_rounds}`)
  if (result.path) console.log(`file      ${shortHomePath(result.path)}`)
}

function fail(err: unknown): never {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
}

export function registerFlow(program: Command): void {
  const flow = program
    .command('flow')
    .description('dev -> review -> fix pipeline for a run (status, tick)')

  flow
    .command('status')
    .description('show the flow attached to a run')
    .requiredOption('--run <id>', 'run id (a unique prefix is accepted)')
    .option('--json', 'output JSON')
    .action((opts: { run: string, json?: boolean }) => {
      try {
        const runId = resolveFlowId(opts.run)
        const path = flowPath(runId)
        const state = readFlow(runId)
        if (opts.json) {
          console.log(JSON.stringify(flowPayload(state, path), null, 2))
          return
        }
        printStatus(state, path)
      } catch (err) {
        fail(err)
      }
    })

  flow
    .command('tick')
    .description('run one engine step: observe, decide, and apply unless --dry-run')
    .requiredOption('--run <id>', 'run id (a unique prefix is accepted)')
    .option('--json', 'output JSON')
    .option('--dry-run', 'print the decision; send nothing and write nothing')
    .action((opts: { run: string, json?: boolean, dryRun?: boolean }) => {
      try {
        const runId = resolveFlowId(opts.run)
        const state = readFlow(runId)
        const dryRun = opts.dryRun === true
        const result = stepFlow(state, { dryRun })
        if (opts.json) {
          console.log(JSON.stringify(tickPayload(result, dryRun), null, 2))
        } else {
          printTick(result, dryRun)
        }
        // An unconfirmed dispatch needs a human: it is the one outcome a clean exit would hide.
        if (!dryRun && result.status === 'unconfirmed') process.exitCode = 1
      } catch (err) {
        fail(err)
      }
    })
}
