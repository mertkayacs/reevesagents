import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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
    expect(translatePhrase('tr', 'Switch to tmux tabs')).toBe('Tmux tablarına geç')
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

  it('has locale coverage for every Web client label', () => {
    const source = readFileSync(join(process.cwd(), 'src/i18n/catalog.ts'), 'utf8')
    const clientSource = readFileSync(join(process.cwd(), 'src/web/client/app.js'), 'utf8')
    const keys = [...new Set(
      [...clientSource.matchAll(/'((?:web|common)\.[^']+)'\s*:/g)].map(match => match[1]!),
    )]

    for (const key of keys) {
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const matches = source.match(new RegExp(`'${escaped}'`, 'g')) ?? []
      expect(matches.length).toBeGreaterThanOrEqual(LANGUAGE_OPTIONS.length)
    }
    expect(translate('tr', 'web.noLiveTmuxTarget')).toBe('run tmux oturumu kullanılamıyor')
    expect(translate('de', 'web.openAgent')).toBe('Öffnen')
  })
})
