// `notifications list` and `notifications read`: the journal without a browser.
//
// The Web UI is the primary surface (block 15), but a supervisor script and a human on a broken dashboard need the
// same data from the terminal — and the same watermark, or "read" would mean two different things depending on
// which surface looked last.

import type { Command } from 'commander'
import {
  NotificationError, markNotificationsRead, notificationSummary, readNotifications,
} from '../../core/notifications.js'

function fail(err: unknown): never {
  if (err instanceof NotificationError) {
    console.error(err.message)
    process.exit(err.code === 'unavailable' ? 2 : 1)
  }
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
}

function severityTag(severity: string): string {
  return severity === 'error' ? 'ERR ' : severity === 'warn' ? 'WARN' : 'info'
}

export function registerNotifications(program: Command): void {
  const notifications = program
    .command('notifications')
    .description('the notification journal: what happened while you were away')

  notifications
    .command('list')
    .description('recent events, newest first')
    .option('--run <id>', 'only events of this run')
    .option('--unread', 'only events newer than the read watermark')
    .option('--limit <n>', 'how many to print (default 20)')
    .option('--json', 'output JSON')
    .action((opts: { run?: string, unread?: boolean, limit?: string, json?: boolean }) => {
      try {
        const limit = opts.limit ? Number.parseInt(opts.limit, 10) : 20
        const result = readNotifications({
          run: opts.run,
          unread: opts.unread === true,
          limit: Number.isFinite(limit) && limit > 0 ? limit : 20,
        })
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2))
          return
        }
        if (result.events.length === 0) {
          console.log('(no notifications)')
          return
        }
        for (const event of result.events) {
          const where = event.run_name || event.run_id || '—'
          const who = event.agent_nickname || event.agent_id
          const unread = event.seq > result.read_seq ? '*' : ' '
          console.log(`${unread} ${String(event.seq).padStart(4)}  ${event.received_at}  ${severityTag(event.severity)}  ${event.kind.padEnd(18)} ${where}${who ? ` / ${who}` : ''}  ${event.title}`)
        }
        console.log(`\n${result.total} event${result.total === 1 ? '' : 's'} · unread ${result.events.filter(event => event.seq > result.read_seq).length} · latest seq ${result.latest_seq}`)
      } catch (err) {
        fail(err)
      }
    })

  notifications
    .command('read')
    .description('mark events read up to --seq (default: everything), monotonic')
    .option('--seq <n>', 'the highest seq to mark read')
    .option('--json', 'output JSON')
    .action((opts: { seq?: string, json?: boolean }) => {
      try {
        const seq = opts.seq ? Number.parseInt(opts.seq, 10) : undefined
        const result = markNotificationsRead(Number.isFinite(seq) ? seq : undefined)
        if (opts.json) {
          console.log(JSON.stringify({ ...result, summary: notificationSummary() }, null, 2))
          return
        }
        console.log(result.changed ? `read up to ${result.read_seq}` : `already read up to ${result.read_seq}`)
      } catch (err) {
        fail(err)
      }
    })
}
