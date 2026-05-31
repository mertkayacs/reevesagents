// Setup and environment health checks for ReevesAgents v1.
// Doctor does not clean runtime state or kill agents.

import { execFileSync } from 'node:child_process'
import { accessSync, constants, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CheckResult } from '../state/types.js'
import { detectAvailable, inspectProviderCompatibility } from './providers.js'
import { listRuns, runsDir, stateRoot } from '../state/runs.js'

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
  const parsed = parseNodeVersion(version)
  const ok = nodeMeetsMinimum(parsed)
  return {
    name: 'node',
    status: ok ? 'ok' : 'fail',
    detail: ok ? version : `${version} (need >=20.19.0)`,
  }
}

function readProcVersion(): string {
  try {
    return readFileSync('/proc/version', 'utf-8')
  } catch {
    return ''
  }
}

type EnvMap = Record<string, string | undefined>

function isWsl(env: EnvMap, procVersion: string): boolean {
  return Boolean(
    env.WSL_DISTRO_NAME ||
    env.WSL_INTEROP ||
    /microsoft|wsl/i.test(procVersion),
  )
}

export function platformSupportCheck(
  platform = process.platform,
  env: EnvMap = process.env,
  procVersion = platform === 'linux' ? readProcVersion() : '',
): CheckResult {
  if (platform === 'darwin') return { name: 'platform', status: 'ok', detail: 'macOS supported' }
  if (platform === 'linux') {
    return {
      name: 'platform',
      status: 'ok',
      detail: isWsl(env, procVersion) ? 'WSL supported' : 'Linux supported',
    }
  }
  if (platform === 'win32') {
    return {
      name: 'platform',
      status: 'fail',
      detail: 'native Windows unsupported; use WSL with tmux and provider CLIs installed inside WSL',
    }
  }
  return {
    name: 'platform',
    status: 'warn',
    detail: `${platform} is untested; supported targets are macOS, Linux, and WSL`,
  }
}

function checkTmux(): CheckResult {
  try {
    const versionStr = execFileSync('tmux', ['-V'], { encoding: 'utf8' }).trim()
    const match = versionStr.match(/tmux (\d+)\.(\d+)/)
    if (!match) return { name: 'tmux', status: 'warn', detail: `unexpected version format: ${versionStr}` }
    const major = parseInt(match[1] ?? '0', 10)
    const minor = parseInt(match[2] ?? '0', 10)
    if (major < 3) return { name: 'tmux', status: 'warn', detail: `tmux ${major}.${minor}; upgrade to 3.0+ recommended` }
    return { name: 'tmux', status: 'ok', detail: `tmux ${major}.${minor}` }
  } catch {
    return { name: 'tmux', status: 'fail', detail: 'not on PATH' }
  }
}

function checkProviders(): CheckResult {
  const available = detectAvailable()
  const statuses = Object.entries(available)
    .map(([name, isAvail]) => `${name}:${isAvail ? 'ok' : 'missing'}`)
    .join(' ')
  const noneAvail = Object.values(available).every(value => !value)
  return {
    name: 'providers',
    status: noneAvail ? 'fail' : 'ok',
    detail: statuses,
  }
}

function checkProviderCompatibility(): CheckResult {
  if (process.env.REEVES_DOCTOR_SKIP_PROVIDER_COMPAT === '1') {
    return { name: 'provider compat', status: 'warn', detail: 'skipped by REEVES_DOCTOR_SKIP_PROVIDER_COMPAT' }
  }

  const compatibility = inspectProviderCompatibility()
  const installed = Object.values(compatibility).filter(provider => provider.available)
  if (installed.length === 0) return { name: 'provider compat', status: 'warn', detail: 'no installed providers to inspect' }

  const problems = installed
    .filter(provider => !provider.ok)
    .map(provider => `${provider.provider}: ${provider.detail}`)
  if (problems.length === 0) {
    return { name: 'provider compat', status: 'ok', detail: `${installed.map(provider => provider.provider).join(', ')} compatible` }
  }
  return {
    name: 'provider compat',
    status: 'warn',
    detail: problems.slice(0, 3).join('; ') + (problems.length > 3 ? `; +${problems.length - 3} more` : ''),
  }
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

function checkRunsState(): CheckResult {
  try {
    const runs = listRuns()
    return { name: 'runs state', status: 'ok', detail: `${runs.length} run${runs.length === 1 ? '' : 's'}` }
  } catch (err) {
    return {
      name: 'runs state',
      status: 'fail',
      detail: `error reading runs: ${err instanceof Error ? err.message : 'unknown'}`,
    }
  }
}

export function runDoctor(): DoctorResult {
  return {
    checks: [
      platformSupportCheck(),
      nodeVersionCheck(),
      checkTmux(),
      checkProviders(),
      checkProviderCompatibility(),
      checkPathAccess('state dir', stateRoot()),
      checkPathAccess('runs dir', runsDir()),
      checkPathAccess('presets dir', join(stateRoot(), 'presets')),
      checkRunsState(),
    ],
  }
}
