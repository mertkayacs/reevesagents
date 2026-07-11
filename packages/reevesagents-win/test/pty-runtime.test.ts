import { afterEach, describe, expect, it } from 'vitest'
import { fileURLToPath, URL } from 'node:url'
import {
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
  type SpawnPty,
} from '../src/core/pty-runtime.js'
import { listRuns, readAgent as readAgentRecord } from '../src/core/registry.js'

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
