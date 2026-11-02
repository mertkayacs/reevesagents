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
      // A card rendered while the dialog is open asks what to put on its button.
      expandedOf(runId) {
        return openRunId !== null && runId === openRunId ? 'true' : 'false'
      },
      get openRunId() { return openRunId },
    }
  }

  global.planDialogController = { createPlanDialogController }
})(typeof window === 'undefined' ? globalThis : window)
