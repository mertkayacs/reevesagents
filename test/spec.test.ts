// Block-spec validation and prompt rendering.
//
// The validator is the gate that keeps a vacuous dispatch out of the pipeline: a spec without
// requirements or checks is refused unless the caller says, explicitly, that it wants one — and
// then the record keeps an `unstructured` marker so nobody mistakes it for a structured block.

import { describe, expect, it } from 'vitest'
import {
  SPEC_LIMITS,
  formatSpecIssues,
  parseSpecJson,
  renderDispatchPrompt,
  specFromMarkdown,
  validateSpec,
  type BlockSpec,
} from '../src/core/spec.js'

function validSpec(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'block_02',
    title: 'Core primitives',
    goal: 'Ship the busy gate, the verdict parser and the spec model.',
    requirements: ['add core/activity.ts', 'add core/verdict.ts'],
    checks: ['pnpm typecheck', 'pnpm test'],
    report: ['changed files', 'commit sha', 'check output'],
    ...overrides,
  }
}

function issueFields(result: { issues: Array<{ field: string }> }): string[] {
  return result.issues.map(issue => issue.field)
}

describe('validateSpec', () => {
  it('accepts a complete spec and trims it', () => {
    const result = validateSpec({ ...validSpec(), title: '  Core primitives  ', requirements: ['  add a file  ', '   '] })
    expect(result.issues).toEqual([])
    expect(result.spec).toMatchObject({
      id: 'block_02',
      title: 'Core primitives',
      requirements: ['add a file'],
      checks: ['pnpm typecheck', 'pnpm test'],
    })
    expect(result.spec?.unstructured).toBeUndefined()
  })

  it('requires an id and a title', () => {
    expect(issueFields(validateSpec(validSpec({ id: '' })))).toContain('id')
    expect(issueFields(validateSpec(validSpec({ title: '   ' })))).toContain('title')
    expect(validateSpec(validSpec({ id: 'has space' })).issues[0]?.field).toBe('id')
    expect(issueFields(validateSpec(validSpec({ id: '-leading-dash' })))).toContain('id')
  })

  it('refuses a block whose id is already queued or dispatched', () => {
    const result = validateSpec(validSpec(), { existingIds: ['block_02'] })
    expect(issueFields(result)).toContain('id')
    expect(formatSpecIssues(result.issues)).toContain('block_02 is already queued or dispatched')
  })

  it('refuses an unstructured block unless the caller allows one', () => {
    const refused = validateSpec(validSpec({ requirements: [], checks: [] }))
    expect(issueFields(refused)).toEqual(['requirements', 'checks', 'unstructured'])
    expect(refused.spec).toBeNull()

    const allowed = validateSpec(validSpec({ requirements: [], checks: [] }), { allowUnstructured: true })
    expect(allowed.issues).toEqual([])
    expect(allowed.spec?.unstructured).toBe(true)
  })

  it('keeps a structured spec structured even when the flag is passed', () => {
    const result = validateSpec(validSpec({ unstructured: true }), { allowUnstructured: true })
    expect(result.spec?.unstructured).toBeUndefined()
  })

  it('bounds every field', () => {
    expect(issueFields(validateSpec(validSpec({ title: 'x'.repeat(SPEC_LIMITS.title + 1) })))).toContain('title')
    expect(issueFields(validateSpec(validSpec({ goal: 'x'.repeat(SPEC_LIMITS.goal + 1) })))).toContain('goal')
    expect(issueFields(validateSpec(validSpec({ body: 'x'.repeat(SPEC_LIMITS.body + 1) })))).toContain('body')
    expect(issueFields(validateSpec(validSpec({ checks: ['x'.repeat(SPEC_LIMITS.entry + 1)] })))).toContain('checks')
    expect(issueFields(validateSpec(validSpec({
      requirements: Array.from({ length: SPEC_LIMITS.entries + 1 }, (_item, index) => `requirement ${index}`),
    })))).toContain('requirements')
  })

  it('reports wrong types instead of silently coercing them', () => {
    const bad = validateSpec(validSpec({
      goal: 42,
      body: ['not', 'a', 'string'],
      source_path: { nope: true },
      requirements: ['fine', 7, null],
    }))
    expect(issueFields(bad)).toEqual(expect.arrayContaining(['goal', 'body', 'source_path', 'requirements']))
    expect(bad.spec).toBeNull()
    expect(formatSpecIssues(bad.issues)).toContain('requirements entry must be a string')
  })

  it('rejects a non-list where a list belongs, and a non-object spec', () => {
    expect(issueFields(validateSpec(validSpec({ requirements: 'add a file' })))).toContain('requirements')
    expect(validateSpec('not a spec').issues[0]?.field).toBe('spec')
    expect(validateSpec(null).issues[0]?.field).toBe('spec')
    expect(validateSpec([validSpec()]).issues[0]?.field).toBe('spec')
  })

  it('normalizes CRLF bodies and keeps the optional fields optional', () => {
    const result = validateSpec(validSpec({ body: 'line one\r\nline two', source_path: '/tmp/block.md', goal: undefined }))
    expect(result.spec?.body).toBe('line one\nline two')
    expect(result.spec?.source_path).toBe('/tmp/block.md')
    expect(result.spec?.goal).toBe('')
    expect(result.spec?.report).toHaveLength(3)
  })
})

describe('parseSpecJson', () => {
  it('parses and validates a JSON file', () => {
    const result = parseSpecJson(JSON.stringify(validSpec()))
    expect(result.issues).toEqual([])
    expect(result.spec?.id).toBe('block_02')
  })

  it('reports broken JSON as a one-line issue instead of throwing', () => {
    const result = parseSpecJson('{not json')
    expect(result.spec).toBeNull()
    expect(result.issues[0]).toEqual({ field: 'json', message: 'spec file is not valid JSON' })
  })
})

describe('specFromMarkdown', () => {
  it('takes the title from the first heading and keeps the file as body', () => {
    const markdown = '# Block 03 — surfaces\n\nLong text with ВЕРДИКТ: ACCEPT inside.\n'
    const result = specFromMarkdown(markdown, '/specs/block_03.md')
    expect(result.issues).toEqual([])
    expect(result.spec).toMatchObject({
      id: 'block-03-surfaces',
      title: 'Block 03 — surfaces',
      unstructured: true,
      source_path: '/specs/block_03.md',
    })
    expect(result.spec?.body).toContain('Long text')
  })

  it('refuses a markdown block whose derived id is already queued', () => {
    const first = specFromMarkdown('# Block 03 — surfaces\n\nbody')
    expect(first.spec?.id).toBe('block-03-surfaces')

    const second = specFromMarkdown('# Block 03 — surfaces\n\nother body', '', { existingIds: ['block-03-surfaces'] })
    expect(second.spec).toBeNull()
    expect(issueFields(second)).toContain('id')
  })

  it('falls back to the first line when there is no heading', () => {
    const result = specFromMarkdown('just text\nmore')
    expect(result.spec?.title).toBe('just text')
    expect(result.spec?.id).toBe('just-text')
  })
})

describe('renderDispatchPrompt', () => {
  const spec: BlockSpec = validateSpec(validSpec()).spec!

  it('renders a self-contained brief from the record', () => {
    const prompt = renderDispatchPrompt(spec, { flowName: 'feature-x', position: 2 })
    expect(prompt).toContain('Flow "feature-x" — block block_02: Core primitives (2 in queue)')
    expect(prompt).toContain('Goal: Ship the busy gate')
    expect(prompt).toContain('1. add core/activity.ts')
    expect(prompt).toContain('2. add core/verdict.ts')
    expect(prompt).toContain('Checks — run each one and report the actual output:')
    expect(prompt).toContain('1. pnpm typecheck')
    expect(prompt).toContain('The report must contain:')
    expect(prompt).toContain('- commit sha')
  })

  it('leads with a visible warning for an unstructured block', () => {
    const unstructured = validateSpec(validSpec({ requirements: [], checks: [] }), { allowUnstructured: true }).spec!
    const prompt = renderDispatchPrompt(unstructured)
    expect(prompt.startsWith('WARNING: this block has no structured requirements or checks.')).toBe(true)
    expect(prompt).not.toContain('Flow "')
  })

  it('appends the long-form body when the spec has one', () => {
    const withBody = validateSpec(validSpec({ body: 'Full text here.' })).spec!
    expect(renderDispatchPrompt(withBody)).toContain('Full specification:\nFull text here.')
  })
})
