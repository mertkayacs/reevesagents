import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { tmpdir } from 'node:os'
import type { AgentRecord, RunRecord } from '../src/core/types.js'
import { createFlowState } from '../src/core/flow.js'
import { readFlow, saveFlow } from '../src/core/flow-store.js'
import { publishNotes } from '../src/core/flow-notes.js'
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
  // A flow only exists for a live run: a tick asks the registry whether the run and both role agents
  // are still there, and a fixture without them would park the flow as `orphaned`.
  writeRun(makeRun(runId))
  writeAgent(makeAgent('dev-1', runId))
  writeAgent(makeAgent('rev-1', runId))
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
  it('reports a damaged flow file without an absolute registry path', async () => {
    // The surface prints whatever the store raises, so the store is where the path has to be
    // rendered safely — this is the end-to-end half of that rule.
    mkdirSync(join(tmpDir, 'flows'), { recursive: true })
    writeFileSync(join(tmpDir, 'flows', 'run-c1.json'), '{"schema_version":1,', 'utf-8')

    const failure = await outsideHome(() => runCli(['flow', 'status', '--run', 'run-c1']).then(
      () => null,
      (error: Error & { cli_err?: string }) => error,
    ))

    expect(failure?.cli_err).toContain('flow state is not valid JSON: run-c1.json')
    expect(failure?.cli_err).not.toContain(tmpDir)
  })

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
    // The panes are read (that is how the tick learns they are unreadable); nothing is typed into
    // them, which is what "neither sends" means here.
    expect(execFileSync.mock.calls.some(call => call[0] === 'tmux' && (call[1] as string[]).includes('send-keys'))).toBe(false)
  })
})

describe('flow add-spec', () => {
  function writeSpec(name: string, overrides: Record<string, unknown> = {}): string {
    const path = join(tmpDir, name)
    writeFileSync(path, JSON.stringify({
      id: 'block_07',
      title: 'Lifecycle',
      goal: 'g',
      requirements: ['r'],
      checks: ['c'],
      ...overrides,
    }), 'utf-8')
    return path
  }

  it('queues a structured block and prints the queue', async () => {
    seedFlow()
    const spec = writeSpec('block_07.json')

    const { out } = await runCli(['flow', 'add-spec', '--run', 'run-c1', '--file', spec])

    expect(out).toContain('queued    block_07')
    expect(out).toContain('queue     1 pending')
    expect(readFlow('run-c1').specs.map(entry => entry.id)).toEqual(['block_07'])
  })

  it('prints the queued block and the new state as JSON', async () => {
    seedFlow()
    const spec = writeSpec('block_07.json', { id: 'block_08' })

    const { out } = await runCli(['flow', 'add-spec', '--run', 'run-c1', '--file', spec, '--json'])
    const payload = JSON.parse(out)

    expect(payload.queued).toEqual([{ id: 'block_08', title: 'Lifecycle', unstructured: false }])
    expect(payload.state.queue.map((entry: { id: string }) => entry.id)).toEqual(['block_08'])
  })

  it('refuses a block without requirements or checks and writes nothing', async () => {
    const { path } = seedFlow()
    const before = readFileSync(path, 'utf-8')
    const thin = writeSpec('thin.json', { requirements: [], checks: [] })

    const failure = await runCli(['flow', 'add-spec', '--run', 'run-c1', '--file', thin]).then(
      () => null,
      (error: Error & { cli_err?: string }) => error,
    )

    expect(failure?.cli_err).toContain('requirements')
    expect(readFileSync(path, 'utf-8')).toBe(before)
  })

  it('marks a --markdown block unstructured and warns about the downgrade', async () => {
    seedFlow()
    const md = join(tmpDir, 'block_09.md')
    writeFileSync(md, '# Block 09 — notes\n\nBody.\n', 'utf-8')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      const { out } = await runCli(['flow', 'add-spec', '--run', 'run-c1', '--markdown', md])
      expect(out).toContain('(unstructured)')
      expect(warn.mock.calls.flat().join(' ')).toContain('has no requirements/checks')
    } finally {
      warn.mockRestore()
    }
    expect(readFlow('run-c1').specs[0]!.unstructured).toBe(true)
  })

  it('requires at least one file', async () => {
    seedFlow()
    const failure = await runCli(['flow', 'add-spec', '--run', 'run-c1']).then(
      () => null,
      (error: Error & { cli_err?: string }) => error,
    )
    expect(failure?.cli_err).toContain('at least one --file or --markdown')
  })
})

describe('flow pause / resume / stop', () => {
  it('pauses, shows the paused state in status, and resumes into the same state', async () => {
    seedFlow()

    const paused = await runCli(['flow', 'pause', '--run', 'run-c1'])
    expect(paused.out).toContain('paused (was idle)')

    const status = await runCli(['flow', 'status', '--run', 'run-c1'])
    expect(status.out).toContain('state     paused')
    expect(status.out).toContain('paused    from idle')

    const resumed = await runCli(['flow', 'resume', '--run', 'run-c1'])
    expect(resumed.out).toContain('resumed into idle')
    expect(readFlow('run-c1').state).toBe('idle')
  })

  it('refuses a second pause and a resume of a flow that is not paused', async () => {
    seedFlow()
    await runCli(['flow', 'pause', '--run', 'run-c1'])

    const second = await runCli(['flow', 'pause', '--run', 'run-c1']).then(
      () => null,
      (error: Error & { cli_err?: string }) => error,
    )
    expect(second?.cli_err).toContain('already paused')

    await runCli(['flow', 'resume', '--run', 'run-c1'])
    const resumeIdle = await runCli(['flow', 'resume', '--run', 'run-c1']).then(
      () => null,
      (error: Error & { cli_err?: string }) => error,
    )
    expect(resumeIdle?.cli_err).toContain('only a paused or escalated flow can be resumed')
  })

  it('refuses stop without --yes and stops with it', async () => {
    seedFlow()

    const refused = await runCli(['flow', 'stop', '--run', 'run-c1']).then(
      () => null,
      (error: Error & { cli_err?: string }) => error,
    )
    expect(refused?.cli_err).toContain('without --yes')
    expect(readFlow('run-c1').state).toBe('idle')

    const stopped = await runCli(['flow', 'stop', '--run', 'run-c1', '--yes'])
    expect(stopped.out).toContain('stopped (stopped by the operator)')
    expect(readFlow('run-c1').state).toBe('done')
    expect(readFlow('run-c1').close_reason).toBe('stopped by the operator')
  })
})

describe('flow logs', () => {
  it('prints the journal tail in order, newest last', async () => {
    seedFlow()
    await runCli(['flow', 'pause', '--run', 'run-c1'])
    await runCli(['flow', 'resume', '--run', 'run-c1'])

    const { out } = await runCli(['flow', 'logs', '--run', 'run-c1', '-n', '2'])
    const lines = out.trim().split('\n').filter(line => line.trim() !== '')

    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('flow_paused')
    expect(lines[1]).toContain('flow_resumed')
    expect(out).not.toContain('flow_started')
  })

  it('returns the tail as JSON and defaults to a bounded number of entries', async () => {
    seedFlow()
    await runCli(['flow', 'pause', '--run', 'run-c1'])
    await runCli(['flow', 'resume', '--run', 'run-c1'])

    const { out } = await runCli(['flow', 'logs', '--run', 'run-c1', '--json'])
    const entries = JSON.parse(out)

    expect(entries.map((entry: { event: string }) => entry.event)).toEqual(['flow_paused', 'flow_resumed'])
  })
})

describe('flow notes', () => {
  const HEAD = 'abc1234'
  const findings = 'MAJOR src/core/flow.ts:120 — the claim is not re-read\nMINOR docs/x.md:4 — wording'
  const text = `# round\n\n${findings}\n\nВЕРДИКТ: CHANGES_REQUESTED\n`

  function seedHeadFlow(head = HEAD): void {
    seedRun()
    const state = createFlowState({
      run_id: 'run-c1',
      repo: '/repo',
      roles: { dev: 'dev-1', review: 'rev-1' },
      head,
      at: '2026-01-01T00:00:00.000Z',
    })
    saveFlow({ ...state, claim: { head, verdict: null, verdict_count: 0, verdict_applied: false } })
  }

  it('prints a round with its counts and file', async () => {
    seedHeadFlow()
    publishNotes('run-c1', HEAD, 2, text)

    const { out } = await runCli(['flow', 'notes', '--run', 'run-c1', '-r', '2'])

    expect(out).toContain(`head      ${HEAD.slice(0, 12)}  round 2  · 1 MAJOR, 1 MINOR`)
    expect(out).toContain('MAJOR src/core/flow.ts:120')
    expect(out).toContain('notes/abc1234-r2.md')
  })

  it('defaults to the claim head and the newest round, and answers JSON', async () => {
    seedHeadFlow()
    publishNotes('run-c1', HEAD, 1, text)
    publishNotes('run-c1', HEAD, 3, text)

    const { out } = await runCli(['flow', 'notes', '--run', 'run-c1', '--json'])
    const payload = JSON.parse(out)

    expect(payload).toMatchObject({ run_id: 'run-c1', head: HEAD, round: 3, ref: `notes/${HEAD}-r3.md` })
    expect(payload.counts).toEqual({ blocker: 0, major: 1, minor: 1 })
    expect(payload.notes).toContain('MAJOR src/core/flow.ts:120')
    expect(payload.path).toContain('notes/abc1234-r3.md')
  })

  it('answers "no notes" without failing when no round published a file', async () => {
    seedHeadFlow()

    const { out } = await runCli(['flow', 'notes', '--run', 'run-c1'])
    expect(out).toContain('no notes for run-c1')

    const json = await runCli(['flow', 'notes', '--run', 'run-c1', '--json'])
    expect(JSON.parse(json.out)).toMatchObject({ notes: null, reason: 'missing' })
  })

  it('fails on a round that never happened, naming the rounds it knows', async () => {
    seedHeadFlow()
    publishNotes('run-c1', HEAD, 1, text)

    const failure = await runCli(['flow', 'notes', '--run', 'run-c1', '-r', '7']).then(
      () => null,
      (error: Error & { cli_err?: string }) => error,
    )
    expect(failure?.cli_err).toContain('round 7 does not exist')
    expect(failure?.cli_err).toContain('rounds: 1')
  })

  it('redacts a secret that a round managed to write', async () => {
    // The record is sanitised on read as well as on write, so a hand-edited file cannot leak here.
    seedHeadFlow()
    const key = ['sk', 'ant', 'abcdefghijklmnopqrstuvwxyz'].join('-')
    saveFlow({
      ...readFlow('run-c1'),
      claim: { head: HEAD, verdict: null, verdict_count: 0, verdict_applied: false },
    })
    publishNotes('run-c1', HEAD, 1, text)
    // Overwrite the durable file the way an older build (or a human) could have.
    const path = join(tmpDir, 'flows', 'run-c1', 'notes', `${HEAD}-r1.md`)
    writeFileSync(path, `MAJOR a.ts:1 — leaks ${key}\nВЕРДИКТ: CHANGES_REQUESTED\n`, 'utf-8')

    const { out } = await runCli(['flow', 'notes', '--run', 'run-c1'])
    expect(out).not.toContain(key)
    expect(out).toContain('[REDACTED]')
  })

  it('shows the reference and the counters in `flow logs`', async () => {
    seedHeadFlow()
    const state = readFlow('run-c1')
    saveFlow({
      ...state,
      state: 'fixing',
      rounds: 1,
      log: [{
        at: '2026-01-02T00:00:00.000Z',
        event: 'dispatch_fix',
        detail: 'fix_dispatched abc1234',
        notes_ref: `notes/${HEAD}-r1.md`,
        notes_counts: { blocker: 0, major: 1, minor: 1 },
      }],
    })

    const { out } = await runCli(['flow', 'logs', '--run', 'run-c1'])
    expect(out).toContain(`→ notes/${HEAD}-r1.md  · 1 MAJOR, 1 MINOR`)
  })
})
