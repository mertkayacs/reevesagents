// The plan as an object: parser, import rules and store (docs/plan-model-design.md, block 12).
//
// The two documents here are the *shapes* the design describes, not the projects they came from: one with
// explicit ids, one without and with folded lines. Tests are about the shapes.

import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  attachSpec, canSetStatus, canTransition, closeItemOnAccept, createPlan, deriveId, ensurePlanSummary,
  hashDocument,
  importInto, mutatePlan, normalizeDocument, parsePlanDocument, planComplete, HUMAN_TRANSITIONS, PLAN_LIMITS,
  planExists, planItemView, planPath, planProgress, PLAN_TRANSITIONS, PlanError, planSummary, readPlan,
  resolveRepositoryPath, savePlan, setItemStatus,
} from '../src/core/plan.js'
import { createFlowState } from '../src/core/flow.js'
import { readFlow, saveFlow } from '../src/core/flow-store.js'

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
  it('creates a ticked item done and an unticked one pending on the first import (block 78)', () => {
    // A first import has no history to defend: the document is the only evidence there is. Two lines are ticked in `WITH_IDS`,
    // and a project that already finished a milestone must not arrive looking untouched (the live 165-item plan with 91 ticks).
    const result = importNew(WITH_IDS)
    expect(result.added).toEqual(['P1.1.1', 'P1.1.2', 'P1.2.1', 'P2.1.1'])
    const byId = new Map(result.plan.items.map(item => [item.id, item]))
    expect(byId.get('P1.1.1')!.status).toBe('done')
    expect(byId.get('P1.1.1')!.closed_by).toBe('ticked_by_hand')
    expect(byId.get('P1.1.2')!.status).toBe('done')
    expect(byId.get('P1.2.1')!.status).toBe('pending')
    expect(byId.get('P1.2.1')!.closed_by).toBeNull()
    expect(byId.get('P2.1.1')!.status).toBe('pending')
    // No owner action: nothing waits for a human on an item the document closed.
    expect(byId.get('P1.1.1')!.owner_action).toBe(false)
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
    // It is still there, with the status it had — the first import closed it by the document's own tick.
    expect(gone.status).toBe('done')
    expect(gone.closed_by).toBe('ticked_by_hand')
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
    // Two items are ticked in the document, and the mirror has just been created: nothing disagrees yet, and the ticks are honoured.
    expect(first.conflicts).toEqual([])
    expect(first.plan.items.find(item => item.id === 'P1.1.1')!.status).toBe('done')
    expect(first.plan.items.find(item => item.id === 'P1.1.1')!.closed_by).toBe('ticked_by_hand')
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

describe('conflict accounting at the cap', () => {
  // 51 items, all closed by hand, then a document that unticks every one of them: the last conflict found
  // must be the one the import reports, even though the bounded list can only hold 50.
  function planWithManyClosedItems(): ReturnType<typeof importNew>['plan'] {
    const ids = Array.from({ length: PLAN_LIMITS.conflicts + 1 }, (_, index) => `P1.${index + 1}`)
    const text = ids.map(id => `- [x] **${id}** — item ${id}`).join('\n')
    const first = importNew(text)
    return {
      ...first.plan,
      items: first.plan.items.map(item => ({ ...item, status: 'done' as const, head: 'abc1234' })),
    }
  }

  it('records a new conflict even when the list is already full, and drops the oldest', () => {
    const plan = planWithManyClosedItems()
    const unticked = plan.items.map(item => `- [ ] **${item.id}** — ${item.title}`).join('\n')
    const result = importInto(plan, { run_id: 'run-1', source_path: 'docs/implementation-plan.md', text: unticked, now: NOW + 60_000 })

    // Every item is a new disagreement; the plan keeps the newest 50 and the result reports what it recorded.
    expect(result.conflicts).toHaveLength(PLAN_LIMITS.conflicts + 1)
    expect(result.plan.conflicts).toHaveLength(PLAN_LIMITS.conflicts)
    const youngest = result.plan.conflicts.at(-1)!
    expect(youngest.item_id).toBe(`P1.${PLAN_LIMITS.conflicts + 1}`)
    // The oldest was dropped, the record is still capped.
    expect(result.plan.conflicts.some(entry => entry.item_id === 'P1.1')).toBe(false)
  })

  it('reports nothing new when the same disagreement is re-imported', () => {
    const plan = planWithManyClosedItems()
    const unticked = plan.items.map(item => `- [ ] **${item.id}** — ${item.title}`).join('\n')
    const first = importInto(plan, { run_id: 'run-1', source_path: 'p.md', text: unticked, now: NOW })
    const second = importInto(first.plan, { run_id: 'run-1', source_path: 'p.md', text: `${unticked}\n`, now: NOW + 1000 })
    expect(second.conflicts).toEqual([])
  })
})

describe('mutatePlan', () => {
  function withRoot<T>(fn: (_rootDir: string) => T): T {
    const root = mkdtempSync(join(tmpdir(), 'reeves-plan-mutate-'))
    try {
      return fn(root)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }

  it('writes the plan and the flow summary inside one lock, and returns the mutator value', () => {
    withRoot(root => {
      process.env.REEVES_REGISTRY = root
      try {
        saveFlow(createFlowState({
          run_id: 'run-1', repo: root, roles: { dev: 'd', review: 'r' }, head: 'a'.repeat(40), max_rounds: 3,
          review_timeout_sec: 60, at: '2026-11-02T09:00:00.000Z',
        }), { root })
        const value = mutatePlan('run-1', current => {
          const result = createPlan({ run_id: 'run-1', source_path: 'p.md', text: WITH_IDS, now: NOW })
          return { plan: current ? null : result.plan, value: 'created' }
        }, { root })

        expect(value).toBe('created')
        expect(readPlan('run-1', { root }).items).toHaveLength(4)
        const state = JSON.parse(readFileSync(join(root, 'flows', 'run-1.json'), 'utf-8')) as { plan?: { total: number } }
        expect(state.plan?.total).toBe(4)
        // The lock is released: a second mutation runs immediately instead of waiting for the 5 s timeout.
        expect(mutatePlan('run-1', current => ({ plan: null, value: current?.items.length ?? 0 }), { root })).toBe(4)
      } finally {
        delete process.env.REEVES_REGISTRY
      }
    })
  })

  it('writes nothing when the mutator returns no plan', () => {
    withRoot(root => {
      const before = Date.now()
      mutatePlan('run-1', () => ({ plan: null, value: null }), { root })
      expect(Date.now() - before).toBeLessThan(1000)
      expect(() => readPlan('run-1', { root })).toThrow(/no plan/)
    })
  })
})

describe('markdown briefs', () => {
  it('takes the item id, because a heading slug can never equal P1.7.1', () => {
    const first = importNew(['- [ ] **P1.7.1** — the edge port'].join('\n'))
    const attached = attachSpec(first.plan, {
      id: 'P1.7.1',
      text: '# The edge port\n\nPublish it on 7810.\n',
      format: 'markdown',
      spec_path: 'docs/briefs/P1.7.1.md',
      now: NOW,
    })
    expect(attached.spec.id).toBe('P1.7.1')
    expect(attached.spec.unstructured).toBe(true)
    expect(attached.item.status).toBe('queued')
  })
})

describe('the item view', () => {
  it('carries the shape of the brief, never its body, requirements or checks', () => {
    const first = importNew(WITH_IDS)
    const attached = attachSpec(first.plan, {
      id: 'P1.2.1',
      text: JSON.stringify({
        id: 'P1.2.1', title: 'the edge port', goal: 'g', requirements: ['only one port'], checks: ['curl /health'], report: ['port'],
      }),
      format: 'json',
      spec_path: 'docs/briefs/P1.2.1.json',
      now: NOW,
    })
    const view = planItemView(attached.item)
    expect(view.spec).toEqual({ id: 'P1.2.1', title: 'the edge port', unstructured: false })
    expect(JSON.stringify(view)).not.toContain('only one port')
    expect(JSON.stringify(view)).not.toContain('curl /health')
    expect(view.spec_path).toBe('docs/briefs/P1.2.1.json')
  })
})

describe('path containment on real paths', () => {
  function withRoot<T>(fn: (_rootDir: string) => T): T {
    const root = mkdtempSync(join(tmpdir(), 'reeves-plan-paths-'))
    try {
      return fn(root)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }

  it('accepts a file inside the project and returns its resolved path', () => {
    withRoot(root => {
      mkdirSync(join(root, 'docs'), { recursive: true })
      writeFileSync(join(root, 'docs', 'plan.md'), WITH_IDS)
      const resolved = resolveRepositoryPath('docs/plan.md', root)
      expect(resolved.relative).toBe('docs/plan.md')
      expect(resolved.absolute).toBe(join(realpathSync(root), 'docs', 'plan.md'))
    })
  })

  it('refuses a file inside the project that is a symlink to a file outside it', () => {
    withRoot(root => {
      const outside = mkdtempSync(join(tmpdir(), 'reeves-plan-outside-'))
      try {
        writeFileSync(join(outside, 'secret-plan.md'), WITH_IDS)
        mkdirSync(join(root, 'docs'), { recursive: true })
        symlinkSync(join(outside, 'secret-plan.md'), join(root, 'docs', 'plan.md'))
        // Lexically inside, really outside: the reader would happily read the outside file.
        expect(() => resolveRepositoryPath('docs/plan.md', root)).toThrow(/outside the repository/)
      } finally {
        rmSync(outside, { recursive: true, force: true })
      }
    })
  })

  it('refuses a missing file and a path outside the project', () => {
    withRoot(root => {
      expect(() => resolveRepositoryPath('docs/nope.md', root)).toThrow(/does not exist/)
      expect(() => resolveRepositoryPath('/etc/hosts', root)).toThrow(/outside the repository/)
    })
  })
})

describe('a torn summary', () => {
  function withRoot<T>(fn: (_rootDir: string) => T): T {
    const root = mkdtempSync(join(tmpdir(), 'reeves-plan-repair-'))
    try {
      return fn(root)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }

  it('is repaired by the next no-op mutation and by a read path', () => {
    withRoot(root => {
      process.env.REEVES_REGISTRY = root
      try {
        saveFlow(createFlowState({
          run_id: 'run-1', repo: root, roles: { dev: 'd', review: 'r' }, head: 'a'.repeat(40), max_rounds: 3,
          review_timeout_sec: 60, at: '2026-11-02T09:00:00.000Z',
        }), { root })
        // A crash between the two writes: the plan exists, the summary never landed.
        const created = createPlan({ run_id: 'run-1', source_path: 'p.md', text: WITH_IDS, now: NOW })
        mutatePlan('run-1', current => ({ plan: current ? null : created.plan, value: null }), { root })
        const stale = JSON.parse(readFileSync(join(root, 'flows', 'run-1.json'), 'utf-8')) as { plan: unknown }
        saveFlow({ ...readFlow('run-1', { root }), plan: null }, { root })
        void stale

        // A no-op mutation repairs it.
        mutatePlan('run-1', () => ({ plan: null, value: null }), { root })
        const repaired = JSON.parse(readFileSync(join(root, 'flows', 'run-1.json'), 'utf-8')) as { plan?: { total: number } }
        expect(repaired.plan?.total).toBe(4)

        // And a torn summary is repaired by the read path too.
        saveFlow({ ...readFlow('run-1', { root }), plan: null }, { root })
        ensurePlanSummary('run-1', { root })
        const again = JSON.parse(readFileSync(join(root, 'flows', 'run-1.json'), 'utf-8')) as { plan?: { total: number } }
        expect(again.plan?.total).toBe(4)
      } finally {
        delete process.env.REEVES_REGISTRY
      }
    })
  })
})

describe('the status transition table', () => {
  function planWith(status: 'pending' | 'queued' | 'in_work' | 'reviewing' | 'blocked_owner' | 'done' | 'skipped') {
    const first = importNew('- [ ] **P1** — the edge port')
    return {
      ...first.plan,
      items: first.plan.items.map(item => ({
        ...item,
        status,
        head: status === 'done' ? 'abc1234' : null,
      })),
    }
  }

  it('refuses to close an item whose round is in flight', () => {
    for (const busy of ['in_work', 'reviewing'] as const) {
      const plan = planWith(busy)
      expect(() => setItemStatus(plan, { id: 'P1', status: 'skipped', yes: true, now: NOW }))
        .toThrow(/a round is in flight/)
      expect(() => setItemStatus(plan, { id: 'P1', status: 'done', yes: true, note: 'x', now: NOW }))
        .toThrow(/cannot move P1/)
    }
  })

  it('never reopens a terminal item', () => {
    for (const terminal of ['done', 'skipped'] as const) {
      const plan = planWith(terminal)
      for (const target of ['pending', 'queued', 'in_work', 'blocked_owner'] as const) {
        expect(() => setItemStatus(plan, { id: 'P1', status: target, yes: true, note: 'x', now: NOW }))
          .toThrow(/is terminal: an item closed on evidence does not reopen/)
      }
    }
  })

  it('allows the moves the plan needs: triage, unblocking, the engine path and a manual close', () => {
    expect(canTransition('pending', 'queued')).toBe(true)
    expect(canTransition('needs_brief', 'queued')).toBe(true)
    expect(canTransition('blocked_owner', 'queued')).toBe(true)
    expect(canTransition('queued', 'in_work')).toBe(true)
    expect(canTransition('in_work', 'reviewing')).toBe(true)
    expect(canTransition('reviewing', 'done')).toBe(true)
    expect(canTransition('pending', 'done')).toBe(true)
    // Every status is reachable from somewhere, and nothing leads out of the two terminal ones.
    for (const status of ['done', 'skipped'] as const) expect(PLAN_TRANSITIONS[status]).toEqual([])
  })

  it('does not let a human claim or release a round in flight', () => {
    // `queued -> in_work` would make an item look active while nothing was sent; `in_work -> queued` would
    // free an item whose round is still running, and the next `plan next` would dispatch on top of it.
    expect(canTransition('queued', 'in_work')).toBe(true)      // the engine claims a dispatch
    expect(canSetStatus('queued', 'in_work')).toBe(false)      // a human may not
    expect(canTransition('in_work', 'queued')).toBe(true)      // the engine re-queues after a refusal
    expect(canSetStatus('in_work', 'queued')).toBe(false)

    const queued = planWith('queued')
    expect(() => setItemStatus(queued, { id: 'P1', status: 'in_work', now: NOW }))
      .toThrow(/the engine owns queued|may only become/)
    const busy = planWith('in_work')
    expect(() => setItemStatus(busy, { id: 'P1', status: 'queued', now: NOW }))
      .toThrow(/the engine owns in_work while a round is in flight/)
    const reviewing = planWith('reviewing')
    expect(() => setItemStatus(reviewing, { id: 'P1', status: 'done', yes: true, note: 'x', now: NOW }))
      .toThrow(/the engine owns reviewing while a round is in flight/)

    // Everything a human is actually for still works.
    expect(canSetStatus('pending', 'queued')).toBe(true)
    expect(canSetStatus('blocked_owner', 'queued')).toBe(true)
    expect(canSetStatus('queued', 'done')).toBe(true)
    expect(canSetStatus('queued', 'skipped')).toBe(true)
    // And the busy statuses have no human edges at all.
    expect(HUMAN_TRANSITIONS.in_work).toEqual([])
    expect(HUMAN_TRANSITIONS.reviewing).toEqual([])
  })

  it('closes an item on an accepted verdict through the engine path', () => {
    const plan = planWith('reviewing')
    const closed = closeItemOnAccept(plan, { id: 'P1', head: 'def5678', rounds: 2, notes_ref: 'def5678-r2', now: NOW })
    expect(closed.items[0]!.status).toBe('done')
    expect(closed.items[0]!.head).toBe('def5678')
    expect(closed.items[0]!.rounds).toBe(2)
    expect(closed.items[0]!.notes_ref).toBe('def5678-r2')
  })
})

// The design's two tables are the readable form of `PLAN_TRANSITIONS`/`HUMAN_TRANSITIONS`; a doc that drifts
// from the code is worse than no doc, and it already drifted once (the status table used to carry its own
// "leaves to" column that disagreed with the human table). This test reads the markdown and compares.
describe('the design document matches the tables in the code', () => {
  // `join(__dirname, …)` instead of `new URL(…, import.meta.url)`: the lint config has no `URL` global, and a
  // doc test is not worth a config change.
  const doc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'plan-model-design.md'), 'utf-8')

  function table(after: string): Record<string, string[]> {
    const block = doc.split(after)[1]!.split('\n\n')[0]!
    const result: Record<string, string[]> = {}
    for (const line of block.split('\n')) {
      const match = /^\| `([a-z_]+)`(?:, `([a-z_]+)`)? \| (.*) \|$/.exec(line)
      if (!match) continue
      const cell = match[3]!.trim()
      const targets = cell.startsWith('—') ? [] : (cell.match(/`[a-z_]+`/g) ?? []).map(token => token.slice(1, -1)).sort()
      result[match[1]!] = targets
      if (match[2]) result[match[2]] = targets
    }
    return result
  }

  it('documents exactly the engine transitions', () => {
    const documented = table('| from | may become |')
    const code = Object.fromEntries(Object.entries(PLAN_TRANSITIONS).map(([from, to]) => [from, [...to].sort()]))
    expect(documented).toEqual(code)
  })

  it('documents exactly the human transitions', () => {
    const documented = table('| from | a human may set |')
    const code = Object.fromEntries(Object.entries(HUMAN_TRANSITIONS).map(([from, to]) => [from, [...to].sort()]))
    expect(documented).toEqual(code)
  })

  it('keeps the status table free of a second, competing transition column', () => {
    const statuses = doc.split('### 2.2 Statuses')[1]!.split('### ')[0]!
    expect(statuses).not.toContain('leaves to |')
    expect(statuses).toContain('| status | meaning | who sets it |')
  })
})

describe('planExists', () => {
  function withRoot<T>(fn: (_rootDir: string) => T): T {
    const root = mkdtempSync(join(tmpdir(), 'reeves-plan-exists-'))
    try {
      return fn(root)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }

  it('reports a missing plan as absent', () => {
    withRoot(root => {
      expect(planExists('run-1', { root })).toBe(false)
    })
  })

  it('reports a saved plan as present', () => {
    withRoot(root => {
      savePlan(importNew(WITH_IDS).plan, { root })
      expect(planExists('run-1', { root })).toBe(true)
    })
  })

  // A permission bit on the directory makes `stat` fail with EACCES, which must not be read as "no plan": the
  // flow would then take the legacy path with items still open. Root ignores the bits, so the case is skipped
  // there rather than asserting a lie.
  it.skipIf(process.getuid?.() === 0)('throws instead of answering "absent" when the plan cannot be checked', () => {
    withRoot(root => {
      savePlan(importNew(WITH_IDS).plan, { root })
      const dir = dirname(planPath('run-1', { root }))
      chmodSync(dir, 0o000)
      try {
        expect(() => planExists('run-1', { root })).toThrow(/cannot be checked/)
      } finally {
        chmodSync(dir, 0o700)
      }
      expect(planExists('run-1', { root })).toBe(true)
    })
  })
})

describe('a paused flow hands a busy row to the human (block 56)', () => {
  function busyPlan() {
    const imported = importNew('- [ ] **P1.1** — the only item')
    return { plan: imported.plan, id: imported.plan.items[0]!.id }
  }

  it('lets a paused flow close an item the engine was holding with no live round', () => {
    // The refusal used to say "pause or stop the flow to intervene" and the pause changed nothing: the operator was stuck with a round the
    // engine had lost (block 56).
    const { plan, id } = busyPlan()
    const inWork = { ...plan, items: plan.items.map(item => ({ ...item, status: 'in_work' as const })) }

    const moved = setItemStatus(inWork, {
      id, status: 'done', yes: true, note: 'the round was lost: the commit was never reviewed', now: NOW, at: AT,
      intervention: { paused: true, round_live: false },
    })

    expect(moved.plan.items[0]!.status).toBe('done')
    // A manual close without an accepted commit leaves a conflict behind, so the plan says why it was closed.
    expect(moved.plan.conflicts.at(-1)).toMatchObject({ item_id: id, kind: 'ticked_by_hand' })
  })

  it('still refuses while a round is live, even when paused', () => {
    const { plan, id } = busyPlan()
    const reviewing = { ...plan, items: plan.items.map(item => ({ ...item, status: 'reviewing' as const })) }

    expect(() => setItemStatus(reviewing, {
      id, status: 'done', yes: true, note: 'x', now: NOW, at: AT,
      intervention: { paused: true, round_live: true },
    })).toThrow(/the engine owns reviewing while a round is in flight/)
  })

  it('treats a stopped flow as the operator\'s too, because nothing will ever run the round', () => {
    // `flow stop` closes the flow as `done`: GUIDE promises the pause *and* the stop, and a closed flow has no ticker to finish a round.
    const { plan, id } = busyPlan()
    const reviewing = { ...plan, items: plan.items.map(item => ({ ...item, status: 'reviewing' as const })) }

    const moved = setItemStatus(reviewing, {
      id, status: 'skipped', yes: true, note: 'the flow was stopped before the review', now: NOW, at: AT,
      intervention: { paused: true, round_live: false },
    })
    expect(moved.plan.items[0]!.status).toBe('skipped')
  })

  it('still refuses while the flow is running', () => {
    const { plan, id } = busyPlan()
    const inWork = { ...plan, items: plan.items.map(item => ({ ...item, status: 'in_work' as const })) }

    expect(() => setItemStatus(inWork, {
      id, status: 'done', yes: true, note: 'x', now: NOW, at: AT,
      intervention: { paused: false, round_live: false },
    })).toThrow(/the engine owns in_work/)
  })
})

// Block 78, the live `salon-dashboard` plan of 03.11: 165 items, 91 of them already ticked, imported as 165 pending — a project
// with a finished milestone looked untouched, and every one of the 165 asked for a brief.
describe('the first import honours the document (block 78)', () => {
  // Three ticked, two open, one id-less row that must stay out of it.
  const MOSTLY_DONE = [
    '# Plan',
    '',
    '- [x] **A1** — first',
    '- [x] **A2** — second',
    '- [x] **A3** — third',
    '- [ ] **B1** — fourth',
    '- [ ] **B2** — fifth',
    '',
  ].join('\n')

  it('closes the ticked items and leaves the open ones pending', () => {
    const result = importNew(MOSTLY_DONE)
    const byId = new Map(result.plan.items.map(item => [item.id, item]))

    expect([...byId.values()].filter(item => item.status === 'done').map(item => item.id)).toEqual(['A1', 'A2', 'A3'])
    expect([...byId.values()].filter(item => item.status === 'pending').map(item => item.id)).toEqual(['B1', 'B2'])
    // The provenance is on the record: a close by the document is not an ACCEPT.
    for (const id of ['A1', 'A2', 'A3']) expect(byId.get(id)!.closed_by).toBe('ticked_by_hand')
    for (const id of ['B1', 'B2']) expect(byId.get(id)!.closed_by).toBeNull()
    // Nothing waits for a human, and nothing claims a commit.
    expect([...byId.values()].every(item => item.owner_action === false) || byId.get('B1')!.owner_action === false).toBe(true)
    expect([...byId.values()].every(item => item.head === null)).toBe(true)
    expect(result.conflicts).toEqual([])
  })

  it('does not close anything on the second import, and reports no false conflict', () => {
    const first = importNew(MOSTLY_DONE)
    const second = importInto(first.plan, {
      run_id: 'run-1', source_path: 'docs/implementation-plan.md', text: MOSTLY_DONE, now: NOW + 60_000, at: AT,
    })

    expect(second.unchanged).toBe(true)
    expect(second.added).toEqual([])
    expect(second.conflicts).toEqual([])
    expect(second.plan.items.filter(item => item.status === 'done')).toHaveLength(3)
  })

  it('keeps an unticked conflict for an item an ACCEPT closed', () => {
    // The rule after the first import is unchanged: the mirror's `done` is evidence, and the document may not take it back.
    // The item is closed by an ACCEPT here — not by the document's tick — so the conflict names the review that actually ran.
    const first = importNew(MOSTLY_DONE.replace('- [x] **A1**', '- [ ] **A1**'))
    expect(first.plan.items.find(item => item.id === 'A1')!.status).toBe('pending')
    const closed = closeItemOnAccept(first.plan, {
      id: 'A1', head: 'abc1234', rounds: 1, notes_ref: null, now: NOW + 30_000, at: AT,
    })
    // A re-import only runs when the document changed, so the unticked line arrives with a new row beside it.
    const second = importInto(closed, {
      run_id: 'run-1', source_path: 'docs/implementation-plan.md',
      text: `${MOSTLY_DONE.replace('- [x] **A1**', '- [ ] **A1**')}\n- [ ] **C1** — sixth\n`, now: NOW + 60_000, at: AT,
    })

    const item = second.plan.items.find(entry => entry.id === 'A1')!
    expect(item.status).toBe('done')
    expect(item.closed_by).toBe('accept')
    const conflict = second.conflicts.find(entry => entry.kind === 'unticked' && entry.item_id === 'A1')
    expect(conflict?.detail).toContain('closed it on an ACCEPT')
  })

  it('names the document, not an ACCEPT, when the document closed the item', () => {
    // The other origin, from the same rule: A1 arrived ticked, so its close is the document's, and the detail says so instead
    // of crediting a review nobody ran.
    const first = importNew(MOSTLY_DONE)
    const unticked = `${MOSTLY_DONE.replace('- [x] **A1**', '- [ ] **A1**')}\n- [ ] **C1** — sixth\n`
    const second = importInto(first.plan, {
      run_id: 'run-1', source_path: 'docs/implementation-plan.md', text: unticked, now: NOW + 60_000, at: AT,
    })

    const conflict = second.conflicts.find(entry => entry.kind === 'unticked' && entry.item_id === 'A1')
    expect(conflict?.detail).toContain("from the document's own tick at the first import")
    expect(conflict?.detail).not.toContain('ACCEPT')
  })

  it('reports a hand tick after the first import as a conflict, not a close', () => {
    const first = importNew(MOSTLY_DONE)
    const ticked = MOSTLY_DONE.replace('- [ ] **B1**', '- [x] **B1**')
    const second = importInto(first.plan, {
      run_id: 'run-1', source_path: 'docs/implementation-plan.md', text: ticked, now: NOW + 60_000, at: AT,
    })

    expect(second.plan.items.find(item => item.id === 'B1')!.status).toBe('pending')
    expect(second.conflicts.map(conflict => `${conflict.kind}:${conflict.item_id}`)).toContain('ticked_by_hand:B1')
  })

  it('refuses a broken document exactly as it did before', () => {
    // A document that is not a list of items is refused whole: no mirror is written from a guess.
    expect(() => importNew('# Plan\n\nnothing here is a checklist\n')).toThrow(/no plan items|not a plan/i)
  })
})
