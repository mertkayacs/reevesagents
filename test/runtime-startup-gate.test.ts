import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Provider, Permissions } from '../src/core/types.js'
import { PROVIDERS } from '../src/core/providers.js'
import type { RuntimeDriver } from '../src/core/runtime.js'
import { readDiagnostics } from '../src/core/diagnostics.js'

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

  it('retries a lost dialog key 3s apart, at most three times, and keeps the task held', async () => {
    const driver = new ScreenDriver(TRUST_DIALOG, (key, d) => {
      if (key === 'Enter') keyCaptures.push(d.captures)
    })
    const keyCaptures: number[] = []
    await launchAgy(driver, 'skip')

    // Poll n happens at n-1 seconds. Keys: first after two stable polls, then every 3s.
    expect(keyCaptures).toEqual([2, 5, 8])
    expect(driver.events.filter(event => event === 'key:Enter')).toHaveLength(3)
    expect(driver.events).not.toContain('paste')
  }, 30_000)

  it('keeps polling past five minutes, logs the wait once, and gives up at 60 minutes without pasting', async () => {
    const driver = new ScreenDriver(TRUST_DIALOG)
    await launchAgy(driver, 'ask')

    // One-second polls for the first five minutes (301 captures), then one every 10s up to the 60-minute cap.
    expect(driver.captures).toBe(631)
    // delays[0] is the launch delay before the first poll; the poll delays follow it.
    const pollDelays = driver.delays.slice(1)
    expect(pollDelays).toHaveLength(630)
    expect(pollDelays.slice(0, 300).every(ms => ms === 1000)).toBe(true)
    expect(pollDelays.slice(300).every(ms => ms === 10_000)).toBe(true)
    expect(driver.events).not.toContain('paste')

    const entries = readDiagnostics(1000)
    const waiting = entries.filter(entry => entry.event === 'startup-gate-waiting')
    const gaveUp = entries.filter(entry => entry.event === 'startup-gate-gave-up')
    expect(waiting).toHaveLength(1)
    expect(JSON.parse(waiting[0]!.detail)).toEqual({ agent_id: expect.any(String), provider: 'agy' })
    expect(gaveUp).toHaveLength(1)
    expect(JSON.parse(gaveUp[0]!.detail)).toEqual({ agent_id: expect.any(String), provider: 'agy' })
  }, 30_000)

  it('does not treat a single flash of the dialog as a prompt', async () => {
    const driver = new ScreenDriver(TRUST_DIALOG)
    driver.onCapture = d => {
      d.screen = d.captures === 1 ? TRUST_DIALOG : IDLE_INPUT
    }
    await launchAgy(driver, 'skip')

    expect(driver.pastedOn).toEqual([IDLE_INPUT])
    expect(driver.events).toEqual(['paste', 'key:Enter'])
  })

  it('holds the task when the dialog reappears after being accepted, and pastes once', async () => {
    const driver = new ScreenDriver(TRUST_DIALOG, (key, d) => {
      // Accepting clears the dialog but the footer is not back yet.
      if (key === 'Enter') d.screen = BUSY
    })
    driver.onCapture = d => {
      if (d.captures === 4) d.screen = TRUST_DIALOG
      if (d.captures === 8) d.screen = IDLE_INPUT
    }
    await launchAgy(driver, 'skip')

    // The reappeared dialog is answered again after the 3s retry gap; the task never goes in beside it.
    expect(driver.pastedOn).toEqual([IDLE_INPUT])
    expect(driver.events).toEqual(['key:Enter', 'key:Enter', 'paste', 'key:Enter'])
  })

  it('ignores dialog text that only sits in scrollback above the last 20 lines', async () => {
    const filler = Array.from({ length: 18 }, (_, i) => `output line ${i}`).join('\n')
    const screen = `${TRUST_DIALOG}\n${filler}\n${IDLE_INPUT}`
    const driver = new ScreenDriver(screen)
    await launchAgy(driver, 'skip')

    expect(driver.pastedOn).toEqual([screen])
    expect(driver.events).toEqual(['paste', 'key:Enter'])
  })

  it('holds the task while the footer and the dialog are both visible', async () => {
    const both = `${IDLE_INPUT}\n${TRUST_DIALOG}`
    const driver = new ScreenDriver(both)
    driver.onCapture = d => {
      if (d.captures >= 30) d.screen = IDLE_INPUT
    }
    await launchAgy(driver, 'ask')

    expect(driver.captures).toBeGreaterThanOrEqual(30)
    expect(driver.pastedOn).toEqual([IDLE_INPUT])
    expect(driver.events).toEqual(['paste', 'key:Enter'])
  })

  it('waits 20s after the dialog was last seen before sending when the footer never shows', async () => {
    const driver = new ScreenDriver(TRUST_DIALOG)
    // The dialog is visible on polls 1-21 (0-20s) and gone from poll 22 on, with no footer.
    driver.onCapture = d => {
      d.screen = d.captures > 21 ? BUSY : TRUST_DIALOG
    }
    await launchAgy(driver, 'ask')

    expect(driver.pastedOn).toEqual([BUSY])
    // Sent on the poll at 40s: 20s after the dialog was last seen at 20s.
    expect(driver.captures).toBe(41)
    expect(driver.events).toEqual(['paste', 'key:Enter'])
  })

  it('treats a run without an explicit permission as ask: no key is sent for the dialog', async () => {
    const driver = new ScreenDriver(TRUST_DIALOG)
    driver.onCapture = d => {
      if (d.captures >= 10) d.screen = IDLE_INPUT
    }
    const { startRun } = await import('../src/core/runtime.js')
    startRun({
      name: 'agy no permission',
      working_dir: '/tmp',
      root: { provider: 'agy', model: '', task: 'build the thing' },
    }, { driver, available })

    expect(driver.pastedOn).toEqual([IDLE_INPUT])
    expect(driver.events).toEqual(['paste', 'key:Enter'])
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
