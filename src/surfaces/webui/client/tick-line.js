// The driver line on the plan dialog, and the question "did this frame change anything but the clock?".
//
// A plain script, not a module: the client has no build step and `app.js` is an IIFE. Everything here is DOM-free on
// purpose, so `test/web/tick-line.test.ts` can load the real file with a fake `window` and drive the arithmetic instead
// of grepping for it.
//
// Why the line is computed here and not on the server: the frame used to carry `age_s` and `next_in_s`, two numbers that
// change by themselves. Every frame therefore differed from the previous one, `payload === last` never matched, and the
// whole sidebar was rebuilt every 1.5 s (block 71). The stream now carries absolute marks (`at`, `next_at`) and the panel
// subtracts its own clock, once a second, touching one line of text.

;(function (global) {
  'use strict'

  // Seconds since the last real pass. A missing or unreadable stamp reads as 0 — the line still says who drives, which is
  // the part that matters when the stamp is the broken thing.
  function ageSeconds(tick, now) {
    if (!tick || typeof tick.at !== 'string') return 0
    const at = Date.parse(tick.at)
    if (!Number.isFinite(at)) return 0
    return Math.max(0, Math.round((now - at) / 1000))
  }

  // Seconds until the next pass, or null when the machine reports no deadline. A deadline that has already passed is 0,
  // never a negative number: "next -3s" is not a thing an operator can act on, and the line says "waiting for a tick"
  // instead.
  function nextInSeconds(tick, now) {
    if (!tick || typeof tick.next_at !== 'number' || !Number.isFinite(tick.next_at)) return null
    return Math.max(0, Math.round((tick.next_at - now) / 1000))
  }

  // The one line: `ticks: <driver> · last <N>s ago`, plus either the countdown or the overdue sentence.
  function lineText(tick, now, t) {
    if (!tick) return t('web.ticksNone')
    const head = t('web.ticksNow', { driver: tick.driver, age: ageSeconds(tick, now) })
    const next = nextInSeconds(tick, now)
    if (next === null) return head
    if (next === 0) return head + ' · ' + t('web.ticksWaiting')
    return head + ' · ' + t('web.ticksNext', { next: next })
  }

  // The tone the line carries: a paused or failed driver is the reason a flow sits still.
  function tone(tick) {
    if (!tick) return 'attention'
    return tick.active === false ? 'attention' : 'neutral'
  }

  // Everything a frame says *except* the driver line. Two frames with the same key differ only in time, which is not an
  // event and must not rebuild the sidebar.
  const STATE_FIELDS = [
    'runs', 'history', 'approvals', 'notifications', 'providers', 'version', 'language', 'web_theme', 'agent_pulse_ms',
  ]

  function frameKey(data) {
    if (!data || typeof data !== 'object') return ''
    const parts = []
    for (const field of STATE_FIELDS) parts.push(field + '=' + JSON.stringify(data[field] === undefined ? null : data[field]))
    return parts.join('\n')
  }

  global.tickLine = {
    ageSeconds: ageSeconds,
    nextInSeconds: nextInSeconds,
    lineText: lineText,
    tone: tone,
    frameKey: frameKey,
  }
})(typeof window !== 'undefined' ? window : globalThis)
