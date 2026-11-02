// D5 of the live run: an empty Hermes pane in a Russian interface was read as "somebody else's text", so the flow
// refused to dispatch anything at all (`composer_dirty`). The placeholder is a provider hint, not typed text, and it
// has to be recognised in every locale the TUI ships — otherwise the same bug returns with the next translation.

import { describe, expect, it } from 'vitest'
import { composerText, isComposerPlaceholder } from '../src/core/activity.js'

// The hint Hermes draws in an empty composer, one per shipped locale, plus the two shapes that are not in the catalogue.
const PLACEHOLDERS = [
  ['en', 'Ask anything, or type / for commands…'],
  ['ru', 'Спросите о чём угодно или введите / для команд…'],
  ['uk', 'Запитайте будь-що або введіть / для команд…'],
  ['de', 'Fragen Sie etwas oder geben Sie / für Befehle ein…'],
  ['es', 'Pregunta lo que quieras, o escribe / para ver los comandos…'],
  ['fr', 'Posez une question, ou tapez / pour les commandes…'],
  ['it', 'Chiedi qualsiasi cosa, o digita / per i comandi…'],
  ['pt', 'Pergunte qualquer coisa ou digite / para mande comandos…'],
  ['tr', 'Bir şey sorun veya komutlar için / yazın…'],
  ['ja', '何でも質問するか、/ を入力してコマンドを表示…'],
  ['zh-Hans', '随便问点什么，或输入 / 查看命令…'],
  ['zh-Hant', '隨便問點什麼，或輸入 / 查看指令…'],
] as const

function hermesPane(composer: string, extra: string[] = []): string {
  return [
    `❯ ${composer}`,
    '────────────────────────────────────────────',
    ' ☤ deepseek-v4.1-flash · 282K/1M · ✓ 6m · ~/projects/flow-demo',
    ...extra,
  ].join('\n')
}

describe('an empty composer is not somebody else\'s text (D5)', () => {
  for (const [locale, hint] of PLACEHOLDERS) {
    it(`reads the ${locale} hint as empty`, () => {
      expect(composerText(hermesPane(hint), 'hermes')).toBe('')
      expect(isComposerPlaceholder(hint, 'hermes')).toBe(true)
    })
  }

  it('still refuses a real, unsent prompt in each of those locales', () => {
    // The other half of the rule: a placeholder is a hint, not a free pass. Any text that is not the hint is somebody's
    // work and must not be pasted over.
    for (const [locale, hint] of PLACEHOLDERS) {
      expect(composerText(hermesPane('Создай index.html и style.css'), 'hermes'), locale).toBe('Создай index.html и style.css')
      expect(isComposerPlaceholder('Создай index.html и style.css', 'hermes'), locale).toBe(false)
      // A prompt that merely looks like the hint is not the hint: the ellipsis alone is not a licence to overwrite.
      expect(isComposerPlaceholder(`${hint} и запусти тесты`, 'hermes'), locale).toBe(false)
    }
  })

  it('keeps the codex placeholder working', () => {
    expect(composerText('› Ask Codex to do anything', 'codex')).toBe('')
    expect(composerText('› fix the failing test', 'codex')).toBe('fix the failing test')
  })

  it('recognises a reworded hint through its shape, without a new release', () => {
    expect(isComposerPlaceholder('Спросите что угодно · / — команды…', 'hermes')).toBe(true)
    expect(isComposerPlaceholder('Just press / to see every command…', 'hermes')).toBe(true)
  })
})
