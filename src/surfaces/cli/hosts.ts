// MCP host commands: hosts, attach, detach, and the stdio mcp server entry.

import type { Command } from 'commander'
import { hostStatus, attach, attachAll, detach, verifyServerLaunch } from '../mcp/installer.js'
import { PROVIDERS, detectAvailable } from '../../core/providers.js'
import { suggestedAgentPrompt } from '../../core/onboard.js'

export function registerHosts(program: Command): void {
  program
    .command('hosts')
    .description('list MCP host CLIs and whether reevesagents is attached')
    .option('--json', 'output JSON array')
    .action((opts) => {
      const hosts = hostStatus()
      if (opts.json) {
        console.log(JSON.stringify(hosts, null, 2))
        return
      }
      for (const host of hosts) {
        const state = !host.installed ? 'absent' : host.attached ? 'attached' : host.manual ? 'manual' : 'detached'
        console.log(`${host.key.padEnd(10)} ${state.padEnd(9)} ${host.label}`)
      }
    })
}

export function registerAttach(program: Command): void {
  program
    .command('attach [cli]')
    .description('attach the reevesagents MCP to one CLI, or all installed when omitted')
    .option('--force', 'rewrite the registration even if already attached (upgrades an old launcher)')
    .action(async (cli: string | undefined, opts: { force?: boolean }) => {
      try {
        const results = cli ? [attach(cli, opts.force)] : attachAll(opts.force)
        if (results.length === 0) {
          console.log('no MCP-capable CLI is installed here.')
          console.log('Install a host CLI (for example Claude Code or Codex) and sign in, then run "reevesagents attach" again.')
          process.exitCode = 1
          return
        }
        for (const result of results) {
          console.log(`${(result.ok ? 'ok' : '--').padEnd(3)} ${result.key.padEnd(10)} ${result.message}`)
        }
        const attached = results.filter(result => result.ok)
        if (attached.length > 0) {
          const verify = await verifyServerLaunch()
          if (verify.ok) {
            console.log(`\nverified: ${verify.detail}.`)
            console.log(`restart ${attached.map(result => result.key).join(', ')} (start a new session) to load the tools,`)
            const available = detectAvailable()
            console.log(`then ask it: "${suggestedAgentPrompt(PROVIDERS.filter(provider => available[provider]))}".`)
          } else {
            console.log(`\nwarning: the entry was written, but the server did not start here: ${verify.detail}`)
            console.log('a host CLI will hit the same error. check that reevesagents is installed and re-run attach.')
            process.exitCode = 1
          }
        } else {
          process.exitCode = 1
        }
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err))
        process.exit(1)
      }
    })
}

export function registerDetach(program: Command): void {
  program
    .command('detach <cli>')
    .description('detach the reevesagents MCP from one CLI')
    .action((cli: string) => {
      try {
        const result = detach(cli)
        console.log(`${(result.ok ? 'ok' : '--').padEnd(3)} ${result.key.padEnd(10)} ${result.message}`)
        if (!result.ok) process.exitCode = 1
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err))
        process.exit(1)
      }
    })
}

export function registerMcp(program: Command): void {
  program
    .command('mcp')
    .description('start the agent control MCP server over stdio (for CLIs that have it attached)')
    .action(async () => {
      try {
        const { startAgentMcpServer } = await import('../mcp/server.js')
        await startAgentMcpServer()
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err))
        process.exit(1)
      }
    })
}
