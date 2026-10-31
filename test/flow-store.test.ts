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
