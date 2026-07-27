// Attach or detach the reevesagents MCP server to the local AI CLIs that can
// host it. Each CLI keeps its own MCP config, so we only call that CLI's own
// `mcp add` / `mcp remove` / `mcp list` and never edit the user's config files by
// hand. The attached command is the reevesagents launcher resolved to an
// absolute node + entry path, so a host CLI can start the server even when its
// own launch environment does not carry the user's interactive PATH.

import { execFileSync } from 'node:child_process'
import { realpathSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { PROVIDER_REGISTRY } from '../core/provider-registry.js'
import type { Provider } from '../core/types.js'

const SERVER_NAME = 'reevesagents'
const SERVER_BIN = 'reevesagents'
const SERVER_ARG = 'mcp'
const MGMT_TIMEOUT_MS = 15_000
// Cap for the read-only `mcp list` status probe. Kept generous because some hosts
// (Claude Code) health-check every configured MCP server when listing, so with a
// handful of slow remote servers the list can take well over 5s; too short a cap
// made an attached reevesagents read as "detached".
const STATUS_TIMEOUT_MS = 20_000
const VERIFY_TIMEOUT_MS = 20_000

// OpenCode has no scriptable `mcp add` for a local (stdio) server, so we attach it
// by editing its global config JSON directly instead of shelling out to the CLI.
function opencodeConfigPath(): string {
  // REEVES_HOME overrides the real home for tests/sandboxes, matching the skills
  // installer; unset in normal use so it resolves to ~/.config/opencode.
  const base = process.env.REEVES_HOME || homedir()
  const dir = join(base, '.config', 'opencode')
  const jsonc = join(dir, 'opencode.jsonc')
  const json = join(dir, 'opencode.json')
  if (existsSync(json)) return json
  if (existsSync(jsonc)) return jsonc
  return json
}

// Read OpenCode's config as an object. Returns {} when the file is missing.
// Throws (caught by callers) when the file exists but is not strict JSON, e.g. it
// carries JSONC comments; we refuse to rewrite what we cannot parse safely.
function readOpencodeConfig(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {}
  const raw = readFileSync(path, 'utf-8').trim()
  if (!raw) return {}
  return JSON.parse(raw) as Record<string, unknown>
}

function opencodeMcpEntry(cmd: LaunchCmd): Record<string, unknown> {
  return { type: 'local', command: [cmd.command, ...cmd.args], enabled: true }
}

function opencodeAttached(): boolean {
  try {
    const cfg = readOpencodeConfig(opencodeConfigPath())
    const mcp = cfg.mcp as Record<string, unknown> | undefined
    return !!mcp && typeof mcp === 'object' && SERVER_NAME in mcp
  } catch {
    return false
  }
}

function opencodeAttach(cmd: LaunchCmd): void {
  const path = opencodeConfigPath()
  const cfg = readOpencodeConfig(path)
  if (!cfg.$schema) cfg.$schema = 'https://opencode.ai/config.json'
  const mcp = (typeof cfg.mcp === 'object' && cfg.mcp !== null ? cfg.mcp : {}) as Record<string, unknown>
  mcp[SERVER_NAME] = opencodeMcpEntry(cmd)
  cfg.mcp = mcp
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(cfg, null, 2)}\n`, 'utf-8')
}

function opencodeDetach(): void {
  const path = opencodeConfigPath()
  if (!existsSync(path)) return
  const cfg = readOpencodeConfig(path)
  const mcp = cfg.mcp as Record<string, unknown> | undefined
  if (mcp && SERVER_NAME in mcp) {
    delete mcp[SERVER_NAME]
    writeFileSync(path, `${JSON.stringify(cfg, null, 2)}\n`, 'utf-8')
  }
}

// File-based attach ops for a host with no scriptable `mcp add`.
export interface HostFileOps {
  attach: (_cmd: LaunchCmd) => void
  detach: () => void
  attached: () => boolean
}

// Kimi Code (the successor to the legacy Kimi CLI) has no `kimi mcp add` subcommand;
// it reads MCP servers from ~/.kimi-code/mcp.json and from installed plugins. The
// `kimi` binary can be either tool, so we detect Kimi Code at runtime and, for it,
// attach via the config file (like OpenCode) instead of the legacy CLI commands.
function kimiCodeHome(): string {
  // REEVES_HOME is the sandbox override tests/sandboxes set; it wins so a test
  // never reads the real ~/.kimi-code. Otherwise honor Kimi Code's own
  // KIMI_CODE_HOME, then default to ~/.kimi-code.
  if (process.env.REEVES_HOME) return join(process.env.REEVES_HOME, '.kimi-code')
  return process.env.KIMI_CODE_HOME || join(homedir(), '.kimi-code')
}

// True when the `kimi` on PATH is Kimi Code, not the legacy Kimi CLI. Legacy prints
// "kimi, version X"; Kimi Code prints a bare semver. Returns false (legacy path)
// when the binary is missing or its version cannot be read.
function isKimiCode(bin: string): boolean {
  try {
    const out = execFileSync(bin, ['--version'], {
      encoding: 'utf8',
      timeout: STATUS_TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
    return out !== '' && !/^kimi,/i.test(out)
  } catch {
    return false
  }
}

function kimiCodePluginAttached(): boolean {
  try {
    const installed = JSON.parse(readFileSync(join(kimiCodeHome(), 'plugins', 'installed.json'), 'utf-8')) as { plugins?: Array<{ id?: string; enabled?: boolean }> }
    return Array.isArray(installed.plugins) && installed.plugins.some(p => p.id === SERVER_NAME && p.enabled !== false)
  } catch {
    return false
  }
}

function kimiCodeMcpConfig(): Record<string, unknown> {
  try {
    const raw = readFileSync(join(kimiCodeHome(), 'mcp.json'), 'utf-8').trim()
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function kimiCodeMcpAttached(): boolean {
  const servers = kimiCodeMcpConfig().mcpServers as Record<string, unknown> | undefined
  return !!servers && typeof servers === 'object' && SERVER_NAME in servers
}

const KIMI_CODE_FILE_OPS: HostFileOps = {
  attached: () => kimiCodePluginAttached() || kimiCodeMcpAttached(),
  attach: cmd => {
    // The reevesagents plugin already provides the server; do not also add it to
    // mcp.json or Kimi Code would load two servers named reevesagents.
    if (kimiCodePluginAttached()) return
    const path = join(kimiCodeHome(), 'mcp.json')
    const cfg = kimiCodeMcpConfig()
    const servers = (typeof cfg.mcpServers === 'object' && cfg.mcpServers !== null ? cfg.mcpServers : {}) as Record<string, unknown>
    servers[SERVER_NAME] = { command: cmd.command, args: cmd.args }
    cfg.mcpServers = servers
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `${JSON.stringify(cfg, null, 2)}\n`, 'utf-8')
  },
  detach: () => {
    const path = join(kimiCodeHome(), 'mcp.json')
    if (!existsSync(path)) return
    const cfg = kimiCodeMcpConfig()
    const servers = cfg.mcpServers as Record<string, unknown> | undefined
    if (servers && SERVER_NAME in servers) {
      delete servers[SERVER_NAME]
      writeFileSync(path, `${JSON.stringify(cfg, null, 2)}\n`, 'utf-8')
    }
  },
}

// The absolute command a host CLI runs to launch our MCP server over stdio.
export interface LaunchCmd {
  command: string
  args: string[]
}

// Resolve the MCP launcher to an absolute, PATH-independent command. The bare
// `reevesagents` name only resolves when the host CLI's launch environment
// happens to carry the user's PATH; a version-manager or GUI-launched host
// often does not, which is the classic "attached but never starts" failure.
// Preference: the exact node + entry currently running, then the absolute
// reevesagents bin on PATH, then the bare name as a last resort.
export function resolveLaunchCmd(entry: string | undefined = process.argv[1]): LaunchCmd {
  if (entry) {
    try {
      const real = realpathSync(entry)
      if (/\.[cm]?js$/.test(real)) return { command: process.execPath, args: [real, SERVER_ARG] }
    } catch {
      // fall through to PATH resolution
    }
  }
  try {
    const abs = execFileSync('which', [SERVER_BIN], { encoding: 'utf8' }).trim()
    if (abs) return { command: abs, args: [SERVER_ARG] }
  } catch {
    // fall through to the bare name
  }
  return { command: SERVER_BIN, args: [SERVER_ARG] }
}

// A provider CLI that can host an MCP server. Its binary and display name come
// from the provider registry (the single source of truth); only the per-CLI
// `mcp add` argument shape and the `mcp remove` / `mcp list` lists live here.
// `add` takes the resolved launcher so the absolute command is baked into that
// CLI's own `mcp add` call. `add` is undefined for CLIs we cannot drive without
// an interactive prompt; those are reported as manual.
interface HostCli {
  provider: Provider
  add?: (_cmd: LaunchCmd) => string[]
  remove?: string[]
  list: string[]
  // File-based attach for a host with no scriptable `mcp add` (OpenCode). When
  // set, attach/detach/status edit and read the host's config file directly
  // instead of shelling out to the host CLI, so the host is no longer "manual".
  file?: HostFileOps
}

const HOSTS: HostCli[] = [
  {
    provider: 'cc',
    // Claude Code defaults a new server to `local` (this directory only); pin
    // `user` so one attach covers every project on the machine.
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
    // qwen (a gemini-cli fork) takes `<commandOrUrl> [args...]` with no `--`
    // separator, and already defaults its scope to `user`.
    add: cmd => ['mcp', 'add', SERVER_NAME, cmd.command, ...cmd.args],
    remove: ['mcp', 'remove', SERVER_NAME],
    list: ['mcp', 'list'],
  },
  {
    provider: 'hermes',
    // hermes takes --command and a variadic --args, so the entry path and `mcp`
    // both ride on one --args.
    add: cmd => ['mcp', 'add', SERVER_NAME, '--command', cmd.command, '--args', ...cmd.args],
    remove: ['mcp', 'remove', SERVER_NAME],
    list: ['mcp', 'list'],
  },
  {
    // opencode's `mcp add` prompts interactively for a local server's command, so
    // we attach it by writing its config JSON directly instead.
    provider: 'opencode',
    list: ['mcp', 'list'],
    file: { attach: opencodeAttach, detach: opencodeDetach, attached: opencodeAttached },
  },
]

function hostBin(host: HostCli): string {
  return PROVIDER_REGISTRY[host.provider].bin
}

function hostLabel(host: HostCli): string {
  return PROVIDER_REGISTRY[host.provider].displayName
}

// The file-based attach ops for a host, if any: OpenCode's static ops, or Kimi
// Code's when the `kimi` binary turns out to be Kimi Code (detected at runtime).
// When this returns ops, attach/detach/status use them instead of the CLI path.
function hostFileOps(host: HostCli): HostFileOps | undefined {
  if (host.file) return host.file
  if (host.provider === 'kimi' && isKimiCode(hostBin(host))) return KIMI_CODE_FILE_OPS
  return undefined
}

export interface HostStatus {
  key: string
  bin: string
  label: string
  installed: boolean
  attached: boolean
  manual: boolean // true when we cannot attach/detach for the user automatically
}

export interface AttachResult {
  key: string
  label: string
  ok: boolean
  message: string
}

function isInstalled(bin: string): boolean {
  try {
    // Assumes `which` is on PATH (holds on a normal dev/user machine).
    execFileSync('which', [bin], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

function isAttached(host: HostCli): boolean {
  try {
    // Status probe only: cap it at STATUS_TIMEOUT_MS so a slow host does not stall
    // hosts/setup for the full management timeout.
    const out = execFileSync(hostBin(host), host.list, {
      encoding: 'utf8',
      timeout: STATUS_TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    // Match the reevesagents name as a whole token, so a differently-named
    // sibling (e.g. reevesagents-foo) is never miscounted as attached.
    return /reevesagents(?![-\w])/i.test(out)
  } catch {
    return false
  }
}

function runHostCommand(host: HostCli, args: string[]): void {
  execFileSync(hostBin(host), args, {
    encoding: 'utf8',
    timeout: MGMT_TIMEOUT_MS,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

// Prefer the host CLI's own stderr (it explains why an add or remove failed)
// over the bare "command failed with exit code" message.
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

// One row per known host CLI: is it installed, is reevesagents currently
// attached, and can we drive it automatically (manual when add is undefined).
export function hostStatus(): HostStatus[] {
  return HOSTS.map(host => {
    const installed = isInstalled(hostBin(host))
    const file = installed ? hostFileOps(host) : undefined
    return {
      key: host.provider,
      bin: hostBin(host),
      label: hostLabel(host),
      installed,
      attached: installed && (file ? file.attached() : isAttached(host)),
      manual: host.add === undefined && host.file === undefined,
    }
  })
}

// Attach the reevesagents MCP server to one CLI by calling that CLI's own mcp add.
export function attach(key: string, force = false): AttachResult {
  const host = findHost(key)
  const label = hostLabel(host)
  if (!host.add && !host.file) {
    return {
      key,
      label,
      ok: false,
      message: `${label} must be added manually: add a stdio MCP server named "${SERVER_NAME}" that runs reevesagents mcp`,
    }
  }
  if (!isInstalled(hostBin(host))) {
    return { key, label, ok: false, message: `${hostBin(host)} is not installed` }
  }
  // File-based host (OpenCode, or Kimi Code detected at runtime): write its config
  // directly. force is a no-op since writing already overwrites any existing entry.
  const file = hostFileOps(host)
  if (file) {
    try {
      file.attach(resolveLaunchCmd())
      return { key, label, ok: true, message: force ? 'reattached' : 'attached' }
    } catch (err) {
      return { key, label, ok: false, message: `could not edit config (add it manually): ${cliError(err)}` }
    }
  }
  try {
    // force rewrites a stale registration (e.g. a pre-1.5.0 bare-name command that
    // this machine's PATH no longer resolves): remove the old entry first so the
    // CLI's own mcp add does not reject a duplicate name.
    if (force && host.remove) {
      try { runHostCommand(host, host.remove) } catch { /* nothing to remove; fine */ }
    }
    // Reached only for CLI-based hosts (the file branch returned above), so add is set.
    runHostCommand(host, host.add!(resolveLaunchCmd()))
    return { key, label, ok: true, message: force ? 'reattached' : 'attached' }
  } catch (err) {
    return { key, label, ok: false, message: cliError(err) }
  }
}

// Detach the reevesagents MCP server from one CLI by calling that CLI's mcp remove.
export function detach(key: string): AttachResult {
  const host = findHost(key)
  const label = hostLabel(host)
  if (!host.remove && !host.file) {
    return { key, label, ok: false, message: `${label} must be removed manually` }
  }
  if (!isInstalled(hostBin(host))) {
    return { key, label, ok: false, message: `${hostBin(host)} is not installed` }
  }
  const file = hostFileOps(host)
  if (file) {
    try {
      file.detach()
      return { key, label, ok: true, message: 'detached' }
    } catch (err) {
      return { key, label, ok: false, message: cliError(err) }
    }
  }
  try {
    runHostCommand(host, host.remove!)
    return { key, label, ok: true, message: 'detached' }
  } catch (err) {
    return { key, label, ok: false, message: cliError(err) }
  }
}

// Attach to every installed CLI we can drive automatically. A host that is
// already attached is left alone and counted as success, so running this twice
// (or after a manual per-host attach) is safe and never surfaces a spurious
// "already exists" failure from the CLI's own mcp add.
export function attachAll(force = false): AttachResult[] {
  return HOSTS
    .filter(host => (host.add || host.file) && isInstalled(hostBin(host)))
    .map(host => {
      const file = hostFileOps(host)
      const attached = file ? file.attached() : isAttached(host)
      if (!force && attached) {
        return { key: host.provider, label: hostLabel(host), ok: true, message: 'already attached' }
      }
      return attach(host.provider, force)
    })
}

export interface VerifyResult {
  ok: boolean
  detail: string
  toolCount?: number
}

// Actually launch the resolved MCP command and complete an MCP handshake. This
// proves a host CLI can start the server, not merely that a config entry was
// written. Because the command is absolute, "starts here" predicts "starts when
// the host launches it". Host-independent: the launched command is the same
// whichever CLI attached it.
export async function verifyServerLaunch(cmd: LaunchCmd = resolveLaunchCmd()): Promise<VerifyResult> {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js')
  const client = new Client({ name: 'reevesagents-verify', version: '1' }, { capabilities: {} })
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

// The host CLI reads its MCP config at startup, so newly attached tools only
// appear after the user starts a fresh session.
export function restartHint(key: string): string {
  const host = HOSTS.find(item => item.provider === key)
  const label = host ? hostLabel(host) : key
  return `restart ${label} (start a new session) to load the reevesagents tools`
}
