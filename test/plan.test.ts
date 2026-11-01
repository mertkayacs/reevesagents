// The plan as an object: parser, import rules and store (docs/plan-model-design.md, block 12).
//
// The two documents here are the *shapes* the design describes, not the projects they came from: one with
// explicit ids, one without and with folded lines. Tests are about the shapes.

import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  attachSpec, createPlan, deriveId, hashDocument, importInto, normalizeDocument, parsePlanDocument,
  planComplete, planPath, planProgress, planSummary, PlanError, readPlan, savePlan, setItemStatus,
} from '../src/core/plan.js'

const NOW = Date.parse('2026-11-02T09:00:00.000Z')
const AT = new Date(NOW).toISOString()

// The id-bearing shape: `- [x] **ID** — text`.
const WITH_IDS = [
  '# Plan',
  '',
  '## Milestone 1',
  '',
  '- [x] **P1.1.1** — create the workspace',
  '- [x] **P1.1.2** — wire lint and typecheck',
  '- [ ] **P1.2.1** — the edge port',
  '',
  'Some prose between items.',
  '',
  '## Milestone 2',
  '',
  '- [ ] **P2.1.1** — the booking form',
].join('\n')

// The id-less shape: no ids, a folded item, a blockquote note.
const PLAIN = [
  '## Stage 0',
  '',
  '- [x] Copy the files and the dump.',
  '- [ ] Decide the fate of the legacy tables — **decision taken',
  '  after the call with the owner',
  '',
  '> Results: recorded in the baseline note.',
  '',
  '## Stage 1',
  '',
  '- [ ] Set up backups.',
].join('\n')

function importNew(text: string, overrides: Partial<Parameters<typeof createPlan>[0]> = {}) {
  return createPlan({ run_id: 'run-1', source_path: 'docs/implementation-plan.md', text, now: NOW, at: AT, ...overrides })
}

describe('the document parser', () => {
  it('reads the id-bearing shape, in document order, ignoring prose between items', () => {
    const document = parsePlanDocument(WITH_IDS)
    expect(document.format).toBe('ids')
    expect(document.items.map(item => item.id)).toEqual(['P1.1.1', 'P1.1.2', 'P1.2.1', 'P2.1.1'])
    expect(document.items.map(item => item.checked)).toEqual([true, true, false, false])
    expect(document.items[0]!.title).toBe('create the workspace')
    expect(document.items[2]!.line).toBe(7)
  })

  it('derives stable ids for the id-less shape and folds a continuation line', () => {
    const document = parsePlanDocument(PLAIN)
    expect(document.format).toBe('plain')
    expect(document.items).toHaveLength(3)
    expect(document.items[0]!.id).toMatch(/^auto:[0-9a-f]{8}$/)
    expect(document.items[0]!.id).toBe(deriveId('Copy the files and the dump.'))
    expect(document.items[1]!.title).toBe(
      'Decide the fate of the legacy tables — **decision taken after the call with the owner',
    )
    expect(document.items[2]!.title).toBe('Set up backups.')
    // The blockquote belongs to the stage, not to the item above it.
    expect(document.items[1]!.title).not.toContain('Results')
  })

  it('hashes the normalised document, so CRLF and trailing spaces are not a change', () => {
    const lf = hashDocument('a\nb\n')
    expect(hashDocument('a\r\nb\r\n')).toBe(lf)
    expect(hashDocument('a  \nb\t\n')).toBe(lf)
    expect(normalizeDocument('a\r\nb\r\n')).toBe('a\nb')
    // A real edit is a real change.
    expect(hashDocument('a\nc\n')).not.toBe(lf)
  })

  it('refuses a duplicate id, naming both lines', () => {
    const text = ['- [ ] **P1** — one', '- [ ] **P1** — two'].join('\n')
    expect(() => parsePlanDocument(text)).toThrow(/'P1'|P1/)
    try {
      parsePlanDocument(text)
    } catch (err) {
      expect((err as PlanError).message).toContain('lines 1 and 2')
      expect((err as PlanError).code).toBe('refused')
    }
  })

  it('refuses a document with no items instead of importing an empty plan', () => {
    expect(() => parsePlanDocument('# Plan\n\njust prose\n')).toThrow(/no plan items/)
  })

  it('refuses an id that cannot double as a spec id', () => {
    expect(() => parsePlanDocument('- [ ] **1.2 a/b** — text')).toThrow(/not usable as an item id/)
  })
})

describe('import', () => {
  it('creates every item as pending and records the source hash', () => {
    const result = importNew(WITH_IDS)
    expect(result.added).toEqual(['P1.1.1', 'P1.1.2', 'P1.2.1', 'P2.1.1'])
    expect(result.plan.items.every(item => item.status === 'pending')).toBe(true)
    expect(result.plan.imported_at).toBe(AT)
    expect(result.plan.source_hash).toBe(hashDocument(WITH_IDS))
    expect(result.unchanged).toBe(false)
  })

  it('does nothing at all when the document is unchanged', () => {
    const first = importNew(WITH_IDS)
    const second = importInto(first.plan, { run_id: 'run-1', source_path: 'docs/implementation-plan.md', text: WITH_IDS, now: NOW + 60_000 })
    expect(second.unchanged).toBe(true)
    expect(second.plan).toBe(first.plan)      // the same object: nothing was rewritten
  })

  it('adds a new item and marks a vanished one missing without deleting it', () => {
    const first = importNew(WITH_IDS)
    const edited = WITH_IDS.replace('- [ ] **P2.1.1** — the booking form', '- [ ] **P2.1.1** — the booking form\n- [ ] **P2.2.1** — the receipt')
      .replace('- [x] **P1.1.2** — wire lint and typecheck\n', '')
    const second = importInto(first.plan, { run_id: 'run-1', source_path: 'docs/implementation-plan.md', text: edited, now: NOW + 60_000, at: '2026-11-02T09:01:00.000Z' })

    expect(second.added).toEqual(['P2.2.1'])
    expect(second.missing).toEqual(['P1.1.2'])
    const gone = second.plan.items.find(item => item.id === 'P1.1.2')!
    expect(gone.missing_since).toBe('2026-11-02T09:01:00.000Z')
    expect(gone.line).toBeNull()
    // It is still there, with the status it had.
    expect(gone.status).toBe('pending')
  })

  it('never demotes a done item: an unticked line becomes a conflict', () => {
    const first = importNew(WITH_IDS)
    const closed = {
      ...first.plan,
      items: first.plan.items.map(item => (item.id === 'P1.1.1' ? { ...item, status: 'done' as const, head: 'abc1234' } : item)),
    }
    const unticked = WITH_IDS.replace('- [x] **P1.1.1**', '- [ ] **P1.1.1**')
    const second = importInto(closed, { run_id: 'run-1', source_path: 'docs/implementation-plan.md', text: unticked, now: NOW + 60_000 })

    expect(second.plan.items.find(item => item.id === 'P1.1.1')!.status).toBe('done')
    const untickConflicts = second.conflicts.filter(entry => entry.kind === 'unticked')
    expect(untickConflicts).toHaveLength(1)
    expect(untickConflicts[0]).toMatchObject({ item_id: 'P1.1.1' })

    // The same disagreement twice is recorded once.
    const third = importInto(second.plan, { run_id: 'run-1', source_path: 'docs/implementation-plan.md', text: unticked.replace('## Milestone 2', '## Milestone 2 (edited)'), now: NOW + 120_000 })
    expect(third.plan.conflicts.filter(entry => entry.kind === 'unticked')).toHaveLength(1)
  })

  it('logs no conflict for an item the document already ticks on the first import', () => {
    const first = importNew(WITH_IDS)
    // Two items are ticked in the document, and the mirror has just been created: nothing disagrees yet.
    expect(first.conflicts).toEqual([])
    expect(first.plan.items.find(item => item.id === 'P1.1.1')!.status).toBe('pending')
  })

  it('does not promote a hand-ticked item, and says so', () => {
    const first = importNew(WITH_IDS)
    const ticked = WITH_IDS.replace('- [ ] **P1.2.1**', '- [x] **P1.2.1**')
    const second = importInto(first.plan, { run_id: 'run-1', source_path: 'docs/implementation-plan.md', text: ticked, now: NOW + 60_000 })

    expect(second.plan.items.find(item => item.id === 'P1.2.1')!.status).toBe('pending')
    expect(second.conflicts.some(entry => entry.item_id === 'P1.2.1' && entry.kind === 'ticked_by_hand')).toBe(true)
  })

  it('keeps the brief and the history when the text of an item changes', () => {
    const first = importNew(WITH_IDS)
    const attached = attachSpec(first.plan, {
      id: 'P1.2.1',
      text: JSON.stringify({ id: 'P1.2.1', title: 'the edge port', goal: 'g', requirements: ['r'], checks: ['c'], report: ['r'] }),
      format: 'json',
      spec_path: 'docs/briefs/P1.2.1.json',
      now: NOW,
    })
    const retitled = WITH_IDS.replace('the edge port', 'the edge port, on 7810')
    const second = importInto(attached.plan, { run_id: 'run-1', source_path: 'docs/implementation-plan.md', text: retitled, now: NOW + 60_000 })

    const item = second.plan.items.find(entry => entry.id === 'P1.2.1')!
    expect(item.title).toBe('the edge port, on 7810')
    expect(item.spec_path).toBe('docs/briefs/P1.2.1.json')
    expect(item.status).toBe('queued')
  })
})

describe('status and progress', () => {
  it('counts done, skipped and the waiting items apart', () => {
    const first = importNew(WITH_IDS)
    const plan = {
      ...first.plan,
      items: first.plan.items.map(item => {
        if (item.id === 'P1.1.1') return { ...item, status: 'done' as const, head: 'abc1234' }
        if (item.id === 'P1.1.2') return { ...item, status: 'skipped' as const }
        if (item.id === 'P1.2.1') return { ...item, status: 'needs_brief' as const, owner_action: true }
        return item
      }),
    }
    const progress = planProgress(plan)
    expect(progress).toMatchObject({ done: 1, total: 4, skipped: 1 })
    expect(progress.by_status.needs_brief).toBe(1)
    expect(planSummary(plan)).toMatchObject({ done: 1, total: 4, waiting: 1 })
    expect(planComplete(plan)).toBe(false)
  })

  it('is complete only when every item is done or skipped', () => {
    const first = importNew(WITH_IDS)
    const all = { ...first.plan, items: first.plan.items.map(item => ({ ...item, status: 'done' as const })) }
    expect(planComplete(all)).toBe(true)
    const oneOpen = { ...all, items: all.items.map((item, index) => (index === 0 ? { ...item, status: 'pending' as const } : item)) }
    expect(planComplete(oneOpen)).toBe(false)
  })

  it('refuses a manual done without --yes and a note, and accepts it with both', () => {
    const first = importNew(WITH_IDS)
    expect(() => setItemStatus(first.plan, { id: 'P1.2.1', status: 'done', now: NOW })).toThrow(/needs --yes/)
    expect(() => setItemStatus(first.plan, { id: 'P1.2.1', status: 'done', yes: true, now: NOW })).toThrow(/--note/)
    const closed = setItemStatus(first.plan, { id: 'P1.2.1', status: 'done', yes: true, note: 'delivered by hand before the flow existed', now: NOW })
    expect(closed.plan.items.find(item => item.id === 'P1.2.1')!.status).toBe('done')
    expect(closed.plan.conflicts.at(-1)).toMatchObject({ item_id: 'P1.2.1', kind: 'ticked_by_hand' })
  })

  it('refuses an unknown status with the accepted list', () => {
    const first = importNew(WITH_IDS)
    expect(() => setItemStatus(first.plan, { id: 'P1.2.1', status: 'invented' as never, now: NOW }))
      .toThrow(/pending, needs_brief, queued, in_work, reviewing, done, blocked_owner, skipped/)
  })
})

describe('attach', () => {
  const brief = (id: string) => JSON.stringify({ id, title: 'the edge port', goal: 'g', requirements: ['r'], checks: ['c'], report: ['r'] })

  it('stores a snapshot and queues the plan item', () => {
    const first = importNew(WITH_IDS)
    const attached = attachSpec(first.plan, { id: 'P1.2.1', text: brief('P1.2.1'), format: 'json', spec_path: 'docs/briefs/P1.2.1.json', now: NOW })
    expect(attached.item.status).toBe('queued')
    expect(attached.item.spec?.checks).toEqual(['c'])
    expect(attached.item.spec_path).toBe('docs/briefs/P1.2.1.json')
    expect(attached.item.spec_hash).toBe(hashDocument(brief('P1.2.1')))
  })

  it('refuses a brief whose id is not the item id', () => {
    const first = importNew(WITH_IDS)
    expect(() => attachSpec(first.plan, { id: 'P1.2.1', text: brief('P9.9.9'), format: 'json', spec_path: 'x.json', now: NOW }))
      .toThrow(/spec_id_mismatch/)
  })

  it('refuses an invalid brief instead of storing half of it', () => {
    const first = importNew(WITH_IDS)
    expect(() => attachSpec(first.plan, {
      id: 'P1.2.1',
      text: JSON.stringify({ id: 'P1.2.1', title: 't' }),
      format: 'json',
      spec_path: 'x.json',
      now: NOW,
    })).toThrow(/refused/)
  })

  it('refuses to swap the brief of a round in flight', () => {
    const first = importNew(WITH_IDS)
    const busy = { ...first.plan, items: first.plan.items.map(item => (item.id === 'P1.2.1' ? { ...item, status: 'in_work' as const } : item)) }
    expect(() => attachSpec(busy, { id: 'P1.2.1', text: brief('P1.2.1'), format: 'json', spec_path: 'x.json', now: NOW }))
      .toThrow(/the round in flight renders the brief it started with/)
  })
})

describe('the plan store', () => {
  function withRoot<T>(fn: (_rootDir: string) => T): T {
    const root = mkdtempSync(join(tmpdir(), 'reeves-plan-'))
    try {
      return fn(root)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }

  it('round-trips a plan through flows/<run-id>/plan.json with 0600 in a 0700 directory', () => {
    withRoot(root => {
      const first = importNew(WITH_IDS)
      const path = savePlan(first.plan, { root })
      expect(path).toBe(planPath('run-1', { root }))
      expect(statSync(path).mode & 0o777).toBe(0o600)
      expect(statSync(join(root, 'flows', 'run-1')).mode & 0o777).toBe(0o700)

      const read = readPlan('run-1', { root })
      expect(read.items.map(item => item.id)).toEqual(first.plan.items.map(item => item.id))
      expect(read.source_hash).toBe(first.plan.source_hash)
    })
  })

  it('reports a missing plan as not_found', () => {
    withRoot(root => {
      expect(() => readPlan('run-1', { root })).toThrow(/no plan for run run-1/)
      try { readPlan('run-1', { root }) } catch (err) { expect((err as PlanError).code).toBe('not_found') }
    })
  })

  it('refuses a plan written by another schema and a plan that is not JSON', () => {
    withRoot(root => {
      const path = planPath('run-1', { root })
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, '{"schema_version": 7, "items": []}')
      expect(() => readPlan('run-1', { root })).toThrow(/schema_version 7/)
      writeFileSync(path, '{oops')
      expect(() => readPlan('run-1', { root })).toThrow(/not valid JSON/)
    })
  })

  it('refuses a run id that is not a flow id', () => {
    withRoot(root => {
      expect(() => planPath('../escape', { root })).toThrow(/not a valid flow id/)
    })
  })
})
