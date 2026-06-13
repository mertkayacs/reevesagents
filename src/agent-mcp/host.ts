// Detect which host CLI launched this MCP server, read-only. We never inject
// anything into the host (no env, no config, no files); we only look at our own
// parent process so a host CLI can appear as the head of one run.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'

import { BIN } from '../launcher/providers.js'
import type { Provider } from '../state/types.js'

// Reverse of the BIN map (binary name -> Provider). Built once; first match wins
// if two providers ever share a binary name, which they do not today.
const PROVIDER_BY_BIN: Record<string, Provider> = Object.fromEntries(
  (Object.entries(BIN) as [Provider, string][]).map(([provider, bin]) => [bin, provider]),
)

function readParentCommand(ppid: number): string {
  try {
    // Linux: cheap and dependency-free.
    return readFileSync(`/proc/${ppid}/comm`, 'utf8').trim()
  } catch {
    // macOS fallback: no /proc, ask ps for the command name only.
    return execFileSync('ps', ['-o', 'comm=', '-p', String(ppid)], { encoding: 'utf8' }).trim()
  }
}

export function detectHostProvider(): Provider | null {
  try {
    const command = readParentCommand(process.ppid)
    if (!command) return null
    return PROVIDER_BY_BIN[basename(command)] ?? null
  } catch {
    return null
  }
}
