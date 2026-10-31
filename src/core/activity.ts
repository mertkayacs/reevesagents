// Busy detection: is this agent still working?
//
// Input: the last lines of a pane (a raw capture; ANSI is stripped here). Output: one of
// 'busy' | 'idle' | 'unknown'.
//
// Invariant: 'unknown' is never 'idle'. Every automated write goes through a fail-closed gate:
// a provider whose busy indicator has not been observed on a live pane reports 'unknown', and
// the gate refuses. A heuristic that answers "free" for an unverified provider looks like
// protection while providing none, and the failure it hides is a prompt pasted into a working
// agent — which the provider then submits on its own next Enter.
//
// Why pane text: no provider CLI exposes a machine-readable "I am working" state, so the only
// surface true for every provider is what it draws.

import stripAnsi from 'strip-ansi'
import type { Provider } from './types.js'

export type PaneBusyState = 'busy' | 'idle' | 'unknown'

// Provider status lines sit at the bottom of the pane. Scrollback keeps the hint of earlier
// turns, so a wider window keeps reporting busy long after the agent went idle — this was
// measured on a live tmux pane: with a 12-line window an idle agent still matched.
export const BUSY_TAIL_LINES = 3

// How much of the pane a caller should capture before this module trims it to the tail. The
// modal/footer area of every provider fits well inside 40 lines.
export const BUSY_SCAN_LINES = 40

// Markers verified on a live pane. A provider missing here has no detector and is 'unknown'.
const BUSY_MARKERS: Partial<Record<Provider, readonly RegExp[]>> = {
  // Hermes prints an interrupt hint in its footer; the hint is localized, so both spellings
  // that have been observed are listed.
  hermes: [/esc\s+to\s+interrupt/i, /enter\s+(?:чтобы\s+)?прервать/i],
  // Codex CLI prints "Working (8s • esc to interrupt)" while it works.
  codex: [/esc\s+to\s+interrupt/i],
}

export function providerHasBusyDetector(provider: Provider): boolean {
  return (BUSY_MARKERS[provider]?.length ?? 0) > 0
}

// The providers this build can gate safely; the CLI prints this list when it refuses.
export function busyProviders(): Provider[] {
  return Object.keys(BUSY_MARKERS).filter((provider): provider is Provider => BUSY_MARKERS[provider as Provider] !== undefined)
}

// Last `count` non-empty rendered lines, ANSI stripped. Empty rows are dropped first because
// `tmux capture-pane` pads the pane to its full height: "last 3 lines" would otherwise mean
// "3 blank rows".
export function paneTail(paneText: string, count = BUSY_TAIL_LINES): string[] {
  const lines = stripAnsi(paneText)
    .split('\n')
    .map(line => line.replace(/\r/g, '').trim())
    .filter(line => line !== '')
  return count > 0 ? lines.slice(-count) : lines
}

export function detectPaneBusy(paneText: string, provider: Provider): PaneBusyState {
  const markers = BUSY_MARKERS[provider]
  // No verified marker for this provider, or nothing captured at all: refuse to guess.
  if (!markers || markers.length === 0) return 'unknown'
  const tail = paneTail(paneText)
  if (tail.length === 0) return 'unknown'
  const text = tail.join('\n')
  return markers.some(marker => marker.test(text)) ? 'busy' : 'idle'
}
