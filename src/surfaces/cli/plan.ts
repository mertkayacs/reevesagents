// `flow plan …`: the plan as an object, read and edited from the CLI.
//
// Five verbs, all designed in `docs/plan-model-design.md` §7. The two rules the commands must keep:
//
// - **import never destroys a record.** It adds, retires and retitles; a document that disagrees with a
//   closed item produces a logged conflict, and nothing is demoted.
// - **`set` is the only manual path to `done`**, and it is guarded: `done`/`skipped` need `--yes`, and a
//   `done` without an accepted commit additionally needs `--note`.
//
// Exit codes are part of the contract, because a script drives these: 0 ok, 1 usage/invalid file,
// 2 not found, 3 refused (limits, duplicate ids, unsupported format, conflict on `flow plan`).

import { readFileSync } from 'node:fs'
import type { Command } from 'commander'
import { listFlowFiles, readFlow } from '../../core/flow-store.js'
import type { FlowState } from '../../core/flow.js'
import { appendLog } from '../../core/flow.js'
import { headIsDocsOnly, isGitTreeClean, readGitHead } from '../../core/flow-runner.js'
import { applyPlanMarks } from '../../core/plan-mark.js'
import { saveFlow } from '../../core/flow-store.js'
import { readRun } from '../../core/runs.js'
import { addFlowSpecs, roundIsLive } from '../../core/flow-control.js'
import type { Plan, PlanItem, PlanStatus, SetStatusInput } from '../../core/plan.js'
import {
  attachSpec, createPlan, importInto, mutatePlan, PLAN_STATUSES, PlanError, planComplete, planExists,
  planItemView, planPath, planProgress, readPlan, renderPlanItemPrompt, resolveRepositoryPath,
  setItemStatus, ensurePlanSummary,
} from '../../core/plan.js'
import { planIsComplete, planNext, planOpenItems, planTickView, planWaitingForBrief } from '../../core/flow-plan.js'
import { resolveFlowRunId } from '../../core/flow-view.js'
import { displayPath } from '../../utils/paths.js'

// `--run` is parsed by the parent `plan` when it is declared there, so a subcommand may find its own copy
// empty. Reading both places is what makes `flow plan import --run x` and `flow plan --run x` behave the
// same; a missing value is the usage error it always was.
function runOption(cmd: Command): string {
  const own = (cmd.opts() as { run?: string }).run
  const fromParent = (cmd.parent?.opts() as { run?: string } | undefined)?.run
  const value = own ?? fromParent
  if (!value) throw new PlanError('--run <id> is required', 'invalid')
  return value
}

// `--json` is declared on the parent `plan` as well, so commander hands the flag to the parent even for a
// subcommand — the same trap as `--run`. Read both levels, or `flow plan status --json --item X` prints the
// human block and a script chokes on it.
function jsonOption(cmd: Command, opts: { json?: boolean }): boolean {
  return opts.json === true || (cmd.parent?.opts() as { json?: boolean } | undefined)?.json === true
}

function failPlan(err: unknown): never {
  if (err instanceof PlanError) {
    console.error(err.message)
    process.exit(err.code === 'not_found' ? 2 : err.code === 'refused' || err.code === 'conflict' ? 3 : 1)
  }
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
}

function statusCountsLine(plan: Plan): string {
  const progress = planProgress(plan)
  const parts = [`${progress.done}/${progress.total} done`]
  if (progress.skipped > 0) parts.push(`${progress.skipped} skipped`)
  for (const status of ['pending', 'needs_brief', 'queued', 'in_work', 'reviewing', 'blocked_owner'] as const) {
    const count = progress.by_status[status]
    if (count > 0) parts.push(`${count} ${status}`)
  }
  return parts.join(' · ')
}

function idsOf(plan: Plan, status: PlanStatus): string[] {
  return plan.items.filter(item => item.status === status && item.missing_since === null).map(item => item.id)
}

// The item `plan next` would take: the first in document order that is neither terminal nor missing. It is
// reported even when it cannot move — that is the point of "waiting for you".
function nextItem(plan: Plan): PlanItem | null {
  return plan.items.find(item => item.missing_since === null && item.status !== 'done' && item.status !== 'skipped') ?? null
}

export function planPayload(plan: Plan, path: string) {
  const progress = planProgress(plan)
  const next = nextItem(plan)
  return {
    run_id: plan.run_id,
    source_path: plan.source_path,
    imported_at: plan.imported_at,
    source_hash: plan.source_hash,
    complete: planComplete(plan),
    progress: {
      done: progress.done,
      total: progress.total,
      skipped: progress.skipped,
      by_status: progress.by_status,
    },
    waiting: {
      needs_brief: idsOf(plan, 'needs_brief'),
      blocked_owner: idsOf(plan, 'blocked_owner'),
      missing: plan.items.filter(item => item.missing_since !== null).map(item => item.id),
      conflicts: plan.conflicts.length,
    },
    next: next
      ? {
        id: next.id,
        title: next.title,
        status: next.status,
        spec_path: next.spec_path,
        // Eligibility, not a dispatch: `plan next` is what queues it (§5 of the design).
        ready: next.status === 'queued' && next.spec !== null,
      }
      : null,
    items: plan.items.map(planItemView),
    conflicts: plan.conflicts,
    path,
  }
}

export interface PlanCommandOptions {
  json?: boolean
  dryRun?: boolean
}

export function registerPlanCommands(flow: Command): void {
  // Options are parsed *positionally* on this command: without it commander hands `--run run-p` to the parent
  // `plan` even when `flow plan import …` is what was typed, and the child's `requiredOption` then fails for
  // a flag the user did pass. With positional parsing, options before the subcommand belong to `plan` and
  // options after it belong to the subcommand — which is exactly how the two forms are written.
  const plan = flow
    .command('plan')
    .description('the plan imported from the project document: progress, items and the next thing to do')
    .option('--run <id>', 'run id (a unique prefix is accepted)')
    .option('--json', 'output JSON')
    .action((opts: { run?: string, json?: boolean }) => {
      try {
        if (!opts.run) throw new PlanError('--run <id> is required (use `flow plan import --run <id> …` for the other verbs)', 'invalid')
        const runId = resolveFlowRunId(opts.run)
        // A crash between the two writes of an earlier command leaves the summary stale; reporting from the
        // plan while repairing the cache is cheaper than explaining a wrong `plan 1/3` on the run card.
        ensurePlanSummary(runId)
        const imported = readPlan(runId)
        if (opts.json) {
          console.log(JSON.stringify(planPayload(imported, displayPath(planPath(runId))), null, 2))
          return
        }
        const flow = readFlow(runId)
        printPlan(imported, { perItem: flow.max_rounds, total: flow.max_total_rounds, paused: flow.state === 'paused' })
        if (imported.conflicts.length > 0) process.exitCode = 3
      } catch (err) {
        failPlan(err)
      }
    })

  plan
    .command('import')
    .description('import (or re-import) the project plan document into the flow')
    .option('--run <id>', 'run id (a unique prefix is accepted)')
    .requiredOption('--file <path>', 'the plan document in the repository, e.g. docs/implementation-plan.md')
    .option('--dry-run', 'parse and report; write nothing')
    .option('--json', 'output JSON')
    .action((opts: { run?: string, file: string, dryRun?: boolean, json?: boolean }, cmd: Command) => {
      const json = jsonOption(cmd, opts)
      try {
        const runId = resolveFlowRunId(runOption(cmd))
        const target = projectPath(opts.file, projectRoot(runId))
        const text = readDocument(target.absolute)
        const sourcePath = target.relative
        // Parsed before the lock: a broken document must not hold the lock while it reports its line number.
        const dryRun = opts.dryRun === true
        const result = dryRun
          ? parseOnly(runId, sourcePath, text)
          : mutatePlan(runId, current => {
            const imported = current
              ? importInto(current, { run_id: runId, source_path: sourcePath, text, now: Date.now() })
              : createPlan({ run_id: runId, source_path: sourcePath, text, now: Date.now() })
            // Unchanged means unchanged: writing the same plan again would touch `imported_at` and the file's
            // mtime for nothing.
            return { plan: imported.unchanged ? null : imported.plan, value: imported }
          })
        if (opts.dryRun !== true) anchorAfterDocumentChange(runId)
        if (json) {
          console.log(JSON.stringify({
            dry_run: opts.dryRun === true,
            unchanged: result.unchanged,
            added: result.added,
            missing: result.missing,
            conflicts: result.conflicts,
            source_hash: result.source_hash,
            source_path: sourcePath,
            progress: planProgress(result.plan),
          }, null, 2))
          return
        }
        if (result.unchanged) {
          console.log(`unchanged  ${sourcePath} (${result.source_hash.slice(0, 8)})`)
          return
        }
        const parts = [`${result.plan.items.length} items`]
        if (result.added.length > 0) parts.push(`${result.added.length} new`)
        // A first import honours the document's ticks: say how many items arrived already done, so the count is not a surprise
        // when `plan` reports a finished milestone out of nowhere (block 78).
        const ticked = result.plan.items.filter(item => item.closed_by === 'ticked_by_hand').length
        if (result.added.length > 0 && ticked > 0) parts.push(`${ticked} ticked in the document`)
        if (result.missing.length > 0) parts.push(`${result.missing.length} missing`)
        if (result.conflicts.length > 0) parts.push(`${result.conflicts.length} conflict${result.conflicts.length === 1 ? '' : 's'}`)
        console.log(`${opts.dryRun === true ? 'would import' : 'imported'}  ${sourcePath}: ${parts.join(', ')}`)
        for (const conflict of result.conflicts) console.log(`  ${conflict.kind}  ${conflict.detail}`)
        if (result.conflicts.length > 0) process.exitCode = 3
      } catch (err) {
        failPlan(err)
      }
    })

  plan
    .command('next')
    .description('the item the plan wants next, and why (or why not): the only automatic path to work')
    .option('--run <id>', 'run id (a unique prefix is accepted)')
    .option('--dry-run', 'accepted for compatibility; this command never writes')
    .option('--json', 'output JSON')
    .action((opts: { run?: string, dryRun?: boolean, json?: boolean }, cmd: Command) => {
      const json = jsonOption(cmd, opts)
      try {
        const runId = resolveFlowRunId(runOption(cmd))
        const flow = readFlow(runId)
        const imported = readPlan(runId)
        const view = planTickView(imported, { perItem: flow.max_rounds, total: flow.max_total_rounds })
        const next = planNext(view)
        const body = {
          run_id: runId,
          dry_run: opts.dryRun === true,
          kind: next.kind,
          item: next.kind === 'none' ? null : { id: next.item.id, title: next.item.title, status: next.item.status, spec_path: next.item.spec_path ?? null, rounds: next.item.rounds },
          reason: next.kind === 'item'
            ? null
            : next.kind === 'none' ? (planIsComplete(view) ? 'plan_complete' : 'nothing_open') : next.kind,
          progress: { done: imported.items.filter(item => item.status === 'done').length, total: imported.items.length },
          waiting_for_brief: planWaitingForBrief(view).map(item => item.id),
        }
        // This command reads. It used to queue the brief on the flow as a second way to reach a dispatch, but the
        // engine now takes a ready item straight from the plan (§3.6), so the queue was a duplicate path with its own
        // failure modes — a brief whose id did not match the item's left an off-plan spec that outranked the plan.
        // The claim protocol in `stepFlow` is the only sender; printing the decision is all this does.
        const queued = false
        if (json) {
          console.log(JSON.stringify({ ...body, queued }, null, 2))
          return
        }
        if (next.kind === 'item') {
          const brief = next.item.spec_path ? ` (brief ${next.item.spec_path})` : ''
          console.log(`next      ${next.item.id} — "${next.item.title}"${brief}  ready for dispatch`)
          console.log('          nothing was sent by this command; the tick dispatches it')
          return
        }
        if (next.kind === 'needs_brief') {
          const waiting = planWaitingForBrief(view).map(item => item.id)
          console.log(`waiting   ${next.item.id} has no brief: \`flow plan attach --run ${runId} --item ${next.item.id} --spec <file>\``)
          if (waiting.length > 1) console.log(`waiting   ${waiting.length} items need a brief: ${waiting.join(', ')}`)
          return
        }
        if (next.kind === 'blocked_owner') {
          console.log(`waiting   ${next.item.id} is blocked_owner: a human decides (\`flow plan set --status skipped|queued\`)`)
          return
        }
        if (next.kind === 'in_flight') {
          console.log(`waiting   ${next.item.id} is ${next.item.status}: one task per flow`)
          return
        }
        const open = planOpenItems(view).length
        console.log(planIsComplete(view)
          ? `nothing   the plan is complete (${imported.items.length} items)`
          : `nothing   ${open} item(s) open, none of them ready`)
      } catch (err) {
        failPlan(err)
      }
    })

  plan
    .command('status')
    .description('one plan item: status, the commit that closed it, its rounds and its brief')
    .requiredOption('--item <id>', 'plan item id, e.g. P1.7.1')
    .option('--run <id>', 'run id, needed only when the item id exists in more than one flow')
    .option('--json', 'output JSON')
    .action((opts: { item: string, run?: string, json?: boolean }, cmd: Command) => {
      const json = jsonOption(cmd, opts)
      try {
        const own = opts.run ?? (cmd.parent?.opts() as { run?: string } | undefined)?.run
        const found = findItem(opts.item, own)
        if (json) {
          // The view, not the record: the brief body stays in the file (see `planItemView`).
          console.log(JSON.stringify({
            run_id: found.plan.run_id,
            item: planItemView(found.item),
            conflicts: found.plan.conflicts.filter(entry => entry.item_id === found.item.id),
          }, null, 2))
          return
        }
        const item = found.item
        console.log(`item      ${item.id}  ${item.status}${item.owner_action ? '  (needs you)' : ''}`)
        console.log(`run       ${found.plan.run_id}`)
        console.log(`title     ${item.title}`)
        console.log(`brief     ${item.spec_path ?? '(none)'}${item.spec_hash ? `  ${item.spec_hash.slice(0, 8)}` : ''}`)
        console.log(`head      ${item.head ?? '(no accepted commit)'}`)
        console.log(`rounds    ${item.rounds}${item.notes_ref ? `  notes ${item.notes_ref}` : ''}`)
        console.log(`updated   ${item.updated_at}`)
        if (item.missing_since) console.log(`missing   since ${item.missing_since} (the document no longer lists it)`)
      } catch (err) {
        failPlan(err)
      }
    })

  plan
    .command('attach')
    .description('attach a brief to a plan item: validates it and stores a snapshot')
    .option('--run <id>', 'run id (a unique prefix is accepted)')
    .requiredOption('--item <id>', 'plan item id, e.g. P1.7.1')
    .requiredOption('--spec <file>', 'the brief: a JSON block spec, or markdown for an unstructured one')
    .option('--queue', 'also queue the block on the flow now, instead of waiting for `flow plan next`')
    .option('--dry-run', 'validate and report; write nothing')
    .option('--json', 'output JSON')
    .action((opts: { run?: string, item: string, spec: string, queue?: boolean, dryRun?: boolean, json?: boolean }, cmd: Command) => {
      const json = jsonOption(cmd, opts)
      try {
        const runId = resolveFlowRunId(runOption(cmd))
        const target = projectPath(opts.spec, projectRoot(runId))
        const text = readDocument(target.absolute)
        const format = opts.spec.toLowerCase().endsWith('.json') ? 'json' as const : 'markdown' as const
        const specPath = target.relative
        const attach = (plan: Parameters<typeof attachSpec>[0]) => attachSpec(plan, {
          id: opts.item,
          text,
          format,
          spec_path: specPath,
          now: Date.now(),
        })
        const dryRun = opts.dryRun === true
        const result = dryRun
          ? attach(readPlan(runId))
          : mutatePlan(runId, current => {
            if (!current) throw new PlanError(`no plan for run ${runId}`, 'not_found')
            const attached = attach(current)
            return { plan: attached.plan, value: attached }
          })
        let queued = false
        if (!dryRun && opts.queue === true) {
          // Outside the plan lock on purpose: `addFlowSpecs` takes the runs lock itself, and nesting the two
          // is how a deadlock is born.
          addFlowSpecs({ run_id: runId, files: format === 'json' ? [target.absolute] : undefined, markdown: format === 'markdown' ? [target.absolute] : undefined })
          queued = true
        }
        if (opts.dryRun !== true) anchorAfterDocumentChange(runId)
        if (json) {
          console.log(JSON.stringify({
            dry_run: opts.dryRun === true,
            item: { id: result.item.id, status: result.item.status, spec_path: result.item.spec_path, spec_hash: result.item.spec_hash },
            queued,
          }, null, 2))
          return
        }
        const suffix = opts.dryRun === true
          ? '(dry run: nothing written)'
          : queued
            ? '(queued on the flow — the tick sends it)'
            : '(brief ready; the next `flow tick` dispatches it)'
        console.log(`attached  ${result.item.id} → ${result.item.spec_path} ${suffix}`)
      } catch (err) {
        failPlan(err)
      }
    })

  plan
    .command('set')
    .description('move one plan item by hand; the only command that can set done without an ACCEPT')
    .option('--run <id>', 'run id (a unique prefix is accepted)')
    .requiredOption('--item <id>', 'plan item id, e.g. P1.7.1')
    .requiredOption('--status <status>', `one of: ${PLAN_STATUSES.join(', ')}`)
    .option('--yes', 'required for done and skipped')
    .option('--note <text>', 'why: required for a done without an accepted commit')
    .option('--dry-run', 'validate and report; write nothing')
    .option('--json', 'output JSON')
    .action((opts: { run?: string, item: string, status: string, yes?: boolean, note?: string, dryRun?: boolean, json?: boolean }, cmd: Command) => {
      const json = jsonOption(cmd, opts)
      try {
        const runId = resolveFlowRunId(runOption(cmd))
        // A paused flow is the operator's, and so is a stopped one: `stopped` closes the flow as `done`, which means no tick will ever run
        // its round, so the row cannot be "in flight" in any useful sense. GUIDE promises both, and before this the second half was not
        // true (block 58). A live round still refuses, because a closed flow is the only case where `round_live` is forced false.
        const parkedFlow = readFlow(runId)
        const flowIsParked = () => parkedFlow.state === 'paused' || parkedFlow.state === 'done'
        const flowHasLiveRound = () => parkedFlow.state !== 'done' && roundIsLive(parkedFlow)
        const input: SetStatusInput = {
          id: opts.item,
          status: opts.status as PlanStatus,
          note: opts.note,
          yes: opts.yes === true,
          now: Date.now(),
          // A paused (or stopped) flow is a human at the console, so the engine's hold on a busy row is lifted — unless a round is actually
          // live, which is the one thing a human may not close by hand (block 56).
          intervention: {
            paused: flowIsParked(),
            round_live: flowHasLiveRound(),
          },
        }
        const dryRun = opts.dryRun === true
        const result = dryRun
          ? setItemStatus(readPlan(runId), input)
          : mutatePlan(runId, current => {
            if (!current) throw new PlanError(`no plan for run ${runId}`, 'not_found')
            const applied = setItemStatus(current, input)
            // `setItemStatus` returns the same object when nothing changed: writing it again would bump the
            // file's mtime and the summary for a no-op.
            return { plan: applied.plan === current ? null : applied.plan, value: applied }
          })
        const item = result.plan.items.find(entry => entry.id === opts.item)!
        // A manual close is a close like any other: the line in the document is ticked and committed, and the same guards
        // apply (a dirty tree defers it, a missing document is journalled) — block 72.
        const marks = dryRun || item.status !== 'done'
          ? null
          : applyPlanMarks(runId, {
            repo: parkedFlow.repo,
            tree_clean: isGitTreeClean(parkedFlow.repo),
            ids: [item.id],
            attempt: 'close',
          })
        if (json) {
          console.log(JSON.stringify({
            dry_run: opts.dryRun === true,
            item: { id: item.id, status: item.status, previous: result.previous, owner_action: item.owner_action, updated_at: item.updated_at },
            ...(marks
              ? {
                document: {
                  marked: marks.marked.map(entry => entry.id),
                  already: marks.already,
                  deferred: marks.deferred,
                  failures: marks.failures,
                  sha: marks.sha,
                },
              }
              : {}),
          }, null, 2))
          return
        }
        const note = opts.note ? `, note: ${opts.note}` : ''
        console.log(`${item.id}  ${result.previous} → ${item.status}  (manual${note})${opts.dryRun === true ? '  [dry run]' : ''}`)
        if (marks && marks.marked.length > 0) console.log(`marked    ${marks.marked.map(entry => entry.id).join(', ')} in the plan document (${marks.sha?.slice(0, 7)})`)
        if (marks && marks.already.length > 0) console.log(`marked    ${marks.already.join(', ')} was already ticked`)
        if (marks && marks.deferred) console.log('marked    deferred: the tree is dirty; the next clean tick writes it')
        for (const failure of marks?.failures ?? []) console.log(`marked    ${failure.id}: ${failure.reason}`)
      } catch (err) {
        failPlan(err)
      }
    })
}

// Enabled after the subcommands are registered: commander builds the parse behaviour from the tree it has at
// the moment of the call, so a parent that switches too early keeps consuming the children's options.
// (Kept as a function so the ordering is explicit rather than a comment near the top of the file.)
export function finalizePlanCommands(flow: Command): void {
  const plan = flow.commands.find(command => command.name() === 'plan')
  plan?.enablePositionalOptions()
}

// `plan status --item` without `--run`: an item id is unique inside a plan, not across flows, so the search
// reports both run ids instead of picking one.
function findItem(itemId: string, run?: string): { plan: Plan, item: PlanItem } {
  if (run) {
    const plan = readPlan(resolveFlowRunId(run))
    const item = plan.items.find(entry => entry.id === itemId)
    if (!item) throw new PlanError(`no plan item ${itemId} in run ${plan.run_id}`, 'not_found')
    return { plan, item }
  }
  const matches: { plan: Plan, item: PlanItem }[] = []
  for (const file of listFlowFiles()) {
    if (!planExists(file.run_id)) continue
    const plan = readPlan(file.run_id)
    const item = plan.items.find(entry => entry.id === itemId)
    if (item) matches.push({ plan, item })
  }
  if (matches.length === 0) throw new PlanError(`no plan item ${itemId} in any flow`, 'not_found')
  if (matches.length > 1) {
    throw new PlanError(
      `${itemId} exists in more than one flow (${matches.map(match => match.plan.run_id).join(', ')}); pass --run`,
      'ambiguous',
    )
  }
  return matches[0]!
}

// A plan path is a path in the *project*, so it is resolved against the run's working directory first: the
// operator may run the CLI from anywhere, and `docs/implementation-plan.md` means the project's document.
// The plan and its briefs are documents *about* the work, and the engine treats any commit as progress: importing them
// into a running flow asked a reviewer to read the document instead of the code (block 22, D6 — seen on the sandbox, where
// the flow sent the reviewer after the plan and never started the item). Two ways to prevent that: park the flow, or move
// its baseline. Park is worse — `flow start` → `plan import` → `plan attach` is the documented order, and it would break.
// So the baseline moves: everything committed up to now is "already accounted for", and the item goes to the dev on the
// next tick.
function anchorAfterDocumentChange(runId: string): void {
  let state: FlowState
  try { state = readFlow(runId) } catch { return }
  if (state.state === 'done') return
  const head = readGitHead(state.repo) || state.claim.head
  if (head === state.claim.head) return
  if (headIsDocsOnly(state, head) !== true) return
  saveFlow({
    ...state,
    claim: { head, verdict: null, verdict_count: state.claim.verdict_count, verdict_applied: false, spec_id: null },
    verdict_handled_for: null,
    log: appendLog(state, {
      at: new Date().toISOString(),
      event: 'plan_documents_anchored',
      detail: `${head.slice(0, 7)}: the plan is a document, not the dev's work`,
    }),
  })
}

function projectRoot(runId: string): string {
  try {
    return readRun(runId).working_dir
  } catch {
    return process.cwd()
  }
}

// One resolution for both jobs: the checked path to read, and the repository-relative path to store. The
// core resolves symlinks on both sides, so a link inside the project that points outside it is refused, and
// the path the caller reads is the one that was checked.
function projectPath(file: string, root: string): { absolute: string, relative: string } {
  return resolveRepositoryPath(file, root)
}

// `--dry-run` still parses and merges, so the operator sees what would change; only the write is skipped.
function parseOnly(runId: string, sourcePath: string, text: string) {
  const existing = planExists(runId) ? readPlan(runId) : null
  return existing
    ? importInto(existing, { run_id: runId, source_path: sourcePath, text, now: Date.now() })
    : createPlan({ run_id: runId, source_path: sourcePath, text, now: Date.now() })
}

function readDocument(path: string): string {
  try {
    return readFileSync(path, 'utf-8')
  } catch {
    throw new PlanError(`cannot read ${displayPath(path)}`, 'invalid')
  }
}

function printPlan(plan: Plan, budgets: { perItem: number, total: number, paused?: boolean }): void {
  console.log(`plan      ${plan.source_path}  (imported ${plan.imported_at}, hash ${plan.source_hash.slice(0, 8)})`)
  console.log(`progress  ${statusCountsLine(plan)}`)
  // A paused plan is a fact the operator needs before wondering why nothing moves: the tick sends nothing while it is parked.
  if (budgets.paused === true) console.log('paused    yes (flow pause; `flow resume` continues from here)')
  const waiting: string[] = []
  // An item waiting for a brief is `pending` as far as the status table goes (it becomes `needs_brief` only
  // when `plan next` looks at it), so the line is built from the specs, not from the status.
  const needsBrief = plan.items
    .filter(item => item.spec === null && item.missing_since === null && item.status !== 'done' && item.status !== 'skipped')
    .map(item => item.id)
  const blocked = idsOf(plan, 'blocked_owner')
  const missing = plan.items.filter(item => item.missing_since !== null).map(item => item.id)
  if (needsBrief.length > 0) waiting.push(`needs_brief: ${needsBrief.join(', ')}`)
  if (blocked.length > 0) waiting.push(`blocked_owner: ${blocked.join(', ')}`)
  if (missing.length > 0) waiting.push(`missing: ${missing.join(', ')}`)
  if (plan.conflicts.length > 0) waiting.push(`conflicts: ${plan.conflicts.length}`)
  if (waiting.length > 0) console.log(`waiting   ${waiting.join(' · ')}`)
  // The picker decides, not document order alone: an item without a brief is reported, and the next line shows
  // what `flow plan next` would actually take.
  const picked = planNext(planTickView(plan, budgets), {})
  const next = picked.kind === 'none' ? null : picked.item
  if (picked.kind === 'needs_brief' || picked.kind === 'blocked_owner' || picked.kind === 'in_flight') {
    console.log(`next      ${picked.item.id} — "${picked.item.title}"  ${picked.kind.replace('_', ' ')}`)
    return
  }
  if (!next) {
    console.log(`next      (nothing open)${planComplete(plan) ? ' — the plan is complete' : ''}`)
    return
  }
  const brief = next.spec_path ? ` (brief ${next.spec_path})` : ' (no brief yet)'
  const ready = next.status === 'queued' && next.spec ? '  ready' : next.status === 'pending' ? '' : `  ${next.status}`
  console.log(`next      ${next.id} — "${next.title}"${brief}${ready}`)
  if (next.spec && next.status === 'queued') {
    // The prompt's first line only: the full text belongs to the dispatch, not to a status command.
    const prompt = renderPlanItemPrompt(plan, next.id).split('\n')[0]
    console.log(`prompt    ${prompt}`)
  }
}
