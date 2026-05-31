// CLI entry point. No args launches TUI; subcommands provide operator control.
// Inputs: process.argv. Outputs: TUI render or stdout text/JSON.
// Invariant: this package exposes the stable spawner surface only.

import React from 'react'
import { render } from 'ink'
import { Command } from 'commander'
import { execFileSync } from 'node:child_process'
import { Router } from './router.js'
import { runDoctor } from './launcher/doctor.js'
import { peekAgent, startRun, stopRun, killAgent } from './launcher/runtime.js'
import { listAgents, listRuns, readRun, computeRunStatus, runHasLiveTmuxTarget } from './state/runs.js'
import { writeTuiOpenToken } from './state/tui-open.js'
import type { AgentRecord, Provider, RunRecord } from './state/types.js'

process.on('uncaughtException', (err) => {
  process.stderr.write(`[FATAL] ${err.message}\n`)
  process.exit(1)
})

const program = new Command()

program
  .name('reevesagents')
  .description('local tmux-first workspace manager for AI CLI terminals')
  .version('0.9.0')

function age(startedAt: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000))
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  return `${Math.floor(seconds / 3600)}h`
}

function resolveRun(id: string): RunRecord {
  const runs = listRuns()
  const exact = runs.find(run => run.id === id || run.name === id)
  if (exact) return exact
  const matches = runs.filter(run => run.id.startsWith(id) || run.name.startsWith(id))
  if (matches.length === 1) return matches[0]!
  if (matches.length > 1) throw new Error(`ambiguous run id: ${matches.map(run => run.id).join(', ')}`)
  throw new Error(`run not found: ${id}`)
}

function resolveAgent(id: string): AgentRecord {
  const agents = listAgents()
  const exact = agents.find(agent => agent.id === id || agent.nickname === id)
  if (exact) return exact
  const matches = agents.filter(agent => agent.id.startsWith(id) || agent.nickname.startsWith(id))
  if (matches.length === 1) return matches[0]!
  if (matches.length > 1) throw new Error(`ambiguous terminal id: ${matches.map(agent => agent.id).join(', ')}`)
  throw new Error(`terminal not found: ${id}`)
}

function resolveOpenTarget(id: string): { run: RunRecord, session: string, windowId: string, label: string } {
  try {
    const run = resolveRun(id)
    return { run, session: run.reeves_session ?? run.tmux_session, windowId: run.reeves_window_id, label: run.name }
  } catch {
    const agent = resolveAgent(id)
    return { run: readRun(agent.run_id), session: agent.tmux_session, windowId: agent.tmux_window_id, label: agent.nickname }
  }
}

function quoteShell(s: string): string {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(s)) return s
  return `'${s.replace(/'/g, "'\\''")}'`
}

function tmuxAttachCommand(session: string, windowId: string): string {
  return `tmux select-window -t ${quoteShell(`${session}:${windowId}`)} && tmux attach -t ${quoteShell(session)}`
}

function tmuxSessionExists(session: string): boolean {
  try {
    execFileSync('tmux', ['has-session', '-t', session], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function tmuxWindowIds(session: string): string[] {
  try {
    return execFileSync('tmux', ['list-windows', '-t', session, '-F', '#{window_id}'], { encoding: 'utf8' })
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

interface TmuxWindowInfo {
  id: string
  command: string
}

function tmuxWindowByName(session: string, name: string): TmuxWindowInfo | null {
  try {
    const rows = execFileSync('tmux', ['list-windows', '-t', session, '-F', '#{window_id}\t#{window_name}\t#{pane_current_command}'], { encoding: 'utf8' })
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
    for (const row of rows) {
      const [windowId, windowName, command = ''] = row.split('\t')
      if (windowId && windowName === name) return { id: windowId, command }
    }
  } catch {
    // Session may not exist yet.
  }
  return null
}

function isTuiCommand(command: string): boolean {
  return command === 'node' || command === 'reevesagents'
}

function clearTuiSessionExcept(session: string, keepWindowId: string): void {
  for (const windowId of tmuxWindowIds(session)) {
    if (windowId === keepWindowId) continue
    try {
      execFileSync('tmux', ['kill-window', '-t', windowId], { stdio: 'ignore' })
    } catch {
      // Window may already be gone.
    }
  }
}

function createTuiWindow(session: string, window: string, command: string): string {
  return execFileSync('tmux', [
    'new-window',
    '-d',
    '-P',
    '-F',
    '#{window_id}',
    '-t',
    session,
    '-n',
    window,
    command,
  ], { encoding: 'utf8' }).trim()
}

function openTuiSession(command: string): void {
  const session = 'reeves'
  const window = 'reeves'

  if (!tmuxSessionExists(session)) {
    execFileSync('tmux', ['new-session', '-s', session, '-n', window, command], { stdio: 'inherit' })
    return
  }

  const existing = tmuxWindowByName(session, window)
  if (existing && !isTuiCommand(existing.command)) {
    try { execFileSync('tmux', ['kill-window', '-t', existing.id], { stdio: 'ignore' }) } catch { /* already gone */ }
  }
  const windowId = existing && isTuiCommand(existing.command)
    ? existing.id
    : createTuiWindow(session, window, command)
  execFileSync('tmux', ['select-window', '-t', windowId], { stdio: 'ignore' })
  clearTuiSessionExcept(session, windowId)
  execFileSync('tmux', ['attach', '-t', session], { stdio: 'inherit' })
}

function openTarget(id: string): void {
  const target = resolveOpenTarget(id)
  const tmuxTarget = `${target.session}:${target.windowId}`
  if (process.env.TMUX) {
    execFileSync('tmux', ['switch-client', '-t', tmuxTarget], { stdio: 'ignore' })
    execFileSync('tmux', ['select-window', '-t', tmuxTarget], { stdio: 'ignore' })
    return
  }

  try {
    execFileSync('tmux', ['select-window', '-t', tmuxTarget], { stdio: 'ignore' })
  } catch {
    // selecting before attach is best effort
  }

  if (process.stdin.isTTY && process.stdout.isTTY) {
    execFileSync('tmux', ['attach', '-t', target.session], { stdio: 'inherit' })
    return
  }

  console.log(tmuxAttachCommand(target.session, target.windowId))
}

function destructiveAllowed(opts: { yes?: boolean }): boolean {
  return opts.yes === true || process.env.ALLOW_DESTRUCTIVE === '1'
}

function requireDestructiveConfirmation(opts: { yes?: boolean }, command: string): void {
  if (destructiveAllowed(opts)) return
  throw new Error(`refusing to ${command} without --yes or ALLOW_DESTRUCTIVE=1`)
}

function parseTerminalSpec(spec: string): { provider: Provider; nickname?: string; model: string } {
  const [providerRaw = '', nickname, model = ''] = spec.split(':')
  if (providerRaw !== 'cc' && providerRaw !== 'codex' && providerRaw !== 'opencode' && providerRaw !== 'hermes') {
    throw new Error(`terminal spec must start with cc, codex, opencode, or hermes: ${spec}`)
  }
  return { provider: providerRaw, nickname: nickname || undefined, model }
}

program
  .command('spawn [terminal...]')
  .description('start a spawner run with independent provider CLI terminals')
  .option('--name <name>', 'run name', 'spawner')
  .option('--cwd <dir>', 'working directory', process.cwd())
  .option('--prompt <text>', 'initial prompt pasted into each terminal', '')
  .action((terminalSpecs: string[], opts) => {
    try {
      const specs = terminalSpecs.length > 0 ? terminalSpecs : ['codex']
      const [first, ...rest] = specs.map(parseTerminalSpec)
      const result = startRun({
        mode: 'spawner',
        name: opts.name,
        working_dir: opts.cwd,
        root: {
          provider: first!.provider,
          nickname: first!.nickname,
          model: first!.model,
          task: opts.prompt,
        },
        workers: rest.map(spec => ({
          provider: spec.provider,
          nickname: spec.nickname,
          model: spec.model,
          task: opts.prompt,
        })),
      })
      console.log(`started ${result.run.id.slice(0, 8)}  ${result.run.name}  ${result.agents.length} terminals`)
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err))
      process.exit(1)
    }
  })

program
  .command('runs')
  .description('list runs')
  .option('--json', 'output JSON array')
  .action((opts) => {
    const runs = listRuns().map(run => ({ ...run, view_status: computeRunStatus(run, runHasLiveTmuxTarget(run)) }))
    if (opts.json) {
      console.log(JSON.stringify(runs, null, 2))
      return
    }
    if (runs.length === 0) {
      console.log('no runs')
      return
    }
    for (const run of runs) {
      const agents = listAgents(run.id)
      const root = agents.find(agent => agent.role === 'root')
      const note = agents.find(agent => agent.task_note.trim())?.task_note ?? ''
      const mode = run.mode === 'spawner' ? 'spawn' : 'external'
      const noun = run.mode === 'spawner' ? 'terminals' : 'entries'
      console.log(`${run.id.slice(0, 8)}  ${run.view_status.padEnd(7)}  ${mode.padEnd(9)}  ${(root?.provider ?? '-').padEnd(8)}  ${String(agents.length).padStart(2)} ${noun.padEnd(9)}  ${age(run.started_at).padEnd(4)}  ${run.name}  ${run.working_dir}${note ? `  ${note}` : ''}`)
    }
  })

program
  .command('open <id>')
  .description('open a run reeves window or a terminal window')
  .action((id) => {
    openTarget(id)
  })

program
  .command('peek <terminal-id>')
  .description('show recent output from one terminal')
  .option('-n, --lines <n>', 'number of lines', '20')
  .option('--json', 'output JSON with lines array')
  .action((id, opts) => {
    const agent = resolveAgent(id)
    const lines = Number.parseInt(opts.lines, 10)
    const output = peekAgent(agent.id, Number.isFinite(lines) ? lines : 20)
    if (opts.json) {
      console.log(JSON.stringify({ agent_id: agent.id, lines: output ? output.split('\n') : [] }, null, 2))
      return
    }
    if (!output) {
      console.error(`no output for terminal ${agent.id}`)
      process.exit(1)
    }
    console.log(output)
  })

program
  .command('stop <run-id>')
  .description('stop one run')
  .option('-y, --yes', 'confirm stop')
  .action((id, opts) => {
    requireDestructiveConfirmation(opts, 'stop run')
    const run = resolveRun(id)
    const stopped = stopRun(run.id)
    console.log(`stopped ${stopped.id.slice(0, 8)}  ${stopped.name}`)
  })

program
  .command('kill <terminal-id>')
  .description('close one spawner terminal')
  .option('-y, --yes', 'confirm close')
  .action((id, opts) => {
    requireDestructiveConfirmation(opts, 'close terminal')
    const agent = resolveAgent(id)
    const killed = killAgent(agent.id)
    console.log(`closed ${killed.id.slice(0, 8)}  ${killed.nickname}`)
  })

program
  .command('doctor')
  .description('run setup and environment health checks')
  .option('--json', 'output JSON')
  .action((opts) => {
    const result = runDoctor()
    const anyFail = result.checks.some(check => check.status === 'fail')
    if (opts.json) {
      console.log(JSON.stringify({ ok: !anyFail, checks: result.checks }, null, 2))
    } else {
      for (const check of result.checks) {
        console.log(`${check.status.toUpperCase().padEnd(4)} ${check.name.padEnd(14)} ${check.detail}`)
      }
    }
    process.exit(anyFail ? 1 : 0)
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
  process.on('SIGTERM', () => process.exit(0))
  if (process.stdout.isTTY) process.stdout.write('\x1b[2J\x1b[H')
  render(React.createElement(Router), { alternateScreen: false }).waitUntilExit().then(() => process.exit(0))
} else {
  program.parse()
}
