// Environment health checks for the win package. No tmux check (there is no tmux on
// native Windows); instead we verify the ConPTY binding loads, which provider CLIs
// `where` can find, and that the registry dir is writable. Node-version and
// path-access logic mirror the unix doctor (src/core/doctor.ts).

import { accessSync, constants, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import type { CheckResult, Provider } from '../shared/types.js'
import { PROVIDER_REGISTRY } from '../shared/provider-registry.js'
import { detectAvailable } from './availability.js'
import { runsDir, stateRoot } from './registry.js'
import { resolveLaunchCmd } from '../mcp/installer.js'

export interface DoctorResult {
  checks: CheckResult[]
}

const MIN_NODE_VERSION = [20, 19, 0] as const

function parseNodeVersion(version: string): [number, number, number] {
  const clean = version.startsWith('v') ? version.slice(1) : version
  const [major = '0', minor = '0', patch = '0'] = clean.split('.')
  return [parseInt(major, 10) || 0, parseInt(minor, 10) || 0, parseInt(patch, 10) || 0]
}

function nodeMeetsMinimum(version: [number, number, number]): boolean {
  for (let i = 0; i < MIN_NODE_VERSION.length; i++) {
    if (version[i]! > MIN_NODE_VERSION[i]!) return true
    if (version[i]! < MIN_NODE_VERSION[i]!) return false
  }
  return true
}

export function nodeVersionCheck(rawVersion = process.version): CheckResult {
  const version = rawVersion.startsWith('v') ? rawVersion.slice(1) : rawVersion
  const ok = nodeMeetsMinimum(parseNodeVersion(version))
  return { name: 'node', status: ok ? 'ok' : 'fail', detail: ok ? version : `${version} (need >=20.19.0)` }
}

// This package targets native Windows. It runs fine on Linux/macOS (real ptys), but
// the tmux-based reevesagents package is the right tool there, so warn rather than
// pretend those are the intended target.
export function platformSupportCheck(platform = process.platform): CheckResult {
  if (platform === 'win32') return { name: 'platform', status: 'ok', detail: 'native Windows (ConPTY)' }
  return {
    name: 'platform',
    status: 'warn',
    detail: `${platform} runs but this build targets native Windows; use the reevesagents package on ${platform}`,
  }
}

// The native ConPTY addon is a hard dependency here. If its prebuilt binary did not
// install for this platform/arch, spawning any agent fails, so surface it plainly.
export function nodePtyCheck(): CheckResult {
  try {
    const requireFrom = createRequire(import.meta.url)
    const mod = requireFrom('@lydell/node-pty') as { spawn?: unknown }
    if (typeof mod.spawn === 'function') return { name: 'node-pty', status: 'ok', detail: 'ConPTY binding loaded' }
    return { name: 'node-pty', status: 'fail', detail: 'module loaded but spawn is missing' }
  } catch (err) {
    return { name: 'node-pty', status: 'fail', detail: `binding failed to load: ${err instanceof Error ? err.message : 'unknown'}` }
  }
}

function checkProviders(): CheckResult {
  const available = detectAvailable()
  const statuses = Object.entries(available)
    .map(([name, isAvail]) => `${PROVIDER_REGISTRY[name as Provider].displayName}: ${isAvail ? 'ok' : 'missing'}`)
    .join('; ')
  const noneAvail = Object.values(available).every(value => !value)
  return { name: 'providers', status: noneAvail ? 'fail' : 'ok', detail: statuses }
}

function checkPathAccess(name: string, path: string): CheckResult {
  if (!existsSync(path)) return { name, status: 'warn', detail: `${path} (will be created on first use)` }
  try {
    accessSync(path, constants.R_OK | constants.W_OK)
    return { name, status: 'ok', detail: path }
  } catch {
    return { name, status: 'fail', detail: `${path} (not readable/writable)` }
  }
}

// The command a host CLI runs to launch our MCP server. Warn if it did not resolve
// to an absolute launcher, the usual cause of an "attached but never starts" server.
function checkMcpServerCommand(): CheckResult {
  const cmd = resolveLaunchCmd()
  if (cmd.command === 'reevesagents-win') {
    return { name: 'mcp server', status: 'warn', detail: 'no absolute launcher resolved; attached host CLIs will fall back to their own PATH' }
  }
  // A .cmd shim is not startable by a host CLI that launches via execFile, so an ok
  // here would be misleading even though the path is absolute.
  if (/\.cmd$/i.test(cmd.command)) {
    return { name: 'mcp server', status: 'warn', detail: `${cmd.command} is a .cmd shim; a host using execFile cannot start it` }
  }
  return { name: 'mcp server', status: 'ok', detail: `${cmd.command} ${cmd.args.join(' ')}` }
}

export function runDoctor(): DoctorResult {
  return {
    checks: [
      platformSupportCheck(),
      nodeVersionCheck(),
      nodePtyCheck(),
      checkProviders(),
      checkPathAccess('state dir', stateRoot()),
      checkPathAccess('runs dir', runsDir()),
      checkMcpServerCommand(),
    ],
  }
}
