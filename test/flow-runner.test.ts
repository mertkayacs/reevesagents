import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { FlowState } from '../src/core/flow.js'
import { PENDING_TTL_SEC, applyDecisionToState, createFlowState, flowTick } from '../src/core/flow.js'
import { readFlow, saveFlow } from '../src/core/flow-store.js'
import { durablePath, panePath, publishNotes, stagingPath } from '../src/core/flow-notes.js'
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
    ports, head: 'bbb222', tree_clean: true, now: NOW, at: AT, run_present: true, agents_present: true,
    // A normal review: one minute behind it and a finding on record, so the evidence rule passes. The
    // tests about the rule itself override this.
    verdict_evidence: { elapsed_ms: 60_000, notes_bytes: 240, notes_findings: 1, pane_tool_lines: 4 },
    ...overrides,
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
    expect(after.claim).toEqual({ head: 'bbb222', verdict: null, verdict_count: 0, verdict_applied: false })
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
    seed(makeState({ state: 'reviewing', claim: { head: 'aaa111', verdict: null, verdict_count: 1, verdict_applied: false } }))
    const ports = makePorts({
      peek: () => verdictCapture(2),
      // `unconfirmed`: the Enter went in and nothing confirmed it. `pane_changed` is the pre-Enter refusal, where
      // nothing was submitted and the round does not exist — a different test covers that one.
      send: vi.fn(() => ({ sent: false as const, reason: 'unconfirmed' as const })),
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
      claim: { head: 'aaa111', verdict: null, verdict_count: 1, verdict_applied: false },
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
      claim: { head: 'aaa111', verdict: null, verdict_count: 1, verdict_applied: false },
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

// A substantiated review: a minute of work and a recorded finding.
const EVIDENCE = { elapsed_ms: 60_000, notes_bytes: 240, notes_findings: 1, pane_tool_lines: 4 }

describe('a full round', () => {
  it('goes review -> changes requested -> fix -> new head -> accept', () => {
    let state = makeState()

    state = applyDecisionToState(state, flowTick(state, {
      now: NOW, head: 'bbb222', tree_clean: true, dev_pane: 'idle', review_pane: 'idle',
      verdict: null, verdict_count: 0, verdict_evidence: EVIDENCE,
    }), AT)
    expect(state.state).toBe('reviewing')

    state = applyDecisionToState(state, flowTick(state, {
      now: NOW, head: 'bbb222', tree_clean: true, dev_pane: 'idle', review_pane: 'idle',
      verdict: 'CHANGES_REQUESTED', verdict_count: 2, verdict_notes: 'MAJOR: x', verdict_evidence: EVIDENCE,
    }), AT)
    expect(state.state).toBe('fixing')
    expect(state.rounds).toBe(1)

    state = applyDecisionToState(state, flowTick(state, {
      now: NOW, head: 'ccc333', tree_clean: true, dev_pane: 'idle', review_pane: 'idle',
      verdict: 'CHANGES_REQUESTED', verdict_count: 2, verdict_evidence: EVIDENCE,
    }), AT)
    expect(state.state).toBe('reviewing')
    expect(state.claim.head).toBe('ccc333')

    const decision = flowTick(state, {
      now: NOW, head: 'ccc333', tree_clean: true, dev_pane: 'idle', review_pane: 'idle',
      verdict: 'ACCEPT', verdict_count: 3, verdict_evidence: EVIDENCE,
    })
    expect(decision.reason).toBe('flow_done')
    expect(saveFlow(applyDecisionToState(state, decision, AT))).toBeTruthy()
  })
})

// A real commit id: the notes path is derived from it, and a six-character fixture (`aaa111`) is not a
// commit id, so those states deliberately have no notes channel.
const NOTES_HEAD = 'abc1234'

function reviewingState(overrides: Partial<FlowState> = {}): FlowState {
  return makeState({
    state: 'reviewing',
    review_started_at: NOW,
    claim: { head: NOTES_HEAD, verdict: null, verdict_count: 0, verdict_applied: false },
    ...overrides,
  })
}

function publishNotesForTest(runId: string, head: string, round: number): void {
  publishNotes(runId, head, round, 'MAJOR old.ts:1 — stale\nВЕРДИКТ: CHANGES_REQUESTED\n', { root })
  const when = new Date(Date.now() - 60_000)
  utimesSync(durablePath(runId, head, round, root), when, when)
}

function writeStaging(runId: string, head: string, round: number, text: string): string {
  const path = stagingPath(runId, head, round, root)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, text, 'utf-8')
  return path
}

describe('the notes channel in the runner', () => {
  const findings = 'MAJOR src/core/flow.ts:120 — the claim is not re-read\nMINOR docs/x.md:4 — wording'
  const fileText = `# round 1\n\n${findings}\n\nВЕРДИКТ: CHANGES_REQUESTED\n`

  it('answers the round from the notes file even when the pane shows nothing', () => {
    seed(reviewingState())
    writeStaging('run-1', NOTES_HEAD, 1, fileText)
    const ports = makePorts()   // peek() returns '' — no verdict in the pane at all

    const result = step(ports, { head: NOTES_HEAD })

    expect(result.decision.kind).toBe('dispatch_fix')
    expect(result.status).toBe('applied')
    // The prompt carries the findings, and the journal carries the reference, not the text.
    expect(result.decision.message).toContain('MAJOR src/core/flow.ts:120')
    const after = readFlow('run-1')
    const entry = after.log.at(-1)!
    expect(entry.event).toBe('dispatch_fix')
    expect(entry.notes_ref).toBe(`notes/${NOTES_HEAD}-r1.md`)
    expect(entry.notes_counts).toEqual({ blocker: 0, major: 1, minor: 1 })
    expect(JSON.stringify(after)).not.toContain('the claim is not re-read')
    // The durable record and the capture exist; the staging file is gone.
    expect(existsSync(durablePath('run-1', NOTES_HEAD, 1, root))).toBe(true)
    expect(existsSync(panePath('run-1', NOTES_HEAD, 1, root))).toBe(true)
    expect(existsSync(stagingPath('run-1', NOTES_HEAD, 1, root))).toBe(false)
  })

  it('names the staging file in the review prompt, on the tick that requests the review', () => {
    // The request is created from `idle`, not from `reviewing`, so the path has to be resolved for
    // every tick — a prompt that names nothing is a prompt no reviewer can follow.
    seed(makeState({ state: 'idle', claim: { head: 'aaa1111', verdict: null, verdict_count: 0, verdict_applied: false } }))

    const result = step(makePorts(), { head: NOTES_HEAD })

    expect(result.decision.kind).toBe('request_review')
    expect(result.decision.message).toContain(stagingPath('run-1', NOTES_HEAD, 1, root))
    // The prompt asks for the English token (`VERDICT`) by decision; the parsers still accept both spellings, which
    // `verdict.test.ts` and the notes tests cover.
    expect(result.decision.message).toContain('VERDICT: ACCEPT')
  })

  it('acts on the notes file even when the reviewer pane cannot be classified', () => {
    // The file is an independent channel: an unparsable pane is exactly the case it exists for. The
    // dispatch still requires an idle dev pane, which the ports below report.
    seed(reviewingState())
    writeStaging('run-1', NOTES_HEAD, 1, fileText)
    const ports = makePorts({ paneBusy: id => (id === 'rev-1' ? 'unknown' : 'idle') })

    const result = step(ports, { head: NOTES_HEAD })

    expect(result.decision.kind).toBe('dispatch_fix')
    expect(result.decision.reason).toBe('fix_dispatched')
    expect(ports.send).toHaveBeenCalledTimes(1)
  })

  it('keeps the round open on a held tick and records it only when the answer is accepted', () => {
    // The record is the outcome of an accepted round, not a cache written before the decision: publishing
    // early deleted the staging file of a round that was still open, and a reviewer's second answer had
    // nowhere to go.
    seed(reviewingState())
    writeStaging('run-1', NOTES_HEAD, 1, fileText)
    const busy = makePorts({ paneBusy: id => (id === 'dev-1' ? 'busy' : 'idle') })

    const held = step(busy, { head: NOTES_HEAD })
    expect(held.decision.reason).toBe('dev_busy')
    expect(held.status).toBe('skipped')
    // Nothing recorded yet, and the reviewer's file is still there for the next tick.
    expect(existsSync(durablePath('run-1', NOTES_HEAD, 1, root))).toBe(false)

    const idle = makePorts()
    const applied = step(idle, { head: NOTES_HEAD })
    expect(applied.decision.kind).toBe('dispatch_fix')
    expect(applied.decision.message).toContain('MAJOR src/core/flow.ts:120')
    expect(idle.send).toHaveBeenCalledTimes(1)
    // Accepted: the record is published and the staging copy is gone.
    expect(existsSync(durablePath('run-1', NOTES_HEAD, 1, root))).toBe(true)
    expect(existsSync(stagingPath('run-1', NOTES_HEAD, 1, root))).toBe(false)
  })

  it('lets a reviewer replace a rejected answer with a substantiated one', () => {
    // First answer: valid shape, no findings, one second old — rejected, and *not* recorded. The
    // re-request reuses the same (head, round), so the second staging file lands on the same path and
    // must be able to become the record. This is the case the pre-decision publish broke.
    // The first answer is a bare ACCEPT typed into the pane one second in: no file, nothing recorded. That is the stamp
    // the evidence rule exists for, and it is rejected (D8: the *file* is the record, the pane is not).
    seed(makeState({
      state: 'reviewing',
      review_started_at: NOW,
      claim: { head: NOTES_HEAD, verdict: null, verdict_count: 0, verdict_applied: false },
    }))
    const fast = step(makePorts({ peek: () => verdictCapture(1) }), {
      head: NOTES_HEAD,
      verdict_evidence: { elapsed_ms: 1_000, notes_bytes: 0, notes_findings: 0, pane_tool_lines: 0 },
    })
    expect(fast.decision.reason).toBe('review_unsubstantiated')
    expect(existsSync(durablePath('run-1', NOTES_HEAD, 1, root))).toBe(false)

    // The reviewer answers again, this time with a finding, and the review is two minutes old.
    seed(makeState({
      state: 'reviewing',
      review_started_at: NOW - 120_000,
      unsubstantiated_attempts: 1,
      claim: { head: NOTES_HEAD, verdict: null, verdict_count: 0, verdict_applied: false },
    }))
    writeStaging('run-1', NOTES_HEAD, 1, fileText)
    const second = step(makePorts(), { head: NOTES_HEAD })

    expect(second.decision.kind).toBe('dispatch_fix')
    const durable = readFileSync(durablePath('run-1', NOTES_HEAD, 1, root), 'utf-8')
    expect(durable).toContain('MAJOR src/core/flow.ts:120')
    expect(durable).toContain('ВЕРДИКТ: CHANGES_REQUESTED')
  })

  it('falls back to the pane when the notes file is unusable, and says why in the journal', () => {
    seed(reviewingState())
    writeStaging('run-1', NOTES_HEAD, 1, 'MAJOR x.ts:1 — no verdict line here\n')
    const ports = makePorts({ peek: () => verdictCapture(1) })

    const result = step(ports, { head: NOTES_HEAD })

    expect(result.decision.kind).toBe('dispatch_fix')
    const entry = readFlow('run-1').log.at(-1)!
    expect(entry.detail).toContain('notes_invalid')
    expect(entry.detail).toContain('no verdict line at the end')
    // The staging file is kept for a retry, and no durable record was published from it.
    expect(existsSync(stagingPath('run-1', NOTES_HEAD, 1, root))).toBe(true)
    expect(existsSync(durablePath('run-1', NOTES_HEAD, 1, root))).toBe(false)
  })

  it('keeps the two rounds of one head apart', () => {
    seed(reviewingState())
    writeStaging('run-1', NOTES_HEAD, 1, fileText)
    step(makePorts(), { head: NOTES_HEAD })
    // The fix was dispatched: the flow is now in round 1 and waits for a new head.
    expect(readFlow('run-1').state).toBe('fixing')

    const round2 = `MAJOR other.ts:9 — still wrong\nВЕРДИКТ: CHANGES_REQUESTED\n`
    writeStaging('run-1', NOTES_HEAD, 2, round2)
    seed(reviewingState({ rounds: 1, claim: { head: NOTES_HEAD, verdict: 'CHANGES_REQUESTED', verdict_count: 1, verdict_applied: false } }))
    const second = step(makePorts(), { head: NOTES_HEAD })

    expect(second.decision.kind).toBe('dispatch_fix')
    expect(existsSync(durablePath('run-1', NOTES_HEAD, 1, root))).toBe(true)
    expect(existsSync(durablePath('run-1', NOTES_HEAD, 2, root))).toBe(true)
    expect(readFlow('run-1').log.at(-1)!.notes_ref).toBe(`notes/${NOTES_HEAD}-r2.md`)
  })

  it('prunes the closed flow\'s notes down to the newest round', () => {
    // An ACCEPT with no queued block closes the flow; the tick that closes it also trims the history.
    seed(reviewingState())
    writeStaging('run-1', NOTES_HEAD, 1, 'ВЕРДИКТ: ACCEPT\n')
    // An older head (a previous round of the same flow), to be pruned: pruneClosedFlowNotes keeps the
    // newest head's newest round only.
    publishNotesForTest('run-1', 'def5678', 1)
    const result = step(makePorts({ peek: () => verdictCapture(1) }), { head: NOTES_HEAD })

    expect(result.state.state).toBe('done')
    expect(existsSync(durablePath('run-1', NOTES_HEAD, 1, root))).toBe(true)
    expect(existsSync(durablePath('run-1', 'def5678', 1, root))).toBe(false)
  })
})

describe('verdict evidence', () => {
  const FAST_REVIEW = { elapsed_ms: 1_500, notes_bytes: 0, notes_findings: 0, pane_tool_lines: 0 }
  const MINUTE = { elapsed_ms: 60_000, notes_bytes: 240, notes_findings: 1, pane_tool_lines: 4 }

  function reviewingWithEvidence(evidence: typeof FAST_REVIEW): void {
    seed(makeState({
      state: 'reviewing',
      review_started_at: NOW,
      claim: { head: 'aaa111', verdict: null, verdict_count: 0, verdict_applied: false },
    }))
    void evidence
  }

  it('does not apply a verdict that arrives in a second with nothing recorded, and asks again once', () => {
    reviewingWithEvidence(FAST_REVIEW)
    const ports = makePorts({ peek: () => verdictCapture(1) })

    const result = step(ports, { head: 'aaa111', verdict_evidence: FAST_REVIEW, evidence_policy: { min_seconds: 30, retries: 1 } })

    // The answer was rejected: a new review request went out, nothing was dispatched to the dev.
    expect(result.decision.kind).toBe('request_review')
    expect(result.decision.reason).toBe('review_unsubstantiated')
    expect(result.decision.message).toContain('rejected')
    expect(result.status).toBe('applied')
    const after = readFlow('run-1')
    expect(after.state).toBe('reviewing')
    expect(after.unsubstantiated_attempts).toBe(1)
    expect(after.claim.head).toBe('aaa111')
    // The journal carries the numbers a human needs.
    expect(after.log.at(-1)!.detail).toContain('elapsed=2s notes=0/0b tool=0')
  })

  it('counts the findings a pane answer named, not only the ones in a file', () => {
    // The reviewer answered in the pane with three real MAJOR lines: that is evidence of a review, and
    // counting only the notes file used to reject it and send the round to the retry/escalation path.
    seed(makeState({ state: 'reviewing', review_started_at: NOW - 90_000, claim: { head: 'aaa111', verdict: null, verdict_count: 0, verdict_applied: false } }))
    const pane = [
      'VERDICT: CHANGES_REQUESTED',
      'MAJOR src/core/flow.ts:120 — the claim is not re-read',
      'MINOR docs/GUIDE.md:80 — wording',
    ].join('\n')
    const ports = makePorts({ peek: () => pane })

    // The evidence is measured by the runner here, not injected: that measurement is the thing under test.
    const result = step(ports, { head: 'aaa111', verdict_evidence: undefined })

    expect(result.decision.kind).toBe('dispatch_fix')
  })

  it('escalates when the reviewer keeps stamping', () => {
    seed(makeState({
      state: 'reviewing',
      review_started_at: NOW,
      unsubstantiated_attempts: 1,
      claim: { head: 'aaa111', verdict: null, verdict_count: 0, verdict_applied: false },
    }))
    const ports = makePorts({ peek: () => verdictCapture(1) })

    const result = step(ports, { head: 'aaa111', verdict_evidence: FAST_REVIEW, evidence_policy: { min_seconds: 30, retries: 1 } })

    expect(result.decision.reason).toBe('review_unsubstantiated')
    expect(result.state.state).toBe('escalated')
    expect(result.state.log.at(-1)!.detail).toContain('the reviewer is not reviewing')
    expect(ports.send).not.toHaveBeenCalled()
  })

  it('accepts a normal review: a minute of work with a finding on record', () => {
    reviewingWithEvidence(MINUTE)
    const ports = makePorts({ peek: () => verdictCapture(1) })

    const result = step(ports, { head: 'aaa111', verdict_evidence: MINUTE, evidence_policy: { min_seconds: 30, retries: 1 } })

    expect(result.decision.kind).toBe('dispatch_fix')
    expect(result.status).toBe('applied')
    expect(result.state.rounds).toBe(1)
  })

  it('lets review_min_seconds = 0 disable only the time half', () => {
    reviewingWithEvidence(FAST_REVIEW)
    const ports = makePorts({ peek: () => verdictCapture(1) })
    const policy = { min_seconds: 0, retries: 1 }

    // Instant but with a finding: accepted.
    const fast = step(ports, {
      head: 'aaa111',
      verdict_evidence: { ...FAST_REVIEW, notes_findings: 1, notes_bytes: 120 },
      evidence_policy: policy,
    })
    expect(fast.decision.kind).toBe('dispatch_fix')

    // Instant and empty: still rejected, because the notes half is not optional.
    seed(makeState({ state: 'reviewing', review_started_at: NOW, claim: { head: 'aaa111', verdict: null, verdict_count: 0, verdict_applied: false } }))
    const empty = step(ports, { head: 'aaa111', verdict_evidence: FAST_REVIEW, evidence_policy: policy })
    expect(empty.decision.reason).toBe('review_unsubstantiated')
  })

  it('accepts an ACCEPT that says explicitly it found nothing, but only from a file', () => {
    // File answered: explicit "no findings" is evidence.
    // The review started a minute ago: the time half of the rule only asks that the reviewer had the time.
    seed(makeState({
      state: 'reviewing',
      review_started_at: NOW - 60_000,
      claim: { head: NOTES_HEAD, verdict: null, verdict_count: 0, verdict_applied: false },
    }))
    writeStaging('run-1', NOTES_HEAD, 1, 'No findings: the diff is a docstring change.\n\nВЕРДИКТ: ACCEPT\n')
    // The evidence is *not* injected here: the runner derives it from the file, which is the point of the
    // rule — the explicit "no findings" line is what makes an empty review admissible.
    const fromFile = step(makePorts(), { head: NOTES_HEAD, verdict_evidence: undefined })
    expect(fromFile.decision.kind).toBe('none')
    expect(fromFile.state.state).toBe('done')

    // Pane answered: the same words in a pane are not evidence.
    seed(makeState({ state: 'reviewing', review_started_at: NOW, claim: { head: 'aaa111', verdict: null, verdict_count: 0, verdict_applied: false } }))
    const fromPane = step(makePorts({ peek: () => 'No findings: docstring only\nVERDICT: ACCEPT\n' }), {
      head: 'aaa111',
      verdict_evidence: { ...MINUTE, notes_findings: 0, notes_bytes: 0 },
    })
    expect(fromPane.decision.reason).toBe('review_unsubstantiated')
  })

  it('escalates instead of pasting when the composer holds somebody else\'s text', () => {
    seed(makeState({ state: 'reviewing', review_started_at: NOW, claim: { head: 'aaa111', verdict: null, verdict_count: 0, verdict_applied: false } }))
    const ports = makePorts({
      peek: () => verdictCapture(1),
      send: vi.fn(() => ({ sent: false as const, reason: 'composer_dirty' as const })),
    })

    const result = step(ports, { head: 'aaa111', verdict_evidence: MINUTE })

    expect(result.state.state).toBe('escalated')
    expect(result.state.log.at(-1)!.detail).toContain('composer holds text that is not ours')
    // Nothing was pasted: the refusal happened before any write.
    expect(ports.send).toHaveBeenCalledTimes(1)
  })

  it('holds without consuming the round when the target is not ready', () => {
    seed(makeState({ state: 'reviewing', review_started_at: NOW, claim: { head: 'aaa111', verdict: null, verdict_count: 0, verdict_applied: false } }))
    const ports = makePorts({
      peek: () => verdictCapture(1),
      send: vi.fn(() => ({ sent: false as const, reason: 'target_not_ready' as const })),
    })

    const result = step(ports, { head: 'aaa111', verdict_evidence: MINUTE })

    expect(result.status).toBe('refused')
    expect(result.state.state).toBe('reviewing')
    expect(result.state.rounds).toBe(0)
    expect(result.state.pending).toBeNull()
    expect(result.state.log.at(-1)).toMatchObject({ event: 'dispatch_refused', detail: 'target_not_ready' })
  })
})

describe('an answer consumed once', () => {
  // A normal review: ninety seconds old, one finding, a verdict — the shape the evidence rule accepts.
  const ROUND_TEXT = `# round 1\n\nMAJOR src/core/flow.ts:120 — the claim is not re-read\n\nВЕРДИКТ: CHANGES_REQUESTED\n`
  const freshRound = (): FlowState => reviewingState({ review_started_at: NOW - 90_000 })
  it('does not rebuild the same dispatch after an unconfirmed one', () => {
    // `dispatch_unconfirmed` releases the claim but keeps the staging file, so without a record of the
    // consumed answer the next tick rebuilt the identical fix prompt and pasted it again — the duplicate
    // that a reviewer caught in the fleet.
    seed(freshRound())
    writeStaging('run-1', NOTES_HEAD, 1, ROUND_TEXT)
    const first = makePorts({ send: vi.fn(() => ({ sent: false as const, reason: 'unconfirmed' as const })) })

    const unconfirmed = step(first, { head: NOTES_HEAD })
    expect(unconfirmed.status).toBe('unconfirmed')
    expect(first.send).toHaveBeenCalledTimes(1)

    // The next tick sees the same file and must not paste it again — this is the behaviour, checked
    // before the bookkeeping that produces it.
    const second = makePorts()
    const held = step(second, { head: NOTES_HEAD })
    expect(second.send).not.toHaveBeenCalled()
    expect(held.decision.reason).toBe('awaiting_verdict')
    expect(readFlow('run-1').answered_round).toBe(`${NOTES_HEAD}-r1`)
  })

  it('sees the dev\'s new commit even when the round\'s answer is already consumed', () => {
    // After `dispatch_unconfirmed` the answer is recorded as consumed, so it is not fresh any more. The
    // head check must still run: the dev got the prompt, committed, and the flow has to notice that
    // instead of waiting in `awaiting_verdict` until the review timeout escalates it.
    seed(freshRound())
    writeStaging('run-1', NOTES_HEAD, 1, ROUND_TEXT)
    const unconfirmed = makePorts({ send: vi.fn(() => ({ sent: false as const, reason: 'unconfirmed' as const })) })
    expect(step(unconfirmed, { head: NOTES_HEAD }).status).toBe('unconfirmed')
    expect(readFlow('run-1').answered_round).toBe(`${NOTES_HEAD}-r1`)
    expect(readFlow('run-1').state).toBe('reviewing')

    // The dev committed: a new head, same (consumed) answer still on disk.
    const next = makePorts()
    const moved = step(next, { head: 'fff9999' })

    expect(moved.decision.reason).toBe('head_moved')
    expect(moved.decision.next_state).toBe('reviewing')
    expect(moved.state.claim.head).toBe('fff9999')
    // The only send is the new review request to the reviewer — not a second fix prompt to the dev.
    expect(moved.decision.target).toBe('review')
    expect(moved.decision.message).toContain('fff9999')
  })

  it('keeps the answer usable when the dispatch was refused, not unconfirmed', () => {
    // Nothing was pasted, so the round is still the reviewer's to answer: the next tick must dispatch.
    seed(freshRound())
    writeStaging('run-1', NOTES_HEAD, 1, ROUND_TEXT)
    const refused = makePorts({ send: vi.fn(() => ({ sent: false as const, reason: 'target_not_ready' as const })) })

    expect(step(refused, { head: NOTES_HEAD }).status).toBe('refused')

    const retry = makePorts()
    const applied = step(retry, { head: NOTES_HEAD })
    expect(applied.decision.kind).toBe('dispatch_fix')
    expect(retry.send).toHaveBeenCalledTimes(1)
    expect(readFlow('run-1').answered_round).toBe(`${NOTES_HEAD}-r1`)
  })
})
