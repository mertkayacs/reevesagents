import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LANGUAGE_OPTIONS } from '../src/i18n/languages.js'
import { translate, translatePhrase, type TranslationKey } from '../src/i18n/catalog.js'
import { en } from '../src/i18n/locales/en.js'
import { de } from '../src/i18n/locales/de.js'
import { fr } from '../src/i18n/locales/fr.js'
import { es } from '../src/i18n/locales/es.js'
import { pt } from '../src/i18n/locales/pt.js'
// Aliased: the Italian locale module is named `it`, which is also the vitest case function.
import { it as itLocale } from '../src/i18n/locales/it.js'
import { tr } from '../src/i18n/locales/tr.js'
import { ru } from '../src/i18n/locales/ru.js'
import { zhHans } from '../src/i18n/locales/zh-Hans.js'
import { ar } from '../src/i18n/locales/ar.js'

// Every non-English locale, keyed by language code. Imported directly (not through the catalog) so
// a missing translation cannot hide behind the English fallback.
const LOCALE_KEYS: Record<string, Record<string, string>> = {
  de: de.keys, fr: fr.keys, es: es.keys, pt: pt.keys, it: itLocale.keys,
  tr: tr.keys, ru: ru.keys, 'zh-Hans': zhHans.keys, ar: ar.keys,
}

describe('i18n language catalog', () => {
  it('includes the requested languages in first-run order', () => {
    expect(LANGUAGE_OPTIONS.map(option => option.code)).toEqual([
      'en',
      'de',
      'fr',
      'es',
      'pt',
      'it',
      'tr',
      'ru',
      'zh-Hans',
      'ar',
    ])
  })

  it('has compact translated labels for the main switchers', () => {
    for (const option of LANGUAGE_OPTIONS) {
      expect(option.flag.length).toBeGreaterThan(0)
      expect(translate(option.code, 'language.title')).not.toBe('language.title')
      expect(translate(option.code, 'welcome.newRun')).not.toBe('welcome.newRun')
      expect(translate(option.code, 'web.newRun')).not.toBe('web.newRun')
    }
  })

  it('translates shared TUI phrases without changing unknown runtime text', () => {
    expect(translatePhrase('tr', 'New Run')).toBe('Yeni run')
    expect(translatePhrase('tr', 'Cancel')).toBe('İptal')
    expect(translatePhrase('tr', 'Switch to tmux tabs')).toBe('tmux sekmelerine geç')
    expect(translatePhrase('de', 'Stop Run')).toBe('Run stoppen')
    expect(translatePhrase('de', 'Back')).toBe('Zurück')
    expect(translatePhrase('ar', 'Actions')).toBe('إجراءات')
    expect(translatePhrase('fr', 'custom-run-name')).toBe('custom-run-name')
  })

  it('translates new web lifecycle labels', () => {
    expect(translate('tr', 'web.statusEnded')).toBe('bitti')
    expect(translate('de', 'web.useProvider', { name: 'Codex' })).toBe('Codex verwenden')
    expect(translate('zh-Hans', 'history.movedToast', { name: 'Run A' })).toBe('Run A 已移到历史')
  })

  it('defines every Web client label key in the English source', () => {
    const clientSource = readFileSync(join(process.cwd(), 'src/surfaces/webui/client/app.js'), 'utf8')
    const keys = [...new Set(
      [...clientSource.matchAll(/'((?:web|common)\.[^']+)'\s*:/g)].map(match => match[1]!),
    )]
    // Every key the web client references must resolve through the catalog, not echo back.
    for (const key of keys) {
      expect(translate('en', key as TranslationKey)).not.toBe(key)
    }
    expect(translate('tr', 'web.noLiveTmuxTarget')).toBe('run tmux oturumu kullanılamıyor')
    expect(translate('de', 'web.openAgent')).toBe('Öffnen')
  })
})

// The Insights dialog keys (Plan + Logs tabs): a locale that only has the English source would silently show
// English inside a translated UI, so the parity check covers them the same way it covers `flow.*`.
const INSIGHTS_KEYS = [
  'web.logs', 'web.insightsTitle', 'web.insightsSubtitle', 'web.tabPlan', 'web.tabLogs', 'web.logsAllRuns',
  'web.planFilterAll', 'web.planFilterOpen', 'web.planFilterWaiting', 'web.planWaitingTitle', 'web.planNeedsBrief',
  'web.planBlockedOwner', 'web.planEmptyTitle', 'web.planEmptyBody', 'web.logsEmptyTitle', 'web.logsEmptyBody',
  'web.logsMarkRead', 'web.logsMarkedRead', 'web.logsRun', 'web.logsUnreadOnly', 'web.planStatus', 'web.planCommit',
  'web.planRounds', 'web.planNotes', 'web.planBrief', 'web.planStatus_pending', 'web.planStatus_needs_brief',
  'web.planStatus_queued', 'web.planStatus_in_work', 'web.planStatus_reviewing', 'web.planStatus_done',
  'web.planStatus_blocked_owner', 'web.planStatus_skipped', 'web.planStatus_missing', 'web.planMissingSince',
  'web.ticksNow', 'web.ticksNext', 'web.ticksNone', 'web.ticksWaiting',
]

describe('insights dialog key parity', () => {
  // A locale may spell a word exactly as English does ("Plan", "Run", "Status"); listed per key so the rule stays
  // strict everywhere else. German/French/Italian/Portuguese/Spanish happen to share these three.
  const SAME_AS_ENGLISH = new Set<string>([
    'de.web.tabPlan', 'es.web.tabPlan', 'fr.web.tabPlan', 'it.web.tabPlan', 'pt.web.tabPlan',
    'de.web.logsRun', 'es.web.logsRun', 'fr.web.logsRun', 'it.web.logsRun', 'pt.web.logsRun',
    'de.web.planStatus_reviewing', 'es.web.planStatus_reviewing', 'fr.web.planStatus_reviewing',
    'it.web.planStatus_reviewing', 'pt.web.planStatus_reviewing',
    // "Plan" is the same word in several languages and is kept as the product's own name.
    'de.web.tabPlan', 'es.web.tabPlan', 'fr.web.tabPlan', 'it.web.tabPlan', 'pt.web.tabPlan', 'tr.web.tabPlan',
  ])

  it('defines every Insights key in all ten locales, and none of them is the English source', () => {
    expect(INSIGHTS_KEYS.length).toBeGreaterThanOrEqual(30)
    for (const key of INSIGHTS_KEYS) {
      expect((en as Record<string, string>)[key], `en is missing ${key}`).toBeTruthy()
    }
    for (const [code, keys] of Object.entries(LOCALE_KEYS)) {
      for (const key of INSIGHTS_KEYS) {
        expect(keys[key], `${code} is missing ${key}`).toBeTruthy()
        // Two locales legitimately spell a short word as English does; the rest must differ.
        if (SAME_AS_ENGLISH.has(`${code}.${key}`)) continue
        expect(keys[key], `${code}.${key} still holds the English source`).not.toBe((en as Record<string, string>)[key])
      }
    }
  })
})

describe('i18n key parity', () => {
  // A locale may legitimately spell a word exactly as English does; it is listed here with the
  // reason instead of weakening the rule for every key.
  const SAME_AS_ENGLISH = new Set([
    'fr.flow.meta.attention',
    // "plan" is the same noun in these three, and the segment is a bare `plan N/M` label.
    'fr.flow.work.plan_segment', 'es.flow.work.plan_segment', 'tr.flow.work.plan_segment',
  ])

  it('defines every flow key in all nine translated locales', () => {
    const flowKeys = Object.keys(en).filter(key => key.startsWith('flow.'))
    // Guard the guard: an empty list would make the loop below pass without checking anything.
    expect(flowKeys.length).toBeGreaterThanOrEqual(11)

    for (const [code, keys] of Object.entries(LOCALE_KEYS)) {
      for (const key of flowKeys) {
        expect(keys[key], `${code} is missing ${key}`).toBeTruthy()
        if (SAME_AS_ENGLISH.has(`${code}.${key}`)) continue
        expect(keys[key], `${code}.${key} still holds the English source`).not.toBe(
          (en as Record<string, string>)[key],
        )
      }
    }
  })

  it('keeps every placeholder a flow badge relies on', () => {
    for (const option of LANGUAGE_OPTIONS) {
      const badge = translate(option.code, 'flow.badge.rounds', { status: 'review', rounds: 2, max: 6 })
      expect(badge).toContain('review')
      expect(badge).toContain('2')
      expect(badge).toContain('6')
      expect(badge).not.toContain('{{')
      // The bare form drops the ratio, not the language.
      expect(translate(option.code, 'flow.badge.status', { status: 'review' })).toContain('review')
    }
  })
})

// The work-items view: the run-card badge names the current task and its holder, and the Plan tab labels spec rows. Every
// string a reader sees comes from a key, so the parity rule covers this family too — a locale that only has the English
// source would silently show English inside a translated UI.
const WORK_KEYS = [
  'flow.work.dispatching', 'flow.work.in_work', 'flow.work.reviewing', 'flow.work.nothing',
  'flow.work.unknown', 'flow.work.unknown_detail', 'flow.work.plan_segment',
  'flow.work.holder_dev', 'flow.work.holder_reviewer',
  'web.planSpecOrigin', 'web.planGated', 'web.planDerivedCaption', 'web.planDispatchUnknown',
  'web.planStatus_dispatching', 'web.planStatus_handed_over',
]

describe('work-items key parity', () => {
  // A parenthetical is the same punctuation in these languages: the two halves are translated
  // separately, and only the brackets around them are shared with the English source.
  const SAME_PATTERN = new Set(['de.web.planGated', 'fr.web.planGated', 'es.web.planGated', 'pt.web.planGated',
    'it.web.planGated', 'tr.web.planGated', 'ru.web.planGated', 'ar.web.planGated'])
  // `plan` is the same noun in these three.
  const SAME_WORD = new Set(['fr.flow.work.plan_segment', 'es.flow.work.plan_segment', 'tr.flow.work.plan_segment'])

  it('defines every work-item key in all ten locales, and none of them is the English source', () => {
    for (const key of WORK_KEYS) {
      expect((en as Record<string, string>)[key], `en is missing ${key}`).toBeTruthy()
    }
    for (const [code, keys] of Object.entries(LOCALE_KEYS)) {
      for (const key of WORK_KEYS) {
        expect(keys[key], `${code} is missing ${key}`).toBeTruthy()
        if (SAME_PATTERN.has(`${code}.${key}`) || SAME_WORD.has(`${code}.${key}`)) continue
        expect(keys[key], `${code}.${key} still holds the English source`).not.toBe((en as Record<string, string>)[key])
      }
    }
  })

  it('keeps the placeholders the badge and the Plan tab fill in', () => {
    for (const option of LANGUAGE_OPTIONS) {
      for (const key of ['flow.work.dispatching', 'flow.work.in_work', 'flow.work.reviewing'] as const) {
        const text = translate(option.code, key, { id: 'UI-143' })
        expect(text).toContain('UI-143')
        expect(text).not.toContain('{{')
      }
      expect(translate(option.code, 'flow.work.holder_dev', { agent: 'dev-1' })).toContain('dev-1')
      expect(translate(option.code, 'flow.work.plan_segment', { done: 3, total: 7 })).toContain('3')
      expect(translate(option.code, 'web.planGated', { status: 'reviewing', state: 'paused' })).toContain('paused')
    }
  })
})
