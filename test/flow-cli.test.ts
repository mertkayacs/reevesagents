import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createFlowState } from '../src/core/flow.js'
import { saveFlow } from '../src/core/flow-store.js'

// `flow status` and `flow tick` driven through the real commander program with a temp registry.
// The tmux/git side is one mocked execFileSync, so no pane and no repository is touched.

const execFileSync = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({ execFileSync, spawnSync: vi.fn(() => ({ status: 1, stdout: '' })) }))

let tmpDir: string
let savedTmux: string | undefined

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeves-flow-cli-'))
  process.env.REEVES_REGISTRY = tmpDir
  process.env.REEVES_CONFIG = join(tmpDir, 'config.json')
  savedTmux = process.env.TMUX
  delete process.env.TMUX
  execFileSync.mockReset()
  // git reports one moved head; tmux reports nothing, which is an unclassifiable pane.
  execFileSync.mockImplementation((file: string, args: string[]) => {
    if (file === 'git' && args.includes('rev-parse')) return 'bbb222\n'
    if (file === 'git' && args.includes('status')) return ''
    return ''
  })
})

afterEach(() => {
  delete process.env.REEVES_REGISTRY
  delete process.env.REEVES_CONFIG
  if (savedTmux === undefined) delete process.env.TMUX
  else process.env.TMUX = savedTmux
  rmSync(tmpDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

async function runCli(args: string[]): Promise<{ out: string, err: string }> {
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
  try {
    await program.parseAsync(args, { from: 'user' })
    return { out: out.join('\n'), err: err.join('\n') }
  } catch (error) {
    // A command that failed exits: carry what it printed on the way out so the test can read it.
    const failure = error as Error & { cli_out?: string, cli_err?: string }
    failure.cli_out = out.join('\n')
    failure.cli_err = err.join('\n')
    throw failure
  } finally {
    logSpy.mockRestore()
    errSpy.mockRestore()
    exitSpy.mockRestore()
    process.exitCode = 0
  }
}

function seedFlow(runId = 'run-c1') {
  const state = createFlowState({
    run_id: runId,
    repo: '/repo',
    roles: { dev: 'dev-1', review: 'rev-1' },
    head: 'aaa111',
    at: '2026-01-01T00:00:00.000Z',
  })
  const path = saveFlow(state, { root: tmpDir })
  return { state, path }
}

describe('flow status', () => {
  it('prints the flow as JSON, home-shortened, with the queue depth', async () => {
    seedFlow()
    const { out } = await runCli(['flow', 'status', '--run', 'run-c1', '--json'])
    const payload = JSON.parse(out)

    expect(payload).toMatchObject({
      schema_version: 1,
      run_id: 'run-c1',
      state: 'idle',
      rounds: 0,
      max_rounds: 6,
      head: 'aaa111',
      queue: [],
      dispatched_specs: [],
    })
    expect(payload.path).toContain('flows/run-c1.json')
    expect(payload.path.startsWith('~') || payload.path.startsWith(tmpDir)).toBe(true)
  })

  it('accepts a unique run-id prefix and prints a text summary', async () => {
    seedFlow('run-c1')
    const { out } = await runCli(['flow', 'status', '--run', 'run-c'])
    expect(out).toContain('flow      run-c1')
    expect(out).toContain('state     idle  round 0/6')
  })

  it('fails with a readable message when no flow exists', async () => {
    const failure = await runCli(['flow', 'status', '--run', 'ghost']).then(
      () => null,
      (error: Error & { cli_err?: string }) => error,
    )
    expect(failure?.message).toMatch(/process\.exit\(1\)/)
    expect(failure?.cli_err).toContain('no flow for run ghost')
  })

  it('prints a home-shortened path for a damaged file, not the absolute one', async () => {
    const savedHome = process.env.HOME
    process.env.HOME = tmpDir
    try {
      mkdirSync(join(tmpDir, 'flows'), { recursive: true })
      writeFileSync(join(tmpDir, 'flows', 'run-bad.json'), '{"schema_version":1,', 'utf-8')
      const failure = await runCli(['flow', 'status', '--run', 'run-bad']).then(
        () => null,
        (error: Error & { cli_err?: string }) => error,
      )
      expect(failure?.cli_err).toContain('~/flows/run-bad.json')
      expect(failure?.cli_err).not.toContain(tmpDir)
    } finally {
      if (savedHome === undefined) delete process.env.HOME
      else process.env.HOME = savedHome
    }
  })
})

describe('flow tick', () => {
  it('--dry-run prints the decision and writes nothing', async () => {
    const { path } = seedFlow()
    const before = readFileSync(path, 'utf-8')

    const { out } = await runCli(['flow', 'tick', '--run', 'run-c1', '--dry-run'])

    expect(out).toContain('decision')
    expect(out).toContain('dry run   nothing sent, nothing written')
    expect(readFileSync(path, 'utf-8')).toBe(before)
    // No pane write of any kind was attempted.
    expect(execFileSync.mock.calls.some(call => call[0] === 'tmux' && (call[1] as string[])[0] === 'send-keys')).toBe(false)
  })

  it('--dry-run --json reports the decision, the observations and dry_run: true', async () => {
    seedFlow()
    const { out } = await runCli(['flow', 'tick', '--run', 'run-c1', '--dry-run', '--json'])
    const payload = JSON.parse(out)

    expect(payload.dry_run).toBe(true)
    expect(payload.status).toBe('skipped')
    expect(payload.decision.kind).toBe('none')
    // Both panes are unclassifiable in this harness, so the gate refuses.
    expect(payload.observations.dev_pane).toBe('unknown')
    expect(payload.decision.reason).toBe('dev_pane_unknown')
  })

  it('a real tick against unreadable panes neither sends nor rewrites the flow', async () => {
    const { path } = seedFlow()
    const before = readFileSync(path, 'utf-8')

    const { out } = await runCli(['flow', 'tick', '--run', 'run-c1'])

    expect(out).toContain('dev_pane_unknown')
    expect(readFileSync(path, 'utf-8')).toBe(before)
    expect(execFileSync.mock.calls.some(call => call[0] === 'tmux')).toBe(false)
  })
})
