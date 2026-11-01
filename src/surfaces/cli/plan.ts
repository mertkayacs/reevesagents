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
import { resolve } from 'node:path'
import type { Command } from 'commander'
import { listFlowFiles } from '../../core/flow-store.js'
import { readRun } from '../../core/runs.js'
import { addFlowSpecs } from '../../core/flow-control.js'
import type { Plan, PlanItem, PlanStatus, SetStatusInput } from '../../core/plan.js'
import {
  attachSpec, createPlan, importInto, mutatePlan, PLAN_STATUSES, PlanError, planComplete, planExists,
  planPath, planProgress, readPlan, renderPlanItemPrompt, repositoryRelativePath, setItemStatus,
} from '../../core/plan.js'
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
    items: plan.items.map(item => ({
      id: item.id,
      title: item.title,
      status: item.status,
      spec_path: item.spec_path,
      head: item.head,
      rounds: item.rounds,
      notes_ref: item.notes_ref,
      owner_action: item.owner_action,
      missing_since: item.missing_since,
      line: item.line,
      updated_at: item.updated_at,
    })),
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
        const imported = readPlan(runId)
        if (opts.json) {
          console.log(JSON.stringify(planPayload(imported, displayPath(planPath(runId))), null, 2))
          return
        }
        printPlan(imported)
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
        if (opts.json) {
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
    .command('status')
    .description('one plan item: status, the commit that closed it, its rounds and its brief')
    .requiredOption('--item <id>', 'plan item id, e.g. P1.7.1')
    .option('--run <id>', 'run id, needed only when the item id exists in more than one flow')
    .option('--json', 'output JSON')
    .action((opts: { item: string, run?: string, json?: boolean }, cmd: Command) => {
      try {
        const own = opts.run ?? (cmd.parent?.opts() as { run?: string } | undefined)?.run
        const found = findItem(opts.item, own)
        if (opts.json) {
          console.log(JSON.stringify({ run_id: found.plan.run_id, item: found.item, conflicts: found.plan.conflicts.filter(entry => entry.item_id === found.item.id) }, null, 2))
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
        if (opts.json) {
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
            ? '(queued for dispatch)'
            : '(brief ready; flow plan next queues it)'
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
      try {
        const runId = resolveFlowRunId(runOption(cmd))
        const input: SetStatusInput = {
          id: opts.item,
          status: opts.status as PlanStatus,
          note: opts.note,
          yes: opts.yes === true,
          now: Date.now(),
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
        if (opts.json) {
          console.log(JSON.stringify({
            dry_run: opts.dryRun === true,
            item: { id: item.id, status: item.status, previous: result.previous, owner_action: item.owner_action, updated_at: item.updated_at },
          }, null, 2))
          return
        }
        const note = opts.note ? `, note: ${opts.note}` : ''
        console.log(`${item.id}  ${result.previous} → ${item.status}  (manual${note})${opts.dryRun === true ? '  [dry run]' : ''}`)
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
function projectRoot(runId: string): string {
  try {
    return readRun(runId).working_dir
  } catch {
    return process.cwd()
  }
}

// One resolution for both jobs: the absolute path to read, and the repository-relative path to store. Doing
// them separately is how the file was read from the shell's cwd while the state recorded the project's.
function projectPath(file: string, root: string): { absolute: string, relative: string } {
  const absolute = resolve(root, file)
  return { absolute, relative: repositoryRelativePath(absolute, root) }
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

function printPlan(plan: Plan): void {
  console.log(`plan      ${plan.source_path}  (imported ${plan.imported_at}, hash ${plan.source_hash.slice(0, 8)})`)
  console.log(`progress  ${statusCountsLine(plan)}`)
  const waiting: string[] = []
  const needsBrief = idsOf(plan, 'needs_brief')
  const blocked = idsOf(plan, 'blocked_owner')
  const missing = plan.items.filter(item => item.missing_since !== null).map(item => item.id)
  if (needsBrief.length > 0) waiting.push(`needs_brief: ${needsBrief.join(', ')}`)
  if (blocked.length > 0) waiting.push(`blocked_owner: ${blocked.join(', ')}`)
  if (missing.length > 0) waiting.push(`missing: ${missing.join(', ')}`)
  if (plan.conflicts.length > 0) waiting.push(`conflicts: ${plan.conflicts.length}`)
  if (waiting.length > 0) console.log(`waiting   ${waiting.join(' · ')}`)
  const next = nextItem(plan)
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
