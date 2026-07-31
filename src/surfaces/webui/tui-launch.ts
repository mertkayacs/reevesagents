// TUI-owned web server lifecycle.
// Input: Start Web UI from the menu. Output: URL while TUI remains active.
// Invariant: the server is closed when the TUI exits.

import type { WebServerHandle } from './server.js'

let handle: WebServerHandle | null = null
let pending: Promise<WebServerHandle> | null = null
let launchToken = 0

export async function startWebFromTui(): Promise<string> {
  if (handle) {
    const { openBrowser } = await import('./open-browser.js')
    openBrowser(handle.url)
    return handle.url
  }

  if (pending) {
    const current = await pending
    return current.url
  }

  const token = launchToken
  pending = startTuiWebServer()
  try {
    const current = await pending
    if (token === launchToken) handle = current
    return current.url
  } finally {
    if (token === launchToken) pending = null
  }
}

async function startTuiWebServer(): Promise<WebServerHandle> {
  const { checkWebExtras, webExtrasMessage } = await import('./extras.js')
  const extras = await checkWebExtras()
  if (!extras.ok) throw new Error(webExtrasMessage(extras.missing))

  const { startWebServer } = await import('./server.js')
  return startWebServer({ open: true })
}

export async function closeTuiWebServer(): Promise<void> {
  launchToken += 1
  const current = handle
  const starting = pending
  handle = null
  pending = null
  if (current) await current.close()
  if (!current && starting) {
    const started = await starting.catch(() => null)
    if (started) await started.close()
  }
}
