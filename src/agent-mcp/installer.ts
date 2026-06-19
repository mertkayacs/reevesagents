// Attach or detach the reevesagents MCP server to the local AI CLIs that can
// host it. Each CLI keeps its own MCP config, so we only call that CLI's own
// `mcp add` / `mcp remove` / `mcp list` and never edit the user's config files by
// hand. The attached command is always `reevesagents mcp` with no env and no
// per-CLI flags, so a host CLI gains the tools without learning anything about
// reevesagents.

import { execFileSync } from 'node:child_process'
import { PROVIDER_REGISTRY } from '../launcher/provider-registry.js'
import type { Provider } from '../state/types.js'

const SERVER_NAME = 'reevesagents'
const SERVER_BIN = 'reevesagents'
const SERVER_ARG = 'mcp'
const MGMT_TIMEOUT_MS = 15_000

// A provider CLI that can host an MCP server. Its binary and display name come
// from the provider registry (the single source of truth); only the per-CLI
// `mcp add` / `mcp remove` / `mcp list` argument lists live here. `add` is
// undefined for CLIs we cannot drive without an interactive prompt; those are
// reported as manual.
interface HostCli {
  provider: Provider
  add?: string[]
  remove?: string[]
  list: string[]
}

const HOSTS: HostCli[] = [
  {
    provider: 'cc',
    add: ['mcp', 'add', SERVER_NAME, '--', SERVER_BIN, SERVER_ARG],
    remove: ['mcp', 'remove', SERVER_NAME],
    list: ['mcp', 'list'],
  },
  {
    provider: 'codex',
    add: ['mcp', 'add', SERVER_NAME, '--', SERVER_BIN, SERVER_ARG],
    remove: ['mcp', 'remove', SERVER_NAME],
    list: ['mcp', 'list'],
  },
  {
    provider: 'kimi',
    add: ['mcp', 'add', SERVER_NAME, '--', SERVER_BIN, SERVER_ARG],
    remove: ['mcp', 'remove', SERVER_NAME],
    list: ['mcp', 'list'],
  },
  {
    provider: 'qwen',
    add: ['mcp', 'add', SERVER_NAME, SERVER_BIN, SERVER_ARG],
    remove: ['mcp', 'remove', SERVER_NAME],
    list: ['mcp', 'list'],
  },
  {
    provider: 'hermes',
    add: ['mcp', 'add', SERVER_NAME, '--command', SERVER_BIN, '--args', SERVER_ARG],
    remove: ['mcp', 'remove', SERVER_NAME],
    list: ['mcp', 'list'],
  },
  {
    // opencode's `mcp add` prompts interactively and has no remove subcommand,
    // so we cannot attach or detach it without a prompt. Report it as manual.
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
    execFileSync('which', [bin], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

function isAttached(host: HostCli): boolean {
  try {
    const out = execFileSync(hostBin(host), host.list, {
      encoding: 'utf8',
      timeout: MGMT_TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    // Match the reevesagents name as a token; the reevesagents-orchestrator
    // sibling must not count as attached.
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

// Attach the reevesagents MCP server to one CLI by calling that CLI's own mcp add.
export function attach(key: string): AttachResult {
  const host = findHost(key)
  const label = hostLabel(host)
  if (!host.add) {
    return { key, label, ok: false, message: `${label} must be added manually` }
  }
  if (!isInstalled(hostBin(host))) {
    return { key, label, ok: false, message: `${hostBin(host)} is not installed` }
  }
  try {
    runHostCommand(host, host.add)
    return { key, label, ok: true, message: 'attached' }
  } catch (err) {
    return { key, label, ok: false, message: cliError(err) }
  }
}

// Detach the reevesagents MCP server from one CLI by calling that CLI's mcp remove.
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

// Attach to every installed CLI we can drive automatically. A host that is
// already attached is left alone and counted as success, so running this twice
// (or after a manual per-host attach) is safe and never surfaces a spurious
// "already exists" failure from the CLI's own mcp add.
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
