import type { LanguageCode } from '../state/types.js'

export type { LanguageCode }

const LANGUAGES = ['en', 'de', 'fr', 'es', 'pt', 'it', 'tr', 'ru', 'zh-Hans', 'ar'] as const

export interface LanguageOption {
  code: LanguageCode
  flag: string
  name: string
  nativeName: string
  dir: 'ltr' | 'rtl'
}

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: 'en', flag: '🇺🇸', name: 'English', nativeName: 'English', dir: 'ltr' },
  { code: 'de', flag: '🇩🇪', name: 'German', nativeName: 'Deutsch', dir: 'ltr' },
  { code: 'fr', flag: '🇫🇷', name: 'French', nativeName: 'Français', dir: 'ltr' },
  { code: 'es', flag: '🇪🇸', name: 'Spanish', nativeName: 'Español', dir: 'ltr' },
  { code: 'pt', flag: '🇵🇹', name: 'Portuguese', nativeName: 'Português', dir: 'ltr' },
  { code: 'it', flag: '🇮🇹', name: 'Italian', nativeName: 'Italiano', dir: 'ltr' },
  { code: 'tr', flag: '🇹🇷', name: 'Turkish', nativeName: 'Türkçe', dir: 'ltr' },
  { code: 'ru', flag: '🇷🇺', name: 'Russian', nativeName: 'Русский', dir: 'ltr' },
  { code: 'zh-Hans', flag: '🇨🇳', name: 'Simplified Chinese', nativeName: '简体中文', dir: 'ltr' },
  { code: 'ar', flag: '🇸🇦', name: 'Arabic', nativeName: 'العربية', dir: 'rtl' },
]

export const DEFAULT_LANGUAGE: LanguageCode = 'en'

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value)
}

export function languageOption(code: LanguageCode): LanguageOption {
  return LANGUAGE_OPTIONS.find(option => option.code === code) ?? LANGUAGE_OPTIONS[0]!
}
