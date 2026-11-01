// Escalation as an approval: raised once per episode, and the decision moves the flow.
//
// The block's rule: no silent escalations. A flow that stops because an item spent its rounds, the fuse ran out or no
// substantiated verdict arrived must show up as an approval a human can act on — approve resumes with a fresh budget,
// deny closes the flow with a reason.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { createFlowState } from '../src/core/flow.js'
import { readFlow, saveFlow } from '../src/core/flow-store.js'
import { attachSpec, createPlan, planPath, readPlan, savePlan } from '../src/core/plan.js'
import { raiseEscalationApproval, applyEscalationDecision, FLOW_ESCALATION_ACTION } from '../src/core/flow-escalation.js'
import { createRunApproval, listRunApprovals, removeRunApproval, resolveRunApproval } from '../src/core/approvals.js'
import { writeAgent, writeRun } from '../src/core/runs.js'

vi.mock('node:child_process', () => ({ execFileSync: vi.fn(() => ''), spawnSync: vi.fn(() => ({ status: 1, stdout: '' })) }))

const NOW = Date.parse('2026-11-02T09:00:00.000Z')
const AT = new Date(NOW).toISOString()

let root: string
let savedRegistry: string | undefined

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'reeves-escalation-'))
  savedRegistry = process.env.REEVES_REGISTRY
  process.env.REEVES_REGISTRY = root
  process.env.REEVES_CONFIG = join(root, 'config.json')

  writeRun({
    id: 'run-1', name: 'demo', status: 'running', tmux_session: 'reeves-run-1', reeves_window_id: '@0',
    reeves_pane_id: '%0', root_agent_id: 'dev-1', working_dir: root, preset_name: null,
    started_at: '2026-11-01T00:00:00.000Z', ended_at: null,
  })
  for (const [id, pane] of [['dev-1', '%1'], ['rev-1', '%2']] as const) {
    writeAgent({
      id, run_id: 'run-1', nickname: id, provider: 'codex', model: '', role: 'worker', working_dir: root,
      task: 't', task_status: 'working', task_note: '', tmux_session: 'reeves-run-1', tmux_window_id: '@1',
      tmux_pane_id: pane, rc_enabled: false, permissions: 'ask', inbox: [], last_seen: 1,
      started_at: '2026-11-01T00:00:01.000Z', ended_at: null,
    })
  }

  const created = createPlan({ run_id: 'run-1', source_path: 'docs/plan.md', text: '- [ ] **P1.1** — first', now: NOW })
  const plan = attachSpec(created.plan, {
    id: 'P1.1',
    text: JSON.stringify({ id: 'P1.1', title: 'first', goal: 'g', requirements: ['r'], checks: ['c'], report: ['r'] }),
    format: 'json', spec_path: 'docs/briefs/P1.1.json', now: NOW,
  }).plan
  mkdirSync(dirname(planPath('run-1')), { recursive: true })
  savePlan({ ...plan, items: plan.items.map(item => ({ ...item, status: 'in_work' as const, rounds: 2 })) })
  saveFlow({
    ...createFlowState({
      run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 2, max_total_rounds: 5, at: AT,
    }),
    state: 'escalated',
    notify_episode: 1,
    active_plan_item: 'P1.1',
    log: [{ at: AT, event: 'escalate', detail: 'rounds_exhausted' }],
  })
})

afterEach(() => {
  if (savedRegistry === undefined) delete process.env.REEVES_REGISTRY
  else process.env.REEVES_REGISTRY = savedRegistry
  delete process.env.REEVES_CONFIG
  rmSync(root, { recursive: true, force: true })
})

describe('raising the approval', () => {
  it('creates exactly one approval per episode', () => {
    const first = raiseEscalationApproval({ run_id: 'run-1', flow_id: 'flow-a', episode: 1, reason: 'rounds_exhausted', item_id: 'P1.1' })
    const again = raiseEscalationApproval({ run_id: 'run-1', flow_id: 'flow-a', episode: 1, reason: 'rounds_exhausted', item_id: 'P1.1' })
    expect(first).not.toBeNull()
    expect(again?.id).toBe(first!.id)
    expect(listRunApprovals('run-1', 'pending').filter(entry => entry.action === FLOW_ESCALATION_ACTION)).toHaveLength(1)

    // A new episode is a new approval: `flow resume` then another escalation is a second decision.
    const second = raiseEscalationApproval({ run_id: 'run-1', flow_id: 'flow-a', episode: 2, reason: 'rounds_exhausted', item_id: 'P1.1' })
    expect(second?.id).not.toBe(first!.id)
  })

  it('drops its own duplicate when two raisers create the same ticket', () => {
    // Simulate the race: both raisers pass the "no ticket yet" check, then both create. The second keeps the oldest and
    // removes the record it just made, so the operator sees one ticket, not two.
    const first = createRunApproval({
      agent_id: 'dev-1', action: FLOW_ESCALATION_ACTION,
      summary: 'flow run-1 escalated: rounds_exhausted — continue with a fresh budget, or stop the flow',
      details: { key: 'flow-a:1', run_id: 'run-1', flow_id: 'flow-a', episode: 1, reason: 'rounds_exhausted', item_id: 'P1.1' },
    })
    const duplicate = createRunApproval({
      agent_id: 'dev-1', action: FLOW_ESCALATION_ACTION,
      summary: 'flow run-1 escalated: rounds_exhausted — continue with a fresh budget, or stop the flow',
      details: { key: 'flow-a:1', run_id: 'run-1', flow_id: 'flow-a', episode: 1, reason: 'rounds_exhausted', item_id: 'P1.1' },
    })
    const kept = raiseEscalationApproval({ run_id: 'run-1', flow_id: 'flow-a', episode: 1, reason: 'rounds_exhausted', item_id: 'P1.1' })
    const tickets = listRunApprovals('run-1', 'pending').filter(entry => entry.action === FLOW_ESCALATION_ACTION)
    expect(tickets).toHaveLength(1)
    // Which of the two survives depends on `requested_at`, and two records created in the same millisecond are ordered
    // by id — either way exactly one ticket remains, and it is one of the two that were created.
    expect([first.id, duplicate.id]).toContain(tickets[0]!.id)
    expect(kept?.id).toBe(tickets[0]!.id)
    expect(duplicate.id).not.toBe(first.id)
  })

  it('refuses to remove a ticket that already carries a decision', () => {
    // The cleanup path is the only caller; the guarantee lives in `removeRunApproval` itself, under the same lock as the
    // unlink, so a resolution that lands between the caller's snapshot and the deletion is not thrown away.
    const ticket = createRunApproval({
      agent_id: 'dev-1', action: FLOW_ESCALATION_ACTION,
      summary: 'flow run-1 escalated: rounds_exhausted — continue with a fresh budget, or stop the flow',
      details: { key: 'flow-a:9', run_id: 'run-1', flow_id: 'flow-a', episode: 9, reason: 'rounds_exhausted', item_id: 'P1.1' },
    })
    resolveRunApproval(ticket.id, 'approved', 'go on')

    expect(removeRunApproval(ticket.id)).toBe(false)
    expect(listRunApprovals('run-1').find(entry => entry.id === ticket.id)!.status).toBe('approved')
  })

  it('never deletes a duplicate that was already decided', () => {
    // A human approves the second ticket while the raiser still has it in its snapshot. `raiseEscalationApproval` must
    // leave the decided ticket alone: the duplicate cleanup is for undecided copies only.
    const first = createRunApproval({
      agent_id: 'dev-1', action: FLOW_ESCALATION_ACTION,
      summary: 'flow run-1 escalated: rounds_exhausted — continue with a fresh budget, or stop the flow',
      details: { key: 'flow-a:1', run_id: 'run-1', flow_id: 'flow-a', episode: 1, reason: 'rounds_exhausted', item_id: 'P1.1' },
    })
    const second = createRunApproval({
      agent_id: 'dev-1', action: FLOW_ESCALATION_ACTION,
      summary: 'flow run-1 escalated: rounds_exhausted — continue with a fresh budget, or stop the flow',
      details: { key: 'flow-a:1', run_id: 'run-1', flow_id: 'flow-a', episode: 1, reason: 'rounds_exhausted', item_id: 'P1.1' },
    })
    resolveRunApproval(second.id, 'denied', 'stop it')

    raiseEscalationApproval({ run_id: 'run-1', flow_id: 'flow-a', episode: 1, reason: 'rounds_exhausted', item_id: 'P1.1' })

    const all = listRunApprovals('run-1').filter(entry => entry.action === FLOW_ESCALATION_ACTION)
    // Both records survive: the decided one carries the human's answer, and the pending one is the ticket to act on.
    expect(all.map(entry => entry.id).sort()).toEqual([first.id, second.id].sort())
    expect(all.find(entry => entry.id === second.id)!.status).toBe('denied')
  })

  it('says what happened and what the human can do', () => {
    const approval = raiseEscalationApproval({ run_id: 'run-1', flow_id: 'flow-a', episode: 1, reason: 'total_rounds_exhausted', item_id: null })
    expect(approval?.summary).toContain('escalated: total_rounds_exhausted')
    expect(approval?.summary).toContain('continue with a fresh budget, or stop the flow')
    expect(approval?.details).toMatchObject({ run_id: 'run-1', episode: 1, reason: 'total_rounds_exhausted' })
  })

  it('does nothing when the flow is no longer escalated', () => {
    saveFlow({ ...readFlow('run-1'), state: 'idle' })
    expect(raiseEscalationApproval({ run_id: 'run-1', flow_id: 'flow-a', episode: 1, reason: 'rounds_exhausted', item_id: 'P1.1' })).toBeNull()
  })
})

describe('the decision', () => {
  it('approve gives the item a fresh budget and resumes the flow', () => {
    const approval = raiseEscalationApproval({ run_id: 'run-1', flow_id: 'flow-a', episode: 1, reason: 'rounds_exhausted', item_id: 'P1.1' })!
    const resolved = resolveRunApproval(approval.id, 'approved', 'give it another go')

    expect(resolved.status).toBe('approved')
    const state = readFlow('run-1')
    expect(state.state).toBe('idle')
    expect(state.rounds).toBe(0)
    expect(state.log.at(-1)).toMatchObject({ event: 'escalation_approved' })
    // The item is back in the plan and may be picked up by the next tick. `queued` and not `pending`: the engine table
    // forbids `in_work → pending`, and `queued` is the state the picker takes.
    expect(readPlan('run-1').items.find(item => item.id === 'P1.1')!.status).toBe('queued')
  })

  it('deny closes the flow with a reason', () => {
    const approval = raiseEscalationApproval({ run_id: 'run-1', flow_id: 'flow-a', episode: 1, reason: 'rounds_exhausted', item_id: 'P1.1' })!
    resolveRunApproval(approval.id, 'denied', 'not worth another round')

    const state = readFlow('run-1')
    expect(state.state).toBe('done')
    expect(state.close_reason).toContain('escalation denied: rounds_exhausted')
    expect(state.close_reason).toContain('not worth another round')
    // Denied work leaves the line: `in_work → skipped` is not a human or engine transition, so the item is queued
    // first and then closed. What matters for the operator is that it stops being "in work".
    expect(readPlan('run-1').items.find(item => item.id === 'P1.1')!.status).not.toBe('in_work')
  })

  it('ignores a decision that belongs to an older episode', () => {
    const approval = raiseEscalationApproval({ run_id: 'run-1', flow_id: 'flow-a', episode: 1, reason: 'rounds_exhausted', item_id: 'P1.1' })!
    // The operator resumed the flow by hand and it escalated again: a new episode. The old ticket is stale.
    saveFlow({ ...readFlow('run-1'), state: 'escalated', notify_episode: 2 })
    resolveRunApproval(approval.id, 'approved')
    const state = readFlow('run-1')
    expect(state.state).toBe('escalated')
    expect(state.notify_episode).toBe(2)
    expect(state.log.filter(entry => entry.event === 'escalation_approved')).toHaveLength(0)
  })

  it('ignores a decision when the flow is no longer escalated', () => {
    const approval = raiseEscalationApproval({ run_id: 'run-1', flow_id: 'flow-a', episode: 1, reason: 'rounds_exhausted', item_id: 'P1.1' })!
    saveFlow({ ...readFlow('run-1'), state: 'reviewing' })
    resolveRunApproval(approval.id, 'denied')
    expect(readFlow('run-1').state).toBe('reviewing')
    expect(readFlow('run-1').close_reason).toBeNull()
  })

  it('does not carry a decision twice when two resolves race', () => {
    const approval = raiseEscalationApproval({ run_id: 'run-1', flow_id: 'flow-a', episode: 1, reason: 'rounds_exhausted', item_id: 'P1.1' })!
    // Both callers see the same approval; only the transition out of `pending` (decided inside the runs lock) applies.
    const first = resolveRunApproval(approval.id, 'approved')
    const second = resolveRunApproval(approval.id, 'denied')
    expect(first.status).toBe('approved')
    expect(second.status).toBe('approved')
    expect(readFlow('run-1').log.filter(entry => entry.event === 'escalation_approved')).toHaveLength(1)
    expect(readFlow('run-1').state).toBe('idle')
  })

  it('applies a decision once, and leaves other approvals alone', () => {
    const approval = raiseEscalationApproval({ run_id: 'run-1', flow_id: 'flow-a', episode: 1, reason: 'rounds_exhausted', item_id: 'P1.1' })!
    resolveRunApproval(approval.id, 'approved')
    const afterFirst = readFlow('run-1')
    // A second resolve returns the decided record and changes nothing.
    const again = resolveRunApproval(approval.id, 'denied')
    expect(again.status).toBe('approved')
    expect(readFlow('run-1').state).toBe(afterFirst.state)
    expect(readFlow('run-1').log.filter(entry => entry.event === 'escalation_approved')).toHaveLength(1)

    // An approval of another kind is not a flow decision.
    expect(applyEscalationDecision({ ...approval, action: 'shell' })).toBeNull()
  })
})
