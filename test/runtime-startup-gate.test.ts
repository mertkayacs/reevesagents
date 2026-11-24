import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Provider, Permissions } from '../src/core/types.js'
import { PROVIDERS } from '../src/core/providers.js'
import type { RuntimeDriver } from '../src/core/runtime.js'

let tmpDir: string
let savedTmux: string | undefined

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeves-startup-gate-test-'))
  process.env.REEVES_REGISTRY = tmpDir
  process.env.REEVES_CONFIG = join(tmpDir, 'config.json')
  savedTmux = process.env.TMUX
  delete process.env.TMUX
})

afterEach(() => {
  delete process.env.REEVES_REGISTRY
  delete process.env.REEVES_CONFIG
  if (savedTmux === undefined) delete process.env.TMUX
  else process.env.TMUX = savedTmux
  rmSync(tmpDir, { recursive: true, force: true })
})

const available = Object.fromEntries(PROVIDERS.map(provider => [provider, true])) as Record<Provider, boolean>

const TRUST_DIALOG = [
  'Do you trust the contents of this project?',
  'Antigravity CLI requires permission to read, edit, and execute files here.',
  '> Yes, I trust this folder',
  '  No, exit',
].join('\n')
const IDLE_INPUT = '│ > Type your message │\n? for shortcuts'
const BUSY = 'Working on it\nesc to cancel'

// A fake tmux server whose pane shows `screen`. Keys sent to the pane may change it (onKey), and
// every paste records the screen that was visible at that moment.
class ScreenDriver implements RuntimeDriver {
  calls: Array<{ args: string[], input?: string }> = []
  delays: number[] = []
  captures = 0
  pastedOn: string[] = []
  events: string[] = []
  screen: string
  // Lets a test change the screen as polling goes on, e.g. the user accepting a dialog.
  onCapture: (_driver: ScreenDriver) => void = () => {}
  private readonly onKey: (_key: string, _driver: ScreenDriver) => void

  constructor(screen: string, onKey: (_key: string, _driver: ScreenDriver) => void = () => {}) {
    this.screen = screen
    this.onKey = onKey
  }

  tmux(args: string[], input?: string): string {
    this.calls.push(input === undefined ? { args } : { args, input })
    if (args[0] === 'display-message') return '@0 %0'
    if (args[0] === 'new-window') return '@1 %1'
    if (args[0] === 'list-windows') return '@0\n@1'
    if (args[0] === 'list-panes') return '%0\n%1'
    if (args[0] === 'list-sessions') return ''
    if (args[0] === 'capture-pane') {
      this.captures++
      this.onCapture(this)
      return this.screen
    }
    if (args[0] === 'load-buffer') {
      this.pastedOn.push(this.screen)
      this.events.push('paste')
    }
    if (args[0] === 'send-keys') {
      const key = args.at(-1) ?? ''
      this.events.push(`key:${key}`)
      this.onKey(key, this)
    }
    return ''
  }

  delay(fn: () => void, ms: number): void {
    this.delays.push(ms)
    fn()
  }
}

async function launchAgy(driver: ScreenDriver, permissions: Permissions, task = 'build the thing') {
  const { startRun } = await import('../src/core/runtime.js')
  return startRun({
    name: 'agy gate',
    working_dir: '/tmp',
    root: { provider: 'agy', model: '', task, permissions },
  }, { driver, available })
}

describe('startup gate for providers with a blocking dialog (agy)', () => {
  it('accepts the trust dialog with Enter when launched with skip, then pastes after the footer appears', async () => {
    const driver = new ScreenDriver(TRUST_DIALOG, (key, d) => {
      if (key === 'Enter' && d.screen === TRUST_DIALOG) d.screen = IDLE_INPUT
    })
    await launchAgy(driver, 'skip')

    expect(driver.pastedOn).toEqual([IDLE_INPUT])
    // One Enter accepts trust before the paste; the Enter after the paste submits the task.
    expect(driver.events).toEqual(['key:Enter', 'paste', 'key:Enter'])
  })

  it('never pastes the task while the trust dialog is visible when launched with ask', async () => {
    // The user accepts the dialog in the pane after a while; the runtime must wait for that.
    const driver = new ScreenDriver(TRUST_DIALOG)
    driver.onCapture = d => {
      if (d.captures >= 10) d.screen = IDLE_INPUT
    }
    await launchAgy(driver, 'ask')

    expect(driver.pastedOn).toEqual([IDLE_INPUT])
    expect(driver.events).toEqual(['paste', 'key:Enter'])
    expect(driver.captures).toBeGreaterThanOrEqual(10)
  })

  it('sends the dialog key once under skip even if the dialog stays, and gives up at the gate deadline without pasting', async () => {
    const driver = new ScreenDriver(TRUST_DIALOG)
    await launchAgy(driver, 'skip')

    expect(driver.events.filter(event => event === 'key:Enter')).toHaveLength(1)
    expect(driver.events).not.toContain('paste')
    // The task is still held after the gate deadline (five minutes of one-second polls), so it is
    // not sent into the dialog.
    expect(driver.captures).toBeGreaterThanOrEqual(300)
    expect(driver.captures).toBeLessThanOrEqual(310)
  })

  it('pastes at once when the footer is already visible, without answering any dialog', async () => {
    const driver = new ScreenDriver(IDLE_INPUT)
    await launchAgy(driver, 'skip')

    expect(driver.pastedOn).toEqual([IDLE_INPUT])
    expect(driver.events).toEqual(['paste', 'key:Enter'])
  })

  it('waits for the footer instead of the stable-pane heuristic when the pane is static and busy', async () => {
    // A static non-ready pane would look ready to the generic heuristic. Gated providers must not
    // treat it as ready; the usual 20s fallback still sends the task.
    const driver = new ScreenDriver(BUSY)
    await launchAgy(driver, 'skip')

    expect(driver.pastedOn).toEqual([BUSY])
    // Polls at 0..20s, one per second: the 20s poll sends the task anyway.
    expect(driver.captures).toBe(21)
  })
})

describe('generic startup heuristic (non-gated providers)', () => {
  it('still pastes a static pane after the stability check, with no key sent first', async () => {
    const driver = new ScreenDriver('Booting the thing\nplease wait')
    const { startRun } = await import('../src/core/runtime.js')
    startRun({
      name: 'cc static',
      working_dir: '/tmp',
      root: { provider: 'cc', model: '', task: 'review the thing', permissions: 'skip' },
    }, { driver, available })

    expect(driver.pastedOn).toEqual(['Booting the thing\nplease wait'])
    expect(driver.events).toEqual(['paste', 'key:Enter'])
    // First poll: not ready yet. Second poll: pane unchanged, so it counts as ready.
    expect(driver.captures).toBe(2)
  })
})
