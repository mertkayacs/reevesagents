// Flow badge copy — the one place a flow badge is formatted, shared by the TUI list and the Web UI.
//
// Every string comes from a translation key, so neither surface carries English text of its own and
// a new locale only has to translate keys. Two forms: the round budget when the row has room, the
// bare state otherwise. A badge that wraps would push the run row onto a second line at 80x24,
// which is exactly what a list cannot afford.
//
// It lives in core/ rather than under one surface because a second copy of this formatting is how
// two surfaces start disagreeing about what "2/6" means.

import type { TranslationKey } from '../i18n/catalog.js'
import type { FlowBadge } from './flow-view.js'

export type FlowTranslate = (_key: TranslationKey, _values?: Record<string, string | number>) => string

export function flowBadgeText(t: FlowTranslate, badge: FlowBadge, options: { compact?: boolean } = {}): string {
  const status = t(`flow.status.${badge.status}` as TranslationKey)
  // A closed, escalated or orphaned flow has no meaningful ratio: the budget is either spent
  // (escalated), irrelevant (done) or nobody will spend it (orphaned). `paused` keeps the ratio:
  // it resumes into the same budget.
  const withoutRatio = badge.status === 'escalated' || badge.status === 'done' || badge.status === 'orphaned'
  if (options.compact === true || withoutRatio) {
    return t('flow.badge.status', { status })
  }
  return t('flow.badge.rounds', { status, rounds: badge.rounds, max: badge.max_rounds })
}

export function flowAttentionText(t: FlowTranslate, badge: FlowBadge): string | null {
  if (!badge.attention) return null
  return t(`flow.attention.${badge.attention}` as TranslationKey)
}
