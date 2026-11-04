import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { FlowState } from '../src/core/flow.js'
import { PENDING_TTL_SEC, applyDecisionToState, createFlowState, flowTick } from '../src/core/flow.js'
import { readFlow, saveFlow } from '../src/core/flow-store.js'
import { durablePath, panePath, publishNotes, stagingPath } from '../src/core/flow-notes.js'
import type { FlowPorts, FlowStepResult, NotesRead, StepFlowOptions } from '../src/core/flow-runner.js'
import { detectPaneBusy } from '../src/core/activity.js'
import { PANE_UNKNOWN_HOLD_MS, observeFlow, stepFlow } from '../src/core/flow-runner.js'
import { listRunApprovals } from '../src/core/approvals.js'
import { writeAgent, writeRun } from '../src/core/runs.js'
import { listFlowIncidents } from '../src/core/flow-incidents.js'
import { flowBadge } from '../src/core/flow-view.js'
import { flowBadgeView } from '../src/core/flow-label.js'
import { translate } from '../src/i18n/catalog.js'
import type { BlockSpec } from '../src/core/spec.js'
import { attachSpec, closeItemOnAccept, createPlan, moveItemByEngine, readPlan, savePlan } from '../src/core/plan.js'

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

function seedApprovalRun(): void {
  writeRun({
    id: 'run-1', name: 'run-1', status: 'running', tmux_session: 's', reeves_window_id: '@0', reeves_pane_id: '%0',
    root_agent_id: 'dev-1', working_dir: root, preset_name: null, started_at: AT, ended_at: null,
  })
  writeAgent({
    id: 'dev-1', run_id: 'run-1', nickname: 'orchestrator', provider: 'codex', model: '', role: 'root', working_dir: root,
    task: 'coordinate', task_status: 'working', task_note: '', tmux_session: 's', tmux_window_id: '@1', tmux_pane_id: '%1',
    rc_enabled: false, permissions: 'ask', inbox: [], last_seen: NOW, started_at: AT, ended_at: null,
  })
}

function blockSpec(id: string): BlockSpec {
  return { id, title: id, goal: 'g', requirements: ['r'], checks: ['c'], report: ['r'] }
}

function flowFile(): string {
  return join(root, 'flows', 'run-1.json')
}

// A file answer for the round, as the runner's own seam takes it. Since block 69 a CHANGES_REQUESTED read from the pane
// is not bound to a commit and is never applied, so a test that wants a fix dispatch describes the file the reviewer
// wrote — the channel the engine actually reads for a non-ACCEPT verdict.
function fileAnswer(verdict: 'ACCEPT' | 'CHANGES_REQUESTED', head: string): NotesRead {
  return {
    source: 'file',
    verdict,
    head,
    ref: `notes/${head}-r1.md`,
    text: 'MAJOR src/core/flow.ts:120 — the claim is not re-read',
    counts: { blocker: 0, major: 1, minor: 0 },
  }
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

describe('a flow that stands still says why (block 64)', () => {
  it('writes the hold on the first tick, keeps `updated_at` where the last move left it, and repeats silently', () => {
    // The live case: a block in the queue and a dirty tree. Until this the reason existed only in the ticker's stdout, so
    // `flow status` said `idle` and the operator had to run a `--dry-run` tick to learn why nothing happened.
    const seeded = seed(makeState({
      specs: [{ id: 'block_01', title: 'One', goal: 'g', requirements: ['r'], checks: ['c'], report: [], body: '' }],
    }))

    const first = step(makePorts(), { tree_clean: false })

    expect(first.decision.reason).toBe('tree_dirty')
    expect(first.status).toBe('skipped')
    const held = readFlow('run-1', { root })
    expect(held.hold).toEqual({ reason: 'tree_dirty', since: AT })
    // The hold is not a move: the badge and the `tick` line still read the stamp of the last real one.
    expect(held.updated_at).toBe(seeded.updated_at)
    expect(held.state).toBe(seeded.state)
    // One line, and it is the hold: the fixture was built by the factory (no `flow_started` line), so the journal went
    // from empty to exactly this.
    expect(held.log.map(entry => entry.event)).toEqual(['hold'])

    const afterFirst = readFileSync(flowFile(), 'utf-8')
    const second = step(makePorts(), { tree_clean: false })

    expect(second.status).toBe('skipped')
    expect(readFileSync(flowFile(), 'utf-8')).toBe(afterFirst)
    expect(readFlow('run-1', { root }).log).toHaveLength(held.log.length)
  })

  it('keeps the first stamp while the reason stands, and clears the hold when the flow moves', () => {
    seed(makeState({ hold: { reason: 'tree_dirty', since: '2025-12-31T00:00:00.000Z' } }))

    // The same reason on a later tick keeps `since`: it is when the flow started standing, not when it was last looked at.
    step(makePorts(), { tree_clean: false, now: NOW + 60_000, at: '2026-01-01T00:01:00.000Z' })
    expect(readFlow('run-1', { root }).hold).toEqual({ reason: 'tree_dirty', since: '2025-12-31T00:00:00.000Z' })

    // The tree is clean now, so the engine asks for the review: that is a move, and a moved flow is not holding.
    const moved = step(makePorts())

    expect(moved.decision.kind).toBe('request_review')
    const after = readFlow('run-1', { root })
    expect(after.hold).toBeNull()
    expect(after.state).toBe('reviewing')
  })

  it('journals one hold for a flow with nothing to do, not one per tick', () => {
    // `head_unchanged` is the commonest hold of all: a flow whose dev has not committed yet. Ten passes must leave one
    // line and one hold, not ten — the ticker runs every minute, and a journal of repeats is a journal nobody reads.
    const seeded = seed()
    const ports = makePorts()

    for (let pass = 0; pass < 10; pass += 1) {
      const result = step(ports, { head: seeded.claim.head, now: NOW + pass * 1000, at: `2026-01-01T00:00:0${pass % 10}.000Z` })
      expect(result.decision.reason).toBe('head_unchanged')
    }

    const after = readFlow('run-1', { root })
    expect(after.hold).toEqual({ reason: 'head_unchanged', since: AT })
    expect(after.log.filter(entry => entry.event === 'hold')).toHaveLength(1)
    expect(after.updated_at).toBe(seeded.updated_at)
  })

  it('journals detailed holds once, then records a changed reason as a new hold', () => {
    const seeded = seed(makeState({
      state: 'reviewing',
      review_started_at: NOW - 60_000,
      claim: { head: 'bbb222', verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null },
    }))
    const plan = {
      items: [{
        id: 'P1.2', title: 'Waiting item', status: 'needs_brief' as const, rounds: 0,
        spec: null, spec_path: null, head: null, notes_ref: null, missing: false,
      }],
      max_rounds_per_item: 3,
      max_total_rounds: 12,
    }

    const first = step(makePorts({ peek: () => verdictCapture(1, 'ACCEPT') }), { plan })
    expect(first.decision.reason).toBe('plan_incomplete')
    expect(first.status).toBe('applied')
    const held = readFlow('run-1', { root })
    expect(held.hold).toMatchObject({ reason: 'plan_incomplete' })
    expect(held.hold?.detail).toContain('needs a brief for P1.2')
    expect(held.log.filter(entry => entry.event === 'hold')).toHaveLength(1)
    expect(held.log.some(entry => entry.event === 'plan_incomplete' && entry.detail === held.hold?.detail)).toBe(true)
    const firstLog = readFileSync(flowFile(), 'utf-8')

    const repeated = step(makePorts({ peek: () => verdictCapture(1, 'ACCEPT') }), { plan })
    expect(repeated.status).toBe('skipped')
    expect(readFileSync(flowFile(), 'utf-8')).toBe(firstLog)

    const changed = step(makePorts(), { head: undefined })
    expect(changed.decision.reason).toBe('head_unknown')
    const afterChange = readFlow('run-1', { root })
    expect(afterChange.hold).toEqual({ reason: 'head_unknown', since: AT })
    expect(afterChange.log.filter(entry => entry.event === 'hold').map(entry => entry.detail)).toEqual([
      'plan_incomplete', 'head_unknown',
    ])
    expect(afterChange.log.filter(entry => entry.event === 'plan_incomplete')).toHaveLength(1)
    expect(afterChange.updated_at).toBe(seeded.updated_at)
  })
})

describe('stepFlow', () => {
  it('holds a second queued spec while the first dispatched spec is still in flight', () => {
    seed(makeState({
      state: 'idle',
      specs: [blockSpec('A'), blockSpec('B')],
      dispatched_specs: ['A'],
      claim: { ...makeState().claim, spec_id: 'A' },
      log: [{ at: AT, event: 'dispatch_spec', detail: 'spec_dispatched A' }],
    }))
    const ports = makePorts()

    const result = step(ports, { head: 'aaa111' })
    const badge = flowBadge(readFlow('run-1'), NOW)
    const view = flowBadgeView((key, values) => translate('en', key, values), badge)

    expect(result.decision.reason).toBe('spec_pending')
    expect(ports.send).not.toHaveBeenCalled()
    expect(badge.attention).toBeNull()
    expect(view.tone).toBe('progress')
  })

  it('dispatches the next queued spec after the current spec ACCEPT is applied', () => {
    const state = makeState({
      state: 'idle',
      specs: [blockSpec('A'), blockSpec('B')],
      dispatched_specs: ['A'],
      claim: { ...makeState().claim, spec_id: 'A', verdict: 'ACCEPT', verdict_count: 1 },
    })
    seed(state)
    const ports = makePorts()

    const result = step(ports, { head: 'aaa111' })

    expect(result.decision.kind).toBe('dispatch_spec')
    expect(result.decision.spec_id).toBe('B')
    expect(result.status).toBe('applied')
    expect(readFlow('run-1').dispatched_specs).toEqual(['A', 'B'])
  })

  it('keeps a failed queued spec queued and escalates after three dispatch attempts', () => {
    seed(makeState({ state: 'idle', specs: [blockSpec('B')] }))
    let result: FlowStepResult | undefined
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const ports = makePorts({ send: vi.fn(() => ({ sent: false as const, reason: 'unconfirmed' as const })) })
      result = step(ports, { head: 'aaa111', now: NOW + attempt * 1000, at: new Date(NOW + attempt * 1000).toISOString() })
      const after = readFlow('run-1')
      expect(after.dispatched_specs).not.toContain('B')
      expect(after.specs.map(spec => spec.id)).toContain('B')
    }
    const after = readFlow('run-1')
    expect(result?.state.state).toBe('escalated')
    expect(after.log.filter(entry => entry.event === 'spec_dispatch_retry')).toHaveLength(3)
    expect([...after.log].reverse().find(entry => entry.event === 'escalate')?.detail).toContain('spec_undelivered B')
  })

  it('sends nothing when a pane is busy or unknown, and records the hold once', () => {
    for (const pane of ['busy', 'unknown'] as const) {
      const seeded = seed()
      const before = readFileSync(flowFile(), 'utf-8')
      const ports = makePorts({ paneBusy: () => pane })

      const result = step(ports)

      expect(result.status).toBe('skipped')
      expect(result.send).toBeUndefined()
      expect(ports.send).not.toHaveBeenCalled()
      // The reason the dev was not dispatched lives in the state now, and `updated_at` still says when the flow last
      // moved. The second pass has nothing new to say: no write, no journal line (block 64).
      const held = readFlow('run-1')
      expect(held.hold).toMatchObject({ reason: pane === 'busy' ? 'dev_busy' : 'dev_pane_unknown' })
      expect(held.updated_at).toBe(seeded.updated_at)
      expect(held.state).toBe(seeded.state)
      const afterHold = readFileSync(flowFile(), 'utf-8')
      expect(afterHold).not.toBe(before)
      expect(step(ports).status).toBe('skipped')
      expect(readFileSync(flowFile(), 'utf-8')).toBe(afterHold)
      expect(readFlow('run-1').log.filter(entry => entry.event === 'hold')).toHaveLength(1)
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
    expect(after.claim).toEqual({ head: 'bbb222', verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null })
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

  it('settles a dead fix dispatch from a newer commit instead of escalating', () => {
    seed(makeState({
      state: 'fixing',
      pending: {
        op_id: 'op-fix', kind: 'dispatch_fix', target: 'dev', head: 'aaa111', spec_id: null,
        at: NOW - (PENDING_TTL_SEC + 1) * 1000,
      },
    }))
    const ports = makePorts()

    const result = step(ports, { head: 'ccc333', head_committed_at: NOW - 30_000 })

    expect(result.decision.log_event).toBe('settled_by_observation')
    expect(result.status).toBe('applied')
    expect(result.state.state).toBe('fixing')
    expect(result.state.rounds).toBe(1)
    expect(result.state.claim.head).toBe('ccc333')
    expect(result.state.log.some(entry => entry.event === 'settled_by_observation')).toBe(true)
    expect(ports.send).not.toHaveBeenCalled()
  })

  it('submits one Enter for a recorded prompt still in the reviewer composer', () => {
    seedApprovalRun()
    writeAgent({
      id: 'rev-1', run_id: 'run-1', nickname: 'reviewer', provider: 'codex', model: '', role: 'worker', working_dir: root,
      task: 'review', task_status: 'working', task_note: '', tmux_session: 's', tmux_window_id: '@2', tmux_pane_id: '%2',
      rc_enabled: false, permissions: 'ask', inbox: [], last_seen: NOW, started_at: AT, ended_at: null,
    })
    const pastedAt = NOW - 1_000
    seed(makeState({
      pending: {
        op_id: 'op-review', kind: 'request_review', target: 'review', head: 'bbb222', spec_id: null,
        at: NOW - (PENDING_TTL_SEC + 1) * 1000,
      },
      dispatch_paste: { agent: 'rev-1', head: 'bbb222', at: pastedAt },
    }))
    const frame = '› [Pasted Content 100 chars]\nGPT-6-Sol medium · ~/repo'
    const send = vi.fn((_agent: string, _text: string, _options?: { pasted?: { at: number } | null, stallRetry?: boolean }) => ({ sent: true as const }))
    const ports = makePorts({ peek: () => frame, send })

    const result = step(ports)

    expect(result.decision.log_event).toBe('dispatch_retry_enter')
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0]?.[2]?.pasted).toEqual({ at: pastedAt })
    expect(result.status).toBe('applied')
    expect(result.state.state).toBe('reviewing')
  })

  it('releases an expired claim without sending when the idle composer is empty', () => {
    seedApprovalRun()
    writeAgent({
      id: 'rev-1', run_id: 'run-1', nickname: 'reviewer', provider: 'codex', model: '', role: 'worker', working_dir: root,
      task: 'review', task_status: 'working', task_note: '', tmux_session: 's', tmux_window_id: '@2', tmux_pane_id: '%2',
      rc_enabled: false, permissions: 'ask', inbox: [], last_seen: NOW, started_at: AT, ended_at: null,
    })
    seed(makeState({
      pending: {
        op_id: 'op-review', kind: 'request_review', target: 'review', head: 'aaa111', spec_id: null,
        at: NOW - (PENDING_TTL_SEC + 1) * 1000,
      },
    }))
    const frame = '› Ask Codex to do anything\nGPT-6-Sol medium · ~/repo'
    const ports = makePorts({ peek: () => frame })

    const result = step(ports, { head: 'aaa111' })

    expect(result.decision.reason).toBe('dispatch_released_unlanded')
    expect(result.state.pending).toBeNull()
    expect(ports.send).not.toHaveBeenCalled()
  })

  it('repairs a headless checked reviewing row once and does not replay the consumed ACCEPT file', () => {
    const text = '- [ ] **T4.3.2** — stale task\n- [ ] **T4.3.3** — accepted task'
    let plan = createPlan({ run_id: 'run-1', source_path: 'docs/plan.md', text, now: NOW, at: AT }).plan
    const brief = (id: string) => JSON.stringify({ id, title: id, goal: 'g', requirements: ['r'], checks: ['c'], report: ['r'] })
    for (const id of ['T4.3.2', 'T4.3.3']) {
      plan = attachSpec(plan, {
        id, text: brief(id), format: 'json', spec_path: `docs/briefs/${id}.json`, now: NOW, at: AT,
      }).plan
    }
    plan = moveItemByEngine(plan, { id: 'T4.3.2', status: 'in_work', now: NOW })
    plan = moveItemByEngine(plan, { id: 'T4.3.2', status: 'reviewing', now: NOW })
    plan = moveItemByEngine(plan, { id: 'T4.3.3', status: 'in_work', now: NOW })
    plan = moveItemByEngine(plan, { id: 'T4.3.3', status: 'reviewing', now: NOW })
    plan = closeItemOnAccept(plan, { id: 'T4.3.3', head: 'bbb222', rounds: 1, notes_ref: null, now: NOW, at: AT })
    plan = {
      ...plan,
      conflicts: [...plan.conflicts, {
        kind: 'ticked_by_hand', item_id: 'T4.3.2', detail: 'document checkbox is checked', at: AT,
      }],
    }
    savePlan(plan)
    seed(makeState({
      state: 'reviewing', review_started_at: NOW, active_plan_item: 'T4.3.3',
      claim: { head: 'bbb222', verdict: null, verdict_count: 5, verdict_applied: true, spec_id: 'T4.3.3' },
    }))
    const ports = makePorts()

    const first = step(ports, { head: 'bbb222', notes: fileAnswer('ACCEPT', 'bbb222') })
    expect(first.decision.reason).toBe('plan_item_requeued')
    expect(readPlan('run-1')?.items.find(item => item.id === 'T4.3.2')).toMatchObject({ status: 'done', head: 'bbb222' })
    expect(readFlow('run-1').answered_round).toBe('notes/bbb222-r1.md')

    const second = step(ports, { head: 'bbb222', notes: fileAnswer('ACCEPT', 'bbb222') })
    const afterSecond = readFlow('run-1')
    expect(second.decision.reason).not.toBe('plan_in_flight')
    expect(afterSecond.log.filter(entry => entry.event === 'plan_item_stale_recovered')).toHaveLength(1)
    const third = step(ports, { head: 'bbb222', notes: fileAnswer('ACCEPT', 'bbb222') })
    expect(third.status).toBe('skipped')
    expect(readFlow('run-1').updated_at).toBe(afterSecond.updated_at)
    expect(readPlan('run-1')?.items.find(item => item.id === 'T4.3.3')?.status).toBe('done')
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
    seed(makeState({ state: 'reviewing', claim: { head: 'aaa111', verdict: null, verdict_count: 1, verdict_applied: false, spec_id: null } }))
    const ports = makePorts({
      peek: () => verdictCapture(2),
      // `unconfirmed`: the Enter went in and nothing confirmed it. `pane_changed` is the pre-Enter refusal, where
      // nothing was submitted and the round does not exist — a different test covers that one.
      send: vi.fn(() => ({ sent: false as const, reason: 'unconfirmed' as const })),
    })

    // The answer is the reviewer's file: a pane CHANGES_REQUESTED is not bound to a commit and is not applied (block 69).
    const first = step(ports, { head: 'aaa111', notes: fileAnswer('CHANGES_REQUESTED', 'aaa111') })

    expect(first.decision.kind).toBe('dispatch_fix')
    expect(first.status).toBe('unconfirmed')
    // The status does not advance (the work may not have started) but the verdict is consumed.
    expect(first.state.state).toBe('reviewing')
    expect(first.state.rounds).toBe(0)
    expect(first.state.claim.verdict_count).toBe(2)
    expect(first.state.pending).toBeNull()
    expect(readFlow('run-1').claim.verdict_count).toBe(2)
    expect(readFlow('run-1').log.some(entry => entry.event === 'dispatch_unconfirmed')).toBe(true)

    // The next tick sees the same verdict on screen and decides nothing: no second paste.
    const second = step(ports, { head: 'aaa111', notes: fileAnswer('CHANGES_REQUESTED', 'aaa111') })
    expect(second.decision.kind).toBe('none')
    expect(second.decision.reason).toBe('awaiting_verdict')
    expect(ports.send).toHaveBeenCalledTimes(1)
  })

  it('escalates a review that timed out without sending anything', () => {
    seedApprovalRun()
    seed(makeState({
      state: 'reviewing',
      review_started_at: NOW - 901_000,
      claim: { head: 'aaa111', verdict: null, verdict_count: 1, verdict_applied: false, spec_id: null },
    }))
    const ports = makePorts({ peek: () => verdictCapture(1) })

    const result = step(ports, { head: 'aaa111' })

    expect(result.decision.reason).toBe('review_timeout')
    expect(result.status).toBe('applied')
    expect(ports.send).not.toHaveBeenCalled()
    expect(readFlow('run-1').state).toBe('escalated')
    expect(readFlow('run-1').log.some(entry => entry.event === 'escalate')).toBe(true)
    expect(listRunApprovals('run-1')).toHaveLength(0)
    expect(listFlowIncidents('run-1', { root })).toMatchObject([{ kind: 'review_timeout', severity: 'blocker', owner: 'orchestrator' }])
  })

  it('does not raise a legacy human approval on a manual tick of a parked escalation', () => {
    seedApprovalRun()
    seed(makeState({
      state: 'escalated',
      log: [{ at: AT, event: 'escalate', detail: 'review_timeout' }],
    }))

    const result = step(makePorts())

    expect(result.decision.reason).toBe('flow_closed')
    expect(listRunApprovals('run-1')).toHaveLength(0)
    expect(listFlowIncidents('run-1', { root })).toMatchObject([
      { kind: 'review_timeout', severity: 'blocker', status: 'open', owner: 'orchestrator' },
    ])
  })

  it('escalates without sending anything when the round budget is spent', () => {
    seed(makeState({
      state: 'reviewing',
      rounds: 6,
      claim: { head: 'aaa111', verdict: null, verdict_count: 1, verdict_applied: false, spec_id: null },
    }))
    const ports = makePorts({ peek: () => verdictCapture(2) })

    const result = step(ports, { head: 'aaa111', notes: fileAnswer('CHANGES_REQUESTED', 'aaa111') })

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
      // A non-ACCEPT verdict acts only from the notes file the prompt asked for (block 69).
      verdict: 'CHANGES_REQUESTED', verdict_source: 'file', verdict_count: 2, verdict_notes: 'MAJOR: x', verdict_evidence: EVIDENCE,
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
    claim: { head: NOTES_HEAD, verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null },
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
    seed(makeState({ state: 'idle', claim: { head: 'aaa1111', verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null } }))

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
      claim: { head: NOTES_HEAD, verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null },
    }))
    const fast = step(makePorts({ peek: () => verdictCapture(1, 'ACCEPT') }), {
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
      claim: { head: NOTES_HEAD, verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null },
    }))
    writeStaging('run-1', NOTES_HEAD, 1, fileText)
    const second = step(makePorts(), { head: NOTES_HEAD })

    expect(second.decision.kind).toBe('dispatch_fix')
    const durable = readFileSync(durablePath('run-1', NOTES_HEAD, 1, root), 'utf-8')
    expect(durable).toContain('MAJOR src/core/flow.ts:120')
    expect(durable).toContain('ВЕРДИКТ: CHANGES_REQUESTED')
  })

  it('does not apply a pane answer when the notes file is unusable', () => {
    // The file is the channel a non-ACCEPT verdict has to come through (block 69): an unusable file plus a pane
    // CHANGES_REQUESTED is never a fix round — the pane verdict is not bound to this commit. The first tick asks once for a
    // rewrite (block 83), and the second holds.
    seed(reviewingState())
    writeStaging('run-1', NOTES_HEAD, 1, 'MAJOR x.ts:1 — no verdict line here\n')
    const ports = makePorts({ peek: () => verdictCapture(1) })

    const first = step(ports, { head: NOTES_HEAD })
    expect(first.decision.reason).toBe('review_notes_invalid')
    expect(first.decision.kind).toBe('request_review')

    const second = step(ports, { head: NOTES_HEAD, now: 60_000 })
    expect(second.decision.reason).toBe('awaiting_verdict')
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
    seed(reviewingState({ rounds: 1, claim: { head: NOTES_HEAD, verdict: 'CHANGES_REQUESTED', verdict_count: 1, verdict_applied: false, spec_id: null } }))
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
      claim: { head: 'aaa111', verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null },
    }))
    void evidence
  }

  it('does not apply a verdict that arrives in a second with nothing recorded, and asks again once', () => {
    reviewingWithEvidence(FAST_REVIEW)
    // The pane may answer ACCEPT and nothing else (block 69); a one-second stamp is still not evidence.
    const ports = makePorts({ peek: () => verdictCapture(1, 'ACCEPT') })

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
    // The reviewer answered in the pane with the finding lines: that is evidence of a review, and counting only the notes
    // file used to reject it and send the round to the retry/escalation path. The pane can only answer ACCEPT (block 69),
    // so that answer closes the flow instead of dispatching a fix.
    seed(makeState({ state: 'reviewing', review_started_at: NOW - 90_000, claim: { head: 'aaa111', verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null } }))
    const pane = [
      'VERDICT: ACCEPT',
      'MAJOR src/core/flow.ts:120 — the claim is not re-read',
      'MINOR docs/GUIDE.md:80 — wording',
    ].join('\n')
    const ports = makePorts({ peek: () => pane })

    // The evidence is measured by the runner here, not injected: that measurement is the thing under test.
    const result = step(ports, { head: 'aaa111', verdict_evidence: undefined })

    expect(result.decision.reason).toBe('flow_done')
  })

  it('escalates when the reviewer keeps stamping', () => {
    seed(makeState({
      state: 'reviewing',
      review_started_at: NOW,
      unsubstantiated_attempts: 1,
      claim: { head: 'aaa111', verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null },
    }))
    const ports = makePorts({ peek: () => verdictCapture(1, 'ACCEPT') })

    const result = step(ports, { head: 'aaa111', verdict_evidence: FAST_REVIEW, evidence_policy: { min_seconds: 30, retries: 1 } })

    expect(result.decision.reason).toBe('review_unsubstantiated')
    expect(result.state.state).toBe('escalated')
    expect([...result.state.log].reverse().find(entry => entry.event !== 'incident_opened' && entry.event !== 'incident_resolved')!.detail).toContain('the reviewer is not reviewing')
    expect(ports.send).not.toHaveBeenCalled()
  })

  it('accepts a normal review: a minute of work with a finding on record', () => {
    reviewingWithEvidence(MINUTE)
    const ports = makePorts({ peek: () => verdictCapture(1, 'ACCEPT') })

    const result = step(ports, { head: 'aaa111', verdict_evidence: MINUTE, evidence_policy: { min_seconds: 30, retries: 1 } })

    // A substantiated pane ACCEPT closes the flow (no plan, no queued block).
    expect(result.decision.reason).toBe('flow_done')
    expect(result.status).toBe('applied')
    expect(result.state.state).toBe('done')
  })

  it('lets review_min_seconds = 0 disable only the time half', () => {
    reviewingWithEvidence(FAST_REVIEW)
    const ports = makePorts({ peek: () => verdictCapture(1, 'ACCEPT') })
    const policy = { min_seconds: 0, retries: 1 }

    // Instant but with a finding: accepted (and a pane ACCEPT closes the flow).
    const fast = step(ports, {
      head: 'aaa111',
      verdict_evidence: { ...FAST_REVIEW, notes_findings: 1, notes_bytes: 120 },
      evidence_policy: policy,
    })
    expect(fast.decision.reason).toBe('flow_done')

    // Instant and empty: still rejected, because the notes half is not optional.
    seed(makeState({ state: 'reviewing', review_started_at: NOW, claim: { head: 'aaa111', verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null } }))
    const empty = step(ports, { head: 'aaa111', verdict_evidence: FAST_REVIEW, evidence_policy: policy })
    expect(empty.decision.reason).toBe('review_unsubstantiated')
  })

  it('accepts an ACCEPT that says explicitly it found nothing, but only from a file', () => {
    // File answered: explicit "no findings" is evidence.
    // The review started a minute ago: the time half of the rule only asks that the reviewer had the time.
    seed(makeState({
      state: 'reviewing',
      review_started_at: NOW - 60_000,
      claim: { head: NOTES_HEAD, verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null },
    }))
    writeStaging('run-1', NOTES_HEAD, 1, 'No findings: the diff is a docstring change.\n\nВЕРДИКТ: ACCEPT\n')
    // The evidence is *not* injected here: the runner derives it from the file, which is the point of the
    // rule — the explicit "no findings" line is what makes an empty review admissible.
    const fromFile = step(makePorts(), { head: NOTES_HEAD, verdict_evidence: undefined })
    expect(fromFile.decision.kind).toBe('none')
    expect(fromFile.state.state).toBe('done')

    // Pane answered: the same words in a pane are not evidence.
    seed(makeState({ state: 'reviewing', review_started_at: NOW, claim: { head: 'aaa111', verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null } }))
    const fromPane = step(makePorts({ peek: () => 'No findings: docstring only\nVERDICT: ACCEPT\n' }), {
      head: 'aaa111',
      verdict_evidence: { ...MINUTE, notes_findings: 0, notes_bytes: 0 },
    })
    expect(fromPane.decision.reason).toBe('review_unsubstantiated')
  })

  it('escalates instead of pasting when the composer holds somebody else\'s text', () => {
    seed(makeState({ state: 'reviewing', review_started_at: NOW, claim: { head: 'aaa111', verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null } }))
    const ports = makePorts({
      peek: () => '',
      send: vi.fn(() => ({ sent: false as const, reason: 'composer_dirty' as const })),
    })

    const result = step(ports, { head: 'aaa111', verdict_evidence: MINUTE, notes: fileAnswer('CHANGES_REQUESTED', 'aaa111') })

    expect(result.state.state).toBe('escalated')
    expect([...result.state.log].reverse().find(entry => entry.event !== 'incident_opened' && entry.event !== 'incident_resolved')!.detail).toContain('composer holds text that is not ours')
    // Nothing was pasted: the refusal happened before any write.
    expect(ports.send).toHaveBeenCalledTimes(1)
  })

  it('holds without consuming the round when the target is not ready', () => {
    seed(makeState({ state: 'reviewing', review_started_at: NOW, claim: { head: 'aaa111', verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null } }))
    const ports = makePorts({
      peek: () => '',
      send: vi.fn(() => ({ sent: false as const, reason: 'target_not_ready' as const })),
    })

    const result = step(ports, { head: 'aaa111', verdict_evidence: MINUTE, notes: fileAnswer('CHANGES_REQUESTED', 'aaa111') })

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
    expect(readFlow('run-1').answered_round).toBe(`notes/${NOTES_HEAD}-r1.md`)
  })

  it('sees the dev\'s new commit even when the round\'s answer is already consumed', () => {
    // After `dispatch_unconfirmed` the answer is recorded as consumed, so it is not fresh any more. The
    // head check must still run: the dev got the prompt, committed, and the flow has to notice that
    // instead of waiting in `awaiting_verdict` until the review timeout escalates it.
    seed(freshRound())
    writeStaging('run-1', NOTES_HEAD, 1, ROUND_TEXT)
    const unconfirmed = makePorts({ send: vi.fn(() => ({ sent: false as const, reason: 'unconfirmed' as const })) })
    expect(step(unconfirmed, { head: NOTES_HEAD }).status).toBe('unconfirmed')
    expect(readFlow('run-1').answered_round).toBe(`notes/${NOTES_HEAD}-r1.md`)
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
    expect(readFlow('run-1').answered_round).toBe(`notes/${NOTES_HEAD}-r1.md`)
  })
})

describe('a dispatch nobody confirmed (block 69)', () => {
  // The live incident: the prompt landed in the codex composer, the Enter never started a turn, and the round was spent
  // anyway — so the flow sat in `awaiting_verdict` until the timeout while the prompt waited for a human's Enter.
  const fixingState = (): FlowState => makeState({
    state: 'fixing',
    claim: { head: 'aaa111', verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null },
  })

  it('spends no round, and the next tick sends the same prompt again', () => {
    seed(fixingState())
    const first = makePorts({ send: vi.fn(() => ({ sent: false as const, reason: 'unconfirmed_paste' as const })) })

    const stuck = step(first, { head: 'bbb222' })

    expect(stuck.decision.kind).toBe('request_review')
    expect(stuck.status).toBe('refused')
    const after = readFlow('run-1')
    // Nothing advanced: not the state, not the round, not the review clock, not the verdict counter.
    expect(after.state).toBe('fixing')
    expect(after.rounds).toBe(0)
    expect(after.review_started_at).toBeNull()
    expect(after.claim.verdict_count).toBe(0)
    expect(after.pending).toBeNull()
    expect(after.enter_retries).toBe(1)
    expect([...after.log].reverse().find(entry => entry.event === 'dispatch_retry_enter')).toMatchObject({ event: 'dispatch_retry_enter', detail: 'unconfirmed_paste: attempt 1/3' })

    // The next tick asks for the same review: `sendWhenIdle` sees our text in the box and presses Enter only.
    const second = makePorts({ send: vi.fn(() => ({ sent: true as const })) })
    const applied = step(second, { head: 'bbb222' })

    expect(applied.decision.kind).toBe('request_review')
    expect(applied.status).toBe('applied')
    expect(second.send).toHaveBeenCalledTimes(1)
    expect(second.send.mock.calls[0]![1]).toBe(first.send.mock.calls[0]![1])
    expect(readFlow('run-1').state).toBe('reviewing')
  })

  it('asks a human after three Enter retries instead of waiting for the review timeout', () => {
    seed({ ...fixingState(), enter_retries: 3 })
    const ports = makePorts({ send: vi.fn(() => ({ sent: false as const, reason: 'unconfirmed_paste' as const })) })

    const result = step(ports, { head: 'bbb222' })

    expect(result.status).toBe('unconfirmed')
    const after = readFlow('run-1')
    expect(after.state).toBe('escalated')
    expect(after.enter_retries).toBe(0)
    expect([...after.log].reverse().find(entry => entry.event === 'escalate')!.detail).toContain('3 Enters did not submit it')
    expect(after.log.some(entry => entry.event === 'escalate' && entry.detail.includes('review_dispatch_unconfirmed'))).toBe(true)
    expect(listFlowIncidents('run-1', { root })).toMatchObject([
      { kind: 'dispatch_unconfirmed', severity: 'blocker', status: 'open', owner: 'orchestrator' },
    ])
    expect(listFlowIncidents('run-1', { root })).toHaveLength(1)
  })

  it('writes the retry into the journal, once per attempt', () => {
    seed(fixingState())
    const ports = makePorts({ send: vi.fn(() => ({ sent: false as const, reason: 'unconfirmed_paste' as const })) })

    step(ports, { head: 'bbb222' })
    step(ports, { head: 'bbb222', now: NOW + 60_000, at: '2026-01-01T00:01:00.000Z' })

    const retries = readFlow('run-1').log.filter(entry => entry.event === 'dispatch_retry_enter')
    expect(retries.map(entry => entry.detail)).toEqual([
      'unconfirmed_paste: attempt 1/3',
      'unconfirmed_paste: attempt 2/3',
    ])
    expect(readFlow('run-1').enter_retries).toBe(2)
  })
})

describe('a verdict has to name the commit it judges (block 69)', () => {
  it('refuses a fix on a verdict read from the scrollback of an older commit', () => {
    seed(makeState({
      state: 'reviewing',
      review_started_at: NOW - 120_000,
      claim: { head: 'aaa111', verdict: null, verdict_count: 3, verdict_applied: false, spec_id: null },
    }))
    // The pane still holds the verdicts of earlier rounds: the counter grows (3 → 5) while nothing was written for this head.
    const ports = makePorts({ peek: () => verdictCapture(5) })

    const result = step(ports, { head: 'aaa111' })

    expect(result.decision.kind).toBe('none')
    expect(result.decision.reason).toBe('awaiting_verdict')
    expect(result.decision.log_detail).toContain('not bound to aaa111')
    expect(ports.send).not.toHaveBeenCalled()
    expect(readFlow('run-1').rounds).toBe(0)
    expect(ports.send).toHaveBeenCalledTimes(0)
  })

  it('reads the answer of a head whose round counter moved, instead of a file nobody wrote', () => {
    // The live 6f25848: a phantom fix left `rounds` at 1, so the reader looked for `<head>-r2.md` while the reviewer's
    // answer sat in `<head>-r1.md`. The commit is the binding, not the counter.
    seed(reviewingState({ rounds: 1 }))
    writeStaging('run-1', NOTES_HEAD, 1, `MAJOR src/core/flow.ts:120 — the claim is not re-read\nВЕРДИКТ: CHANGES_REQUESTED\n`)

    const result = step(makePorts(), { head: NOTES_HEAD })

    expect(result.decision.kind).toBe('dispatch_fix')
    expect(result.decision.notes_ref).toBe(`notes/${NOTES_HEAD}-r1.md`)
    expect(readFlow('run-1').answered_round).toBe(`notes/${NOTES_HEAD}-r1.md`)
    expect(result.decision.message).toContain('MAJOR src/core/flow.ts:120')
  })

  it('creates notes/inbox before a prompt names a file in it', () => {
    // `flow start --replace` removes the whole notes directory; the prompt still names `notes/inbox/<head>-r1.md`, so the
    // engine has to put the directory back or the answer has nowhere to go.
    seed(makeState({
      state: 'fixing',
      claim: { head: NOTES_HEAD, verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null },
    }))
    const inbox = join(root, 'flows', 'run-1', 'notes', 'inbox')
    expect(existsSync(inbox)).toBe(false)

    const result = step(makePorts(), { head: 'fff9999' })

    expect(result.decision.kind).toBe('request_review')
    expect(result.decision.message).toContain('notes/inbox/')
    expect(existsSync(inbox)).toBe(true)
    expect(statSync(inbox).mode & 0o777).toBe(0o700)
  })
})

describe('the paste record a fresh process needs (block 69, review round 2)', () => {
  it('writes the paste into the state and hands it to the next tick\'s send', () => {
    seed(makeState({
      state: 'fixing',
      claim: { head: 'aaa111', verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null },
    }))
    const pastedAt = NOW + 42
    const first = makePorts({ send: vi.fn(() => ({ sent: false as const, reason: 'unconfirmed_paste' as const, pastedAt })) })

    step(first, { head: 'bbb222' })

    // The first attempt had nothing to recognise — it pasted into a clean composer.
    expect(first.send.mock.calls[0]![2]).toEqual({ pasted: null })
    // The record the retry depends on: agent, head and the moment the composer was last seen holding our prompt.
    expect(readFlow('run-1').dispatch_paste).toEqual({ agent: 'rev-1', head: 'bbb222', at: pastedAt })

    // The next tick is a new process: it has no in-process paste map, and this record is the only evidence that the
    // collapsed marker in the pane is ours. It travels with the send, so `sendWhenIdle` presses Enter instead of
    // refusing the marker as somebody else's text.
    const second = makePorts({ send: vi.fn(() => ({ sent: true as const })) })
    step(second, { head: 'bbb222', now: NOW + 60_000, at: '2026-01-01T00:01:00.000Z' })

    expect(second.send.mock.calls[0]![2]).toEqual({ pasted: { at: pastedAt } })
  })

  it('drops the record once the dispatch settles, and refuses to reuse it for another head', () => {
    seed(makeState({
      state: 'fixing',
      claim: { head: 'aaa111', verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null },
      dispatch_paste: { agent: 'rev-1', head: 'ccc333', at: NOW - 1000 },
    }))

    // A record for another head authorises nothing: this prompt is about bbb222, not ccc333.
    const ports = makePorts({ send: vi.fn(() => ({ sent: true as const })) })
    step(ports, { head: 'bbb222' })
    expect(ports.send.mock.calls[0]![2]).toEqual({ pasted: null })
    // Applied: the record is gone with the dispatch it belonged to.
    expect(readFlow('run-1').dispatch_paste).toBeNull()
  })
})

describe('a pane that stays unreadable is explained (block 73)', () => {
  function reviewing(): FlowState {
    return makeState({
      state: 'reviewing',
      review_started_at: NOW,
      claim: { head: 'aaa111', verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null },
    })
  }

  it('holds at once, and says why once the hold has lasted two minutes', () => {
    seed(reviewing())
    const blind = {
      ...makePorts({ paneBusy: agentId => (agentId === 'rev-1' ? 'unknown' as const : 'idle' as const) }),
      paneDiagnosis: () => 'footer_absent',
    }

    const first = step(blind, { head: 'aaa111' })
    expect(first.decision.reason).toBe('review_pane_unknown')
    expect(readFlow('run-1').log.at(-1)).toMatchObject({ event: 'hold', detail: 'review_pane_unknown' })
    // Nothing explained yet: a hold is not news until it lasts.
    expect(readFlow('run-1').log.some(entry => entry.event === 'pane_state_unknown')).toBe(false)

    const later = step(blind, { head: 'aaa111', now: NOW + PANE_UNKNOWN_HOLD_MS + 1_000, at: '2026-01-01T00:02:01.000Z' })
    expect(later.status).toBe('skipped')
    const explained = readFlow('run-1').log.filter(entry => entry.event === 'pane_state_unknown')
    expect(explained).toHaveLength(1)
    expect(explained[0]!.detail).toBe('review: footer_absent')

    // The same line is not written again on the next unreadable tick.
    step(blind, { head: 'aaa111', now: NOW + PANE_UNKNOWN_HOLD_MS + 61_000, at: '2026-01-01T00:03:01.000Z' })
    expect(readFlow('run-1').log.filter(entry => entry.event === 'pane_state_unknown')).toHaveLength(1)
  })

  it('recovers when the pane becomes readable, without asking for the same round again', () => {
    // The incident: the reviewer pane was idle but read as unknown (the composer had no glyph). Once it is readable the
    // round carries on — the engine never pastes a second request for the same head.
    seed(reviewing())
    const blind = {
      ...makePorts({ paneBusy: agentId => (agentId === 'rev-1' ? 'unknown' as const : 'idle' as const) }),
      paneDiagnosis: () => 'composer_not_found',
    }
    expect(step(blind, { head: 'aaa111' }).decision.reason).toBe('review_pane_unknown')

    const seeing = makePorts({ peek: () => verdictCapture(1, 'ACCEPT') })
    const recovered = step(seeing, { head: 'aaa111', now: NOW + 60_000 })

    expect(recovered.decision.reason).toBe('flow_done')
    expect(seeing.send).not.toHaveBeenCalled()
    expect(readFlow('run-1').log.filter(entry => entry.event === 'request_review')).toHaveLength(0)
  })
})

describe('the tick asks for the review instead of holding dev_busy (block 74)', () => {
  // The incident: the developer's pane is at its prompt, and its own report quotes `◦ Working (8s • esc to interrupt)` in the
  // body. Block 73's whole-frame scan read that as a running turn and held `dev_busy`; the review was never requested.
  const QUOTING_PANE = [
    '  ◦ Working (8s • esc to interrupt)',
    '  — quoted from the earlier run, twice: esc to interrupt',
    '› Ask Codex to do anything',
    '  GPT-6-Luna high · ~/projects/flow-finish',
    '  ← for agents · ? for shortcuts',
  ].join('\n')

  it('requests the review on a free pane whose body quotes the hint', () => {
    seed(makeState({ state: 'idle' }))
    const ports = makePorts({ paneBusy: () => detectPaneBusy(QUOTING_PANE, 'codex') })

    const stepped = step(ports, { head: 'bbb222' })

    // The tick went through and pasted the brief: the review was requested, not held.
    expect(stepped.decision.reason).toBe('review_requested')
    expect(readFlow('run-1').log.some(entry => entry.event === 'hold' && entry.detail === 'dev_busy')).toBe(false)
    expect(ports.send).toHaveBeenCalled()
  })

  it('requests review when the Codex reviewer is in message-selection mode (block 88)', () => {
    seed(makeState({ state: 'idle' }))
    const selection = [
      '› Ask Codex to do anything',
      'GPT-6-Luna high · ~/projects/flow-finish',
      '^c copy · enter copy & follow · esc clear',
    ].join('\n')
    const ports = makePorts({ paneBusy: () => detectPaneBusy(selection, 'codex') })

    const stepped = step(ports, { head: 'bbb222' })

    expect(detectPaneBusy(selection, 'codex')).toBe('idle')
    expect(stepped.decision.reason).toBe('review_requested')
    expect(stepped.decision.reason).not.toBe('review_pane_unknown')
    expect(ports.send).toHaveBeenCalledTimes(1)
  })

  it('still holds dev_busy on a pane that is really running', () => {
    seed(makeState({ state: 'idle' }))
    const running = [
      '  ◦ Working (8s • esc to interrupt)',
      '',
      '› Ask Codex to do anything',
      '  GPT-6-Luna high · ~/projects/flow-finish',
      '  ← for agents · ? for shortcuts',
    ].join('\n')
    const ports = makePorts({ paneBusy: () => detectPaneBusy(running, 'codex') })

    expect(step(ports, { head: 'bbb222' }).decision.reason).toBe('dev_busy')
    expect(ports.send).not.toHaveBeenCalled()
  })
})
