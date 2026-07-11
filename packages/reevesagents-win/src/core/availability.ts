// Provider availability and bin resolution on native Windows. npm-installed CLIs
// are .cmd shims; `where` resolves them (claude -> C:\...\claude.cmd). We keep the
// resolved path because pty.spawn cannot run a .cmd by bare name (Node refuses to
// exec .cmd without a shell since a recent security change), so the runtime
// launches it through `cmd.exe /c <cmdPath>` (see pty-runtime.ts). On non-Windows
// we fall back to `which` with the same return shape so the runtime and doctor are
// exercisable off Windows (CI, dev on Linux/macOS).

import { execFileSync } from 'node:child_process'
import type { Provider } from '../shared/types.js'
import { BIN, PROVIDERS } from '../shared/provider-build.js'

const LOOKUP = process.platform === 'win32' ? 'where' : 'which'

export interface ResolvedBin {
  name: string
  cmdPath: string
}

// Resolve a provider bin name to an absolute launcher path. `where` can print
// several matches (e.g. claude.cmd plus a bash claude); take the first non-empty
// line. On failure return the bare name so the error surfaces at spawn time with
// the provider's own output, not here.
export function resolveBin(bin: string): ResolvedBin {
  try {
    const out = execFileSync(LOOKUP, [bin], { encoding: 'utf8' }).trim()
    const first = out.split(/\r?\n/).map(line => line.trim()).find(Boolean)
    if (first) return { name: bin, cmdPath: first }
  } catch {
    // not found on PATH; fall through
  }
  return { name: bin, cmdPath: bin }
}

export function detectAvailable(): Record<Provider, boolean> {
  const result = {} as Record<Provider, boolean>
  for (const provider of PROVIDERS) {
    try {
      execFileSync(LOOKUP, [BIN[provider]], { stdio: 'pipe' })
      result[provider] = true
    } catch {
      result[provider] = false
    }
  }
  return result
}
