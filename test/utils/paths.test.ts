import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { displayPath, shortHomePath } from '../../src/utils/paths.js'

// Every transcript-facing path is rendered here, so the two guarantees are pinned here: a path under
// the home directory prints as `~/…`, and a path outside it never keeps its directory chain.

let home: string
let savedHome: string | undefined

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'reeves-paths-home-'))
  savedHome = process.env.HOME
  process.env.HOME = home
})

afterEach(() => {
  if (savedHome === undefined) delete process.env.HOME
  else process.env.HOME = savedHome
  rmSync(home, { recursive: true, force: true })
})

describe('shortHomePath', () => {
  it('replaces the home prefix and leaves an outside path untouched', () => {
    expect(shortHomePath(join(home, 'flows', 'run-1.json'))).toBe('~/flows/run-1.json')
    expect(shortHomePath(home)).toBe('~')
    expect(shortHomePath('/srv/deploy/run-1.json')).toBe('/srv/deploy/run-1.json')
  })
})

describe('displayPath', () => {
  it('renders a home path exactly as shortHomePath does', () => {
    expect(displayPath(join(home, 'flows', 'run-1.json'))).toBe('~/flows/run-1.json')
    expect(displayPath(home)).toBe('~')
  })

  it('keeps only the last component of a path outside the home directory', () => {
    // This is the message an MCP host quotes into its own transcript: the deployment layout must
    // not travel with it.
    expect(displayPath('/srv/deploy/registry/flows/run-1.json')).toBe('run-1.json')
    expect(displayPath('/srv/deploy/registry/flows/run-1.json')).not.toContain('/srv')
  })

  it('leaves a relative path as the caller wrote it', () => {
    expect(displayPath('specs/block_01.json')).toBe('specs/block_01.json')
  })

  it('renders nothing as an empty string rather than "undefined"', () => {
    expect(displayPath('')).toBe('')
  })
})
