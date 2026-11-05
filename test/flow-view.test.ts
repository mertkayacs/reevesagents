import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir, tmpdir } from 'node:os'
import type { FlowState } from '../src/core/flow.js'
import { createFlowState } from '../src/core/flow.js'
import { flowPath, saveFlow } from '../src/core/flow-store.js'
import { flowBadge, flowDispatchNote, flowSectionLines, flowStatusPayload, readFlowBadge, resolveFlowRunId } from '../src/core/flow-view.js'

// The published payload: one shape for `flow status --json` and for the MCP `flow_status` tool, so
// a host CLI and a terminal cannot be told different things about the same flow.

let root: string
let savedHome: string | undefined

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'reeves-flow-view-'))
  // HOME is pinned to the test root: the shorthand applies to paths under $HOME, and where the
  // system puts its temp directory (TMPDIR may be /tmp) must not decide whether this test passes.
  savedHome = process.env.HOME
  process.env.HOME = root
})

afterEach(() => {
  if (savedHome === undefined) delete process.env.HOME
  else process.env.HOME = savedHome
  rmSync(root, { recursive: true, force: true })
})

function makeState(runId: string, overrides: Partial<FlowState> = {}): FlowState {
  return {
    ...createFlowState({
      run_id: runId,
      repo: join(homedir(), 'projects', 'demo'),
      roles: { dev: 'dev-1', review: 'rev-1' },
      head: 'a'.repeat(40),
      at: '2026-01-01T00:00:00.000Z',
    }),
    ...overrides,
  }
}

function seed(runId: string, overrides: Partial<FlowState> = {}): FlowState {
  const state = makeState(runId, overrides)
  saveFlow(state, { root })
  return state
}

describe('a flow file that records no flow', () => {
  it('gives the run no badge, and status answers "flow not started" instead of a closed flow', () => {
    // The phantom an older build could leave behind: it parses, it says `done`, and it records no start. Before the
    // read path refused it, the board drew "flow: closed" on a run whose pipeline never existed (block 63, MAJOR).
    mkdirSync(join(root, 'flows'), { recursive: true })
    writeFileSync(flowPath('run-1', root), JSON.stringify({
      ...makeState('run-1'),
      state: 'done',
      started_at: '',
      claim: { head: '', verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null },
      log: [],
    }), 'utf-8')

    expect(readFlowBadge('run-1', Date.parse('2026-01-02T00:00:00.000Z'), root)).toBeNull()
    expect(() => resolveFlowRunId('run-1', root)).toThrow(/no flow for run run-1 \(flow not started/)
  })
})

describe('resolveFlowRunId', () => {
  it('resolves an exact id and a unique prefix', () => {
    seed('648c1eb9-cfec-4c53-abc9-f842caa7e3a4')
    seed('aaaa1111-0000-0000-0000-000000000000')
    expect(resolveFlowRunId('aaaa1111-0000-0000-0000-000000000000', root)).toBe('aaaa1111-0000-0000-0000-000000000000')
    expect(resolveFlowRunId('aaaa', root)).toBe('aaaa1111-0000-0000-0000-000000000000')
  })

  it('refuses an ambiguous prefix, listing the candidates', () => {
    seed('run-aaaa')
    seed('run-bbbb')
    expect(() => resolveFlowRunId('run-', root)).toThrow(/ambiguous run id: run-aaaa, run-bbbb/)
  })

  it('says which flows exist when the id is unknown', () => {
    expect(() => resolveFlowRunId('ghost', root)).toThrow(/no flows exist yet/)
    seed('run-aaaa')
    expect(() => resolveFlowRunId('ghost', root)).toThrow(/flows exist for: run-aaaa/)
    expect(() => resolveFlowRunId('  ', root)).toThrow(/a run id is required/)
  })
})

describe('flowStatusPayload', () => {
  it('summarises the queue without the block bodies and lists only undispatched blocks', () => {
    const payload = flowStatusPayload(makeState('run-q', {
      specs: [
        { id: 'block_05', title: 'Next', goal: 'g', requirements: ['r'], checks: ['c'], report: [], body: 'long markdown', source_path: '/tmp/block_05.json' },
        { id: 'block_04', title: 'Done', goal: '', requirements: [], checks: [], report: [], unstructured: true },
      ],
      dispatched_specs: ['block_04'],
    }))

    expect(payload.queue).toEqual([{ id: 'block_05', title: 'Next', source_path: '/tmp/block_05.json' }])
    expect(JSON.stringify(payload)).not.toContain('long markdown')
    expect(payload.dispatched_specs).toEqual(['block_04'])
  })

  it('renders paths home-shortened and redacts the log detail', () => {
    // Built from parts: a literal secret in the source is rewritten by the workspace secret
    // scanner, which makes the assertion impossible to read.
    const secret = ['sk', 'ant', 'abcdefghijklmnopqrstuvwxyz012345'].join('-')
    const path = join(root, 'flows', 'run-p.json')
    const payload = flowStatusPayload(makeState('run-p', {
      log: [{ at: '2026-01-01T00:01:00.000Z', event: 'fix_dispatched', detail: `round 1 token ${secret}` }],
    }), path)

    expect(payload.repo).toBe('~/projects/demo')
    expect(payload.path).toBe('~/flows/run-p.json')
    expect(JSON.stringify(payload)).not.toContain(root)
    expect(payload.log[0]!.detail).toContain('[REDACTED]')
    expect(payload.log[0]!.detail).not.toContain(secret)
    expect(payload.last_decision?.event).toBe('fix_dispatched')
  })

  it('redacts a block title in the queue summary, which the flow file keeps verbatim', () => {
    const secret = ['sk', 'ant', 'abcdefghijklmnopqrstuvwxyz012345'].join('-')
    const state = makeState('run-t', {
      specs: [{ id: 'block_06', title: `leaked ${secret}`, goal: '', requirements: ['r'], checks: ['c'], report: [] }],
    })
    const payload = flowStatusPayload(state)

    expect(payload.queue[0]!.title).toContain('[REDACTED]')
    expect(payload.queue[0]!.title).not.toContain(secret)
    // The payload is a view; the queued spec itself is untouched.
    expect(state.specs[0]!.title).toContain(secret)
  })

  it('carries the review deadline and the round budget a host needs to reason about a stall', () => {
    const payload = flowStatusPayload(makeState('run-d', {
      repo: '/repo',
      max_rounds: 4,
      review_timeout_sec: 120,
      state: 'reviewing',
      rounds: 2,
      review_started_at: 1730000000000,
      claim: { head: 'abc1234', verdict: 'CHANGES_REQUESTED', verdict_count: 3, verdict_applied: false, spec_id: null },
    }))

    expect(payload).toMatchObject({
      state: 'reviewing',
      rounds: 2,
      max_rounds: 4,
      review_timeout_sec: 120,
      review_started_at: 1730000000000,
      head: 'abc1234',
      // `claim` is compared as a whole, so it names every field the payload carries — including the one that says whether
      // the verdict was applied.
      claim: { head: 'abc1234', verdict: 'CHANGES_REQUESTED', verdict_count: 3, verdict_applied: false, spec_id: null },
      last_decision: null,
    })
  })
})

describe('a dispatch nobody confirmed is visible, not only journalled (block 69)', () => {
  const UNCONFIRMED = [
    { at: '2026-01-01T00:00:00.000Z', event: 'dispatch_claimed', detail: 'review_requested abc1234' },
    { at: '2026-01-01T00:00:01.000Z', event: 'dispatch_unconfirmed', detail: 'unconfirmed review_requested abc1234' },
    { at: '2026-01-01T00:00:02.000Z', event: 'hold', detail: 'awaiting_verdict' },
  ]

  it('reports it in the payload, with the journal\'s own words', () => {
    const state = makeState('run-unconfirmed', {
      state: 'idle',
      log: UNCONFIRMED,
    })

    expect(flowDispatchNote(state)).toEqual({
      state: 'unconfirmed',
      reason: 'unconfirmed review_requested abc1234',
      at: '2026-01-01T00:00:01.000Z',
    })
    expect(flowStatusPayload(state).dispatch).toMatchObject({ state: 'unconfirmed' })
  })

  it('keeps it while the retry is pending, and drops it once a dispatch settles', () => {
    const retry = makeState('run-retry', {
      log: [...UNCONFIRMED, { at: '2026-01-01T00:01:00.000Z', event: 'dispatch_retry_enter', detail: 'unconfirmed_paste: attempt 1/3' }],
    })
    expect(flowDispatchNote(retry)?.reason).toContain('attempt 1/3')

    const settled = makeState('run-settled', {
      log: [...UNCONFIRMED, { at: '2026-01-01T00:02:00.000Z', event: 'request_review', detail: 'review_requested abc1234' }],
    })
    expect(flowDispatchNote(settled)).toBeNull()
  })

  it('puts the flow badge into the attention tone', () => {
    // The chip already knows how to say "a human has to look"; a dispatch that never started is exactly that.
    const state = makeState('run-badge', { state: 'idle', log: UNCONFIRMED })
    const badge = flowBadge(state, Date.parse('2026-01-01T00:00:03.000Z'))
    expect(badge.attention).toBe('dispatch_unconfirmed')
    // A closed or parked flow owns no attention: nobody is waiting for it to move.
    expect(flowBadge({ ...state, state: 'paused' }).attention).not.toBe('dispatch_unconfirmed')
    expect(flowBadge({ ...state, state: 'done' }).attention).not.toBe('dispatch_unconfirmed')
  })

  it('surfaces an overdue plan-item dev stall and its persisted clock in status', () => {
    const state = makeState('run-stall', { stalled_since: Date.parse('2026-01-01T00:00:00.000Z'), dev_timeout_sec: 900 })
    const badge = flowBadge(state, Date.parse('2026-01-01T00:15:00.000Z'))
    expect(badge.attention).toBe('dev_stalled')
    expect(flowStatusPayload(state).stalled_since).toBe(state.stalled_since)
    expect(flowStatusPayload(state).dev_timeout_sec).toBe(900)
    expect(flowSectionLines(state).some(line => line.includes('attention dev stalled'))).toBe(true)
  })
})
