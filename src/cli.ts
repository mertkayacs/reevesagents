// CLI entry point. No args launches TUI; subcommands provide operator control.
// Inputs: process.argv. Outputs: TUI render or stdout text/JSON.
// Invariant: this package exposes the stable agent-run surface only.

import { Command } from 'commander'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { prepareTuiColorEnv } from './utils/color-env.js'
import { runDoctor } from './launcher/doctor.js'
import { peekAgent, startRun, startRunFromPreset, spawnWorker, stopRun, killAgent, sendText, sendKey, interrupt, type AllowedKey, ALLOWED_KEYS } from './launcher/runtime.js'
import { normalizeProvider, PROVIDERS, detectAvailable } from './launcher/providers.js'
import {
  autoCleanupRuns,
  listAgents,
  listRuns,
  readRun,
  computeRunStatus,
  runHasLiveTmuxTarget,
  deleteAgent,
  archiveAndRemoveRun,
  listRunHistory,
  deleteRunHistory,
} from './state/runs.js'
import { listRunApprovals, resolveRunApproval } from './state/approvals.js'
import { loadConfig, setConfigValues, parseConfigValue, CONFIG_FIELDS } from './state/config.js'
import { listSavedTrees, savePresetFromRun, deleteSavedTree } from './state/store.js'
import { MODEL_CATALOG } from './launcher/model-catalog.js'
import { hostStatus, attach, attachAll, detach } from './agent-mcp/installer.js'
import { writeTuiOpenToken } from './state/tui-open.js'
import { REEVESAGENTS_VERSION } from './version.js'
import { providerDisplayName, providerColor } from './utils/display.js'
import type { AgentRecord, AuthMode, Effort, Provider, RunRecord } from './state/types.js'

const program = new Command()

program
  .name('reevesagents')
  .description('local tmux-first workspace manager for AI CLI agents')
  .version(REEVESAGENTS_VERSION)

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
  if (matches.length > 1) throw new Error(`ambiguous agent id: ${matches.map(agent => agent.id).join(', ')}`)
  throw new Error(`agent not found: ${id}`)
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

function parseAgentSpec(spec: string): { provider: Provider; nickname?: string; model: string } {
  const [providerRaw = '', nickname, model = ''] = spec.split(':')
  const provider = normalizeProvider(providerRaw)
  if (!provider) {
    throw new Error(`agent spec must start with a supported provider name: ${PROVIDERS.map(providerDisplayName).join(', ')}: ${spec}`)
  }
  return { provider, nickname: nickname || undefined, model }
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
  .action((agentSpecs: string[], opts) => {
    try {
      const specs = agentSpecs.length > 0 ? agentSpecs : ['codex']
      const parsed = specs.map(parseAgentSpec)
      const permissions = opts.skip ? 'skip' as const : undefined
      const auth_mode = parseAuthModeOpt(opts.authMode)
      const effort = parseEffortOpt(opts.effort)
      if (opts.run) {
        const run = resolveRun(opts.run)
        const agents = parsed.map(spec => spawnWorker({
          run_id: run.id,
          provider: spec.provider,
          nickname: spec.nickname,
          model: spec.model,
          task: opts.prompt,
          permissions,
          auth_mode,
          effort,
        }))
        console.log(`added ${agents.length} agents to ${run.id.slice(0, 8)}  ${run.name}`)
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
        },
        workers: rest.map(spec => ({
          provider: spec.provider,
          nickname: spec.nickname,
          model: spec.model,
          task: opts.prompt,
          permissions,
          auth_mode,
          effort,
        })),
      })
      console.log(`started ${result.run.id.slice(0, 8)}  ${result.run.name}  ${result.agents.length} agents`)
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

program
  .command('open <id>')
  .description('open a run tmux tab set or an agent window')
  .action((id) => {
    openTarget(id)
  })

program
  .command('peek <agent-id>')
  .description('show recent output from one agent')
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
      console.error(`no output for agent ${agent.id}`)
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
  .command('kill <agent-id>')
  .description('stop one agent')
  .option('-y, --yes', 'confirm stop')
  .action((id, opts) => {
    requireDestructiveConfirmation(opts, 'stop agent')
    const agent = resolveAgent(id)
    const killed = killAgent(agent.id)
    console.log(`stopped ${killed.id.slice(0, 8)}  ${killed.nickname}`)
  })

program
  .command('send <agent-id> <text...>')
  .description('paste text into an agent')
  .action((id, textParts: string[]) => {
    try {
      const agent = resolveAgent(id)
      sendText(agent.id, textParts.join(' '))
      console.log(`sent to ${agent.id.slice(0, 8)}  ${agent.nickname}`)
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err))
      process.exit(1)
    }
  })

program
  .command('key <agent-id> <key>')
  .description(`send a single keypress to an agent (${ALLOWED_KEYS.join(', ')})`)
  .action((id, key: string) => {
    try {
      const agent = resolveAgent(id)
      if (!ALLOWED_KEYS.includes(key as AllowedKey)) {
        throw new Error(`unsupported key: ${key} (allowed: ${ALLOWED_KEYS.join(', ')})`)
      }
      sendKey(agent.id, key as AllowedKey)
      console.log(`sent ${key} to ${agent.id.slice(0, 8)}  ${agent.nickname}`)
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err))
      process.exit(1)
    }
  })

program
  .command('interrupt <agent-id>')
  .description('send an interrupt (ctrl-c) to an agent')
  .action((id) => {
    try {
      const agent = resolveAgent(id)
      interrupt(agent.id)
      console.log(`interrupted ${agent.id.slice(0, 8)}  ${agent.nickname}`)
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err))
      process.exit(1)
    }
  })

program
  .command('delete <agent-id>')
  .description('delete an ended agent')
  .option('-y, --yes', 'confirm delete')
  .action((id, opts) => {
    requireDestructiveConfirmation(opts, 'delete agent')
    const agent = resolveAgent(id)
    const deleted = deleteAgent(agent.id)
    console.log(`deleted ${deleted.id.slice(0, 8)}  ${deleted.nickname}`)
  })

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

program
  .command('providers')
  .description('list providers with availability and known models')
  .option('--json', 'output JSON array')
  .option('--models', "also print each provider's known models")
  .action((opts) => {
    const available = detectAvailable()
    const providers = PROVIDERS.map(id => ({
      id,
      name: providerDisplayName(id),
      available: available[id],
      color: providerColor(id),
      models: [...MODEL_CATALOG[id].models],
    }))
    if (opts.json) {
      console.log(JSON.stringify(providers, null, 2))
      return
    }
    for (const provider of providers) {
      console.log(`${(provider.available ? 'ok' : '--').padEnd(3)} ${provider.id.padEnd(10)} ${provider.name}`)
      if (opts.models) {
        for (const model of provider.models) console.log(`      ${model}`)
      }
    }
  })

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

program
  .command('attach [cli]')
  .description('attach the reevesagents MCP to one CLI, or all installed when omitted')
  .action((cli: string | undefined) => {
    try {
      const results = cli ? [attach(cli)] : attachAll()
      if (results.length === 0) {
        console.log('no installed CLIs to attach')
        return
      }
      for (const result of results) {
        console.log(`${(result.ok ? 'ok' : '--').padEnd(3)} ${result.key.padEnd(10)} ${result.message}`)
      }
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err))
      process.exit(1)
    }
  })

program
  .command('detach <cli>')
  .description('detach the reevesagents MCP from one CLI')
  .action((cli: string) => {
    try {
      const result = detach(cli)
      console.log(`${(result.ok ? 'ok' : '--').padEnd(3)} ${result.key.padEnd(10)} ${result.message}`)
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err))
      process.exit(1)
    }
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

program
  .command('agents [run-id]')
  .description('list agents, optionally only those in one run')
  .option('--json', 'output JSON array')
  .action((runId: string | undefined, opts) => {
    try {
      const run = runId ? resolveRun(runId) : undefined
      const agents = listAgents(run?.id)
      if (opts.json) {
        console.log(JSON.stringify(agents, null, 2))
        return
      }
      if (agents.length === 0) {
        console.log('no agents')
        return
      }
      for (const agent of agents) {
        const note = agent.task_note.trim()
        console.log(`${agent.id.slice(0, 8)}  ${agent.run_id.slice(0, 8)}  ${agent.role.padEnd(6)}  ${agent.task_status.padEnd(7)}  ${providerDisplayName(agent.provider).padEnd(14)}  ${(agent.model || 'default').padEnd(16)}  ${agent.nickname}${note ? `  ${note}` : ''}`)
      }
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err))
      process.exit(1)
    }
  })

program
  .command('config [key] [value]')
  .description(`show config, get one value, or set one (keys: ${CONFIG_FIELDS.map(field => field.key).join(', ')})`)
  .option('--json', 'output JSON for show or get')
  .action((key: string | undefined, value: string | undefined, opts) => {
    try {
      if (key !== undefined && value !== undefined) {
        const cfg = setConfigValues({ [key]: parseConfigValue(key, value) })
        const saved = cfg.global as unknown as Record<string, unknown>
        console.log(`${key} = ${String(saved[key])}`)
        return
      }
      const cfg = loadConfig()
      const global = cfg.global as unknown as Record<string, unknown>
      if (key !== undefined) {
        if (!CONFIG_FIELDS.some(field => field.key === key)) throw new Error(`unknown config field: ${key}`)
        console.log(opts.json ? JSON.stringify(global[key]) : String(global[key]))
        return
      }
      if (opts.json) {
        console.log(JSON.stringify(cfg.global, null, 2))
        return
      }
      for (const field of CONFIG_FIELDS) {
        console.log(`${field.key.padEnd(20)} ${String(global[field.key])}`)
      }
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err))
      process.exit(1)
    }
  })

program
  .command('presets')
  .description('list saved presets')
  .option('--json', 'output JSON array')
  .action((opts) => {
    const presets = listSavedTrees()
    if (opts.json) {
      console.log(JSON.stringify(presets, null, 2))
      return
    }
    if (presets.length === 0) {
      console.log('no presets')
      return
    }
    for (const preset of presets) {
      console.log(`${preset.name.padEnd(24)}  ${String(1 + preset.workers.length).padStart(2)} agents  ${preset.description}`)
    }
  })

program
  .command('save-preset <run-id> <name> [description...]')
  .description('save a run as a reusable preset')
  .action((runId: string, name: string, description: string[]) => {
    try {
      const run = resolveRun(runId)
      const tree = savePresetFromRun(run.id, name, description.join(' '))
      console.log(`saved preset ${tree.name}  ${1 + tree.workers.length} agents`)
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err))
      process.exit(1)
    }
  })

program
  .command('delete-preset <name>')
  .description('delete a saved preset')
  .option('-y, --yes', 'confirm delete')
  .action((name: string, opts) => {
    requireDestructiveConfirmation(opts, 'delete preset')
    if (!listSavedTrees().some(preset => preset.name === name)) throw new Error(`preset not found: ${name}`)
    deleteSavedTree(name)
    console.log(`deleted preset ${name}`)
  })

program
  .command('start-preset <name>')
  .description('start a run from a saved preset')
  .option('--name <name>', 'override the run name')
  .option('--cwd <dir>', 'working directory', process.cwd())
  .action((name: string, opts) => {
    try {
      if (!listSavedTrees().some(preset => preset.name === name)) throw new Error(`preset not found: ${name}`)
      const result = startRunFromPreset(name, { name: opts.name, working_dir: opts.cwd })
      console.log(`started ${result.run.id.slice(0, 8)}  ${result.run.name}  ${result.agents.length} agents`)
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err))
      process.exit(1)
    }
  })

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

program
  .command('mcp')
  .description('start the agent control MCP server over stdio (for CLIs that have it attached)')
  .action(async () => {
    try {
      const { startAgentMcpServer } = await import('./agent-mcp/server.js')
      await startAgentMcpServer()
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err))
      process.exit(1)
    }
  })

async function runWeb(opts: { port?: string; open?: boolean }): Promise<void> {
  const { checkWebExtras, webExtrasMessage } = await import('./web/extras.js')
  const extras = await checkWebExtras()
  if (!extras.ok) {
    console.error(webExtrasMessage(extras.missing))
    process.exit(1)
  }
  const { startWebServer } = await import('./web/server.js')
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

async function renderTui(): Promise<void> {
  prepareTuiColorEnv()
  const [{ default: React }, { render }, { Router }] = await Promise.all([
    import('react'),
    import('ink'),
    import('./router.js'),
  ])
  try {
    await render(React.createElement(Router), { alternateScreen: false }).waitUntilExit()
  } finally {
    const { closeTuiWebServer } = await import('./web/tui-launch.js')
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
    return fileURLToPath(import.meta.url) === entry
  } catch {
    return false
  }
}

export { program }

if (isEntrypoint()) runCli()
