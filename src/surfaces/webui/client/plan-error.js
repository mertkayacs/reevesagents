// The line under the plan dialog's actions: a refusal from `POST /api/flow/pause|resume`, translated, bound to the run it was raised for,
// and gone after a few seconds. It lives in its own file so the behaviour can be driven in a real DOM with fake timers — the rest of the
// client is too big to mount, and "the message never disappears" is exactly the kind of bug a hand-written fake hides (block 59).
//
// The rule it encodes: a code is not a sentence. `not_pausable` goes into `data-code` and `title` for whoever has to diagnose it; the
// operator reads the words in their own language, or a generic fallback they can act on.
;(function (window) {
  'use strict'

  const TTL_MS = 6000
  const KEYS = {
    not_pausable: 'web.planErrNotPausable',
    already_paused: 'web.planErrAlreadyPaused',
    not_paused: 'web.planErrNotPaused',
    not_found: 'web.planErrNotFound',
  }

  function createPlanErrorLine(doc, options) {
    const opts = options || {}
    const t = opts.t || function (key) { return key }
    const ttl = typeof opts.ttlMs === 'number' ? opts.ttlMs : TTL_MS
    const setTimer = opts.setTimeout || function (fn, ms) { return window.setTimeout(fn, ms) }
    const clearTimer = opts.clearTimeout || function (id) { window.clearTimeout(id) }

    let element = null
    let timer = null
    let runId = null
    let code = null

    function resolve() {
      if (element && element.isConnected !== false) return element
      element = doc.getElementById('plan-error')
      return element
    }

    function clear() {
      if (timer !== null) {
        clearTimer(timer)
        timer = null
      }
      runId = null
      code = null
      const node = resolve()
      if (!node) return
      node.textContent = ''
      node.hidden = true
      delete node.dataset.code
      node.removeAttribute('title')
    }

    function show(nextCode, ownerRunId) {
      const node = resolve()
      clear()
      if (!node) return
      code = String(nextCode || 'unknown')
      runId = ownerRunId === undefined ? null : ownerRunId
      node.textContent = t(KEYS[code] || 'web.planErrGeneric')
      node.dataset.code = code
      node.title = code
      node.hidden = false
      timer = setTimer(function () { clear() }, ttl)
    }

    // A line raised for one run is never shown over another: the caller says which run is open now, and a mismatch drops it.
    function bind(openRunId) {
      if (runId !== null && runId !== openRunId) clear()
    }

    return {
      show: show,
      clear: clear,
      bind: bind,
      get code() { return code },
      get runId() { return runId },
      get visible() { const node = resolve(); return Boolean(node) && node.hidden === false },
    }
  }

  window.planErrorLine = { createPlanErrorLine: createPlanErrorLine, PLAN_ERROR_TTL_MS: TTL_MS, PLAN_ERROR_KEYS: KEYS }
})(window)
