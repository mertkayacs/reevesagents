import { describe, expect, it } from 'vitest'
import { renderFixPrompt, renderReviewPrompt } from '../src/core/flow.js'

// The engine's prompts are English by decision (2026-11-01); the machine tokens are `VERDICT`,
// `BLOCKER|MAJOR|MINOR`, `file:line` and `no findings`. A Cyrillic token in a prompt is the drift this guards.
describe('the engine speaks one canon', () => {
  it('has no Cyrillic in the review prompt', () => {
    const prompt = renderReviewPrompt({ head: 'aaa111', repo: '/tmp/repo', round: 1, max_rounds: 2, notes_path: 'notes/aaa111-r1.md' })
    expect(/\p{Script=Cyrillic}/u.test(prompt)).toBe(false)
    expect(prompt).toContain('VERDICT: ACCEPT')
    expect(prompt).toContain('notes/aaa111-r1.md')
  })

  it('has no Cyrillic in the fix prompt', () => {
    const prompt = renderFixPrompt({ head: 'aaa111', notes: 'MAJOR src/a.ts:1 — x', round: 1, max_rounds: 2 })
    expect(/\p{Script=Cyrillic}/u.test(prompt)).toBe(false)
  })
})
