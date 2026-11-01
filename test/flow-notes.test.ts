import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  NOTES_FILE_MAX_BYTES, NOTES_KEEP_ROUNDS_PER_HEAD, NOTES_PANE_MAX_BYTES,
} from '../src/core/flow-notes.js'
import {
  countFindings, durablePath, findingsText, listNotesHeads, notesDir, notesRef, notesExist, panePath,
  publishNotes, pruneClosedFlowNotes, pruneNotes, readNotesRound, readStaging, removeNotesDir,
  sanitizeNotesText, stagingPath, validateNotesText, writePaneCapture,
} from '../src/core/flow-notes.js'

// The notes channel, module by module: the staging file is untrusted input, the durable file is the
// sanitised record, and everything is bounded. The runner's read order and the CLI are covered by their
// own files; this one is about what lands on disk.

const HEAD_A = 'a'.repeat(40)
const HEAD_B = 'b'.repeat(40)

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'reeves-flow-notes-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function runNotes(runId = 'run-1'): string {
  return notesDir(runId, root)
}

function writeStaging(runId: string, head: string, round: number, text: string): string {
  const path = stagingPath(runId, head, round, root)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, text, 'utf-8')
  return path
}

function validNotes(overrides: { findings?: string, verdict?: string } = {}): string {
  const findings = overrides.findings ?? 'MAJOR src/core/flow.ts:120 — the claim is not re-read\nMINOR docs/x.md:4 — wording'
  return `# Round notes\n\n${findings}\n\nВЕРДИКТ: ${overrides.verdict ?? 'CHANGES_REQUESTED'}\n`
}

describe('validation', () => {
  it('accepts findings followed by a verdict line and counts them by kind', () => {
    const parsed = validateNotesText(validNotes())
    expect(parsed.verdict).toBe('CHANGES_REQUESTED')
    expect(parsed.counts).toEqual({ blocker: 0, major: 1, minor: 1 })
    expect(parsed.reason).toBeUndefined()
  })

  it('accepts an ACCEPT with no findings but refuses CHANGES_REQUESTED without one', () => {
    expect(validateNotesText('ВЕРДИКТ: ACCEPT\n').verdict).toBe('ACCEPT')
    const refused = validateNotesText('nothing useful\nВЕРДИКТ: CHANGES_REQUESTED\n')
    expect(refused.reason).toContain('without a BLOCKER/MAJOR/MINOR line')
  })

  it('refuses a file whose last line is not a verdict', () => {
    expect(validateNotesText('MAJOR x:1 — y\n').reason).toBe('no verdict line at the end')
    expect(validateNotesText('   ').reason).toBe('empty')
  })

  it('counts and extracts only finding lines', () => {
    const text = validNotes().replace('MINOR docs/x.md:4 — wording', 'MINOR docs/x.md:4 — wording\nBLOCKER a.ts:9 — boom')
    expect(countFindings(text)).toEqual({ blocker: 1, major: 1, minor: 1 })
    expect(findingsText(text).split('\n')).toHaveLength(3)
  })
})

describe('sanitising', () => {
  it('redacts a secret and shortens an absolute path outside home', () => {
    // Built from parts: the workspace scanner masks key-shaped literals in tool output.
    const key = ['sk', 'ant', 'abcdefghijklmnopqrstuvwxyz'].join('-')
    const cleaned = sanitizeNotesText(`MAJOR /srv/users/alice/project/src/app.ts:12 — leaks ${key}`)
    expect(cleaned).not.toContain(key)
    expect(cleaned).toContain('[REDACTED]')
    expect(cleaned).not.toContain('/srv/users/alice')
    expect(cleaned).toContain('app.ts')
  })

  it('keeps a relative file:line reference intact', () => {
    expect(sanitizeNotesText('MAJOR src/core/flow.ts:120 — fine')).toBe('MAJOR src/core/flow.ts:120 — fine')
  })
})

describe('staging → durable', () => {
  it('publishes the sanitised record, removes the staging file and keeps the mode 0600', () => {
    writeStaging('run-1', HEAD_A, 1, validNotes())

    const published = publishNotes('run-1', HEAD_A, 1, validNotes(), { root })

    expect(published.ref).toBe(notesRef(HEAD_A, 1))
    expect(published.counts).toEqual({ blocker: 0, major: 1, minor: 1 })
    expect(existsSync(published.path)).toBe(true)
    expect(existsSync(stagingPath('run-1', HEAD_A, 1, root))).toBe(false)
    expect(statSync(published.path).mode & 0o777).toBe(0o600)
    expect(statSync(runNotes()).mode & 0o777).toBe(0o700)
    expect(readFileSync(published.path, 'utf-8')).toContain('ВЕРДИКТ: CHANGES_REQUESTED')
  })

  it('keeps two rounds of one head side by side', () => {
    const first = publishNotes('run-1', HEAD_A, 1, validNotes({ verdict: 'ACCEPT' }).replace(/\nMAJOR[^\n]*/, ''), { root })
    const second = publishNotes('run-1', HEAD_A, 2, validNotes(), { root })

    expect(existsSync(first.path)).toBe(true)
    expect(existsSync(second.path)).toBe(true)
    expect(readNotesRound('run-1', { head: HEAD_A, round: 1 }, { root }).ok).toBe(true)
    const latest = readNotesRound('run-1', { head: HEAD_A }, { root })
    expect(latest.ok && latest.round.round).toBe(2)
  })

  it('refuses to publish an invalid staging text', () => {
    expect(() => publishNotes('run-1', HEAD_A, 1, 'no verdict here', { root })).toThrow(/cannot publish notes/)
  })

  it('caps the record at a line boundary without losing the verdict', () => {
    const long = Array.from({ length: 4000 }, (_, i) => `MAJOR a.ts:${i} — ${'x'.repeat(60)}`).join('\n')
    const published = publishNotes('run-1', HEAD_A, 1, `${long}\n\nВЕРДИКТ: CHANGES_REQUESTED\n`, { root })
    const text = readFileSync(published.path, 'utf-8')

    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(NOTES_FILE_MAX_BYTES)
    // The verdict line is the record's last line, and the cut is visible instead of silent.
    expect(text.trimEnd().split('\n').at(-1)).toBe('ВЕРДИКТ: CHANGES_REQUESTED')
    expect(text).toContain(`(notes truncated at ${NOTES_FILE_MAX_BYTES} bytes)`)
    // The counts come from the raw text, so a truncation does not change what the round reported.
    expect(published.counts.major).toBe(4000)
  })
})

describe('reading the staging file', () => {
  it('reports a missing file as data, not an error', () => {
    expect(readStaging('run-1', HEAD_A, 1, { root })).toEqual({ ok: false, reason: 'missing' })
  })

  it('refuses a symlinked staging file', () => {
    const real = join(root, 'outside.md')
    writeFileSync(real, validNotes(), 'utf-8')
    const path = stagingPath('run-1', HEAD_A, 1, root)
    mkdirSync(join(path, '..'), { recursive: true })
    symlinkSync(real, path)

    expect(() => readStaging('run-1', HEAD_A, 1, { root })).toThrow(/symlinked notes file/)
  })

  it('refuses an oversized staging file', () => {
    writeStaging('run-1', HEAD_A, 1, `MAJOR a.ts:1 — ${'x'.repeat(NOTES_FILE_MAX_BYTES)}\nВЕРДИКТ: CHANGES_REQUESTED\n`)
    const read = readStaging('run-1', HEAD_A, 1, { root })
    expect(read.ok).toBe(false)
    expect(!read.ok && read.reason).toContain('larger than')
  })
})

describe('pane capture', () => {
  it('writes a sanitised, tail-kept capture with mode 0600', () => {
    const key = ['sk', 'ant', 'abcdefghijklmnopqrstuvwxyz'].join('-')
    const pane = `${'noise\n'.repeat(2000)}VERDICT: ACCEPT\nleak ${key}\n`
    const written = writePaneCapture('run-1', HEAD_A, 1, pane, { root })

    const text = readFileSync(written.path, 'utf-8')
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(NOTES_PANE_MAX_BYTES)
    expect(text).toContain('VERDICT: ACCEPT')
    expect(text).not.toContain(key)
    expect(statSync(written.path).mode & 0o777).toBe(0o600)
    expect(written.path).toBe(panePath('run-1', HEAD_A, 1, root))
  })
})

describe('reading a round', () => {
  it('returns the sanitised text, ref and counts of the requested round', () => {
    publishNotes('run-1', HEAD_A, 2, validNotes(), { root })
    const found = readNotesRound('run-1', { head: HEAD_A, round: 2 }, { root })

    expect(found.ok).toBe(true)
    if (!found.ok) return
    expect(found.round.ref).toBe(notesRef(HEAD_A, 2))
    expect(found.round.counts).toEqual({ blocker: 0, major: 1, minor: 1 })
    expect(found.round.text).toContain('MAJOR src/core/flow.ts:120')
  })

  it('sanitises a file it did not write', () => {
    const path = durablePath('run-1', HEAD_A, 1, root)
    mkdirSync(join(path, '..'), { recursive: true })
    const key = ['sk', 'ant', 'abcdefghijklmnopqrstuvwxyz'].join('-')
    writeFileSync(path, `MAJOR /srv/users/alice/app.ts:1 — ${key}\nВЕРДИКТ: CHANGES_REQUESTED\n`, 'utf-8')

    const found = readNotesRound('run-1', { head: HEAD_A }, { root })
    expect(found.ok).toBe(true)
    if (!found.ok) return
    expect(found.round.text).not.toContain(key)
    expect(found.round.text).not.toContain('/srv/users/alice')
  })

  it('lists heads and refuses an unknown round with the rounds it knows', () => {
    publishNotes('run-1', HEAD_A, 1, validNotes(), { root })
    publishNotes('run-1', HEAD_B, 1, validNotes(), { root })

    expect(listNotesHeads('run-1', root).sort()).toEqual([HEAD_A, HEAD_B].sort())
    const missing = readNotesRound('run-1', { head: HEAD_A, round: 7 }, { root })
    expect(missing.ok).toBe(false)
    expect(!missing.ok && missing.rounds).toEqual([1])
  })

  it('reports "no notes" for a head that never had a file', () => {
    const missing = readNotesRound('run-1', { head: HEAD_A }, { root })
    expect(missing.ok).toBe(false)
    expect(!missing.ok && missing.reason).toBe('missing')
  })
})

describe('retention', () => {
  it('keeps the newest rounds per head and drops the older ones with their captures', () => {
    for (let round = 1; round <= NOTES_KEEP_ROUNDS_PER_HEAD + 2; round += 1) {
      publishNotes('run-1', HEAD_A, round, validNotes(), { root })
      writePaneCapture('run-1', HEAD_A, round, `VERDICT: CHANGES_REQUESTED ${round}`, { root })
      // Ordering is by mtime: make each round strictly newer than the previous one.
      const when = new Date(Date.now() + round * 1000)
      utimesSync(durablePath('run-1', HEAD_A, round, root), when, when)
      utimesSync(panePath('run-1', HEAD_A, round, root), when, when)
    }

    const pruned = pruneNotes('run-1', { root })

    expect(pruned.removed.length).toBe(4)   // 2 rounds × (md + pane)
    for (let round = 1; round <= 2; round += 1) {
      expect(existsSync(durablePath('run-1', HEAD_A, round, root))).toBe(false)
    }
    expect(existsSync(durablePath('run-1', HEAD_A, 5, root))).toBe(true)
  })

  it('keeps only the newest round when the flow closes', () => {
    for (let round = 1; round <= 3; round += 1) {
      publishNotes('run-1', HEAD_A, round, validNotes(), { root })
      const when = new Date(Date.now() + round * 1000)
      utimesSync(durablePath('run-1', HEAD_A, round, root), when, when)
    }

    pruneClosedFlowNotes('run-1', { root })

    expect(existsSync(durablePath('run-1', HEAD_A, 3, root))).toBe(true)
    expect(existsSync(durablePath('run-1', HEAD_A, 1, root))).toBe(false)
  })

  it('removes the whole directory on request and reports whether it existed', () => {
    publishNotes('run-1', HEAD_A, 1, validNotes(), { root })
    expect(notesExist('run-1', root)).toBe(true)
    expect(removeNotesDir('run-1', root)).toBe(true)
    expect(notesExist('run-1', root)).toBe(false)
    expect(removeNotesDir('run-1', root)).toBe(false)
  })

  it('is a no-op on a run that never had notes', () => {
    expect(pruneNotes('run-1', { root })).toEqual({ removed: [], kept: 0 })
    expect(removeNotesDir('nobody', root)).toBe(false)
  })
})
