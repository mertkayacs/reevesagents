// sendWhenIdle: the only write path an automated caller may use.
//
// Every rule here exists because the alternative is a prompt pasted into a working agent, or a
// queued Enter answering a prompt nobody was ready for. The fake driver makes the pane text
// scriptable, so a whole send — gate, paste, Enter, confirm — runs without tmux.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { AgentRecord, Provider, RunRecord } from '../src/core/types.js'
import type { RuntimeDriver } from '../src/core/runtime.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeves-send-idle-'))
  process.env.REEVES_REGISTRY = tmpDir
  process.env.REEVES_CONFIG = join(tmpDir, 'config.json')
})

afterEach(() => {
  delete process.env.REEVES_REGISTRY
  delete process.env.REEVES_CONFIG
  rmSync(tmpDir, { recursive: true, force: true })
})

class PaneDriver implements RuntimeDriver {
  calls: Array<{ args: string[], input?: string }> = []
  delays: number[] = []
  windows = new Set(['@0', '@1'])
  panes = new Set(['%0', '%1'])
  // Scripted pane text: each capture-pane shifts one value, the last one repeats.
  captures: string[] = ['> idle']

  tmux(args: string[], input?: string): string {
    this.calls.push(input === undefined ? { args } : { args, input })
    if (args[0] === 'list-windows') return [...this.windows].join('\n')
    if (args[0] === 'list-panes') return [...this.panes].join('\n')
    if (args[0] === 'capture-pane') {
      return this.captures.length > 1 ? this.captures.shift()! : (this.captures[0] ?? '')
    }
    return ''
  }

  delay(fn: () => void, ms: number): void {
    this.delays.push(ms)
    fn()
  }

  count(kind: string): number {
    return this.calls.filter(call => call.args[0] === kind).length
  }

  pasted(): string[] {
    return this.calls.filter(call => call.args[0] === 'load-buffer').map(call => call.input ?? '')
  }
}

function makeRun(): RunRecord {
  return {
    id: 'run-1',
    name: 'flow run',
    status: 'running',
    tmux_session: 'reeves_test-11111111',
    reeves_window_id: '@0',
    reeves_pane_id: '%0',
    root_agent_id: 'agent-1',
    working_dir: '/tmp',
    preset_name: null,
    started_at: '2026-01-01T00:00:00.000Z',
    ended_at: null,
  }
}

function makeAgent(overrides: Partial<AgentRecord> = {}): AgentRecord {
  return {
    id: 'agent-1',
    run_id: 'run-1',
    nickname: 'dev',
    provider: 'codex',
    model: '',
    role: 'worker',
    working_dir: '/tmp',
    task: '',
    task_status: 'queued',
    task_note: '',
    tmux_session: 'reeves_test-11111111',
    tmux_window_id: '@1',
    tmux_pane_id: '%1',
    rc_enabled: false,
    permissions: 'skip',
    inbox: [],
    last_seen: 0,
    started_at: '2026-01-01T00:00:01.000Z',
    ended_at: null,
    ...overrides,
  }
}

async function seed(agentOverrides: Partial<AgentRecord> = {}) {
  const { writeRun, writeAgent } = await import('../src/core/runs.js')
  writeRun(makeRun())
  writeAgent(makeAgent(agentOverrides))
  return import('../src/core/runtime.js')
}

// Small timing overrides: no real waits, and a confirm window counted in simulated time (the driver delays
// instantly, so 20 polls = 20 s of the window at 1 s each).
const FAST = { timings: { pasteSettleMs: 0, submitWaitMs: 0, confirmMs: 0, confirmPollMs: 1000 } }

// Real pane shapes (see test/activity.test.ts): the gate needs a positive idle signal, and a
// send reads the pane three times — gate, pre-Enter re-check, post-Enter confirm.
const CODEX_IDLE = [
  '› Ask Codex to do anything',
  '',
  '  GPT-6-Luna high · ~/projects/reevesagents-flow',
  '  ← for agents · ? for shortcuts',
].join('\n')

const CODEX_BUSY = [
  '  ◦ Working (3s • esc to interrupt)',
  '',
  '› Ask Codex to do anything',
  '  GPT-6-Luna high · ~/projects/reevesagents-flow',
].join('\n')

const HERMES_IDLE = [
  '❯ fix the failing test',
  '────────────────────────────────────────────',
  ' ☤ deepseek-v4.1-flash · 282K/1M · ✓ 6m · ~/projects/salon-dashboard (main)',
].join('\n')

describe('paneBusy', () => {
  it('reads the pane through the injected driver', async () => {
    const { paneBusy } = await seed()
    const driver = new PaneDriver()
    driver.captures = [CODEX_BUSY]
    expect(paneBusy('agent-1', { driver })).toBe('busy')

    driver.captures = [CODEX_IDLE]
    expect(paneBusy('agent-1', { driver })).toBe('idle')
  })

  it('classifies a hermes pane through the same gate', async () => {
    const { paneBusy } = await seed({ provider: 'hermes' as Provider })
    const driver = new PaneDriver()
    driver.captures = [HERMES_IDLE]
    expect(paneBusy('agent-1', { driver })).toBe('idle')
  })

  it('is unknown for an unverified provider, a headless agent, a stale pane, a missing agent', async () => {
    const { paneBusy } = await seed({ provider: 'cc' as Provider })
    expect(paneBusy('agent-1', { driver: new PaneDriver() })).toBe('unknown')

    const headless = await seed({ headless: true })
    expect(headless.paneBusy('agent-1', { driver: new PaneDriver() })).toBe('unknown')

    const { writeAgent } = await import('../src/core/runs.js')
    writeAgent(makeAgent())
    const driver = new PaneDriver()
    driver.panes.delete('%1')
    expect((await import('../src/core/runtime.js')).paneBusy('agent-1', { driver })).toBe('unknown')
    expect((await import('../src/core/runtime.js')).paneBusy('ghost', { driver })).toBe('unknown')
  })
})

describe('sendWhenIdle', () => {
  it('refuses a busy pane without touching it', async () => {
    const { sendWhenIdle } = await seed()
    const driver = new PaneDriver()
    driver.captures = [CODEX_BUSY]

    expect(sendWhenIdle('agent-1', 'hello', { driver, ...FAST })).toEqual({ sent: false, reason: 'busy' })
    expect(driver.count('load-buffer')).toBe(0)
    expect(driver.count('send-keys')).toBe(0)
  })

  it('refuses an unknown pane instead of guessing it is free', async () => {
    const { sendWhenIdle } = await seed({ provider: 'opencode' as Provider })
    const driver = new PaneDriver()

    expect(sendWhenIdle('agent-1', 'hello', { driver, ...FAST })).toEqual({ sent: false, reason: 'unknown' })
    expect(driver.count('load-buffer')).toBe(0)
  })

  it('pastes once and submits with exactly one Enter when the pane goes busy', async () => {
    const { sendWhenIdle } = await seed()
    const driver = new PaneDriver()
    driver.captures = [CODEX_IDLE, CODEX_IDLE, CODEX_BUSY]

    expect(sendWhenIdle('agent-1', 'block brief', { driver, ...FAST })).toEqual({ sent: true })
    expect(driver.pasted()).toEqual(['block brief'])
    expect(driver.count('send-keys')).toBe(1)
    expect(driver.calls.find(call => call.args[0] === 'send-keys')?.args).toEqual(['send-keys', '-t', '%1', 'Enter'])
  })

  it('reports unconfirmed and never sends a second Enter', async () => {
    const { sendWhenIdle } = await seed()
    const driver = new PaneDriver()
    driver.captures = [CODEX_IDLE, CODEX_IDLE, CODEX_IDLE]

    expect(sendWhenIdle('agent-1', 'hello', { driver, ...FAST })).toEqual({ sent: false, reason: 'unconfirmed' })
    expect(driver.count('send-keys')).toBe(1)
    expect(driver.pasted()).toHaveLength(1)
  })

  it('refuses to submit when the pane stops being idle during the settle window', async () => {
    const { sendWhenIdle } = await seed()
    const driver = new PaneDriver()
    // Gate sees an idle agent; by the time the Enter would go in, a turn has started.
    driver.captures = [CODEX_IDLE, CODEX_BUSY]

    expect(sendWhenIdle('agent-1', 'hello', { driver, ...FAST })).toEqual({ sent: false, reason: 'pane_changed' })
    expect(driver.count('send-keys')).toBe(0)
    expect(driver.pasted()).toEqual(['hello'])
  })

  it('submits when a redraw reads as busy but the composer still holds exactly our text', async () => {
    // D2: the Codex pane redraws while the paste settles, the busy probe sees `Working`, and refusing there left the
    // prompt sitting in the box until a human pressed Enter. The composer is the fact that matters.
    const { sendWhenIdle } = await seed()
    const driver = new PaneDriver()
    // The busy hint is the last line, as a redraw prints it — that is what the old pre-Enter probe reacted to.
    const redrawn = [
      '› hello',
      '  GPT-6-Luna high · ~/projects/reevesagents-flow',
      '  ◦ Working (1s • esc to interrupt)',
    ].join('\n')
    driver.captures = [CODEX_IDLE, redrawn, CODEX_BUSY]

    expect(sendWhenIdle('agent-1', 'hello', { driver, ...FAST })).toEqual({ sent: true })
    // One paste and one Enter — the Enter that the busy probe used to refuse.
    expect(driver.pasted()).toEqual(['hello'])
    expect(driver.count('send-keys')).toBe(1)
  })

  it('sends the Enter when a long paste is cut with an ellipsis on one line', async () => {
    // The live pane of 2026-11-02 showed the real shape: `› Review commit d096765…` — one line, cut by the pane width.
    // Exact equality with the prompt can never hold there, and refusing made the dispatch look like a pane change.
    const { sendWhenIdle } = await seed()
    const driver = new PaneDriver()
    const prompt = 'Review commit d096765cc5bdda7bdb6769ef9dd99afc5031df0c in ~/projects/reevesagents-flow. This is round 1 of 6.'
    const redrawn = [
      '› Review commit d096765cc5bdda7bdb6769ef9dd99afc5031',
      '  ◦ Working (1s • esc to interrupt)',
    ].join('\n')
    driver.captures = [CODEX_IDLE, redrawn, CODEX_BUSY]

    expect(sendWhenIdle('agent-1', prompt, { driver, ...FAST })).toEqual({ sent: true })
    expect(driver.pasted()).toEqual([prompt])
    expect(driver.count('send-keys')).toBe(1)
  })

  it('sends the Enter when codex folded the paste into a placeholder', async () => {
    const { sendWhenIdle } = await seed()
    const driver = new PaneDriver()
    const redrawn = [
      '› [Pasted Content 1020 chars]',
      '  ◦ Working (1s • esc to interrupt)',
    ].join('\n')
    driver.captures = [CODEX_IDLE, redrawn, CODEX_BUSY]

    expect(sendWhenIdle('agent-1', 'x'.repeat(2000), { driver, ...FAST })).toEqual({ sent: true })
    expect(driver.count('load-buffer')).toBe(1)
    expect(driver.count('send-keys')).toBe(1)
  })

  it('still refuses when the redraw holds somebody else\'s text', async () => {
    // The other half of D2: a pane that moved on is a refusal, and `composer_dirty` is what the flow escalates on.
    const { sendWhenIdle } = await seed()
    const driver = new PaneDriver()
    const other = [
      '› somebody else\'s prompt',
      '  GPT-6-Luna high · ~/projects/reevesagents-flow',
      '  ◦ Working (1s • esc to interrupt)',
    ].join('\n')
    driver.captures = [CODEX_IDLE, other]

    expect(sendWhenIdle('agent-1', 'hello', { driver, ...FAST })).toEqual({ sent: false, reason: 'pane_changed' })
    expect(driver.count('send-keys')).toBe(0)
  })

  it('waits the dispatch window by default, polling for the busy marker', async () => {
    const { sendWhenIdle } = await seed()
    const driver = new PaneDriver()
    driver.captures = [CODEX_IDLE, CODEX_IDLE, CODEX_BUSY]

    expect(sendWhenIdle('agent-1', 'hello', { driver })).toEqual({ sent: true })
    // 9 s after the paste; the very first look into the confirm window already found the busy marker, so
    // no poll delay was needed. The window itself is `dispatch_confirm_seconds` (90 s) and is covered by
    // the cold-pane test below.
    expect(driver.delays).toEqual([9000])
  })

  it('refuses a stale pane, a headless agent and a missing agent', async () => {
    const { sendWhenIdle } = await import('../src/core/runtime.js')
    const { writeRun, writeAgent } = await import('../src/core/runs.js')
    writeRun(makeRun())
    writeAgent(makeAgent())

    const stale = new PaneDriver()
    stale.panes.delete('%1')
    expect(sendWhenIdle('agent-1', 'text', { driver: stale, ...FAST })).toEqual({ sent: false, reason: 'stale_pane' })
    expect(stale.count('load-buffer')).toBe(0)

    expect(sendWhenIdle('ghost', 'text', { driver: new PaneDriver(), ...FAST })).toEqual({ sent: false, reason: 'stale_pane' })

    writeAgent(makeAgent({ id: 'agent-2', headless: true }))
    expect(sendWhenIdle('agent-2', 'text', { driver: new PaneDriver(), ...FAST })).toEqual({ sent: false, reason: 'headless' })
  })

  it('flips a queued agent to working, like every other send path', async () => {
    const { sendWhenIdle } = await seed()
    const driver = new PaneDriver()
    driver.captures = [CODEX_IDLE, CODEX_IDLE, CODEX_BUSY]

    sendWhenIdle('agent-1', 'hello', { driver, ...FAST })
    const { readAgent } = await import('../src/core/runs.js')
    expect(readAgent('run-1', 'agent-1').task_status).toBe('working')
  })
})

// Pane shapes for the readiness rules (incident of 2026-11-01).
const CODEX_STARTING = [
  '  Loading Codex…',
  '  starting up',
].join('\n')

const CODEX_NO_ASK_LINE = [
  '› ',
  '  GPT-6-Luna high · ~/projects/reevesagents-flow',
].join('\n')

const CODEX_FOREIGN_COMPOSER = [
  '› a prompt somebody typed by hand',
  '  ← for agents · ? for shortcuts',
].join('\n')

const CODEX_OUR_TEXT = [
  '› hello',
  '  ← for agents · ? for shortcuts',
].join('\n')

// Our text is in the box, but the pane is not showing the composer hint any more: not ready, not ours.
const CODEX_OUR_TEXT_NO_HINT = [
  '› hello',
  '  some modal is in the way',
].join('\n')

const CODEX_COPY_MODE = [
  '  ◦ Working (3s • esc to interrupt)',
  '  [12/345]',
  '› Ask Codex to do anything',
].join('\n')

describe('readiness and the composer', () => {
  it('pastes nothing into a pane that has no composer yet', async () => {
    const { sendWhenIdle } = await seed()
    const driver = new PaneDriver()
    driver.captures = [CODEX_STARTING]

    expect(sendWhenIdle('agent-1', 'hello', { driver, ...FAST })).toEqual({ sent: false, reason: 'unknown' })
    expect(driver.pasted()).toEqual([])
    expect(driver.count('send-keys')).toBe(0)
  })

  it('refuses with target_not_ready when the input box is there but no composer hint is', async () => {
    const { sendWhenIdle } = await seed()
    const driver = new PaneDriver()
    driver.captures = [CODEX_NO_ASK_LINE]

    expect(sendWhenIdle('agent-1', 'hello', { driver, ...FAST })).toEqual({ sent: false, reason: 'target_not_ready' })
    expect(driver.pasted()).toEqual([])
    expect(driver.count('send-keys')).toBe(0)
  })

  it('refuses a composer that already holds somebody else\'s text', async () => {
    const { sendWhenIdle } = await seed()
    const driver = new PaneDriver()
    driver.captures = [CODEX_FOREIGN_COMPOSER]

    expect(sendWhenIdle('agent-1', 'hello', { driver, ...FAST })).toEqual({ sent: false, reason: 'composer_dirty' })
    expect(driver.pasted()).toEqual([])
    expect(driver.count('send-keys')).toBe(0)
  })

  it('submits our own text without pasting it twice', async () => {
    const { sendWhenIdle } = await seed()
    const driver = new PaneDriver()
    // The pane already shows our text, then turns busy after the Enter.
    driver.captures = [CODEX_OUR_TEXT, CODEX_OUR_TEXT, CODEX_BUSY]

    expect(sendWhenIdle('agent-1', 'hello', { driver, ...FAST })).toEqual({ sent: true })
    expect(driver.pasted()).toEqual([])          // no second paste
    expect(driver.count('send-keys')).toBe(1)    // exactly one Enter
  })

  it('cancels copy mode before it types anything', async () => {
    const { sendWhenIdle } = await seed()
    const driver = new PaneDriver()
    driver.captures = [CODEX_COPY_MODE, CODEX_IDLE, CODEX_IDLE, CODEX_BUSY]

    expect(sendWhenIdle('agent-1', 'hello', { driver, ...FAST })).toEqual({ sent: true })
    const cancels = driver.calls.filter(call => call.args[0] === 'send-keys' && call.args.includes('-X'))
    expect(cancels).toHaveLength(1)
    expect(driver.pasted()).toEqual(['hello'])
  })

  it('waits for a cold pane that starts its turn late, and gives up when the window is too short', async () => {
    const { sendWhenIdle } = await seed()
    // The pane only turns busy on the 70th look inside the confirm window.
    const cold = new PaneDriver()
    const busyAfter = 70
    cold.captures = [CODEX_IDLE, CODEX_IDLE, CODEX_IDLE]
    let looks = 0
    const original = cold.tmux.bind(cold)
    cold.tmux = (args: string[], input?: string) => {
      if (args[0] === 'capture-pane') {
        looks += 1
        return looks >= busyAfter ? CODEX_BUSY : CODEX_IDLE
      }
      return original(args, input)
    }

    expect(sendWhenIdle('agent-1', 'hello', {
      driver: cold, timings: { pasteSettleMs: 0, submitWaitMs: 0, confirmMs: 90_000, confirmPollMs: 1000 },
    })).toEqual({ sent: true })

    // The same pane with a 20-second window: unconfirmed, and no blind repeat.
    const short = new PaneDriver()
    short.captures = [CODEX_IDLE, CODEX_IDLE, CODEX_IDLE]
    let shortLooks = 0
    const shortOriginal = short.tmux.bind(short)
    short.tmux = (args: string[], input?: string) => {
      if (args[0] === 'capture-pane') {
        shortLooks += 1
        return shortLooks >= busyAfter ? CODEX_BUSY : CODEX_IDLE
      }
      return shortOriginal(args, input)
    }
    expect(sendWhenIdle('agent-1', 'hello', {
      driver: short, timings: { pasteSettleMs: 0, submitWaitMs: 0, confirmMs: 20_000, confirmPollMs: 1000 },
    })).toEqual({ sent: false, reason: 'unconfirmed' })
    // One Enter only: the composer no longer holds our text after the paste, so nothing is repeated.
    expect(short.count('send-keys')).toBe(1)
  })

  it('does not repeat the Enter when the composer is empty after the window', async () => {
    const { sendWhenIdle } = await seed()
    const driver = new PaneDriver()
    // After the paste the composer is empty (the provider consumed the text) and the pane never turns busy.
    driver.captures = [CODEX_IDLE, CODEX_IDLE, CODEX_NO_ASK_LINE, CODEX_NO_ASK_LINE]

    expect(sendWhenIdle('agent-1', 'hello', { driver, ...FAST })).toEqual({ sent: false, reason: 'unconfirmed' })
    expect(driver.count('send-keys')).toBe(1)
  })
})

describe('the repeated Enter', () => {
  it('does not press it when the pane stopped reading as ready, even with our text in the box', async () => {
    const { sendWhenIdle } = await seed()
    const driver = new PaneDriver()
    // After the paste the composer still holds our text, but the pane no longer shows a composer *hint*
    // (a modal, a half-drawn frame): a keystroke there answers whatever is on screen instead.
    driver.captures = [CODEX_IDLE, CODEX_IDLE, CODEX_OUR_TEXT_NO_HINT, CODEX_OUR_TEXT_NO_HINT]

    expect(sendWhenIdle('agent-1', 'hello', { driver, ...FAST })).toEqual({ sent: false, reason: 'unconfirmed' })
    expect(driver.count('send-keys')).toBe(1)   // the first Enter only
  })

  it('presses it once more while the pane is idle, ready and still holding our text', async () => {
    const { sendWhenIdle } = await seed()
    const driver = new PaneDriver()
    driver.captures = [CODEX_IDLE, CODEX_IDLE, CODEX_OUR_TEXT, CODEX_OUR_TEXT, CODEX_BUSY]

    expect(sendWhenIdle('agent-1', 'hello', { driver, ...FAST })).toEqual({ sent: true })
    expect(driver.count('send-keys')).toBe(2)
    expect(driver.pasted()).toEqual(['hello'])
  })
})
