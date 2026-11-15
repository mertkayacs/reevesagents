// Pure helpers for the Insights dialog (Plan + Logs tabs) and the agent-card pulse.
//
// A plain script, not a module: `app.js` is an IIFE loaded before this file's consumers and the client has no build
// step. Everything here is DOM-free on purpose, so `test/web/insights-core.test.ts` can load the real file with a
// fake `window` and test the arithmetic instead of grepping for it.

;(function (global) {
  'use strict'

  // Where focus goes when the plan dialog closes. The button is looked up, never remembered: `renderSidebar()` rebuilds the
  // cards on every SSE frame, so a held element is detached by the time Esc is pressed. Order: the icon of that run, then the
  // run's card, then the Logs button — a keyboard user must never land on `body`.
  function planFocusTarget(doc, runId) {
    const query = selector => {
      if (!doc || typeof doc.querySelector !== 'function') return null
      const found = doc.querySelector(selector)
      return found && typeof found.focus === 'function' ? found : null
    }
    if (!runId) return query('#logs-btn')
    return query(`[data-plan-run="${runId}"]`)
      || query(`[data-run-card="${runId}"]`)
      || query('#logs-btn')
  }

  // `aria-expanded` for the plan icon: true only for the run whose dialog is open. Passed the id of the open dialog rather
  // than a flag, so a redrawn card cannot claim `true` for a different run.
  function planExpanded(openRunId, runId) {
    return openRunId !== null && openRunId !== undefined && openRunId === runId ? 'true' : 'false'
  }

  // Is there anything to open for this card? The badge itself is a label and never a control; the icon beside it is drawn
  // only when the answer is yes, because a button that cannot do anything is worse than no button (T1.6.6). A flow driven
  // from the spec queue has no plan document and still has work to show — the task in work, who holds it, which commit
  // closed the last one — so the view's row count opens the tab too.
  function planIconVisible(flow) {
    return Boolean(flow && (flow.plan || flow.work_total > 0))
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

  global.insightsCore = { formatPlanProgress, pulseRemaining, filterPlanItems, planWaiting, planIconVisible, planFocusTarget, planExpanded }
})(typeof window === 'undefined' ? globalThis : window)
