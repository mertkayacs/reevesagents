// Pure helpers for the Insights dialog (Plan + Logs tabs) and the agent-card pulse.
//
// A plain script, not a module: `app.js` is an IIFE loaded before this file's consumers and the client has no build
// step. Everything here is DOM-free on purpose, so `test/web/insights-core.test.ts` can load the real file with a
// fake `window` and test the arithmetic instead of grepping for it.

;(function (global) {
  'use strict'

  // Is the flow badge a button, and what does it say? A badge with a plan opens that plan; a badge without one stays a chip
  // and says so, because a button that does nothing is worse than a chip that does nothing.
  function planBadgeAction(flow) {
    if (!flow) return { interactive: false, reason: 'no-flow' }
    if (!flow.plan) return { interactive: false, reason: 'no-plan' }
    return {
      interactive: true,
      haspopup: 'dialog',
      // The run is part of the label: two cards side by side both say "flow: plan 1/2", and a screen reader needs to know
      // which one it is about to open.
      label: `${flow.label} — ${flow.run_id || ''}`.trim(),
    }
  }

  // `12/23` plus the percentage the progress bar needs. A plan with no items is `0/0` and a 0 % bar, not a crash.
  function formatPlanProgress(done, total) {
    const safeTotal = Number.isFinite(total) && total > 0 ? total : 0
    const safeDone = Number.isFinite(done) && done > 0 ? done : 0
    const percent = safeTotal === 0 ? 0 : Math.round((safeDone / safeTotal) * 100)
    return { text: `${safeDone}/${safeTotal}`, percent, done: safeDone, total: safeTotal }
  }

  // How long the card's pulse should still run, from the *server* clock of the newest unread event. The client
  // clock is only used to measure elapsed time since the snapshot, so an F5 mid-pulse keeps the remainder instead of
  // restarting it. `pulseMs` 0 disables the pulse entirely.
  // The remainder is measured from the event's server timestamp to *now*, full stop. `seenAtMs` is only a fallback
  // for a client whose clock has not been trusted yet; using it as the anchor made the remainder stand still while
  // the page was open, so the ring never finished.
  function pulseRemaining(latestTs, nowMs, pulseMs, seenAtMs) {
    if (!Number.isFinite(pulseMs) || pulseMs <= 0) return 0
    const stamped = Date.parse(latestTs)
    if (Number.isNaN(stamped)) return 0
    const now = Number.isFinite(nowMs) ? nowMs : seenAtMs
    if (!Number.isFinite(now)) return 0
    return Math.max(0, pulseMs - Math.max(0, now - stamped))
  }

  // The filter the Plan tab offers: all, open (not done/skipped), or waiting for a human.
  function filterPlanItems(items, filter) {
    const list = Array.isArray(items) ? items : []
    if (filter === 'open') return list.filter(item => item.status !== 'done' && item.status !== 'skipped')
    if (filter === 'waiting') {
      return list.filter(item => {
        if (item.status === 'done' || item.status === 'skipped') return false
        if (item.missing_since !== null && item.missing_since !== undefined) return false
        return item.status === 'blocked_owner' || item.status === 'needs_brief' || item.spec_path === null
      })
    }
    return list
  }

  // Which items the "waiting for you" block lists, and why. Kept here so the badge and the dialog cannot disagree
  // about what "waiting" means.
  function planWaiting(items) {
    const list = Array.isArray(items) ? items : []
    const needsBrief = []
    const blocked = []
    for (const item of list) {
      if (item.status === 'done' || item.status === 'skipped') continue
      // An item the document dropped is not waiting for a brief: it is waiting for a re-import, and dressing it up
      // as "needs a brief" sends the owner to attach one for a row that may not exist any more.
      if (item.missing_since !== null && item.missing_since !== undefined) continue
      if (item.status === 'blocked_owner') blocked.push(item)
      else if (item.spec_path === null) needsBrief.push(item)
    }
    return { needsBrief, blocked, total: needsBrief.length + blocked.length }
  }

  global.insightsCore = { formatPlanProgress, pulseRemaining, filterPlanItems, planWaiting, planBadgeAction }
})(typeof window === 'undefined' ? globalThis : window)
