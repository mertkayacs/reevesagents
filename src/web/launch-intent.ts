// In-process handoff signal for the TUI -> web entry. The menu sets this just
// before the Ink app exits so the CLI launches the web server in the freed
// terminal instead of returning to the shell. Input: requestWebLaunch() from the
// menu. Output: consumeWebLaunch() reads and clears it. Invariant: process-local
// and one-shot, so reading resets the flag.

let pending = false

export function requestWebLaunch(): void {
  pending = true
}

export function consumeWebLaunch(): boolean {
  const value = pending
  pending = false
  return value
}
