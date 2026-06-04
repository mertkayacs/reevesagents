import { describe, expect, it } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Router } from '../../src/router.js'
import { loadConfig } from '../../src/state/config.js'

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
