// Run lifecycle commands: spawn, add, runs, reap, open, stop, plus their
// private parsing/formatting helpers. Shared spec parsing lives here because
// only spawn/add consume it.

import type { Command } from 'commander'
import { execFileSync } from 'node:child_process'
import { sessionExists, windowIds } from '../core/tmux.js'
import { startRun, spawnWorker, stopRun } from '../core/runtime.js'
import { normalizeProvider, PROVIDERS, detectAvailable, coerceExtraArgs } from '../core/providers.js'
import {
  autoCleanupRuns,
  listAgents,
  listRuns,
  latestActiveRun,
  readRun,
  computeRunStatus,
  runHasLiveTmuxTarget,
} from '../core/runs.js'
import { sweepAgents } from '../core/reaper.js'
import { providerDisplayName } from '../utils/display.js'
import { resolveRun, resolveAgent, requireDestructiveConfirmation } from './helpers.js'
import type { AgentRecord, AuthMode, Effort, Provider, RunRecord } from '../core/types.js'

function age(startedAt: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000))
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  return `${Math.floor(seconds / 3600)}h`
}

function resolveOpenTarget(id: string): { run: RunRecord, session: string, windowId: string, label: string } {
  try {
    const run = resolveRun(id)
    return { run, session: run.tmux_session, windowId: 'reeves', label: run.name }
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

function openTarget(id: string): void {
  const target = resolveOpenTarget(id)
  // Stored window ids are only valid inside their recorded session: after a tmux
  // server restart the same "@N" can name an unrelated window, so verify
  // membership before targeting anything.
  if (!sessionExists(target.session)) {
    throw new Error(`tmux session not found: ${target.session}`)
  }
  if (target.windowId.startsWith('@') && !windowIds(target.session).includes(target.windowId)) {
    throw new Error('agent window no longer exists (tmux server may have restarted)')
  }
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

function parseAgentSpec(spec: string): { provider: Provider; nickname?: string; model: string } {
  const [providerRaw = '', nickname, model = ''] = spec.split(':')
  const provider = normalizeProvider(providerRaw)
  if (!provider) {
    throw new Error(
      `unknown provider in "${spec}". Use a provider id: ${PROVIDERS.join(', ')} ` +
      `(aliases like "claude" for cc also work). Run "reevesagents providers" for the full list.`,
    )
  }
  return { provider, nickname: nickname || undefined, model }
}

// The provider used when `spawn` is called with no agent spec. Prefer one that is
// actually installed so a bare `spawn` on, say, a Claude-only machine does not
// default to a codex the user does not have.
function defaultSpawnProvider(): string {
  const available = detectAvailable()
  return PROVIDERS.find(provider => available[provider]) ?? 'codex'
}

const EFFORT_LEVELS: readonly Effort[] = ['default', 'low', 'medium', 'high', 'xhigh', 'max']

function parseAuthModeOpt(value?: string): AuthMode | undefined {
  if (value === undefined) return undefined
  if (value === 'default' || value === 'api-key') return value
  throw new Error('--auth-mode must be default or api-key')
}

function parseEffortOpt(value?: string): Effort | undefined {
  if (value === undefined) return undefined
  if ((EFFORT_LEVELS as readonly string[]).includes(value)) return value as Effort
  throw new Error(`--effort must be one of ${EFFORT_LEVELS.join(', ')}`)
}

// Fail fast before any tmux work when a requested CLI is not on PATH, naming
// every missing one at once instead of the first. Auth cannot be checked without
// launching, so a signed-out CLI still passes here; peek catches that afterwards.
function preflightAvailability(providers: Provider[]): Record<Provider, boolean> {
  const available = detectAvailable()
  const missing = [...new Set(providers)].filter(provider => !available[provider])
  if (missing.length > 0) {
    const names = missing.map(provider => `${providerDisplayName(provider)} (${provider})`).join(', ')
    throw new Error(
      `provider CLI not installed: ${names}\n` +
      `Run "reevesagents doctor" to see what is installed and compatible, or "reevesagents providers" for ids and aliases.\n` +
      `Install the missing CLI and sign in, then run spawn again.`,
    )
  }
  return available
}

function printSpawnAgentLine(agent: AgentRecord): void {
  const role = agent.role === 'root' ? '  (lead)' : ''
  console.log(`  ${agent.id.slice(0, 8)}  ${providerDisplayName(agent.provider).padEnd(14)} ${agent.nickname}${role}`)
}

// Spawn is fire-and-forget: it returns ids, not results. Print the next commands
// with the real ids so an agent can watch and steer without guessing the surface.
function printSpawnHints(run: RunRecord, skip: boolean): void {
  if (!skip) console.log('agents may pause on their own permission prompts; re-run with --skip to launch past them')
  console.log('watch & steer:')
  console.log('  reevesagents peek <agent-id> -n 40    read recent output from an agent')
  console.log('  reevesagents send <agent-id> "text"   paste a message into an agent, then')
  console.log('  reevesagents key  <agent-id> enter    submit it')
  console.log(`  reevesagents runs                     list every run, or  reevesagents open ${run.id.slice(0, 8)}  to open this run in tmux`)
}

function printSpawnJson(run: RunRecord, agents: AgentRecord[]): void {
  console.log(JSON.stringify({
    run: { id: run.id, name: run.name },
    agents: agents.map(agent => ({ id: agent.id, nickname: agent.nickname, provider: agent.provider, role: agent.role })),
  }, null, 2))
}

interface SpawnIntoRunOpts {
  prompt: string
  skip?: boolean
  authMode?: string
  effort?: string
  extraArgs?: string
  json?: boolean
}

// Shared by `spawn --run` and `add`: launch each spec as a worker in an existing
// run and print the result. Both commands expose the same per-agent options.
function spawnIntoRun(
  run: RunRecord,
  parsed: ReturnType<typeof parseAgentSpec>[],
  opts: SpawnIntoRunOpts,
  available: Record<Provider, boolean>,
): void {
  const permissions = opts.skip ? 'skip' as const : undefined
  const auth_mode = parseAuthModeOpt(opts.authMode)
  const effort = parseEffortOpt(opts.effort)
  const extra_args = coerceExtraArgs(opts.extraArgs)
  const agents = parsed.map(spec => spawnWorker({
    run_id: run.id,
    provider: spec.provider,
    nickname: spec.nickname,
    model: spec.model,
    task: opts.prompt,
    permissions,
    auth_mode,
    effort,
    extra_args,
  }, { available }))
  if (opts.json) { printSpawnJson(run, agents); return }
  console.log(`added ${agents.length} agents to ${run.id.slice(0, 8)}  ${run.name}`)
  for (const agent of agents) printSpawnAgentLine(agent)
  printSpawnHints(run, !!opts.skip)
}

export function registerSpawn(program: Command): void {
  program
    .command('spawn [agent...]')
    .description('start a run with one or more provider agents')
    .option('--name <name>', 'run name', 'run')
    .option('--cwd <dir>', 'working directory', process.cwd())
    .option('--prompt <text>', 'initial prompt pasted into each agent', '')
    .option('--skip', 'skip permission prompts for every agent (sets permissions to skip)')
    .option('--run <run-id>', 'add the agents to an existing run instead of starting a new one')
    .option('--auth-mode <mode>', 'auth mode for every agent: default or api-key')
    .option('--effort <level>', 'reasoning effort for every agent: default, low, medium, high, xhigh, max')
    .option('--extra-args <args>', 'extra flags appended to every agent launch, e.g. "--remote-control"')
    .option('--json', 'output JSON: the run id and the spawned agent ids')
    .action((agentSpecs: string[], opts) => {
      try {
        const specs = agentSpecs.length > 0 ? agentSpecs : [defaultSpawnProvider()]
        const parsed = specs.map(parseAgentSpec)
        const available = preflightAvailability(parsed.map(spec => spec.provider))
        const permissions = opts.skip ? 'skip' as const : undefined
        const auth_mode = parseAuthModeOpt(opts.authMode)
        const effort = parseEffortOpt(opts.effort)
        const extra_args = coerceExtraArgs(opts.extraArgs)
        if (opts.run) {
          spawnIntoRun(resolveRun(opts.run), parsed, opts, available)
          return
        }
        const [first, ...rest] = parsed
        const result = startRun({
          name: opts.name,
          working_dir: opts.cwd,
          root: {
            provider: first!.provider,
            nickname: first!.nickname,
            model: first!.model,
            task: opts.prompt,
            permissions,
            auth_mode,
            effort,
            extra_args,
          },
          workers: rest.map(spec => ({
            provider: spec.provider,
            nickname: spec.nickname,
            model: spec.model,
            task: opts.prompt,
            permissions,
            auth_mode,
            effort,
            extra_args,
          })),
        }, { available })
        if (opts.json) { printSpawnJson(result.run, result.agents); return }
        console.log(`started ${result.run.id.slice(0, 8)}  ${result.run.name}  ${result.agents.length} agents`)
        for (const agent of result.agents) printSpawnAgentLine(agent)
        printSpawnHints(result.run, !!opts.skip)
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err))
        process.exit(1)
      }
    })
    .addHelpText('after', `
Agent spec: provider[:nickname[:model]]  (nickname and model are optional)
  The first agent leads the run; the rest join it as workers.
  Provider ids and aliases come from "reevesagents providers"
  (e.g. cc or claude, codex, kimi, qwen, opencode, hermes, pi, aider).

Example: a Claude Code lead with two Codex and one Kimi worker
  reevesagents spawn cc:lead cc:review codex:api codex:tests kimi:docs \\
    --name "feature x" --prompt "Build feature X. Lead coordinates; each worker takes a slice."

Run "reevesagents doctor" first: it reports tmux, Node, and which provider
CLIs are installed and logged in, so a spawn does not fail on a missing CLI.`)
}

export function registerAdd(program: Command): void {
  program
    .command('add [agent...]')
    .description('add agents to the current workspace (the most recent active run)')
    .option('--run <run-id>', 'target a specific run instead of the most recent active one')
    .option('--prompt <text>', 'initial prompt pasted into each agent', '')
    .option('--skip', 'skip permission prompts for every agent (sets permissions to skip)')
    .option('--auth-mode <mode>', 'auth mode for every agent: default or api-key')
    .option('--effort <level>', 'reasoning effort for every agent: default, low, medium, high, xhigh, max')
    .option('--extra-args <args>', 'extra flags appended to every agent launch, e.g. "--remote-control"')
    .option('--json', 'output JSON: the run id and the spawned agent ids')
    .action((agentSpecs: string[], opts) => {
      try {
        if (agentSpecs.length === 0) {
          throw new Error('add needs at least one agent, e.g. "reevesagents add codex"')
        }
        const parsed = agentSpecs.map(parseAgentSpec)
        const available = preflightAvailability(parsed.map(spec => spec.provider))
        const run = opts.run ? resolveRun(opts.run) : latestActiveRun()
        if (!run) {
          throw new Error('no active workspace to add to. Start one with "reevesagents spawn"')
        }
        spawnIntoRun(run, parsed, opts, available)
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err))
        process.exit(1)
      }
    })
    .addHelpText('after', `
Adds agents to a workspace you already have, so you can grow it one at a time
without passing a run id. With no --run it targets your most recent active run.

Example: start a workspace, then keep adding to it
  reevesagents spawn cc
  reevesagents add codex
  reevesagents add kimi:docs

Agents added this way just run side by side; none controls the others unless
you attach the Agent control MCP.`)
}

export function registerRuns(program: Command): void {
  program
    .command('runs')
    .description('list runs')
    .option('--json', 'output JSON array')
    .action((opts) => {
      autoCleanupRuns()
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
        const rootProvider = root ? providerDisplayName(root.provider) : '-'
        console.log(`${run.id.slice(0, 8)}  ${run.view_status.padEnd(7)}  ${'agent run'.padEnd(9)}  ${rootProvider.padEnd(14)}  ${String(agents.length).padStart(2)} ${'agents'.padEnd(9)}  ${age(run.started_at).padEnd(4)}  ${run.name}  ${run.working_dir}${note ? `  ${note}` : ''}`)
      }
    })
}

export function registerReap(program: Command): void {
  program
    .command('reap')
    .description('reap zombie agents: end any whose tmux window is gone or that outlive max_lifetime_ms')
    .option('--json', 'output JSON array of reaped agents')
    .action((opts) => {
      const { reaped } = sweepAgents()
      if (opts.json) {
        console.log(JSON.stringify(reaped, null, 2))
        return
      }
      if (reaped.length === 0) {
        console.log('no zombie agents')
        return
      }
      for (const r of reaped) {
        console.log(`${r.agent_id.slice(0, 8)}  ${r.run_id.slice(0, 8)}  ${r.reason.padEnd(17)}  ${String(Math.round(r.age_ms / 1000)).padStart(5)}s  ${r.nickname}`)
      }
      console.log(`reaped ${reaped.length} ${reaped.length === 1 ? 'agent' : 'agents'}`)
    })
}

export function registerOpen(program: Command): void {
  program
    .command('open <id>')
    .description('open a run tmux tab set or an agent window')
    .action((id) => {
      openTarget(id)
    })
}

export function registerStop(program: Command): void {
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
}
