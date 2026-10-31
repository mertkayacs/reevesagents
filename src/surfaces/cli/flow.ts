// Flow commands: `flow start`, `flow status` and `flow tick`.
//
// `start` is the only way to create a flow (a run with a flow file is what `status` and `tick`
// address); `status` is read-only and is the one place a human reads the pipeline without opening a
// JSON file; `tick` runs one engine step: it observes, decides, and — unless `--dry-run` — claims,
// sends and settles. A payload never carries the review prompt or a raw absolute home path (§4.1 of
// docs/flows-design.md): paths print home-shortened and the log detail goes through the secret
// redactor.

import type { Command } from 'commander'
import type { FlowState } from '../../core/flow.js'
import { flowPath, readFlow } from '../../core/flow-store.js'
import { flowStatusPayload, resolveFlowRunId } from '../../core/flow-view.js'
import type { FlowStepResult } from '../../core/flow-runner.js'
import { stepFlow } from '../../core/flow-runner.js'
import { startFlow } from '../../core/flow-start.js'
import { redactSecrets } from '../../core/redact.js'
import { shortHomePath } from '../../utils/paths.js'

// The payload and the id resolution are shared with the MCP tools, so a host CLI and
// `flow status --json` cannot show different things: both come from core/flow-view.ts.
function pendingCount(state: FlowState): number {
  return state.specs.filter(spec => !state.dispatched_specs.includes(spec.id)).length
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
    state: result.path ? flowStatusPayload(result.state, result.path) : flowStatusPayload(result.state, flowPath(result.state.run_id)),
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
  if (state.pending) {
    console.log(`dispatch  ${state.pending.kind} -> ${state.pending.target} claimed, unsettled (${state.pending.op_id})`)
  }
  const review = state.review_started_at === null
    ? 'not waiting'
    : `started ${new Date(state.review_started_at).toISOString()}, timeout ${state.review_timeout_sec}s`
  console.log(`review    ${review}`)
  console.log(`queue     ${pendingCount(state)} pending, ${state.dispatched_specs.length} dispatched`)
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
  if (result.status === 'locked') {
    console.log('result    locked — another reevesagents process is writing the state directory; nothing was sent')
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
    .description('dev -> review -> fix pipeline for a run (start, status, tick)')

  flow
    .command('start')
    .description('attach a flow to an existing run: the dev agent, the review agent and the repo')
    .requiredOption('--run <id>', 'run id (a unique prefix is accepted)')
    .requiredOption('--dev <agent>', 'dev agent id or nickname inside that run')
    .requiredOption('--review <agent>', 'review agent id or nickname inside that run')
    .option('--repo <dir>', 'project directory (defaults to the run working directory)')
    .option('--spec <file...>', 'block spec files to queue on the new flow')
    .option('--max-rounds <n>', 'fix rounds before the flow escalates', (value: string) => Number(value))
    .option('--review-timeout <sec>', 'seconds a requested review may stay unanswered', (value: string) => Number(value))
    .option('--replace', 'start over on a run whose flow is escalated or done')
    .option('--json', 'output JSON')
    .action((opts: {
      run: string
      dev: string
      review: string
      repo?: string
      spec?: string[]
      maxRounds?: number
      reviewTimeout?: number
      replace?: boolean
      json?: boolean
    }) => {
      try {
        const started = startFlow({
          run_id: opts.run,
          dev: opts.dev,
          review: opts.review,
          repo: opts.repo,
          specs: opts.spec,
          max_rounds: opts.maxRounds,
          review_timeout_sec: opts.reviewTimeout,
          replace: opts.replace === true,
        })
        if (opts.json) {
          console.log(JSON.stringify(flowStatusPayload(started.state, started.path), null, 2))
          return
        }
        console.log(`flow      ${started.state.run_id}${started.replaced ? ' (replaced the closed one)' : ''}`)
        console.log(`roles     dev ${started.state.roles.dev} -> review ${started.state.roles.review}`)
        console.log(`head      ${started.state.claim.head.slice(0, 12)}  (a review is requested for the next commit)`)
        console.log(`queue     ${pendingCount(started.state)} pending`)
        console.log(`repo      ${shortHomePath(started.state.repo)}`)
        console.log(`file      ${shortHomePath(started.path)}`)
        console.log('next      `flow tick --run <id>` moves it; nothing ticks a flow on its own')
      } catch (err) {
        fail(err)
      }
    })

  flow
    .command('status')
    .description('show the flow attached to a run')
    .requiredOption('--run <id>', 'run id (a unique prefix is accepted)')
    .option('--json', 'output JSON')
    .action((opts: { run: string, json?: boolean }) => {
      try {
        const runId = resolveFlowRunId(opts.run)
        const path = flowPath(runId)
        const state = readFlow(runId)
        if (opts.json) {
          console.log(JSON.stringify(flowStatusPayload(state, path), null, 2))
          return
        }
        printStatus(state, path)
      } catch (err) {
        fail(err)
      }
    })

  flow
    .command('tick')
    .description('run one engine step: observe, decide, claim, send and settle unless --dry-run')
    .requiredOption('--run <id>', 'run id (a unique prefix is accepted)')
    .option('--json', 'output JSON')
    .option('--dry-run', 'print the decision; send nothing and write nothing')
    .action((opts: { run: string, json?: boolean, dryRun?: boolean }) => {
      try {
        const runId = resolveFlowRunId(opts.run)
        const dryRun = opts.dryRun === true
        const result = stepFlow(runId, { dryRun })
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
