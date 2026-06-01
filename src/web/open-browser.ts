// Cross-platform browser launch for the web UI.
// Input: a URL plus the current platform/env. Output: a detached open attempt.
// Invariant: failure is non-fatal. The URL is always printed by the caller, so a
// missing opener (headless box, bare WSL) never blocks the server.

import { spawn } from 'node:child_process'

export interface OpenCommand {
  cmd: string
  args: string[]
}

export function browserOpenCommand(
  url: string,
  env: Record<string, string | undefined> = process.env,
  platform: string = process.platform,
): OpenCommand | null {
  if (platform === 'darwin') return { cmd: 'open', args: [url] }
  if (platform === 'win32') return { cmd: 'cmd', args: ['/c', 'start', '', url] }
  // Linux, including WSL2 where xdg-open is usually not wired to a host browser.
  if (env.WSL_DISTRO_NAME || env.WSL_INTEROP) return { cmd: 'wslview', args: [url] }
  return { cmd: 'xdg-open', args: [url] }
}

export function openBrowser(url: string): void {
  const command = browserOpenCommand(url)
  if (!command) return
  try {
    const child = spawn(command.cmd, command.args, { detached: true, stdio: 'ignore' })
    child.on('error', () => { /* opener missing; URL was printed */ })
    child.unref()
  } catch {
    // opener unavailable; URL was printed
  }
}
