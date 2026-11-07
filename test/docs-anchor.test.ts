// D6 of the live run: a commit that only carries the plan document or a brief is not the dev's work. The git-level
// detection is exercised against a real repository — a mocked `execFileSync` would prove nothing about `git diff`.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { createFlowState } from '../src/core/flow.js'
import { readFlow, saveFlow } from '../src/core/flow-store.js'
import { changedPathsBetween, docsOnlySince } from '../src/core/flow-runner.js'
import { createPlan, savePlan } from '../src/core/plan.js'

let repo: string
let registry: string
let savedRegistry: string | undefined

function git(args: string[]): string {
  return String(execFileSync('git', ['-C', repo, ...args], { encoding: 'utf-8' }))
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'reeves-docs-anchor-repo-'))
  registry = mkdtempSync(join(tmpdir(), 'reeves-docs-anchor-reg-'))
  savedRegistry = process.env.REEVES_REGISTRY
  process.env.REEVES_REGISTRY = registry
  process.env.REEVES_CONFIG = join(registry, 'config.json')
  git(['init', '-q'])
  git(['-c', 'user.email=a@b', '-c', 'user.name=a', 'commit', '-q', '--allow-empty', '-m', 'start'])
})

afterEach(() => {
  if (savedRegistry === undefined) delete process.env.REEVES_REGISTRY
  else process.env.REEVES_REGISTRY = savedRegistry
  delete process.env.REEVES_CONFIG
  rmSync(repo, { recursive: true, force: true })
  rmSync(registry, { recursive: true, force: true })
})

function seedFlow(head: string) {
  const state = createFlowState({
    run_id: 'run-1', repo, roles: { dev: 'dev-1', review: 'rev-1' }, max_rounds: 3, max_total_rounds: 8,
    at: '2026-11-02T09:00:00.000Z',
  })
  const seeded = { ...state, state: 'idle' as const, claim: { head, verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null } }
  saveFlow(seeded)
  return seeded
}

function commitDocsAndCode(): { docsCommit: string, codeCommit: string, start: string } {
  const start = git(['rev-parse', 'HEAD']).trim()
  mkdirSync(join(repo, 'docs', 'briefs'), { recursive: true })
  writeFileSync(join(repo, 'docs', 'plan.md'), '- [ ] **P1.1** — first\n')
  writeFileSync(join(repo, 'docs', 'briefs', 'P1.1.md'), 'brief\n')
  git(['add', '-A'])
  git(['-c', 'user.email=a@b', '-c', 'user.name=a', 'commit', '-q', '-m', 'docs: plan and brief'])
  const docsCommit = git(['rev-parse', 'HEAD']).trim()
  writeFileSync(join(repo, 'index.html'), '<!doctype html>\n')
  git(['add', '-A'])
  git(['-c', 'user.email=a@b', '-c', 'user.name=a', 'commit', '-q', '-m', 'feat: two empty files'])
  const codeCommit = git(['rev-parse', 'HEAD']).trim()
  return { docsCommit, codeCommit, start }
}

describe('telling a document commit from work (D6)', () => {
  it('reports the files a commit range touched', () => {
    const { docsCommit, codeCommit, start } = commitDocsAndCode()

    expect(changedPathsBetween(repo, start, docsCommit)).toEqual(['docs/briefs/P1.1.md', 'docs/plan.md'])
    expect(changedPathsBetween(repo, start, codeCommit)).toContain('index.html')
  })

  it('says a docs-only range is documentation and a mixed range is work', () => {
    const { docsCommit, codeCommit, start } = commitDocsAndCode()

    // The plan's own source path comes from the mirror: without it `docs/plan.md` would look like code.
    const plan = createPlan({
      run_id: 'run-1', source_path: 'docs/plan.md', text: '- [ ] **P1.1** — first', now: 0, at: '2026-11-02T09:00:00.000Z',
    }).plan
    mkdirSync(join(registry, 'flows'), { recursive: true })
    savePlan(plan)

    const atDocs = seedFlow(start)
    expect(docsOnlySince(atDocs, docsCommit)).toBe(true)
    const atCode = { ...readFlow('run-1'), claim: { head: start, verdict: null, verdict_count: 0, verdict_applied: false, spec_id: null } }
    expect(docsOnlySince(atCode, codeCommit)).toBe(false)
  })

  it('treats an unreadable range as work, never as documentation', () => {
    const state = seedFlow('deadbeef'.repeat(5))
    // A head that does not exist in this repository: the diff fails, and the answer must be "cannot tell".
    expect(changedPathsBetween(repo, 'deadbeef'.repeat(5), git(['rev-parse', 'HEAD']).trim())).toBeNull()
    expect(docsOnlySince(state, git(['rev-parse', 'HEAD']).trim())).not.toBe(true)
  })
})
