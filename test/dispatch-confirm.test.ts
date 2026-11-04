// D1 and D3 from the live test of 2026-11-02 (block 20): an unconfirmed review request is still a round, and the
// evidence rule must see the notes file that is actually there.
//
// The runner is driven end to end (`stepFlow`) against a real flow file in a temp registry, because both defects live
// in the seam between the send and the state: `sendWhenIdle` reports `pane_changed`, and what the flow writes back
// decides whether the reviewer's answer is ever read.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { applyDecisionToState, createFlowState, flowTick } from '../src/core/flow.js'
import type { FlowObservations, FlowState } from '../src/core/flow.js'
import { readFlow, saveFlow } from '../src/core/flow-store.js'
import { notesRef, stagingPath } from '../src/core/flow-notes.js'
import { observeFlow, stepFlow } from '../src/core/flow-runner.js'
import { attachSpec, createPlan, planPath, readPlan, savePlan } from '../src/core/plan.js'
import { planTickView } from '../src/core/flow-plan.js'
import { releaseRound, resumeFlow } from '../src/core/flow-control.js'
import { writeAgent, writeRun } from '../src/core/runs.js'
import { startFlow } from '../src/core/flow-start.js'

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
  saveFlow({ ...state, state: 'idle', claim: { head: 'aaa111', verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null } })
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
      claim: { head: HEAD, verdict, verdict_count: 2, verdict_applied: false, spec_id: null },
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
    // The second item is open and in flight, with no commit of its own: it has been dispatched and awaits its own review. "No second
    // dispatch" alone would also hold if the carried-over ACCEPT had closed it (block 50, MINOR 1).
    const items = readPlan('run-1').items
    expect(items.find(item => item.id === 'P1.2')!.status).toBe('in_work')
    expect(items.find(item => item.id === 'P1.2')!.head).toBeNull()
  })

  it('settles the verdict before it looks at a head that has already moved (A1)', () => {
    // The verdict is older than the commit: skipping it because HEAD moved would drop an answer the reviewer already
    // gave, and the fix would never be sent.
    idleWithVerdict('CHANGES_REQUESTED')
    const sent: string[] = []
    const first = stepFlow('run-1', {
      now: NOW, at: AT, head: 'bbb222', tree_clean: true, plan: null,
      ports: ports((_pane, text) => { sent.push(text); return { sent: true } }),
      evidence_policy: { min_seconds: 0, retries: 1 },
    })
    expect(first.decision.kind).toBe('dispatch_fix')
    expect(sent).toHaveLength(1)

    // Then the flow is in `fixing`; once the dev commits, that commit is what gets reviewed — the second step of the
    // sequence is not lost either.
    const after = stepFlow('run-1', {
      now: NOW + 10_000, at: AT, head: 'ccc333', tree_clean: true, plan: null,
      ports: ports((_pane, text) => { sent.push(text); return { sent: true } }),
      evidence_policy: { min_seconds: 0, retries: 1 },
    })
    expect(after.decision.kind).toBe('request_review')
    expect(after.decision.head).toBe('ccc333')
    expect(sent).toHaveLength(2)
  })

  it('still holds on an unchanged head when there is no verdict to act on', () => {
    const state = createFlowState({
      run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 3, max_total_rounds: 8, at: AT,
    })
    saveFlow({ ...state, state: 'idle', claim: { head: HEAD, verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null } })
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

describe('a claim the world already answered settles by observation (D7)', () => {
  it('applies the notes file that arrived while the claim was open', () => {
    // The sandbox: the request was pasted, the send reported `pane_changed`, the claim stayed open, the reviewer wrote
    // `notes/inbox/<head>-r1.md` — and nothing read it until PENDING_TTL_SEC expired into an escalation. The observation is
    // the answer; the claim is stale, not pending.
    const state = createFlowState({
      run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 3, max_total_rounds: 8, at: AT,
    })
    saveFlow({
      ...state,
      state: 'reviewing',
      review_started_at: NOW,
      claim: { head: HEAD, verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null },
      pending: { op_id: 'op-1', kind: 'request_review', target: 'review', head: HEAD, spec_id: null, at: NOW },
    })
    mkdirSync(join(root, 'flows', 'run-1', 'notes', 'inbox'), { recursive: true })
    writeFileSync(stagingPath('run-1', HEAD, 1, root), 'VERDICT: ACCEPT\n')

    const result = stepFlow('run-1', {
      now: NOW + 5_000, at: AT, head: HEAD, tree_clean: true, plan: null,
      ports: ports(() => ({ sent: true })),
      evidence_policy: { min_seconds: 30, retries: 1 },
    })

    expect(result.status).toBe('applied')
    expect(result.decision.reason).toBe('flow_done')
    const after = readFlow('run-1')
    expect(after.pending).toBeNull()
    expect(after.state).toBe('done')
    expect(after.log.some(entry => entry.event === 'settled_by_observation')).toBe(true)
  })

  it('leaves a claim alone when nothing observable answers it', () => {
    const state = createFlowState({
      run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 3, max_total_rounds: 8, at: AT,
    })
    saveFlow({
      ...state,
      state: 'reviewing',
      review_started_at: NOW,
      claim: { head: HEAD, verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null },
      pending: { op_id: 'op-1', kind: 'request_review', target: 'review', head: HEAD, spec_id: null, at: NOW },
    })

    const result = stepFlow('run-1', {
      now: NOW + 5_000, at: AT, head: HEAD, tree_clean: true, plan: null,
      ports: ports(() => ({ sent: true }), ''),
      evidence_policy: { min_seconds: 30, retries: 1 },
    })
    expect(result.decision.reason).toBe('dispatch_pending')
    expect(readFlow('run-1').pending?.op_id).toBe('op-1')
  })
})

describe('a valid notes file is evidence by itself (D8)', () => {
  it('accepts a 16-byte VERDICT: ACCEPT with no findings', () => {
    const state = createFlowState({
      run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 3, max_total_rounds: 8, at: AT,
    })
    saveFlow({ ...state, state: 'reviewing', review_started_at: NOW + 1_000, claim: { head: HEAD, verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null } })
    mkdirSync(join(root, 'flows', 'run-1', 'notes', 'inbox'), { recursive: true })
    writeFileSync(stagingPath('run-1', HEAD, 1, root), 'VERDICT: ACCEPT\n')

    const result = stepFlow('run-1', {
      // One second after the request: the time half of the old rule would have refused this.
      now: NOW + 2_000, at: AT, head: HEAD, tree_clean: true, plan: null,
      ports: ports(() => ({ sent: true }), ''),
      evidence_policy: { min_seconds: 30, retries: 1 },
    })
    expect(result.decision.reason).toBe('flow_done')
    expect(result.decision.reason).not.toBe('review_unsubstantiated')
  })
})

describe('an ACCEPT collected in idle closes the item (D10)', () => {
  function planWith(ids: string[], briefed: string[]) {
    const doc = ids.map(id => `- [ ] **${id}** — ${id}`).join('\n')
    let plan = createPlan({ run_id: 'run-1', source_path: 'docs/plan.md', text: doc, now: NOW, at: AT }).plan
    for (const id of briefed) {
      plan = attachSpec(plan, {
        id, text: JSON.stringify({ id, title: id, goal: 'g', requirements: ['r'], checks: ['c'], report: ['r'] }),
        format: 'json', spec_path: `docs/briefs/${id}.json`, now: NOW, at: AT,
      }).plan
    }
    mkdirSync(dirname(planPath('run-1')), { recursive: true })
    savePlan(plan)
    return plan
  }

  function idleAccepting(active: string, handledFor: string | null = null): void {
    const state = createFlowState({
      run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 3, max_total_rounds: 8, at: AT,
    })
    saveFlow({
      ...state, state: 'idle', active_plan_item: active, verdict_handled_for: handledFor,
      claim: { head: HEAD, verdict: 'ACCEPT', verdict_count: 5, verdict_applied: false, spec_id: null },
    })
  }

  it('closes the item, reports 1/2 and names the next one as waiting for a brief', () => {
    planWith(['P1.1', 'P1.2'], ['P1.1'])
    // The marker is already set: the review timed out, the item was re-dispatched, the reviewer answered afterwards. A
    // plan item that is still open proves the ACCEPT was not applied, so it is applied now.
    idleAccepting('P1.1', HEAD)
    const sent: string[] = []

    const result = stepFlow('run-1', {
      now: NOW, at: AT, head: HEAD, tree_clean: true,
      ports: ports((_pane, text) => { sent.push(text); return { sent: true } }),
      evidence_policy: { min_seconds: 0, retries: 1 },
    })

    expect(result.decision.reason).toBe('plan_incomplete')
    const plan = readPlan('run-1')
    expect(plan.items.find(item => item.id === 'P1.1')!.status).toBe('done')
    expect(plan.items.filter(item => item.status === 'done')).toHaveLength(1)
    expect(sent).toHaveLength(0)
    // The journal names the close through the decision detail; the item itself is `done` in the mirror. (The write-back of
    // the tick into the document may follow it as its own line — this fixture has no document on disk, so it reports
    // `plan_mark_failed` after the decision, which is why the assertion looks for the entry, not the last one.)
    expect(readFlow('run-1').log.some(entry => (entry.detail ?? '').includes('needs a brief for P1.2'))).toBe(true)
    expect(plan.items.find(item => item.id === 'P1.1')!.head).toBe(HEAD)
  })

  it('changes nothing on the tick after it', () => {
    planWith(['P1.1', 'P1.2'], ['P1.1'])
    idleAccepting('P1.1')
    const first = stepFlow('run-1', {
      now: NOW, at: AT, head: HEAD, tree_clean: true, ports: ports(() => ({ sent: true })),
      evidence_policy: { min_seconds: 0, retries: 1 },
    })
    expect(first.decision.reason).toBe('plan_incomplete')

    const second = stepFlow('run-1', {
      now: NOW + 5_000, at: AT, head: HEAD, tree_clean: true, ports: ports(() => ({ sent: true })),
      evidence_policy: { min_seconds: 0, retries: 1 },
    })
    // Nothing moves on the tick after: the item stays closed, nothing is dispatched, the plan still reports `1/2`.
    expect(second.decision.kind).not.toBe('dispatch_spec')
    const plan = readPlan('run-1')
    expect(plan.items.filter(item => item.status === 'done')).toHaveLength(1)
    expect(readFlow('run-1').active_plan_item).toBeNull()
  })

  it('dispatches the next item when that one already has a brief', () => {
    planWith(['P1.1', 'P1.2'], ['P1.1', 'P1.2'])
    idleAccepting('P1.1')
    const sent: string[] = []

    const result = stepFlow('run-1', {
      now: NOW, at: AT, head: HEAD, tree_clean: true,
      ports: ports((_pane, text) => { sent.push(text); return { sent: true } }),
      evidence_policy: { min_seconds: 0, retries: 1 },
    })
    expect(result.decision.reason).toBe('plan_item_dispatched')
    expect(readFlow('run-1').active_plan_item).toBe('P1.2')
    expect(sent).toHaveLength(1)
  })

  it('closes a flow with an ACCEPT and no plan', () => {
    const state = createFlowState({
      run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 3, max_total_rounds: 8, at: AT,
    })
    saveFlow({ ...state, state: 'idle', claim: { head: HEAD, verdict: 'ACCEPT', verdict_count: 5, verdict_applied: false, spec_id: null } })

    const result = stepFlow('run-1', {
      now: NOW, at: AT, head: HEAD, tree_clean: true, plan: null, ports: ports(() => ({ sent: true })),
      evidence_policy: { min_seconds: 0, retries: 1 },
    })
    // Without a plan the legacy path already closed it in `reviewing`; an idle flow holding an ACCEPT is simply finished.
    expect(['head_unchanged', 'flow_done']).toContain(result.decision.reason)
    expect(readFlow('run-1').state).toBe('idle')
  })
})

describe('a verdict recorded but not applied is answered from the state (D11)', () => {
  function idleWith(verdict: 'ACCEPT' | 'CHANGES_REQUESTED', applied: boolean, extra: Partial<FlowState> = {}): void {
    const state = createFlowState({
      run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 3, max_total_rounds: 8, at: AT,
    })
    saveFlow({
      ...state, state: 'idle',
      claim: { head: HEAD, verdict, verdict_count: 5, verdict_applied: applied, spec_id: null },
      ...extra,
    })
  }

  it('closes the item even though this tick observes no verdict at all', () => {
    // The observation is empty — no notes file, the pane says nothing — and the answer is in the state. That is the
    // sandbox case: `state idle · verdict ACCEPT · P1.1.1 in_work` and every tick answered `plan_incomplete`.
    const doc = ['- [ ] **P1.1** — first', '- [ ] **P1.2** — second'].join('\n')
    let plan = createPlan({ run_id: 'run-1', source_path: 'docs/plan.md', text: doc, now: NOW, at: AT }).plan
    plan = attachSpec(plan, {
      id: 'P1.1', text: JSON.stringify({ id: 'P1.1', title: 't', goal: 'g', requirements: ['r'], checks: ['c'], report: ['r'] }),
      format: 'json', spec_path: 'docs/briefs/P1.1.json', now: NOW, at: AT,
    }).plan
    mkdirSync(dirname(planPath('run-1')), { recursive: true })
    savePlan(plan)
    idleWith('ACCEPT', false, { active_plan_item: 'P1.1' })

    const result = stepFlow('run-1', {
      now: NOW, at: AT, head: HEAD, tree_clean: true,
      ports: ports(() => ({ sent: true }), ''),
      evidence_policy: { min_seconds: 30, retries: 1 },
    })

    expect(result.decision.reason).toBe('plan_incomplete')
    const after = readFlow('run-1')
    expect(after.claim.verdict_applied).toBe(true)
    expect(after.active_plan_item).toBeNull()
    expect(readPlan('run-1').items.find(item => item.id === 'P1.1')!.status).toBe('done')
  })

  it('sends the fix for a recorded CHANGES_REQUESTED exactly once', () => {
    idleWith('CHANGES_REQUESTED', false)
    const sent: string[] = []
    const first = stepFlow('run-1', {
      now: NOW, at: AT, head: HEAD, tree_clean: true, plan: null,
      ports: ports((_pane, text) => { sent.push(text); return { sent: true } }),
      evidence_policy: { min_seconds: 0, retries: 1 },
    })
    expect(first.decision.kind).toBe('dispatch_fix')
    expect(sent).toHaveLength(1)
    expect(readFlow('run-1').claim.verdict_applied).toBe(true)

    const second = stepFlow('run-1', {
      now: NOW + 5_000, at: AT, head: HEAD, tree_clean: true, plan: null,
      ports: ports((_pane, text) => { sent.push(text); return { sent: true } }),
      evidence_policy: { min_seconds: 0, retries: 1 },
    })
    expect(sent).toHaveLength(1)
    expect(second.decision.kind).not.toBe('dispatch_fix')
  })

  it('does nothing when the verdict is already applied', () => {
    idleWith('ACCEPT', true, { active_plan_item: null })
    const sent: string[] = []
    const result = stepFlow('run-1', {
      now: NOW, at: AT, head: HEAD, tree_clean: true, plan: null,
      ports: ports((_pane, text) => { sent.push(text); return { sent: true } }),
      evidence_policy: { min_seconds: 0, retries: 1 },
    })
    expect(result.status).toBe('skipped')
    expect(sent).toHaveLength(0)
  })

  it('applies a verdict left unapplied by a crash, once', () => {
    // Emulation of "the answer was written, then the process died": the file says verdict without `verdict_applied`, and
    // a restart must carry it out once — not zero times, not twice.
    idleWith('CHANGES_REQUESTED', false)
    const raw = JSON.parse(readFileSync(join(root, 'flows', 'run-1.json'), 'utf-8')) as { claim: Record<string, unknown> }
    delete raw.claim.verdict_applied
    writeFileSync(join(root, 'flows', 'run-1.json'), JSON.stringify(raw))
    // A file without the field reads as "not applied": that is the state those files are in when their verdict still owes
    // a consequence, and a close needs an open item, so re-firing cannot close something twice.
    expect(readFlow('run-1').claim.verdict_applied).toBe(false)

    // And the restart carries it out — once.
    const sent: string[] = []
    const first = stepFlow('run-1', {
      now: NOW, at: AT, head: HEAD, tree_clean: true, plan: null,
      ports: ports((_pane, text) => { sent.push(text); return { sent: true } }),
      evidence_policy: { min_seconds: 0, retries: 1 },
    })
    expect(first.decision.kind).toBe('dispatch_fix')
    expect(sent).toHaveLength(1)
    expect(readFlow('run-1').claim.verdict_applied).toBe(true)

    const second = stepFlow('run-1', {
      now: NOW + 5_000, at: AT, head: HEAD, tree_clean: true, plan: null,
      ports: ports((_pane, text) => { sent.push(text); return { sent: true } }),
      evidence_policy: { min_seconds: 0, retries: 1 },
    })
    expect(second.decision.kind).not.toBe('dispatch_fix')
    expect(sent).toHaveLength(1)
  })

  it('reads an old state without the field and keeps working', () => {
    const state = createFlowState({
      run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 3, max_total_rounds: 8, at: AT,
    })
    saveFlow({ ...state, state: 'idle', claim: { head: HEAD, verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null } })
    const raw = JSON.parse(readFileSync(join(root, 'flows', 'run-1.json'), 'utf-8')) as { claim: Record<string, unknown> }
    delete raw.claim.verdict_applied
    writeFileSync(join(root, 'flows', 'run-1.json'), JSON.stringify(raw))

    const loaded = readFlow('run-1')
    expect(loaded.claim.verdict).toBeNull()
    expect(loaded.claim.verdict_applied).toBe(false)
    expect(() => stepFlow('run-1', {
      now: NOW, at: AT, head: HEAD, tree_clean: true, plan: null, ports: ports(() => ({ sent: true })),
      evidence_policy: { min_seconds: 0, retries: 1 },
    })).not.toThrow()
  })
})

describe('a claim written before the state advanced is still settled (MAJOR 1/2)', () => {
  it('reads the notes file of an outstanding review claim from idle', () => {
    // The claim is written while the flow is still `idle`; the sender dies; the reviewer answers anyway. Nothing read that
    // file, because notes were read only in `reviewing`, so the claim sat until its TTL and then escalated a finished round.
    const state = createFlowState({
      run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 3, max_total_rounds: 8, at: AT,
    })
    saveFlow({
      ...state, state: 'idle', claim: { head: HEAD, verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null },
      pending: { op_id: 'op-1', kind: 'request_review', target: 'review', head: HEAD, spec_id: null, at: NOW },
    })
    mkdirSync(join(root, 'flows', 'run-1', 'notes', 'inbox'), { recursive: true })
    writeFileSync(stagingPath('run-1', HEAD, 1, root), 'VERDICT: ACCEPT\n')

    const sent: string[] = []
    const result = stepFlow('run-1', {
      now: NOW + 5_000, at: AT, head: HEAD, tree_clean: true, plan: null,
      ports: ports((_pane, text) => { sent.push(text); return { sent: true } }),
      evidence_policy: { min_seconds: 30, retries: 1 },
    })

    expect(result.decision.reason).toBe('flow_done')
    expect(sent).toHaveLength(0)
    const after = readFlow('run-1')
    expect(after.pending).toBeNull()
    expect(after.state).toBe('done')
    expect(after.log.some(entry => entry.event === 'settled_by_observation')).toBe(true)
  })

  it('applies the round\'s answer once and never asks for the same review again', () => {
    // MAJOR 2: settling used to re-run the tick from the pre-dispatch state, which could produce *another*
    // `request_review` — a second paste — instead of consuming the answer that is already on screen.
    // The answer is the reviewer's file: a CHANGES_REQUESTED read from the pane is not bound to the commit (block 69).
    const state = createFlowState({
      run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 3, max_total_rounds: 8, at: AT,
    })
    saveFlow({
      ...state, state: 'idle', claim: { head: HEAD, verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null },
      pending: { op_id: 'op-1', kind: 'request_review', target: 'review', head: HEAD, spec_id: null, at: NOW },
    })
    mkdirSync(join(root, 'flows', 'run-1', 'notes', 'inbox'), { recursive: true })
    writeFileSync(stagingPath('run-1', HEAD, 1, root), 'MAJOR src/a.ts:1 — x\nVERDICT: CHANGES_REQUESTED\n')
    const sent: string[] = []

    const result = stepFlow('run-1', {
      now: NOW + 5_000, at: AT, head: HEAD, tree_clean: true, plan: null,
      ports: ports((_pane, text) => { sent.push(text); return { sent: true } }),
      evidence_policy: { min_seconds: 0, retries: 1 },
    })

    // One fix dispatch (the answer applied), zero review requests.
    expect(result.decision.kind).toBe('dispatch_fix')
    expect(sent).toHaveLength(1)
    expect(readFlow('run-1').pending).toBeNull()
  })
})

describe('recovery settles the claim on its own head (block 28/29)', () => {
  const A = 'a'.repeat(40)
  const B = 'b'.repeat(40)

  function pendingOnB(claimCount: number, baseline: number | undefined): FlowState {
    const state = createFlowState({
      run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 3, max_total_rounds: 8, at: AT,
    })
    saveFlow({
      ...state, state: 'idle',
      claim: { head: A, verdict: null, verdict_count: claimCount, verdict_applied: false, spec_id: null },
      pending: {
        op_id: 'op-1', kind: 'request_review', target: 'review', head: B, spec_id: null, at: NOW,
        ...(baseline === undefined ? {} : { verdict_baseline: baseline }),
      },
    })
    return readFlow('run-1')
  }

  it('applies the answer to pending.head when the flow still carries an older head', () => {
    pendingOnB(0, 0)
    mkdirSync(join(root, 'flows', 'run-1', 'notes', 'inbox'), { recursive: true })
    writeFileSync(stagingPath('run-1', B, 1, root), 'VERDICT: ACCEPT\n')

    const sent: string[] = []
    const result = stepFlow('run-1', {
      now: NOW + 5_000, at: AT, head: B, tree_clean: true, plan: null,
      ports: ports((_pane, text) => { sent.push(text); return { sent: true } }),
      evidence_policy: { min_seconds: 30, retries: 1 },
    })

    expect(result.decision.kind).not.toBe('request_review')
    expect(result.decision.reason).toBe('flow_done')
    expect(sent).toHaveLength(0)
    const after = readFlow('run-1')
    expect(after.pending).toBeNull()
    expect(after.claim.head).toBe(B)
    expect(after.log.some(entry => entry.event === 'settled_by_observation')).toBe(true)
  })

  it('measures the answer against the baseline the request was sent with, not the counter a later tick moved', () => {
    // The request went out when the pane held six verdicts; a later tick moved the flow's counter to seven, and the reviewer
    // then answered (the pane now holds seven — the new one, and a notes file for `pending.head`). Reading the flow's own
    // counter would compare 7 > 7 and lose the answer; the claim's recorded baseline compares 7 > 6 and applies it.
    const state = createFlowState({
      run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 3, max_total_rounds: 8, at: AT,
    })
    saveFlow({
      ...state, state: 'idle',
      claim: { head: B, verdict: null, verdict_count: 7, verdict_applied: false, spec_id: null },
      pending: { op_id: 'op-1', kind: 'request_review', target: 'review', head: B, spec_id: null, at: NOW, verdict_baseline: 6 },
    })
    mkdirSync(join(root, 'flows', 'run-1', 'notes', 'inbox'), { recursive: true })
    writeFileSync(stagingPath('run-1', B, 1, root), 'VERDICT: ACCEPT\n')

    const decision = flowTick(readFlow('run-1'), {
      now: NOW + 63_000, head: B, tree_clean: true, dev_pane: 'idle', review_pane: 'idle',
      verdict: 'ACCEPT', verdict_notes: 'MINOR src/a.ts:1 — x', verdict_count: 7, verdict_source: 'pane',
      run_present: true, agents_present: true,
      // A pane answer needs evidence: enough wall time and a finding line.
      verdict_evidence: { elapsed_ms: 60_000, notes_bytes: 40, notes_findings: 1, pane_tool_lines: 2 },
      evidence_policy: { min_seconds: 30, retries: 1 },
    })

    expect(decision.reason).toBe('flow_done')
  })

  it('carries the decision baseline, so the verdict visible before the send is not its answer', () => {
    // `state.claim.verdict_count` was N, but a verdict appeared while the tick was deciding and the decision recorded N+1;
    // that is the number the request is answered against. Six verdicts on screen are not the answer to a request sent with
    // six; the seventh is.
    const B = 'b'.repeat(40)
    const state = createFlowState({
      run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 3, max_total_rounds: 8, at: AT,
    })
    saveFlow({
      ...state, state: 'idle',
      claim: { head: B, verdict: null, verdict_count: 7, verdict_applied: false, spec_id: null },
      pending: { op_id: 'op-1', kind: 'request_review', target: 'review', head: B, spec_id: null, at: NOW, verdict_baseline: 6 },
    })
    const observations = (count: number) => ({
      now: NOW + 63_000, head: B, tree_clean: true, dev_pane: 'idle' as const, review_pane: 'idle' as const,
      verdict: 'ACCEPT' as const, verdict_notes: 'MINOR src/a.ts:1 — x', verdict_count: count, verdict_source: 'pane' as const,
      run_present: true, agents_present: true,
      verdict_evidence: { elapsed_ms: 60_000, notes_bytes: 40, notes_findings: 1, pane_tool_lines: 2 },
      evidence_policy: { min_seconds: 30, retries: 1 },
    })

    // Six: the verdict that was already there when the request left — not an answer.
    expect(flowTick(readFlow('run-1'), observations(6)).reason).toBe('dispatch_pending')
    // Seven: the one that arrived after it.
    expect(flowTick(readFlow('run-1'), observations(7)).reason).toBe('flow_done')
  })

  it('applies the verdict that arrived after the request, measured against its own baseline', () => {
    pendingOnB(5, 6)
    mkdirSync(join(root, 'flows', 'run-1', 'notes', 'inbox'), { recursive: true })
    writeFileSync(stagingPath('run-1', B, 1, root), 'VERDICT: ACCEPT\n')

    const result = stepFlow('run-1', {
      now: NOW + 5_000, at: AT, head: B, tree_clean: true, plan: null,
      ports: ports(() => ({ sent: true }), ''),
      evidence_policy: { min_seconds: 30, retries: 1 },
    })
    expect(result.decision.reason).toBe('flow_done')
    expect(readFlow('run-1').pending).toBeNull()
  })
})

describe('a notes file answers its round whatever the state (block 41)', () => {
  const OLD = 'a'.repeat(40)
  const NEW = 'c'.repeat(40)

  function planOne() {
    const doc = '- [ ] **P1.1** — first'
    const plan = createPlan({ run_id: 'run-1', source_path: 'docs/plan.md', text: doc, now: NOW, at: AT }).plan
    const briefed = attachSpec(plan, {
      id: 'P1.1', text: JSON.stringify({ id: 'P1.1', title: 't', goal: 'g', requirements: ['r'], checks: ['c'], report: ['r'] }),
      format: 'json', spec_path: 'docs/briefs/P1.1.json', now: NOW, at: AT,
    }).plan
    mkdirSync(dirname(planPath('run-1')), { recursive: true })
    savePlan(briefed)
    return briefed
  }

  it('case A: the claim is on an older head, the answer is for the commit that was reviewed', () => {
    // `landing-one`: the flow went back to `idle` with `claim.head = a933d44`, the reviewer wrote the verdict for `47884a4`,
    // and every tick asked for the review again.
    planOne()
    const state = createFlowState({
      run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 3, max_total_rounds: 8, at: AT,
    })
    saveFlow({ ...state, state: 'idle', rounds: 1, active_plan_item: 'P1.1', claim: { head: OLD, verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null } })
    mkdirSync(join(root, 'flows', 'run-1', 'notes', 'inbox'), { recursive: true })
    writeFileSync(stagingPath('run-1', NEW, 2, root), 'VERDICT: ACCEPT\n')

    const sent: string[] = []
    const result = stepFlow('run-1', {
      now: NOW, at: AT, head: NEW, tree_clean: true,
      ports: ports((_pane, text) => { sent.push(text); return { sent: true } }),
      evidence_policy: { min_seconds: 30, retries: 1 },
    })

    // Applied, not re-requested; the claim moved to the head the reviewer actually read.
    expect(result.decision.kind).not.toBe('request_review')
    expect(sent).toHaveLength(0)
    expect(readFlow('run-1').claim.head).toBe(NEW)
    expect(readPlan('run-1').items.find(item => item.id === 'P1.1')!.status).toBe('done')
    const log = readFlow('run-1').log
    expect(log.some(entry => entry.event === 'settled_by_observation')).toBe(true)
    expect(log.some(entry => entry.detail.includes('ACCEPT'))).toBe(true)
  })

  it('case B: the claim is on the right head, the flow is idle, and the item is not dispatched again', () => {
    // `landing-ten`: `claim.head` was correct and the file was beside it, yet the tick dispatched the item again.
    planOne()
    const state = createFlowState({
      run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 3, max_total_rounds: 8, at: AT,
    })
    saveFlow({ ...state, state: 'idle', rounds: 1, active_plan_item: 'P1.1', claim: { head: NEW, verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null } })
    mkdirSync(join(root, 'flows', 'run-1', 'notes', 'inbox'), { recursive: true })
    writeFileSync(stagingPath('run-1', NEW, 2, root), 'VERDICT: ACCEPT\n')

    const sent: string[] = []
    const result = stepFlow('run-1', {
      now: NOW, at: AT, head: NEW, tree_clean: true,
      ports: ports((_pane, text) => { sent.push(text); return { sent: true } }),
      evidence_policy: { min_seconds: 30, retries: 1 },
    })

    expect(result.decision.kind).not.toBe('dispatch_spec')
    expect(sent).toHaveLength(0)
    expect(readPlan('run-1').items.find(item => item.id === 'P1.1')!.status).toBe('done')
  })

  it('closes the item even when the marker already says "applied" but the mirror still shows it open', () => {
    // `landing-ten` after the first repair: `verdict_applied: true`, `verdict_handled_item: P2.1`, and `P2.1: in_work`. The marker
    // described bookkeeping that had not happened; the open item is the close still owed.
    const briefed = planOne()
    savePlan({ ...briefed, items: briefed.items.map(item => ({ ...item, status: 'in_work' as const })) })
    const state = createFlowState({
      run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 3, max_total_rounds: 8, at: AT,
    })
    saveFlow({
      ...state, state: 'idle', rounds: 0, active_plan_item: 'P1.1',
      claim: { head: NEW, verdict: 'ACCEPT', verdict_count: 1, verdict_applied: true, spec_id: null },
      verdict_handled_for: NEW, verdict_handled_item: 'P1.1',
    })
    // The answer is on disk as the published record of that round — which is what the live run had.
    mkdirSync(join(root, 'flows', 'run-1', 'notes'), { recursive: true })
    writeFileSync(join(root, 'flows', 'run-1', 'notes', `${NEW}-r1.md`), 'VERDICT: ACCEPT\n')

    stepFlow('run-1', {
      now: NOW, at: AT, head: NEW, tree_clean: true, ports: ports(() => ({ sent: true })),
      evidence_policy: { min_seconds: 0, retries: 1 },
    })

    expect(readPlan('run-1').items.find(item => item.id === 'P1.1')!.status).toBe('done')
  })

  it('with no file, the tick behaves exactly as before', () => {
    // The item is in flight (as the runner writes it after a dispatch), so the unchanged behaviour is a hold.
    const briefed = planOne()
    savePlan({ ...briefed, items: briefed.items.map(item => ({ ...item, status: 'in_work' as const })) })
    const state = createFlowState({
      run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 3, max_total_rounds: 8, at: AT,
    })
    saveFlow({ ...state, state: 'idle', rounds: 1, active_plan_item: 'P1.1', claim: { head: NEW, verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null } })

    const sent: string[] = []
    const result = stepFlow('run-1', {
      now: NOW, at: AT, head: NEW, tree_clean: true,
      ports: ports((_pane, text) => { sent.push(text); return { sent: true } }),
      evidence_policy: { min_seconds: 30, retries: 1 },
    })
    expect(result.decision.reason).toBe('head_unchanged')
    expect(sent).toHaveLength(0)
    expect(readFlow('run-1').log.some(entry => entry.event === 'settled_by_observation')).toBe(false)
  })
})

describe('an item is closed by its own commit, not by whichever commit arrives (block 44)', () => {
  function planOf(ids: string[]) {
    const doc = ids.map(id => `- [ ] **${id}** — ${id}`).join('\n')
    let plan = createPlan({ run_id: 'run-1', source_path: 'docs/plan.md', text: doc, now: NOW, at: AT }).plan
    for (const id of ids) {
      plan = attachSpec(plan, {
        id, text: JSON.stringify({ id, title: id, goal: 'g', requirements: ['r'], checks: ['c'], report: ['r'] }),
        format: 'json', spec_path: `docs/briefs/${id}.json`, now: NOW, at: AT,
      }).plan
    }
    mkdirSync(dirname(planPath('run-1')), { recursive: true })
    savePlan(plan)
    return plan
  }

  const commit = (index: number) => String(index).repeat(40).slice(0, 40)

  function dispatchAndClose(itemId: string, head: string): void {
    // What the runner does across two ticks: the item's brief goes out (the claim records it), then its own commit is accepted.
    const state = createFlowState({
      run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 3, max_total_rounds: 20, at: AT,
    })
    saveFlow({
      ...state, state: 'reviewing', rounds: 1, active_plan_item: itemId, review_started_at: NOW - 60_000,
      claim: { head, verdict: null, verdict_count: 0, verdict_applied: false, spec_id: itemId },
    })
    mkdirSync(join(root, 'flows', 'run-1', 'notes', 'inbox'), { recursive: true })
    writeFileSync(stagingPath('run-1', head, 2, root), 'VERDICT: ACCEPT\n')
    stepFlow('run-1', {
      now: NOW, at: AT, head, tree_clean: true, ports: ports(() => ({ sent: true })),
      evidence_policy: { min_seconds: 30, retries: 1 },
    })
  }

  it('closes each item with its own commit, and never two items with one commit', () => {
    planOf(['P1.1', 'P1.2', 'P1.3'])
    dispatchAndClose('P1.1', commit(1))
    dispatchAndClose('P1.2', commit(2))
    dispatchAndClose('P1.3', commit(3))

    const plan = readPlan('run-1')
    const byId = new Map(plan.items.map(item => [item.id, item]))
    expect(byId.get('P1.1')!.head).toBe(commit(1))
    expect(byId.get('P1.2')!.head).toBe(commit(2))
    expect(byId.get('P1.3')!.head).toBe(commit(3))
    expect(plan.items.filter(item => item.status === 'done')).toHaveLength(3)
  })

  it('closes the item whose brief was sent, even when another item is the active one', () => {
    // The live binding error in one tick: `active_plan_item` had already moved on, so the close landed on the wrong row.
    planOf(['P1.1', 'P1.2'])
    const state = createFlowState({
      run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 3, max_total_rounds: 20, at: AT,
    })
    saveFlow({
      ...state, state: 'reviewing', rounds: 1, active_plan_item: 'P1.2', review_started_at: NOW - 60_000,
      claim: { head: commit(1), verdict: null, verdict_count: 0, verdict_applied: false, spec_id: 'P1.1' },
    })
    mkdirSync(join(root, 'flows', 'run-1', 'notes', 'inbox'), { recursive: true })
    writeFileSync(stagingPath('run-1', commit(1), 2, root), 'VERDICT: ACCEPT\n')

    stepFlow('run-1', {
      now: NOW, at: AT, head: commit(1), tree_clean: true, ports: ports(() => ({ sent: true })),
      evidence_policy: { min_seconds: 30, retries: 1 },
    })

    const plan = readPlan('run-1')
    expect(plan.items.find(item => item.id === 'P1.1')!.status).toBe('done')
    expect(plan.items.find(item => item.id === 'P1.2')!.status).not.toBe('done')
  })

  it('refuses a second item on a commit that already closed one, reports it once, and keeps the flow alive', () => {
    // The live run: ACCEPT on `b14896c` closed P2.1, then the same commit closed P2.2 as well — the header went into the next
    // commit, which closed P2.3 ("About"), a section nobody wrote. The guard refuses the second close; escalating would make a
    // resumed run unresumable, because `done` is terminal and the historical state never changes (block 45).
    planOf(['P1.1', 'P1.2'])
    dispatchAndClose('P1.1', commit(1))

    const state = createFlowState({
      run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 3, max_total_rounds: 20, at: AT,
    })
    saveFlow({
      ...state, state: 'reviewing', rounds: 1, active_plan_item: 'P1.2', review_started_at: NOW - 60_000,
      claim: { head: commit(1), verdict: null, verdict_count: 1, verdict_applied: false, spec_id: 'P1.2' },
    })
    mkdirSync(join(root, 'flows', 'run-1', 'notes', 'inbox'), { recursive: true })
    writeFileSync(stagingPath('run-1', commit(1), 2, root), 'VERDICT: ACCEPT\n')

    const result = stepFlow('run-1', {
      now: NOW, at: AT, head: commit(1), tree_clean: true, ports: ports(() => ({ sent: true })),
      evidence_policy: { min_seconds: 30, retries: 1 },
    })

    expect(result.decision.reason).toBe('plan_item_double_close')
    // Not escalated: the round is refused, the flow stays where it was, and the item is not closed by somebody else's commit.
    expect(readFlow('run-1').state).not.toBe('escalated')
    expect(readPlan('run-1').items.find(item => item.id === 'P1.2')!.status).not.toBe('done')
    // Reported once, and recorded in the plan so the next tick treats it as history.
    expect(readFlow('run-1').log.filter(entry => entry.event === 'plan_item_double_close')).toHaveLength(1)
    expect(readPlan('run-1').conflicts.some(conflict => conflict.kind === 'plan_item_double_close')).toBe(true)

    // The next tick does not repeat it, and the flow can start the next item.
    stepFlow('run-1', {
      now: NOW + 5_000, at: AT, head: commit(1), tree_clean: true, ports: ports(() => ({ sent: true })),
      evidence_policy: { min_seconds: 30, retries: 1 },
    })
    // The refuse is not repeated in the journal: the guard keeps refusing, but it stops reporting.
    expect(readFlow('run-1').log.filter(entry => entry.event === 'plan_item_double_close')).toHaveLength(1)
  })
})

describe('the item binding survives the review request (block 45)', () => {
  it('keeps spec_id through dispatch → review → ACCEPT, and closes that item', () => {
    const doc = ['- [ ] **P1.1** — first', '- [ ] **P1.2** — second'].join('\n')
    let plan = createPlan({ run_id: 'run-1', source_path: 'docs/plan.md', text: doc, now: NOW, at: AT }).plan
    for (const id of ['P1.1', 'P1.2']) {
      plan = attachSpec(plan, {
        id, text: JSON.stringify({ id, title: id, goal: 'g', requirements: ['r'], checks: ['c'], report: ['r'] }),
        format: 'json', spec_path: `docs/briefs/${id}.json`, now: NOW, at: AT,
      }).plan
    }
    mkdirSync(dirname(planPath('run-1')), { recursive: true })
    savePlan(plan)

    const head = 'd'.repeat(40)
    const state = createFlowState({
      run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 3, max_total_rounds: 8, at: AT,
    })
    // The dispatch: P1.1's brief goes out and the claim records it. The head has not moved, so the plan bootstraps.
    const start = { ...state, state: 'idle' as const, claim: { head: 'c'.repeat(40), verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null } }
    const dispatched = flowTick(start, {
      now: NOW, head: 'c'.repeat(40), tree_clean: true, dev_pane: 'idle', review_pane: 'idle',
      verdict: null, verdict_notes: '', verdict_count: 0, verdict_source: 'pane',
      run_present: true, agents_present: true, evidence_policy: { min_seconds: 0, retries: 1 },
      plan: planTickView(readPlan('run-1'), { perItem: 3, total: 8 }),
    } as never)
    expect(dispatched.reason).toBe('plan_item_dispatched')
    expect(dispatched.next_claim.spec_id).toBe('P1.1')

    // The review request that follows must not forget it.
    saveFlow(applyDecisionToState(start, dispatched, AT))
    const claimed = readFlow('run-1')
    const review = flowTick(claimed, {
      now: NOW + 1_000, head, tree_clean: true, dev_pane: 'idle', review_pane: 'idle',
      verdict: null, verdict_notes: '', verdict_count: 0, verdict_source: 'pane',
      run_present: true, agents_present: true, evidence_policy: { min_seconds: 0, retries: 1 },
      plan: planTickView(readPlan('run-1'), { perItem: 3, total: 8 }),
    } as never)
    expect(review.kind).toBe('request_review')
    expect(review.next_claim.spec_id).toBe('P1.1')

    // And the ACCEPT closes exactly that item.
    saveFlow({ ...applyDecisionToState(claimed, review, AT), review_started_at: NOW - 60_000 })
    mkdirSync(join(root, 'flows', 'run-1', 'notes', 'inbox'), { recursive: true })
    writeFileSync(stagingPath('run-1', head, 1, root), 'VERDICT: ACCEPT\n')
    stepFlow('run-1', {
      now: NOW + 61_000, at: AT, head, tree_clean: true, ports: ports(() => ({ sent: true })),
      evidence_policy: { min_seconds: 30, retries: 1 },
    })

    const closed = readPlan('run-1').items.find(item => item.id === 'P1.1')!
    expect(closed.status).toBe('done')
    expect(closed.head).toBe(head)
  })
})

describe('a historical double close does not block the run (block 45, defect 3)', () => {
  it('reports it once, refuses that close, and lets the plan continue after a resume', () => {
    const doc = ['- [ ] **P1.1** — first', '- [ ] **P1.2** — second'].join('\n')
    let plan = createPlan({ run_id: 'run-1', source_path: 'docs/plan.md', text: doc, now: NOW, at: AT }).plan
    for (const id of ['P1.1', 'P1.2']) {
      plan = attachSpec(plan, {
        id, text: JSON.stringify({ id, title: id, goal: 'g', requirements: ['r'], checks: ['c'], report: ['r'] }),
        format: 'json', spec_path: `docs/briefs/${id}.json`, now: NOW, at: AT,
      }).plan
    }
    const head = 'e'.repeat(40)
    // History: P1.1 is already closed on that commit, and the conflict was recorded when it happened.
    const conflicted = {
      ...plan,
      items: plan.items.map(item => (item.id === 'P1.1' ? { ...item, status: 'done' as const, head } : item)),
      conflicts: [{ at: AT, item_id: 'P1.2', kind: 'plan_item_double_close' as const, detail: `${head.slice(0, 7)} already closed P1.1` }],
    }
    mkdirSync(dirname(planPath('run-1')), { recursive: true })
    savePlan(conflicted)

    const state = createFlowState({
      run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 3, max_total_rounds: 8, at: AT,
    })
    saveFlow({
      ...state, state: 'idle', rounds: 1, active_plan_item: 'P1.2',
      claim: { head, verdict: 'ACCEPT', verdict_count: 1, verdict_applied: false, spec_id: 'P1.2' },
    })
    mkdirSync(join(root, 'flows', 'run-1', 'notes'), { recursive: true })
    writeFileSync(join(root, 'flows', 'run-1', 'notes', `${head}-r1.md`), 'VERDICT: ACCEPT\n')

    const sent: string[] = []
    stepFlow('run-1', {
      now: NOW, at: AT, head, tree_clean: true,
      ports: ports((_pane, text) => { sent.push(text); return { sent: true } }),
      evidence_policy: { min_seconds: 0, retries: 1 },
    })

    // Not escalated, no second report, and the flow is free to work on the next item.
    expect(readFlow('run-1').state).not.toBe('escalated')
    // Reported once (this tick), refused, and the item is not closed by somebody else's commit.
    // Reported once: the refusal itself on the tick that saw it, and only a requeue line on the ticks that follow (block 45, defect
    // 3 — and block 81, which keeps the binding of a round's own item and puts back only a *stale* one).
    const refusalLines = new Set(readFlow('run-1').log
      .filter(entry => entry.event === 'plan_item_double_close' || entry.event === 'plan_item_requeued')
      .map(entry => `${entry.event}:${entry.detail}`))
    expect(refusalLines.size).toBe(1)
    expect(readPlan('run-1').items.find(item => item.id === 'P1.2')!.status).not.toBe('done')

    // The refused item went back to the queue rather than staying "in flight" — that is what kept a resumed run from starting the
    // next item at all.
    expect(readPlan('run-1').items.find(item => item.id === 'P1.2')!.status).toBe('queued')

    // A second tick refuses again but says nothing more, and the flow is free to move.
    stepFlow('run-1', {
      now: NOW + 5_000, at: AT, head, tree_clean: true, ports: ports(() => ({ sent: true })),
      evidence_policy: { min_seconds: 0, retries: 1 },
    })
    const lines = new Set(readFlow('run-1').log
      .filter(entry => entry.event === 'plan_item_double_close' || entry.event === 'plan_item_requeued')
      .map(entry => `${entry.event}:${entry.detail}`))
    expect(lines.size).toBe(1)
  })
})

describe('the settle closes the item the claim names (block 46)', () => {
  it('prefers claim.spec_id when it disagrees with active_plan_item', () => {
    const doc = ['- [ ] **P1.1** — first', '- [ ] **P1.2** — second'].join('\n')
    let plan = createPlan({ run_id: 'run-1', source_path: 'docs/plan.md', text: doc, now: NOW, at: AT }).plan
    for (const id of ['P1.1', 'P1.2']) {
      plan = attachSpec(plan, {
        id, text: JSON.stringify({ id, title: id, goal: 'g', requirements: ['r'], checks: ['c'], report: ['r'] }),
        format: 'json', spec_path: `docs/briefs/${id}.json`, now: NOW, at: AT,
      }).plan
    }
    mkdirSync(dirname(planPath('run-1')), { recursive: true })
    savePlan({ ...plan, items: plan.items.map(item => ({ ...item, status: 'in_work' as const })) })

    const head = 'f'.repeat(40)
    const state = createFlowState({
      run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 3, max_total_rounds: 8, at: AT,
    })
    // The claim says P1.1; the field says P1.2. The claim wins — it is the item whose brief was dispatched.
    saveFlow({
      ...state, state: 'idle', rounds: 0, active_plan_item: 'P1.2',
      claim: { head, verdict: 'ACCEPT', verdict_count: 1, verdict_applied: false, spec_id: 'P1.1' },
    })
    mkdirSync(join(root, 'flows', 'run-1', 'notes'), { recursive: true })
    writeFileSync(join(root, 'flows', 'run-1', 'notes', `${head}-r1.md`), 'VERDICT: ACCEPT\n')

    stepFlow('run-1', {
      now: NOW, at: AT, head, tree_clean: true, ports: ports(() => ({ sent: true })),
      evidence_policy: { min_seconds: 0, retries: 1 },
    })

    const items = readPlan('run-1').items
    expect(items.find(item => item.id === 'P1.1')!.status).toBe('done')
    expect(items.find(item => item.id === 'P1.2')!.status).not.toBe('done')
  })

  it('starts the next item after a resume that follows a refused double close', () => {
    // `landing-ten`: the refusal left the item `in_work`, so after `flow resume` the picker believed a task was running and did
    // nothing at all.
    const doc = ['- [ ] **P1.1** — first', '- [ ] **P1.2** — second', '- [ ] **P1.3** — third'].join('\n')
    let plan = createPlan({ run_id: 'run-1', source_path: 'docs/plan.md', text: doc, now: NOW, at: AT }).plan
    for (const id of ['P1.1', 'P1.2', 'P1.3']) {
      plan = attachSpec(plan, {
        id, text: JSON.stringify({ id, title: id, goal: 'g', requirements: ['r'], checks: ['c'], report: ['r'] }),
        format: 'json', spec_path: `docs/briefs/${id}.json`, now: NOW, at: AT,
      }).plan
    }
    const head = 'g'.repeat(40)
    mkdirSync(dirname(planPath('run-1')), { recursive: true })
    savePlan({
      ...plan,
      items: plan.items.map(item => (item.id === 'P1.1'
        ? { ...item, status: 'done' as const, head }
        : { ...item, status: 'in_work' as const })),
      conflicts: [{ at: AT, item_id: 'P1.2', kind: 'plan_item_double_close' as const, detail: 'historical' }],
    })

    const state = createFlowState({
      run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 3, max_total_rounds: 8, at: AT,
    })
    saveFlow({
      ...state, state: 'idle', rounds: 0, active_plan_item: 'P1.2',
      claim: { head, verdict: 'ACCEPT', verdict_count: 1, verdict_applied: false, spec_id: 'P1.2' },
    })
    mkdirSync(join(root, 'flows', 'run-1', 'notes'), { recursive: true })
    writeFileSync(join(root, 'flows', 'run-1', 'notes', `${head}-r1.md`), 'VERDICT: ACCEPT\n')

    stepFlow('run-1', {
      now: NOW, at: AT, head, tree_clean: true, ports: ports(() => ({ sent: true })),
      evidence_policy: { min_seconds: 0, retries: 1 },
    })
    stepFlow('run-1', {
      now: NOW + 5_000, at: AT, head, tree_clean: true, ports: ports(() => ({ sent: true })),
      evidence_policy: { min_seconds: 0, retries: 1 },
    })

    // The item whose round this is stays bound — block 81's rule, which the review of round 1 made unconditional: a repeated
    // refusal may not erase the binding (and with it the item's rounds) again. What keeps a resumed run moving is that the item is
    // genuinely the one in flight, not that it was parked in `queued`.
    const items = readPlan('run-1').items
    expect(items.find(item => item.id === 'P1.2')!.status).toBe('in_work')
    expect(readFlow('run-1').active_plan_item).toBe('P1.2')
    expect(items.find(item => item.id === 'P1.3')!.status).not.toBe('queued')
    // One fact, however many ticks read it: the refusal (or, once it is history, the requeue that tidies the binding).
    const refusalLines = new Set(readFlow('run-1').log
      .filter(entry => entry.event === 'plan_item_double_close' || entry.event === 'plan_item_requeued')
      .map(entry => `${entry.event}:${entry.detail}`))
    expect(refusalLines.size).toBe(1)
  })
})

describe('a pointer, not the brief, goes to the dev (block 47)', () => {
  it('sends a short pointer with the brief path, not the brief body', () => {
    // A markdown brief: its body is the long part, which is exactly what used to be pasted into the panel.
    const body = ['# P1.1 — first', ...Array.from({ length: 30 }, (_, i) => `  line ${i + 1} of the brief body`)].join('\n')
    const doc = '- [ ] **P1.1** — first'
    let plan = createPlan({ run_id: 'run-1', source_path: 'docs/plan.md', text: doc, now: NOW, at: AT }).plan
    plan = attachSpec(plan, {
      id: 'P1.1', text: body, format: 'markdown', spec_path: 'docs/briefs/P1.1.md', now: NOW, at: AT,
    }).plan
    mkdirSync(dirname(planPath('run-1')), { recursive: true })
    savePlan(plan)

    const state = createFlowState({
      run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 3, max_total_rounds: 8, at: AT,
    })
    saveFlow({ ...state, state: 'idle', claim: { head: 'a'.repeat(40), verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null } })

    const sent: string[] = []
    stepFlow('run-1', {
      now: NOW, at: AT, head: 'a'.repeat(40), tree_clean: true,
      ports: ports((_pane, text) => { sent.push(text); return { sent: true } }),
      evidence_policy: { min_seconds: 0, retries: 1 },
    })

    const message = sent[0]!
    // Short enough to survive a composer, and it names the file rather than pasting it.
    expect(message.length).toBeLessThanOrEqual(400)
    expect(message).toContain('docs/briefs/P1.1.md')
    expect(message).not.toContain('line 30 of the brief body')
  })
})

describe('a spec queued by hand gets the same pointer (block 52)', () => {
  it('sends a short pointer with the conventional brief path, never the body', () => {
    const body = ['# S1 — a block with no plan', ...Array.from({ length: 30 }, (_, i) => `  line ${i + 1} of the block body`)].join('\n')
    const state = createFlowState({
      run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 3, max_total_rounds: 8, at: AT,
    })
    const spec = {
      id: 'S1', title: 'a block with no plan', goal: '', requirements: [], checks: [], report: [],
      body, unstructured: true,
    }
    saveFlow({
      ...state, state: 'idle', specs: [spec], dispatched_specs: [],
      claim: { head: 'a'.repeat(40), verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null },
    })

    const sent: string[] = []
    stepFlow('run-1', {
      now: NOW, at: AT, head: 'a'.repeat(40), tree_clean: true,
      ports: ports((_pane, text) => { sent.push(text); return { sent: true } }),
      evidence_policy: { min_seconds: 0, retries: 1 },
    })

    expect(sent).toHaveLength(1)
    const message = sent[0]!
    expect(message.length).toBeLessThanOrEqual(400)
    expect(message).toContain('docs/briefs/S1.md')
    expect(message).not.toContain('line 30 of the block body')
    expect(message).not.toContain('Full specification:')
  })
})

describe('a spec handed to flow start --spec names the file it was given (block 54)', () => {
  it('points at the operator file, not at a conventional path that may not exist', () => {
    // The flow is started the way the CLI starts it — `startFlow` with `specs` — so `source_path` is whatever the engine records when it
    // reads the file, not a value this test wrote into the state by hand (block 55, MINOR). Then one tick sends the pointer.
    mkdirSync(join(root, 'briefs'), { recursive: true })
    const brief = join(root, 'briefs', 'my-brief.md')
    writeFileSync(brief, ['# MY BRIEF', '', '- [ ] do the thing', ''].join('\n'))

    const started = startFlow(
      { run_id: 'run-1', dev: 'dev-1', review: 'rev-1', specs: [brief] },
      { head: 'a'.repeat(40) },
    )
    const queued = readFlow('run-1').specs[0]!
    // The path the engine recorded is the file the operator pointed at, and it is absolute on disk.
    expect(queued.source_path).toBe(brief)
    expect(started.state.state).toBe('idle')

    const sent: string[] = []
    stepFlow('run-1', {
      now: NOW, at: AT, head: 'a'.repeat(40), tree_clean: true,
      ports: ports((_pane, text) => { sent.push(text); return { sent: true } }),
      evidence_policy: { min_seconds: 0, retries: 1 },
    })

    expect(sent).toHaveLength(1)
    const message = sent[0]!
    // The operator's file, named the way the message names paths — relative to the repository it lives in — and never the guess.
    expect(message).toContain('briefs/my-brief.md')
    expect(message).not.toContain('docs/briefs/')
    expect(message).not.toContain(root)
    expect(message.length).toBeLessThanOrEqual(400)
  })

  it('keeps the repository-relative path for a plan item', () => {
    const doc = '- [ ] **P1.1** — first'
    let plan = createPlan({ run_id: 'run-1', source_path: 'docs/plan.md', text: doc, now: NOW, at: AT }).plan
    plan = attachSpec(plan, {
      id: 'P1.1', text: JSON.stringify({ id: 'P1.1', title: 't', goal: 'g', requirements: ['r'], checks: ['c'], report: ['r'] }),
      format: 'json', spec_path: 'docs/briefs/P1.1.md', now: NOW, at: AT,
    }).plan
    mkdirSync(dirname(planPath('run-1')), { recursive: true })
    savePlan(plan)

    const state = createFlowState({
      run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 3, max_total_rounds: 8, at: AT,
    })
    saveFlow({ ...state, state: 'idle', claim: { head: 'b'.repeat(40), verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null } })

    const sent: string[] = []
    stepFlow('run-1', {
      now: NOW, at: AT, head: 'b'.repeat(40), tree_clean: true,
      ports: ports((_pane, text) => { sent.push(text); return { sent: true } }),
      evidence_policy: { min_seconds: 0, retries: 1 },
    })
    expect(sent[0]).toContain('docs/briefs/P1.1.md')
  })
})

describe('an answer that arrives after an unconfirmed send is still applied (block 47)', () => {
  it('closes the item whose verdict is recorded, even though the marker says applied', () => {
    // `landing-ten`: `claim.head = 5badf48`, `verdict: ACCEPT`, `verdict_applied: true`, `P2.3b` still in flight, flow escalated —
    // the send was unconfirmed, the reviewer answered anyway, and nothing applied the answer.
    const doc = '- [ ] **P1.1** — first'
    let plan = createPlan({ run_id: 'run-1', source_path: 'docs/plan.md', text: doc, now: NOW, at: AT }).plan
    plan = attachSpec(plan, {
      id: 'P1.1', text: JSON.stringify({ id: 'P1.1', title: 't', goal: 'g', requirements: ['r'], checks: ['c'], report: ['r'] }),
      format: 'json', spec_path: 'docs/briefs/P1.1.json', now: NOW, at: AT,
    }).plan
    mkdirSync(dirname(planPath('run-1')), { recursive: true })
    savePlan({ ...plan, items: plan.items.map(item => ({ ...item, status: 'in_work' as const })) })

    const head = 'h'.repeat(40)
    const state = createFlowState({
      run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 3, max_total_rounds: 8, at: AT,
    })
    saveFlow({
      ...state, state: 'idle', rounds: 0, active_plan_item: 'P1.1',
      claim: { head, verdict: 'ACCEPT', verdict_count: 1, verdict_applied: true, spec_id: 'P1.1' },
    })

    stepFlow('run-1', {
      now: NOW, at: AT, head, tree_clean: true, ports: ports(() => ({ sent: true })),
      evidence_policy: { min_seconds: 0, retries: 1 },
    })

    expect(readPlan('run-1').items.find(item => item.id === 'P1.1')!.status).toBe('done')
    expect(readFlow('run-1').state).not.toBe('escalated')
  })

})

describe('a resume keeps an answer the flow still owes (block 48)', () => {
  it('closes the bound item after escalation → resume, and does not escalate again', () => {
    const doc = '- [ ] **P1.1** — first'
    let plan = createPlan({ run_id: 'run-1', source_path: 'docs/plan.md', text: doc, now: NOW, at: AT }).plan
    plan = attachSpec(plan, {
      id: 'P1.1', text: JSON.stringify({ id: 'P1.1', title: 't', goal: 'g', requirements: ['r'], checks: ['c'], report: ['r'] }),
      format: 'json', spec_path: 'docs/briefs/P1.1.json', now: NOW, at: AT,
    }).plan
    mkdirSync(dirname(planPath('run-1')), { recursive: true })
    savePlan({ ...plan, items: plan.items.map(item => ({ ...item, status: 'in_work' as const })) })

    const head = 'l'.repeat(40)
    const state = createFlowState({
      run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 3, max_total_rounds: 8, at: AT,
    })
    saveFlow({
      ...state, state: 'escalated', rounds: 0, active_plan_item: 'P1.1',
      claim: { head, verdict: 'ACCEPT', verdict_count: 1, verdict_applied: false, spec_id: 'P1.1' },
    })

    resumeFlow('run-1')

    // The answer and its binding survived the resume.
    const resumed = readFlow('run-1')
    expect(resumed.claim.verdict).toBe('ACCEPT')
    expect(resumed.claim.spec_id).toBe('P1.1')
    expect(resumed.claim.head).toBe(head)

    stepFlow('run-1', {
      now: NOW, at: AT, head, tree_clean: true, ports: ports(() => ({ sent: true })),
      evidence_policy: { min_seconds: 0, retries: 1 },
    })

    expect(readPlan('run-1').items.find(item => item.id === 'P1.1')!.status).toBe('done')
    expect(readFlow('run-1').state).not.toBe('escalated')
  })
})

describe('a resume keeps an answer whose item is still open (block 50)', () => {
  it('closes the bound item after escalation → resume even when the marker says applied', () => {
    // The marker and the item disagree — `verdict_applied: true` while `P1.1` is still in flight. The settle treats that as "the close is
    // still due", so `resume` must not reset the claim on it.
    const doc = '- [ ] **P1.1** — first'
    let plan = createPlan({ run_id: 'run-1', source_path: 'docs/plan.md', text: doc, now: NOW, at: AT }).plan
    plan = attachSpec(plan, {
      id: 'P1.1', text: JSON.stringify({ id: 'P1.1', title: 't', goal: 'g', requirements: ['r'], checks: ['c'], report: ['r'] }),
      format: 'json', spec_path: 'docs/briefs/P1.1.json', now: NOW, at: AT,
    }).plan
    mkdirSync(dirname(planPath('run-1')), { recursive: true })
    savePlan({ ...plan, items: plan.items.map(item => ({ ...item, status: 'in_work' as const })) })

    const head = 'm'.repeat(40)
    const state = createFlowState({
      run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 3, max_total_rounds: 8, at: AT,
    })
    saveFlow({
      ...state, state: 'escalated', rounds: 0, active_plan_item: 'P1.1',
      claim: { head, verdict: 'ACCEPT', verdict_count: 1, verdict_applied: true, spec_id: 'P1.1' },
    })

    resumeFlow('run-1')

    const resumed = readFlow('run-1')
    expect(resumed.claim.verdict).toBe('ACCEPT')
    expect(resumed.claim.spec_id).toBe('P1.1')

    stepFlow('run-1', {
      now: NOW, at: AT, head, tree_clean: true, ports: ports(() => ({ sent: true })),
      evidence_policy: { min_seconds: 0, retries: 1 },
    })

    expect(readPlan('run-1').items.find(item => item.id === 'P1.1')!.status).toBe('done')
    expect(readFlow('run-1').state).not.toBe('escalated')
  })
})

describe('legacy state without verdict_applied (MAJOR 3)', () => {
  function legacy(extra: { handled?: string | null }): void {
    const state = createFlowState({
      run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 3, max_total_rounds: 8, at: AT,
    })
    saveFlow({ ...state, state: 'idle', active_plan_item: 'P1.1', claim: { head: HEAD, verdict: 'ACCEPT', verdict_count: 2, verdict_applied: false, spec_id: null } })
    const file = join(root, 'flows', 'run-1.json')
    const raw = JSON.parse(readFileSync(file, 'utf-8')) as Record<string, unknown> & { claim: Record<string, unknown> }
    delete raw.claim.verdict_applied
    raw.verdict_handled_for = extra.handled === undefined ? HEAD : extra.handled
    raw.verdict_handled_item = 'P1.1'
    writeFileSync(file, JSON.stringify(raw))
  }

  it('reads a legacy file whose answer was already applied as applied', () => {
    legacy({ handled: HEAD })
    expect(readFlow('run-1').claim.verdict_applied).toBe(true)
  })

  it('applies a legacy verdict that has no trace of being used — once', () => {
    legacy({ handled: null })
    expect(readFlow('run-1').claim.verdict_applied).toBe(false)
  })
})

describe('a closed item must not stay in flight (D11)', () => {
  function planWithTwo(briefed: string[]) {
    const doc = ['- [ ] **P1.1** — first', '- [ ] **P1.2** — second'].join('\n')
    let plan = createPlan({ run_id: 'run-1', source_path: 'docs/plan.md', text: doc, now: NOW, at: AT }).plan
    for (const id of briefed) {
      plan = attachSpec(plan, {
        id, text: JSON.stringify({ id, title: id, goal: 'g', requirements: ['r'], checks: ['c'], report: ['r'] }),
        format: 'json', spec_path: `docs/briefs/${id}.json`, now: NOW, at: AT,
      }).plan
    }
    mkdirSync(dirname(planPath('run-1')), { recursive: true })
    return plan
  }

  function idleNaming(id: string | null): void {
    const state = createFlowState({
      run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 3, max_total_rounds: 8, at: AT,
    })
    saveFlow({ ...state, state: 'idle', active_plan_item: id, claim: { head: HEAD, verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null } })
  }

  it('starts the next briefed item when the recorded active one is already done', () => {
    // The sandbox: `P1.1: done` in the mirror, the flow still naming it, `P1.2` queued with a brief — and every tick answered
    // `head_unchanged` because `active_plan_item` "meant" work was in flight.
    const plan = planWithTwo(['P1.1', 'P1.2'])
    savePlan({ ...plan, items: plan.items.map(item => (item.id === 'P1.1' ? { ...item, status: 'done' as const, head: HEAD } : item)) })
    idleNaming('P1.1')
    const sent: string[] = []

    const result = stepFlow('run-1', {
      now: NOW, at: AT, head: HEAD, tree_clean: true,
      ports: ports((_pane, text) => { sent.push(text); return { sent: true } }),
      evidence_policy: { min_seconds: 0, retries: 1 },
    })

    expect(result.decision.reason).toBe('plan_item_dispatched')
    expect(sent).toHaveLength(1)
    expect(readFlow('run-1').active_plan_item).toBe('P1.2')
    expect(readFlow('run-1').log.some(entry => entry.event === 'stale_active_item_cleared')).toBe(true)
  })

  it('does not hand a queued stale id to the picker, so the first ready item is not skipped', () => {
    // The mirror can lag: the item was closed and the flow still names it, and that item is `queued` again (a re-imported
    // document). It is not in flight, so it must not be skipped — the picker takes it (it is the first ready item), which is
    // exactly what "skip only what is really running" means (block 38, MAJOR 1).
    const plan = planWithTwo(['P1.1', 'P1.2'])
    savePlan({ ...plan, items: plan.items.map(item => (item.id === 'P1.1' ? { ...item, status: 'queued' as const } : item)) })
    idleNaming('P1.1')
    const sent: string[] = []

    const result = stepFlow('run-1', {
      now: NOW, at: AT, head: HEAD, tree_clean: true,
      ports: ports((_pane, text) => { sent.push(text); return { sent: true } }),
      evidence_policy: { min_seconds: 0, retries: 1 },
    })

    // The first ready item was taken — not jumped over because the field happened to name it.
    expect(result.decision.reason).toBe('plan_item_dispatched')
    expect(readFlow('run-1').active_plan_item).toBe('P1.1')
    expect(sent).toHaveLength(1)
    // One recovery record, and the decision keeps its own event.
    const log = readFlow('run-1').log
    expect(log.filter(entry => entry.event === 'stale_active_item_cleared')).toHaveLength(1)
    expect(log.some(entry => entry.event === 'dispatch_spec' || entry.event === 'plan_item_dispatched')).toBe(true)
  })

  it('writes the clear even when the tick holds on a dirty tree', () => {
    // `next_active_plan_item: null` is a value, not "the field is untouched": with `??` the change was invisible, so the hold
    // was silent and both journal lines vanished — the field stayed on disk (block 38, MAJOR 2).
    const plan = planWithTwo(['P1.1'])
    savePlan(plan)
    idleNaming('P1.1')

    const result = stepFlow('run-1', {
      now: NOW, at: AT, head: HEAD, tree_clean: false, ports: ports(() => ({ sent: true })),
      evidence_policy: { min_seconds: 0, retries: 1 },
    })

    expect(result.decision.reason).toBe('tree_dirty')
    const after = readFlow('run-1')
    expect(after.active_plan_item).toBeNull()
    const log = after.log
    expect(log.filter(entry => entry.event === 'stale_active_item_cleared')).toHaveLength(1)
    expect(log.some(entry => entry.event === 'tree_dirty')).toBe(true)
  })

  it('writes the stale value away even when there is nothing left to start', () => {
    // Nothing has a brief: no dispatch, but the field must not survive to block a later tick.
    const plan = planWithTwo([])
    savePlan({ ...plan, items: plan.items.map(item => ({ ...item, status: 'queued' as const })) })
    idleNaming('P1.1')

    stepFlow('run-1', {
      now: NOW, at: AT, head: HEAD, tree_clean: true, ports: ports(() => ({ sent: true })),
      evidence_policy: { min_seconds: 0, retries: 1 },
    })

    const after = readFlow('run-1')
    expect(after.active_plan_item).toBeNull()
    expect(after.log.filter(entry => entry.event === 'stale_active_item_cleared')).toHaveLength(1)
    expect(after.log.at(-1)?.event).not.toBe('dispatch_spec')
  })

  it('clears the active item in the same write as the close', () => {
    // The close and the field are one write: leaving the closed id behind is exactly what blocked the next item.
    const plan = planWithTwo(['P1.1', 'P1.2'])
    savePlan(plan)
    const state = createFlowState({
      run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 3, max_total_rounds: 8, at: AT,
    })
    saveFlow({
      ...state, state: 'reviewing', rounds: 1, review_started_at: NOW - 1_000, active_plan_item: 'P1.1',
      claim: { head: HEAD, verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null },
    })
    mkdirSync(join(root, 'flows', 'run-1', 'notes', 'inbox'), { recursive: true })
    writeFileSync(stagingPath('run-1', HEAD, 2, root), 'VERDICT: ACCEPT\n')

    stepFlow('run-1', {
      now: NOW, at: AT, head: HEAD, tree_clean: true,
      ports: ports(() => ({ sent: true }), ''),
      evidence_policy: { min_seconds: 30, retries: 1 },
    })

    // P1.1 is closed in the mirror, and the flow no longer names it as in flight.
    expect(readPlan('run-1').items.find(item => item.id === 'P1.1')!.status).toBe('done')
    expect(readFlow('run-1').active_plan_item).not.toBe('P1.1')
  })

  it('still refuses to start a second task when the active item really is in flight', () => {
    const plan = planWithTwo(['P1.1', 'P1.2'])
    savePlan({ ...plan, items: plan.items.map(item => (item.id === 'P1.1' ? { ...item, status: 'in_work' as const } : item)) })
    idleNaming('P1.1')
    const sent: string[] = []

    const result = stepFlow('run-1', {
      now: NOW, at: AT, head: HEAD, tree_clean: true,
      ports: ports((_pane, text) => { sent.push(text); return { sent: true } }),
      evidence_policy: { min_seconds: 0, retries: 1 },
    })
    expect(result.decision.reason).toBe('head_unchanged')
    expect(sent).toHaveLength(0)
  })

  it('reports needs_brief without moving when the next item has no brief', () => {
    const plan = planWithTwo(['P1.1'])
    savePlan({ ...plan, items: plan.items.map(item => (item.id === 'P1.1' ? { ...item, status: 'done' as const, head: HEAD } : item)) })
    idleNaming('P1.1')
    const sent: string[] = []

    const result = stepFlow('run-1', {
      now: NOW, at: AT, head: HEAD, tree_clean: true,
      ports: ports((_pane, text) => { sent.push(text); return { sent: true } }),
      evidence_policy: { min_seconds: 0, retries: 1 },
    })
    expect(sent).toHaveLength(0)
    expect(['head_unchanged', 'plan_incomplete']).toContain(result.decision.reason)
  })
})

describe('a commit that only touches the plan is not the dev\'s work (D6)', () => {
  it('moves the baseline instead of asking for a review', () => {
    // Seen on the sandbox: the plan and a brief were committed after `flow start`, the flow asked for a review of that
    // commit and sent a fix round about a document, while the real item never started.
    const state = createFlowState({
      run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 3, max_total_rounds: 8, at: AT,
    })
    saveFlow({ ...state, state: 'idle', claim: { head: 'aaa111', verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null } })
    const sent: string[] = []

    const result = stepFlow('run-1', {
      now: NOW, at: AT, head: HEAD, tree_clean: true, plan: null,
      docs_only_since_claim: true,
      ports: ports((_pane, text) => { sent.push(text); return { sent: true } }),
      evidence_policy: { min_seconds: 0, retries: 1 },
    })

    expect(result.decision.reason).toBe('head_reanchored')
    expect(result.status).toBe('applied')
    expect(sent).toHaveLength(0)
    const after = readFlow('run-1')
    expect(after.claim.head).toBe(HEAD)
    expect(after.state).toBe('idle')
  })

  it('starts the item of the plan on the very next tick', () => {
    // The point of re-anchoring: the tick after the document commit does the work, not the paperwork.
    const doc = '- [ ] **P1.1** — first'
    let plan = createPlan({ run_id: 'run-1', source_path: 'docs/plan.md', text: doc, now: NOW, at: AT }).plan
    plan = attachSpec(plan, {
      id: 'P1.1', text: JSON.stringify({ id: 'P1.1', title: 't', goal: 'g', requirements: ['r'], checks: ['c'], report: ['r'] }),
      format: 'json', spec_path: 'docs/briefs/P1.1.json', now: NOW, at: AT,
    }).plan
    mkdirSync(dirname(planPath('run-1')), { recursive: true })
    savePlan(plan)
    const state = createFlowState({
      run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 3, max_total_rounds: 8, at: AT,
    })
    saveFlow({ ...state, state: 'idle', claim: { head: HEAD, verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null } })
    const sent: string[] = []

    const result = stepFlow('run-1', {
      now: NOW, at: AT, head: HEAD, tree_clean: true,
      ports: ports((_pane, text) => { sent.push(text); return { sent: true } }),
      evidence_policy: { min_seconds: 0, retries: 1 },
    })
    expect(result.decision.reason).toBe('plan_item_dispatched')
    expect(sent).toHaveLength(1)
    expect(readFlow('run-1').active_plan_item).toBe('P1.1')
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
      claim: { head: HEAD, verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null },
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

describe('a released round is dispatched again (block 56)', () => {
  it('takes the same item once the lost round is freed', () => {
    // The live shape: `A1` is `in_work`, the flow is parked, and the engine holds a round that was never requested. Releasing it and
    // resuming must hand the row back to the pipeline — the next tick dispatches `A1` again instead of answering `head_unchanged` forever.
    const doc = '- [ ] **P1.1** — first'
    let plan = createPlan({ run_id: 'run-1', source_path: 'docs/plan.md', text: doc, now: NOW, at: AT }).plan
    plan = attachSpec(plan, {
      id: 'P1.1', text: JSON.stringify({ id: 'P1.1', title: 't', goal: 'g', requirements: ['r'], checks: ['c'], report: ['r'] }),
      format: 'json', spec_path: 'docs/briefs/P1.1.md', now: NOW, at: AT,
    }).plan
    mkdirSync(dirname(planPath('run-1')), { recursive: true })
    savePlan({ ...plan, items: plan.items.map(item => ({ ...item, status: 'in_work' as const })) })

    const state = createFlowState({
      run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 3, max_total_rounds: 8, at: AT,
    })
    saveFlow({
      ...state, state: 'paused', paused_from: 'idle', active_plan_item: 'P1.1', review_started_at: null,
      claim: { head: 'a'.repeat(40), verdict: null, verdict_count: 0, verdict_applied: false, spec_id: 'P1.1' },
    })

    expect(releaseRound('run-1', { reason: 'lost round' }).item).toBe('P1.1')
    resumeFlow('run-1')

    const sent: string[] = []
    stepFlow('run-1', {
      now: NOW, at: AT, head: 'a'.repeat(40), tree_clean: true,
      ports: ports((_pane, text) => { sent.push(text); return { sent: true } }),
      evidence_policy: { min_seconds: 0, retries: 1 },
    })

    // Dispatched again: the pointer names the brief, and the item is in flight once more.
    expect(sent).toHaveLength(1)
    expect(sent[0]).toContain('docs/briefs/P1.1.md')
    expect(readFlow('run-1').active_plan_item).toBe('P1.1')
    expect(readFlow('run-1').log.some(entry => entry.event === 'round_released')).toBe(true)
  })
})

describe('a review request carries the brief of its round (block 61)', () => {
  it('sends the item id and the brief path with the verdict instructions', () => {
    // The reviewer used to receive only the diff and the general rules, and it filled the gap with its own expectations: on `flow-a` it
    // rejected an empty `faq.html` that the brief asked to be empty (block 61).
    const doc = '- [ ] **A3** — create an empty faq.html'
    let plan = createPlan({ run_id: 'run-1', source_path: 'docs/plan.md', text: doc, now: NOW, at: AT }).plan
    plan = attachSpec(plan, {
      id: 'A3', text: JSON.stringify({ id: 'A3', title: 't', goal: 'g', requirements: ['r'], checks: ['c'], report: ['r'] }),
      format: 'json', spec_path: 'docs/briefs/A3.md', now: NOW, at: AT,
    }).plan
    mkdirSync(dirname(planPath('run-1')), { recursive: true })
    savePlan(plan)

    const state = createFlowState({
      run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 3, max_total_rounds: 8, at: AT,
    })
    // The round belongs to an item: `spec_id` is what `requestReview` reads to name it in the prompt.
    saveFlow({
      ...state, state: 'idle',
      claim: { head: 'a'.repeat(40), verdict: null, verdict_count: 0, verdict_applied: false, spec_id: 'A3' },
    })

    const sent: string[] = []
    stepFlow('run-1', {
      now: NOW, at: AT, head: 'b'.repeat(40), tree_clean: true,
      ports: ports((_pane, text) => { sent.push(text); return { sent: true } }),
      evidence_policy: { min_seconds: 0, retries: 1 },
    })

    const review = sent.find(text => text.includes('VERDICT:'))
    expect(review).toBeDefined()
    expect(review!).toContain('plan item A3')
    expect(review!).toContain('docs/briefs/A3.md')
    expect(review!).toContain('CONFORMANCE TO that brief')
  })
})

describe('an off-plan spec carries its brief into the review (block 62)', () => {
  it('names the spec file in the review prompt of the round it was dispatched for', () => {
    // `flow start --spec <file>` puts a spec in flight with no plan row: `claim.spec_id` is null, so a lookup through the plan finds
    // nothing and the prompt used to arrive with no brief at all. The path now travels with the round (block 62, MAJOR).
    mkdirSync(join(root, 'briefs'), { recursive: true })
    const brief = join(root, 'briefs', 'off-plan.md')
    writeFileSync(brief, '# OFF PLAN\n\n- [ ] create an empty faq.html\n')

    startFlow({ run_id: 'run-1', dev: 'dev-1', review: 'rev-1', specs: [brief] }, { head: 'a'.repeat(40) })

    const dispatched: string[] = []
    stepFlow('run-1', {
      now: NOW, at: AT, head: 'a'.repeat(40), tree_clean: true,
      ports: ports((_pane, text) => { dispatched.push(text); return { sent: true } }),
      evidence_policy: { min_seconds: 0, retries: 1 },
    })
    expect(dispatched).toHaveLength(1)
    // The dispatch is a pointer, and the round remembers which file that pointer named.
    expect(dispatched[0]).toContain('briefs/off-plan.md')
    expect(readFlow('run-1').claim.brief_path).toBe('briefs/off-plan.md')
    // No plan row — that is the whole point of the case.
    expect(readFlow('run-1').claim.spec_id).toBeNull()

    // The dev commits; the next tick asks for the review, and that prompt must carry the same brief.
    const reviewed: string[] = []
    stepFlow('run-1', {
      now: NOW, at: AT, head: 'b'.repeat(40), tree_clean: true,
      ports: ports((_pane, text) => { reviewed.push(text); return { sent: true } }),
      evidence_policy: { min_seconds: 0, retries: 1 },
    })

    const prompt = reviewed.find(text => text.includes('VERDICT:'))
    expect(prompt).toBeDefined()
    expect(prompt!).toContain("This round's brief is briefs/off-plan.md")
    expect(prompt!).toContain('Judge the work as CONFORMANCE TO that brief')
    // And not a claim about a plan item that does not exist.
    expect(prompt!).not.toContain('plan item')
  })
})

describe('a late note keeps the brief of the round it answers (block 63)', () => {
  it('carries the brief into the review that follows a recovered CHANGES_REQUESTED', () => {
    // The off-plan case: `claim.brief_path` is the only record of which file the round was about. Recovery rebuilds the claim from what it
    // can see, and it rebuilt it without the path — so the fix round's review arrived with no brief (block 63, MAJOR 1).
    //
    // `settleFromNotes` is the path that answers a round from a published note: the flow has left `reviewing` (or the head moved on) and no
    // dispatch is pending, so nothing else will read the file.
    const head = 'e'.repeat(40)
    const state = createFlowState({
      run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 3, max_total_rounds: 8, at: AT,
    })
    saveFlow({
      ...state,
      state: 'idle',
      claim: { head, verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null, brief_path: 'briefs/off-plan.md' },
    })
    const notes = join(root, 'flows', 'run-1', notesRef(head, 1))
    mkdirSync(dirname(notes), { recursive: true })
    writeFileSync(notes, 'MAJOR faq.html:1 — add content\nVERDICT: CHANGES_REQUESTED\n')

    const sent: string[] = []
    stepFlow('run-1', {
      now: NOW + 5_000, at: AT, head, tree_clean: true, plan: null,
      ports: ports((_pane, text) => { sent.push(text); return { sent: true } }),
      evidence_policy: { min_seconds: 0, retries: 1 },
    })

    // The verdict came out of the file, and the claim that carries the fix round still knows the brief.
    expect(readFlow('run-1').log.some(entry => entry.event === 'settled_by_observation')).toBe(true)
    expect(readFlow('run-1').claim.brief_path).toBe('briefs/off-plan.md')

    // The dev commits; the next review must name the same file.
    const reviewed: string[] = []
    stepFlow('run-1', {
      now: NOW + 60_000, at: AT, head: 'd'.repeat(40), tree_clean: true, plan: null,
      ports: ports((_pane, text) => { reviewed.push(text); return { sent: true } }),
      evidence_policy: { min_seconds: 0, retries: 1 },
    })

    const prompt = reviewed.find(text => text.includes('VERDICT:'))
    expect(prompt).toBeDefined()
    expect(prompt!).toContain("This round's brief is briefs/off-plan.md")
    expect(prompt!).toContain('Judge the work as CONFORMANCE TO that brief')
  })
})

describe('a repeat Enter is on the record (block 75)', () => {
  it('journals one `submit_retry enter <n>` line per repeat, with the head it was for', () => {
    seedIdleFlow()
    const result = stepFlow('run-1', {
      now: NOW, at: AT, head: HEAD, tree_clean: true, plan: undefined,
      // The port stands in for `sendWhenIdle`, whose own repeat is covered in test/send-when-idle.test.ts.
      ports: {
        paneBusy: () => 'idle' as const,
        peek: () => '',
        send: () => ({ sent: true as const, enter_retries: 1 }),
      },
      evidence_policy: { min_seconds: 0, retries: 1 },
    })

    expect(result.status).toBe('applied')
    const retries = readFlow('run-1').log.filter(entry => entry.event === 'submit_retry')
    expect(retries).toHaveLength(1)
    expect(retries[0]!.detail).toBe(`enter 1 · ${HEAD}`)
  })

  it('carries the spec in the retry detail when the decision has one', () => {
    // A plan dispatch names an item, and the retry line carries the same head and spec the dispatch itself did.
    const doc = ['- [ ] **P1.1** — first', '- [ ] **P1.2** — second'].join('\n')
    const brief = (id: string) => JSON.stringify({ id, title: id, goal: 'g', requirements: ['r'], checks: ['c'], report: ['r'] })
    let plan = createPlan({ run_id: 'run-1', source_path: 'docs/plan.md', text: doc, now: NOW, at: AT }).plan
    for (const id of ['P1.1', 'P1.2']) {
      plan = attachSpec(plan, { id, text: brief(id), format: 'json', spec_path: `docs/briefs/${id}.json`, now: NOW, at: AT }).plan
    }
    mkdirSync(dirname(planPath('run-1')), { recursive: true })
    savePlan(plan)
    // An ACCEPT collected in `idle` with the plan item still open: the tick closes P1.1 and dispatches P1.2's brief.
    const base = createFlowState({
      run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 3, max_total_rounds: 8, at: AT,
    })
    saveFlow({
      ...base, state: 'idle', rounds: 0,
      claim: { head: HEAD, verdict: 'ACCEPT', verdict_count: 2, verdict_applied: false, spec_id: null },
      active_plan_item: 'P1.1',
    })

    const dispatched = stepFlow('run-1', {
      now: NOW, at: AT, head: HEAD, tree_clean: true, plan: undefined,
      ports: {
        paneBusy: () => 'idle' as const,
        peek: () => '',
        send: () => ({ sent: true as const, enter_retries: 1 }),
      },
      evidence_policy: { min_seconds: 0, retries: 1 },
    })

    expect(dispatched.decision.reason).toBe('plan_item_dispatched')
    // P1.1 was accepted and closed; the brief that went out is P1.2's, and the retry names the same item.
    expect(dispatched.decision.spec_id).toBe('P1.2')
    const retries = readFlow('run-1').log.filter(entry => entry.event === 'submit_retry')
    expect(retries).toHaveLength(1)
    expect(retries[0]!.detail).toBe(`enter 1 · ${HEAD} · spec P1.2`)
  })

  it('keeps the template multi-line: flattening belongs to the pane, not to the decision', () => {
    seedIdleFlow()
    const messages: string[] = []
    stepFlow('run-1', {
      now: NOW, at: AT, head: HEAD, tree_clean: true, plan: undefined,
      ports: ports((_pane, message) => { messages.push(message); return { sent: true } }),
      evidence_policy: { min_seconds: 0, retries: 1 },
    })

    // What the journal and the tests read stays readable; `pasteTextToPane` is what hands the pane one line.
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('\n')
  })
})

// Block 81, the live `salon-dashboard` run of 03.11: an ACCEPT on `a9a6e19` was refused as a double close (that head had already
// closed T2.2.6) — and the refusal also dropped the binding of T2.3.1, whose brief had just been dispatched. The dev kept working
// on T2.3.1's brief while `plan.json` held it `queued, rounds 0`: every fix round went uncounted, the per-item cap never fired, and
// the panel printed `round 7 of 6`.
describe('a refused close does not unbind the item it was dispatched for (block 81)', () => {
  // The same three-item plan the block-44/45 tests use, built here because their helpers are scoped to their own describe.
  function seedPlan(): void {
    const ids = ['P1.1', 'P1.2', 'P1.3']
    const doc = ids.map(id => `- [ ] **${id}** — ${id}`).join('\n')
    let plan = createPlan({ run_id: 'run-1', source_path: 'docs/plan.md', text: doc, now: NOW, at: AT }).plan
    for (const id of ids) {
      plan = attachSpec(plan, {
        id, text: JSON.stringify({ id, title: id, goal: 'g', requirements: ['r'], checks: ['c'], report: ['r'] }),
        format: 'json', spec_path: `docs/briefs/${id}.json`, now: NOW, at: AT,
      }).plan
    }
    mkdirSync(dirname(planPath('run-1')), { recursive: true })
    savePlan(plan)
  }

  const commit = (index: number): string => String(index).repeat(40).slice(0, 40)

  it('keeps the round’s own item bound, and puts back only a stale one', () => {
    seedPlan()
    const head = commit(1)
    // P1.1 was closed by `head`; P1.2 is the item this round belongs to and its brief has just gone out.
    const plan = readPlan('run-1')
    savePlan({
      ...plan,
      items: plan.items.map(item => (item.id === 'P1.1'
        ? { ...item, status: 'done' as const, head, closed_by: 'accept' as const }
        : { ...item, status: 'in_work' as const })),
    })
    const state = createFlowState({
      run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 6, max_total_rounds: 24, at: AT,
    })
    saveFlow({
      ...state, state: 'reviewing', rounds: 1, active_plan_item: 'P1.2', review_started_at: NOW - 60_000,
      claim: { head, verdict: null, verdict_count: 1, verdict_applied: false, spec_id: 'P1.2' },
    })
    mkdirSync(join(root, 'flows', 'run-1', 'notes', 'inbox'), { recursive: true })
    writeFileSync(stagingPath('run-1', head, 2, root), 'VERDICT: ACCEPT\n')

    const ticked = stepFlow('run-1', {
      now: NOW, at: AT, head, tree_clean: true, ports: ports(() => ({ sent: true })),
      evidence_policy: { min_seconds: 30, retries: 1 },
    })

    expect(ticked.decision.reason).toBe('plan_item_double_close')
    // The close is refused — and the item stays the one the flow is working on.
    const after = readFlow('run-1')
    expect(after.active_plan_item).toBe('P1.2')
    expect(after.claim.spec_id).toBe('P1.2')
    const item = readPlan('run-1').items.find(entry => entry.id === 'P1.2')!
    expect(item.status).toBe('in_work')
    expect(item.status).not.toBe('queued')
  })

  it('keeps the binding on a repeated refusal, and the rounds with it', () => {
    // The review of round 1: a refusal whose conflict is *already recorded* must not unbind the claim's own item again — that is how
    // the rounds were erased in the first place. `recorded` decides whether the line is news, never whether the item stays bound.
    seedPlan()
    const head = commit(1)
    const plan = readPlan('run-1')
    savePlan({
      ...plan,
      items: plan.items.map(item => (item.id === 'P1.1'
        ? { ...item, status: 'done' as const, head, closed_by: 'accept' as const }
        : { ...item, status: 'in_work' as const, rounds: 2 })),
      // The same double close, already on record from the tick that first saw it.
      conflicts: [{ at: AT, item_id: 'P1.2', kind: 'plan_item_double_close' as const, detail: 'historical' }],
    })
    const state = createFlowState({
      run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 6, max_total_rounds: 24, at: AT,
    })
    saveFlow({
      ...state, state: 'reviewing', rounds: 3, active_plan_item: 'P1.2', review_started_at: NOW - 60_000,
      claim: { head, verdict: null, verdict_count: 1, verdict_applied: false, spec_id: 'P1.2' },
    })
    mkdirSync(join(root, 'flows', 'run-1', 'notes', 'inbox'), { recursive: true })
    writeFileSync(stagingPath('run-1', head, 2, root), 'VERDICT: ACCEPT\n')

    stepFlow('run-1', {
      now: NOW, at: AT, head, tree_clean: true, ports: ports(() => ({ sent: true })),
      evidence_policy: { min_seconds: 30, retries: 1 },
    })

    const after = readFlow('run-1')
    expect(after.active_plan_item).toBe('P1.2')
    const item = readPlan('run-1').items.find(entry => entry.id === 'P1.2')!
    expect(item.status).toBe('in_work')
    // The rounds the item had already spent are still its own.
    expect(item.rounds).toBe(2)
    // And the conflict is not reported a second time.
    expect(after.log.filter(entry => entry.event === 'plan_item_double_close')).toHaveLength(0)
  })

  it('prints the item’s round, not the flow’s, against the item’s cap', () => {
    // The panel said "Flow round 12 of 6": the flow's own counter was printed against the per-item budget. With a plan the round is
    // the item's, measured against that item's cap — and it is clamped, so `round N of M` never has N > M.
    seedPlan()
    const plan = readPlan('run-1')
    savePlan({ ...plan, items: plan.items.map(item => (item.id === 'P1.1' ? { ...item, status: 'in_work' as const, rounds: 1 } : item)) })
    const base = createFlowState({
      run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 2, max_total_rounds: 24, at: AT,
    })
    // Nine flow rounds spent on other items, one round spent on this one.
    saveFlow({
      ...base, state: 'reviewing', rounds: 9, active_plan_item: null, review_started_at: NOW - 60_000,
      claim: { head: commit(9), verdict: null, verdict_count: 0, verdict_applied: false, spec_id: 'P1.1' },
    })

    const sent: string[] = []
    const ticked = stepFlow('run-1', {
      now: NOW, at: AT, head: commit(8), tree_clean: true,
      ports: { paneBusy: () => 'idle' as const, peek: () => '', send: (_pane, message) => { sent.push(message); return { sent: true as const } } },
      evidence_policy: { min_seconds: 0, retries: 1 },
    })

    expect(ticked.decision.kind).toBe('request_review')
    expect(sent).toHaveLength(1)
    expect(sent[0]).toContain('round 2 of 2')
    const printed = sent[0]!.match(/round (\d+) of (\d+)/)
    expect(printed).not.toBeNull()
    expect(Number(printed![1])).toBeLessThanOrEqual(Number(printed![2]))
    // The flow's own counter is not what the dev is asked to satisfy.
    expect(sent[0]).not.toContain('round 10 of')
  })

  it('prints the retry against the right budget, never `round N of M` with N > M', () => {
    // The retry re-asks the same round and used to fall back to the flow's counter against the *per-item* cap — `round 10 of 2`
    // (block 81, review round 1). It now goes through the same budget as every other prompt.
    const head = commit(7)
    const base = createFlowState({
      run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 2, max_total_rounds: 24, at: AT,
    })
    saveFlow({
      ...base, state: 'reviewing', rounds: 9, review_started_at: NOW - 1_000,
      claim: { head, verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null },
    })
    const sent: string[] = []
    const ticked = stepFlow('run-1', {
      now: NOW, at: AT, head, tree_clean: true, plan: null,
      // The answer is a bare pane verdict with no notes and no tool lines: too thin to accept, so the tick re-asks.
      ports: {
        paneBusy: () => 'idle' as const,
        peek: () => 'VERDICT: ACCEPT',
        send: (_pane, message) => { sent.push(message); return { sent: true as const } },
      },
      verdict_evidence: { elapsed_ms: 1_000, notes_bytes: 11, notes_findings: 0, pane_tool_lines: 0 },
      evidence_policy: { min_seconds: 30, retries: 2 },
    })

    expect(ticked.decision.reason).toBe('review_unsubstantiated')
    expect(sent).toHaveLength(1)
    const printed = sent[0]!.match(/round (\d+) of (\d+)/)
    expect(printed).not.toBeNull()
    expect(Number(printed![1])).toBeLessThanOrEqual(Number(printed![2]))
    // Without a plan the flow's own fuse is the only budget there is.
    expect(sent[0]).toContain('round 10 of 24')
  })

  it('counts every fix round of the item the claim names, and stops at its own cap', () => {
    seedPlan()
    const plan = readPlan('run-1')
    savePlan({ ...plan, items: plan.items.map(item => (item.id === 'P1.1' ? { ...item, status: 'in_work' as const } : item)) })

    // `active_plan_item` is gone — exactly the state the old refusal left behind — and the claim still names the item.
    const base = createFlowState({
      run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 2, max_total_rounds: 20, at: AT,
    })
    let head = commit(2)
    saveFlow({
      ...base, state: 'reviewing', rounds: 0, active_plan_item: null, review_started_at: NOW - 60_000,
      claim: { head, verdict: null, verdict_count: 0, verdict_applied: false, spec_id: 'P1.1' },
    })

    // A CHANGES_REQUESTED for that item: the engine dispatches a fix, and the *item's* counter moves.
    for (let round = 1; round <= 2; round += 1) {
      const verdicts = Array.from({ length: round }, () => 'round\nVERDICT: CHANGES_REQUESTED\nMAJOR src/app.ts:1 — x\n> ').join('\n')
      const before = readFlow('run-1')
      saveFlow({
        ...before, claim: { head, verdict: null, verdict_count: round - 1, verdict_applied: false, spec_id: 'P1.1' },
      })
      mkdirSync(dirname(stagingPath('run-1', head, round, root)), { recursive: true })
      writeFileSync(stagingPath('run-1', head, round, root), 'MAJOR src/app.ts:1 — x\nVERDICT: CHANGES_REQUESTED\n')
      stepFlow('run-1', {
        now: NOW + round * 60_000, at: AT, head, tree_clean: true,
        ports: { paneBusy: () => 'idle' as const, peek: () => verdicts, send: () => ({ sent: true as const }) },
        evidence_policy: { min_seconds: 0, retries: 1 },
      })
      head = commit(2 + round)
      const after = readFlow('run-1')
      saveFlow({ ...after, state: 'reviewing', review_started_at: NOW, claim: { ...after.claim, head, spec_id: 'P1.1' } })
    }

    expect(readPlan('run-1').items.find(entry => entry.id === 'P1.1')!.rounds).toBe(2)

    // The next fix is past the item's own budget: the item is blocked for a human instead of spending another round.
    const before = readFlow('run-1')
    saveFlow({ ...before, claim: { head, verdict: null, verdict_count: 2, verdict_applied: false, spec_id: 'P1.1' } })
    mkdirSync(dirname(stagingPath('run-1', head, 3, root)), { recursive: true })
    writeFileSync(stagingPath('run-1', head, 3, root), 'MAJOR src/app.ts:1 — x\nVERDICT: CHANGES_REQUESTED\n')
    const capped = stepFlow('run-1', {
      now: NOW + 600_000, at: AT, head, tree_clean: true,
      ports: {
        paneBusy: () => 'idle' as const,
        peek: () => Array.from({ length: 3 }, () => 'round\nVERDICT: CHANGES_REQUESTED\nMAJOR src/app.ts:1 — x\n> ').join('\n'),
        send: () => ({ sent: true as const }),
      },
      evidence_policy: { min_seconds: 0, retries: 1 },
    })

    expect(['rounds_exhausted', 'total_rounds_exhausted', 'plan_in_flight']).toContain(capped.decision.reason)
    const blocked = readPlan('run-1').items.find(entry => entry.id === 'P1.1')!
    // Whatever the path, the item is not silently given a third round.
    expect(blocked.rounds).toBe(2)
    expect(blocked.status === 'blocked_owner' || capped.decision.reason === 'rounds_exhausted').toBe(true)
  })
})
