// Detect which host CLI launched this MCP server, read-only. We never inject
// anything into the host (no env, no config, no files); we only look at our own
// parent process so a host CLI can appear as the head of one run.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'

import { BIN } from '../core/providers.js'
import type { Provider } from '../core/types.js'

// Reverse of the BIN map (binary name -> Provider). Built once; first match wins
// if two providers ever share a binary name, which they do not today.
const PROVIDER_BY_BIN: Record<string, Provider> = Object.fromEntries(
  (Object.entries(BIN) as [Provider, string][]).map(([provider, bin]) => [bin, provider]),
)

// Map a parent process to a provider. claude/kimi/qwen are Node CLIs whose comm
// is usually "node", so the comm lookup misses; fall back to the argv basenames
// (e.g. ["/usr/bin/node","/home/x/.local/bin/claude","mcp"] -> "claude" -> cc).
// Pure so it can be unit-tested without a real parent process.
export function providerFromParent(comm: string, argv: string[]): Provider | null {
  const byComm = comm ? PROVIDER_BY_BIN[basename(comm)] : undefined
  if (byComm) return byComm
  for (const arg of argv) {
    if (!arg) continue
    const match = PROVIDER_BY_BIN[basename(arg)]
    if (match) return match
  }
  return null
}

function readParentComm(ppid: number): string {
  try {
    // Linux: cheap and dependency-free.
    return readFileSync(`/proc/${ppid}/comm`, 'utf8').trim()
  } catch {
    // macOS fallback: no /proc, ask ps for the command name only.
    return execFileSync('ps', ['-o', 'comm=', '-p', String(ppid)], { encoding: 'utf8' }).trim()
  }
}

function readParentArgv(ppid: number): string[] {
  try {
    // Linux: NUL-separated argv with a trailing NUL.
    return readFileSync(`/proc/${ppid}/cmdline`, 'utf8').split('\0').filter(Boolean)
  } catch {
    // macOS fallback: ps prints the full command line; split on whitespace.
    try {
      return execFileSync('ps', ['-o', 'args=', '-p', String(ppid)], { encoding: 'utf8' }).trim().split(/\s+/).filter(Boolean)
    } catch {
      return []
    }
  }
}

export function detectHostProvider(): Provider | null {
  try {
    return providerFromParent(readParentComm(process.ppid), readParentArgv(process.ppid))
  } catch {
    return null
  }
}
