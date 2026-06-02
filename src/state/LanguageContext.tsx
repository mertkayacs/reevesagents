import React, { createContext, useCallback, useContext, useState } from 'react'
import { localeCatalog, translate, type TranslationKey } from '../i18n/catalog.js'
import { DEFAULT_LANGUAGE, languageOption } from '../i18n/languages.js'
import { loadConfig, saveConfig } from './config.js'
import type { LanguageCode } from './types.js'

interface LanguageContextValue {
  language: LanguageCode
  setLanguage: (_language: LanguageCode) => void
  t: (_key: TranslationKey, _values?: Record<string, string | number>) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>(() => loadConfig().global.language)

  const setLanguage = useCallback((next: LanguageCode) => {
    const cfg = loadConfig()
    cfg.global.language = next
    saveConfig(cfg)
    setLanguageState(next)
  }, [])

  const t = useCallback((key: TranslationKey, values?: Record<string, string | number>) => (
    translate(language, key, values)
  ), [language])

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext)
  if (!ctx) {
    const fallback = DEFAULT_LANGUAGE
    return {
      language: fallback,
      setLanguage() {},
      t(key, values) {
        return translate(fallback, key, values)
      },
    }
  }
  return ctx
}

export function tuiLanguageLabel(code: LanguageCode): string {
  const option = languageOption(code)
  return `${option.flag} ${option.nativeName}`
}

export function webLocalePayload(language: LanguageCode): Record<string, string> {
  return localeCatalog(language)
}
