import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render } from 'ink-testing-library'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Config } from '../../src/surfaces/tui/screens/Config.js'
import * as RouterModule from '../../src/surfaces/tui/router.js'
import { ToastProvider } from '../../src/surfaces/tui/contexts/ToastContext.js'

vi.mock('../../src/surfaces/tui/router.js')

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeves-config-screen-'))
  process.env.REEVES_CONFIG = join(tmpDir, 'config.json')
  vi.spyOn(RouterModule, 'useRouter').mockReturnValue({
    push: vi.fn(),
    pop: vi.fn(),
    replace: vi.fn(),
    forward: vi.fn(),
    resetStack: vi.fn(),
    screen: 'Config',
    selectedRunId: null,
    setSelectedRunId: vi.fn(),
    selectedAgentId: null,
    setSelectedAgentId: vi.fn(),
    selectedCheckName: null,
    setSelectedCheckName: vi.fn(),
    selectedWorkerIdx: null,
    setSelectedWorkerIdx: vi.fn(),
    canBack: false,
    canForward: false,
  } as any)
})

afterEach(() => {
  delete process.env.REEVES_CONFIG
  rmSync(tmpDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('Config screen', () => {
  it('lists the editable config fields and excludes language', () => {
    const { lastFrame } = render(
      <ToastProvider>
        <Config />
      </ToastProvider>
    )
    const output = lastFrame()!
    expect(output).toContain('max agents')
    expect(output).toContain('peek lines')
    expect(output).toContain('default permissions')
    expect(output).toContain('Back')
    expect(output).not.toContain('language')
  })
})
