// Verdict parsing: the reviewer's decision read off the pane.
//
// Two rules matter: the count is what the engine keys "a new verdict appeared" on (so it must
// be stable for one capture window), and the notes leave this module already redacted because
// they are persisted, toasted and attached to approvals.

import { describe, expect, it } from 'vitest'
import { countVerdicts, lastVerdict, NOTES_LIMIT, scanVerdict, verdictNotes } from '../src/core/verdict.js'

describe('verdict scanning', () => {
  it('counts every verdict and returns the latest one', () => {
    const pane = [
      'VERDICT: CHANGES_REQUESTED',
      'MAJOR missing test',
      'ВЕРДИКТ — ACCEPT',
    ].join('\n')

    expect(countVerdicts(pane)).toBe(2)
    expect(lastVerdict(pane)).toBe('ACCEPT')
    expect(scanVerdict(pane)).toMatchObject({ count: 2, last: 'ACCEPT' })
  })

  it('accepts the spellings a prompt may ask for', () => {
    for (const line of ['VERDICT: ACCEPT', 'verdict accept', 'ВЕРДИКТ: ACCEPT', 'ВЕРДИКТ — ACCEPT', 'VERDICT ACCEPT']) {
      expect(lastVerdict(line)).toBe('ACCEPT')
      expect(countVerdicts(line)).toBe(1)
    }
    expect(lastVerdict('VERDICT: CHANGES_REQUESTED')).toBe('CHANGES_REQUESTED')
    expect(lastVerdict('changes requested, verdict pending')).toBeNull()
    expect(countVerdicts('no verdict here')).toBe(0)
  })

  it('is case-sensitive about the verdict value only', () => {
    // "Accept" in prose must not count; the token is the reviewer's contract.
    expect(lastVerdict('the reviewer said Accept eventually')).toBeNull()
    expect(countVerdicts('verdict: ACCEPT and VERDICT: ACCEPT')).toBe(2)
  })

  it('collects the findings lines, newest last', () => {
    const pane = [
      'VERDICT: CHANGES_REQUESTED',
      'BLOCKER crash on empty repo',
      'MAJOR missing test',
      'MINOR naming',
      'notes: these are fine',
    ].join('\n')

    expect(verdictNotes(pane)).toBe('BLOCKER crash on empty repo\nMAJOR missing test\nMINOR naming')
  })

  it('caps the notes at the last twenty lines', () => {
    const pane = Array.from({ length: NOTES_LIMIT + 5 }, (_item, index) => `MAJOR finding ${index}`).join('\n')
    const notes = verdictNotes(pane).split('\n')
    expect(notes).toHaveLength(NOTES_LIMIT)
    expect(notes[0]).toBe(`MAJOR finding ${5}`)
    expect(notes.at(-1)).toBe(`MAJOR finding ${NOTES_LIMIT + 4}`)
  })

  it('redacts secrets in the notes it returns', () => {
    const pane = 'VERDICT: CHANGES_REQUESTED\nMAJOR key sk-abcdefghijklmnopqrstuvwx leaked in the diff'
    expect(verdictNotes(pane)).toContain('[REDACTED]')
    expect(scanVerdict(pane).notes).not.toContain('sk-abcdefghijklmnopqrstuvwx')
  })

  it('flags a truncated window so a caller can detect a scrolled verdict', () => {
    const short = 'VERDICT: ACCEPT\nMAJOR one'
    expect(scanVerdict(short, 10).truncated).toBe(false)

    // Older verdicts scroll out of the window, so the count can shrink between two scans: a
    // caller must re-baseline instead of concluding "no new verdict".
    const long = ['VERDICT: CHANGES_REQUESTED', ...Array.from({ length: 10 }, (_item, index) => `line ${index}`), 'VERDICT: ACCEPT'].join('\n')
    const narrow = scanVerdict(long, 3)
    expect(narrow.truncated).toBe(true)
    expect(narrow.count).toBe(1)
    expect(narrow.last).toBe('ACCEPT')
  })

  it('reads only the requested tail window', () => {
    const pane = ['VERDICT: ACCEPT', 'MAJOR old', 'later output', 'more output'].join('\n')
    expect(countVerdicts(pane, 2)).toBe(0)
    expect(countVerdicts(pane, 4)).toBe(1)
    expect(verdictNotes(pane, 2)).toBe('')
    expect(verdictNotes(pane, 3)).toBe('MAJOR old')
  })
})
