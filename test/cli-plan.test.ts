// `flow plan …` driven through the real commander program with a temp registry.
//
// The tests are about the contract the design fixed (`docs/plan-model-design.md` §7): the human output, the
// JSON payload, and the exit codes a script relies on. The model itself is covered by `plan.test.ts`; here
// the question is whether the surface exposes it honestly.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createFlowState } from '../src/core/flow.js'
import { saveFlow } from '../src/core/flow-store.js'
import { readPlan } from '../src/core/plan.js'
import { writeRun } from '../src/core/runs.js'

const execFileSync = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({ execFileSync, spawnSync: vi.fn(() => ({ status: 1, stdout: '' })) }))

let tmpDir: string
let savedRegistry: string | undefined
let savedConfig: string | undefined

const PLAN = [
  '- [x] **P1.1.1** — create the workspace',
  '- [ ] **P1.1.2** — wire lint',
  '- [ ] **P1.2.1** — the edge port',
].join('\n')

const BRIEF = JSON.stringify({
  id: 'P1.2.1',
  title: 'the edge port',
  goal: 'publish 7810',
  requirements: ['one port'],
  checks: ['curl /health'],
  report: ['port'],
})

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeves-plan-cli-'))
  savedRegistry = process.env.REEVES_REGISTRY
  savedConfig = process.env.REEVES_CONFIG
  process.env.REEVES_REGISTRY = tmpDir
  process.env.REEVES_CONFIG = join(tmpDir, 'config.json')
  execFileSync.mockReset()
  execFileSync.mockImplementation(() => '')
  // A flow to attach the plan to: the CLI refuses a plan on a run with no flow.
  mkdirSync(join(tmpDir, 'flows'), { recursive: true })
  saveFlow(createFlowState({
    run_id: 'run-p',
    repo: tmpDir,
    roles: { dev: 'dev-1', review: 'rev-1' },
    max_rounds: 6,
    review_timeout_sec: 1800,
    at: '2026-11-02T09:00:00.000Z',
  }))
  // The plan path is resolved against the run's working directory, so the test needs a run whose project is
  // the temp directory.
  writeRun({
    id: 'run-p',
    name: 'run-p',
    status: 'running',
    tmux_session: 'reeves-run-p',
    reeves_window_id: '@0',
    reeves_pane_id: '%0',
    root_agent_id: 'dev-1',
    working_dir: tmpDir,
    preset_name: null,
    started_at: '2026-11-02T09:00:00.000Z',
    ended_at: null,
  })
  writeFileSync(join(tmpDir, 'plan.md'), PLAN)
  writeFileSync(join(tmpDir, 'P1.2.1.json'), BRIEF)
})

afterEach(() => {
  if (savedRegistry === undefined) delete process.env.REEVES_REGISTRY
  else process.env.REEVES_REGISTRY = savedRegistry
  if (savedConfig === undefined) delete process.env.REEVES_CONFIG
  else process.env.REEVES_CONFIG = savedConfig
  rmSync(tmpDir, { recursive: true, force: true })
})

// The CLI exits through `process.exit`, and both the output and the code are part of the contract: the
// spy throws, the buffers are returned with the code instead of being lost in the stack trace.
async function runCli(args: string[]): Promise<{ out: string, err: string, code: number }> {
  vi.resetModules()
  const { program } = await import('../src/surfaces/cli/index.js')
  program.exitOverride()
  const out: string[] = []
  const err: string[] = []
  const logSpy = vi.spyOn(console, 'log').mockImplementation((...parts) => { out.push(parts.join(' ')) })
  const errSpy = vi.spyOn(console, 'error').mockImplementation((...parts) => { err.push(parts.join(' ')) })
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`process.exit(${code ?? 0})`)
  }) as never)
  let code: number
  try {
    await program.parseAsync(args, { from: 'user' })
    code = typeof process.exitCode === 'number' ? process.exitCode : 0
  } catch (error) {
    const match = /process\.exit\((\d+)\)/.exec((error as Error).message)
    code = match ? Number(match[1]) : 1
    if (!match) err.push((error as Error).message)
  } finally {
    logSpy.mockRestore()
    errSpy.mockRestore()
    exitSpy.mockRestore()
    process.exitCode = 0
  }
  return { out: out.join('\n'), err: err.join('\n'), code }
}

// A command that reports a problem prints it and sets a non-zero code; both are asserted together.
async function failure(args: string[]): Promise<{ code: number, out: string, err: string }> {
  return runCli(args)
}

describe('flow plan', () => {
  it('imports the document and prints the progress a human asked for', async () => {
    const imported = await runCli(['flow', 'plan', 'import', '--run', 'run-p', '--file', join(tmpDir, 'plan.md')])
    expect(imported.out).toContain('3 items, 3 new')

    const { out } = await runCli(['flow', 'plan', '--run', 'run-p'])
    expect(out).toContain('progress  0/3 done')
    expect(out).toContain('3 pending')
    // An item without a brief is what the picker stops at, and the line says so: it is not dispatched and it is
    // not hidden.
    expect(out).toContain('next      P1.1.1 — "create the workspace"  needs brief')
  })

  it('reports an unchanged document instead of rewriting it', async () => {
    await runCli(['flow', 'plan', 'import', '--run', 'run-p', '--file', join(tmpDir, 'plan.md')])
    const { out } = await runCli(['flow', 'plan', 'import', '--run', 'run-p', '--file', join(tmpDir, 'plan.md')])
    expect(out).toContain('unchanged')
  })

  it('writes nothing on --dry-run', async () => {
    const { out } = await runCli(['flow', 'plan', 'import', '--run', 'run-p', '--file', join(tmpDir, 'plan.md'), '--dry-run'])
    expect(out).toContain('would import')
    expect(() => readPlan('run-p')).toThrow(/no plan/)
  })

  it('carries the plan in the flow state summary, so a card can draw 1/3', async () => {
    await runCli(['flow', 'plan', 'import', '--run', 'run-p', '--file', join(tmpDir, 'plan.md')])
    await runCli(['flow', 'plan', 'attach', '--run', 'run-p', '--item', 'P1.2.1', '--spec', join(tmpDir, 'P1.2.1.json')])
    const state = JSON.parse(readFileSync(join(tmpDir, 'flows', 'run-p.json'), 'utf-8')) as { plan?: { total: number } }
    expect(state.plan?.total).toBe(3)
  })
})

describe('flow plan attach', () => {
  it('does not claim to queue by default, and says so', async () => {
    await runCli(['flow', 'plan', 'import', '--run', 'run-p', '--file', join(tmpDir, 'plan.md')])
    const { out } = await runCli(['flow', 'plan', 'attach', '--run', 'run-p', '--item', 'P1.2.1', '--spec', join(tmpDir, 'P1.2.1.json')])
    expect(out).toContain('brief ready; flow plan next queues it')
    expect(out).not.toContain('queued for dispatch')
    // The plan item is `queued` (has a brief), the flow queue is untouched.
    const plan = readPlan('run-p')
    expect(plan.items.find(item => item.id === 'P1.2.1')!.status).toBe('queued')
    const state = JSON.parse(readFileSync(join(tmpDir, 'flows', 'run-p.json'), 'utf-8')) as { specs?: unknown[] }
    expect(state.specs ?? []).toHaveLength(0)
  })

  it('queues the block when --queue is passed', async () => {
    await runCli(['flow', 'plan', 'import', '--run', 'run-p', '--file', join(tmpDir, 'plan.md')])
    const { out } = await runCli(['flow', 'plan', 'attach', '--run', 'run-p', '--item', 'P1.2.1', '--spec', join(tmpDir, 'P1.2.1.json'), '--queue'])
    expect(out).toContain('queued for dispatch')
    const state = JSON.parse(readFileSync(join(tmpDir, 'flows', 'run-p.json'), 'utf-8')) as { specs?: { id: string }[] }
    expect(state.specs?.map(spec => spec.id)).toEqual(['P1.2.1'])
  })

  it('exits 3 on a brief whose id is not the item id', async () => {
    await runCli(['flow', 'plan', 'import', '--run', 'run-p', '--file', join(tmpDir, 'plan.md')])
    writeFileSync(join(tmpDir, 'P9.json'), JSON.stringify({ ...JSON.parse(BRIEF), id: 'P9' }))
    const failed = await failure(['flow', 'plan', 'attach', '--run', 'run-p', '--item', 'P1.2.1', '--spec', join(tmpDir, 'P9.json')])
    expect(failed.err).toContain('spec_id_mismatch')
    expect(failed.code).toBe(3)
  })
})

describe('flow plan set and status', () => {
  it('refuses done without --yes and without a note, and accepts a note', async () => {
    await runCli(['flow', 'plan', 'import', '--run', 'run-p', '--file', join(tmpDir, 'plan.md')])

    const noYes = await failure(['flow', 'plan', 'set', '--run', 'run-p', '--item', 'P1.1.2', '--status', 'done'])
    expect(noYes.err).toContain('needs --yes')
    expect(noYes.code).toBe(3)

    const noNote = await failure(['flow', 'plan', 'set', '--run', 'run-p', '--item', 'P1.1.2', '--status', 'done', '--yes'])
    expect(noNote.err).toContain('--note')

    const skipped = await runCli(['flow', 'plan', 'set', '--run', 'run-p', '--item', 'P1.1.2', '--status', 'skipped', '--yes'])
    expect(skipped.out).toContain('pending → skipped')

    const done = await runCli(['flow', 'plan', 'set', '--run', 'run-p', '--item', 'P1.1.1', '--status', 'done', '--yes', '--note', 'delivered before the flow'])
    expect(done.out).toContain('done')
  })

  it('refuses to close an item while its round is running, and refuses to reopen a closed one', async () => {
    await runCli(['flow', 'plan', 'import', '--run', 'run-p', '--file', join(tmpDir, 'plan.md')])
    // Simulate a round in flight the way the engine would leave it.
    const plan = readPlan('run-p')
    const busy = { ...plan, items: plan.items.map(item => (item.id === 'P1.2.1' ? { ...item, status: 'in_work' as const } : item)) }
    const { savePlan } = await import('../src/core/plan.js')
    savePlan(busy)

    const skipped = await failure(['flow', 'plan', 'set', '--run', 'run-p', '--item', 'P1.2.1', '--status', 'skipped', '--yes'])
    expect(skipped.code).toBe(3)
    expect(skipped.err).toContain('a round is in flight')

    const done = await failure(['flow', 'plan', 'set', '--run', 'run-p', '--item', 'P1.2.1', '--status', 'done', '--yes', '--note', 'x'])
    expect(done.code).toBe(3)
    expect(done.err).toContain('a round is in flight')

    // A closed item does not reopen.
    await runCli(['flow', 'plan', 'set', '--run', 'run-p', '--item', 'P1.1.1', '--status', 'done', '--yes', '--note', 'by hand'])
    const reopen = await failure(['flow', 'plan', 'set', '--run', 'run-p', '--item', 'P1.1.1', '--status', 'queued', '--yes'])
    expect(reopen.code).toBe(3)
    expect(reopen.err).toContain('is terminal')
  })

  it('finds an item without --run and exits 2 for an unknown one', async () => {
    await runCli(['flow', 'plan', 'import', '--run', 'run-p', '--file', join(tmpDir, 'plan.md')])
    const { out } = await runCli(['flow', 'plan', 'status', '--item', 'P1.1.2'])
    expect(out).toContain('item      P1.1.2  pending')

    const missing = await failure(['flow', 'plan', 'status', '--item', 'NOPE'])
    expect(missing.code).toBe(2)
    expect(missing.err).toContain('no plan item NOPE')
  })

  it('refuses a document outside the project instead of storing a home path', async () => {
    // The plan stores repository-relative paths; a file from the home directory is refused, not shortened.
    const outside = mkdtempSync(join(tmpdir(), 'reeves-plan-outside-'))
    writeFileSync(join(outside, 'plan.md'), PLAN)
    try {
      const failed = await failure(['flow', 'plan', 'import', '--run', 'run-p', '--file', join(outside, 'plan.md')])
      expect(failed.code).toBe(3)
      expect(failed.err).toContain('outside the repository')
      expect(failed.err).not.toContain(outside)      // the message names the path home-shortened
      expect(() => readPlan('run-p')).toThrow(/no plan/)
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })

  it('never prints the brief body in --json, only its shape', async () => {
    await runCli(['flow', 'plan', 'import', '--run', 'run-p', '--file', join(tmpDir, 'plan.md')])
    await runCli(['flow', 'plan', 'attach', '--run', 'run-p', '--item', 'P1.2.1', '--spec', join(tmpDir, 'P1.2.1.json')])

    const one = await runCli(['flow', 'plan', 'status', '--item', 'P1.2.1', '--json'])
    const body = JSON.parse(one.out) as { item: { spec: { id: string, unstructured: boolean } | null } }
    expect(body.item.spec).toEqual({ id: 'P1.2.1', title: 'the edge port', unstructured: false })
    expect(one.out).not.toContain('one port')
    expect(one.out).not.toContain('curl /health')

    const all = await runCli(['flow', 'plan', '--run', 'run-p', '--json'])
    expect(all.out).not.toContain('one port')
    expect(all.out).not.toContain('curl /health')
  })

  it('refuses a symlink that points outside the project', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'reeves-plan-link-'))
    writeFileSync(join(outside, 'plan.md'), PLAN)
    mkdirSync(join(tmpDir, 'docs'), { recursive: true })
    symlinkSync(join(outside, 'plan.md'), join(tmpDir, 'docs', 'plan.md'))
    try {
      const failed = await failure(['flow', 'plan', 'import', '--run', 'run-p', '--file', 'docs/plan.md'])
      expect(failed.code).toBe(3)
      expect(failed.err).toContain('outside the repository')
      expect(() => readPlan('run-p')).toThrow(/no plan/)
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })

  it('attaches a markdown brief to an id-bearing item', async () => {
    await runCli(['flow', 'plan', 'import', '--run', 'run-p', '--file', join(tmpDir, 'plan.md')])
    writeFileSync(join(tmpDir, 'brief.md'), '# The edge port\n\nPublish it on 7810.\n')
    const { out } = await runCli(['flow', 'plan', 'attach', '--run', 'run-p', '--item', 'P1.2.1', '--spec', join(tmpDir, 'brief.md')])
    expect(out).toContain('attached  P1.2.1')
    const plan = readPlan('run-p')
    expect(plan.items.find(item => item.id === 'P1.2.1')!.spec?.id).toBe('P1.2.1')
  })

  it('shows a conflict when the document unticks a closed item, and exits 3', async () => {
    await runCli(['flow', 'plan', 'import', '--run', 'run-p', '--file', join(tmpDir, 'plan.md')])
    await runCli(['flow', 'plan', 'set', '--run', 'run-p', '--item', 'P1.1.1', '--status', 'done', '--yes', '--note', 'by hand'])
    writeFileSync(join(tmpDir, 'plan.md'), PLAN.replace('- [x] **P1.1.1**', '- [ ] **P1.1.1**'))

    const reimport = await failure(['flow', 'plan', 'import', '--run', 'run-p', '--file', join(tmpDir, 'plan.md')])
    // The summary line is the human output; the conflict detail follows it on its own line.
    expect(reimport.out).toContain('1 conflict')
    expect(reimport.out).toContain('unticked')
    expect(reimport.code).toBe(3)

    const reopened = await failure(['flow', 'plan', '--run', 'run-p'])
    expect(reopened.code).toBe(3)
    const plan = readPlan('run-p')
    expect(plan.items.find(item => item.id === 'P1.1.1')!.status).toBe('done')
    expect(plan.conflicts.some(entry => entry.kind === 'unticked')).toBe(true)
  })
})
