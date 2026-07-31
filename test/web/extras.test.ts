import { describe, it, expect } from 'vitest'
import { checkWebExtras, webExtrasMessage, WEB_EXTRA_MODULES } from '../../src/surfaces/webui/extras.js'

describe('checkWebExtras', () => {
  it('reports the extras as present in this workspace', async () => {
    const status = await checkWebExtras()
    expect(status.ok).toBe(true)
    expect(status.missing).toEqual([])
  })
})

describe('webExtrasMessage', () => {
  it('names each missing module and points back at the TUI', () => {
    const msg = webExtrasMessage(['ws', '@lydell/node-pty'])
    expect(msg).toContain('ws')
    expect(msg).toContain('@lydell/node-pty')
    expect(msg).toContain('TUI')
    expect(msg).toContain('doctor')
  })
})

describe('WEB_EXTRA_MODULES', () => {
  it('is exactly the two optional web modules', () => {
    expect([...WEB_EXTRA_MODULES]).toEqual(['ws', '@lydell/node-pty'])
  })
})
