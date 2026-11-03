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
//
// The asymmetry is deliberate (block 73): a busy marker counts **anywhere in the captured frame**, while an idle verdict
// needs the composer *in its place*. A stale busy line costs a hold; a missed one costs a turn that our paste interrupted.
//
// The glyph is not the only way to a composer. On 2026-11-03 a live codex pane sat with the placeholder and the footer
// drawn but without the `›` in front of it (a redraw put it back), and the engine held on `review_pane_unknown` for ten
// minutes. The frame was complete; only the glyph was missing. So a pane is idle when either the glyph is there, or the
// placeholder sits exactly where the composer belongs, under the provider's own footer, with no busy marker anywhere —
// confirmed by a second capture a second later (see `inspectPane`).

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

// The fallback below is only an answer when the same frame has been seen twice: a redraw between two captures is exactly
// the transition that must not be read as "free".
export const CONFIRM_MIN_GAP_MS = 1_000

// How far above the status tail the status block reaches. Codex prints `◦ Working (… • esc to interrupt)` above the box and
// may wrap it onto a second row; hermes carries `enter прервать` on the box row itself and on the status bar under it. Four
// rows at the bottom is the block; nothing else in the frame is read for busy (block 74), because everything above it is the
// agent's own prose — a report quoting `esc to interrupt` held a free `flow-finish` pane for six minutes.
export const BUSY_STATUS_MARGIN = 1

// The shape of those status rows, per provider: codex leads with its working glyph at the left margin, hermes puts the
// interruption word on its status bar (or on the box row it takes over while a turn runs). A hint that is not on a row of
// this shape is a sentence the agent printed — its own report quoting the hint, a diff quoting it, a log — and a pane free
// of a turn is not busy because of it (block 74).
const BUSY_SHAPE: Partial<Record<Provider, RegExp>> = {
  // Codex prints a glyph, a status verb and its parenthesised progress — `◦ Working (8s • esc to interrupt)`, or the same line
  // cut by the pane's width after `esc to`. A report bullet that merely *quotes* the line carries prose after the parenthesis
  // (`• Working (8s • esc to interrupt) was what it printed`) and is not the status shape: matching any leading bullet read a
  // free pane busy (block 74, review round 1).
  codex: /^[◦●•·]\s+(?:Working|Thinking|Running|Waiting)\s*\([^)]*(?:\)\s*)?$/i,
  hermes: /^\s*(?:☤|❯|─{2,})/,
}

interface ProviderSignals {
  // Verified on a live pane: the hint a provider prints while a turn runs.
  busy: readonly RegExp[]
  // Verified on a live pane: the input box it draws while waiting for input. Multi-line,
  // because the tail is joined into one string before matching.
  idle: readonly RegExp[]
  // The marker that introduces the composer row, when the provider draws one.
  marker: RegExp
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
    marker: /^\s*❯\s?/,
  },
  codex: {
    // Status line while a turn runs: "◦ Working (8s • esc to interrupt)".
    busy: [/esc\s+to\s+interrupt/i],
    // Idle input box: "› Ask Codex to do anything" or a bare "› ".
    idle: [/^\s*›(?:\s|$)/m],
    marker: /^\s*›\s?/,
  },
}

export function providerHasBusyDetector(provider: Provider): boolean {
  return SIGNALS[provider] !== undefined
}

import { COMPOSER_HINTS } from './composer-hints.js'

// The providers whose panes can be classified at all; the CLI prints this list when it refuses
// a provider instead of running unguarded.
export function gatedProviders(): Provider[] {
  return Object.keys(SIGNALS).filter((provider): provider is Provider => SIGNALS[provider as Provider] !== undefined)
}

// Last `count` non-empty rendered lines, ANSI stripped. Empty rows are dropped first because
// `tmux capture-pane` pads the pane to its full height: "last 3 lines" would otherwise mean
// "3 blank rows".
export function paneTail(paneText: string, count = BUSY_TAIL_LINES): string[] {
  const lines = renderedLines(paneText)
  return count > 0 ? lines.slice(-count) : lines
}

// What the pane draws, line by line, with the terminal chrome removed and blank rows dropped. One reader for every
// classifier below, so "the same frame" means the same thing everywhere.
function renderedLines(paneText: string): string[] {
  return rawRenderedLines(paneText).map(line => line.trim())
}

// The same rows, untrimmed: a composer draws its continuation lines inside the box, indented, while a finished turn's prose
// starts at the left margin. That is the only thing in plain text that separates the two (see `composerGlyph`).
function rawRenderedLines(paneText: string): string[] {
  return stripAnsi(paneText)
    .split('\n')
    .map(line => line.replace(/\r/g, ''))
    .filter(line => line.trim() !== '')
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

// Lines that are chrome rather than the composer: the provider's model line, its footer, a rule, a status glyph. A pane
// whose composer is missing usually shows one of these where the composer belongs.
//
// Status glyphs (`◦`, `•`, `●`, `·`) are *not* here: a pasted brief may be Markdown and open a line with a bullet, and
// treating that as chrome stopped the composer walk in the middle of the box (block 73, review round 2). At the left margin
// such a row is transcript (`TRANSCRIPT_LINE`) and is handled with the margin it needs.
const CHROME_LINE = /^(?:☤|─{5,}|←\s*for agents|(?:GPT-|Claude|DeepSeek|Hermes|Kimi|GLM)\b.*·)/i

function isChrome(line: string): boolean {
  return CHROME_LINE.test(line)
}

// Where the composer sits: the last non-chrome row in the bottom of the frame, under (at most) a couple of chrome rows.
// The search is bounded on purpose — a "composer" found in the middle of a log is a sentence that happens to look like a
// placeholder, and reading it as the input box is how a prompt would be pasted over a working pane.
const COMPOSER_WINDOW = 4

function composerRow(lines: string[]): { line: string, index: number } | null {
  const start = Math.max(0, lines.length - COMPOSER_WINDOW)
  for (let index = lines.length - 1; index >= start; index -= 1) {
    const line = lines[index]!
    if (isChrome(line)) continue
    return { line, index }
  }
  return null
}

// A dialog's own frame: the block and box glyphs both providers draw around a modal, which replaces the composer instead of
// sitting over it. A marker separated from the composer row by one of these is a marker from an earlier turn.
const DIALOG_LINE = /^\s*[▌▐╭╮╰╯│┌┐└┘├┤]/

// A finished turn's output rather than the box's own text: the answer bullets both CLIs print (`•`, `◦`, `●`, `⏺`, `·`), a
// tool ledger row (`│`, `├`), a diff line, and the vocabulary a review turn ends with (`VERDICT:`, a `MAJOR:`/`MINOR:`/`NIT`
// finding). A marker above one of those introduces an earlier turn, not this composer: the walk stops there (block 73, review
// round 1, second pass).
//
// **At the left margin only.** A brief pasted into the box may be Markdown and may carry its own `- item` bullets and diff
// rows; those are indented to the box's text column like every other continuation row, and a regex that allowed leading
// whitespace stopped the walk inside the composer and left an idle pane `unknown` (block 73, review round 2).
const TRANSCRIPT_LINE = /^(?:[•◦●⏺·]\s|[│├┃]|VERDICT:|(?:MAJOR|MINOR|NIT)\b|[-+]\s|>|```)/

// The column a composer's continuation rows are drawn at: the marker row is `marker + space + text`, so the box's own text
// starts two columns in, and every continuation row — including Markdown bullets and diff rows of a pasted brief — is
// indented at least that far. A finished turn's output starts further left.
const COMPOSER_TEXT_COLUMN = 2


// Is the marker that introduces this composer block on screen? The block is the rows between the marker and the composer row:
// its own text and nothing else. Bounded, because a frame is not a document.
//
// The walk stops at anything that is not the box's own text — a chrome row, a dialog's frame, or a line of a finished turn's
// output. Only the first two were enough for the modal case; a stale `›` followed by an answer and a `VERDICT:` line still
// reached the composer row through ordinary prose and was read as a live glyph (block 73, review round 1, second pass). A
// marker that close to transcript content is not this composer's, so the pane falls through to the placeholder path and its
// confirming second capture — `unknown` until the frame is seen twice, never `idle` on one look.
const COMPOSER_BLOCK_MAX = 200

function composerGlyph(lines: string[], raw: string[], signals: ProviderSignals, row: number): boolean {
  const marked = (index: number): boolean => index >= 0 && signals.idle.some(marker => marker.test(lines[index]!))
  if (marked(row)) return true
  for (let index = row - 1; index >= 0 && row - index <= COMPOSER_BLOCK_MAX; index -= 1) {
    const line = lines[index]!
    // Transcript is matched against the untrimmed row: "at the left margin" is the whole point of the test, and the trimmed
    // view has already thrown the margin away.
    if (isChrome(line) || DIALOG_LINE.test(line) || TRANSCRIPT_LINE.test(raw[index] ?? '')) return false
    if (marked(index)) return true
    // A row further left than the box's own text column is a finished turn's output that carries no marker of its own — the
    // box draws every continuation row (its pasted Markdown bullets included) at the column of its first line of text.
    // Without this, plain prose between a stale `›` and a composer that drew no glyph walked the whole way up and called the
    // pane idle (block 73, review round 1, second pass).
    if (indentOf(raw[index] ?? '') < COMPOSER_TEXT_COLUMN) return false
  }
  return false
}

// Is there transcript between this status row and the composer row? A turn's status line sits straight above the box; a line of
// the agent's own report that happens to look like it — a quotation of `◦ Working (… • esc to interrupt)` — has the rest of the
// report between itself and the box.
function separatedFromComposer(
  lines: string[],
  raw: string[],
  statusRow: number,
  composer: { index: number } | null,
): boolean {
  if (composer === null) return false
  const from = Math.min(statusRow, composer.index)
  const to = Math.max(statusRow, composer.index)
  for (let index = from + 1; index < to; index += 1) {
    if (TRANSCRIPT_LINE.test(raw[index] ?? '') || DIALOG_LINE.test(lines[index] ?? '')) return true
  }
  return false
}

function indentOf(rawLine: string): number {
  return rawLine.length - rawLine.replace(/^\s+/, '').length
}

// What the composer draws when it is empty, with the provider's marker removed if it is there.
function composerLineText(line: string, provider: Provider): string {
  const marker = SIGNALS[provider]?.marker
  return (marker ? line.replace(marker, '') : line).trim()
}

// What an *empty* composer draws. Codex prints one fixed line; Hermes prints a rotating hint in the interface language,
// so "empty" can only be decided against the catalogue of hints the TUI itself ships (`composer-hints.ts`). The
// structural shortcut that used to live here — "an ellipsis and a `/`" — also matched `Please inspect ./src/a.ts…` and
// would have pasted a prompt over a human's draft (block 22, A2), so it is gone: a known hint is a placeholder,
// everything else is text.
const KNOWN_HINTS: ReadonlySet<string> = new Set(COMPOSER_HINTS.map(normalizeHint))

function normalizeHint(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

// Is this text a hint the provider draws, rather than something somebody typed? A placeholder is never a message: it
// may be pasted over, and it must never be mistaken for work in progress. Unknown text — including a reworded hint in a
// locale this build has never seen — is text, because a wrong "empty" destroys what a human wrote.
export function isComposerPlaceholder(text: string, provider: Provider): boolean {
  const seen = normalizeHint(text)
  if (seen === '') return true
  if (provider === 'codex') return /^ask codex to do anything$/.test(seen)
  if (provider !== 'hermes') return false
  return KNOWN_HINTS.has(seen)
}

// The text currently sitting in the input box, with the prompt marker removed. `null` when no input
// line can be identified at all — the caller must then refuse rather than guess.
export function composerText(paneText: string, provider: Provider): string | null {
  if (!providerHasBusyDetector(provider)) return null
  const lines = renderedLines(paneText)
  const marker = SIGNALS[provider]!.marker
  // The composer is the block whose first line carries the marker and whose last line sits just above the status line — not "the
  // last marked line in the tail". A long paste occupies many rows between the two; searching a forty-row window found nothing
  // and reported `unknown` while the text was on screen (block 44).
  const status = ((): number => {
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index]!
      if (/^\s*☤/.test(line) || /←\s*for agents/i.test(line)) return index
    }
    return lines.length
  })()
  let start = -1
  for (let index = status - 1; index >= 0; index -= 1) {
    if (marker.test(lines[index]!)) {
      start = index
      break
    }
  }
  if (start < 0) {
    // No glyph anywhere: the pane may simply not have drawn it (block 73). The composer is still the row where it belongs,
    // and reading *that* is what keeps a missing glyph from looking like a missing composer. Text found there is treated
    // as somebody's draft — the caller refuses to paste over it — and the empty placeholder reads as empty.
    const composer = composerRow(lines)
    if (composer === null) return null
    const text = composerLineText(composer.line, provider)
    if (isComposerPlaceholder(text, provider)) return ''
    return text
  }
  // The block ends at the first line that is chrome, not text: the provider's model line, its footer or a rule. Without this the
  // model line under a one-line composer (`› Ask Codex to do anything` over `GPT-… high · …`) reads as typed text.
  const chrome = /^\s*(?:☤|─{5,}|[◦●•·]\s)|←\s*for agents|^\s*(?:GPT-|Claude|DeepSeek|Hermes|Kimi|GLM)\b.*·/i
  let end = status
  for (let index = start + 1; index < status; index += 1) {
    if (chrome.test(lines[index]!)) {
      end = index
      break
    }
  }
  const block = lines.slice(start, end)
  const rest = [block[0]!.replace(marker, '').trim(), ...block.slice(1).map(line => line.trim())]
    .filter(line => line !== '')
    .join(' ')
    .trim()
  // A placeholder is not typed text: what an *empty* composer draws is not somebody's unsent prompt.
  if (isComposerPlaceholder(rest, provider)) return ''
  return rest
}

// Lines that show the agent did something: a tool call, a shell line, a file edit. Used as a second, independent signal of
// a confirmed dispatch — a pane that never prints a busy marker still shows its ledger (block 23, D9).
const WORK_LINE_PATTERN = /^(?:\s*[│|]?\s*[●◦•·]\s|\s*[│|]\s*(?:run|exec|shell|read|write|edit|grep|search)\b)|\bexec_command\b|\brun_shell\b|💻|\$ /iu

export function countWorkLines(paneText: string): number {
  return stripAnsi(paneText).split('\n').filter(line => WORK_LINE_PATTERN.test(line)).length
}

// tmux draws a position badge (`[12/345]`) in the top-right corner while a pane is in copy mode; in
// that mode keystrokes scroll instead of typing, so an Enter would never submit. The badge is the only
// marker a raw capture carries, hence the heuristic — and a pane that scrolls instead of typing is
// caught again by the readiness probe after the cancel.
const COPY_MODE_PATTERN = /\[\d+\/\d+\]/

export function paneInCopyMode(paneText: string): boolean {
  return COPY_MODE_PATTERN.test(stripAnsi(paneText))
}

// A frame a caller can compare with the next one: the composer, its footer and the rows between them. The whole frame is
// not used on purpose — a log line scrolling above the composer must not read as "the pane changed".
function paneFingerprint(lines: string[]): string {
  return lines.slice(-(BUSY_TAIL_LINES + 2)).join('\n')
}

export interface PaneSample {
  // Epoch ms of the capture that produced this fingerprint.
  at: number
  fingerprint: string
}

// Why a pane is not idle, in a code the journal can print: what was looked for and not found (block 73). `busy_hint` and
// `composer_glyph` / `composer_placeholder` are the positive answers.
export type PaneReason =
  | 'busy_hint'
  | 'composer_glyph'
  | 'composer_placeholder'
  | 'no_detector'
  | 'empty_capture'
  | 'copy_mode'
  | 'composer_not_found'
  | 'footer_absent'
  | 'placeholder_absent'
  | 'placeholder_pending'
  | 'samples_disagree'

export interface PaneInspection {
  state: PaneBusyState
  reason: PaneReason
  // The frame, for a caller that wants to look again a second later and confirm it.
  sample: PaneSample
}

// One look at the pane. The priorities are the contract (blocks 73 and 74):
//   1. a busy marker **on the status rows around the composer** → busy;
//   2. copy mode, no composer, an incomplete frame → unknown;
//   3. the old glyph, where the composer is → idle (a long paste pushes the marked line above the tail window, block 44);
//   4. the exact placeholder where the composer belongs, under the provider's own footer, with no busy marker → idle, but
//      only when the previous sample is the same frame at least `CONFIRM_MIN_GAP_MS` old;
//   5. anything else → unknown. Unknown never turns into idle with time.
export function inspectPane(
  paneText: string,
  provider: Provider,
  options: { previous?: PaneSample | null, now?: number } = {},
): PaneInspection {
  const now = options.now ?? Date.now()
  const signals = SIGNALS[provider]
  if (!signals) return { state: 'unknown', reason: 'no_detector', sample: { at: now, fingerprint: '' } }
  const whole = stripAnsi(paneText)
  const lines = renderedLines(paneText)
  const sample: PaneSample = { at: now, fingerprint: paneFingerprint(lines) }
  if (lines.length === 0) return { state: 'unknown', reason: 'empty_capture', sample }

  // 1. Busy first, but only where the provider prints it — its status rows around the composer. The body of a pane is prose:
  //    an agent may quote `◦ Working (… • esc to interrupt)` or `enter прервать` in a report, a diff or a log, and that must
  //    not hold the flow. On 2026-11-03 the live `flow-finish` flow read `dev_pane: busy` on a free pane for six minutes
  //    because two such lines sat in the last forty rows (block 74). The status rows are joined as well, because a narrow
  //    pane wraps the hint onto a second row.
  const composer = composerRow(lines)
  // The status block: the bottom rows where the provider draws its status, not the whole frame. A fixed window rather than an
  // offset from the composer row, because a narrow pane wraps its status bar onto a second row and the row under the box is
  // then neither chrome nor box text.
  const statusStart = Math.max(0, lines.length - (BUSY_TAIL_LINES + BUSY_STATUS_MARGIN))
  const statusRows = lines.slice(statusStart)
  // The hint counts only on a row of the shape the provider draws it on, and only from that row downwards — which is also how
  // a wrapped status line is read: `◦ Working (3s • esc to` over `interrupt)` is one hint, split by the pane's width. A
  // three-row fragment has no status block to speak of; what it shows is read the conservative way.
  const shape = lines.length > BUSY_TAIL_LINES ? BUSY_SHAPE[provider] : null
  const statusIndex = shape ? statusRows.findIndex(statusLine => shape.test(statusLine)) : 0
  // The status row belongs to this composer only when no transcript sits between the two: a report that quotes the working
  // line — exactly, in the bottom rows — has the rest of the report under it, and that is what separates the two (block 74,
  // review round 1). A wrapped status line keeps its second half in between, which is neither transcript nor a dialog.
  const quoted = statusIndex >= 0 && separatedFromComposer(lines, rawRenderedLines(paneText), statusStart + statusIndex, composer)
  if (statusIndex >= 0 && !quoted) {
    const fromStatus = statusRows.slice(statusIndex)
    const statusText = fromStatus.join(' ')
    if (signals.busy.some(marker => marker.test(fromStatus[0]!) || marker.test(statusText))) {
      return { state: 'busy', reason: 'busy_hint', sample }
    }
  }

  // 2. Structure. A pane in copy mode scrolls instead of typing, and a frame with neither a composer nor a footer is not a
  //    finished screen — a modal, a login prompt or a half-drawn redraw all look like that.
  if (paneInCopyMode(whole)) return { state: 'unknown', reason: 'copy_mode', sample }
  if (composer === null) return { state: 'unknown', reason: 'composer_not_found', sample }
  const row = composer.line

  // 3. The glyph, but only where the composer is. The box's marker introduces a block of rows that runs down to the composer
  //    row with nothing but the box's own text in between — one row for a draft, thirty for a brief that was pasted and not
  //    sent (block 44). A `›` from an earlier turn is separated from the current composer by the answer that followed it: a
  //    rule, a status glyph or a dialog's own frame. Reading such a marker as the composer turned a pane with a modal over
  //    its input box into `idle`, and a paste landed on a pane that had no composer at all (block 73, review round 1).
  if (composerGlyph(lines, rawRenderedLines(paneText), signals, composer.index)) {
    return { state: 'idle', reason: 'composer_glyph', sample }
  }

  // 4. The fallback: the placeholder in the composer's place, the provider's own footer **under it**, no busy marker, and the
  //    same frame seen twice. Every one of those is required — the absence of a busy marker alone proves nothing, and a
  //    footer looked for anywhere would match the placeholder itself (codex's ask line is one of its own hints).
  const footer = READY_HINTS[provider]
  if (!footer || footer.length === 0) return { state: 'unknown', reason: 'footer_absent', sample }
  const below = lines.slice(composer.index + 1).join('\n')
  if (!footer.some(marker => marker.test(below))) return { state: 'unknown', reason: 'footer_absent', sample }
  if (!isComposerPlaceholder(composerLineText(row, provider), provider)) {
    return { state: 'unknown', reason: 'placeholder_absent', sample }
  }
  const previous = options.previous ?? null
  if (!previous || previous.fingerprint !== sample.fingerprint || sample.at - previous.at < CONFIRM_MIN_GAP_MS) {
    return { state: 'unknown', reason: 'placeholder_pending', sample }
  }
  return { state: 'idle', reason: 'composer_placeholder', sample }
}

// The plain verdict, for the callers that only need the state. A `placeholder_pending` frame reads as `unknown` here: the
// confirmation needs a second capture, which is the runtime's job (`paneBusy`) and not something this pure function can
// invent.
export function detectPaneBusy(
  paneText: string,
  provider: Provider,
  options: { previous?: PaneSample | null, now?: number } = {},
): PaneBusyState {
  return inspectPane(paneText, provider, options).state
}

export type PaneReadiness = 'ready' | 'not_ready' | 'unknown'

// Combined probe: `ready` requires the idle input box *and* one of the provider's composer hints. A
// pane that shows the box but none of the hints is `not_ready` — the refusal the flow journals as
// `target_not_ready` — while a pane with no box at all stays `unknown`, which the older gate already
// refuses.
//
// `state` lets a caller pass the verdict it already paid for (the runtime confirms the fallback with a second capture, and
// asking again here would throw that confirmation away).
export function detectPaneReady(
  paneText: string,
  provider: Provider,
  options: { state?: PaneBusyState } = {},
): PaneReadiness {
  if (!providerHasBusyDetector(provider)) return 'unknown'
  const busy = options.state ?? detectPaneBusy(paneText, provider)
  if (busy === 'busy') return 'unknown'   // callers check busy first; keeping them apart avoids a lie
  if (busy !== 'idle') return 'unknown'
  const hints = READY_HINTS[provider]
  if (!hints || hints.length === 0) return 'ready'
  const text = paneTail(paneText, BUSY_SCAN_LINES).join('\n')
  return hints.some(marker => marker.test(text)) ? 'ready' : 'not_ready'
}
