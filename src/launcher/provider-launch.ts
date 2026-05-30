// Provider launch helpers shared by the v1 run/window runtime.
// These helpers build shell-safe CLI commands and per-provider MCP overrides.

import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Provider } from '../state/types.js'

export function expandHome(p: string): string {
  if (p === '~') return homedir()
  if (p.startsWith('~/')) return join(homedir(), p.slice(2))
  return p
}

export function resolveWorkingDir(requested: string | undefined, fallback: string): string {
  if (!requested) return fallback
  const expanded = expandHome(requested.trim())
  if (!expanded) return fallback
  if (existsSync(expanded) && statSync(expanded).isDirectory()) return expanded
  throw new Error(`Working directory does not exist: ${expanded}`)
}

export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`
}

const TEST_RUNNER_PATTERN = /(\bvitest\b|\bjest\b|\bmocha\b|\bava\b|\/\.pnpm\/|node_modules\/.+\/workers\/)/i

export function resolveReevesMcpCommand(argv1: string | undefined = process.argv[1]): string {
  if (argv1 && !TEST_RUNNER_PATTERN.test(argv1)) return argv1
  try {
    const here = fileURLToPath(import.meta.url)
    const cliPath = join(dirname(here), 'cli.js')
    if (existsSync(cliPath)) return cliPath
  } catch {
    // fall through to PATH lookup
  }
  return 'reevesagents'
}

function tomlInlineString(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function tomlInlineArray(values: string[]): string {
  return `[${values.map(tomlInlineString).join(',')}]`
}

export function reevesMcpServerLaunch(command = resolveReevesMcpCommand(), node = process.execPath): { command: string, args: string[] } {
  if (isAbsolute(command) || command.endsWith('.js')) return { command: node, args: [command, 'mcp'] }
  return { command, args: ['mcp'] }
}

export function codexMcpEnvOverride(vars: Record<string, string>): string {
  const env = Object.entries(vars)
    .map(([key, value]) => `${key}=${tomlInlineString(value)}`)
    .join(',')
  return `mcp_servers.reevesagents.env={${env}}`
}

export function codexMcpOverrides(vars: Record<string, string>, command = resolveReevesMcpCommand()): string[] {
  const launch = reevesMcpServerLaunch(command)
  return [
    '-c',
    `mcp_servers.reevesagents.command=${tomlInlineString(launch.command)}`,
    '-c',
    `mcp_servers.reevesagents.args=${tomlInlineArray(launch.args)}`,
    '-c',
    codexMcpEnvOverride(vars),
  ]
}

export function claudeMcpConfig(vars: Record<string, string>, command = resolveReevesMcpCommand()): Record<string, unknown> {
  const launch = reevesMcpServerLaunch(command)
  return {
    mcpServers: {
      reevesagents: {
        command: launch.command,
        args: launch.args,
        env: vars,
      },
    },
  }
}

export function oneShotRunnerSource(command: string[]): string {
  return [
    "import { spawn } from 'node:child_process'",
    `const command = ${JSON.stringify(command)}`,
    'const [bin, ...args] = command',
    "const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], env: process.env })",
    'child.stdout.pipe(process.stdout)',
    'child.stderr.pipe(process.stderr)',
    "child.on('error', err => { console.error(err instanceof Error ? err.message : String(err)); process.exit(1) })",
    "child.on('exit', (code, signal) => { if (signal) { console.error(`[reevesagents] child terminated by ${signal}`); process.exit(1) } process.exit(code ?? 1) })",
    '',
  ].join('\n')
}

export function launchCommandWithInitialTask(provider: Provider, cmd: string[], task: string): string[] {
  void provider
  void task
  return cmd
}

export function fullLaunchShellCommand(provider: Provider, envPrefix: string, launchCmd: string[], task: string): string {
  void provider
  void task
  const command = launchCmd.map(shellQuote).join(' ')
  return `${envPrefix} && exec ${command}`
}
