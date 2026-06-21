import { describe, expect, it, vi } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Router } from '../../src/tui/router.js'
import { loadConfig } from '../../src/core/config.js'

// Pin a tall viewport so Settings renders its full layout (all languages visible)
// instead of the height-dependent compact window, which would scroll Türkçe off.
const viewport = vi.hoisted(() => ({ current: { columns: 100, rows: 40 } }))
vi.mock('ink', async () => {
  const actual = await vi.importActual<typeof import('ink')>('ink')
  return { ...actual, useWindowSize: () => viewport.current }
})

const waitForInput = () => new Promise(resolve => setTimeout(resolve, 50))

describe('Settings language switcher', () => {
  it('lets users change the TUI language from Settings', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'reeves-settings-language-test-'))
    process.env.REEVES_CONFIG = join(tmp, 'config.json')
    process.env.REEVES_REGISTRY = tmp
    writeFileSync(process.env.REEVES_CONFIG, JSON.stringify({ version: 2, global: { language: 'en' } }), 'utf8')

    try {
      const { stdin, lastFrame, unmount } = render(<Router initialScreen="Settings" />)
      expect(lastFrame() ?? '').toContain('Language')
      expect(lastFrame() ?? '').toContain('🇹🇷 Türkçe')

      for (let i = 0; i < 15; i++) {
        stdin.write('\u001B[B')
        await waitForInput()
      }
      stdin.write('\r')
      await waitForInput()

      expect(loadConfig().global.language).toBe('tr')
      expect(lastFrame() ?? '').toContain('Geçerli')
      unmount()
    } finally {
      delete process.env.REEVES_REGISTRY
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})
