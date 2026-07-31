// Capability check for the optional web extras (ws + @lydell/node-pty).
// Input: none. Output: whether each optional module actually loads on this host.
// Invariant: never static-imports the extras, so the TUI carries no weight from
// them; absence is a graceful downgrade (clear message + Doctor note), not a crash.

export const WEB_EXTRA_MODULES = ['ws', '@lydell/node-pty'] as const

export interface WebExtrasStatus {
  ok: boolean
  missing: string[]
}

// Tries to load each extra. A dynamic import is the truest signal: it resolves the
// package AND loads the native binding, so a broken or missing node-pty is caught
// here rather than later when the bridge attaches.
export async function checkWebExtras(): Promise<WebExtrasStatus> {
  const missing: string[] = []
  for (const name of WEB_EXTRA_MODULES) {
    try {
      await import(name)
    } catch {
      missing.push(name)
    }
  }
  return { ok: missing.length === 0, missing }
}

export function webExtrasMessage(missing: string[]): string {
  return [
    'The web UI needs optional modules that are not installed on this host:',
    ...missing.map(name => `  - ${name}`),
    '',
    'They ship as optional dependencies and were likely skipped because the native',
    'build (@lydell/node-pty) is unavailable for this platform, or the package was',
    'installed without optional dependencies.',
    '',
    'The TUI does not need them: run reevesagents with no arguments to use it.',
    'To enable the web UI, reinstall with optional dependencies enabled (npm default),',
    'then run reevesagents doctor to confirm.',
  ].join('\n')
}
