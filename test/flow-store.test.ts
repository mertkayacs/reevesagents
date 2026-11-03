import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createFlowState } from '../src/core/flow.js'
import { flowPath, listFlowFiles, readFlow, saveFlow } from '../src/core/flow-store.js'

// The store owns the two things a pipeline cannot afford to lose: the document and its history.
// A save is atomic (temp + rename, no direct-write fallback) and a load never silently resets.

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'reeves-flow-store-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function makeState(runId = 'run-1', at = '2026-01-01T00:00:00.000Z') {
  return createFlowState({
    run_id: runId,
    repo: '/repo',
    roles: { dev: 'dev-1', review: 'rev-1' },
    head: 'aaa111',
    at,
  })
}

describe('flow store', () => {
  it('saves under <state-dir>/flows/<run-id>.json with mode 0600 and reads it back', () => {
    const state = makeState()
    const path = saveFlow(state, { root })

    expect(path).toBe(join(root, 'flows', 'run-1.json'))
    expect(statSync(path).mode & 0o777).toBe(0o600)
    expect(JSON.parse(readFileSync(path, 'utf-8')).schema_version).toBe(1)
    expect(readFlow('run-1', { root })).toEqual(state)
  })

  it('refuses to persist a default state for a flow that was never started', () => {
    const state = makeState('run-1', '2026-01-01T00:00:00.000Z')
    const emptyClosed = { ...state, state: 'done' as const, claim: { ...state.claim, head: '' }, log: [] }

    expect(() => saveFlow(emptyClosed, { root })).toThrow(/flow has not been started/)
    expect(existsSync(flowPath('run-1', root))).toBe(false)
  })

  it('leaves the previous document intact when the swap fails', () => {
    const path = saveFlow(makeState('run-1', '2026-01-01T00:00:00.000Z'), { root })
    const before = readFlow('run-1', { root })

    expect(() => saveFlow(makeState('run-1', '2026-02-02T00:00:00.000Z'), {
      root,
      // The window between the temp write and the rename is exactly where a crash tears a file.
      rename: () => { throw new Error('disk full') },
    })).toThrow(/flow state was not saved/)

    // No partial JSON, no abandoned temp file, and the old state still reads.
    expect(readFlow('run-1', { root })).toEqual(before)
    expect(existsSync(`${path}.tmp`)).toBe(false)
  })

  it('ignores a temp file a crashed save left behind', () => {
    saveFlow(makeState(), { root })
    writeFileSync(join(root, 'flows', 'run-1.json.tmp'), '{"schema_version":1,', 'utf-8')

    expect(readFlow('run-1', { root }).run_id).toBe('run-1')
    expect(listFlowFiles(root).map(file => file.run_id)).toEqual(['run-1'])
  })

  it('reports a damaged or foreign file instead of resetting it', () => {
    mkdirSync(join(root, 'flows'), { recursive: true })
    writeFileSync(flowPath('bad-json', root), '{"schema_version":1,', 'utf-8')
    expect(() => readFlow('bad-json', { root })).toThrow(/not valid JSON/)

    writeFileSync(flowPath('new-schema', root), JSON.stringify({ ...makeState('new-schema'), schema_version: 2 }), 'utf-8')
    expect(() => readFlow('new-schema', { root })).toThrow(/schema_version 2/)

    expect(() => readFlow('absent', { root })).toThrow(/no flow state/)
  })

  it('renders a path under HOME as ~/ in its errors, never the absolute home path', () => {
    // A transcript, a log or an approval record must not carry the account layout: the store is
    // where the path is known, so it is where the shorthand is applied.
    const savedHome = process.env.HOME
    const home = join(root, 'home')
    process.env.HOME = home
    try {
      mkdirSync(join(home, 'flows'), { recursive: true })
      writeFileSync(join(home, 'flows', 'bad.json'), '{"schema_version":1,', 'utf-8')
      let message = ''
      try {
        readFlow('bad', { root: home })
      } catch (err) {
        message = (err as Error).message
      }
      expect(message).toContain('~/flows/bad.json')
      expect(message).not.toContain(home)
      expect(() => readFlow('absent', { root: home })).toThrow(/no flow state at ~\/flows\/absent\.json/)
    } finally {
      if (savedHome === undefined) delete process.env.HOME
      else process.env.HOME = savedHome
    }
  })

  it('names the flow file by its last component when the registry is outside HOME', () => {
    // The registry is a deployment decision (`REEVES_REGISTRY`, a service account, a container
    // volume), so `shortHomePath` would keep the whole path. Every message the store raises is
    // quoted by a host, so all of them go through `displayPath`.
    const savedHome = process.env.HOME
    process.env.HOME = mkdtempSync(join(tmpdir(), 'reeves-flow-store-home-'))
    try {
      let missing = ''
      try {
        readFlow('absent', { root })
      } catch (err) {
        missing = (err as Error).message
      }
      expect(missing).toBe('no flow state at absent.json')
      expect(missing).not.toContain(root)

      mkdirSync(join(root, 'flows'), { recursive: true })
      writeFileSync(flowPath('bad-json', root), '{"schema_version":1,', 'utf-8')
      let damaged = ''
      try {
        readFlow('bad-json', { root })
      } catch (err) {
        damaged = (err as Error).message
      }
      expect(damaged).toBe('flow state is not valid JSON: bad-json.json')
      expect(damaged).not.toContain(root)

      let unsaved = ''
      try {
        saveFlow(makeState('never'), {
          root,
          rename: () => {
            throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })
          },
        })
      } catch (err) {
        unsaved = (err as Error).message
      }
      expect(unsaved).toContain('flow state was not saved: never.json')
      expect(unsaved).not.toContain(root)
    } finally {
      if (savedHome === undefined) delete process.env.HOME
      else process.env.HOME = savedHome
    }
  })

  it('reports a save failure by its error code, never by the path the fs error carries', () => {
    saveFlow(makeState(), { root })
    let message = ''
    try {
      saveFlow(makeState('run-1', '2026-02-02T00:00:00.000Z'), {
        root,
        rename: () => {
          throw Object.assign(
            new Error("ENOENT: no such file or directory, rename '/tmp/elsewhere/x.json.tmp' -> '/tmp/elsewhere/x.json'"),
            { code: 'ENOENT' },
          )
        },
      })
    } catch (err) {
      message = (err as Error).message
    }
    expect(message).toContain('flow state was not saved')
    expect(message).toContain('ENOENT')
    expect(message).not.toContain('/tmp/elsewhere')
  })

  it('drops a path that carries no error code, even when it contains spaces', () => {
    // A quoted path with a space used to survive token by token: replacing `'/home/some` left
    // `one/.reeves/flows/run-1.json.tmp'` behind in the message.
    let message = ''
    try {
      saveFlow(makeState(), {
        root,
        rename: () => {
          throw new Error("could not swap '/home/some one/.reeves/flows/run-1.json.tmp' into place")
        },
      })
    } catch (err) {
      message = (err as Error).message
    }
    expect(message).toContain('<path>')
    expect(message).not.toContain('/home')
    expect(message).not.toContain('one/.reeves')
  })

  it('reports a read failure by its code, keeping the home shorthand', () => {
    // A directory where the document should be: the fs error names it, the report must not.
    // HOME is pinned to the test root so the assertion is about the invariant and not about where
    // the system put its temp directory (a TMPDIR outside $HOME would legitimately stay absolute).
    const savedHome = process.env.HOME
    process.env.HOME = root
    try {
      mkdirSync(join(root, 'flows', 'dir-run.json'), { recursive: true })
      let message = ''
      try {
        readFlow('dir-run', { root })
      } catch (err) {
        message = (err as Error).message
      }
      expect(message).toBe('flow state could not be read: ~/flows/dir-run.json (EISDIR)')
    } finally {
      if (savedHome === undefined) delete process.env.HOME
      else process.env.HOME = savedHome
    }
  })

  it('refuses a run id that is not a plain file name', () => {
    expect(() => flowPath('../escape', root)).toThrow(/not a valid flow id/)
    expect(() => readFlow('a/b', { root })).toThrow(/not a valid flow id/)
  })

  it('lists flow files sorted and skips foreign entries', () => {
    saveFlow(makeState('run-b'), { root })
    saveFlow(makeState('run-a'), { root })
    writeFileSync(join(root, 'flows', 'notes.txt'), 'x', 'utf-8')

    expect(listFlowFiles(root).map(file => file.run_id)).toEqual(['run-a', 'run-b'])
    expect(listFlowFiles(join(root, 'no-such-dir'))).toEqual([])
  })
})
