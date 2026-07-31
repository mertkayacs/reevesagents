// Approval workflow commands: approvals, approve, deny.

import type { Command } from 'commander'
import { listRunApprovals, resolveRunApproval } from '../../core/approvals.js'

export function registerApprovals(program: Command): void {
  program
    .command('approvals')
    .description('list pending approvals')
    .option('--json', 'output JSON array')
    .action((opts) => {
      const approvals = listRunApprovals(undefined, 'pending')
      if (opts.json) {
        console.log(JSON.stringify(approvals, null, 2))
        return
      }
      if (approvals.length === 0) {
        console.log('no pending approvals')
        return
      }
      for (const approval of approvals) {
        console.log(`${approval.id.slice(0, 8)}  ${approval.risk.padEnd(6)}  ${approval.action.padEnd(16)}  ${approval.summary}`)
      }
    })
}

export function registerApprove(program: Command): void {
  program
    .command('approve <approval-id> [note]')
    .description('approve a pending approval')
    .action((id, note: string | undefined) => {
      try {
        const resolved = resolveRunApproval(id, 'approved', note ?? '')
        console.log(`${resolved.status} ${resolved.id.slice(0, 8)}  ${resolved.action}`)
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err))
        process.exit(1)
      }
    })
}

export function registerDeny(program: Command): void {
  program
    .command('deny <approval-id> [note]')
    .description('deny a pending approval')
    .action((id, note: string | undefined) => {
      try {
        const resolved = resolveRunApproval(id, 'denied', note ?? '')
        console.log(`${resolved.status} ${resolved.id.slice(0, 8)}  ${resolved.action}`)
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err))
        process.exit(1)
      }
    })
}
