// TUI-session policy: launching the TUI puts it in the app-owned "reeves" tmux
// session with a single "reeves" window, killing unrelated windows there.
// Generic tmux probing comes from core/tmux.ts; this file encodes only policy.

import { spawnTmux, execTmux, exactSession, sessionExists, windowByName, windowIds } from '../../core/tmux.js'

function isTuiCommand(command: string): boolean {
  return command === 'node' || command === 'reevesagents'
}

function clearTuiSessionExcept(session: string, keepWindowId: string): void {
  for (const windowId of windowIds(session)) {
    if (windowId === keepWindowId) continue
    try {
      execTmux(['kill-window', '-t', windowId], { stdio: 'ignore' })
    } catch {
      // Window may already be gone.
    }
  }
}

// The trailing ":" makes new-window append at the next free index instead of a
// pinned one, avoiding "create window failed: index 1 in use".
export function tuiNewWindowArgs(session: string, window: string, command: string): string[] {
  return ['new-window', '-d', '-P', '-F', '#{window_id}', '-t', `${exactSession(session)}:`, '-n', window, command]
}

function createTuiWindow(session: string, window: string, command: string): string {
  return execTmux(tuiNewWindowArgs(session, window, command)).trim()
}

export function openTuiSession(command: string): void {
  const session = 'reeves'
  const window = 'reeves'

  if (!sessionExists(session)) {
    spawnTmux(['new-session', '-s', session, '-n', window, command], { stdio: 'inherit' })
    return
  }

  const existing = windowByName(session, window)
  if (existing && !isTuiCommand(existing.command)) {
    try { execTmux(['kill-window', '-t', existing.id], { stdio: 'ignore' }) } catch { /* already gone */ }
  }
  const windowId = existing && isTuiCommand(existing.command)
    ? existing.id
    : createTuiWindow(session, window, command)
  execTmux(['select-window', '-t', windowId], { stdio: 'ignore' })
  clearTuiSessionExcept(session, windowId)
  spawnTmux(['attach', '-t', exactSession(session)], { stdio: 'inherit' })
}
