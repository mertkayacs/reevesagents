import { beforeEach, describe, expect, it, vi } from 'vitest'

const close = vi.hoisted(() => vi.fn(async () => {}))
const startWebServer = vi.hoisted(() => vi.fn(async () => ({
  url: 'http://127.0.0.1:8080',
  port: 8080,
  close,
})))
const checkWebExtras = vi.hoisted(() => vi.fn(async () => ({ ok: true, missing: [] as string[] })))
const webExtrasMessage = vi.hoisted(() => vi.fn((missing: string[]) => `missing ${missing.join(', ')}`))
const openBrowser = vi.hoisted(() => vi.fn())

vi.mock('../../src/web/server.js', () => ({ startWebServer }))
vi.mock('../../src/web/extras.js', () => ({ checkWebExtras, webExtrasMessage }))
vi.mock('../../src/web/open-browser.js', () => ({ openBrowser }))

describe('TUI web launch', () => {
  beforeEach(async () => {
    const mod = await import('../../src/web/tui-launch.js')
    await mod.closeTuiWebServer()
    startWebServer.mockClear()
    close.mockClear()
    checkWebExtras.mockResolvedValue({ ok: true, missing: [] })
    checkWebExtras.mockClear()
    webExtrasMessage.mockClear()
    openBrowser.mockClear()
  })

  it('starts once and reopens the active server URL', async () => {
    const { startWebFromTui } = await import('../../src/web/tui-launch.js')

    await expect(startWebFromTui()).resolves.toBe('http://127.0.0.1:8080')
    await expect(startWebFromTui()).resolves.toBe('http://127.0.0.1:8080')

    expect(startWebServer).toHaveBeenCalledTimes(1)
    expect(startWebServer).toHaveBeenCalledWith({ open: true })
    expect(openBrowser).toHaveBeenCalledTimes(1)
    expect(openBrowser).toHaveBeenCalledWith('http://127.0.0.1:8080')
  })

  it('shares one pending start across quick repeated requests', async () => {
    let resolveStart!: (_handle: Awaited<ReturnType<typeof startWebServer>>) => void
    const started = new Promise<Awaited<ReturnType<typeof startWebServer>>>(resolve => { resolveStart = resolve })
    startWebServer.mockImplementationOnce(async () => started)
    const { startWebFromTui } = await import('../../src/web/tui-launch.js')

    const first = startWebFromTui()
    const second = startWebFromTui()
    resolveStart({ url: 'http://127.0.0.1:8081', port: 8081, close })

    await expect(first).resolves.toBe('http://127.0.0.1:8081')
    await expect(second).resolves.toBe('http://127.0.0.1:8081')
    expect(startWebServer).toHaveBeenCalledTimes(1)
  })

  it('closes the TUI-owned server', async () => {
    const { closeTuiWebServer, startWebFromTui } = await import('../../src/web/tui-launch.js')

    await startWebFromTui()
    await closeTuiWebServer()

    expect(close).toHaveBeenCalledTimes(1)
  })

  it('closes a server that finishes starting while the TUI exits', async () => {
    const pendingClose = vi.fn(async () => {})
    let resolveStart!: (_handle: Awaited<ReturnType<typeof startWebServer>>) => void
    const started = new Promise<Awaited<ReturnType<typeof startWebServer>>>(resolve => { resolveStart = resolve })
    startWebServer.mockImplementationOnce(async () => started)
    const { closeTuiWebServer, startWebFromTui } = await import('../../src/web/tui-launch.js')

    const start = startWebFromTui()
    const closeStart = closeTuiWebServer()
    resolveStart({ url: 'http://127.0.0.1:8082', port: 8082, close: pendingClose })

    await expect(start).resolves.toBe('http://127.0.0.1:8082')
    await closeStart
    await startWebFromTui()

    expect(pendingClose).toHaveBeenCalledTimes(1)
    expect(startWebServer).toHaveBeenCalledTimes(2)
  })

  it('reports missing optional web dependencies before starting', async () => {
    checkWebExtras.mockResolvedValueOnce({ ok: false, missing: ['ws'] })
    const { startWebFromTui } = await import('../../src/web/tui-launch.js')

    await expect(startWebFromTui()).rejects.toThrow('missing ws')

    expect(startWebServer).not.toHaveBeenCalled()
    expect(webExtrasMessage).toHaveBeenCalledWith(['ws'])
  })
})
