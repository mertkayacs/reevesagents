// Single home for tmux process access and the target-identity rules.
//
// Identity doctrine: tmux window/pane ids ("@N"/"%N") are unique only per
// tmux-server lifetime. After a server restart they are reassigned from 0, so a
// stored id alone can name an unrelated window. An id is only trusted as the
// pair (session name, id): run session names embed the run id, so they never
// collide across server generations. Membership in the exact-matched session is
// the only sound check; qualified targets like "=SESS:@N" are NOT (when @N is
// absent from SESS, tmux silently resolves to another window in SESS instead of
// failing; verified on tmux 3.4). After a positive membership check, bare-id
// targeting is unambiguous because tmux never reuses ids within one server
// lifetime; the remaining race is a server restart between check and use, which
// tmux offers no way to close.

import { execFileSync, spawnSync, type ExecFileSyncOptions, type SpawnSyncOptions } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

// winmux entry resolution (win32 only): the twin tmux-compatible multiplexer
// runs as `node <winmux.js>`. Order: explicit env override, then the bundled
// sibling (dist/cli.js, dist/index.js, dist/winmux.js are siblings), then the
// dist/winmux.js under the nearest ancestor with a package.json.
function winmuxEntry(platform = process.platform): string {
  if (platform !== 'win32') throw new Error('winmuxEntry is only meaningful on win32')
  const envEntry = process.env.REEVES_WINMUX_ENTRY
  if (envEntry) return envEntry
  const bundled = fileURLToPath(new URL('./winmux.js', import.meta.url))
  if (existsSync(bundled)) return bundled
  let dir = dirname(fileURLToPath(import.meta.url))
  while (true) {
    if (existsSync(join(dir, 'package.json'))) return join(dir, 'dist', 'winmux.js')
    const parent = dirname(dir)
    if (parent === dir) return bundled
    dir = parent
  }
}

// Single decision point for "which multiplexer binary do we exec". Non-Windows
// stays plain `tmux`; win32 routes every invocation through winmux via node.
export function tmuxCommand(platform = process.platform): { file: string; prefix: string[] } {
  if (platform === 'win32') {
    return { file: process.execPath, prefix: [winmuxEntry(platform)] }
  }
  return { file: 'tmux', prefix: [] }
}

export function execTmux(args: string[], options: Omit<ExecFileSyncOptions, 'encoding'> & { encoding?: 'utf8' } = {}): string {
  const cmd = tmuxCommand()
  return execFileSync(cmd.file, [...cmd.prefix, ...args], { encoding: 'utf8', ...options }) as string
}

export function spawnTmux(args: string[], options: SpawnSyncOptions = {}): ReturnType<typeof spawnSync> {
  const cmd = tmuxCommand()
  return spawnSync(cmd.file, [...cmd.prefix, ...args], options)
}

// Injectable seam for everything that shells out to tmux with pacing. Tests
// substitute a fake; production uses realDriver.
export interface RuntimeDriver {
  tmux(_args: string[], _input?: string): string
  delay(_fn: () => void, _ms: number): void
}

export const realDriver: RuntimeDriver = {
  tmux(args, input) {
    return execTmux(args, {
      input,
      stdio: input === undefined ? ['ignore', 'pipe', 'pipe'] : ['pipe', 'pipe', 'pipe'],
    }).trim()
  },
  delay(fn, ms) {
    setTimeout(fn, ms)
  },
}

export const STALE_WINDOW_ERROR = 'agent window no longer exists (tmux server may have restarted)'

// tmux resolves a bare target against both session and window names, with prefix
// matching, so a leftover "reeves-*" session or an equally-named window hijacks
// it. "=" forces an exact session match.
export function exactSession(session: string): string {
  return `=${session}`
}

export function tmuxAvailable(platform = process.platform): boolean {
  if (platform === 'win32') {
    // winmux needs its PTY/terminal backends; without them it cannot run panes.
    const entry = winmuxEntry(platform)
    if (!existsSync(entry)) return false
    const requireFrom = createRequire(import.meta.url)
    try { requireFrom.resolve('@lydell/node-pty') } catch { return false }
    try { requireFrom.resolve('@xterm/headless') } catch { return false }
    return true
  }
  try {
    const cmd = tmuxCommand(platform)
    const result = spawnSync(cmd.file, [...cmd.prefix, '-V'], { stdio: 'ignore' })
    return result.status === 0
  } catch {
    return false
  }
}

// Raw `tmux -V` output (e.g. "tmux 3.4"), or null when tmux is missing.
export function tmuxVersion(): string | null {
  try {
    return execTmux(['-V']).trim()
  } catch {
    return null
  }
}

export function sessionExists(session: string): boolean {
  return trySessionExists(session) === true
}

// `null` means the probe failed (no tmux, no socket, a fork error); `false` means tmux
// answered and the session is not there. Sweeps that archive on a miss must treat
// `null` as "unknown".
export function trySessionExists(session: string): boolean | null {
  if (!session) return false
  try {
    const result = spawnTmux(['has-session', '-t', exactSession(session)], { stdio: 'ignore' })
    if (result.status === 0) return true
    // has-session reports a real absence and a connection failure with the same code, so
    // confirm the server is reachable before calling the session gone.
    return tryListSessions() === null ? null : false
  } catch {
    return null
  }
}

// Membership probe for the (session name, id) identity pair; see the doctrine
// comment above for why listing the session is the only sound check.
export function targetExists(target: string, session: string): boolean {
  return tryTargetExists(target, session) === true
}

// `null` means the probe itself failed; `false` means tmux answered and the target is not
// there. A decision that kills something must treat `null` as "unknown, leave it alone":
// a fork error or an unreachable server is not evidence that an agent's window is gone.
export function tryTargetExists(target: string, session: string): boolean | null {
  if (!target || !session) return false
  try {
    const args = target.startsWith('%')
      ? ['list-panes', '-s', '-t', exactSession(session), '-F', '#{pane_id}']
      : ['list-windows', '-t', exactSession(session), '-F', '#{window_id}']
    const result = spawnTmux(args, { encoding: 'utf8' })
    if (result.status !== 0) return null
    const stdout = typeof result.stdout === 'string' ? result.stdout : ''
    return stdout.split('\n').some(line => line.trim() === target)
  } catch {
    return null
  }
}

export interface TmuxSessionInfo {
  name: string
  attached: boolean
  group: string
  groupList: string[]
  createdSec: number
}

// One enumeration call for the orphan sweep; a missing tmux server yields [].
export function listSessions(): TmuxSessionInfo[] {
  return tryListSessions() ?? []
}

// `null` means "tmux could not answer", not "there are no sessions". Sweeps that kill
// unowned sessions must use this and stand down on `null`.
export function tryListSessions(): TmuxSessionInfo[] | null {
  try {
    return execTmux(['list-sessions', '-F', '#{session_name}\t#{session_attached}\t#{session_group}\t#{session_group_list}\t#{session_created}'])
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(row => {
        const [name = '', attached = '0', group = '', groupList = '', created = '0'] = row.split('\t')
        return {
          name,
          attached: attached !== '0',
          group,
          groupList: groupList.split(',').filter(Boolean),
          createdSec: Number.parseInt(created, 10) || 0,
        }
      })
  } catch {
    return null
  }
}

// Fresh attached-state probe for one session; the orphan sweep re-checks right
// before killing so a human who attached since the enumeration keeps the session.
export function sessionAttached(session: string): boolean {
  try {
    const out = execTmux(['display-message', '-p', '-t', exactSession(session), '#{session_attached}']).trim()
    return out !== '0' && out !== ''
  } catch {
    return true // cannot probe: treat as attached, never kill blind
  }
}

export function killSession(session: string): void {
  try {
    spawnTmux(['kill-session', '-t', exactSession(session)], { stdio: 'ignore' })
  } catch {
    // session already gone
  }
}

// All window ids across the server in one call, keyed "session\0windowId", for
// batch membership checks. Callers must confirm a miss with a fresh targetExists
// probe before acting on it: a window born after the enumeration is invisible here.
//
// Failure-aware variant: `null` means "tmux could not answer", which is NOT the same
// as "there are no windows". Anything that kills on a miss (the reaper, orphan sweep,
// run cleanup) must use this one, because an empty set reads as "every agent is dead"
// and takes the whole fleet down on a single failed command.
export function tryAllWindowIds(): Set<string> | null {
  try {
    return new Set(
      execTmux(['list-windows', '-a', '-F', '#{session_name}\t#{window_id}'])
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map(row => {
          const [session = '', id = ''] = row.split('\t')
          return `${session}\0${id}`
        }),
    )
  } catch {
    return null
  }
}

export function allWindowIds(): Set<string> {
  return tryAllWindowIds() ?? new Set()
}

export const RUN_SESSION_PATTERN = /^reeves-.+-[0-9a-f]{8}$/
export const VIEWER_SESSION_PATTERN = /^reevesweb_[0-9a-f]{8}$/

// Viewer sessions (reevesweb_*) are grouped with their run session; killing one
// group member leaves the others alive, so run teardown must kill them too.
export function sessionInGroup(info: { group: string; groupList: string[] }, runSession: string): boolean {
  return info.group === runSession || info.groupList.includes(runSession)
}

export function killGroupedViewers(runSession: string): void {
  for (const info of listSessions()) {
    if (VIEWER_SESSION_PATTERN.test(info.name) && sessionInGroup(info, runSession)) {
      killSession(info.name)
    }
  }
}

export function windowIds(session: string): string[] {
  try {
    return execTmux(['list-windows', '-t', exactSession(session), '-F', '#{window_id}'])
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

export interface TmuxWindowInfo {
  id: string
  command: string
}

export function windowByName(session: string, name: string): TmuxWindowInfo | null {
  try {
    const rows = execTmux(['list-windows', '-t', exactSession(session), '-F', '#{window_id}\t#{window_name}\t#{pane_current_command}'])
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
    for (const row of rows) {
      const [windowId, windowName, command = ''] = row.split('\t')
      if (windowId && windowName === name) return { id: windowId, command }
    }
  } catch {
    // Session may not exist yet.
  }
  return null
}

// Driver-based membership probes for runtime paths that must honor an injected
// fake driver. Same identity rule as targetExists, different transport.
export function windowInSession(driver: RuntimeDriver, session: string, windowId: string): boolean {
  if (!session || !windowId) return false
  try {
    return driver.tmux(['list-windows', '-t', exactSession(session), '-F', '#{window_id}'])
      .split('\n').some(line => line.trim() === windowId)
  } catch {
    return false
  }
}

export function paneInSession(driver: RuntimeDriver, session: string, paneId: string): boolean {
  if (!session || !paneId) return false
  try {
    return driver.tmux(['list-panes', '-s', '-t', exactSession(session), '-F', '#{pane_id}'])
      .split('\n').some(line => line.trim() === paneId)
  } catch {
    return false
  }
}
