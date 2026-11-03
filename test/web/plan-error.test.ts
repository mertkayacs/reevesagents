// @vitest-environment happy-dom
//
// The line under the plan dialog's actions, driven in a real DOM with fake timers.
//
// Three things went wrong for the owner on the live build, and each one is a test here: the refusal showed the code (`not_pausable`)
// instead of words; the line never went away; and it followed the operator into another run's plan. The module is small on purpose —
// `app.js` cannot be mounted, so the behaviour that broke is the behaviour that gets driven.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LANGUAGE_OPTIONS } from '../../src/i18n/languages.js'
import { translate } from '../../src/i18n/catalog.js'

declare const document: any

interface Line {
  show: (_code: string, _runId?: string | null) => void
  clear: () => void
  bind: (_openRunId: string | null) => void
  code: string | null
  runId: string | null
  visible: boolean
}

function loadFactory(): (_doc: any, _options: any) => Line {
  const source = readFileSync(join(process.cwd(), 'src/surfaces/webui/client/plan-error.js'), 'utf8')
  const sandbox: { planErrorLine?: { createPlanErrorLine: (_doc: any, _options: any) => Line } } = {}
  const window = { setTimeout: (..._args: any[]) => 0, clearTimeout: () => {} }
  new Function('window', `${source}; return window.planErrorLine`)(window)
  const api = (window as any).planErrorLine ?? sandbox.planErrorLine
  if (!api) throw new Error('plan-error did not publish itself')
  return api.createPlanErrorLine
}

let line: Line
let translations: Record<string, string>

beforeEach(() => {
  vi.useFakeTimers()
  document.body.innerHTML = '<div id="plan-error" class="dialog-error" hidden></div>'
  // The real catalogue, so the assertion is about the text the operator sees and not a stub.
  translations = new Proxy({} as Record<string, string>, {
    get: (_target, key: string) => translate('en', key as never),
  })
  line = loadFactory()(document, {
    t: (key: string) => translations[key] ?? key,
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms) as unknown as number,
    clearTimeout: (id: number) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>),
  })
})

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

const node = () => document.getElementById('plan-error')

describe('the plan dialog says what happened, in words (block 59)', () => {
  it('renders the translation for a code, never the code itself', () => {
    line.show('not_pausable', 'run-a')
    expect(node().hidden).toBe(false)
    expect(node().textContent).toBe(translations['web.planErrNotPausable'])
    // The code is still there for diagnosis — just not in the visible text.
    expect(node().dataset.code).toBe('not_pausable')
    expect(node().title).toBe('not_pausable')
    expect(node().textContent).not.toContain('not_pausable')
  })

  it('has words for every code the routes answer', () => {
    for (const [code, key] of [
      ['not_pausable', 'web.planErrNotPausable'],
      ['already_paused', 'web.planErrAlreadyPaused'],
      ['not_paused', 'web.planErrNotPaused'],
      ['not_found', 'web.planErrNotFound'],
    ] as const) {
      line.show(code, 'run-a')
      expect(node().textContent).toBe(translations[key])
      // The visible text never carries the identifier itself, underscores and all.
      expect(node().textContent).not.toContain(code)
    }
  })

  it('falls back to a generic sentence for a code it does not know', () => {
    line.show('kaboom', 'run-a')
    expect(node().textContent).toBe(translations['web.planErrGeneric'])
    expect(node().dataset.code).toBe('kaboom')
    expect(node().textContent).not.toContain('kaboom')
  })

  it('disappears on its own after the timeout', () => {
    line.show('not_pausable', 'run-a')
    expect(line.visible).toBe(true)
    vi.advanceTimersByTime(5_900)
    expect(line.visible).toBe(true)
    vi.advanceTimersByTime(200)
    expect(line.visible).toBe(false)
    expect(node().textContent).toBe('')
    expect(node().dataset.code).toBeUndefined()
    expect(node().hidden).toBe(true)
  })

  it('clears when the operator opens another run, and shows nothing of the old one', () => {
    line.show('not_pausable', 'run-a')
    line.bind('run-b')
    expect(line.visible).toBe(false)
    expect(node().textContent).toBe('')
    // The same run keeps its line: `bind` is about a *different* plan opening.
    line.show('already_paused', 'run-b')
    line.bind('run-b')
    expect(line.visible).toBe(true)
  })

  it('refuses to show a line raised for a run that is no longer open', () => {
    // The client drops the answer itself (`insights.runId !== runId`); this is the second line of defence, at the element.
    line.show('not_pausable', 'run-a')
    line.bind('run-b')
    line.show('not_pausable', 'run-a')
    expect(line.runId).toBe('run-a')
    line.bind('run-b')
    expect(line.visible).toBe(false)
  })

  it('replaces one line with the next instead of stacking timers', () => {
    line.show('not_pausable', 'run-a')
    vi.advanceTimersByTime(3_000)
    line.show('already_paused', 'run-a')
    // The first timer must not fire and clear the second line early.
    vi.advanceTimersByTime(3_500)
    expect(line.visible).toBe(true)
    expect(node().textContent).toBe(translations['web.planErrAlreadyPaused'])
    vi.advanceTimersByTime(2_600)
    expect(line.visible).toBe(false)
  })
})

describe('every locale can say it (block 59)', () => {
  it('has the five pause keys in all ten catalogues, none of them empty or a bare code', () => {
    const keys = ['web.planErrNotPausable', 'web.planErrAlreadyPaused', 'web.planErrNotPaused', 'web.planErrNotFound', 'web.planErrGeneric'] as const
    expect(LANGUAGE_OPTIONS).toHaveLength(10)
    for (const { code: locale } of LANGUAGE_OPTIONS) {
      for (const key of keys) {
        const text = translate(locale, key)
        expect(text, `${locale} ${key}`).toBeTruthy()
        expect(String(text).trim().length, `${locale} ${key}`).toBeGreaterThan(3)
        // No locale may fall back to showing the service code.
        expect(String(text), `${locale} ${key}`).not.toMatch(/not_pausable|already_paused|not_paused|not_found/)
      }
    }
  })
})
