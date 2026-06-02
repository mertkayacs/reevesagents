import { describe, expect, it } from 'vitest'
import { LANGUAGE_OPTIONS } from '../src/i18n/languages.js'
import { translate, translatePhrase } from '../src/i18n/catalog.js'

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
    expect(translatePhrase('de', 'Back')).toBe('Zurück')
    expect(translatePhrase('ar', 'Actions')).toBe('إجراءات')
    expect(translatePhrase('fr', 'custom-run-name')).toBe('custom-run-name')
  })
})
