import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { homedir, tmpdir } from 'node:os'
import type { FlowState } from '../src/core/flow.js'
import { createFlowState } from '../src/core/flow.js'
import { saveFlow } from '../src/core/flow-store.js'
import { flowStatusPayload, resolveFlowRunId } from '../src/core/flow-view.js'

// The published payload: one shape for `flow status --json` and for the MCP `flow_status` tool, so
// a host CLI and a terminal cannot be told different things about the same flow.

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'reeves-flow-view-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function makeState(runId: string, overrides: Partial<FlowState> = {}): FlowState {
  return {
    ...createFlowState({
      run_id: runId,
      repo: join(homedir(), 'projects', 'demo'),
      roles: { dev: 'dev-1', review: 'rev-1' },
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
    const payload = flowStatusPayload(makeState('run-p', {
      log: [{ at: '2026-01-01T00:01:00.000Z', event: 'fix_dispatched', detail: `round 1 token ${secret}` }],
    }))

    expect(payload.repo).toBe('~/projects/demo')
    // The registry in a test is a temp dir, but it is still under $HOME: the shorthand applies.
    expect(payload.path.startsWith('~')).toBe(true)
    expect(payload.path).not.toContain(homedir())
    expect(payload.log[0]!.detail).toContain('[REDACTED]')
    expect(payload.log[0]!.detail).not.toContain(secret)
    expect(payload.last_decision?.event).toBe('fix_dispatched')
  })

  it('carries the review deadline and the round budget a host needs to reason about a stall', () => {
    const payload = flowStatusPayload(makeState('run-d', {
      repo: '/repo',
      max_rounds: 4,
      review_timeout_sec: 120,
      state: 'reviewing',
      rounds: 2,
      review_started_at: 1730000000000,
      claim: { head: 'abc1234', verdict: 'CHANGES_REQUESTED', verdict_count: 3 },
    }))

    expect(payload).toMatchObject({
      state: 'reviewing',
      rounds: 2,
      max_rounds: 4,
      review_timeout_sec: 120,
      review_started_at: 1730000000000,
      head: 'abc1234',
      claim: { head: 'abc1234', verdict: 'CHANGES_REQUESTED', verdict_count: 3 },
      last_decision: null,
    })
  })
})
