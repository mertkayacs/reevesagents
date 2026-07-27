// Ended-run cleanup commands: delete-run, history, delete-history.

import type { Command } from 'commander'
import { readRun, archiveAndRemoveRun, listRunHistory, deleteRunHistory } from '../core/runs.js'
import { providerDisplayName } from '../utils/display.js'
import { requireDestructiveConfirmation } from './helpers.js'

export function registerDeleteRun(program: Command): void {
  program
    .command('delete-run <run-id>')
    .description('delete an ended run')
    .option('-y, --yes', 'confirm delete')
    .action((id, opts) => {
      requireDestructiveConfirmation(opts, 'delete run')
      // Read by id directly: ended runs are filtered out of listRuns, so the web
      // delete path reads them straight from disk and guards on the ended state.
      const run = readRun(id)
      if (run.status !== 'ended' && run.ended_at === null) throw new Error('Stop run before deleting it')
      archiveAndRemoveRun(run.id, 'ended')
      console.log(`deleted ${run.id.slice(0, 8)}  ${run.name}`)
    })
}

export function registerHistory(program: Command): void {
  program
    .command('history')
    .description('list archived run history')
    .option('--json', 'output JSON array')
    .action((opts) => {
      const records = listRunHistory()
      if (opts.json) {
        console.log(JSON.stringify(records, null, 2))
        return
      }
      if (records.length === 0) {
        console.log('no history')
        return
      }
      for (const record of records) {
        const provider = record.root_provider ? providerDisplayName(record.root_provider) : '-'
        console.log(`${record.id.slice(0, 8)}  ${record.status.padEnd(5)}  ${provider.padEnd(14)}  ${String(record.agent_count).padStart(2)} agents  ${record.name}  ${record.working_dir}`)
      }
    })
}

export function registerDeleteHistory(program: Command): void {
  program
    .command('delete-history <id>')
    .description('delete one run history record')
    .option('-y, --yes', 'confirm delete')
    .action((id, opts) => {
      requireDestructiveConfirmation(opts, 'delete history record')
      if (!listRunHistory().some(record => record.id === id)) throw new Error(`history record not found: ${id}`)
      deleteRunHistory(id)
      console.log(`deleted history ${id.slice(0, 8)}`)
    })
}
