import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { FlowState } from '../src/core/flow.js'
import {
  FLOW_STATUSES,
  FLOW_TRANSITIONS,
  PENDING_TTL_SEC,
  assertTransition,
  canTransition,
  createFlowState,
} from '../src/core/flow.js'
import { readFlow, saveFlow } from '../src/core/flow-store.js'
import { addFlowSpecs, pauseFlow, resumeFlow, stopFlow } from '../src/core/flow-control.js'

import type { FlowPorts } from '../src/core/flow-runner.js'
import { stepFlow } from '../src/core/flow-runner.js'
import { deleteRunHistory, runPath, writeAgent, writeRun } from '../src/core/runs.js'

// Operator lifecycle: the transition table, pause/resume/stop, the `orphaned` parking, and queueing a
// block on a flow that already exists. Nothing in this file sends into a pane, and the one test that
// could (a tick of a paused flow) asserts that the ports are never called at all.

const AT = '2026-01-01T00:00:00.000Z'
const NOW = Date.parse(AT)

let root: string
let savedRegistry: string | undefined

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'reeves-flow-control-'))
  // `withRunsLock` and the cascade in `deleteRunHistory` both read `stateRoot()`.
  savedRegistry = process.env.REEVES_REGISTRY
  process.env.REEVES_REGISTRY = root
})

afterEach(() => {
  if (savedRegistry === undefined) delete process.env.REEVES_REGISTRY
  else process.env.REEVES_REGISTRY = savedRegistry
  rmSync(root, { recursive: true, force: true })
})

function makeState(overrides: Partial<FlowState> = {}): FlowState {
  const base = createFlowState({
    run_id: 'run-1',
    repo: join(root, 'repo'),
    roles: { dev: 'dev-1', review: 'rev-1' },
    head: 'aaa111',
    at: AT,
  })
  return { ...base, ...overrides }
}

function seed(state = makeState()): FlowState {
  saveFlow(state, { root })
  return state
}

function flowFile(runId = 'run-1'): string {
  return join(root, 'flows', `${runId}.json`)
}

// A run whose two role agents exist, so the tick's presence check answers "the run is here".
function seedLiveRun(runId = 'run-1', agentIds = ['dev-1', 'rev-1']): void {
  writeRun({
    id: runId,
    name: runId,
    status: 'running',
    tmux_session: `reeves-${runId}`,
    reeves_window_id: '@0',
    reeves_pane_id: '%0',
    root_agent_id: agentIds[0] ?? 'root',
    working_dir: join(root, 'repo'),
    preset_name: null,
    started_at: AT,
    ended_at: null,
  })
  for (const id of agentIds) {
    writeAgent({
      id,
      run_id: runId,
      nickname: id,
      provider: 'cc',
      model: '',
      role: 'worker',
      working_dir: join(root, 'repo'),
      task: 'x',
      task_status: 'working',
      task_note: '',
      tmux_session: `reeves-${runId}`,
      tmux_window_id: '@1',
      tmux_pane_id: '%1',
      rc_enabled: false,
      permissions: 'ask',
      inbox: [],
      last_seen: NOW,
      started_at: AT,
      ended_at: null,
    })
  }
}

function makePorts(overrides: Partial<FlowPorts> = {}): FlowPorts & { send: ReturnType<typeof vi.fn> } {
  return {
    paneBusy: () => 'idle',
    peek: () => '',
    send: vi.fn(() => ({ sent: true as const })),
    ...overrides,
  } as FlowPorts & { send: ReturnType<typeof vi.fn> }
}

function step(ports: FlowPorts, overrides: Record<string, unknown> = {}) {
  return stepFlow('run-1', {
    ports, head: 'bbb222', tree_clean: true, now: NOW, at: AT, ...overrides,
  })
}

describe('the transition table', () => {
  it('is the only gate: every pair answers exactly as the table does', () => {
    for (const from of FLOW_STATUSES) {
      for (const to of FLOW_STATUSES) {
        expect(canTransition(from, to), `${from} -> ${to}`).toBe(FLOW_TRANSITIONS[from].includes(to))
        if (!canTransition(from, to)) {
          expect(() => assertTransition(from, to, 'move'), `${from} -> ${to}`)
            .toThrow(new RegExp(`cannot move a flow in state ${from}`))
        }
      }
    }
  })

  it('keeps `done` terminal and refuses the three commands that would revive it', () => {
    for (const to of FLOW_STATUSES) expect(canTransition('done', to)).toBe(false)
    seed(makeState({ state: 'done', close_reason: 'stopped by the operator' }))

    expect(() => pauseFlow('run-1')).toThrow(/cannot pause a flow in state done/)
    expect(() => resumeFlow('run-1')).toThrow(/cannot resume a flow in state done/)
    expect(() => stopFlow('run-1')).toThrow(/already closed \(stopped by the operator\)/)
  })

  it('lets an orphaned flow leave only through stop', () => {
    expect(FLOW_TRANSITIONS.orphaned).toEqual(['done'])
  })
})

describe('pause and resume', () => {
  it('pauses a running flow and remembers where it came from', () => {
    seed(makeState({ state: 'reviewing', review_started_at: NOW }))

    const paused = pauseFlow('run-1', { at: AT, now: NOW })

    expect(paused.state.state).toBe('paused')
    expect(paused.state.paused_from).toBe('reviewing')
    expect(paused.state.paused_at).toBe(NOW)
    expect(readFlow('run-1', { root }).state).toBe('paused')
    expect(readFlow('run-1', { root }).log.at(-1)).toMatchObject({ event: 'flow_paused', detail: 'from reviewing' })
  })

  it('resumes into the state it was paused from, not to the beginning', () => {
    seed(makeState({ state: 'fixing', claim: { head: 'aaa111', verdict: 'CHANGES_REQUESTED', verdict_count: 1 } }))
    pauseFlow('run-1', { at: AT, now: NOW })

    const resumed = resumeFlow('run-1', { at: AT })

    // `fixing` is what the engine waits in for a new HEAD: resuming into `idle` would re-review the
    // commit the reviewer has already seen.
    expect(resumed.state.state).toBe('fixing')
    expect(resumed.state.paused_from).toBeNull()
    expect(resumed.state.paused_at).toBeNull()
    expect(resumed.state.log.at(-1)).toMatchObject({ event: 'flow_resumed', detail: 'from paused to fixing' })
  })

  it('drops an unsettled dispatch claim on pause, so a resume does not inherit a stuck send', () => {
    seed(makeState({
      pending: { op_id: 'op-1', kind: 'request_review', target: 'review', head: 'aaa111', spec_id: null, at: NOW },
    }))

    const paused = pauseFlow('run-1', { at: AT, now: NOW })

    expect(paused.state.pending).toBeNull()
    expect(paused.state.log.at(-1)?.detail).toContain('dropped an unsettled dispatch')
    // And the resume is immediately usable: no `dispatch_pending`, no TTL escalation.
    expect(resumeFlow('run-1', { at: AT }).state.state).toBe('idle')
  })

  it('grants an escalated flow a fresh budget and says so in the journal', () => {
    seed(makeState({ state: 'escalated', rounds: 6 }))

    const resumed = resumeFlow('run-1', { at: AT })

    expect(resumed.state.state).toBe('idle')
    expect(resumed.state.rounds).toBe(0)
    expect(resumed.state.log.at(-1)?.detail).toContain('rounds reset from 6')
  })

  it('refuses a second pause and a resume of a flow that is not paused', () => {
    seed(makeState({ state: 'idle' }))
    pauseFlow('run-1', { at: AT, now: NOW })
    expect(() => pauseFlow('run-1', { at: AT, now: NOW })).toThrow(/already paused/)

    stopFlow('run-1', { at: AT })
    expect(readFlow('run-1', { root }).state).toBe('done')
    expect(() => pauseFlow('run-1', { at: AT, now: NOW })).toThrow(/cannot pause a flow in state done/)
  })
})

describe('a paused flow is inert', () => {
  it('neither observes nor sends on a tick', () => {
    const state = seed(makeState({ state: 'paused', paused_from: 'idle', paused_at: NOW }))
    const before = readFileSync(flowFile(), 'utf-8')
    const ports = makePorts({
      // Any observation of a paused flow is a bug: these throw instead of counting calls.
      paneBusy: () => { throw new Error('a paused flow must not read a pane') },
      peek: () => { throw new Error('a paused flow must not capture a pane') },
      send: vi.fn(() => { throw new Error('a paused flow must not send') }),
    })

    const result = step(ports)

    expect(result.decision.kind).toBe('none')
    expect(result.decision.reason).toBe('flow_paused')
    expect(result.status).toBe('skipped')
    expect(result.send).toBeUndefined()
    expect(readFileSync(flowFile(), 'utf-8')).toBe(before)
    expect(readFlow('run-1', { root }).state).toBe(state.state)
  })

  it('sends nothing after a stop either', () => {
    seed(makeState({ state: 'reviewing', review_started_at: NOW }))
    stopFlow('run-1', { at: AT })
    const ports = makePorts()

    const result = step(ports)

    expect(result.decision.reason).toBe('flow_closed')
    expect(ports.send).not.toHaveBeenCalled()
  })
})

describe('stop', () => {
  it('closes the flow with the reason and keeps the file for `flow logs`', () => {
    seed(makeState({ state: 'fixing', rounds: 2 }))

    const stopped = stopFlow('run-1', { at: AT })

    expect(stopped.state.state).toBe('done')
    expect(stopped.state.close_reason).toBe('stopped by the operator')
    expect(stopped.state.rounds).toBe(2)
    expect(existsSync(flowFile())).toBe(true)
    expect(stopped.state.log.at(-1)?.event).toBe('flow_stopped')
  })
})

describe('orphaned', () => {
  it('parks a flow whose run is gone, writes the reason once and then holds', () => {
    // No run in the registry: this is what an archived run (`stop`, `delete-run`, the sweep) looks
    // like from here.
    seed(makeState({ state: 'idle' }))
    const ports = makePorts()

    const first = step(ports)

    expect(first.decision.kind).toBe('orphan')
    expect(first.decision.reason).toBe('run_gone')
    expect(first.status).toBe('applied')
    const parked = readFlow('run-1', { root })
    expect(parked.state).toBe('orphaned')
    expect(parked.orphan_reason).toContain('no longer in the registry')
    expect(parked.log.filter(entry => entry.event === 'flow_orphaned')).toHaveLength(1)
    const afterFirst = readFileSync(flowFile(), 'utf-8')

    // A tick every two seconds must not rewrite the file or append the same line again.
    for (let pass = 0; pass < 3; pass += 1) {
      const again = step(ports)
      expect(again.decision.reason).toBe('flow_orphaned')
      expect(again.status).toBe('skipped')
      expect(again.send).toBeUndefined()
    }
    expect(readFileSync(flowFile(), 'utf-8')).toBe(afterFirst)
    expect(ports.send).not.toHaveBeenCalled()
  })

  it('parks a flow whose run lost one of its role agents', () => {
    seedLiveRun('run-1', ['dev-1'])
    seed(makeState({ state: 'idle' }))

    const result = step(makePorts())

    expect(result.decision.reason).toBe('agents_gone')
    const parked = readFlow('run-1', { root })
    expect(parked.state).toBe('orphaned')
    expect(parked.orphan_reason).toContain('role agents')
  })

  it('does not park a flow when the registry cannot be read', () => {
    // `readRun` answers "Run not found" for a corrupt file too, so existence is what decides: a run
    // file that exists but does not parse is a broken probe, not an archived run.
    seedLiveRun()
    seed(makeState({ state: 'idle' }))
    writeFileSync(runPath('run-1'), '{"id": "run-1", broken', 'utf-8')

    const result = step(makePorts())

    expect(result.decision.kind).not.toBe('orphan')
    expect(readFlow('run-1', { root }).state).not.toBe('orphaned')
  })

  it('does not park a flow when the agents directory cannot be read', () => {
    // `listAgents` turns a read error into an empty list, which would read as "the agents are gone".
    // A file where the directory should be makes `readdirSync` fail with ENOTDIR, not ENOENT.
    seedLiveRun()
    seed(makeState({ state: 'idle' }))
    const agentsDir = join(root, 'runs', 'run-1', 'agents')
    rmSync(agentsDir, { recursive: true, force: true })
    writeFileSync(agentsDir, 'not a directory', 'utf-8')

    const result = step(makePorts())

    expect(result.decision.kind).not.toBe('orphan')
    expect(readFlow('run-1', { root }).state).not.toBe('orphaned')
  })

  it('does not park a flow when a role agent record is damaged', () => {
    seedLiveRun()
    seed(makeState({ state: 'idle' }))
    writeFileSync(join(root, 'runs', 'run-1', 'agents', 'rev-1.json'), '{"id": "rev-1", broken', 'utf-8')

    const result = step(makePorts())

    expect(result.decision.kind).not.toBe('orphan')
    expect(readFlow('run-1', { root }).state).not.toBe('orphaned')
  })

  it('parks a flow whose role agent has ended, even though its record is still there', () => {
    seedLiveRun()
    // The reviewer's agent ended: the record stays in the run directory, the pane does not exist.
    writeAgent({
      id: 'rev-1',
      run_id: 'run-1',
      nickname: 'rev-1',
      provider: 'cc',
      model: '',
      role: 'worker',
      working_dir: join(root, 'repo'),
      task: 'x',
      task_status: 'done',
      task_note: '',
      tmux_session: 'reeves-run-1',
      tmux_window_id: '@1',
      tmux_pane_id: '%1',
      rc_enabled: false,
      permissions: 'ask',
      inbox: [],
      last_seen: NOW,
      started_at: AT,
      ended_at: '2026-01-01T01:00:00.000Z',
    })
    seed(makeState({ state: 'idle' }))

    const result = step(makePorts())

    expect(result.decision.reason).toBe('agents_gone')
    expect(readFlow('run-1', { root }).state).toBe('orphaned')
  })

  it('does not park a flow whose run and agents are there', () => {
    seedLiveRun()
    seed(makeState({ state: 'idle' }))

    const result = step(makePorts())

    expect(result.decision.kind).toBe('request_review')
    expect(readFlow('run-1', { root }).state).toBe('reviewing')
  })

  it('leaves an orphaned flow to the operator: only stop closes it', () => {
    seed(makeState({ state: 'orphaned', orphan_reason: 'the run is gone' }))
    expect(() => pauseFlow('run-1')).toThrow(/cannot pause a flow in state orphaned/)
    expect(() => resumeFlow('run-1')).toThrow(/cannot resume a flow in state orphaned/)
    expect(stopFlow('run-1', { at: AT }).state.state).toBe('done')
  })
})

describe('a control command that lands during a dispatch', () => {
  // The claim is taken under the lock and the paste happens outside it, so a pause/stop can arrive
  // in exactly that window. Both drop the claim, which is why the runner re-reads it once before the
  // paste: without that check the operator would pause the flow and still receive one prompt.
  it('sends nothing when a pause lands between the claim and the paste', () => {
    seedLiveRun()
    seed(makeState({ state: 'idle' }))
    const ports = makePorts()

    const result = step(ports, {
      onClaimed: () => { pauseFlow('run-1', { at: AT, now: NOW }) },
    })

    expect(result.status).toBe('cancelled')
    expect(ports.send).not.toHaveBeenCalled()
    const after = readFlow('run-1', { root })
    expect(after.state).toBe('paused')
    expect(after.pending).toBeNull()
    // The decision was never applied: the review request is not on the flow.
    expect(after.claim.head).toBe('aaa111')
    expect(after.log.some(entry => entry.event === 'request_review')).toBe(false)
  })

  it('sends nothing when a stop lands between the claim and the paste', () => {
    seedLiveRun()
    seed(makeState({ state: 'idle' }))
    const ports = makePorts()

    const result = step(ports, {
      onClaimed: () => { stopFlow('run-1', { at: AT }) },
    })

    expect(result.status).toBe('cancelled')
    expect(ports.send).not.toHaveBeenCalled()
    expect(readFlow('run-1', { root }).state).toBe('done')
  })

  it('refuses a pause that arrives while the prompt is being typed', () => {
    // The gate is what closes the window a check-then-act leaves: while the paste is in flight a
    // control command cannot get in, so it never writes a state the paste will contradict.
    seedLiveRun()
    seed(makeState({ state: 'idle' }))
    // A holder rather than a `let`: TypeScript cannot see an assignment made inside the callback and
    // would narrow the variable to `null` at the assertion.
    const captured: { error: Error | null } = { error: null }
    const ports = makePorts({
      send: vi.fn(() => {
        try {
          pauseFlow('run-1', { at: AT, now: NOW, gate_timeout_ms: 50 })
        } catch (err) {
          captured.error = err as Error
        }
        return { sent: true as const }
      }),
    })

    const result = step(ports)

    expect(result.status).toBe('applied')
    expect(ports.send).toHaveBeenCalledTimes(1)
    expect(captured.error?.message).toContain('a dispatch is in flight')
    // The flow moved, and the pause changed nothing: it landed before the claim check or not at all.
    expect(readFlow('run-1', { root }).state).toBe('reviewing')
    // The gate is free again, so the operator can pause now.
    expect(readdirSync(root).filter(name => name.startsWith('.flow-dispatch'))).toEqual([])
    expect(pauseFlow('run-1', { at: AT, now: NOW }).state.state).toBe('paused')
  })

  it('does not paste when someone else holds the gate, and releases its claim', () => {
    seedLiveRun()
    seed(makeState({ state: 'idle' }))
    // Another live actor holds the gate: its ticket is the smallest one, so this tick must not paste.
    // It carries a real process instance (PID 1), because an entry without one is refused instead.
    const instance = (() => {
      try {
        const stat = readFileSync('/proc/1/stat', 'utf-8')
        return `linux:${stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19]}`
      } catch {
        return ''
      }
    })()
    if (!instance) return
    const foreignTicket = join(root, '.flow-dispatch.cand.1.foreign')
    writeFileSync(foreignTicket, JSON.stringify({ pid: 1, token: 'foreign', ts: 0, instance }), 'utf-8')
    const ports = makePorts()

    const result = step(ports, { gate_timeout_ms: 50 })

    expect(result.status).toBe('locked')
    expect(ports.send).not.toHaveBeenCalled()
    // The claim is released so the next tick starts clean instead of escalating a send that never
    // happened; the flow itself did not move.
    const after = readFlow('run-1', { root })
    expect(after.pending).toBeNull()
    expect(after.state).toBe('idle')
    expect(after.log.at(-1)).toMatchObject({ event: 'dispatch_refused', detail: 'dispatch gate busy' })
    // The foreign contender's ticket is untouched: this process never removes what it did not create.
    expect(existsSync(foreignTicket)).toBe(true)
  })

  it('still sends when nothing interrupts it', () => {
    seedLiveRun()
    seed(makeState({ state: 'idle' }))
    const ports = makePorts()

    const result = step(ports, { onClaimed: () => {} })

    expect(result.status).toBe('applied')
    expect(ports.send).toHaveBeenCalledTimes(1)
  })
})

describe('add-spec after the flow started', () => {
  function structured(name: string, overrides: Record<string, unknown> = {}): string {
    const path = join(root, name)
    writeFileSync(path, JSON.stringify({
      id: 'block_07',
      title: 'Lifecycle',
      goal: 'g',
      requirements: ['r'],
      checks: ['c'],
      ...overrides,
    }), 'utf-8')
    return path
  }

  it('queues a structured block and reports the new queue', () => {
    seed(makeState({ state: 'idle' }))
    const added = addFlowSpecs({ run_id: 'run-1', files: [structured('block_07.json')] }, { at: AT })

    expect(added.queued.map(spec => spec.id)).toEqual(['block_07'])
    expect(readFlow('run-1', { root }).specs.map(spec => spec.id)).toEqual(['block_07'])
    expect(readFlow('run-1', { root }).log.at(-1)).toMatchObject({ event: 'spec_queued', detail: 'block_07' })
  })

  it('refuses a structured block with empty requirements or checks', () => {
    seed(makeState({ state: 'idle' }))
    const before = readFileSync(flowFile(), 'utf-8')
    const thin = structured('thin.json', { requirements: [], checks: [] })

    expect(() => addFlowSpecs({ run_id: 'run-1', files: [thin] })).toThrow(/requirements/)
    // Nothing was written: validation happens before the lock, so one bad file cannot half-queue.
    expect(readFileSync(flowFile(), 'utf-8')).toBe(before)
  })

  it('marks a --markdown block unstructured and keeps the downgrade visible', () => {
    seed(makeState({ state: 'paused', paused_from: 'idle', paused_at: NOW }))
    const md = join(root, 'block_08.md')
    writeFileSync(md, '# Block 08 — notes\n\nBody only.\n', 'utf-8')

    const added = addFlowSpecs({ run_id: 'run-1', markdown: [md] }, { at: AT })

    expect(added.queued).toHaveLength(1)
    expect(added.queued[0]!.unstructured).toBe(true)
    expect(added.queued[0]!.requirements).toEqual([])
    // Queueing while paused is allowed: the block waits for the resume instead of being lost.
    expect(readFlow('run-1', { root }).state).toBe('paused')
  })

  it('writes nothing when one of several files is invalid', () => {
    seed(makeState({ state: 'idle' }))
    const before = readFileSync(flowFile(), 'utf-8')
    const good = structured('good.json', { id: 'block_09' })
    const bad = structured('bad.json', { id: 'block_10', checks: [] })

    expect(() => addFlowSpecs({ run_id: 'run-1', files: [good, bad] })).toThrow(/checks/)
    expect(readFileSync(flowFile(), 'utf-8')).toBe(before)
  })

  it('refuses to queue on a flow that is closed or parked', () => {
    seed(makeState({ state: 'done', close_reason: 'stopped by the operator' }))
    const file = structured('block_11.json')
    expect(() => addFlowSpecs({ run_id: 'run-1', files: [file] })).toThrow(/would never be dispatched/)

    seed(makeState({ state: 'orphaned', orphan_reason: 'the run is gone' }))
    expect(() => addFlowSpecs({ run_id: 'run-1', files: [file] })).toThrow(/orphaned/)
  })
})

describe('the cascade into deleteRunHistory', () => {
  it('takes the flow file with the history record, and nothing else deletes it', () => {
    seed(makeState({ state: 'orphaned', orphan_reason: 'the run is gone' }))
    expect(existsSync(flowFile())).toBe(true)

    // The only automatic deletion in the design (§3.3).
    deleteRunHistory('run-1')

    expect(existsSync(flowFile())).toBe(false)
  })

  it('tolerates a run that never had a flow', () => {
    expect(() => deleteRunHistory('run-without-flow')).not.toThrow()
  })
})

describe('a claim left behind by a dead process', () => {
  it('still escalates rather than parking the flow as orphaned', () => {
    // The claim outranks the presence check: a send in flight has to settle (or expire) first.
    seed(makeState({
      state: 'idle',
      pending: {
        op_id: 'op-1', kind: 'dispatch_spec', target: 'dev', head: 'aaa111', spec_id: null,
        at: NOW - (PENDING_TTL_SEC + 1) * 1000,
      },
    }))

    const result = step(makePorts())

    expect(result.decision.kind).toBe('escalate')
    expect(result.decision.reason).toBe('dispatch_unresolved')
    expect(readFlow('run-1', { root }).state).toBe('escalated')
  })
})
