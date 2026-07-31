// Web UI command: start the on-demand loopback web server.

import type { Command } from 'commander'

async function runWeb(opts: { port?: string; open?: boolean }): Promise<void> {
  const { checkWebExtras, webExtrasMessage } = await import('../webui/extras.js')
  const extras = await checkWebExtras()
  if (!extras.ok) {
    console.error(webExtrasMessage(extras.missing))
    process.exit(1)
  }
  const { startWebServer } = await import('../webui/server.js')
  const parsed = opts.port ? Number.parseInt(opts.port, 10) : undefined
  const handle = await startWebServer({
    port: parsed !== undefined && Number.isFinite(parsed) ? parsed : undefined,
    open: opts.open !== false,
  })
  console.log(`reevesagents web running at ${handle.url}`)
  console.log('press Ctrl+C to stop. agents keep running.')
  const shutdown = (): void => { handle.close().finally(() => process.exit(0)) }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

export function registerWeb(program: Command): void {
  program
    .command('web')
    .description('start the on-demand loopback web UI for agents')
    .option('--port <n>', 'preferred port; falls back to the next free port')
    .option('--no-open', 'do not open the browser')
    .action((opts: { port?: string; open?: boolean }) => {
      runWeb(opts).catch(err => {
        console.error(err instanceof Error ? err.message : String(err))
        process.exit(1)
      })
    })
}
