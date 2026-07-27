// CLI entry point. No args launches TUI; subcommands provide operator control.
// Inputs: process.argv. Outputs: TUI render or stdout text/JSON.
// Invariant: this package exposes the stable agent-run surface only.
// Commands live in per-domain files; registration order here is the --help order.

import { Command } from 'commander'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { prepareTuiColorEnv } from '../utils/color-env.js'
import { writeTuiOpenToken } from '../core/tui-open.js'
import { REEVESAGENTS_VERSION } from '../version.js'
import { openTuiSession } from './tui-launcher.js'
import { registerSpawn, registerAdd, registerRuns, registerReap, registerOpen, registerStop } from './run.js'
import { registerPeek, registerKill, registerSend, registerKey, registerInterrupt, registerDelete, registerAgents } from './agents.js'
import { registerDeleteRun, registerHistory, registerDeleteHistory } from './history.js'
import { registerProviders } from './providers.js'
import { registerApprovals, registerApprove, registerDeny } from './approvals.js'
import { registerSetup, registerSkills, registerDoctor } from './setup.js'
import { registerHosts, registerAttach, registerDetach, registerMcp } from './hosts.js'
import { registerConfig } from './config.js'
import { registerPresets, registerSavePreset, registerDeletePreset, registerStartPreset } from './presets.js'
import { registerWeb } from './web.js'

const program = new Command()

program
  .name('reevesagents')
  .description('local tmux-first workspace manager for AI CLI agents')
  .version(REEVESAGENTS_VERSION)
  .addHelpText('after', `
First steps:
  reevesagents doctor        check tmux, Node, and which provider CLIs are installed
  reevesagents providers     list provider ids and aliases you can spawn
  reevesagents spawn --help   agent spec syntax and a multi-agent example

Let one agent drive others: "reevesagents attach <cli>" gives that CLI the
agent-control tools (spawn, send, read, stop) over MCP. Full agent guide: AGENTS.md.`)

// Original registration order, preserved verbatim: it is the --help order.
registerSpawn(program)
registerAdd(program)
registerRuns(program)
registerReap(program)
registerOpen(program)
registerPeek(program)
registerStop(program)
registerKill(program)
registerSend(program)
registerKey(program)
registerInterrupt(program)
registerDelete(program)
registerDeleteRun(program)
registerHistory(program)
registerDeleteHistory(program)
registerProviders(program)
registerApprovals(program)
registerApprove(program)
registerDeny(program)
registerSetup(program)
registerHosts(program)
registerAttach(program)
registerDetach(program)
registerSkills(program)
registerDoctor(program)
registerAgents(program)
registerConfig(program)
registerPresets(program)
registerSavePreset(program)
registerDeletePreset(program)
registerStartPreset(program)
registerWeb(program)
registerMcp(program)

async function renderTui(): Promise<void> {
  prepareTuiColorEnv()
  const [{ default: React }, { render }, { Router }] = await Promise.all([
    import('react'),
    import('ink'),
    import('../tui/router.js'),
  ])
  try {
    await render(React.createElement(Router), { alternateScreen: false }).waitUntilExit()
  } finally {
    const { closeTuiWebServer } = await import('../web/tui-launch.js')
    await closeTuiWebServer()
  }
  process.exit(0)
}

function runCli(): void {
  process.on('uncaughtException', (err) => {
    process.stderr.write(`[FATAL] ${err.message}\n`)
    process.exit(1)
  })

  const knownSubcommands = new Set(program.commands.map(command => command.name()))
  const firstArg = process.argv[2]

  if (!firstArg || (!knownSubcommands.has(firstArg) && !firstArg.startsWith('--'))) {
    // tmux is required: window-based terminal navigation only works inside a tmux session.
    // If launched outside tmux on an interactive terminal, auto-wrap into a session
    // named "reeves" and re-exec ourselves there. Subsequent launches attach to the
    // same app-owned session and clear unrelated windows there. Set
    // REEVES_NO_TMUX_WRAPPER=1 to skip.
    if (!process.env.TMUX && process.stdout.isTTY && !process.env.REEVES_NO_TMUX_WRAPPER) {
      const wrapperCmd = [process.argv[0], process.argv[1]]
        .filter((arg): arg is string => typeof arg === 'string')
        .map(arg => `'${arg.replace(/'/g, "'\\''")}'`)
        .join(' ')
      try {
        writeTuiOpenToken()
        openTuiSession(wrapperCmd)
        process.exit(0)
      } catch (err) {
        process.stderr.write('reevesagents requires tmux. Install tmux (brew install tmux / apt install tmux) or set REEVES_NO_TMUX_WRAPPER=1 to run without it.\n')
        process.stderr.write(`tmux launch error: ${err instanceof Error ? err.message : String(err)}\n`)
        process.exit(1)
      }
    }
    if (!process.stdout.isTTY) {
      process.stderr.write('reevesagents requires an interactive terminal. Run it in a terminal, or use a subcommand like "reevesagents doctor".\n')
      process.exit(1)
    }
    process.on('SIGTERM', () => process.exit(0))
    if (process.stdout.isTTY) process.stdout.write('\x1b[2J\x1b[H')
    renderTui().catch(err => {
      process.stderr.write(`[FATAL] ${err instanceof Error ? err.message : String(err)}\n`)
      process.exit(1)
    })
  } else {
    program.parse()
  }
}

// Only auto-run when invoked as the binary, not when imported (e.g. by tests).
function isEntrypoint(): boolean {
  const entry = process.argv[1]
  if (!entry) return false
  try {
    // argv[1] may be a bin symlink (npm/global/brew installs) while import.meta.url
    // is already the realpath, so resolve both sides before comparing.
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry)
  } catch {
    return false
  }
}

export { program }

if (isEntrypoint()) runCli()
