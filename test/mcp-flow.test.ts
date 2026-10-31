import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createFlowState } from '../src/core/flow.js'
import { readFlow, saveFlow } from '../src/core/flow-store.js'
import { shortHomePath } from '../src/utils/paths.js'

// The two flow tools through the real MCP dispatch. `flow_status` must be read-only and
// `flow_add_spec` must validate before it touches the flow file.

const execFileSync = vi.hoisted(() => vi.fn((file: string) => {
  if (file === 'which') throw new Error('not found')
  return ''
}))
vi.mock('node:child_process', () => ({ execFileSync, spawnSync: vi.fn(() => ({ status: 1, stdout: '', stderr: '' })) }))

let registry: string
let repo: string

beforeEach(() => {
  registry = mkdtempSync(join(tmpdir(), 'reeves-mcp-flow-'))
  repo = join(registry, 'project')
  mkdirSync(repo, { recursive: true })
  process.env.REEVES_REGISTRY = registry
  process.env.REEVES_CONFIG = join(registry, 'config.json')
})

afterEach(() => {
  delete process.env.REEVES_REGISTRY
  delete process.env.REEVES_CONFIG
  rmSync(registry, { recursive: true, force: true })
})

type ToolResult = { content: Array<{ text: string }>, isError?: boolean }

function payload(result: ToolResult): any {
  return JSON.parse(result.content[0]!.text)
}

async function call(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const { handleAgentMcpTool } = await import('../src/surfaces/mcp/server.js')
  return handleAgentMcpTool(name, args) as ToolResult
}

function seedFlow(runId = 'run-flow-1') {
  const state = createFlowState({
    run_id: runId,
    repo,
    roles: { dev: 'dev-1', review: 'rev-1' },
    head: 'abc1234',
    at: '2026-01-01T00:00:00.000Z',
  })
  saveFlow(state, { root: registry })
  return state
}

function writeSpec(name: string, body: string): string {
  const path = join(repo, name)
  writeFileSync(path, body, 'utf-8')
  return path
}

const SPEC_JSON = JSON.stringify({
  id: 'block_05',
  title: 'Web panel',
  goal: 'Show the flow',
  requirements: ['card field'],
  checks: ['pnpm test'],
  report: ['files'],
})

describe('flow_status', () => {
  it('returns the published payload and changes nothing', async () => {
    const seeded = seedFlow()
    const before = JSON.stringify(readFlow('run-flow-1', { root: registry }))

    const result = await call('flow_status', { run_id: 'run-flow-1' })
    const body = payload(result)

    expect(result.isError).toBeUndefined()
    expect(body).toMatchObject({ run_id: 'run-flow-1', state: 'idle', rounds: 0, max_rounds: 6, head: 'abc1234' })
    expect(body.path).toContain('flows/run-flow-1.json')
    // Read-only: no tick, no write, no send.
    expect(JSON.stringify(readFlow('run-flow-1', { root: registry }))).toBe(before)
    expect(seeded.state).toBe('idle')
  })

  it('accepts a unique prefix and reports an unknown run with a readable error', async () => {
    seedFlow('run-flow-1')
    expect(payload(await call('flow_status', { run_id: 'run-fl' })).run_id).toBe('run-flow-1')

    const missing = await call('flow_status', { run_id: 'ghost' })
    expect(missing.isError).toBe(true)
    expect(payload(missing).error).toContain('no flow for run ghost')
  })

  it('rejects empty arguments through the handler, not through the unknown-tool path', async () => {
    const result = await call('flow_status', {})
    expect(result.isError).toBe(true)
    expect(payload(result).error).not.toContain('Unknown tool')
    expect(payload(result).error).toContain('run id is required')
  })
})

describe('flow_add_spec', () => {
  it('queues a spec file and persists it on the flow', async () => {
    seedFlow()
    const path = writeSpec('block_05.json', SPEC_JSON)

    const result = await call('flow_add_spec', { run_id: 'run-flow-1', path })
    const body = payload(result)

    expect(result.isError).toBeUndefined()
    expect(body.block).toMatchObject({ id: 'block_05', title: 'Web panel', unstructured: false })
    // A payload path is home-shortened, like every other surface's.
    expect(body.block.source_path).toBe(shortHomePath(path))
    expect(body.queue.map((entry: { id: string }) => entry.id)).toEqual(['block_05'])

    const stored = readFlow('run-flow-1', { root: registry })
    expect(stored.specs.map(spec => spec.id)).toEqual(['block_05'])
    // Queueing is not dispatching: the flow is still idle and nothing was claimed.
    expect(stored.dispatched_specs).toEqual([])
    expect(stored.state).toBe('idle')
  })

  it('accepts a relative path inside the project directory', async () => {
    seedFlow()
    writeSpec('block_05.json', SPEC_JSON)
    const result = await call('flow_add_spec', { run_id: 'run-flow-1', path: 'block_05.json' })
    expect(result.isError).toBeUndefined()
    expect(readFlow('run-flow-1', { root: registry }).specs[0]!.source_path).toBe(join(repo, 'block_05.json'))
  })

  it('refuses a missing file, a duplicate block and a closed flow without writing anything', async () => {
    seedFlow()
    const missing = await call('flow_add_spec', { run_id: 'run-flow-1', path: join(repo, 'ghost.json') })
    expect(missing.isError).toBe(true)
    expect(payload(missing).error).toContain('spec file not found')

    const path = writeSpec('block_05.json', SPEC_JSON)
    await call('flow_add_spec', { run_id: 'run-flow-1', path })
    const duplicate = await call('flow_add_spec', { run_id: 'run-flow-1', path })
    expect(duplicate.isError).toBe(true)
    expect(payload(duplicate).error).toContain('already queued or dispatched')
    expect(readFlow('run-flow-1', { root: registry }).specs).toHaveLength(1)
  })

  it('reports an unknown run and empty arguments without falling through', async () => {
    const unknown = await call('flow_add_spec', { run_id: 'ghost', path: '/tmp/x.json' })
    expect(unknown.isError).toBe(true)
    expect(payload(unknown).error).toContain('no flow for run ghost')

    const empty = await call('flow_add_spec', {})
    expect(empty.isError).toBe(true)
    expect(payload(empty).error).not.toContain('Unknown tool')
  })
})
