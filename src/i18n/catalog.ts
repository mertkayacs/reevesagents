// Translation catalog.
//
// Two lookups, one per how the UI produces a string:
//   translate(key)        - for code that calls t('some.key') with a structured key.
//   translatePhrase(text) - for components handed a hardcoded English label; they
//                           translate it by its English text.
//
// Each language lives in its own file under ./locales/ with a `keys` map (key ->
// translation, overlaid on the English source) and a `phrases` map (English text ->
// translation). Anything not listed falls back to English. Add new keys to en.ts first.

import { DEFAULT_LANGUAGE, type LanguageCode } from './languages.js'
import { en } from './locales/en.js'
import { de } from './locales/de.js'
import { fr } from './locales/fr.js'
import { es } from './locales/es.js'
import { pt } from './locales/pt.js'
import { it } from './locales/it.js'
import { tr } from './locales/tr.js'
import { ru } from './locales/ru.js'
import { zhHans } from './locales/zh-Hans.js'
import { ar } from './locales/ar.js'

type Key = keyof typeof en
type Catalog = Record<Key, string>
export type TranslationKey = Key

interface Locale { keys: Record<string, string>; phrases: Record<string, string> }

const LOCALES: Record<LanguageCode, Locale> = {
  en: { keys: {}, phrases: {} },
  de, fr, es, pt, it, tr, ru, 'zh-Hans': zhHans, ar,
}

// Full key catalog per language: the English source overlaid with the language's overrides.
const catalogs = {} as Record<LanguageCode, Catalog>
for (const lang of Object.keys(LOCALES) as LanguageCode[]) {
  catalogs[lang] = { ...en, ...LOCALES[lang].keys } as Catalog
}

export function translate(language: LanguageCode, key: TranslationKey, values: Record<string, string | number> = {}): string {
  let text = catalogs[language]?.[key] ?? en[key] ?? key
  for (const [name, value] of Object.entries(values)) {
    text = text.replaceAll(`{{${name}}}`, String(value))
  }
  return text
}

export function localeCatalog(language: LanguageCode): Catalog {
  return catalogs[language] ?? catalogs[DEFAULT_LANGUAGE]
}

export function translatePhrase(language: LanguageCode, text: string): string {
  return LOCALES[language]?.phrases[text] ?? text
}
