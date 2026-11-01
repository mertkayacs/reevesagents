// `flow_plan` and `flow_plan_import` through the real MCP dispatch: read a plan, import one, and refuse
// honestly when there is nothing to read.
//
// The tools are the same contract as the CLI (§7 of docs/plan-model-design.md): a payload never carries a
// brief body, an import never demotes a closed item, and a `dry_run` writes nothing.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createFlowState } from '../src/core/flow.js'
import { saveFlow } from '../src/core/flow-store.js'
import { readPlan } from '../src/core/plan.js'

vi.mock('node:child_process', () => ({ execFileSync: vi.fn(() => ''), spawnSync: vi.fn(() => ({ status: 1, stdout: '' })) }))
vi.mock('../src/core/runtime.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/core/runtime.js')>()),
  paneBusy: () => 'idle',
  peekAgentRaw: () => '',
  sendWhenIdle: () => ({ sent: true }),
}))

const { handleAgentMcpTool } = await import('../src/surfaces/mcp/server.js')

let registry: string
let savedRegistry: string | undefined
const RUN = 'run-plan'

const DOC = [
  '- [x] **P1.1.1** — create the workspace',
  '- [ ] **P1.1.2** — wire lint',
].join('\n')

beforeEach(() => {
  registry = mkdtempSync(join(tmpdir(), 'reeves-mcp-plan-'))
  savedRegistry = process.env.REEVES_REGISTRY
  process.env.REEVES_REGISTRY = registry
  process.env.REEVES_CONFIG = join(registry, 'config.json')
  mkdirSync(join(registry, 'flows'), { recursive: true })
  saveFlow(createFlowState({
    run_id: RUN,
    repo: registry,
    roles: { dev: 'dev-1', review: 'rev-1' },
    max_rounds: 6,
    review_timeout_sec: 1800,
    at: '2026-11-02T09:00:00.000Z',
  }))
  writeFileSync(join(registry, 'plan.md'), DOC)
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

describe('flow_plan_import', () => {
  it('imports the document and reports what changed', () => {
    const body = payload(call('flow_plan_import', { run_id: RUN, file: join(registry, 'plan.md') }))
    expect(body.added).toEqual(['P1.1.1', 'P1.1.2'])
    expect(body.total).toBe(2)
    expect(body.dry_run).toBe(false)
    expect(readPlan(RUN).items).toHaveLength(2)
  })

  it('writes nothing on dry_run', () => {
    const body = payload(call('flow_plan_import', { run_id: RUN, file: join(registry, 'plan.md'), dry_run: true }))
    expect(body.dry_run).toBe(true)
    expect(body.added).toEqual(['P1.1.1', 'P1.1.2'])
    expect(() => readPlan(RUN)).toThrow(/no plan/)
  })

  it('answers with an error when the file cannot be read', () => {
    const result = call('flow_plan_import', { run_id: RUN, file: join(registry, 'nope.md') })
    expect(result.isError).toBe(true)
    expect(payload(result).error).toContain('cannot read')
  })
})

describe('flow_plan', () => {
  it('answers with an error when no plan was imported', () => {
    const result = call('flow_plan', { run_id: RUN })
    expect(result.isError).toBe(true)
    expect(payload(result).error).toContain('no plan for run')
  })

  it('reads the whole plan with progress, waiting lists and the next item', () => {
    call('flow_plan_import', { run_id: RUN, file: join(registry, 'plan.md') })
    const body = payload(call('flow_plan', { run_id: RUN }))

    expect(body.progress).toEqual({ done: 0, total: 2 })
    expect(body.next).toMatchObject({ id: 'P1.1.1', status: 'pending' })
    expect(body.waiting.conflicts).toBe(0)
    // The items carry no brief body: a payload is a transcript, the file is the record.
    expect(JSON.stringify(body)).not.toContain('requirements')
  })

  it('reads one item, and says so when the id is unknown', () => {
    call('flow_plan_import', { run_id: RUN, file: join(registry, 'plan.md') })
    const one = payload(call('flow_plan', { run_id: RUN, item_id: 'P1.1.1' }))
    expect(one.item).toMatchObject({ id: 'P1.1.1', status: 'pending', head: null, rounds: 0 })

    const missing = call('flow_plan', { run_id: RUN, item_id: 'NOPE' })
    expect(missing.isError).toBe(true)
    expect(payload(missing).error).toContain('no plan item NOPE')
  })

  it('keeps the flow state summary in step with the plan', () => {
    call('flow_plan_import', { run_id: RUN, file: join(registry, 'plan.md') })
    const state = JSON.parse(readFileSync(join(registry, 'flows', `${RUN}.json`), 'utf-8')) as { plan?: { total: number } }
    expect(state.plan?.total).toBe(2)
  })
})
