// Localized "{n} agent(s)" label, shared across run screens.

import type { TranslationKey } from '../i18n/catalog.js'

type Translate = (_key: TranslationKey, _values?: Record<string, string | number>) => string

export function agentCountLabel(t: Translate, count: number): string {
  return count === 1
    ? t('runtime.agentsOne', { count })
    : t('runtime.agentsMany', { count })
}
