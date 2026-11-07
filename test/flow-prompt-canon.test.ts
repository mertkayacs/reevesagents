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

describe('the reviewer is told what the round was asked to do (block 61)', () => {
  it('names the plan item and its brief, and says the verdict is about conformance to it', () => {
    // On `flow-a` the brief asked for an *empty* `faq.html`; the reviewer, holding only the general rules, invented "a page needs content"
    // and rejected a commit that was exactly right. The brief is the contract of the round, and the prompt has to say so (block 61).
    const prompt = renderReviewPrompt({
      head: 'aaa111', repo: '/tmp/repo', round: 1, max_rounds: 2,
      notes_path: 'notes/aaa111-r1.md', plan_item: 'A3', brief_path: 'docs/briefs/A3.md',
    })

    expect(prompt).toContain('plan item A3')
    expect(prompt).toContain('docs/briefs/A3.md')
    expect(prompt).toContain('Judge the work as CONFORMANCE TO that brief')
    expect(prompt).toContain('A requirement that is not in the brief is not a reason for a verdict')
    // The empty-file case, spelled out: it is the one that actually happened.
    expect(prompt).toContain('If the brief asks for an empty file, an empty file is correct')
    // The general rules still apply — as prohibitions, not as a licence to invent requirements.
    expect(prompt).toContain('BLOCKER')
    expect(prompt).toContain('VERDICT: ACCEPT')
  })

  it('names the spec file for a round that is not a plan item', () => {
    const prompt = renderReviewPrompt({
      head: 'bbb222', repo: '/tmp/repo', round: 2, max_rounds: 3, brief_path: 'briefs/my-brief.md',
    })
    expect(prompt).toContain("This round's brief is briefs/my-brief.md")
    expect(prompt).toContain('CONFORMANCE TO that brief')
    // No item, no claim about one.
    expect(prompt).not.toContain('plan item')
  })

  it('leaves the prompt unchanged when there is no brief at all', () => {
    const prompt = renderReviewPrompt({ head: 'ccc333', repo: '/tmp/repo', round: 1, max_rounds: 2 })
    expect(prompt).not.toContain('CONFORMANCE')
    expect(prompt).toContain('VERDICT: ACCEPT')
  })
})
