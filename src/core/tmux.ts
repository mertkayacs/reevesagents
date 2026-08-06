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

import { execFileSync, spawnSync } from 'node:child_process'

// Injectable seam for everything that shells out to tmux with pacing. Tests
// substitute a fake; production uses realDriver.
export interface RuntimeDriver {
  tmux(_args: string[], _input?: string): string
  delay(_fn: () => void, _ms: number): void
}

export const realDriver: RuntimeDriver = {
  tmux(args, input) {
    return execFileSync('tmux', args, {
      encoding: 'utf8',
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

export function tmuxAvailable(): boolean {
  try {
    const result = spawnSync('tmux', ['-V'], { stdio: 'ignore' })
    return result.status === 0
  } catch {
    return false
  }
}

// Raw `tmux -V` output (e.g. "tmux 3.4"), or null when tmux is missing.
export function tmuxVersion(): string | null {
  try {
    return execFileSync('tmux', ['-V'], { encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

export function sessionExists(session: string): boolean {
  if (!session) return false
  try {
    const result = spawnSync('tmux', ['has-session', '-t', exactSession(session)], { stdio: 'ignore' })
    return result.status === 0
  } catch {
    return false
  }
}

// Membership probe for the (session name, id) identity pair; see the doctrine
// comment above for why listing the session is the only sound check.
export function targetExists(target: string, session: string): boolean {
  if (!target || !session) return false
  try {
    const args = target.startsWith('%')
      ? ['list-panes', '-s', '-t', exactSession(session), '-F', '#{pane_id}']
      : ['list-windows', '-t', exactSession(session), '-F', '#{window_id}']
    const result = spawnSync('tmux', args, { encoding: 'utf8' })
    return result.status === 0 && result.stdout.split('\n').some(line => line.trim() === target)
  } catch {
    return false
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
  try {
    return execFileSync('tmux', ['list-sessions', '-F', '#{session_name}\t#{session_attached}\t#{session_group}\t#{session_group_list}\t#{session_created}'], { encoding: 'utf8' })
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
    return []
  }
}

// Fresh attached-state probe for one session; the orphan sweep re-checks right
// before killing so a human who attached since the enumeration keeps the session.
export function sessionAttached(session: string): boolean {
  try {
    const out = execFileSync('tmux', ['display-message', '-p', '-t', exactSession(session), '#{session_attached}'], { encoding: 'utf8' }).trim()
    return out !== '0' && out !== ''
  } catch {
    return true // cannot probe: treat as attached, never kill blind
  }
}

export function killSession(session: string): void {
  try {
    spawnSync('tmux', ['kill-session', '-t', exactSession(session)], { stdio: 'ignore' })
  } catch {
    // session already gone
  }
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
    return execFileSync('tmux', ['list-windows', '-t', exactSession(session), '-F', '#{window_id}'], { encoding: 'utf8' })
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
    const rows = execFileSync('tmux', ['list-windows', '-t', exactSession(session), '-F', '#{window_id}\t#{window_name}\t#{pane_current_command}'], { encoding: 'utf8' })
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
