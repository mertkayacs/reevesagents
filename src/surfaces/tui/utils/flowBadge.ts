// Flow badge copy: every string comes from a translation key, so a component never carries English
// text of its own and a new locale only has to translate keys.
//
// Two forms, chosen by width: the round budget when the row has room, the bare state otherwise. A
// badge that wraps would push the run row onto a second line at 80x24, which is exactly what the
// list cannot afford.

import type { TranslationKey } from '../../../i18n/catalog.js'
import type { FlowBadge } from '../../../core/flow-view.js'

type TranslateFn = (_key: TranslationKey, _values?: Record<string, string | number>) => string

export function flowBadgeText(t: TranslateFn, badge: FlowBadge, options: { compact?: boolean } = {}): string {
  const status = t(`flow.status.${badge.status}` as TranslationKey)
  // A closed or escalated flow has no meaningful ratio: the budget is either spent or irrelevant.
  if (options.compact === true || badge.status === 'escalated' || badge.status === 'done') {
    return t('flow.badge.status', { status })
  }
  return t('flow.badge.rounds', { status, rounds: badge.rounds, max: badge.max_rounds })
}

export function flowAttentionText(t: TranslateFn, badge: FlowBadge): string | null {
  if (!badge.attention) return null
  return t(`flow.attention.${badge.attention}` as TranslationKey)
}
