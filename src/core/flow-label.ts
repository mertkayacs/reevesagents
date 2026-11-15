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
import type { WorkView } from './work-items.js'

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

// The plan indicator on a run card: tone, label, and whether it should pulse.
//
// The label carries the numbers because the colour alone is not information — "done" used to mean both "the plan finished"
// and "a flow that never had a plan stopped", and a reader who cannot tell green from amber needs the same answer in words.
// `pulse` is not part of the tone: a colour that breathes for ever is noise, so the caller decides whether the state is
// still news (`fresh`), and a closed or paused flow never pulses.
export type FlowBadgeTone = 'progress' | 'done' | 'attention' | 'paused' | 'neutral'

export interface FlowBadgeView {
  label: string
  tone: FlowBadgeTone
  pulse: boolean
  // The longer text for `title`: why the badge says what it says.
  detail: string | null
  // The plan's own progress as a **separate** segment (`plan 3/7`), so the active segment stays about the task in work and
  // the plan's arithmetic is still one glance away. Null when the flow has no plan or the row list is empty.
  plan_label: string | null
}

export interface FlowBadgeViewOptions {
  fresh?: boolean
  // The derived work view for this flow (`core/work-items.ts`). Its `current` is the only source of the active
  // segment, which is what keeps the badge and the Plan tab from disagreeing about what is being worked on.
  work?: WorkView | null
}

export function flowBadgeView(
  t: FlowTranslate,
  badge: FlowBadge,
  options: FlowBadgeViewOptions = {},
): FlowBadgeView {
  const fresh = options.fresh === true
  const progress = badge.plan_progress
  const detail = flowAttentionText(t, badge)
  const work = options.work ?? null
  const planLabel = progress !== null && work !== null && work.total > 0
    ? t('flow.work.plan_segment', { done: progress.done, total: progress.total })
    : null

  if (work !== null && work.total > 0) {
    // §2.0/§3 of the work-items contract: a parked flow owns nothing, and the empty state says which parked state it is
    // instead of claiming "nothing in work" — the same blur round 7 rejected for an unconfirmed dispatch. `escalated` is
    // handled before the attention branch because "rounds spent" and "the flow is escalated" are the same fact, and the
    // operator's question is which one it is.
    if (badge.status === 'escalated') {
      return { label: t('flow.status.escalated'), tone: 'attention', pulse: fresh, detail: detail ?? null, plan_label: planLabel }
    }
    if (badge.status === 'paused' || badge.status === 'orphaned') {
      return { label: t(`flow.status.${badge.status}` as TranslationKey), tone: 'paused', pulse: false, detail, plan_label: planLabel }
    }
    if (badge.attention !== null) {
      return {
        label: t('flow.badge.attention'),
        tone: 'attention',
        pulse: fresh && badge.status !== 'done',
        detail: detail ?? t(`flow.attention.${badge.attention}` as TranslationKey),
        plan_label: planLabel,
      }
    }
    if (badge.status === 'done') {
      if (progress !== null && progress.done >= progress.total) {
        return {
          label: t('flow.badge.plan_done', { done: progress.done, total: progress.total }),
          tone: 'done',
          pulse: fresh,
          detail: t('flow.badge.plan_done_detail'),
          plan_label: planLabel,
        }
      }
      return { label: t('flow.badge.closed'), tone: 'neutral', pulse: false, detail: badge.close_reason, plan_label: planLabel }
    }
    const current = work.current
    if (current !== null) {
      return {
        label: t(current.status === 'dispatching'
          ? 'flow.work.dispatching'
          : current.status === 'reviewing' ? 'flow.work.reviewing' : 'flow.work.in_work', { id: current.id }),
        tone: 'progress',
        pulse: false,
        // Who holds it: the row's own agent, which is the one the engine dispatches to — not merely the role.
        detail: current.holder === null
          ? current.note ?? null
          : t(current.holder.role === 'dev' ? 'flow.work.holder_dev' : 'flow.work.holder_reviewer', { agent: current.holder.agent_id }),
        plan_label: planLabel,
      }
    }
    if (work.dispatch_unknown) {
      // The absence of a reliable binding is not the same fact as an idle flow: a dispatch was sent and nobody confirmed it,
      // and the journal does not say which task it was.
      return {
        label: t('flow.work.unknown'),
        tone: 'attention',
        pulse: fresh,
        detail: t('flow.work.unknown_detail'),
        plan_label: planLabel,
      }
    }
    return { label: t('flow.work.nothing'), tone: 'neutral', pulse: false, detail: null, plan_label: planLabel }
  }

  if (badge.attention !== null) {
    return {
      label: t('flow.badge.attention'),
      tone: 'attention',
      pulse: fresh && badge.status !== 'done' && badge.status !== 'paused',
      detail: detail ?? t(`flow.attention.${badge.attention}` as TranslationKey),
      plan_label: null,
    }
  }
  if (badge.status === 'paused' || badge.status === 'orphaned') {
    return { label: flowBadgeText(t, badge), tone: 'paused', pulse: false, detail: detail, plan_label: null }
  }
  if (badge.status === 'done') {
    // A finished plan is a different fact from a closed flow that had none.
    if (progress !== null && progress.done >= progress.total) {
      return {
        label: t('flow.badge.plan_done', { done: progress.done, total: progress.total }),
        tone: 'done',
        pulse: fresh,
        detail: t('flow.badge.plan_done_detail'),
        plan_label: null,
      }
    }
    return { label: t('flow.badge.closed'), tone: 'neutral', pulse: false, detail: badge.close_reason, plan_label: null }
  }
  if (progress !== null) {
    return {
      label: t('flow.badge.plan_progress', { done: progress.done, total: progress.total }),
      tone: 'progress',
      pulse: false,
      detail: t('flow.badge.plan_progress_detail'),
      plan_label: null,
    }
  }
  if (badge.queue_depth > 0) {
    return {
      label: t('flow.badge.spec_queue_progress', { count: badge.queue_depth }),
      tone: 'progress',
      pulse: false,
      detail: t('flow.badge.spec_queue_progress_detail'),
      plan_label: null,
    }
  }
  return { label: flowBadgeText(t, badge), tone: 'neutral', pulse: false, detail: detail, plan_label: null }
}

export function flowAttentionText(t: FlowTranslate, badge: FlowBadge): string | null {
  if (!badge.attention) return null
  const base = t(`flow.attention.${badge.attention}` as TranslationKey)
  if (badge.attention === 'incident' && badge.incident_summary) {
    const summary = badge.incident_summary
    return `${base}: ${summary.open} open, ${summary.blockers} blockers · ${summary.owner}`
  }
  if (badge.attention === 'spec_lost' && badge.attention_detail) return badge.attention_detail
  // The item id is the actionable part: "plan: waiting for a brief" without `P1.7.2` sends the operator to the
  // dialog to find out which one, and the badge is exactly where they look first.
  return badge.plan ? `${base} (${badge.plan.item})` : base
}
