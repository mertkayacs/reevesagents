// sendWhenIdle: the only write path an automated caller may use.
//
// Every rule here exists because the alternative is a prompt pasted into a working agent, or a
// queued Enter answering a prompt nobody was ready for. The fake driver makes the pane text
// scriptable, so a whole send — gate, paste, Enter, confirm — runs without tmux.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { AgentRecord, Provider, RunRecord } from '../src/core/types.js'
import type { RuntimeDriver } from '../src/core/runtime.js'
import { composerHoldsOurs, flattenPrompt, resetPaneObservations } from '../src/core/runtime.js'

let tmpDir: string

beforeEach(() => {
  // Each case seeds its own pane: an observation from the previous one must not arrive as `recent_busy`.
  resetPaneObservations()
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

const CODEX_GLYPHLESS_IDLE = [
  'Ask Codex to do anything',
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

const HERMES_BUSY = [
  '❯ ',
  '────────────────────────────────────────────',
  ' ☤ deepseek-v4.1-flash · 282K/1M · enter прервать',
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

  it('confirms a glyphless Codex placeholder without entering or cancelling copy mode', async () => {
    const { paneReadyForNudge } = await seed()
    const driver = new PaneDriver()
    driver.captures = [CODEX_GLYPHLESS_IDLE, CODEX_GLYPHLESS_IDLE]
    expect(paneReadyForNudge('agent-1', 'continue work', null, { driver })).toBe(true)
    expect(driver.count('capture-pane')).toBe(2)
    expect(driver.count('send-keys')).toBe(0)
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
  it('can bound a stall retry to exactly one Enter', async () => {
    const { sendWhenIdle } = await seed()
    const driver = new PaneDriver()
    driver.captures = [CODEX_IDLE, CODEX_IDLE, CODEX_OUR_TEXT]
    expect(sendWhenIdle('agent-1', 'continue from the brief', { driver, ...FAST, maxEnters: 1, refuseCopyMode: true }))
      .toMatchObject({ sent: false, reason: 'unconfirmed' })
    expect(driver.calls.filter(call => call.args[0] === 'send-keys' && call.args[3] === 'Enter')).toHaveLength(1)
  })

  it('does not cancel or send into tmux copy mode for a stall retry', async () => {
    const { sendWhenIdle } = await seed()
    const driver = new PaneDriver()
    const tmux = driver.tmux.bind(driver)
    driver.tmux = (args, input) => args[0] === 'display-message' ? '1' : tmux(args, input)
    driver.captures = [CODEX_IDLE]
    expect(sendWhenIdle('agent-1', 'continue from the brief', { driver, ...FAST, maxEnters: 1, refuseCopyMode: true }))
      .toEqual({ sent: false, reason: 'unknown' })
    expect(driver.calls.some(call => call.args.includes('-X'))).toBe(false)
    expect(driver.pasted()).toEqual([])
  })

  it('recognizes a recorded stall prompt and resumes with Enter only', async () => {
    const { sendWhenIdle, paneReadyForNudge } = await seed()
    const driver = new PaneDriver()
    const pastedAt = Date.now()
    driver.captures = [CODEX_OUR_TEXT, CODEX_OUR_TEXT]
    expect(paneReadyForNudge('agent-1', 'hello', { at: pastedAt }, { driver })).toBe('recorded_paste')

    driver.captures = [CODEX_OUR_TEXT, CODEX_OUR_TEXT, CODEX_BUSY]
    expect(sendWhenIdle('agent-1', 'hello', {
      driver, ...FAST, maxEnters: 1, refuseCopyMode: true, pasted: { at: pastedAt },
    })).toEqual({ sent: true })
    expect(driver.pasted()).toEqual([])
    expect(driver.calls.filter(call => call.args[0] === 'send-keys' && call.args[3] === 'Enter')).toHaveLength(1)
  })

  it('limits a recovered default-flow-port send to exactly one Enter', async () => {
    const runtime = await seed()
    const originalSend = runtime.sendWhenIdle
    const driver = new PaneDriver()
    driver.captures = [CODEX_OUR_TEXT, CODEX_OUR_TEXT, CODEX_BUSY]
    const pastedAt = Date.now()
    const sendSpy = vi.spyOn(runtime, 'sendWhenIdle').mockImplementation((agentId, text, options) =>
      originalSend(agentId, text, { ...options, driver, ...FAST }))

    try {
      const { defaultFlowPorts } = await import('../src/core/flow-runner.js')
      expect(defaultFlowPorts.send('agent-1', 'hello', { pasted: { at: pastedAt }, maxEnters: 1 }))
        .toEqual({ sent: true })
      expect(sendSpy).toHaveBeenCalledWith('agent-1', 'hello', {
        pasted: { at: pastedAt }, maxEnters: 1, refuseCopyMode: true,
      })
      expect(driver.calls.filter(call => call.args[0] === 'send-keys' && call.args[3] === 'Enter')).toHaveLength(1)
    } finally {
      sendSpy.mockRestore()
    }
  })

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
    // A real confirm window: the collapsed marker is ours only while a paste of ours is recent (block 69).
    const timings = { pasteSettleMs: 0, submitWaitMs: 0, confirmMs: 30_000, confirmPollMs: 1000 }

    expect(sendWhenIdle('agent-1', 'x'.repeat(2000), { driver, timings })).toEqual({ sent: true })
    expect(driver.count('load-buffer')).toBe(1)
    expect(driver.count('send-keys')).toBe(1)
  })

  it('presses Enter only, for a collapsed paste it made on a previous attempt', async () => {
    // The sandbox pane: our paste collapsed into the marker, no placeholder left to hint with, so the readiness probe
    // said `target_not_ready` and the Enter was never pressed — while the prompt sat there in full view. The second
    // attempt knows the box holds our paste (this process put it there a moment ago) and sends nothing but the Enter.
    const { sendWhenIdle } = await seed()
    const driver = new PaneDriver()
    const ours = [
      '› [Pasted Content 1020 chars]R followed by file:line, then what is wrong',
      '  GPT-6-Luna high · ~/projects/flow-demo',
    ].join('\n')
    const prompt = 'x'.repeat(1020) + 'R followed by file:line, then what is wrong'
    const timings = { pasteSettleMs: 0, submitWaitMs: 0, confirmMs: 30_000, confirmPollMs: 1000 }

    // First attempt: a clean composer, so this call pastes, the Enter never starts a turn, and the box keeps our marker.
    driver.captures = [CODEX_IDLE, ours, ours, ours, ours]
    const first = sendWhenIdle('agent-1', prompt, { driver, timings })
    expect(first).toMatchObject({ sent: false, reason: 'unconfirmed_paste' })
    // The stamp the caller persists: without it a *new process* (the next scheduled tick) cannot recognise the marker.
    expect(typeof (first as { pastedAt?: number }).pastedAt).toBe('number')
    expect(driver.pasted()).toEqual([prompt])

    // Second attempt: the pane already holds our paste — nothing to type, only the Enter to press.
    driver.captures = [ours, ours, CODEX_BUSY]
    expect(sendWhenIdle('agent-1', prompt, { driver, timings })).toEqual({ sent: true })
    expect(driver.pasted()).toEqual([prompt])
    expect(driver.count('send-keys')).toBe(4)   // Enter, Escape, Enter, then the retry's Enter
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

  it('confirms the send when the composer cleared and the ledger grew, without any busy marker', async () => {
    // D9: the sandbox pane never printed a busy marker inside the window, so every send looked unconfirmed while the agent
    // was already running the prompt. Composer cleared + a new tool line is the same fact, observed twice.
    const { sendWhenIdle } = await seed()
    const driver = new PaneDriver()
    const worked = [
      '› Ask Codex to do anything',
      '  GPT-6-Luna high · ~/projects/reevesagents-flow',
      '  💻 $ git add -- index.html style.css  0.1s',
    ].join('\n')
    driver.captures = [CODEX_IDLE, CODEX_IDLE, worked]

    expect(sendWhenIdle('agent-1', 'hello', { driver, ...FAST })).toEqual({ sent: true })
    expect(driver.pasted()).toEqual(['hello'])
    expect(driver.count('send-keys')).toBe(1)
  })

  it('does not confirm on a cleared composer alone', async () => {
    // The other half: an empty composer with nothing else to show is a paste that vanished — still unconfirmed.
    const { sendWhenIdle } = await seed()
    const driver = new PaneDriver()
    driver.captures = [CODEX_IDLE, CODEX_IDLE, CODEX_IDLE]

    expect(sendWhenIdle('agent-1', 'hello', { driver, ...FAST })).toEqual({ sent: false, reason: 'unconfirmed' })
  })

  it('finds a composer pushed above the tail window by a long brief, and sends it', async () => {
    // `ten-dev`: a 30-line brief was pasted and not sent. The `❯` line sat above the last forty rows, so the pane read `unknown` and
    // every tick refused with `dev_pane_unknown` — the brief stayed in the box for minutes (block 44).
    const { sendWhenIdle } = await seed({ provider: 'hermes' as Provider })
    const driver = new PaneDriver()
    const long = Array.from({ length: 30 }, (_, i) => `  line ${i + 1} of the brief`).join('\n')
    const idleWithPaste = [
      `❯ ${long}`,
      '  ────────────────────────────────────────────',
      '  ☤ deepseek-v4.1-flash · 210K/1M · ✓ 2m · ~/projects/landing-ten',
    ].join('\n')
    driver.captures = [idleWithPaste, idleWithPaste, HERMES_BUSY]

    const prompt = long
    expect(sendWhenIdle('agent-1', prompt, { driver, ...FAST })).toEqual({ sent: true })
    // Already in the box: the Enter is all that was missing, never a second paste.
    expect(driver.pasted()).toEqual([])
  })

  it('keeps refusing a pane whose composer holds somebody else\'s text', async () => {
    const { sendWhenIdle } = await seed({ provider: 'hermes' as Provider })
    const driver = new PaneDriver()
    const theirs = [
      '❯ починить сборку на стенде',
      '  ────────────────────────────────────────────',
      '  ☤ deepseek-v4.1-flash · 210K/1M · ✓ 2m · ~/projects/landing-ten',
    ].join('\n')
    driver.captures = [theirs]

    expect(sendWhenIdle('agent-1', 'наш бриф', { driver, ...FAST })).toEqual({ sent: false, reason: 'composer_dirty' })
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

    // The same pane with a 20-second window: unconfirmed, and no blind repeat. The pane's busy sighting from the send above
    // belongs to that send; a fresh attempt starts with a clean observation record (block 73's recent-busy gate would
    // otherwise refuse this one for a reason this test is not about).
    resetPaneObservations()
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

  it('presses Enter again when the first one was swallowed, and reports the repeat', async () => {
    // Block 75: the provider keeps our prompt in the box and the first Enter only closes the paste. A second Enter, taken only
    // while the pane is still idle and the box still holds our text, submits the turn.
    const { sendWhenIdle } = await seed()
    const driver = new PaneDriver()
    driver.captures = [CODEX_IDLE, CODEX_IDLE, CODEX_OUR_TEXT, CODEX_OUR_TEXT, CODEX_OUR_TEXT, CODEX_BUSY]

    expect(sendWhenIdle('agent-1', 'hello', { driver, ...FAST })).toEqual({ sent: true, enter_retries: 1 })
    expect(driver.pasted()).toEqual(['hello'])
    const keys = driver.calls.filter(call => call.args[0] === 'send-keys').map(call => call.args[3])
    expect(keys).toEqual(['Enter', 'Enter'])
  })

  it('stops at three Enters and leaves the prompt for the next tick', async () => {
    const { sendWhenIdle } = await seed()
    const driver = new PaneDriver()
    // Still our text after three Enters: the pane is not co-operating, so the answer is `unconfirmed_paste` — nothing was
    // submitted and the box still holds the prompt, which is what the flow retries with one Enter (block 69).
    driver.captures = [CODEX_IDLE, CODEX_IDLE, CODEX_OUR_TEXT]

    expect(sendWhenIdle('agent-1', 'hello', { driver, ...FAST }))
      .toMatchObject({ sent: false, reason: 'unconfirmed_paste', enter_retries: 2 })
    const keys = driver.calls.filter(call => call.args[0] === 'send-keys').map(call => call.args[3])
    expect(keys).toEqual(['Enter', 'Enter', 'Enter'])   // three, and never a fourth
    expect(driver.pasted()).toEqual(['hello'])
  })

  it('does not press again when the retry guard sees the pane busy', async () => {
    // The first Enter was swallowed — the box still holds our text and nothing is running — and by the time the guard looks
    // again a turn is under way. A repeat keystroke would interrupt it, so there is none: exactly one Enter, and the send is
    // reported unconfirmed rather than pressed blind (block 75).
    const { sendWhenIdle } = await seed()
    const driver = new PaneDriver()
    driver.captures = [CODEX_IDLE, CODEX_IDLE, CODEX_OUR_TEXT, CODEX_OUR_TEXT, CODEX_BUSY]

    expect(sendWhenIdle('agent-1', 'hello', { driver, ...FAST }))
      .toMatchObject({ sent: false, reason: 'unconfirmed', enter_retries: 1 })
    expect(driver.count('send-keys')).toBe(1)   // no second Enter
  })

  it('does not press again when the box no longer holds our text', async () => {
    // The repeat is decided on the composer: a box that now holds somebody else's draft is not ours to submit, whatever the pane
    // looks like (block 76).
    const { sendWhenIdle } = await seed()
    const driver = new PaneDriver()
    const theirs = ['› починить сборку на стенде', '  ← for agents · ? for shortcuts'].join('\n')
    driver.captures = [CODEX_IDLE, CODEX_IDLE, CODEX_OUR_TEXT, CODEX_OUR_TEXT, theirs]

    expect(sendWhenIdle('agent-1', 'hello', { driver, ...FAST }))
      .toMatchObject({ sent: false, reason: 'unconfirmed' })
    const enters = driver.calls.filter(call => call.args[0] === 'send-keys' && call.args[3] === 'Enter')
    expect(enters).toHaveLength(1)
  })

  it('does not press again when the pane reads unknown, even with our text in the box', async () => {
    // Copy mode is the shape that keeps our text *and* cannot take a key: the badge makes the pane `unknown`, and `unknown`
    // never receives a keystroke (block 75).
    const { sendWhenIdle } = await seed()
    const driver = new PaneDriver()
    const copyModeWithOurs = ['[12/345]', '› hello', '  ← for agents · ? for shortcuts'].join('\n')
    driver.captures = [CODEX_IDLE, CODEX_IDLE, CODEX_OUR_TEXT, CODEX_OUR_TEXT, copyModeWithOurs]

    expect(sendWhenIdle('agent-1', 'hello', { driver, ...FAST }))
      .toMatchObject({ sent: false, reason: 'unconfirmed' })
    // The cancel is a `send-keys -X` of its own; what matters is that no Enter was pressed into a pane tmux would eat it in.
    const enters = driver.calls.filter(call => call.args[0] === 'send-keys' && call.args[3] === 'Enter')
    expect(enters).toHaveLength(1)
  })
})

// The collapsed paste codex draws instead of a long prompt: `[Pasted Content 1022 chars]`. It no longer carries the text,
// so it counts as ours only while a paste of ours into that pane is recent — evidence, not a guess (block 69).
describe('a collapsed paste belongs to us only while it is fresh', () => {
  const prompt = 'x'.repeat(1022)
  const marker = '[Pasted Content 1022 chars]'

  it('counts the marker while our paste is inside the window', () => {
    expect(composerHoldsOurs(marker, prompt, { pastedAt: 1_000, now: 2_000, windowMs: 30_000 })).toBe(true)
    expect(composerHoldsOurs('[Pasted text 40 lines]', prompt, { pastedAt: 1_000, now: 1_500, windowMs: 30_000 })).toBe(true)
  })

  it('refuses it once the window has passed, and when we never pasted at all', () => {
    expect(composerHoldsOurs(marker, prompt, { pastedAt: 1_000, now: 31_001, windowMs: 30_000 })).toBe(false)
    // No paste of ours in this pane: the marker is somebody else's text, whatever it says.
    expect(composerHoldsOurs(marker, prompt, { pastedAt: null, now: 2_000, windowMs: 30_000 })).toBe(false)
    expect(composerHoldsOurs(marker, prompt)).toBe(false)
  })

  it('still recognises our own text exactly, however old the paste is', () => {
    expect(composerHoldsOurs('hello', 'hello', { pastedAt: 1_000, now: 999_999, windowMs: 1 })).toBe(true)
  })
})

// The retry tick is a new process: `lastPasteAtByPane` is empty there, so the record the flow keeps has to be what makes
// the marker attributable (block 69, review round 2).
describe('a paste recorded outside the process', () => {
  it('presses Enter on a collapsed marker a previous process pasted', async () => {
    // A pane this file never pasted into: its in-process stamp is empty by construction.
    const { sendWhenIdle } = await seed({ tmux_pane_id: '%7' })
    const driver = new PaneDriver()
    driver.panes.add('%7')
    const prompt = 'x'.repeat(1510)
    const ours = [
      '› [Pasted Content 1022 chars]',
      '  ← for agents · ? for shortcuts',
    ].join('\n')
    driver.captures = [ours, ours, CODEX_BUSY]
    const timings = { pasteSettleMs: 0, submitWaitMs: 0, confirmMs: 30_000, confirmPollMs: 1000 }

    // Without the record it is somebody else's text.
    expect(sendWhenIdle('agent-1', prompt, { driver, timings })).toEqual({ sent: false, reason: 'composer_dirty' })

    // With it — the same pane, the same marker, a stamp inside the window — one Enter, and no second paste.
    driver.captures = [ours, ours, CODEX_BUSY]
    expect(sendWhenIdle('agent-1', prompt, { driver, timings, pasted: { at: Date.now() - 5_000 } })).toEqual({ sent: true })
    expect(driver.pasted()).toEqual([])
    expect(driver.count('send-keys')).toBe(1)
  })

  it('still refuses the marker when the persisted stamp is older than the window', async () => {
    // The record supplies a timestamp, it does not lift the freshness limit: a marker nobody pasted recently could be
    // somebody else's text, and submitting it would answer a prompt this flow never sent (block 69, review round 3).
    const { sendWhenIdle } = await seed({ tmux_pane_id: '%8' })
    const driver = new PaneDriver()
    driver.panes.add('%8')
    const prompt = 'x'.repeat(1510)
    driver.captures = [
      ['› [Pasted Content 1022 chars]', '  ← for agents · ? for shortcuts'].join('\n'),
      ['› [Pasted Content 1022 chars]', '  ← for agents · ? for shortcuts'].join('\n'),
    ]
    const timings = { pasteSettleMs: 0, submitWaitMs: 0, confirmMs: 30_000, confirmPollMs: 1000 }

    expect(sendWhenIdle('agent-1', prompt, { driver, timings, pasted: { at: Date.now() - 120_000 } }))
      .toEqual({ sent: false, reason: 'composer_dirty' })
    expect(driver.pasted()).toEqual([])
    expect(driver.count('send-keys')).toBe(0)
  })
})

// The incident of 2026-11-03 (block 73): a codex composer with the placeholder and the footer drawn but no `›`. The pane was
// idle, and the engine refused to type into it for ten minutes.
const CODEX_NO_GLYPH = [
  '  Ask Codex to do anything',
  '  GPT-6-Luna high · ~/projects/flow-finish',
  '  ← for agents · ? for shortcuts',
].join('\n')

describe('a composer without the glyph (block 73)', () => {
  it('pastes into it, because the frame is complete and confirmed twice', async () => {
    const { sendWhenIdle } = await seed()
    const driver = new PaneDriver()
    // gate (pending) → confirmation → the pane now holds our paste (still without a glyph) → the turn starts. A real pane
    // echoes what it was given; the placeholder is only there while the composer is empty.
    const ours = ['  hello', '  ← for agents · ? for shortcuts'].join('\n')
    driver.captures = [CODEX_NO_GLYPH, CODEX_NO_GLYPH, ours, CODEX_BUSY]
    const timings = { pasteSettleMs: 0, submitWaitMs: 0, confirmMs: 5_000, confirmPollMs: 1000 }

    expect(sendWhenIdle('agent-1', 'hello', { driver, timings })).toEqual({ sent: true })
    expect(driver.pasted()).toEqual(['hello'])
    expect(driver.count('send-keys')).toBe(1)
    // The confirmation waited a second between the two captures: that is what a fallback costs.
    expect(driver.delays.some(ms => ms >= 1_000)).toBe(true)
  })

  it('sends nothing when the second capture shows the turn had started', async () => {
    const { sendWhenIdle } = await seed()
    const driver = new PaneDriver()
    const busy = ['  ◦ Working (2s • esc to interrupt)', '', ...CODEX_NO_GLYPH.split('\n')].join('\n')
    driver.captures = [CODEX_NO_GLYPH, busy]
    const timings = { pasteSettleMs: 0, submitWaitMs: 0, confirmMs: 5_000, confirmPollMs: 1000 }

    expect(sendWhenIdle('agent-1', 'hello', { driver, timings })).toEqual({ sent: false, reason: 'busy' })
    expect(driver.pasted()).toEqual([])
    expect(driver.count('send-keys')).toBe(0)
  })

  it('refuses a pane that was busy inside the confirm window, however free this frame looks', async () => {
    // A transition is not an idle pane: the busiest thing the detector saw a moment ago still counts (block 73).
    const { paneBusy, sendWhenIdle } = await seed()
    const busyDriver = new PaneDriver()
    busyDriver.captures = [CODEX_BUSY]
    expect(paneBusy('agent-1', { driver: busyDriver })).toBe('busy')

    const driver = new PaneDriver()
    driver.captures = [CODEX_IDLE]
    const timings = { pasteSettleMs: 0, submitWaitMs: 0, confirmMs: 60_000, confirmPollMs: 1000 }

    expect(sendWhenIdle('agent-1', 'hello', { driver, timings })).toEqual({ sent: false, reason: 'recent_busy' })
    expect(driver.pasted()).toEqual([])
    expect(driver.count('send-keys')).toBe(0)
  })
})

describe('the glyph is not enough on its own (block 73, review round 1)', () => {
  it('refuses a pane whose composer a modal replaced, even with an old prompt in the frame', async () => {
    const { sendWhenIdle } = await seed()
    const driver = new PaneDriver()
    driver.captures = [[
      '› разберись с парсером',
      'VERDICT: CHANGES_REQUESTED',
      '▌ Select an environment',
      '  1. staging',
      '  2. production',
      '← for agents · ? for shortcuts',
    ].join('\n')]

    expect(sendWhenIdle('agent-1', 'hello', { driver, ...FAST })).toEqual({ sent: false, reason: 'unknown' })
    expect(driver.pasted()).toEqual([])
    expect(driver.count('send-keys')).toBe(0)
  })
})

describe('the prompt leaves as one line (block 75)', () => {
  it('flattens newlines at the pane, so the first Enter submits instead of closing the paste', async () => {
    // The live `fix_dispatched` of 2026-11-03: a multi-line prompt arrived as one bracketed paste, the provider's first Enter
    // only closed it, and the engine recorded `dispatch_refused pane_changed` while the prompt sat in the composer.
    const { sendWhenIdle } = await seed()
    const driver = new PaneDriver()
    driver.captures = [CODEX_IDLE, CODEX_IDLE, CODEX_BUSY]

    expect(sendWhenIdle('agent-1', 'first line\nsecond line\n\nthird line', { driver, ...FAST })).toEqual({ sent: true })
    expect(driver.pasted()).toEqual(['first line second line  third line'])
  })

  it('handles CR as well, and leaves a single-line prompt untouched', () => {
    expect(flattenPrompt('a\r\nb\rc')).toBe('a b c')
    expect(flattenPrompt('one line')).toBe('one line')
  })
})

describe('copy mode is recovered, not unknown (block 76)', () => {
  it('cancels copy mode on the observation path and re-reads the frame', async () => {
    // The live dispatch of 2026-11-03 sat in a dev's composer because the pane was in copy mode: tmux eats Enter there, so nothing
    // submitted, and the observation reported `unknown` for eleven minutes. One `cancel` returns the pane to normal.
    const { paneBusy } = await seed()
    const driver = new PaneDriver()
    driver.captures = [CODEX_COPY_MODE, CODEX_IDLE]

    expect(paneBusy('agent-1', { driver })).toBe('idle')
    const cancels = driver.calls.filter(call => call.args[0] === 'send-keys' && call.args.includes('-X'))
    expect(cancels).toHaveLength(1)
    expect(cancels[0]!.args[4]).toBe('cancel')
  })

  it('stays unknown when the cancel does not take', async () => {
    // A pane that keeps its badge after the cancel is still scrolling instead of typing, and it shows no turn: nothing may be
    // typed into it, and `unknown` is what the gate refuses on.
    const { paneBusy } = await seed()
    const driver = new PaneDriver()
    const stuck = ['[12/345]', '› Ask Codex to do anything', '  ← for agents · ? for shortcuts'].join('\n')
    driver.captures = [stuck]

    expect(paneBusy('agent-1', { driver })).toBe('unknown')
  })

  it('reads the busy hint of a copy-mode frame after the cancel all the same', async () => {
    // The badge is tmux's state, not the provider's: a frame that also shows a running turn is busy once the pane is back in
    // normal mode, and busy refuses a paste either way.
    const { paneBusy } = await seed()
    const driver = new PaneDriver()
    driver.captures = [CODEX_COPY_MODE]

    expect(paneBusy('agent-1', { driver })).toBe('busy')
  })
})
