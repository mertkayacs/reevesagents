import { afterEach, describe, expect, it } from 'vitest'
import { fileURLToPath, URL } from 'node:url'
import {
  advanceStartupGate,
  createStartupGateState,
  interrupt,
  isAgentLive,
  killAgent,
  readAgent,
  resetRuntimeSeams,
  sendKey,
  sendText,
  setPlanSpawn,
  setSpawnPty,
  startRun,
  startupDetectionText,
  type SpawnPty,
} from '../src/core/pty-runtime.js'
import { listRuns, readAgent as readAgentRecord } from '../src/core/registry.js'
import { PROVIDER_REGISTRY } from '../src/shared/provider-registry.js'

const STUB = fileURLToPath(new URL('./fixtures/stub-cli.mjs', import.meta.url))

async function waitUntil(predicate: () => boolean, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error('waitUntil timed out')
}

afterEach(() => {
  resetRuntimeSeams()
})

// A real ConPTY is only available on Windows, but @lydell/node-pty spawns a real pty
// on Linux too, so these exercise the spawn/read/send/interrupt/kill pipeline end to
// end. planSpawn is aimed at a stub CLI so no provider needs to be installed.
describe('pty-runtime (real pty, stub CLI)', () => {
  function spawnStub(task = '') {
    setPlanSpawn(() => ({ file: process.execPath, args: [STUB] }))
    const { run, agents } = startRun({ name: 'stub run', working_dir: process.cwd(), root: { provider: 'cc', model: '', task } })
    return { run, agentId: agents[0]!.id }
  }

  it('captures stub output through read', async () => {
    const { agentId } = spawnStub()
    await waitUntil(() => readAgent(agentId, 50).includes('STUB READY'))
    expect(readAgent(agentId, 50)).toContain('STUB READY')
  })

  it('delivers send_text + send_key enter to the agent', async () => {
    const { agentId } = spawnStub()
    await waitUntil(() => readAgent(agentId, 50).includes('STUB READY'))
    sendText(agentId, 'hello world')
    await sendKey(agentId, 'enter')
    await waitUntil(() => readAgent(agentId, 80).includes('ECHO: hello world'))
    expect(readAgent(agentId, 80)).toContain('ECHO: hello world')
  })

  it('kill terminates the agent, marks it ended, and archives the single-agent run', async () => {
    const { run, agentId } = spawnStub()
    await waitUntil(() => readAgent(agentId, 50).includes('STUB READY'))

    const ended = killAgent(agentId)
    expect(ended.ended_at).not.toBeNull()
    expect(isAgentLive(agentId)).toBe(false)
    expect(() => readAgent(agentId)).toThrow(/not owned/)
    // Last live agent gone, so the run is archived and removed.
    expect(listRuns().map(r => r.id)).not.toContain(run.id)
  })

  it('interrupt (ctrl-c) makes the stub exit and drops it from the live map', async () => {
    const { agentId } = spawnStub()
    await waitUntil(() => readAgent(agentId, 50).includes('STUB READY'))
    interrupt(agentId)
    await waitUntil(() => !isAgentLive(agentId))
    expect(isAgentLive(agentId)).toBe(false)
  })
})

// A fake IPty makes the exact bytes deterministic without racing a real process.
class FakeTerm {
  pid = Math.floor(Math.random() * 10_000) + 1000
  writes: string[] = []
  private dataCb: ((_d: string) => void) | null = null
  private exitCb: ((_e: { exitCode: number }) => void) | null = null
  onData(cb: (_d: string) => void) { this.dataCb = cb; return { dispose() {} } }
  onExit(cb: (_e: { exitCode: number }) => void) { this.exitCb = cb; return { dispose() {} } }
  write(data: string) { this.writes.push(data) }
  kill() { /* teardown is exercised via emitExit */ }
  feed(data: string) { this.dataCb?.(data) }
  emitExit(code = 0) { this.exitCb?.({ exitCode: code }) }
}

describe('pty-runtime (fake IPty)', () => {
  const spawned: FakeTerm[] = []

  function useFake() {
    spawned.length = 0
    setPlanSpawn(() => ({ file: 'stub', args: [] }))
    setSpawnPty(((): FakeTerm => {
      const term = new FakeTerm()
      spawned.push(term)
      return term
    }) as unknown as SpawnPty)
  }

  it('send_text wraps the text in a bracketed paste and does not submit', () => {
    useFake()
    const { agents } = startRun({ name: 't', working_dir: process.cwd(), root: { provider: 'cc', model: '', task: '' } })
    sendText(agents[0]!.id, 'do the thing')
    expect(spawned[0]!.writes).toContain('\x1b[200~do the thing\x1b[201~')
    expect(spawned[0]!.writes).not.toContain('\r')
  })

  it('send_key writes the mapped bytes', async () => {
    useFake()
    const { agents } = startRun({ name: 't', working_dir: process.cwd(), root: { provider: 'cc', model: '', task: '' } })
    const id = agents[0]!.id
    await sendKey(id, 'escape')
    await sendKey(id, 'enter') // no preceding paste, so no post-paste wait
    expect(spawned[0]!.writes).toEqual(['\x1b', '\r'])
  })

  it('interrupt writes ctrl-c (never a signal)', () => {
    useFake()
    const { agents } = startRun({ name: 't', working_dir: process.cwd(), root: { provider: 'cc', model: '', task: '' } })
    interrupt(agents[0]!.id)
    expect(spawned[0]!.writes).toEqual(['\x03'])
  })

  it('records the pty pid on the agent and buffers onData for read', () => {
    useFake()
    const { run, agents } = startRun({ name: 't', working_dir: process.cwd(), root: { provider: 'codex', model: '', task: '' } })
    const id = agents[0]!.id
    expect(readAgentRecord(run.id, id).pid).toBe(spawned[0]!.pid)
    spawned[0]!.feed('waiting for input')
    expect(readAgent(id)).toContain('waiting for input')
  })

  it('rejects drive ops on an agent this session does not own', () => {
    useFake()
    const { agents } = startRun({ name: 't', working_dir: process.cwd(), root: { provider: 'cc', model: '', task: '' } })
    const id = agents[0]!.id
    killAgent(id)
    expect(() => readAgent(id)).toThrow(/not owned/)
    expect(() => sendText(id, 'x')).toThrow(/not owned/)
    expect(() => interrupt(id)).toThrow(/not owned/)
  })

  it('a self-exit archives the single-agent run and drops it from live', () => {
    useFake()
    const { run, agents } = startRun({ name: 't', working_dir: process.cwd(), root: { provider: 'cc', model: '', task: '' } })
    const id = agents[0]!.id
    spawned[0]!.emitExit(0)
    expect(isAgentLive(id)).toBe(false)
    expect(listRuns().map(r => r.id)).not.toContain(run.id)
  })
})

// Startup gate (registry `startup`, provider agy). Pure helper cases: the poll
// sequence is driven by hand with waitedMs, so no timers are involved.
describe('startup gate (advanceStartupGate)', () => {
  const gate = PROVIDER_REGISTRY.agy.startup!
  const DIALOG = 'Do you trust the contents of this project?'
  const FOOTER = '? for shortcuts'

  function run(
    polls: Array<{ at: number; text: string }>,
    permissions: 'skip' | 'ask' = 'skip',
  ) {
    const state = createStartupGateState()
    return polls.map(p => ({ at: p.at, action: advanceStartupGate(state, p.text, p.at, permissions, gate) }))
  }

  it('dialog + skip: key only after 2 stable polls, retried after 3s, at most 3 attempts', () => {
    const polls = [0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 11000]
      .map(at => ({ at, text: DIALOG }))
    const keys = run(polls).filter(r => r.action.sendKey).map(r => [r.at, r.action.sendKey])
    expect(keys).toEqual([[1000, 'enter'], [4000, 'enter'], [7000, 'enter']])
    expect(run(polls).some(r => r.action.sendTask)).toBe(false)
  })

  it('dialog + skip: a single poll never answers', () => {
    const [first] = run([{ at: 0, text: DIALOG }])
    expect(first!.action).toEqual({})
  })

  it('dialog + ask: no key and no task, even past the fallback window', () => {
    const polls = Array.from({ length: 40 }, (_, i) => ({ at: i * 1000, text: DIALOG }))
    const actions = run(polls, 'ask').map(r => r.action)
    expect(actions.every(a => !a.sendKey && !a.sendTask)).toBe(true)
  })

  it('dialog + permissions undefined-equivalent (ask default) never answers', () => {
    const polls = [0, 1000, 2000, 3000].map(at => ({ at, text: DIALOG }))
    expect(run(polls, 'ask').some(r => r.action.sendKey)).toBe(false)
  })

  it('footer visible releases the task', () => {
    const [only] = run([{ at: 0, text: `Welcome ${FOOTER}` }])
    expect(only!.action).toEqual({ sendTask: true })
  })

  it('dialog closes but footer not yet visible: hold until footer, or 20s after last dialog sight', () => {
    // Dialog last seen at 20s, gone at 21s. No footer yet.
    const visible = Array.from({ length: 21 }, (_, i) => ({ at: i * 1000, text: DIALOG }))
    const polls = [
      ...visible,
      { at: 21_000, text: '' },
      { at: 30_000, text: '' },
      { at: 39_999, text: '' },
      { at: 40_000, text: '' },
    ]
    const acts = run(polls, 'ask')
    expect(acts.filter(r => r.action.sendTask).map(r => r.at)).toEqual([40_000])

    // Footer arriving inside the window releases the task early.
    const early = run([...visible, { at: 21_000, text: '' }, { at: 25_000, text: FOOTER }], 'ask')
    expect(early.at(-1)!.action).toEqual({ sendTask: true })
  })

  it('dialog only in scrollback beyond the last 20 lines does not block: ready', () => {
    const scrollback = [DIALOG, ...Array.from({ length: 25 }, (_, i) => `line ${i}`)].join('\n')
    const text = startupDetectionText(`\x1b[31m${scrollback}\x1b[0m\n${FOOTER}`)
    expect(text).not.toContain('trust')
    const [only] = run([{ at: 0, text }])
    expect(only!.action).toEqual({ sendTask: true })
  })

  it('startupDetectionText keeps the last 20 non-empty lines, stripped and collapsed', () => {
    const raw = ['\x1b[1mone\x1b[0m', '', '  two   words  ', ...Array.from({ length: 19 }, (_, i) => `n${i}`)].join('\n')
    const text = startupDetectionText(raw)
    expect(text.startsWith('one')).toBe(false)
    expect(text.startsWith('two words n0')).toBe(true)
    expect(text.endsWith('n18')).toBe(true)
  })

  it('gives up silently at the 60 minute hard cap', () => {
    const [capped] = run([{ at: 60 * 60_000, text: DIALOG }], 'skip')
    expect(capped!.action).toEqual({ done: true })
  })

  it('providers without a startup block keep the legacy path', () => {
    expect(PROVIDER_REGISTRY.cc.startup).toBeUndefined()
  })
})

describe('pty-runtime non-gated paste path (fake IPty)', () => {
  it('a provider without startup pastes once the legacy ready marker shows, then presses Enter', async () => {
    const term = new FakeTerm()
    setPlanSpawn(() => ({ file: 'stub', args: [] }))
    setSpawnPty((() => term) as unknown as SpawnPty)
    const { agents } = startRun({ name: 't', working_dir: process.cwd(), root: { provider: 'cc', model: '', task: 'do it' } })
    term.feed('ready')
    await waitUntil(() => term.writes.some(w => w === '\r'), 20_000)
    expect(term.writes).toContain('\x1b[200~do it\x1b[201~')
    expect(term.writes.indexOf('\x1b[200~do it\x1b[201~')).toBeLessThan(term.writes.indexOf('\r'))
    expect(agents).toHaveLength(1)
  })
})
