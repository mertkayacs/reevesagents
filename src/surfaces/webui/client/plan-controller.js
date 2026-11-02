// The plan dialog's focus and ARIA rules, kept out of `app.js` so they can be driven against a small DOM in a test.
//
// The lesson this file exists for: a run card is rebuilt on every SSE frame, so a remembered button is a detached node by the
// time the dialog closes. The controller remembers the **run id** and looks the button up again when it needs it, falling back
// to the run's card and then to the Logs button — a keyboard user must never land on `body`.

;(function (global) {
  'use strict'

  function createPlanDialogController(doc) {
    let openRunId = null

    const buttonFor = runId => {
      if (!runId || !doc || typeof doc.querySelector !== 'function') return null
      const found = doc.querySelector(`[data-plan-run="${runId}"]`)
      return found && typeof found.focus === 'function' ? found : null
    }

    const allButtons = () => {
      if (!doc || typeof doc.querySelectorAll !== 'function') return []
      return Array.from(doc.querySelectorAll('[data-plan-run]'))
    }

    // `aria-expanded` is recomputed for every card, not only for the one whose dialog opened: a card redrawn while the dialog
    // is open has to say `true`, and every other card has to say `false`.
    function refreshExpanded() {
      for (const button of allButtons()) {
        const runId = typeof button.getAttribute === 'function' ? button.getAttribute('data-plan-run') : null
        if (typeof button.setAttribute === 'function') {
          button.setAttribute('aria-expanded', openRunId !== null && runId === openRunId ? 'true' : 'false')
        }
      }
    }

    return {
      // Wires the dialog's own `close` event — the one Esc and the Close button both produce — to the focus rule below. Kept here
      // rather than in `app.js` so the "Esc comes back to the icon" path can be driven end to end in a test instead of being
      // described in a comment.
      attach(dialog) {
        if (!dialog || typeof dialog.addEventListener !== 'function') return
        dialog.addEventListener('close', () => { this.close() })
      },
      open(runId) {
        openRunId = runId || null
        refreshExpanded()
      },
      // Called from the dialog's `close` event (Esc and the Close button both land here). It returns the element it focused so a
      // test can assert on it without a browser.
      close() {
        const runId = openRunId
        openRunId = null
        refreshExpanded()
        const target = global.planFocusTarget
          ? global.planFocusTarget(doc, runId)
          : (buttonFor(runId)
              || (doc && typeof doc.querySelector === 'function' ? doc.querySelector(`[data-run-card="${runId}"]`) : null)
              || (doc && typeof doc.querySelector === 'function' ? doc.querySelector('#logs-btn') : null))
        if (target && typeof target.focus === 'function') target.focus()
        return target || null
      },
      // The icon itself: created only when the run has a plan, labelled for a screen reader and stamped with the run id the
      // close path looks it up by. Kept here so "no plan → no button" is a behaviour a test can call, not a line of source it can
      // search for.
      createIcon(flow, labels) {
        const core = global.insightsCore
        if (!core || typeof core.planIconVisible !== 'function' || !core.planIconVisible(flow)) return null
        const runId = flow && flow.run_id ? flow.run_id : ''
        const button = doc.createElement('button')
        button.type = 'button'
        button.id = 'plan-btn'
        button.className = 'flow-plan-btn'
        button.setAttribute('aria-label', labels.ariaLabel)
        button.setAttribute('aria-haspopup', 'dialog')
        button.setAttribute('aria-expanded', openRunId !== null && runId === openRunId ? 'true' : 'false')
        button.title = labels.ariaLabel
        button.setAttribute('data-plan-run', runId)
        button.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">'
          + '<path d="M2 3.5h2M6 3.5h8M2 8h2M6 8h8M2 12.5h2M6 12.5h8" stroke="currentColor" stroke-width="1.4" '
          + 'stroke-linecap="round" fill="none"/></svg>'
        return button
      },
      // A card rendered while the dialog is open asks what to put on its button.
      expandedOf(runId) {
        return openRunId !== null && runId === openRunId ? 'true' : 'false'
      },
      get openRunId() { return openRunId },
    }
  }

  global.planDialogController = { createPlanDialogController }
})(typeof window === 'undefined' ? globalThis : window)
