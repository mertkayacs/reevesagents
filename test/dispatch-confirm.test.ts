// D1 and D3 from the live test of 2026-11-02 (block 20): an unconfirmed review request is still a round, and the
// evidence rule must see the notes file that is actually there.
//
// The runner is driven end to end (`stepFlow`) against a real flow file in a temp registry, because both defects live
// in the seam between the send and the state: `sendWhenIdle` reports `pane_changed`, and what the flow writes back
// decides whether the reviewer's answer is ever read.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { createFlowState, flowTick } from '../src/core/flow.js'
import type { FlowObservations, FlowState } from '../src/core/flow.js'
import { readFlow, saveFlow } from '../src/core/flow-store.js'
import { notesRef, stagingPath } from '../src/core/flow-notes.js'
import { observeFlow, stepFlow } from '../src/core/flow-runner.js'
import { attachSpec, createPlan, planPath, savePlan } from '../src/core/plan.js'
import { writeAgent, writeRun } from '../src/core/runs.js'

const execFileSync = vi.hoisted(() => vi.fn((file: string, args: string[] = []) => {
  if (file === 'git' && args.includes('rev-parse')) return 'bbb222\n'
  if (file === 'git' && args.includes('status')) return ''
  return ''
}))
vi.mock('node:child_process', () => ({ execFileSync, spawnSync: vi.fn(() => ({ status: 1, stdout: '' })) }))

const runtime = vi.hoisted(() => ({ paneBusy: vi.fn(() => 'idle' as const), peekAgentRaw: vi.fn(() => '') }))
vi.mock('../src/core/runtime.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/core/runtime.js')>()),
  ...runtime,
}))

const NOW = Date.parse('2026-11-02T09:00:00.000Z')
const AT = new Date(NOW).toISOString()
const HEAD = 'd60048c000000000000000000000000000000000'

let root: string
let savedRegistry: string | undefined

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'reeves-dispatch-confirm-'))
  savedRegistry = process.env.REEVES_REGISTRY
  process.env.REEVES_REGISTRY = root
  process.env.REEVES_CONFIG = join(root, 'config.json')
  runtime.paneBusy.mockImplementation(() => 'idle')
  runtime.peekAgentRaw.mockImplementation(() => '')

  writeRun({
    id: 'run-1', name: 'run-1', status: 'running', tmux_session: 'reeves-run-1', reeves_window_id: '@0',
    reeves_pane_id: '%0', root_agent_id: 'dev-1', working_dir: root, preset_name: null,
    started_at: '2026-11-01T00:00:00.000Z', ended_at: null,
  })
  for (const [id, nickname] of [['dev-1', 'dev'], ['rev-1', 'rev']] as const) {
    writeAgent({
      id, run_id: 'run-1', nickname, provider: 'codex', model: '', role: 'worker', working_dir: root,
      task: 't', task_status: 'working', task_note: '', tmux_session: 'reeves-run-1', tmux_window_id: '@1',
      tmux_pane_id: '%1', rc_enabled: false, permissions: 'ask', inbox: [], last_seen: 1,
      started_at: '2026-11-01T00:00:01.000Z', ended_at: null,
    })
  }
})

afterEach(() => {
  if (savedRegistry === undefined) delete process.env.REEVES_REGISTRY
  else process.env.REEVES_REGISTRY = savedRegistry
  delete process.env.REEVES_CONFIG
  rmSync(root, { recursive: true, force: true })
})

function seedIdleFlow(): FlowState {
  const state = createFlowState({
    run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 3, max_total_rounds: 8, at: AT,
  })
  // The baseline commit is behind: the dev has committed, the flow has not reviewed it yet.
  saveFlow({ ...state, state: 'idle', claim: { head: 'aaa111', verdict: null, verdict_count: 0 } })
  return state
}

function ports(send: (_pane: string, _text: string) => { sent: true } | { sent: false, reason: 'unconfirmed' | 'pane_changed' }, paneText = '') {
  return { paneBusy: () => 'idle' as const, peek: () => paneText, send }
}

describe('an unconfirmed review request is still a round (D1)', () => {
  it('moves the flow to reviewing, starts the clock, and pastes only once', () => {
    seedIdleFlow()
    const pasted: string[] = []
    const result = stepFlow('run-1', {
      now: NOW, at: AT, head: HEAD, tree_clean: true, plan: undefined,
      ports: ports((_pane, text) => { pasted.push(text); return { sent: false, reason: 'unconfirmed' } }),
      evidence_policy: { min_seconds: 0, retries: 1 },
    })

    expect(result.decision.kind).toBe('request_review')
    expect(result.status).toBe('unconfirmed')
    const after = readFlow('run-1')
    // The round exists: without this the next tick says `head_unchanged`, notes are never read (they are read only in
    // `reviewing`) and the reviewer's answer is lost.
    expect(after.state).toBe('reviewing')
    expect(after.review_started_at).toBe(NOW)
    expect(after.claim.head).toBe(HEAD)
    expect(pasted).toHaveLength(1)

    // A second tick while the reviewer works: nothing is pasted again.
    const again = stepFlow('run-1', {
      now: NOW + 5_000, at: AT, head: HEAD, tree_clean: true, plan: undefined,
      ports: ports((_pane, text) => { pasted.push(text); return { sent: true } }),
      evidence_policy: { min_seconds: 0, retries: 1 },
    })
    expect(again.status).not.toBe('unconfirmed')
    expect(pasted).toHaveLength(1)
    expect(readFlow('run-1').state).toBe('reviewing')
  })

  it('does not consume the round when the Enter was never pressed', () => {
    // `pane_changed` is the pre-Enter refusal, and the live review of d096765 said what it means: the reviewer never
    // received the request, so a round that starts here waits for notes that cannot arrive. No round, no clock — the
    // claim is released and the next tick asks again.
    seedIdleFlow()
    const pasted: string[] = []
    const first = stepFlow('run-1', {
      now: NOW, at: AT, head: HEAD, tree_clean: true, plan: undefined,
      ports: ports((_pane, text) => { pasted.push(text); return { sent: false, reason: 'pane_changed' } }),
      evidence_policy: { min_seconds: 0, retries: 1 },
    })

    expect(first.status).toBe('refused')
    const after = readFlow('run-1')
    expect(after.state).toBe('idle')
    expect(after.review_started_at).toBeNull()
    expect(after.pending).toBeNull()

    // The retry: the pane is free, the composer still holds our text, so the same prompt goes out without a second paste
    // (the port stands in for `sendWhenIdle`, which is what proves that in test/send-when-idle.test.ts).
    const again = stepFlow('run-1', {
      now: NOW + 3_000, at: AT, head: HEAD, tree_clean: true, plan: undefined,
      ports: ports((_pane, text) => { pasted.push(text); return { sent: true } }),
      evidence_policy: { min_seconds: 0, retries: 1 },
    })
    expect(again.status).toBe('applied')
    expect(pasted).toHaveLength(2)
    expect(readFlow('run-1').state).toBe('reviewing')
  })

  it('reads the answer the reviewer wrote after the unconfirmed request, and accepts it', () => {
    seedIdleFlow()
    stepFlow('run-1', {
      now: NOW, at: AT, head: HEAD, tree_clean: true, plan: undefined,
      ports: ports(() => ({ sent: false, reason: 'unconfirmed' })),
      evidence_policy: { min_seconds: 30, retries: 1 },
    })

    // The reviewer answered 44 s later by writing the round's staging file, exactly as on the live run.
    const staging = stagingPath('run-1', HEAD, 1, root)
    mkdirSync(join(root, 'flows', 'run-1', 'notes', 'inbox'), { recursive: true })
    writeFileSync(staging, 'no findings: the commit only adds two empty files\nVERDICT: ACCEPT\n')

    const result = stepFlow('run-1', {
      now: NOW + 44_000, at: AT, head: HEAD, tree_clean: true, plan: undefined,
      ports: ports(() => ({ sent: true })),
      evidence_policy: { min_seconds: 30, retries: 1 },
    })

    expect(result.observations.verdict).toBe('ACCEPT')
    expect(result.decision.kind).toBe('none')
    expect(result.decision.reason).toBe('flow_done')
    const after = readFlow('run-1')
    expect(after.state).toBe('done')
    expect(after.log.at(-1)?.event).toBe('flow_done')
  })
})

describe('a verdict already collected is work, even when the head has not moved (D4)', () => {
  function idleWithVerdict(verdict: 'ACCEPT' | 'CHANGES_REQUESTED', extra: Partial<FlowState> = {}): void {
    const state = createFlowState({
      run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 3, max_total_rounds: 8, at: AT,
    })
    saveFlow({
      ...state, state: 'idle', rounds: 0,
      claim: { head: HEAD, verdict, verdict_count: 2 },
      ...extra,
    })
  }

  it('dispatches the fix for a CHANGES_REQUESTED collected in idle, and only once', () => {
    idleWithVerdict('CHANGES_REQUESTED')
    const sent: string[] = []
    const portsFix = ports((_pane, text) => { sent.push(text); return { sent: true } })

    const first = stepFlow('run-1', {
      now: NOW, at: AT, head: HEAD, tree_clean: true, plan: null, ports: portsFix,
      evidence_policy: { min_seconds: 0, retries: 1 },
    })
    expect(first.decision.kind).toBe('dispatch_fix')
    expect(first.status).toBe('applied')
    expect(sent).toHaveLength(1)
    expect(sent[0]).toContain(HEAD)
    expect(readFlow('run-1').state).toBe('fixing')

    // The verdict is spent: the next tick waits for the commit instead of sending the same fix again.
    const second = stepFlow('run-1', {
      now: NOW + 5_000, at: AT, head: HEAD, tree_clean: true, plan: null, ports: portsFix,
      evidence_policy: { min_seconds: 0, retries: 1 },
    })
    expect(second.decision.kind).not.toBe('dispatch_fix')
    expect(sent).toHaveLength(1)
  })

  it('closes the accepted plan item and takes the next one', () => {
    // The plan is what makes an idle ACCEPT ambiguous: the item it accepted is still open, and `tickReviewing` never saw
    // the verdict because the flow was parked when it arrived.
    const doc = ['- [ ] **P1.1** — first', '- [ ] **P1.2** — second'].join('\n')
    const brief = (id: string) => JSON.stringify({ id, title: id, goal: 'g', requirements: ['r'], checks: ['c'], report: ['r'] })
    let plan = createPlan({ run_id: 'run-1', source_path: 'docs/plan.md', text: doc, now: NOW, at: AT }).plan
    for (const id of ['P1.1', 'P1.2']) {
      plan = attachSpec(plan, { id, text: brief(id), format: 'json', spec_path: `docs/briefs/${id}.json`, now: NOW, at: AT }).plan
    }
    mkdirSync(dirname(planPath('run-1')), { recursive: true })
    savePlan(plan)
    idleWithVerdict('ACCEPT', { active_plan_item: 'P1.1' })

    const sent: string[] = []
    const first = stepFlow('run-1', {
      now: NOW, at: AT, head: HEAD, tree_clean: true, plan: undefined,
      ports: ports((_pane, text) => { sent.push(text); return { sent: true } }),
      evidence_policy: { min_seconds: 0, retries: 1 },
    })
    expect(first.decision.reason).toBe('plan_item_dispatched')
    expect(first.decision.next_plan_close?.id).toBe('P1.1')
    expect(readFlow('run-1').active_plan_item).toBe('P1.2')

    // Once per commit: the ACCEPT is not re-applied, so P1.2 is not closed by the tick that just dispatched it.
    const second = stepFlow('run-1', {
      now: NOW + 5_000, at: AT, head: HEAD, tree_clean: true, plan: undefined,
      ports: ports((_pane, text) => { sent.push(text); return { sent: true } }),
      evidence_policy: { min_seconds: 0, retries: 1 },
    })
    expect(second.decision.kind).not.toBe('dispatch_spec')
    expect(sent).toHaveLength(1)
  })

  it('still holds on an unchanged head when there is no verdict to act on', () => {
    const state = createFlowState({
      run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 3, max_total_rounds: 8, at: AT,
    })
    saveFlow({ ...state, state: 'idle', claim: { head: HEAD, verdict: null, verdict_count: 0 } })
    const sent: string[] = []

    const result = stepFlow('run-1', {
      now: NOW, at: AT, head: HEAD, tree_clean: true, plan: null,
      ports: ports((_pane, text) => { sent.push(text); return { sent: true } }),
      evidence_policy: { min_seconds: 0, retries: 1 },
    })
    expect(result.decision.reason).toBe('head_unchanged')
    expect(sent).toHaveLength(0)
  })

  it('does not send the same fix from two ticks that race for the claim', () => {
    idleWithVerdict('CHANGES_REQUESTED')
    const sent: string[] = []
    const portsFix = ports((_pane, text) => { sent.push(text); return { sent: true } })

    const a = stepFlow('run-1', {
      now: NOW, at: AT, head: HEAD, tree_clean: true, plan: null, ports: portsFix,
      evidence_policy: { min_seconds: 0, retries: 1 },
    })
    const b = stepFlow('run-1', {
      now: NOW, at: AT, head: HEAD, tree_clean: true, plan: null, ports: portsFix,
      evidence_policy: { min_seconds: 0, retries: 1 },
    })
    expect([a.decision.kind, b.decision.kind].filter(kind => kind === 'dispatch_fix')).toHaveLength(1)
    expect(sent).toHaveLength(1)
  })
})

describe('evidence sees the round file, not just its finding lines (D3)', () => {
  function reviewingWithStaging(body: string | null): { state: FlowState, observations: FlowObservations } {
    const state: FlowState = {
      ...createFlowState({
        run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 3, max_total_rounds: 8, at: AT,
      }),
      state: 'reviewing',
      review_started_at: NOW,
      claim: { head: HEAD, verdict: null, verdict_count: 0 },
    }
    saveFlow(state)
    if (body !== null) {
      mkdirSync(join(root, 'flows', 'run-1', 'notes', 'inbox'), { recursive: true })
      writeFileSync(stagingPath('run-1', HEAD, 1, root), body)
    }
    const observations = observeFlow(state, {
      now: NOW + 44_000, head: HEAD, tree_clean: true, plan: null,
      // The pane prints the verdict the way a reviewer would leave it: `VERDICT: ACCEPT` with nothing else.
      ports: ports(() => ({ sent: true }), 'VERDICT: ACCEPT'),
      evidence_policy: { min_seconds: 30, retries: 1 },
    })
    return { state, observations }
  }

  it('counts a 16-byte ACCEPT that says "no findings" as a substantiated answer', () => {
    const { state, observations } = reviewingWithStaging('no findings: only two empty files\nVERDICT: ACCEPT\n')

    expect(observations.verdict_source).toBe('file')
    expect(observations.verdict).toBe('ACCEPT')
    // The defect: evidence filtered the file down to its finding lines, so a 16-byte ACCEPT measured 0/0b.
    expect(observations.verdict_evidence?.notes_bytes).toBeGreaterThan(0)
    expect(flowTick(state, observations).reason).not.toBe('review_unsubstantiated')
  })

  it('keeps a verdict without a file and without findings unsubstantiated', () => {
    const { state, observations } = reviewingWithStaging(null)

    expect(observations.verdict_source).toBe('pane')
    expect(observations.verdict_evidence?.notes_bytes).toBe(0)
    // The first rejection re-asks once with the stricter prompt (`review_evidence_retries`); a bare pane ACCEPT is
    // refused either way.
    expect(flowTick(state, observations).reason).toBe('review_unsubstantiated')
  })
})

describe('the notes reference the flow reports for the round', () => {
  it('is the durable path derived from the same head and round as the staging file', () => {
    expect(notesRef(HEAD, 1)).toBe('notes/d60048c000000000000000000000000000000000-r1.md')
    expect(stagingPath('run-1', HEAD, 1, root)).toContain('notes/inbox/')
  })
})
