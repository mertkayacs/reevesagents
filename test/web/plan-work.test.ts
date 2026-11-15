// `GET /api/plan` on a flow driven from the spec queue: the tab has to list work even when nobody imported a plan document.
//
// The payload is the surface's contract (`{ run_id, plan, work }`), so it is asserted end to end over a real server and a
// seeded flow rather than by calling the projection directly — the projection already has its own unit tests.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { request } from 'node:http'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { startWebServer, type WebServerHandle } from '../../src/surfaces/webui/server.js'
import { createFlowState } from '../../src/core/flow.js'
import type { FlowState } from '../../src/core/flow.js'
import { flowsDir, saveFlow } from '../../src/core/flow-store.js'
import { savePlan } from '../../src/core/plan.js'
import type { Plan, PlanItem } from '../../src/core/plan.js'

let tmpDir: string
let handles: WebServerHandle[]
let originalConfig: string | undefined

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeves-web-plan-work-'))
  originalConfig = process.env.REEVES_CONFIG
  process.env.REEVES_REGISTRY = tmpDir
  process.env.REEVES_CONFIG = join(tmpDir, 'config.json')
  handles = []
})

afterEach(async () => {
  for (const handle of handles) await handle.close()
  delete process.env.REEVES_REGISTRY
  if (originalConfig === undefined) delete process.env.REEVES_CONFIG
  else process.env.REEVES_CONFIG = originalConfig
  rmSync(tmpDir, { recursive: true, force: true })
})

async function start(): Promise<WebServerHandle> {
  const handle = await startWebServer({ port: 0, open: false })
  handles.push(handle)
  return handle
}

function get(port: number, path: string): Promise<{ status: number | undefined, body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method: 'GET', agent: false }, res => {
      let body = ''
      res.on('data', chunk => { body += chunk })
      res.on('end', () => resolve({ status: res.statusCode, body }))
    })
    req.on('error', reject)
    req.end()
  })
}

function spec(id: string, title: string) {
  return { id, title, goal: 'g', requirements: [], checks: [], report: [] }
}

function flowState(overrides: Partial<FlowState> = {}): FlowState {
  return {
    ...createFlowState({
      run_id: 'run-1',
      repo: tmpDir,
      roles: { dev: 'dev-1', review: 'rev-1' },
      head: 'aaaaaaa',
      at: '2026-11-01T00:00:00.000Z',
      specs: [spec('UI-1', 'first brief'), spec('UI-2', 'second brief')],
    }),
    ...overrides,
  }
}

describe('GET /api/plan carries the derived work view', () => {
  it('lists the spec rows of a flow with no plan document', async () => {
    saveFlow(flowState({
      dispatched_specs: ['UI-1'],
      log: [{ at: '2026-11-01T00:01:00.000Z', event: 'dispatch_spec', detail: 'spec_dispatched UI-1' }],
    }))
    const handle = await start()
    const res = await get(handle.port, '/api/plan?run=run-1')
    expect(res.status).toBe(200)
    const payload = JSON.parse(res.body)
    expect(payload.plan).toBeNull()
    expect(payload.work.total).toBe(2)
    expect(payload.work.current).toMatchObject({
      id: 'UI-1',
      status: 'in_work',
      origin: 'spec',
      holder: { role: 'dev', agent_id: 'dev-1' },
    })
    expect(payload.work.items.map((row: { id: string, status: string }) => [row.id, row.status]))
      .toEqual([['UI-1', 'in_work'], ['UI-2', 'queued']])
  })

  it('lists a plan row and an off-plan spec side by side', async () => {
    saveFlow(flowState({
      specs: [spec('UI-9', 'off-plan brief')],
      state: 'reviewing',
      claim: { head: 'bbbbbbb', verdict: null, verdict_count: 0, verdict_applied: false, spec_id: 'P1' },
      log: [
        { at: '2026-11-01T00:01:00.000Z', event: 'dispatch_spec', detail: 'plan_item_dispatched P1' },
        { at: '2026-11-01T00:02:00.000Z', event: 'request_review', detail: 'review_requested bbbbbbb' },
      ],
    }))
    const item: PlanItem = {
      id: 'P1', title: 'plan item', status: 'reviewing', spec: null, spec_path: null, spec_hash: null, head: 'bbbbbbb',
      rounds: 1, notes_ref: null, updated_at: '2026-11-01T00:02:00.000Z', owner_action: false, missing_since: null, line: 1,
    }
    const plan: Plan = {
      schema_version: 1, run_id: 'run-1', source_path: 'docs/implementation-plan.md', source_hash: 'h',
      imported_at: '2026-11-01T00:00:00.000Z', items: [item], conflicts: [],
    }
    savePlan(plan, { root: tmpDir, run_id: 'run-1' } as never)
    const handle = await start()
    const res = await get(handle.port, '/api/plan?run=run-1')
    expect(res.status).toBe(200)
    const payload = JSON.parse(res.body)
    expect(payload.plan).not.toBeNull()
    expect(payload.work.items.map((row: { id: string, origin: string }) => [row.id, row.origin]))
      .toEqual([['P1', 'plan'], ['UI-9', 'spec']])
    expect(payload.work.current?.id).toBe('P1')
  })

  it('reports an unconfirmed dispatch that cannot be attributed, instead of claiming an idle flow', async () => {
    saveFlow(flowState({
      specs: [spec('UI-1', 'first brief')],
      log: [{ at: '2026-11-01T00:01:00.000Z', event: 'dispatch_unconfirmed', detail: 'paste_unconfirmed review_requested bbbbbbb' }],
    }))
    const handle = await start()
    const res = await get(handle.port, '/api/plan?run=run-1')
    const payload = JSON.parse(res.body)
    expect(payload.work.dispatch_unknown).toBe(true)
    expect(payload.work.current).toBeNull()
  })
})

// The notes inbox is where a reviewer answers; a run that never had one simply has no evidence.
describe('GET /api/plan and the notes directory', () => {
  it('closes a row on the answer the reviewer wrote', async () => {
    saveFlow(flowState({
      specs: [spec('UI-1', 'first brief')],
      state: 'reviewing',
      dispatched_specs: ['UI-1'],
      claim: { head: 'bbbbbbb', verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null },
      log: [
        { at: '2026-11-01T00:01:00.000Z', event: 'dispatch_spec', detail: 'spec_dispatched UI-1' },
        { at: '2026-11-01T00:02:00.000Z', event: 'request_review', detail: 'review_requested bbbbbbb' },
      ],
    }))
    const inbox = join(flowsDir(tmpDir), 'run-1', 'notes', 'inbox')
    mkdirSync(inbox, { recursive: true })
    writeFileSync(join(inbox, 'bbbbbbb-r1.md'), 'VERDICT: ACCEPT\n')
    const handle = await start()
    const res = await get(handle.port, '/api/plan?run=run-1')
    const payload = JSON.parse(res.body)
    expect(payload.work.items[0]).toMatchObject({ id: 'UI-1', status: 'done' })
    expect(payload.work.current).toBeNull()
  })
})
