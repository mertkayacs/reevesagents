// Process teardown helpers. kill-window/kill-session only SIGHUP the pane's
// foreground process; a CLI that ignores SIGHUP or keeps detached children
// outlives its window. These helpers escalate to SIGTERM then SIGKILL on the
// pane's process group. Callers must only escalate when tmux confirmed the
// pane's window existed moments ago (a successful kill-window/kill-session):
// a stale record's pane_pid can name an unrelated reused process.

function sleepSync(ms: number): void {
  const buffer = new SharedArrayBuffer(4)
  const view = new Int32Array(buffer)
  Atomics.wait(view, 0, 0, ms)
}

export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as { code?: string }).code === 'EPERM'
  }
}

// tmux panes are session leaders, so the pane pid is also its process group id;
// signal the group to reach detached children, falling back to the bare pid.
function signalProcessGroup(pid: number, signal: 'SIGTERM' | 'SIGKILL'): void {
  try {
    process.kill(-pid, signal)
  } catch {
    try { process.kill(pid, signal) } catch { /* already gone */ }
  }
}

const KILL_GRACE_MS = 400

export function reapPaneProcess(pid: number | null | undefined): void {
  if (!pid || pid <= 0 || !processAlive(pid)) return
  sleepSync(KILL_GRACE_MS)
  if (!processAlive(pid)) return
  signalProcessGroup(pid, 'SIGTERM')
  sleepSync(KILL_GRACE_MS)
  if (processAlive(pid)) signalProcessGroup(pid, 'SIGKILL')
}
