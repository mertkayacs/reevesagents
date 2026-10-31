// Path rendering for anything a human reads: a transcript, an error message, a --json payload.
//
// Invariant: a path under the user's home prints as `~/…`. Absolute home paths leak the account
// layout into logs, approval records and transcripts, and every surface here already promises the
// shortened form — this is the one place that implements it so the promise cannot drift.

import { homedir } from 'node:os'
import { basename, isAbsolute, sep } from 'node:path'

export function shortHomePath(path: string): string {
  if (!path) return ''
  const home = homedir()
  if (path === home) return '~'
  return path.startsWith(`${home}${sep}`) ? `~${path.slice(home.length)}` : path
}

// A path for a message another process may quote: an MCP host copies our errors verbatim into its
// own transcript, so the account layout must not ride along. Under the home directory that is
// `~/…`; any other absolute path keeps only its last component, because every parent of it is
// deployment layout the reader did not ask for. A relative path is left alone — the caller wrote it.
export function displayPath(path: string): string {
  if (!path) return ''
  const shortened = shortHomePath(path)
  if (shortened !== path || !isAbsolute(path)) return shortened
  const base = basename(path)
  return base || path
}
