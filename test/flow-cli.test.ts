import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { tmpdir } from 'node:os'
import type { AgentRecord, RunRecord } from '../src/core/types.js'
import { createFlowState } from '../src/core/flow.js'
import { readFlow, saveFlow } from '../src/core/flow-store.js'
import { writeAgent, writeRun } from '../src/core/runs.js'

// `flow start`, `flow status` and `flow tick` driven through the real commander program with a temp
// registry. The tmux/git side is one mocked execFileSync, so no pane and no repository is touched.

const execFileSync = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({ execFileSync, spawnSync: vi.fn(() => ({ status: 1, stdout: '' })) }))

let tmpDir: string
let savedTmux: string | undefined
let savedRegistry: string | undefined

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeves-flow-cli-'))
  savedRegistry = process.env.REEVES_REGISTRY
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
  if (savedRegistry === undefined) delete process.env.REEVES_REGISTRY
  else process.env.REEVES_REGISTRY = savedRegistry
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

// Run `fn` with HOME pointing at a directory the temp tree is *not* under, so a path assertion about
// a home shorthand cannot pass by accident when TMPDIR happens to live inside the real home.
async function outsideHome<T>(fn: () => Promise<T>): Promise<T> {
  const savedHome = process.env.HOME
  const fakeHome = mkdtempSync(join(tmpdir(), 'reeves-flow-cli-home-'))
  process.env.HOME = fakeHome
  try {
    return await fn()
  } finally {
    if (savedHome === undefined) delete process.env.HOME
    else process.env.HOME = savedHome
    rmSync(fakeHome, { recursive: true, force: true })
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

function makeRun(id: string, overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id,
    name: `run-${id}`,
    status: 'running',
    tmux_session: `reeves-${id}`,
    reeves_window_id: '@0',
    reeves_pane_id: '%0',
    root_agent_id: `${id}-root`,
    working_dir: tmpDir,
    preset_name: null,
    started_at: '2026-01-01T00:00:00.000Z',
    ended_at: null,
    ...overrides,
  }
}

function makeAgent(id: string, runId: string, overrides: Partial<AgentRecord> = {}): AgentRecord {
  return {
    id,
    run_id: runId,
    nickname: `agent-${id}`,
    provider: 'cc',
    model: '',
    role: 'worker',
    working_dir: tmpDir,
    task: 'do work',
    task_status: 'working',
    task_note: '',
    tmux_session: `reeves-${runId}`,
    tmux_window_id: '@1',
    tmux_pane_id: '%1',
    rc_enabled: false,
    permissions: 'ask',
    inbox: [],
    last_seen: Date.now(),
    started_at: '2026-01-01T00:00:01.000Z',
    ended_at: null,
    ...overrides,
  }
}

// A run with a dev and a review agent, which is the minimum `flow start` accepts.
function seedRun(id = 'run-c1') {
  writeRun(makeRun(id))
  writeAgent(makeAgent(`${id}-dev`, id, { nickname: 'dev' }))
  writeAgent(makeAgent(`${id}-rev`, id, { nickname: 'review' }))
}

describe('flow start', () => {
  it('attaches a flow to a run and starts from the current HEAD', async () => {
    seedRun()

    const { out } = await runCli(['flow', 'start', '--run', 'run-c1', '--dev', 'dev', '--review', 'review'])

    expect(out).toContain('flow      run-c1')
    expect(out).toContain('roles     dev run-c1-dev -> review run-c1-rev')
    expect(out).toContain('head      bbb222')
    const state = readFlow('run-c1')
    expect(state.state).toBe('idle')
    expect(state.claim.head).toBe('bbb222')
    expect(state.roles).toEqual({ dev: 'run-c1-dev', review: 'run-c1-rev' })
    expect(state.log.at(-1)?.event).toBe('flow_started')
  })

  it('--json prints the same payload flow status does', async () => {
    seedRun()

    const { out } = await runCli(['flow', 'start', '--run', 'run-c1', '--dev', 'run-c1-dev', '--review', 'run-c1-rev', '--json'])
    const payload = JSON.parse(out)

    expect(payload).toMatchObject({ run_id: 'run-c1', state: 'idle', head: 'bbb222', pending: null })
    expect(payload.path).toContain('flows/run-c1.json')
  })

  it('queues block specs given at start', async () => {
    seedRun()
    const spec = join(tmpDir, 'block_01.json')
    writeFileSync(spec, JSON.stringify({ id: 'block_01', title: 'One', goal: 'g', requirements: ['r'], checks: ['c'] }), 'utf-8')

    await runCli(['flow', 'start', '--run', 'run-c1', '--dev', 'dev', '--review', 'review', '--spec', spec])

    const state = readFlow('run-c1')
    expect(state.specs.map(entry => entry.id)).toEqual(['block_01'])
    expect(state.specs[0]!.source_path).toBe(spec)
  })

  it('refuses a flow on a run that is already running one', async () => {
    seedRun()
    await runCli(['flow', 'start', '--run', 'run-c1', '--dev', 'dev', '--review', 'review'])

    const failure = await runCli(['flow', 'start', '--run', 'run-c1', '--dev', 'dev', '--review', 'review']).then(
      () => null,
      (error: Error & { cli_err?: string }) => error,
    )

    expect(failure?.message).toMatch(/process\.exit\(1\)/)
    expect(failure?.cli_err).toContain('already has a flow in state idle')
    // Still one flow, unchanged.
    expect(readFlow('run-c1').log.filter(entry => entry.event === 'flow_started')).toHaveLength(1)
  })

  it('refuses to replace an active flow, and replaces a closed one only with --replace', async () => {
    seedRun()
    saveFlow({ ...createFlowState({
      run_id: 'run-c1',
      repo: tmpDir,
      roles: { dev: 'run-c1-dev', review: 'run-c1-rev' },
      head: 'aaa111',
      at: '2026-01-01T00:00:00.000Z',
    }), state: 'escalated' })

    const refused = await runCli(['flow', 'start', '--run', 'run-c1', '--dev', 'dev', '--review', 'review']).then(
      () => null,
      (error: Error & { cli_err?: string }) => error,
    )
    expect(refused?.cli_err).toContain('has a closed flow (escalated)')

    const { out } = await runCli(['flow', 'start', '--run', 'run-c1', '--dev', 'dev', '--review', 'review', '--replace'])
    expect(out).toContain('(replaced the closed one)')
    expect(readFlow('run-c1').state).toBe('idle')
  })

  it('refuses an agent that belongs to another run', async () => {
    seedRun('run-c1')
    writeRun(makeRun('run-c2'))
    writeAgent(makeAgent('run-c2-dev', 'run-c2'))

    const failure = await runCli([
      'flow', 'start', '--run', 'run-c1', '--dev', 'run-c2-dev', '--review', 'review',
    ]).then(() => null, (error: Error & { cli_err?: string }) => error)

    expect(failure?.cli_err).toContain('no dev agent run-c2-dev in run run-c1')
  })

  it('refuses a run that does not exist', async () => {
    const failure = await runCli(['flow', 'start', '--run', 'ghost', '--dev', 'dev', '--review', 'review']).then(
      () => null,
      (error: Error & { cli_err?: string }) => error,
    )
    expect(failure?.cli_err).toContain('run not found: ghost')
  })

  it('refuses a directory that is not a git repository without printing its absolute path', async () => {
    seedRun()
    execFileSync.mockImplementation((file: string, args: string[]) => {
      if (file === 'git' && args.includes('rev-parse')) throw new Error('not a repository')
      return ''
    })

    // The repo has to sit *outside* the home directory for this assertion to mean anything: with
    // TMPDIR under $HOME the path would be shortened by luck rather than by the code, and the test
    // would pass while the message still leaked in a sandbox whose temp dir is elsewhere.
    const failure = await outsideHome(() => runCli([
      'flow', 'start', '--run', 'run-c1', '--dev', 'dev', '--review', 'review',
    ]).then(() => null, (error: Error & { cli_err?: string }) => error))

    expect(failure?.cli_err).toContain('cannot read HEAD in')
    expect(failure?.cli_err).not.toContain(tmpDir)
    // The last component still names what failed, so the message stays usable.
    expect(failure?.cli_err).toContain(basename(tmpDir))
  })

  it('names the existing flow file without an absolute path when the registry is outside home', async () => {
    seedRun()
    await runCli(['flow', 'start', '--run', 'run-c1', '--dev', 'dev', '--review', 'review'])

    const failure = await outsideHome(() => runCli([
      'flow', 'start', '--run', 'run-c1', '--dev', 'dev', '--review', 'review',
    ]).then(() => null, (error: Error & { cli_err?: string }) => error))

    expect(failure?.cli_err).toContain('already has a flow in state idle')
    expect(failure?.cli_err).not.toContain(tmpDir)
    expect(failure?.cli_err).toContain('run-c1.json')
  })
})

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
