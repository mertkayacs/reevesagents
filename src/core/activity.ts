// Busy detection: is this agent ready to receive a prompt?
//
// Input: the last lines of a pane (a raw capture; ANSI is stripped here). Output: one of
// 'busy' | 'idle' | 'unknown'.
//
// Invariant: 'idle' requires a **positive** signal. A pane that shows neither the provider's
// busy hint nor its input box is 'unknown', and the gate refuses. "No busy marker visible" is
// not evidence of an idle agent: a login screen, an error, a blocking modal or a half-drawn
// frame all look like that, and every one of them must stop an automated write. A gate that
// answers "free" when it cannot tell is worse than no gate — it looks like protection.
//
// Why pane text: no provider CLI exposes a machine-readable state, so the only surface true for
// every provider is what it draws.

import stripAnsi from 'strip-ansi'
import type { Provider } from './types.js'

export type PaneBusyState = 'busy' | 'idle' | 'unknown'

// Provider status and input lines sit at the bottom of the pane. Scrollback keeps the hint of
// earlier turns, so a wider window keeps reporting busy long after the agent went idle — this
// was measured on a live pane: with a 12-line window an idle agent still matched.
export const BUSY_TAIL_LINES = 3

// How much of the pane a caller should capture before this module trims it to the tail. The
// footer of every provider fits well inside 40 lines.
export const BUSY_SCAN_LINES = 40

interface ProviderSignals {
  // Verified on a live pane: the hint a provider prints while a turn runs.
  busy: readonly RegExp[]
  // Verified on a live pane: the input box it draws while waiting for input. Multi-line,
  // because the tail is joined into one string before matching.
  idle: readonly RegExp[]
}

// Every regex below was read off a real pane of that provider on this machine; none of it is
// inferred from documentation. A provider missing from this map has no verified signal, and its
// panes are 'unknown'.
const SIGNALS: Partial<Record<Provider, ProviderSignals>> = {
  hermes: {
    // Status line while a turn runs: "… enter прервать · tab в очередь · ctrl+c стоп"
    // (an English build prints "esc to interrupt").
    busy: [/enter\s+(?:чтобы\s+)?прервать/i, /esc\s+to\s+interrupt/i],
    // Idle input box, drawn as "❯ <text or placeholder>" above the status line.
    // A bare prompt (no text typed yet) trims to "❯", so the marker allows end of line.
    idle: [/^\s*❯(?:\s|$)/m],
  },
  codex: {
    // Status line while a turn runs: "◦ Working (8s • esc to interrupt)".
    busy: [/esc\s+to\s+interrupt/i],
    // Idle input box: "› Ask Codex to do anything" or a bare "› ".
    idle: [/^\s*›(?:\s|$)/m],
  },
}

export function providerHasBusyDetector(provider: Provider): boolean {
  return SIGNALS[provider] !== undefined
}

// The providers whose panes can be classified at all; the CLI prints this list when it refuses
// a provider instead of running unguarded.
export function gatedProviders(): Provider[] {
  return Object.keys(SIGNALS).filter((provider): provider is Provider => SIGNALS[provider as Provider] !== undefined)
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
  const signals = SIGNALS[provider]
  // No verified signals for this provider, or nothing captured: refuse to guess.
  if (!signals) return 'unknown'
  const tail = paneTail(paneText)
  if (tail.length === 0) return 'unknown'
  const text = tail.join('\n')
  // Busy first: while a turn runs both providers still draw an input box, so the idle signal is
  // present in both states and only the busy hint separates them.
  if (signals.busy.some(marker => marker.test(text))) return 'busy'
  if (!signals.idle.some(marker => marker.test(text))) return 'unknown'
  return 'idle'
}
