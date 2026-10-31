import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { FlowState } from '../src/core/flow.js'
import { PENDING_TTL_SEC, applyDecisionToState, createFlowState, flowTick } from '../src/core/flow.js'
import { readFlow, saveFlow } from '../src/core/flow-store.js'
import type { FlowPorts, FlowStepResult, StepFlowOptions } from '../src/core/flow-runner.js'
import { observeFlow, stepFlow } from '../src/core/flow-runner.js'

// The effect layer: observation reads, and the claim -> act -> settle dispatch. Nothing here sends
// into a pane the gate did not confirm, an ambiguous paste is never repeated, and a claim left on
// disk by a dead process is escalated instead of re-sent.

const AT = '2026-01-01T00:00:00.000Z'
const NOW = Date.parse(AT)

let root: string
let savedRegistry: string | undefined

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'reeves-flow-runner-'))
  // `stepFlow` takes the runs lock, and `stateRoot()` reads this: without it the test would take
  // the operator's real lock file.
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
    repo: '/repo',
    roles: { dev: 'dev-1', review: 'rev-1' },
    head: 'aaa111',
    at: AT,
  })
  const state = { ...base, ...overrides }
  if (state.state === 'reviewing' && state.review_started_at === null && overrides.review_started_at === undefined) {
    state.review_started_at = NOW
  }
  return state
}

function seed(state = makeState()): FlowState {
  saveFlow(state)
  return state
}

function flowFile(): string {
  return join(root, 'flows', 'run-1.json')
}

// A capture with `times` verdicts, so the reviewer's counter is a fixture instead of a mock.
function verdictCapture(times: number, verdict: 'ACCEPT' | 'CHANGES_REQUESTED' = 'CHANGES_REQUESTED'): string {
  const block = `round\nVERDICT: ${verdict}\nMAJOR: null is treated as absent\n> `
  return Array.from({ length: times }, () => block).join('\n')
}

function makePorts(overrides: Partial<FlowPorts> = {}): FlowPorts & { send: ReturnType<typeof vi.fn> } {
  return {
    paneBusy: () => 'idle',
    peek: () => '',
    send: vi.fn(() => ({ sent: true as const })),
    ...overrides,
  } as FlowPorts & { send: ReturnType<typeof vi.fn> }
}

// Every step below passes `head` and `tree_clean`, so no test shells out to git. Presence is passed
// as well: this file describes a dispatcher, and the registry question (is the run still there?) has
// its own tests — without the flags every case here would park the flow as `orphaned`.
function step(ports: FlowPorts, overrides: Partial<StepFlowOptions> = {}): FlowStepResult {
  return stepFlow('run-1', {
    ports, head: 'bbb222', tree_clean: true, now: NOW, at: AT, run_present: true, agents_present: true, ...overrides,
  })
}

describe('observeFlow', () => {
  it('reads the reviewer pane and reports the verdict count with its notes', () => {
    const ports = makePorts({ peek: () => verdictCapture(1) })
    const observations = observeFlow(makeState(), { ports, head: 'bbb222', tree_clean: true })

    expect(observations.head).toBe('bbb222')
    expect(observations.verdict).toBe('CHANGES_REQUESTED')
    expect(observations.verdict_count).toBe(1)
    expect(observations.verdict_notes).toContain('MAJOR: null is treated as absent')
  })

  it('reports no verdict evidence at all when the reviewer pane cannot be classified', () => {
    const ports = makePorts({
      paneBusy: agentId => agentId === 'rev-1' ? 'unknown' : 'idle',
      peek: () => 'VERDICT: ACCEPT',
    })
    const observations = observeFlow(makeState(), { ports, head: 'bbb222', tree_clean: true })

    expect(observations.review_pane).toBe('unknown')
    expect(observations.verdict).toBeNull()
    expect(observations.verdict_count).toBe(0)
  })
})

describe('stepFlow', () => {
  it('sends nothing and writes nothing when a pane is busy or unknown', () => {
    for (const pane of ['busy', 'unknown'] as const) {
      const seeded = seed()
      const before = readFileSync(flowFile(), 'utf-8')
      const ports = makePorts({ paneBusy: () => pane })

      const result = step(ports)

      expect(result.status).toBe('skipped')
      expect(result.send).toBeUndefined()
      expect(ports.send).not.toHaveBeenCalled()
      expect(readFileSync(flowFile(), 'utf-8')).toBe(before)
      expect(readFlow('run-1').state).toBe(seeded.state)
    }
  })

  it('claims the dispatch before the paste and clears the claim once it settled', () => {
    seed()
    const seen: FlowState[] = []
    const ports = makePorts({
      send: vi.fn(() => {
        // What a second process — or a human reading `flow status` — sees while the paste is in
        // flight: a claim on disk, not "nothing happened yet".
        seen.push(readFlow('run-1'))
        return { sent: true as const }
      }),
    })

    const result = step(ports)

    expect(result.status).toBe('applied')
    expect(seen).toHaveLength(1)
    expect(seen[0]!.pending).toMatchObject({ kind: 'request_review', target: 'review' })
    expect(seen[0]!.log.at(-1)?.event).toBe('dispatch_claimed')
    const after = readFlow('run-1')
    expect(after.pending).toBeNull()
    expect(after.state).toBe('reviewing')
    expect(after.claim).toEqual({ head: 'bbb222', verdict: null, verdict_count: 0 })
  })

  it('lets a second ticker find the claim and send nothing', () => {
    seed()
    const other = makePorts()
    let nested: FlowStepResult | undefined
    const ports = makePorts({
      send: vi.fn(() => {
        // A concurrent tick in the middle of our paste: it must read the claim and hold.
        nested = step(other)
        return { sent: true as const }
      }),
    })

    const first = step(ports)

    expect(first.status).toBe('applied')
    expect(nested?.status).toBe('skipped')
    expect(nested?.decision.kind).toBe('none')
    expect(nested?.decision.reason).toBe('dispatch_pending')
    expect(other.send).not.toHaveBeenCalled()
    // One paste for two tickers, which is the whole point of the claim.
    expect(ports.send).toHaveBeenCalledTimes(1)
  })

  it('releases the claim when the pane refuses the paste, and retries on the next tick', () => {
    seed()
    const refused = makePorts({ send: vi.fn(() => ({ sent: false as const, reason: 'busy' as const })) })

    const first = step(refused)

    expect(first.status).toBe('refused')
    expect(first.send).toEqual({ sent: false, reason: 'busy' })
    const released = readFlow('run-1')
    expect(released.pending).toBeNull()
    // Nothing was pasted, so the status stays where it was and the next tick is free to act.
    expect(released.state).toBe('idle')
    expect(released.log.at(-1)).toMatchObject({ event: 'dispatch_refused', detail: 'busy' })

    const retry = makePorts()
    const second = step(retry)
    expect(second.status).toBe('applied')
    expect(retry.send).toHaveBeenCalledTimes(1)
    expect(readFlow('run-1').state).toBe('reviewing')
  })

  it('escalates a claim left behind by a dead ticker instead of pasting again', () => {
    seed(makeState({
      pending: {
        op_id: 'op-1',
        kind: 'request_review',
        target: 'review',
        head: 'bbb222',
        spec_id: null,
        at: NOW - (PENDING_TTL_SEC + 1) * 1000,
      },
    }))
    const ports = makePorts()

    const result = step(ports)

    expect(result.decision.reason).toBe('dispatch_unresolved')
    expect(result.status).toBe('applied')
    expect(ports.send).not.toHaveBeenCalled()
    const after = readFlow('run-1')
    expect(after.state).toBe('escalated')
    expect(after.pending).toBeNull()
  })

  it('holds while the claim is younger than the TTL', () => {
    seed(makeState({
      pending: {
        op_id: 'op-1',
        kind: 'request_review',
        target: 'review',
        head: 'bbb222',
        spec_id: null,
        at: NOW - 1_000,
      },
    }))
    const ports = makePorts()

    const result = step(ports)

    expect(result.decision.reason).toBe('dispatch_pending')
    expect(result.status).toBe('skipped')
    expect(ports.send).not.toHaveBeenCalled()
    expect(readFlow('run-1').pending?.op_id).toBe('op-1')
  })

  it('never pastes the same fix twice when the submit could not be confirmed', () => {
    seed(makeState({ state: 'reviewing', claim: { head: 'aaa111', verdict: null, verdict_count: 1 } }))
    const ports = makePorts({
      peek: () => verdictCapture(2),
      send: vi.fn(() => ({ sent: false as const, reason: 'pane_changed' as const })),
    })

    const first = step(ports, { head: 'aaa111' })

    expect(first.decision.kind).toBe('dispatch_fix')
    expect(first.status).toBe('unconfirmed')
    // The status does not advance (the work may not have started) but the verdict is consumed.
    expect(first.state.state).toBe('reviewing')
    expect(first.state.rounds).toBe(0)
    expect(first.state.claim.verdict_count).toBe(2)
    expect(first.state.pending).toBeNull()
    expect(readFlow('run-1').claim.verdict_count).toBe(2)
    expect(readFlow('run-1').log.at(-1)?.event).toBe('dispatch_unconfirmed')

    // The next tick sees the same verdict on screen and decides nothing: no second paste.
    const second = step(ports, { head: 'aaa111' })
    expect(second.decision.kind).toBe('none')
    expect(second.decision.reason).toBe('awaiting_verdict')
    expect(ports.send).toHaveBeenCalledTimes(1)
  })

  it('escalates a review that timed out without sending anything', () => {
    seed(makeState({
      state: 'reviewing',
      review_started_at: NOW - 901_000,
      claim: { head: 'aaa111', verdict: null, verdict_count: 1 },
    }))
    const ports = makePorts({ peek: () => verdictCapture(1) })

    const result = step(ports, { head: 'aaa111' })

    expect(result.decision.reason).toBe('review_timeout')
    expect(result.status).toBe('applied')
    expect(ports.send).not.toHaveBeenCalled()
    expect(readFlow('run-1').state).toBe('escalated')
    expect(readFlow('run-1').log.at(-1)?.event).toBe('escalate')
  })

  it('escalates without sending anything when the round budget is spent', () => {
    seed(makeState({
      state: 'reviewing',
      rounds: 6,
      claim: { head: 'aaa111', verdict: null, verdict_count: 1 },
    }))
    const ports = makePorts({ peek: () => verdictCapture(2) })

    const result = step(ports, { head: 'aaa111' })

    expect(result.status).toBe('applied')
    expect(ports.send).not.toHaveBeenCalled()
    expect(readFlow('run-1').state).toBe('escalated')
  })

  it('writes nothing at all for a --dry-run tick', () => {
    seed()
    const ports = makePorts()

    const result = stepFlow('run-1', {
      ports, dryRun: true, head: 'bbb222', tree_clean: true, now: NOW, at: AT, run_present: true, agents_present: true,
    })

    expect(result.status).toBe('skipped')
    expect(result.decision.kind).toBe('request_review')
    expect(ports.send).not.toHaveBeenCalled()
    expect(readFlow('run-1').pending).toBeNull()
    expect(readFlow('run-1').state).toBe('idle')
    // A dry run does not even take the lock.
    expect(existsSync(join(root, '.runs.lock'))).toBe(false)
  })
})

describe('a full round', () => {
  it('goes review -> changes requested -> fix -> new head -> accept', () => {
    let state = makeState()

    state = applyDecisionToState(state, flowTick(state, {
      now: NOW, head: 'bbb222', tree_clean: true, dev_pane: 'idle', review_pane: 'idle',
      verdict: null, verdict_count: 0,
    }), AT)
    expect(state.state).toBe('reviewing')

    state = applyDecisionToState(state, flowTick(state, {
      now: NOW, head: 'bbb222', tree_clean: true, dev_pane: 'idle', review_pane: 'idle',
      verdict: 'CHANGES_REQUESTED', verdict_count: 2, verdict_notes: 'MAJOR: x',
    }), AT)
    expect(state.state).toBe('fixing')
    expect(state.rounds).toBe(1)

    state = applyDecisionToState(state, flowTick(state, {
      now: NOW, head: 'ccc333', tree_clean: true, dev_pane: 'idle', review_pane: 'idle',
      verdict: 'CHANGES_REQUESTED', verdict_count: 2,
    }), AT)
    expect(state.state).toBe('reviewing')
    expect(state.claim.head).toBe('ccc333')

    const decision = flowTick(state, {
      now: NOW, head: 'ccc333', tree_clean: true, dev_pane: 'idle', review_pane: 'idle',
      verdict: 'ACCEPT', verdict_count: 3,
    })
    expect(decision.reason).toBe('flow_done')
    expect(saveFlow(applyDecisionToState(state, decision, AT))).toBeTruthy()
  })
})
