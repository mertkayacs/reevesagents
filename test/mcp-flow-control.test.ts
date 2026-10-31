import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { FlowState } from '../src/core/flow.js'
import { PENDING_TTL_SEC, createFlowState } from '../src/core/flow.js'
import { readFlow, saveFlow } from '../src/core/flow-store.js'
import { writeAgent, writeRun } from '../src/core/runs.js'

// `flow_step` and `flow_control` through the real MCP dispatch: one step per call, the same claim
// protocol as the CLI (two concurrent calls paste one prompt, not two), and control actions that
// answer with the flow payload instead of a bare "ok".
//
// The runtime is mocked at the module seam (`paneBusy`/`peekAgentRaw`/`sendWhenIdle`), so no tmux
// server is touched — this file runs with the operator's fleet up.

const HEAD = 'bbb222'

const execFileSync = vi.hoisted(() => vi.fn((file: string, args: string[] = []) => {
  if (file === 'which') throw new Error('not found')
  if (file === 'git' && args.includes('rev-parse')) return `${HEAD}\n`
  if (file === 'git' && args.includes('status')) return ''
  return ''
}))
vi.mock('node:child_process', () => ({ execFileSync, spawnSync: vi.fn(() => ({ status: 1, stdout: '', stderr: '' })) }))

const runtime = vi.hoisted(() => ({
  paneBusy: vi.fn(() => 'idle' as const),
  peekAgentRaw: vi.fn(() => ''),
  sendWhenIdle: vi.fn((_agentId: string, _text: string) => ({ sent: true as const })),
}))
vi.mock('../src/core/runtime.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/core/runtime.js')>()),
  ...runtime,
}))

const { handleAgentMcpTool } = await import('../src/surfaces/mcp/server.js')

let registry: string
let repo: string
let savedRegistry: string | undefined

beforeEach(() => {
  registry = mkdtempSync(join(tmpdir(), 'reeves-mcp-flow-control-'))
  repo = join(registry, 'project')
  mkdirSync(repo, { recursive: true })
  savedRegistry = process.env.REEVES_REGISTRY
  process.env.REEVES_REGISTRY = registry
  process.env.REEVES_CONFIG = join(registry, 'config.json')
  runtime.paneBusy.mockClear()
  runtime.paneBusy.mockImplementation(() => 'idle')
  runtime.peekAgentRaw.mockClear()
  runtime.peekAgentRaw.mockImplementation(() => '')
  runtime.sendWhenIdle.mockReset()
  runtime.sendWhenIdle.mockImplementation(() => ({ sent: true as const }))
})

afterEach(() => {
  if (savedRegistry === undefined) delete process.env.REEVES_REGISTRY
  else process.env.REEVES_REGISTRY = savedRegistry
  delete process.env.REEVES_CONFIG
  rmSync(registry, { recursive: true, force: true })
})

type ToolResult = { content: Array<{ text: string }>, isError?: boolean }

function payload(result: ToolResult): any {
  return JSON.parse(result.content[0]!.text)
}

function call(name: string, args: Record<string, unknown>): ToolResult {
  return handleAgentMcpTool(name, args) as ToolResult
}

const RUN = 'run-step'

function seedRun(runId = RUN): void {
  writeRun({
    id: runId,
    name: runId,
    status: 'running',
    tmux_session: `reeves-${runId}`,
    reeves_window_id: '@0',
    reeves_pane_id: '%0',
    root_agent_id: `${runId}-dev`,
    working_dir: repo,
    preset_name: null,
    started_at: '2026-01-01T00:00:00.000Z',
    ended_at: null,
  })
  for (const id of ['dev-1', 'rev-1']) {
    writeAgent({
      id,
      run_id: runId,
      nickname: id,
      provider: 'cc',
      model: '',
      role: 'worker',
      working_dir: repo,
      task: 't',
      task_status: 'working',
      task_note: '',
      tmux_session: `reeves-${runId}`,
      tmux_window_id: '@1',
      tmux_pane_id: '%1',
      rc_enabled: false,
      permissions: 'ask',
      inbox: [],
      last_seen: Date.parse('2026-01-01T00:00:00.000Z'),
      started_at: '2026-01-01T00:00:00.000Z',
      ended_at: null,
    })
  }
}

function seedFlow(overrides: Partial<FlowState> = {}, runId = RUN): FlowState {
  const state = {
    ...createFlowState({
      run_id: runId,
      repo,
      roles: { dev: 'dev-1', review: 'rev-1' },
      head: 'aaa111',
      at: '2026-01-01T00:00:00.000Z',
    }),
    ...overrides,
  }
  saveFlow(state, { root: registry })
  return state
}

describe('flow_step', () => {
  it('runs one engine step, sends the review request and answers with the new state', () => {
    seedRun()
    seedFlow()

    const result = call('flow_step', { run_id: RUN })
    const body = payload(result)

    expect(result.isError).toBeFalsy()
    expect(body.changed).toBe(true)
    expect(body.status).toBe('applied')
    expect(body.decision).toBe('request_review')
    expect(body.send).toEqual({ sent: true, reason: null })
    expect(body.flow.state).toBe('reviewing')
    expect(body.flow.head).toBe(HEAD)
    expect(runtime.sendWhenIdle).toHaveBeenCalledTimes(1)
    expect(runtime.sendWhenIdle.mock.calls[0]![0]).toBe('rev-1')
    expect(readFlow(RUN, { root: registry }).state).toBe('reviewing')
  })

  it('answers changed:false with the reason when it decides to hold', () => {
    seedRun()
    seedFlow({ state: 'paused', paused_from: 'idle', paused_at: Date.parse('2026-01-01T00:00:00.000Z') })

    const body = payload(call('flow_step', { run_id: RUN }))

    expect(body.changed).toBe(false)
    expect(body.status).toBe('skipped')
    expect(body.reason).toBe('flow_paused')
    expect(runtime.sendWhenIdle).not.toHaveBeenCalled()
    expect(readFlow(RUN, { root: registry }).state).toBe('paused')
  })

  it('sends nothing and writes nothing for dry_run', () => {
    seedRun()
    seedFlow()
    const before = JSON.stringify(readFlow(RUN, { root: registry }))

    const body = payload(call('flow_step', { run_id: RUN, dry_run: true }))

    expect(body.dry_run).toBe(true)
    expect(body.decision).toBe('request_review')
    expect(runtime.sendWhenIdle).not.toHaveBeenCalled()
    expect(JSON.stringify(readFlow(RUN, { root: registry }))).toBe(before)
  })

  it('lets a concurrent flow_step find the claim and paste nothing', () => {
    seedRun()
    seedFlow()
    let nested: any
    runtime.sendWhenIdle.mockImplementation(() => {
      // A second MCP client stepping the same flow while this paste is in flight. Without the claim
      // this call would read the same idle state and paste the same review request a second time.
      nested = payload(call('flow_step', { run_id: RUN }))
      return { sent: true as const }
    })

    const first = payload(call('flow_step', { run_id: RUN }))

    expect(first.changed).toBe(true)
    expect(nested.changed).toBe(false)
    expect(nested.reason).toBe('dispatch_pending')
    expect(nested.flow.pending).toMatchObject({ kind: 'request_review', target: 'review' })
    expect(runtime.sendWhenIdle).toHaveBeenCalledTimes(1)
    // One paste for two callers, and the flow ended in `reviewing` exactly once.
    const after = readFlow(RUN, { root: registry })
    expect(after.state).toBe('reviewing')
    expect(after.pending).toBeNull()
    expect(after.log.filter(entry => entry.event === 'dispatch_claimed')).toHaveLength(1)
  })

  it('escalates a claim nobody settled instead of sending it again', () => {
    seedRun()
    seedFlow({
      pending: {
        op_id: 'op-dead',
        kind: 'request_review',
        target: 'review',
        head: 'aaa111',
        spec_id: null,
        at: Date.now() - (PENDING_TTL_SEC + 1) * 1000,
      },
    })

    const body = payload(call('flow_step', { run_id: RUN }))

    expect(body.reason).toBe('dispatch_unresolved')
    expect(body.flow.state).toBe('escalated')
    expect(runtime.sendWhenIdle).not.toHaveBeenCalled()
  })

  it('rejects empty arguments through the handler, not through the unknown-tool path', () => {
    const empty = call('flow_step', {})
    expect(empty.isError).toBe(true)
    expect(payload(empty).error).not.toContain('Unknown tool')
    expect(payload(empty).error).toContain('run id is required')
  })
})

describe('flow_control', () => {
  it('pauses and resumes, answering with the flow payload', () => {
    seedRun()
    seedFlow({ state: 'reviewing', review_started_at: Date.parse('2026-01-01T00:00:00.000Z') })

    const paused = payload(call('flow_control', { run_id: RUN, action: 'pause' }))
    expect(paused.state).toBe('paused')
    expect(paused.paused_from).toBe('reviewing')

    const resumed = payload(call('flow_control', { run_id: RUN, action: 'resume' }))
    expect(resumed.state).toBe('reviewing')
    expect(resumed.paused_from).toBeNull()
  })

  it('refuses stop without confirm and stops with it', () => {
    seedRun()
    seedFlow()

    const refused = call('flow_control', { run_id: RUN, action: 'stop' })
    expect(refused.isError).toBe(true)
    expect(payload(refused).error).toContain('confirm: true')
    expect(readFlow(RUN, { root: registry }).state).toBe('idle')

    const stopped = payload(call('flow_control', { run_id: RUN, action: 'stop', confirm: true }))
    expect(stopped.state).toBe('done')
    expect(stopped.close_reason).toBe('stopped by the operator')
  })

  it('queues a block with add_spec and refuses a block without criteria', () => {
    seedRun()
    seedFlow()
    const good = join(repo, 'block_07.json')
    writeFileSync(good, JSON.stringify({
      id: 'block_07', title: 'Lifecycle', goal: 'g', requirements: ['r'], checks: ['c'],
    }), 'utf-8')
    const thin = join(repo, 'thin.json')
    writeFileSync(thin, JSON.stringify({ id: 'block_08', title: 'Thin' }), 'utf-8')

    const queued = payload(call('flow_control', { run_id: RUN, action: 'add_spec', file: good }))
    expect(queued.queued).toEqual([{ id: 'block_07', title: 'Lifecycle', unstructured: false }])
    expect(queued.flow.queue.map((entry: { id: string }) => entry.id)).toEqual(['block_07'])

    const refused = call('flow_control', { run_id: RUN, action: 'add_spec', file: thin })
    expect(refused.isError).toBe(true)
    expect(payload(refused).error).toContain('requirements')
  })

  it('queues a markdown block only as an explicit downgrade', () => {
    seedRun()
    seedFlow()
    const md = join(repo, 'block_09.md')
    writeFileSync(md, '# Block 09 — notes\n\nBody.\n', 'utf-8')

    const body = payload(call('flow_control', { run_id: RUN, action: 'add_spec', markdown: md }))
    expect(body.queued[0].unstructured).toBe(true)
  })

  it('answers an unknown action with an error, never with ok: true', () => {
    seedRun()
    seedFlow()

    const result = call('flow_control', { run_id: RUN, action: 'restart' })
    expect(result.isError).toBe(true)
    expect(payload(result).error).toContain('unknown action')
    expect(readFlow(RUN, { root: registry }).state).toBe('idle')
  })

  it('rejects empty arguments through the handler, not through the unknown-tool path', () => {
    const empty = call('flow_control', {})
    expect(empty.isError).toBe(true)
    expect(payload(empty).error).not.toContain('Unknown tool')
    expect(payload(empty).error).toContain('run id is required')
  })
})
