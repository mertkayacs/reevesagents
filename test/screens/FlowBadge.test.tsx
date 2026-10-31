import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'ink-testing-library'
import stripAnsi from 'strip-ansi'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Router } from '../../src/surfaces/tui/router.js'
import * as runsState from '../../src/core/runs.js'
import type { AgentRecord, RunRecord } from '../../src/core/types.js'
import { createFlowState } from '../../src/core/flow.js'
import { saveFlow } from '../../src/core/flow-store.js'

// The flow badge is a derived view: it is read from the flow file on every refresh and never
// written into a run record. These tests pin the text, the width behaviour at the real 80x24
// panel, and the fact that the run record is untouched while the badge comes and goes.

const viewport = vi.hoisted(() => ({ current: { columns: 120, rows: 24 } }))

vi.mock('ink', async () => {
  const actual = await vi.importActual<typeof import('ink')>('ink')
  return { ...actual, useWindowSize: () => viewport.current }
})

vi.mock('../../src/core/runs.js', async () => {
  const actual = await vi.importActual('../../src/core/runs.js')
  return {
    ...actual,
    listRuns: vi.fn(() => []),
    listAgents: vi.fn(() => []),
    listRunHistory: vi.fn(() => []),
    autoCleanupRuns: vi.fn(() => ({ removed: [], archived: [] })),
  }
})

let registry: string

function makeRun(id = 'run-flow'): RunRecord {
  return {
    id,
    name: 'pipeline',
    status: 'running',
    tmux_session: `reeves_${id}`,
    reeves_window_id: '@1',
    reeves_pane_id: '%1',
    root_agent_id: `${id}-root`,
    working_dir: '/tmp/project',
    preset_name: null,
    started_at: '2026-01-01T00:00:00.000Z',
    ended_at: null,
  }
}

function makeAgent(runId = 'run-flow'): AgentRecord {
  return {
    id: `${runId}-root`,
    run_id: runId,
    nickname: 'lead',
    provider: 'cc',
    model: 'sonnet',
    role: 'root',
    working_dir: '/tmp/project',
    task: '',
    task_status: 'working',
    task_note: '',
    tmux_session: `reeves_${runId}`,
    tmux_window_id: '@1',
    tmux_pane_id: '%1',
    rc_enabled: false,
    permissions: 'ask',
    inbox: [],
    last_seen: Date.now(),
    started_at: '2026-01-01T00:00:01.000Z',
    ended_at: null,
  }
}

interface FlowOverride {
  state?: 'idle' | 'reviewing' | 'fixing' | 'escalated' | 'done'
  rounds?: number
  review_started_at?: number | null
  review_timeout_sec?: number
}

function seedFlow(overrides: FlowOverride = {}): void {
  const { state, rounds, review_started_at, review_timeout_sec } = overrides
  const flow = {
    ...createFlowState({
      run_id: 'run-flow',
      repo: '/tmp/project',
      roles: { dev: 'dev-1', review: 'rev-1' },
      head: 'abc1234',
      at: '2026-01-01T00:00:00.000Z',
    }),
    ...(state ? { state } : {}),
    ...(rounds !== undefined ? { rounds } : {}),
    ...(review_started_at !== undefined ? { review_started_at } : {}),
    ...(review_timeout_sec !== undefined ? { review_timeout_sec } : {}),
  }
  saveFlow(flow, { root: registry })
}

function frameAt(columns: number, rows: number): string {
  viewport.current = { columns, rows }
  const { lastFrame, unmount } = render(<Router initialScreen="Runs" />)
  const frame = lastFrame() ?? ''
  unmount()
  return frame
}

function runLine(frame: string): string {
  return frame.split('\n').find(line => line.includes('pipeline')) ?? ''
}

beforeEach(() => {
  registry = mkdtempSync(join(tmpdir(), 'reeves-flow-badge-'))
  process.env.REEVES_REGISTRY = registry
  vi.mocked(runsState.listRuns).mockReturnValue([makeRun()])
  vi.mocked(runsState.listAgents).mockReturnValue([makeAgent()])
})

afterEach(() => {
  delete process.env.REEVES_REGISTRY
  rmSync(registry, { recursive: true, force: true })
  vi.clearAllMocks()
  viewport.current = { columns: 120, rows: 24 }
})

describe('flow badge', () => {
  it('shows the state with the round budget when the row has room', () => {
    seedFlow({ state: 'reviewing', rounds: 2 })
    const frame = frameAt(120, 24)
    expect(stripAnsi(runLine(frame))).toContain('flow: review (2/6)')
  })

  it('shows nothing for a run without a flow', () => {
    const frame = frameAt(120, 24)
    expect(frame).not.toContain('flow:')
    expect(frame).not.toContain('attention')
  })

  it('renders escalated and an overdue review as attention, with the flow state', () => {
    seedFlow({ state: 'escalated', rounds: 6 })
    const escalated = frameAt(120, 24)
    expect(stripAnsi(runLine(escalated))).toContain('flow: escalated')
    expect(escalated).toContain('needs attention')
    expect(escalated).toMatch(/attention\s+1/)

    seedFlow({ state: 'reviewing', rounds: 1, review_started_at: Date.now() - 1_000_000, review_timeout_sec: 900 })
    const overdue = frameAt(120, 24)
    expect(stripAnsi(runLine(overdue))).toContain('flow: review')
    expect(overdue).toContain('needs attention')

    // Inside the deadline the same state is not attention: the reviewer is just working.
    seedFlow({ state: 'reviewing', rounds: 1, review_started_at: Date.now(), review_timeout_sec: 900 })
    const waiting = frameAt(120, 24)
    expect(stripAnsi(runLine(waiting))).toContain('flow: review')
    expect(waiting).not.toContain('needs attention')
  })

  it('keeps the badge on the run line at the real 80x24 panel', () => {
    seedFlow({ state: 'fixing', rounds: 1 })
    const frame = frameAt(80, 24)
    const line = stripAnsi(runLine(frame))

    // Same line as the run: the badge must not wrap the row onto a second one.
    expect(line).toContain('flow: fixing')
    for (const rendered of stripAnsi(frame).split('\n')) {
      expect(rendered.length).toBeLessThanOrEqual(80)
    }
    expect(frame.split('\n').length).toBeLessThanOrEqual(24)
  })
})

describe('the badge is derived, never stored', () => {
  it('returns to "no badge" and back without touching the run record', () => {
    const run = makeRun()
    const agent = makeAgent()
    vi.mocked(runsState.listRuns).mockReturnValue([run])
    vi.mocked(runsState.listAgents).mockReturnValue([agent])
    const snapshot = JSON.parse(JSON.stringify({ run, agent }))

    seedFlow({ state: 'escalated', rounds: 6 })
    expect(frameAt(120, 24)).toContain('flow: escalated')

    // The condition disappears (the flow is closed); the badge follows it on the next read.
    seedFlow({ state: 'done', rounds: 6 })
    const after = frameAt(120, 24)
    expect(after).toContain('flow: done')
    expect(after).not.toContain('flow: escalated')
    expect(after).not.toContain('needs attention')

    // Nothing wrote the derived state into the records the dashboard reads: the flow lives in its
    // own file, and the agent's lifecycle field is exactly what the heuristic did not touch.
    expect(JSON.parse(JSON.stringify({ run, agent }))).toEqual(snapshot)
    expect(agent.task_status).toBe('working')
    expect(run.status).toBe('running')
  })
})
