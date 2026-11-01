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
import { addFlowSpecs, pauseFlow, resumeFlow, stopFlow } from '../../core/flow-control.js'
import type { NotesCounts } from '../../core/flow-notes.js'
import { listNotesHeads, readNotesRound } from '../../core/flow-notes.js'
import { redactSecrets } from '../../core/redact.js'
import { shortHomePath } from '../../utils/paths.js'
import { finalizePlanCommands, registerPlanCommands } from './plan.js'
import { requireDestructiveConfirmation } from './helpers.js'

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
  // A parked flow explains itself here: which state a resume returns to, or why it was parked. The
  // state line alone would leave the operator guessing.
  if (state.state === 'paused') {
    const since = state.paused_at ? ` since ${new Date(state.paused_at).toISOString()}` : ''
    console.log(`paused    from ${state.paused_from ?? 'idle'}${since} — \`flow resume\` puts it back`)
  }
  if (state.state === 'orphaned') {
    console.log(`orphaned  ${state.orphan_reason ?? 'the run or its agents are gone'} — \`flow stop\` closes it`)
  }
  if (state.close_reason) console.log(`closed    ${state.close_reason}`)
  const lastUnsubstantiated = [...state.log].reverse().find(entry => entry.event === 'review_unsubstantiated')
  if (lastUnsubstantiated) console.log(`evidence  ${lastUnsubstantiated.detail}`)
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
  if (result.status === 'cancelled') {
    // A pause/stop dropped the claim between the claim and the paste: nothing was sent, and the
    // operator's own command is what the flow now shows.
    console.log('result    cancelled — the flow was paused or stopped while the dispatch was being prepared; nothing was sent')
    console.log(`state     ${result.state.state}  round ${result.state.rounds}/${result.state.max_rounds}`)
    return
  }
  console.log(`result    ${result.status}`)
  console.log(`state     ${result.state.state}  round ${result.state.rounds}/${result.state.max_rounds}`)
  if (result.path) console.log(`file      ${shortHomePath(result.path)}`)
}

// `· 2 MAJOR, 1 MINOR`, or '' when the round carried no findings (an ACCEPT).
function countsSuffix(counts: NotesCounts | null): string {
  if (!counts) return ''
  const parts: string[] = []
  if (counts.blocker > 0) parts.push(`${counts.blocker} BLOCKER`)
  if (counts.major > 0) parts.push(`${counts.major} MAJOR`)
  if (counts.minor > 0) parts.push(`${counts.minor} MINOR`)
  return parts.length > 0 ? `  · ${parts.join(', ')}` : ''
}

function fail(err: unknown): never {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
}

export function registerFlow(program: Command): void {
  const flow = program
    .command('flow')
    .description('dev -> review -> fix pipeline for a run (start, status, tick)')

  registerPlanCommands(flow)

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

  flow
    .command('add-spec')
    .description('queue a block on a flow that already exists: the dev receives it after the next ACCEPT')
    .requiredOption('--run <id>', 'run id (a unique prefix is accepted)')
    .option('--file <path...>', 'structured JSON block spec (requirements and checks are mandatory)')
    .option('--markdown <path...>', 'ingest the file as an unstructured block: an explicit downgrade')
    .option('--json', 'output JSON')
    .action((opts: { run: string, file?: string[], markdown?: string[], json?: boolean }) => {
      try {
        const runId = resolveFlowRunId(opts.run)
        const added = addFlowSpecs({ run_id: runId, files: opts.file, markdown: opts.markdown })
        if (opts.json) {
          console.log(JSON.stringify({
            run_id: runId,
            queued: added.queued.map(spec => ({
              id: spec.id,
              title: redactSecrets(spec.title),
              unstructured: spec.unstructured === true,
            })),
            state: flowStatusPayload(added.state, added.path),
          }, null, 2))
          return
        }
        for (const spec of added.queued) {
          console.log(`queued    ${spec.id}  ${redactSecrets(spec.title)}${spec.unstructured ? '  (unstructured)' : ''}`)
        }
        // The downgrade stays visible: an unstructured block gives the reviewer no acceptance
        // criteria to check, which is a decision the operator has to have made on purpose (§3.2).
        for (const spec of added.queued.filter(entry => entry.unstructured)) {
          console.warn(`warning   ${spec.id} has no requirements/checks; the reviewer has only the body to judge`)
        }
        console.log(`queue     ${pendingCount(added.state)} pending`)
        console.log(`file      ${shortHomePath(added.path)}`)
      } catch (err) {
        fail(err)
      }
    })

  flow
    .command('pause')
    .description('park a flow: a paused flow is never ticked and never sends anything')
    .requiredOption('--run <id>', 'run id (a unique prefix is accepted)')
    .option('--json', 'output JSON')
    .action((opts: { run: string, json?: boolean }) => {
      try {
        const runId = resolveFlowRunId(opts.run)
        const paused = pauseFlow(runId)
        if (opts.json) {
          console.log(JSON.stringify(flowStatusPayload(paused.state, paused.path), null, 2))
          return
        }
        console.log(`flow      ${runId} paused (was ${paused.state.paused_from ?? 'unknown'})`)
        console.log('next      nothing is sent while it is paused; `flow resume` puts it back to work')
      } catch (err) {
        fail(err)
      }
    })

  flow
    .command('resume')
    .description('put a paused flow back to work, or grant an escalated one a fresh round budget')
    .requiredOption('--run <id>', 'run id (a unique prefix is accepted)')
    .option('--json', 'output JSON')
    .action((opts: { run: string, json?: boolean }) => {
      try {
        const runId = resolveFlowRunId(opts.run)
        const resumed = resumeFlow(runId)
        if (opts.json) {
          console.log(JSON.stringify(flowStatusPayload(resumed.state, resumed.path), null, 2))
          return
        }
        console.log(`flow      ${runId} resumed into ${resumed.state.state}`)
        console.log(`rounds    ${resumed.state.rounds}/${resumed.state.max_rounds}`)
        console.log('next      `flow tick --run <id>` picks it up')
      } catch (err) {
        fail(err)
      }
    })

  flow
    .command('stop')
    .description('close a flow for good: nothing is sent after it (needs --yes)')
    .requiredOption('--run <id>', 'run id (a unique prefix is accepted)')
    .option('--yes', 'confirm: a stopped flow cannot be resumed')
    .option('--json', 'output JSON')
    .action((opts: { run: string, yes?: boolean, json?: boolean }) => {
      try {
        requireDestructiveConfirmation(opts, 'stop flow')
        const runId = resolveFlowRunId(opts.run)
        const stopped = stopFlow(runId)
        if (opts.json) {
          console.log(JSON.stringify(flowStatusPayload(stopped.state, stopped.path), null, 2))
          return
        }
        console.log(`flow      ${runId} stopped (${stopped.state.close_reason ?? 'done'})`)
        console.log(`file      ${shortHomePath(stopped.path)}  (kept: \`flow logs\` still reads it)`)
      } catch (err) {
        fail(err)
      }
    })

  flow
    .command('notes')
    .description('print the reviewer findings of one round: the durable notes file of that head')
    .requiredOption('--run <id>', 'run id (a unique prefix is accepted)')
    .option('--head <sha>', 'commit the review was requested for (defaults to the flow claim head)')
    .option('-r, --round <n>', 'review round (defaults to the newest round that has notes)', (value: string) => Number(value))
    .option('--json', 'output JSON')
    .action((opts: { run: string, head?: string, round?: number, json?: boolean }) => {
      try {
        const runId = resolveFlowRunId(opts.run)
        const state = readFlow(runId)
        const head = (opts.head ?? state.claim.head).trim()
        if (!head) throw new Error(`run ${runId} has no commit under review; pass --head <sha>`)
        const found = readNotesRound(runId, { head, round: opts.round })

        if (found.ok) {
          const { round } = found
          if (opts.json) {
            console.log(JSON.stringify({
              run_id: runId,
              head: round.head,
              round: round.round,
              ref: round.ref,
              counts: round.counts,
              path: shortHomePath(round.path),
              notes: round.text,
            }, null, 2))
            return
          }
          console.log(`flow      ${runId}`)
          console.log(`head      ${round.head.slice(0, 12)}  round ${round.round}${countsSuffix(round.counts)}`)
          console.log(`file      ${shortHomePath(round.path)}`)
          console.log('')
          console.log(round.text.trimEnd())
          return
        }

        // A round that was requested and answered from the pane only has no file: that is data, and a
        // script asking for it should not have to treat it as a failure.
        if (found.reason === 'missing' && (found.rounds?.length ?? 0) === 0) {
          if (opts.json) {
            console.log(JSON.stringify({ run_id: runId, head, notes: null, reason: 'missing' }, null, 2))
            return
          }
          console.log(`no notes for ${runId} (head ${head.slice(0, 12)}): no round published a notes file`)
          return
        }
        if (found.reason === 'missing' && found.round !== undefined && found.rounds) {
          // A round that never happened is a mistake, not data.
          console.error(`round ${found.round} does not exist for ${head.slice(0, 12)} (rounds: ${found.rounds.join(', ')})`)
          process.exit(1)
          return
        }
        const heads = listNotesHeads(runId)
        console.error(heads.length > 0
          ? `no notes for head ${head.slice(0, 12)} in ${runId} (heads with notes: ${heads.map(h => h.slice(0, 12)).join(', ')})`
          : `no notes for ${runId} yet`)
        process.exit(1)
      } catch (err) {
        fail(err)
      }
    })

  flow
    .command('logs')
    .description('the tail of one flow journal: transitions, dispatches, verdicts, refusals')
    .requiredOption('--run <id>', 'run id (a unique prefix is accepted)')
    .option('-n, --tail <n>', 'how many entries to show', (value: string) => Number(value), 20)
    .option('--json', 'output JSON')
    .action((opts: { run: string, tail: number, json?: boolean }) => {
      try {
        const runId = resolveFlowRunId(opts.run)
        const state = readFlow(runId)
        const limit = Number.isFinite(opts.tail) && opts.tail > 0 ? Math.floor(opts.tail) : 20
        // The journal is already bounded (FLOW_LOG_LIMIT) and carries no prompt text: only the
        // event, its time and a short reason. Redaction still runs over the detail.
        const entries = state.log.slice(-limit).map(entry => ({
          at: entry.at,
          event: entry.event,
          detail: redactSecrets(entry.detail),
          notes_ref: entry.notes_ref ?? null,
          notes_counts: entry.notes_counts ?? null,
        }))
        if (opts.json) {
          console.log(JSON.stringify(entries, null, 2))
          return
        }
        if (entries.length === 0) {
          console.log('(no events)')
          return
        }
        for (const entry of entries) {
          // "round 2 → notes/<head>-r2.md · 2 MAJOR, 1 MINOR" is the line a human actually needs: which
          // round, where its findings are, and how bad they were.
          const notes = entry.notes_ref ? `  → ${entry.notes_ref}${countsSuffix(entry.notes_counts)}` : ''
          console.log(`${entry.at}  ${entry.event.padEnd(20)} ${entry.detail}${notes}`)
        }
      } catch (err) {
        fail(err)
      }
    })

  // After every subcommand exists (see `finalizePlanCommands`).
  finalizePlanCommands(flow)
}
