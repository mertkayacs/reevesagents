// Detect installed CLIs and register reevesagents as their MCP server.
// Inputs: provider names. Outputs: config file updates for each provider.
// Invariant: registration only updates the reevesagents MCP entry.

import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import type { Provider } from '../../../src/state/types.js'
import { PROVIDERS } from '../../../src/launcher/providers.js'

export interface CliRegistration {
  provider: Provider
  cli: string
  detected: boolean
  registered: boolean
  configPath: string
  note?: string
}

const LABEL: Record<Provider, string> = {
  cc: 'Claude Code',
  codex: 'Codex CLI',
  opencode: 'OpenCode CLI',
  hermes: 'Hermes',
}

const BIN: Record<Provider, string> = {
  cc: 'claude',
  codex: 'codex',
  opencode: 'opencode',
  hermes: 'hermes',
}

function setupHome(): string {
  return process.env.REEVES_SETUP_HOME || homedir()
}

function isBinAvailable(bin: string): boolean {
  try {
    execFileSync('which', [bin], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

// Heuristic match for paths that look like a test runner. process.argv[1]
// is hijacked by vitest/jest workers when this module is imported from a
// test context; writing those paths into a user's real MCP config silently
// breaks every future MCP call. Refuse them.
const TEST_RUNNER_PATTERN = /(\bvitest\b|\bjest\b|\bmocha\b|\bava\b|\/\.pnpm\/|node_modules\/.+\/workers\/)/i

// Paths that embed a Node version (nvm, fnm, volta) break whenever the user
// upgrades Node. Detect and route around them so the MCP config stays stable.
const VERSION_MANAGER_PATTERN = /[/\\](?:\.nvm|\.fnm|fnm|\.volta)[/\\]/

export function isSuspiciousReevesPath(p: string): boolean {
  return TEST_RUNNER_PATTERN.test(p)
}

function isVersionedPath(p: string): boolean {
  return VERSION_MANAGER_PATTERN.test(p)
}

export function resolveReevesPath(argv1: string | undefined = process.argv[1]): string {
  if (argv1 && !isSuspiciousReevesPath(argv1) && !isVersionedPath(argv1)) return argv1
  // argv1 is suspicious or inside a version-manager directory — try the module-relative cli.js.
  try {
    const here = fileURLToPath(import.meta.url)
    const candidate = join(dirname(here), 'cli.js')
    if (!isVersionedPath(candidate)) return candidate
  } catch {
    // ignore
  }
  // Final fallback: bare binary name, relies on shell PATH at MCP launch time.
  // More stable than a versioned absolute path that breaks on Node upgrade.
  return 'reevesagents-orchestrator'
}

function reevesPath(): string {
  return resolveReevesPath()
}

function atomicWrite(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, content, 'utf-8')
  try {
    renameSync(tmp, path)
  } catch {
    writeFileSync(path, content, 'utf-8')
  }
}

function readJson(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {}
  const content = readFileSync(path, 'utf-8')
  try {
    return JSON.parse(content) as Record<string, unknown>
  } catch (err) {
    throw new Error(`Invalid JSON in ${path}: ${err instanceof Error ? err.message : 'parse error'}`, { cause: err })
  }
}

function writeJson(path: string, data: Record<string, unknown>): void {
  atomicWrite(path, JSON.stringify(data, null, 2))
}

function configPath(provider: Provider): string {
  const home = setupHome()
  if (provider === 'cc') return join(home, '.claude', 'settings.json')
  if (provider === 'codex') return join(home, '.codex', 'config.toml')
  if (provider === 'opencode') return join(home, '.config', 'opencode', 'opencode.json')
  return join(home, '.hermes', 'config.yaml')
}

function serverConfig(): { command: string, args: string[] } {
  return { command: reevesPath(), args: ['mcp'] }
}

function registerJson(path: string): void {
  const config = readJson(path)
  const servers = typeof config.mcpServers === 'object' && config.mcpServers !== null
    ? config.mcpServers as Record<string, unknown>
    : {}
  servers.reevesagents = serverConfig()
  config.mcpServers = servers
  writeJson(path, config)
}

function registerOpenCodeJson(path: string): void {
  const config = readJson(path)
  const mcp = typeof config.mcp === 'object' && config.mcp !== null
    ? config.mcp as Record<string, unknown>
    : {}
  const server = serverConfig()
  mcp.reevesagents = {
    type: 'local',
    command: [server.command, ...server.args],
    enabled: true,
  }
  config.mcp = mcp
  writeJson(path, config)
}

function unregisterOpenCodeJson(path: string): void {
  const config = readJson(path)
  if (typeof config.mcp === 'object' && config.mcp !== null) {
    delete (config.mcp as Record<string, unknown>).reevesagents
  }
  writeJson(path, config)
}

function isOpenCodeRegistered(path: string): boolean {
  try {
    const config = readJson(path)
    const servers = config.mcp as Record<string, unknown> | undefined
    return !!servers?.reevesagents
  } catch {
    return false
  }
}

function unregisterJson(path: string): void {
  const config = readJson(path)
  if (typeof config.mcpServers === 'object' && config.mcpServers !== null) {
    delete (config.mcpServers as Record<string, unknown>).reevesagents
  }
  writeJson(path, config)
}

function isJsonRegistered(path: string): boolean {
  try {
    const config = readJson(path)
    const servers = config.mcpServers as Record<string, unknown> | undefined
    return !!servers?.reevesagents
  } catch {
    return false
  }
}

function escapeTomlString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function stripTomlReevesBlock(content: string): string {
  const lines = content.split('\n')
  const out: string[] = []
  let skipping = false

  for (const line of lines) {
    if (/^\[mcp_servers\.reevesagents\]\s*$/.test(line)) {
      skipping = true
      continue
    }
    if (skipping && /^\[/.test(line)) skipping = false
    if (!skipping) out.push(line)
  }

  return out.join('\n').trimEnd()
}

function registerCodexToml(path: string): void {
  const existing = existsSync(path) ? readFileSync(path, 'utf-8') : ''
  const stripped = stripTomlReevesBlock(existing)
  const block = [
    '[mcp_servers.reevesagents]',
    `command = "${escapeTomlString(reevesPath())}"`,
    'args = ["mcp"]',
  ].join('\n')
  atomicWrite(path, `${stripped}${stripped ? '\n\n' : ''}${block}\n`)
}

function unregisterCodexToml(path: string): void {
  const existing = existsSync(path) ? readFileSync(path, 'utf-8') : ''
  atomicWrite(path, `${stripTomlReevesBlock(existing)}\n`)
}

function isTomlRegistered(path: string): boolean {
  try {
    return /^\[mcp_servers\.reevesagents\]\s*$/m.test(readFileSync(path, 'utf-8'))
  } catch {
    return false
  }
}

function quoteYaml(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function stripYamlReevesBlock(content: string): string {
  const lines = content.split('\n')
  const out: string[] = []
  let skipping = false

  for (const line of lines) {
    if (/^ {2}reevesagents:\s*$/.test(line)) {
      skipping = true
      continue
    }
    if (skipping && (/^ {2}[^ ].*:\s*$/.test(line) || /^\S/.test(line))) skipping = false
    if (!skipping) out.push(line)
  }

  return out.join('\n').trimEnd()
}

function registerHermesYaml(path: string): void {
  const existing = existsSync(path) ? readFileSync(path, 'utf-8') : ''
  const stripped = stripYamlReevesBlock(existing)
  const block = [
    '  reevesagents:',
    `    command: ${quoteYaml(reevesPath())}`,
    '    args: ["mcp"]',
  ]

  if (/^mcp_servers:\s*$/m.test(stripped)) {
    const lines = stripped.split('\n')
    const start = lines.findIndex(line => /^mcp_servers:\s*$/.test(line))
    let insertAt = lines.length
    for (let i = start + 1; i < lines.length; i++) {
      if (/^\S/.test(lines[i]!) && lines[i]!.trim() !== '') {
        insertAt = i
        break
      }
    }
    lines.splice(insertAt, 0, ...block)
    atomicWrite(path, `${lines.join('\n').trimEnd()}\n`)
    return
  }

  atomicWrite(path, `${stripped}${stripped ? '\n\n' : ''}mcp_servers:\n${block.join('\n')}\n`)
}

function unregisterHermesYaml(path: string): void {
  const existing = existsSync(path) ? readFileSync(path, 'utf-8') : ''
  atomicWrite(path, `${stripYamlReevesBlock(existing)}\n`)
}

function isYamlRegistered(path: string): boolean {
  try {
    return /^ {2}reevesagents:\s*$/m.test(readFileSync(path, 'utf-8'))
  } catch {
    return false
  }
}

export function register(provider: Provider): CliRegistration {
  const path = configPath(provider)
  const detected = isBinAvailable(BIN[provider])
  if (!detected) {
    return {
      provider,
      cli: LABEL[provider],
      detected,
      registered: false,
      configPath: path,
      note: `${BIN[provider]} binary not found on PATH`,
    }
  }

  try {
    if (provider === 'cc') registerJson(path)
    else if (provider === 'opencode') registerOpenCodeJson(path)
    else if (provider === 'codex') registerCodexToml(path)
    else registerHermesYaml(path)
    return { provider, cli: LABEL[provider], detected, registered: true, configPath: path }
  } catch (e) {
    return {
      provider,
      cli: LABEL[provider],
      detected,
      registered: false,
      configPath: path,
      note: e instanceof Error ? e.message : String(e),
    }
  }
}

export function unregister(provider: Provider): CliRegistration {
  const path = configPath(provider)
  try {
    if (provider === 'cc') unregisterJson(path)
    else if (provider === 'opencode') unregisterOpenCodeJson(path)
    else if (provider === 'codex') unregisterCodexToml(path)
    else unregisterHermesYaml(path)
    return { provider, cli: LABEL[provider], detected: isBinAvailable(BIN[provider]), registered: false, configPath: path }
  } catch (e) {
    return {
      provider,
      cli: LABEL[provider],
      detected: isBinAvailable(BIN[provider]),
      registered: isRegistered(provider),
      configPath: path,
      note: e instanceof Error ? e.message : String(e),
    }
  }
}

export function isRegistered(providerOrPath: Provider | string): boolean {
  if (PROVIDERS.includes(providerOrPath as Provider)) {
    const provider = providerOrPath as Provider
    const path = configPath(provider)
    if (provider === 'cc') return isJsonRegistered(path)
    if (provider === 'opencode') return isOpenCodeRegistered(path)
    if (provider === 'codex') return isTomlRegistered(path)
    return isYamlRegistered(path)
  }

  return isJsonRegistered(providerOrPath)
}

export function registerAll(): CliRegistration[] {
  return PROVIDERS.map(provider => register(provider))
}
