// Anomaly journal for the safety sweeps.
//
// When a sweep stands down, kills something, or finds the tmux view unusable, the event
// goes to `<state dir>/diagnostics.log` — one line per event, appended, never thrown.
//
// Why a file and not stderr: these sweeps run inside the Ink TUI, the Web UI server, the
// MCP server and the CLI at once. Writing to stderr corrupts the TUI and lands in a pipe
// nobody reads; a swallowed error leaves an operator with "the fleet vanished" and no way
// to tell a real dead window from a failed `tmux list-windows`. This file is the answer to
// "what happened at 17:59:32" without re-running anything.
//
// Rotation: one generation (`diagnostics.log.1`) at DIAGNOSTICS_MAX_BYTES, so a chatty
// anomaly cannot fill the disk.

import { appendFileSync, existsSync, readFileSync, renameSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const DIAGNOSTICS_MAX_BYTES = 256 * 1024

// Same state-root rule as runs.ts stateRoot(). Duplicated instead of imported: runs.ts
// imports this module, and a cycle between them would make the log path depend on module
// initialization order.
export function diagnosticsPath(): string {
  const root = process.env.REEVES_REGISTRY || join(homedir(), '.reeves')
  return join(root, 'diagnostics.log')
}

export type DiagnosticDetail = Record<string, unknown> | string

// Compact single-line detail: JSON for objects, verbatim text otherwise. Truncated so one
// pathological value cannot dominate the file.
function formatDetail(detail: DiagnosticDetail): string {
  const text = typeof detail === 'string' ? detail : JSON.stringify(detail)
  return text.length > 900 ? `${text.slice(0, 900)}…` : text
}

export interface DiagnosticEntry {
  at: string
  pid: number
  event: string
  detail: string
}

export function logDiagnostic(event: string, detail: DiagnosticDetail = {}): DiagnosticEntry | null {
  const entry: DiagnosticEntry = {
    at: new Date().toISOString(),
    pid: process.pid,
    event,
    detail: formatDetail(detail),
  }
  try {
    const path = diagnosticsPath()
    if (existsSync(path) && statSync(path).size > DIAGNOSTICS_MAX_BYTES) {
      renameSync(path, `${path}.1`)
    }
    appendFileSync(path, `${entry.at}\tpid=${entry.pid}\t${entry.event}\t${entry.detail}\n`, 'utf8')
    return entry
  } catch {
    // A broken log must never break the sweep it was meant to explain.
    return null
  }
}

// Read back the most recent entries, newest last. Used by tests and by `doctor`.
export function readDiagnostics(limit = 50): DiagnosticEntry[] {
  try {
    const lines = readFileSync(diagnosticsPath(), 'utf8').split('\n').filter(Boolean)
    return lines.slice(-limit).map(line => {
      const [at = '', pid = '', event = '', ...rest] = line.split('\t')
      return { at, pid: Number.parseInt(pid.replace('pid=', ''), 10) || 0, event, detail: rest.join('\t') }
    })
  } catch {
    return []
  }
}
