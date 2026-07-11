// Attach or detach the reevesagents-win MCP server to the local AI CLIs that can
// host it. A Windows port of the unix src/mcp/installer.ts: same structure (HOSTS
// table, attach/detach/hostStatus/attachAll, resolveLaunchCmd, verifyServerLaunch),
// with three Windows-specific changes:
//   1. bin discovery uses `where` (which resolves the .cmd shim) instead of `which`;
//   2. host CLIs are .cmd shims, so runHostCommand launches them through cmd.exe /c
//      (execFileSync cannot run a .cmd directly);
//   3. the registered server name is reevesagents-win, and the attach-detection
//      regex only matches reevesagents-win, so this package and the unix reevesagents
//      never mistake each other's registration for their own.
// On non-Windows the same code runs the host bin directly, which keeps the installer
// testable off Windows.

import { execFileSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { PROVIDER_REGISTRY } from '../shared/provider-registry.js'
import type { Provider } from '../shared/types.js'

const SERVER_NAME = 'reevesagents-win'
const SERVER_BIN = 'reevesagents-win'
const SERVER_ARG = 'mcp'
const MGMT_TIMEOUT_MS = 15_000
const VERIFY_TIMEOUT_MS = 20_000

const IS_WINDOWS = process.platform === 'win32'
const LOOKUP = IS_WINDOWS ? 'where' : 'which'

export interface LaunchCmd {
  command: string
  args: string[]
}

// Resolve a bin name to its absolute path via `where`/`which`, taking the first
// match (where can print several lines).
function resolvePath(bin: string): string | null {
  try {
    const out = execFileSync(LOOKUP, [bin], { encoding: 'utf8' }).trim()
    const first = out.split(/\r?\n/).map(line => line.trim()).find(Boolean)
    return first ?? null
  } catch {
    return null
  }
}

// Resolve the MCP launcher to an absolute, PATH-independent command. This matters
// even more on Windows: a host CLI that spawns the bare `reevesagents-win` name (a
// .cmd shim) with execFile cannot start it, so prefer the exact node.exe + entry
// (.js) currently running, then the absolute bin on PATH, then the bare name.
export function resolveLaunchCmd(entry: string | undefined = process.argv[1]): LaunchCmd {
  if (entry) {
    try {
      const real = realpathSync(entry)
      if (/\.[cm]?js$/.test(real)) return { command: process.execPath, args: [real, SERVER_ARG] }
    } catch {
      // fall through to PATH resolution
    }
  }
  const abs = resolvePath(SERVER_BIN)
  if (abs) return { command: abs, args: [SERVER_ARG] }
  return { command: SERVER_BIN, args: [SERVER_ARG] }
}

interface HostCli {
  provider: Provider
  add?: (_cmd: LaunchCmd) => string[]
  remove?: string[]
  list: string[]
}

// The per-CLI `mcp add` shapes are host-defined, not OS-defined, so they carry over
// unchanged from the unix installer.
const HOSTS: HostCli[] = [
  {
    provider: 'cc',
    add: cmd => ['mcp', 'add', SERVER_NAME, '-s', 'user', '--', cmd.command, ...cmd.args],
    remove: ['mcp', 'remove', SERVER_NAME],
    list: ['mcp', 'list'],
  },
  {
    provider: 'codex',
    add: cmd => ['mcp', 'add', SERVER_NAME, '--', cmd.command, ...cmd.args],
    remove: ['mcp', 'remove', SERVER_NAME],
    list: ['mcp', 'list'],
  },
  {
    provider: 'kimi',
    add: cmd => ['mcp', 'add', SERVER_NAME, '--', cmd.command, ...cmd.args],
    remove: ['mcp', 'remove', SERVER_NAME],
    list: ['mcp', 'list'],
  },
  {
    provider: 'qwen',
    add: cmd => ['mcp', 'add', SERVER_NAME, cmd.command, ...cmd.args],
    remove: ['mcp', 'remove', SERVER_NAME],
    list: ['mcp', 'list'],
  },
  {
    provider: 'hermes',
    add: cmd => ['mcp', 'add', SERVER_NAME, '--command', cmd.command, '--args', ...cmd.args],
    remove: ['mcp', 'remove', SERVER_NAME],
    list: ['mcp', 'list'],
  },
  {
    // opencode's `mcp add` prompts interactively and has no remove subcommand.
    provider: 'opencode',
    list: ['mcp', 'list'],
  },
]

function hostBin(host: HostCli): string {
  return PROVIDER_REGISTRY[host.provider].bin
}

function hostLabel(host: HostCli): string {
  return PROVIDER_REGISTRY[host.provider].displayName
}

export interface HostStatus {
  key: string
  bin: string
  label: string
  installed: boolean
  attached: boolean
  manual: boolean
}

export interface AttachResult {
  key: string
  label: string
  ok: boolean
  message: string
}

function isInstalled(bin: string): boolean {
  return resolvePath(bin) !== null
}

// Run one of a host CLI's own mcp subcommands. On Windows the host bin is a .cmd
// shim, so resolve it and launch through cmd.exe /d /s /c; execFileSync cannot run a
// .cmd directly. The only non-constant arg is the resolved launcher path (baked into
// the add argv), so injection risk is limited to that path. On non-Windows we invoke
// the bin directly, which also keeps this testable off Windows.
function runHostCommand(host: HostCli, args: string[]): string {
  const bin = hostBin(host)
  if (IS_WINDOWS) {
    const cmdPath = resolvePath(bin) ?? bin
    const comspec = process.env.ComSpec ?? 'cmd.exe'
    return execFileSync(comspec, ['/d', '/s', '/c', cmdPath, ...args], {
      encoding: 'utf8',
      timeout: MGMT_TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  }
  return execFileSync(bin, args, {
    encoding: 'utf8',
    timeout: MGMT_TIMEOUT_MS,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function isAttached(host: HostCli): boolean {
  try {
    const out = runHostCommand(host, host.list)
    // Match reevesagents-win as a whole token. The negative lookahead means the unix
    // reevesagents (which lacks the -win suffix) is never counted as attached here,
    // and the unix installer's own /reevesagents(?![-\w])/i rejects reevesagents-win.
    return /reevesagents-win(?![-\w])/i.test(out)
  } catch {
    return false
  }
}

function cliError(err: unknown): string {
  const stderr = err && typeof err === 'object' ? (err as { stderr?: unknown }).stderr : undefined
  const text = typeof stderr === 'string'
    ? stderr.trim()
    : Buffer.isBuffer(stderr) ? stderr.toString('utf8').trim() : ''
  return text || (err instanceof Error ? err.message : String(err))
}

function findHost(key: string): HostCli {
  const host = HOSTS.find(item => item.provider === key)
  if (!host) throw new Error(`Unknown CLI: ${key}`)
  return host
}

export function hostStatus(): HostStatus[] {
  return HOSTS.map(host => {
    const installed = isInstalled(hostBin(host))
    return {
      key: host.provider,
      bin: hostBin(host),
      label: hostLabel(host),
      installed,
      attached: installed && isAttached(host),
      manual: host.add === undefined,
    }
  })
}

export function attach(key: string): AttachResult {
  const host = findHost(key)
  const label = hostLabel(host)
  if (!host.add) {
    return {
      key,
      label,
      ok: false,
      message: `${label} must be added manually: in OpenCode, add a stdio MCP server named "${SERVER_NAME}" that runs reevesagents-win mcp`,
    }
  }
  if (!isInstalled(hostBin(host))) {
    return { key, label, ok: false, message: `${hostBin(host)} is not installed` }
  }
  try {
    runHostCommand(host, host.add(resolveLaunchCmd()))
    return { key, label, ok: true, message: 'attached' }
  } catch (err) {
    return { key, label, ok: false, message: cliError(err) }
  }
}

export function detach(key: string): AttachResult {
  const host = findHost(key)
  const label = hostLabel(host)
  if (!host.remove) {
    return { key, label, ok: false, message: `${label} must be removed manually` }
  }
  if (!isInstalled(hostBin(host))) {
    return { key, label, ok: false, message: `${hostBin(host)} is not installed` }
  }
  try {
    runHostCommand(host, host.remove)
    return { key, label, ok: true, message: 'detached' }
  } catch (err) {
    return { key, label, ok: false, message: cliError(err) }
  }
}

// Attach to every installed CLI we can drive automatically. Already-attached hosts
// are left alone and counted as success, so running twice is safe.
export function attachAll(): AttachResult[] {
  return HOSTS
    .filter(host => host.add && isInstalled(hostBin(host)))
    .map(host => {
      if (isAttached(host)) {
        return { key: host.provider, label: hostLabel(host), ok: true, message: 'already attached' }
      }
      return attach(host.provider)
    })
}

export interface VerifyResult {
  ok: boolean
  detail: string
  toolCount?: number
}

// Actually launch the resolved MCP command and complete an MCP handshake, proving a
// host CLI can start the server (the whole ballgame on Windows given .cmd and PATH
// pitfalls), not merely that a config entry was written.
export async function verifyServerLaunch(cmd: LaunchCmd = resolveLaunchCmd()): Promise<VerifyResult> {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js')
  const client = new Client({ name: 'reevesagents-win-verify', version: '1' }, { capabilities: {} })
  const transport = new StdioClientTransport({ command: cmd.command, args: cmd.args, stderr: 'ignore' })
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timed out starting the MCP server')), VERIFY_TIMEOUT_MS)
    timer.unref?.()
  })
  try {
    await Promise.race([client.connect(transport), timeout])
    const listed = await Promise.race([client.listTools(), timeout])
    const toolCount = Array.isArray(listed.tools) ? listed.tools.length : 0
    return { ok: true, detail: `server started, ${toolCount} tools`, toolCount }
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) }
  } finally {
    if (timer) clearTimeout(timer)
    try { await client.close() } catch { /* child already gone */ }
  }
}

export function restartHint(key: string): string {
  const host = HOSTS.find(item => item.provider === key)
  const label = host ? hostLabel(host) : key
  return `restart ${label} (start a new session) to load the reevesagents-win tools`
}
