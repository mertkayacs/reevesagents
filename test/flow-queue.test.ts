import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createFlowState } from '../src/core/flow.js'
import type { FlowState } from '../src/core/flow.js'
import { FlowSpecError, queueSpecFile, readSpecFile } from '../src/core/flow-queue.js'

// The queue is where a block brief becomes a record on the flow. Everything is refused here, in
// front of the person who queued the file, instead of at dispatch time inside a round.

let root: string
let repo: string
let savedHome: string | undefined

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'reeves-flow-queue-'))
  repo = join(root, 'project')
  mkdirSync(repo, { recursive: true })
  // Pinned so a path assertion is about the shorthand, not about where TMPDIR points.
  savedHome = process.env.HOME
  process.env.HOME = root
})

afterEach(() => {
  if (savedHome === undefined) delete process.env.HOME
  else process.env.HOME = savedHome
  rmSync(root, { recursive: true, force: true })
})

function makeState(overrides: Partial<FlowState> = {}): FlowState {
  return { ...createFlowState({ run_id: 'run-1', repo, roles: { dev: 'dev-1', review: 'rev-1' } }), ...overrides }
}

function writeFile(name: string, text: string): string {
  const path = join(repo, name)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, text, 'utf-8')
  return path
}

function jsonSpec(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: 'block_04',
    title: 'Surfaces',
    goal: 'Expose the flow',
    requirements: ['MCP tools', 'TUI badge'],
    checks: ['pnpm test'],
    report: ['files', 'output'],
    ...overrides,
  })
}

function message(fn: () => unknown): string {
  try {
    fn()
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
  return ''
}

describe('readSpecFile', () => {
  it('reads a structured JSON spec and keeps the file as its source', () => {
    const path = writeFile('block_04.json', jsonSpec())
    const spec = readSpecFile(path, { repo })
    expect(spec.id).toBe('block_04')
    expect(spec.requirements).toEqual(['MCP tools', 'TUI badge'])
    expect(spec.source_path).toBe(path)
    expect(spec.unstructured).toBeUndefined()
  })

  it('resolves a relative path inside the project and refuses one that leaves it', () => {
    const absolute = writeFile('specs/block_04.json', jsonSpec())
    expect(readSpecFile('specs/block_04.json', { repo }).source_path).toBe(absolute)

    writeFileSync(join(root, 'outside.json'), jsonSpec(), 'utf-8')
    expect(message(() => readSpecFile('../outside.json', { repo }))).toContain('outside the project directory')
  })

  it('refuses a symlink inside the project that points at a file outside it', () => {
    // The spelled path is inside the project, which is why the containment check has to look at the
    // resolved path: otherwise this link copies an unrelated file's content into the flow.
    const secret = join(root, 'secret.json')
    writeFileSync(secret, jsonSpec({ id: 'block_99', title: 'Secret' }), 'utf-8')
    symlinkSync(secret, join(repo, 'link.json'))

    const err = message(() => readSpecFile('link.json', { repo }))
    expect(err).toContain('outside the project directory')
    // An absolute path is still taken as written: the caller named that file themselves.
    expect(readSpecFile(secret, { repo }).id).toBe('block_99')
  })

  it('refuses a symlinked directory inside the project that leaves it', () => {
    const elsewhere = join(root, 'elsewhere')
    mkdirSync(elsewhere, { recursive: true })
    writeFileSync(join(elsewhere, 'block_08.json'), jsonSpec({ id: 'block_08' }), 'utf-8')
    symlinkSync(elsewhere, join(repo, 'dir-link'))

    expect(message(() => readSpecFile('dir-link/block_08.json', { repo }))).toContain('outside the project directory')
  })

  it('still follows a symlink that stays inside the project', () => {
    const target = writeFile('specs/block_04.json', jsonSpec())
    symlinkSync(target, join(repo, 'link.json'))

    expect(readSpecFile('link.json', { repo }).id).toBe('block_04')
  })

  it('reports a broken symlink as a missing spec file', () => {
    symlinkSync(join(root, 'gone.json'), join(repo, 'dangling.json'))

    expect(message(() => readSpecFile('dangling.json', { repo }))).toContain('spec file not found')
  })

  it('downgrades markdown explicitly, taking the heading as the id and title', () => {
    const path = writeFile('block_05.md', '# Block 05 — TUI badge\n\nDo the thing.\n')
    const spec = readSpecFile(path, { repo })
    expect(spec.unstructured).toBe(true)
    expect(spec.title).toBe('Block 05 — TUI badge')
    expect(spec.id).toBe('block-05-tui-badge')
    expect(spec.body).toContain('Do the thing.')
  })

  it('refuses a missing, empty, oversized or non-file path, naming it home-shortened', () => {
    // An MCP host quotes the message verbatim, so the path in it must not carry the account layout.
    const missing = message(() => readSpecFile(join(repo, 'ghost.json'), { repo }))
    expect(missing).toContain('spec file not found')
    expect(missing).toContain('~/project/ghost.json')
    expect(missing).not.toContain(root)

    expect(message(() => readSpecFile(writeFile('empty.json', '   \n'), { repo }))).toContain('is empty')
    expect(message(() => readSpecFile(writeFile('big.json', 'x'.repeat(70 * 1024)), { repo }))).toContain('larger than')
    const dir = join(repo, 'a-directory')
    mkdirSync(dir, { recursive: true })
    const notFile = message(() => readSpecFile(dir, { repo }))
    expect(notFile).toContain('not a file')
    expect(notFile).not.toContain(root)
  })

  it('names a spec path outside HOME by its last component only', () => {
    // `flow_add_spec` answers a host, and a host keeps the answer: a project under /srv must not put
    // its whole path into that transcript.
    const savedHome = process.env.HOME
    process.env.HOME = mkdtempSync(join(tmpdir(), 'reeves-flow-queue-home-'))
    try {
      const missing = message(() => readSpecFile('ghost.json', { repo }))
      expect(missing).toContain('spec file not found: ghost.json')
      expect(missing).not.toContain(repo)

      const empty = message(() => readSpecFile(writeFile('empty2.json', '  \n'), { repo }))
      expect(empty).toContain('spec file is empty: empty2.json')
      expect(empty).not.toContain(repo)

      const big = message(() => readSpecFile(writeFile('big2.json', 'x'.repeat(70 * 1024)), { repo }))
      expect(big).toContain('larger than')
      expect(big).not.toContain(repo)

      const dir = join(repo, 'a-directory-2')
      mkdirSync(dir, { recursive: true })
      const notFile = message(() => readSpecFile(dir, { repo }))
      expect(notFile).toContain('not a file')
      expect(notFile).not.toContain(repo)
    } finally {
      if (savedHome === undefined) delete process.env.HOME
      else process.env.HOME = savedHome
    }
  })

  it('refuses a structured spec without requirements or checks, and reports every field', () => {
    const path = writeFile('thin.json', JSON.stringify({ id: 'block_06', title: 'Thin' }))
    expect(message(() => readSpecFile(path, { repo }))).toContain('requirements')
    expect(message(() => readSpecFile(path, { repo }))).toContain('checks')
  })

  it('refuses a block id that is already queued or dispatched', () => {
    const path = writeFile('block_04.json', jsonSpec())
    expect(message(() => readSpecFile(path, { repo, existingIds: ['block_04'] }))).toContain('already queued or dispatched')
  })
})

describe('queueSpecFile', () => {
  it('appends the block to the queue and dispatches nothing', () => {
    const path = writeFile('block_04.json', jsonSpec())
    const queued = queueSpecFile(makeState(), path, '2026-01-01T00:00:00.000Z')

    expect(queued.state.specs.map(spec => spec.id)).toEqual(['block_04'])
    // The queue is future work: the dev receives it on a later tick, not now.
    expect(queued.state.dispatched_specs).toEqual([])
    expect(queued.state.state).toBe('idle')
    expect(queued.state.updated_at).toBe('2026-01-01T00:00:00.000Z')
    expect(queued.spec.source_path).toBe(path)
  })

  it('refuses a closed flow instead of queuing into a pipeline nothing will read', () => {
    const path = writeFile('block_04.json', jsonSpec())
    for (const status of ['escalated', 'done'] as const) {
      const err = message(() => queueSpecFile(makeState({ state: status }), path))
      expect(err).toContain(status)
    }
  })

  it('does not mutate the state it was given', () => {
    const path = writeFile('block_04.json', jsonSpec())
    const state = makeState()
    queueSpecFile(state, path)
    expect(state.specs).toEqual([])
  })

  it('reports a validation failure as a FlowSpecError', () => {
    let error: unknown = null
    try {
      queueSpecFile(makeState(), join(repo, 'ghost.json'))
    } catch (err) {
      error = err
    }
    expect(error).toBeInstanceOf(FlowSpecError)
  })
})
