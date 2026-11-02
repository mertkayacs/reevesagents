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

// Readiness: is the composer *initialised*, not merely free of a busy marker? A provider draws its
// input box only once it has finished starting up; a fresh pane with no box yet looks exactly like a
// pane whose hint we failed to parse, and pasting into it loses the prompt (incident of 2026-11-01).
// These hints are what the provider prints inside a live composer — see the module header for the
// capture rule. A provider without a hint keeps the older, weaker behaviour: its idle classification is
// the only signal available, and the gate stays fail-closed through `detectPaneBusy` alone.
const READY_HINTS: Partial<Record<Provider, readonly RegExp[]>> = {
  // Hermes draws `❯` plus a status line; both the `ctx --` variant and the `☤ provider · …` variant
  // have been seen, so either counts. Codex draws the ask line and a `← for agents` hint.
  hermes: [/ctx\s+--/i, /^\s*☤/m],
  codex: [/Ask Codex to do anything/i, /←\s*for agents/i],
}

export type PaneReadiness = 'ready' | 'not_ready' | 'unknown'

// Combined probe: `ready` requires the idle input box *and* one of the provider's composer hints. A
// pane that shows the box but none of the hints is `not_ready` — the refusal the flow journals as
// `target_not_ready` — while a pane with no box at all stays `unknown`, which the older gate already
// refuses.
export function detectPaneReady(paneText: string, provider: Provider): PaneReadiness {
  if (!providerHasBusyDetector(provider)) return 'unknown'
  const busy = detectPaneBusy(paneText, provider)
  if (busy === 'busy') return 'unknown'   // callers check busy first; keeping them apart avoids a lie
  if (busy !== 'idle') return 'unknown'
  const hints = READY_HINTS[provider]
  if (!hints || hints.length === 0) return 'ready'
  const text = paneTail(paneText, BUSY_SCAN_LINES).join('\n')
  return hints.some(marker => marker.test(text)) ? 'ready' : 'not_ready'
}

// What an *empty* composer draws. Codex prints one fixed line; Hermes prints a rotating hint, one per locale, and every
// one of them ends in an ellipsis and mentions `/` as the command prefix — that shape is the rule, and the known strings
// are the backstop for a locale whose wording changes. Reading only Codex's line made every empty Hermes pane in a
// Russian (or Polish, or Japanese…) interface look like "somebody else's text", which is a `composer_dirty` refusal and
// no dispatch at all (D5 of the live run).
const HERMES_PLACEHOLDERS: readonly string[] = [
  'Ask anything, or type / for commands…',
  'Спросите о чём угодно или введите / для команд…',
  'Запитайте будь-що або введіть / для команд…',
  'Fragen Sie etwas oder geben Sie / für Befehle ein…',
  'Pregunta lo que quieras, o escribe / para ver los comandos…',
  'Posez une question, ou tapez / pour les commandes…',
  'Chiedi qualsiasi cosa, o digita / per i comandi…',
  'Pergunte qualquer coisa ou digite / para ver comandos…',
  'Bir şey sorun veya komutlar için / yazın…',
  'اسأل أي شيء، أو اكتب / للأوامر…',
  '随便问点什么，或输入 / 查看命令…',
  '隨便問點什麼，或輸入 / 查看指令…',
  '何でも質問するか、/ を入力してコマンドを表示…',
  '무엇이든 물어보세요. 명령은 / 를 입력하세요…',
]

function normalizeHint(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

// Is this text a hint the provider draws, rather than something somebody typed? A placeholder is never a message: it
// must not be pasted over (that is fine — pasting replaces it) and it must never be mistaken for work in progress.
export function isComposerPlaceholder(text: string, provider: Provider): boolean {
  const seen = normalizeHint(text)
  if (seen === '') return true
  if (provider === 'codex') return /^ask codex to do anything$/.test(seen)
  if (provider !== 'hermes') return false
  if (HERMES_PLACEHOLDERS.some(known => normalizeHint(known) === seen)) return true
  // The structural half, so a new locale or a reworded hint does not need a release: an invitation to use commands ends
  // in an ellipsis and names the slash prefix.
  // The ellipsis must end the line: a hint with somebody's text appended is somebody's text, not a hint.
  return /(?:…|\.\.\.)$/.test(seen) && seen.includes('/')
}

// The text currently sitting in the input box, with the prompt marker removed. `null` when no input
// line can be identified at all — the caller must then refuse rather than guess.
export function composerText(paneText: string, provider: Provider): string | null {
  if (!providerHasBusyDetector(provider)) return null
  const lines = paneTail(paneText, BUSY_SCAN_LINES)
  const marker = provider === 'hermes' ? /^\s*❯\s?/ : provider === 'codex' ? /^\s*›\s?/ : null
  if (!marker) return null
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]!
    if (!marker.test(line)) continue
    // A placeholder is not typed text: what an *empty* composer draws is not somebody's unsent prompt.
    const rest = line.replace(marker, '').trim()
    if (isComposerPlaceholder(rest, provider)) return ''
    return rest
  }
  return null
}

// tmux draws a position badge (`[12/345]`) in the top-right corner while a pane is in copy mode; in
// that mode keystrokes scroll instead of typing, so an Enter would never submit. The badge is the only
// marker a raw capture carries, hence the heuristic — and a pane that scrolls instead of typing is
// caught again by the readiness probe after the cancel.
const COPY_MODE_PATTERN = /\[\d+\/\d+\]/

export function paneInCopyMode(paneText: string): boolean {
  return COPY_MODE_PATTERN.test(stripAnsi(paneText))
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
