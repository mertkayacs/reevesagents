// CLI entry point for the native-Windows edition. The drive surface is the MCP
// server, not human subcommands, so this is deliberately small: start the server,
// wire it into host CLIs, and check the environment.
// Inputs: process.argv. Outputs: the MCP server over stdio, or stdout text/JSON.

import { Command } from 'commander'
import { runDoctor } from './core/doctor.js'
import { attach, attachAll, detach, hostStatus, restartHint, verifyServerLaunch } from './mcp/installer.js'
import { startWinMcpServer } from './mcp/server.js'
import { REEVESAGENTS_WIN_VERSION } from './version.js'

const program = new Command()

program
  .name('reevesagents-win')
  .description('MCP-only, ConPTY-driven agent control for native Windows')
  .version(REEVESAGENTS_WIN_VERSION)
  .addHelpText('after', `
First steps:
  reevesagents-win doctor       check Node, the ConPTY binding, and which provider CLIs are installed
  reevesagents-win attach <cli> give a host CLI (cc, codex, kimi, qwen, hermes) the agent-control tools over MCP
  reevesagents-win mcp          run the MCP server over stdio (host CLIs launch this for you)`)

function printChecks(checks: ReturnType<typeof runDoctor>['checks']): void {
  for (const check of checks) {
    const mark = check.status === 'ok' ? 'ok  ' : check.status === 'warn' ? 'warn' : 'FAIL'
    console.log(`  [${mark}] ${check.name}: ${check.detail}`)
  }
}

program
  .command('doctor')
  .description('check Node, the ConPTY binding, provider CLIs, and the registry directory')
  .option('--json', 'output raw JSON')
  .action((opts: { json?: boolean }) => {
    const result = runDoctor()
    const anyFail = result.checks.some(check => check.status === 'fail')
    if (opts.json) {
      // Match the unix `doctor --json` shape ({ ok, checks }) so a script can read
      // either package's output the same way.
      console.log(JSON.stringify({ ok: !anyFail, checks: result.checks }, null, 2))
      if (anyFail) process.exitCode = 1
      return
    }
    printChecks(result.checks)
    if (anyFail) process.exitCode = 1
  })

program
  .command('hosts')
  .description('list AI CLIs that can host the reevesagents-win MCP and whether it is attached')
  .option('--json', 'output raw JSON')
  .action((opts: { json?: boolean }) => {
    const rows = hostStatus()
    if (opts.json) {
      console.log(JSON.stringify(rows, null, 2))
      return
    }
    for (const row of rows) {
      const state = !row.installed ? 'not installed' : row.manual ? 'manual' : row.attached ? 'attached' : 'not attached'
      console.log(`  ${row.key.padEnd(10)} ${row.label.padEnd(16)} ${state}`)
    }
  })

program
  .command('attach')
  .argument('[cli]', 'host key (cc, codex, kimi, qwen, hermes); omit to attach all installed hosts')
  .description('attach the reevesagents-win MCP to a host CLI, then verify it can launch')
  .action(async (cli: string | undefined) => {
    const results = cli ? [attach(cli)] : attachAll()
    if (results.length === 0) {
      console.log('no drivable host CLIs are installed')
      return
    }
    for (const result of results) {
      console.log(`  ${result.ok ? 'ok' : 'FAIL'} ${result.label}: ${result.message}`)
      if (result.ok) console.log(`       ${restartHint(result.key)}`)
    }
    const verified = await verifyServerLaunch()
    console.log(verified.ok ? `  server launch verified: ${verified.detail}` : `  server launch FAILED: ${verified.detail}`)
    if (!results.some(result => result.ok) || !verified.ok) process.exitCode = 1
  })

program
  .command('detach')
  .argument('<cli>', 'host key (cc, codex, kimi, qwen, hermes)')
  .description('detach the reevesagents-win MCP from a host CLI')
  .action((cli: string) => {
    const result = detach(cli)
    console.log(`  ${result.ok ? 'ok' : 'FAIL'} ${result.label}: ${result.message}`)
    if (!result.ok) process.exitCode = 1
  })

program
  .command('setup')
  .description('attach every installed host CLI and verify the server launches')
  .action(async () => {
    printChecks(runDoctor().checks)
    const results = attachAll()
    if (results.length === 0) {
      console.log('no drivable host CLIs are installed; install one and re-run setup')
      return
    }
    for (const result of results) {
      console.log(`  ${result.ok ? 'ok' : 'FAIL'} ${result.label}: ${result.message}`)
    }
    const verified = await verifyServerLaunch()
    console.log(verified.ok ? `  server launch verified: ${verified.detail}` : `  server launch FAILED: ${verified.detail}`)
    if (results.some(result => result.ok)) console.log('  restart the attached CLIs (start a new session) to load the tools')
    if (!results.some(result => result.ok) || !verified.ok) process.exitCode = 1
  })

program
  .command('mcp')
  .description('run the agent-control MCP server over stdio')
  .action(async () => {
    await startWinMcpServer()
  })

program.parseAsync()
