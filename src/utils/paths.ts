// Path rendering for anything a human reads: a transcript, an error message, a --json payload.
//
// Invariant: a path under the user's home prints as `~/…`. Absolute home paths leak the account
// layout into logs, approval records and transcripts, and every surface here already promises the
// shortened form — this is the one place that implements it so the promise cannot drift.

import { homedir } from 'node:os'
import { sep } from 'node:path'

export function shortHomePath(path: string): string {
  if (!path) return ''
  const home = homedir()
  if (path === home) return '~'
  return path.startsWith(`${home}${sep}`) ? `~${path.slice(home.length)}` : path
}
