import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createFlowState } from '../src/core/flow.js'
import type { FlowDecision, FlowObservations, FlowState } from '../src/core/flow.js'
import {
  ackFlowIncident, listFlowIncidents, reconcileFlowIncidents, resolveFlowIncident,
} from '../src/core/flow-incidents.js'
import { readFlow, saveFlow } from '../src/core/flow-store.js'
import { listRunApprovals } from '../src/core/approvals.js'
import { writeAgent, writeRun } from '../src/core/runs.js'

const NOW = Date.parse('2026-11-04T12:00:00.000Z')
const AT = new Date(NOW).toISOString()
let root: string
let priorRegistry: string | undefined

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'reeves-flow-incidents-'))
  priorRegistry = process.env.REEVES_REGISTRY
  process.env.REEVES_REGISTRY = root
})

afterEach(() => {
  if (priorRegistry === undefined) delete process.env.REEVES_REGISTRY
  else process.env.REEVES_REGISTRY = priorRegistry
  rmSync(root, { recursive: true, force: true })
})

function state(overrides: Partial<FlowState> = {}): FlowState {
  const base = createFlowState({ run_id: 'run-1', repo: root, roles: { dev: 'dev-1', review: 'rev-1' }, head: 'abc123', at: AT })
  const result = { ...base, ...overrides }
  saveFlow(result, { root })
  return result
}

function obs(overrides: Partial<FlowObservations> = {}): FlowObservations {
  return {
    now: NOW, head: 'abc123', tree_clean: true, dev_pane: 'idle', review_pane: 'idle',
    verdict: null, verdict_count: 0,
    ...overrides,
  }
}

function hold(reason: string, log_detail?: string): FlowDecision {
  return { kind: 'none', reason, next_state: 'idle', next_rounds: 0, next_claim: { head: 'abc123', verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null }, next_review_started_at: null, ...(log_detail ? { log_detail } : {}) } as FlowDecision
}

function runAndRootAgent(): void {
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

describe('durable flow incidents', () => {
  it('does not alarm for pending TTL, a busy dev, or an in-time review', () => {
    const flow = state({ state: 'reviewing', review_started_at: NOW, review_timeout_sec: 900 })
    reconcileFlowIncidents(flow, obs(), hold('dispatch_pending'), { root, now: NOW, at: AT })
    reconcileFlowIncidents(flow, obs({ tree_clean: false, dev_pane: 'busy' }), hold('tree_dirty'), { root, now: NOW, at: AT })
    reconcileFlowIncidents(flow, obs({ review_pane: 'busy' }), hold('awaiting_verdict'), { root, now: NOW, at: AT })
    expect(listFlowIncidents('run-1', { root })).toEqual([])
  })

  it('starts dirty-tree timing only while the dev is idle and raises a warn after the timeout', () => {
    const flow = state({ state: 'idle', active_plan_item: 'P1.1', dev_timeout_sec: 10 })
    reconcileFlowIncidents(flow, obs({ tree_clean: false, dev_pane: 'busy' }), hold('tree_dirty'), { root, now: NOW, at: AT })
    expect(listFlowIncidents('run-1', { root })).toHaveLength(0)
    reconcileFlowIncidents(flow, obs({ now: NOW + 1000, tree_clean: false, dev_pane: 'idle' }), hold('tree_dirty'), { root, now: NOW + 1000 })
    reconcileFlowIncidents(flow, obs({ now: NOW + 11_000, tree_clean: false, dev_pane: 'idle' }), hold('tree_dirty'), { root, now: NOW + 11_000 })
    expect(listFlowIncidents('run-1', { root })).toMatchObject([{ kind: 'dev_stalled', severity: 'warn', owner: 'orchestrator', status: 'open' }])
  })

  it('raises a pane_unknown incident after its redraw grace with the detector reason', () => {
    const flow = state({ hold: { reason: 'review_pane_unknown', since: AT, detail: 'footer absent' } })
    reconcileFlowIncidents(flow, obs({ now: NOW + 6000, pane_diagnostics: { dev: null, review: 'footer_absent: ← for agents footer not found' } }), hold('review_pane_unknown'), {
      root, now: NOW + 6000, pane_unknown_grace_ms: 5000,
    })
    expect(listFlowIncidents('run-1', { root })[0]).toMatchObject({ kind: 'pane_unknown', severity: 'warn', evidence: { reason: expect.stringContaining('footer_absent') } })
  })

  it('deduplicates 100 observations into one record and one journal open event', () => {
    const flow = state({ active_plan_item: 'P1.1', stalled_since: NOW - 5000, dev_timeout_sec: 1 })
    for (let index = 0; index < 100; index += 1) {
      const now = NOW + index * 1000
      reconcileFlowIncidents(flow, obs({ now, tree_clean: false, dev_pane: 'idle' }), hold('tree_dirty'), { root, now })
    }
    expect(listFlowIncidents('run-1', { root })).toMatchObject([{ kind: 'dev_stalled', count: 100 }])
    expect(readFlow('run-1', { root }).log.filter(entry => entry.event === 'incident_opened')).toHaveLength(1)
  })

  it('ACK keeps an incident open and suppresses human escalation', () => {
    const flow = state({ state: 'escalated' })
    reconcileFlowIncidents(flow, obs(), hold('review_timeout'), { root, now: NOW })
    const incident = listFlowIncidents('run-1', { root })[0]!
    ackFlowIncident('run-1', incident.id, { root, at: AT })
    reconcileFlowIncidents(flow, obs(), hold('review_timeout'), { root, now: NOW + 900_000 })
    expect(listFlowIncidents('run-1', { root })[0]).toMatchObject({ status: 'acked', owner: 'orchestrator' })
    expect(listRunApprovals('run-1')).toHaveLength(0)
  })

  it('routes an unACKed blocker to one human approval after the deadline', () => {
    runAndRootAgent()
    const flow = state({ state: 'escalated' })
    reconcileFlowIncidents(flow, obs(), hold('review_timeout'), { root, now: NOW })
    reconcileFlowIncidents(flow, obs(), hold('review_timeout'), { root, now: NOW + 600_000 })
    reconcileFlowIncidents(flow, obs(), hold('review_timeout'), { root, now: NOW + 700_000 })
    expect(listFlowIncidents('run-1', { root })[0]).toMatchObject({ owner: 'human', status: 'open', approval_id: expect.any(String) })
    expect(listRunApprovals('run-1')).toHaveLength(1)
  })

  it('auto-resolves cleared conditions once and does not reopen the same episode', () => {
    const flow = state({ hold: { reason: 'review_pane_unknown', since: AT } })
    reconcileFlowIncidents(flow, obs({ now: NOW + 6000, pane_diagnostics: { dev: null, review: 'footer absent' } }), hold('review_pane_unknown'), { root, now: NOW + 6000, pane_unknown_grace_ms: 5000 })
    const opened = listFlowIncidents('run-1', { root })[0]!
    reconcileFlowIncidents(flow, obs({ now: NOW + 7000 }), hold('head_unchanged'), { root, now: NOW + 7000, pane_unknown_grace_ms: 5000 })
    expect(listFlowIncidents('run-1', { root, open_only: true })).toHaveLength(0)
    reconcileFlowIncidents(flow, obs({ now: NOW + 8000, pane_diagnostics: { dev: null, review: 'footer absent' } }), hold('review_pane_unknown'), { root, now: NOW + 8000, pane_unknown_grace_ms: 5000 })
    expect(listFlowIncidents('run-1', { root })).toHaveLength(1)
    expect(listFlowIncidents('run-1', { root })[0]).toMatchObject({ id: opened.id, status: 'resolved' })
    expect(readFlow('run-1', { root }).log.filter(entry => entry.event === 'incident_opened')).toHaveLength(1)
    expect(readFlow('run-1', { root }).log.filter(entry => entry.event === 'incident_resolved')).toHaveLength(1)
  })

  it('persists open incidents across a fresh read and requires a note to resolve', () => {
    const flow = state({ state: 'escalated' })
    reconcileFlowIncidents(flow, obs(), hold('review_timeout'), { root, now: NOW })
    const incident = listFlowIncidents('run-1', { root })[0]!
    expect(listFlowIncidents('run-1', { root, open_only: true })[0]?.id).toBe(incident.id)
    expect(() => resolveFlowIncident('run-1', incident.id, '  ', { root })).toThrow(/requires a note/)
    const resolved = resolveFlowIncident('run-1', incident.id, 'reviewer recovered and flow was resumed', { root, at: new Date(NOW + 1000).toISOString() })
    expect(resolved).toMatchObject({ status: 'resolved', note: 'reviewer recovered and flow was resumed' })
  })
})
