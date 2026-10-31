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

// POSIX single-quoted argv token. Pure so tests can pin both platforms.
function shellQuotePosix(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`
}

// cmd.exe-safe argv token. Plain tokens pass through unquoted; anything else is
// double-quoted with embedded quotes doubled (cmd doubles `""` back to a literal).
const CMD_SAFE = /^[A-Za-z0-9_\-.,:\\=:@+/]+$/
function shellQuoteCmd(s: string): string {
  if (CMD_SAFE.test(s)) return s
  return `"${s.replace(/"/g, '""')}"`
}

// Quote a single argument for the platform's pane shell (sh vs cmd.exe).
export function shellQuoteFor(s: string, platform: string): string {
  if (platform === 'win32') return shellQuoteCmd(s)
  return shellQuotePosix(s)
}

export function shellQuote(s: string): string {
  return shellQuoteFor(s, process.platform)
}
