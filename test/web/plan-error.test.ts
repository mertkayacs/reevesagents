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
import { en } from '../../src/i18n/locales/en.js'
import { de } from '../../src/i18n/locales/de.js'
import { fr } from '../../src/i18n/locales/fr.js'
import { es } from '../../src/i18n/locales/es.js'
import { pt } from '../../src/i18n/locales/pt.js'
import { it as itLocale } from '../../src/i18n/locales/it.js'
import { tr } from '../../src/i18n/locales/tr.js'
import { ru } from '../../src/i18n/locales/ru.js'
import { zhHans } from '../../src/i18n/locales/zh-Hans.js'
import { ar } from '../../src/i18n/locales/ar.js'

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
    // The code is still there for diagnosis, in metadata that is not rendered — and not in the tooltip: a `title` shows on hover, and
    // `not_pausable` on hover is exactly what the operator reported (block 60).
    expect(node().dataset.code).toBe('not_pausable')
    expect(node().hasAttribute('title')).toBe(false)
    expect(node().textContent).not.toContain('not_pausable')
    // Nor anywhere else a person can read it off the screen.
    for (const attribute of ['title', 'aria-label', 'aria-description', 'alt']) {
      expect(node().getAttribute(attribute) ?? '', attribute).not.toContain('not_pausable')
    }
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
      expect(node().getAttribute('title') ?? '').not.toContain(code)
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

describe('every locale can say it (blocks 59, 60)', () => {
  // The catalogues themselves, not `translate()`: `translate` falls back to English for a missing key, so a test that goes through it stays
  // green while nine languages have no words at all. Each file exports `{ keys, phrases }`; only `keys` matters here.
  const CATALOGUES: Record<string, { keys: Record<string, string> }> = { de, fr, es, pt, it: itLocale, tr, ru, 'zh-Hans': zhHans, ar }
  const KEYS = ['web.planErrNotPausable', 'web.planErrAlreadyPaused', 'web.planErrNotPaused', 'web.planErrNotFound', 'web.planErrGeneric']

  function defined(locale: string, catalogue: { keys: Record<string, string> }, key: string): string | undefined {
    if (locale === 'en') return undefined
    return catalogue.keys[key]
  }

  it('has the five pause keys defined in all ten catalogues, none empty and none a bare code', () => {
    expect(LANGUAGE_OPTIONS).toHaveLength(10)
    const missing: string[] = []
    for (const { code: locale } of LANGUAGE_OPTIONS) {
      for (const key of KEYS) {
        // English is the source: a key missing there has no fallback at all.
            const text = locale === 'en' ? (en as unknown as Record<string, string>)[key] : defined(locale, CATALOGUES[locale]!, key)
        if (!text) { missing.push(`${locale}:${key}`); continue }
        expect(String(text).trim().length, `${locale} ${key}`).toBeGreaterThan(3)
        expect(String(text), `${locale} ${key}`).not.toMatch(/not_pausable|already_paused|not_paused|not_found/)
      }
    }
    expect(missing).toEqual([])
  })

  it('would notice a catalogue that lost a key', () => {
    // The check above, run against a copy with one key removed: it must name exactly that pair. This is what `translate()` could not do.
    const broken = { ru: { keys: { ...ru.keys, 'web.planErrNotFound': undefined as unknown as string } } }
    const missing: string[] = []
    for (const key of KEYS) {
      if (!defined('ru', broken.ru, key)) missing.push(`ru:${key}`)
    }
    expect(missing).toEqual(['ru:web.planErrNotFound'])
  })
})
