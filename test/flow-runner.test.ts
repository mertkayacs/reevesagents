import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { FlowObservations, FlowState } from '../src/core/flow.js'
import { applyDecisionToState, createFlowState, flowTick } from '../src/core/flow.js'
import { readFlow, saveFlow } from '../src/core/flow-store.js'
import type { FlowPorts } from '../src/core/flow-runner.js'
import { applyDecision, observeFlow } from '../src/core/flow-runner.js'

// The effect layer: observation reads, and the one guarded write path. Nothing here sends into a
// pane the gate did not confirm, and an ambiguous paste is never repeated.

const AT = '2026-01-01T00:00:00.000Z'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'reeves-flow-runner-'))
})

afterEach(() => {
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
  return { ...base, ...overrides }
}

function makeObservations(overrides: Partial<FlowObservations> = {}): FlowObservations {
  return {
    head: 'aaa111',
    tree_clean: true,
    dev_pane: 'idle',
    review_pane: 'idle',
    verdict: null,
    verdict_count: 0,
    ...overrides,
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

describe('observeFlow', () => {
  it('reads the reviewer pane and reports the verdict count with its notes', () => {
    const ports = makePorts({
      peek: () => 'did the reading\nVERDICT: CHANGES_REQUESTED\nMAJOR: null is treated as absent\n> ',
    })
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

describe('applyDecision', () => {
  it('sends nothing and writes nothing when the pane is busy or unknown', () => {
    for (const pane of ['busy', 'unknown'] as const) {
      const state = makeState()
      const decision = flowTick(state, makeObservations({ head: 'bbb222', review_pane: pane }))
      const ports = makePorts()

      const result = applyDecision(state, decision, { root, ports, now: AT })

      expect(result.status).toBe('skipped')
      expect(ports.send).not.toHaveBeenCalled()
      expect(existsSync(join(root, 'flows'))).toBe(false)
    }
  })

  it('returns unconfirmed and leaves the state untouched when the send is refused', () => {
    const state = makeState()
    const decision = flowTick(state, makeObservations({ head: 'bbb222' }))
    const ports = makePorts({ send: vi.fn(() => ({ sent: false as const, reason: 'unknown' as const })) })

    const result = applyDecision(state, decision, { root, ports, now: AT })

    expect(ports.send).toHaveBeenCalledTimes(1)
    expect(result.status).toBe('unconfirmed')
    expect(result.state).toEqual(state)
    expect(existsSync(join(root, 'flows', 'run-1.json'))).toBe(false)
  })

  it('writes the transition only after a confirmed send', () => {
    const state = makeState()
    const decision = flowTick(state, makeObservations({ head: 'bbb222', verdict_count: 1 }))
    const ports = makePorts()

    const result = applyDecision(state, decision, { root, ports, now: AT })

    expect(result.status).toBe('applied')
    expect(result.path).toBe(join(root, 'flows', 'run-1.json'))
    expect(readFlow('run-1', { root }).state).toBe('reviewing')
    expect(readFlow('run-1', { root }).claim).toEqual({ head: 'bbb222', verdict: null, verdict_count: 1 })
    expect(ports.send).toHaveBeenCalledWith('rev-1', expect.stringContaining('bbb222'))
  })

  it('never pastes the same fix twice when the submit could not be confirmed', () => {
    const state = makeState({ state: 'reviewing', claim: { head: 'aaa111', verdict: null, verdict_count: 1 } })
    const observations = makeObservations({ verdict: 'CHANGES_REQUESTED', verdict_count: 2, verdict_notes: 'MAJOR: x' })
    const decision = flowTick(state, observations)
    expect(decision.kind).toBe('dispatch_fix')

    const ports = makePorts({ send: vi.fn(() => ({ sent: false as const, reason: 'pane_changed' as const })) })
    const first = applyDecision(state, decision, { root, ports, now: AT })

    expect(first.status).toBe('unconfirmed')
    // The status does not advance (the work may not have started) but the verdict is consumed.
    expect(first.state.state).toBe('reviewing')
    expect(first.state.rounds).toBe(0)
    expect(first.state.claim.verdict_count).toBe(2)
    expect(first.state.log.at(-1)?.event).toBe('dispatch_unconfirmed')
    expect(readFlow('run-1', { root }).claim.verdict_count).toBe(2)

    // The next tick sees the same verdict on screen and decides nothing: no second paste.
    const second = flowTick(first.state, observations)
    expect(second.kind).toBe('none')
    expect(second.reason).toBe('awaiting_verdict')
    expect(ports.send).toHaveBeenCalledTimes(1)
  })

  it('escalates without sending anything', () => {
    const state = makeState({
      state: 'reviewing',
      rounds: 6,
      claim: { head: 'aaa111', verdict: null, verdict_count: 1 },
    })
    const decision = flowTick(state, makeObservations({ verdict: 'CHANGES_REQUESTED', verdict_count: 2 }))
    const ports = makePorts()

    const result = applyDecision(state, decision, { root, ports, now: AT })

    expect(result.status).toBe('applied')
    expect(ports.send).not.toHaveBeenCalled()
    expect(readFlow('run-1', { root }).state).toBe('escalated')
  })
})

describe('a full round', () => {
  it('goes review -> changes requested -> fix -> new head -> accept', () => {
    let state = makeState()

    state = applyDecisionToState(state, flowTick(state, makeObservations({ head: 'bbb222', verdict_count: 1 })), AT)
    expect(state.state).toBe('reviewing')

    state = applyDecisionToState(
      state,
      flowTick(state, makeObservations({ head: 'bbb222', verdict: 'CHANGES_REQUESTED', verdict_count: 2, verdict_notes: 'MAJOR: x' })),
      AT,
    )
    expect(state.state).toBe('fixing')
    expect(state.rounds).toBe(1)

    state = applyDecisionToState(state, flowTick(state, makeObservations({ head: 'ccc333', verdict_count: 2 })), AT)
    expect(state.state).toBe('reviewing')
    expect(state.claim.head).toBe('ccc333')

    const decision = flowTick(state, makeObservations({ head: 'ccc333', verdict: 'ACCEPT', verdict_count: 3 }))
    expect(decision.reason).toBe('flow_done')
    expect(saveFlow(applyDecisionToState(state, decision, AT), { root })).toBeTruthy()
  })
})
