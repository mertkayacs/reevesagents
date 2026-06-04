// Agent launch helpers shared by the TUI and CLI runtime.
// Inputs: user paths and argv fragments. Outputs: shell-safe values.

import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

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
