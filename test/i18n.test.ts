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

describe('i18n key parity', () => {
  // A locale may legitimately spell a word exactly as English does; it is listed here with the
  // reason instead of weakening the rule for every key.
  const SAME_AS_ENGLISH = new Set(['fr.flow.meta.attention'])

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
