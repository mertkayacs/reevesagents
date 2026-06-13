// Attach or detach the reevesagents MCP server to the local AI CLIs that can
// host it. Each CLI keeps its own MCP config, so we only call that CLI's own
// `mcp add` / `mcp remove` / `mcp list` and never edit the user's config files by
// hand. The attached command is always `reevesagents mcp` with no env and no
// per-CLI flags, so a host CLI gains the tools without learning anything about
// reevesagents.

import { execFileSync } from 'node:child_process'

const SERVER_NAME = 'reevesagents'
const SERVER_BIN = 'reevesagents'
const SERVER_ARG = 'mcp'
const LIST_TIMEOUT_MS = 15_000

// A CLI that can host an MCP server, with the argument lists for its own
// management commands. `add` is undefined for CLIs we cannot drive without an
// interactive prompt; those are reported as manual.
interface HostCli {
  key: string
  bin: string
  label: string
  add?: string[]
  remove?: string[]
  list: string[]
}

const HOSTS: HostCli[] = [
  {
    key: 'cc',
    bin: 'claude',
    label: 'Claude Code',
    add: ['mcp', 'add', SERVER_NAME, '--', SERVER_BIN, SERVER_ARG],
    remove: ['mcp', 'remove', SERVER_NAME],
    list: ['mcp', 'list'],
  },
  {
    key: 'codex',
    bin: 'codex',
    label: 'Codex CLI',
    add: ['mcp', 'add', SERVER_NAME, '--', SERVER_BIN, SERVER_ARG],
    remove: ['mcp', 'remove', SERVER_NAME],
    list: ['mcp', 'list'],
  },
  {
    key: 'kimi',
    bin: 'kimi',
    label: 'Kimi Code',
    add: ['mcp', 'add', SERVER_NAME, '--', SERVER_BIN, SERVER_ARG],
    remove: ['mcp', 'remove', SERVER_NAME],
    list: ['mcp', 'list'],
  },
  {
    key: 'qwen',
    bin: 'qwen',
    label: 'Qwen Code',
    add: ['mcp', 'add', SERVER_NAME, SERVER_BIN, SERVER_ARG],
    remove: ['mcp', 'remove', SERVER_NAME],
    list: ['mcp', 'list'],
  },
  {
    key: 'hermes',
    bin: 'hermes',
    label: 'Hermes',
    add: ['mcp', 'add', SERVER_NAME, '--command', SERVER_BIN, '--args', SERVER_ARG],
    remove: ['mcp', 'remove', SERVER_NAME],
    list: ['mcp', 'list'],
  },
  {
    // opencode's `mcp add` prompts interactively and has no remove subcommand,
    // so we cannot attach or detach it without a prompt. Report it as manual.
    key: 'opencode',
    bin: 'opencode',
    label: 'OpenCode CLI',
    list: ['mcp', 'list'],
  },
]

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
    const out = execFileSync(host.bin, host.list, {
      encoding: 'utf8',
      timeout: LIST_TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return out.toLowerCase().includes(SERVER_NAME)
  } catch {
    return false
  }
}

function runManagement(host: HostCli, args: string[]): void {
  execFileSync(host.bin, args, {
    encoding: 'utf8',
    timeout: LIST_TIMEOUT_MS,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function findHost(key: string): HostCli {
  const host = HOSTS.find(item => item.key === key)
  if (!host) throw new Error(`Unknown CLI: ${key}`)
  return host
}

// List every MCP-capable CLI with whether it is installed and currently attached.
export function status(): HostStatus[] {
  return HOSTS.map(host => {
    const installed = isInstalled(host.bin)
    return {
      key: host.key,
      bin: host.bin,
      label: host.label,
      installed,
      attached: installed && isAttached(host),
      manual: host.add === undefined,
    }
  })
}

// Attach the reevesagents MCP server to one CLI by calling that CLI's own mcp add.
export function attach(key: string): AttachResult {
  const host = findHost(key)
  if (!host.add) {
    return { key, label: host.label, ok: false, message: `${host.label} must be added manually` }
  }
  if (!isInstalled(host.bin)) {
    return { key, label: host.label, ok: false, message: `${host.bin} is not installed` }
  }
  try {
    runManagement(host, host.add)
    return { key, label: host.label, ok: true, message: 'attached' }
  } catch (err) {
    return { key, label: host.label, ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}

// Detach the reevesagents MCP server from one CLI by calling that CLI's mcp remove.
export function detach(key: string): AttachResult {
  const host = findHost(key)
  if (!host.remove) {
    return { key, label: host.label, ok: false, message: `${host.label} must be removed manually` }
  }
  if (!isInstalled(host.bin)) {
    return { key, label: host.label, ok: false, message: `${host.bin} is not installed` }
  }
  try {
    runManagement(host, host.remove)
    return { key, label: host.label, ok: true, message: 'detached' }
  } catch (err) {
    return { key, label: host.label, ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}

// Attach to every installed CLI we can drive automatically.
export function attachAll(): AttachResult[] {
  return HOSTS
    .filter(host => host.add && isInstalled(host.bin))
    .map(host => attach(host.key))
}
