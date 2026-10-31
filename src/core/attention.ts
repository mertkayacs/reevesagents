// Attention detection: is this agent blocked on a human?
// Input: the last lines of an agent's tmux pane. Output: an AttentionState or null.
// Invariant: detection is a pure read of pane text. The sweep writes only the agent
// record's `attention` field, and only when the detected state actually changes, so the
// registry (and the SSE stream built from it) never churns on every poll.
//
// Why pane text: none of the provider CLIs expose a machine-readable "I am waiting for a
// human" state. Hermes, Claude Code and Codex all render a blocking overlay in their own
// TUI, so the pane is the only surface that is true for every provider.

import { execTmux, paneInSession, realDriver } from './tmux.js'
import { redactSecrets } from './redact.js'
import { listAgents, listRuns, updateAgent } from './runs.js'
import type { AgentRecord, AttentionReason, AttentionState, Provider } from './types.js'

// How much pane history a detector may look at. The status area is the last few lines;
// the modal frame and its options sit right above it.
export const SCAN_LINES = 40

export interface DetectedAttention {
  reason: AttentionReason
  detail: string
}

export type AttentionDetector = (_pane: string) => DetectedAttention | null

// Box drawing used by the blocking modal (top-left and bottom-left corners).
const BOX_CORNER = /[╭╰]/
// A numbered, selectable option inside the modal: "│ ❯ 1. Разрешить один раз".
const NUMBERED_OPTION = /^\s*[│┃|]\s*(?:❯\s*)?\d+\.\s+\S/
// The navigation hint under the modal, plus its answer countdown.
const NAV_HINT = /↑\/↓/
const ANSWER_COUNTDOWN = /\(\s*\d+\s*s\s*\)/

// Multilingual keyword sets. Hermes localizes its prompts (10 languages), and the
// operator may run agents in any of them, so classification cannot key on English.
const APPROVAL_WORDS = [
  'approv', 'approb', 'одобр', 'разреш', 'отклон', 'опасн',
  'genehmig', 'freigabe', 'aprob', 'onay', 'الموافق', '批准', '危险',
  'consent', 'dangerous', 'risky', 'pericoloso', 'rischioso', 'tehlike',
]
const QUESTION_WORDS = [
  'вопрос', 'question', 'frage', 'pregunta', 'pergunta', 'domanda', 'soru', '问题', 'سؤال',
]

function stripAnsi(text: string): string {
  // CSI/OSC/escape sequences, then a stray CR left by full-frame repaints. Matching control
  // characters is the whole point here, so the lint rule is off for these two lines only.
  /* eslint-disable no-control-regex */
  return text
    .replace(/\u001b\][^\u0007]*\u0007/g, '')
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\r/g, '')
  /* eslint-enable no-control-regex */
}

function cleanBoxLine(line: string): string {
  return line.replace(/^[\s│┃|╭╮╰╯─━═]+/, '').replace(/[\s│┃|╭╮╰╯─━═]+$/, '').trim()
}

function truncate(text: string, max = 140): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function containsAny(haystack: string, needles: string[]): boolean {
  const lower = haystack.toLowerCase()
  return needles.some(needle => lower.includes(needle))
}

/**
 * Hermes (`hermes chat`): a blocking approval / clarify / sudo modal, or a gate that never
 * reached the UI. Detection is deliberately limited to panes that *block*.
 *
 * The modal is matched structurally (box corner + numbered option + ↑/↓ hint + countdown)
 * so it works in every UI language; keywords only decide *which* kind of prompt it is.
 */
export function detectHermesAttention(paneText: string): DetectedAttention | null {
  const lines = stripAnsi(paneText).split('\n')
  // `tmux capture-pane` pads the pane to its full height, so the real tail sits above a
  // run of blank rows. Drop those first, or "last 4 lines" means "4 empty rows".
  while (lines.length > 0 && (lines[lines.length - 1] ?? '').trim() === '') lines.pop()
  const tail = lines.slice(-SCAN_LINES)
  const text = tail.join('\n')

  const hasModal = BOX_CORNER.test(text)
    && tail.some(line => NUMBERED_OPTION.test(line))
    && NAV_HINT.test(text)
    && ANSWER_COUNTDOWN.test(text)

  if (hasModal) {
    // Scope the body to the modal that is actually open: from its own top corner to the
    // first option. Taking the whole tail would let an older question still visible above
    // the box ("…10 или 20?") turn an approval prompt into an answer prompt.
    const optionIndex = tail.findIndex(line => NUMBERED_OPTION.test(line))
    let bodyStart = 0
    for (let i = (optionIndex === -1 ? tail.length : optionIndex) - 1; i >= 0; i -= 1) {
      if (BOX_CORNER.test(tail[i] ?? '')) { bodyStart = i + 1; break }
    }
    const body = tail.slice(bodyStart, optionIndex === -1 ? tail.length : optionIndex)
      .map(cleanBoxLine)
      .filter(line => line.length > 0 && !line.startsWith('⚠'))
    const detail = body.length > 0 ? body[body.length - 1]! : ''
    // A modal that asks a question (clarify picker) is not an approval, whatever the UI
    // language: the question mark lives in the prompt body, above the options.
    const bodyText = body.join(' ')
    const asksQuestion = bodyText.includes('?') || bodyText.includes('？')
    const reason: AttentionReason = asksQuestion
      ? 'input'
      : containsAny(text, APPROVAL_WORDS)
      ? 'approval'
      : containsAny(text, QUESTION_WORDS)
      ? 'input'
      : 'approval'
    return { reason, detail: truncate(detail) }
  }

  // A dangerous command that was refused before any UI could ask: the turn is over and
  // the agent is waiting for a human to re-approve.
  if (/BLOCKED:\s*Command was not approved/i.test(text)) {
    return { reason: 'approval', detail: truncate('command was blocked, no approval could be delivered') }
  }

  // Deliberately no heuristic for "the last line ends with a question": a finished turn
  // that asks something is indistinguishable from one whose answer is already sitting in
  // the input box (the TUI keeps the old question on screen), so it produced badges that
  // hung after the operator had answered. Attention is only for panes that *block*.
  return null
}

// Codex CLI: its approval prompt is a flat choice list, no box frame. Matched on the
// question line plus the "Press enter to confirm" hint, so a numbered list in ordinary
// agent output cannot be mistaken for a prompt.
const CODEX_PROMPT_QUESTION = /Would you like to run the following command\?/i
const CODEX_PROMPT_HINT = /Press enter to confirm or esc to cancel/i
const CODEX_SELECTED_OPTION = /^\s*[›>]\s*1\.\s+\S/
const CODEX_OPTION = /^\s*\d+\.\s+\S/

/**
 * Codex CLI (`codex`): its approval prompt ("Would you like to run the following
 * command?" with numbered options and a `Press enter to confirm` footer). Codex has no
 * clarify picker, so this is the only blocking state it raises.
 */
export function detectCodexAttention(paneText: string): DetectedAttention | null {
  const lines = stripAnsi(paneText).split('\n')
  while (lines.length > 0 && (lines[lines.length - 1] ?? '').trim() === '') lines.pop()
  const tail = lines.slice(-SCAN_LINES)
  const text = tail.join('\n')

  const isChoiceList = tail.some(line => CODEX_SELECTED_OPTION.test(line))
    && tail.some(line => CODEX_OPTION.test(line))
    && CODEX_PROMPT_HINT.test(text)
  if (!CODEX_PROMPT_QUESTION.test(text) && !isChoiceList) return null

  // The command being asked about is the most useful thing to show on the tile; fall back
  // to the model's stated reason, then to a generic label.
  const trimmed = tail.map(line => line.trim())
  const command = trimmed.find(line => line.startsWith('$ ') && line.length > 2)
  const reason = trimmed.find(line => line.startsWith('Reason:'))
  const detail = command ?? reason ?? 'codex is waiting for command approval'
  return { reason: 'approval', detail: truncate(detail) }
}

// OpenCode: "△ Permission required" with a kind line and a button row ("Allow once
// Allow always Reject"). No numbering and no caret, so the button row is the marker.
const OPENCODE_PROMPT_TITLE = /Permission required/i
const OPENCODE_ALLOW_ONCE = /Allow once/i
const OPENCODE_REJECT = /Reject\b/i

/**
 * OpenCode CLI (`opencode`): its permission dialog. Also covers the file-edit variant:
 * the title and the button row are the same, only the kind line differs.
 */
export function detectOpencodeAttention(paneText: string): DetectedAttention | null {
  const lines = stripAnsi(paneText).split('\n')
  while (lines.length > 0 && (lines[lines.length - 1] ?? '').trim() === '') lines.pop()
  const tail = lines.slice(-SCAN_LINES)
  const text = tail.join('\n')

  if (!OPENCODE_PROMPT_TITLE.test(text) || !OPENCODE_ALLOW_ONCE.test(text) || !OPENCODE_REJECT.test(text)) return null

  const trimmed = tail.map(line => cleanBoxLine(line))
  const command = trimmed.find(line => line.startsWith('$ ') && line.length > 2)
  const kind = trimmed.find(line => line.startsWith('#'))
  const detail = command ?? kind ?? 'opencode is waiting for permission'
  return { reason: 'approval', detail: truncate(detail) }
}

// Providers with a detector. Everything else reports no attention for now; adding a
// provider means adding one function here: the sweep, the API field and the web badge
// are provider-agnostic.
const DETECTORS: Partial<Record<Provider, AttentionDetector>> = {
  hermes: detectHermesAttention,
  codex: detectCodexAttention,
  opencode: detectOpencodeAttention,
}

export function detectAgentAttention(agent: Pick<AgentRecord, 'provider'>, paneText: string): DetectedAttention | null {
  const detector = DETECTORS[agent.provider]
  if (!detector) return null
  return detector(paneText)
}

export function nextAttentionState(
  previous: AttentionState | null,
  detected: DetectedAttention | null,
  at: string,
): AttentionState | null {
  if (!detected) return null
  if (previous && previous.reason === detected.reason && previous.detail === detected.detail) return previous
  return { reason: detected.reason, detail: detected.detail, since: at }
}

export interface AttentionSweepOptions {
  // Test seam: capture a pane by id. Defaults to `tmux capture-pane -p`.
  capture?: (_paneId: string) => string
  // Test seam: is this pane still part of the agent's session? Defaults to the tmux probe.
  paneInSession?: (_session: string, _paneId: string) => boolean
  now?: () => Date
  throttleMs?: number
  runs?: typeof listRuns
  agents?: typeof listAgents
  update?: typeof updateAgent
}

function defaultCapture(paneId: string): string {
  return execTmux(['capture-pane', '-p', '-S', String(-SCAN_LINES), '-t', paneId])
}

function defaultPaneInSession(session: string, paneId: string): boolean {
  return paneInSession(realDriver, session, paneId)
}

let lastSweepAt = 0

/**
 * One pass over every live agent: read its pane, detect attention, persist only changes.
 * Cheap by design (one `tmux capture-pane` per agent) but never free, so callers use
 * `sweepAttentionThrottled` from a timer instead of calling this per render.
 */
export function sweepAttention(options: AttentionSweepOptions = {}): number {
  const capture = options.capture ?? defaultCapture
  const paneBelongsToAgent = options.paneInSession ?? defaultPaneInSession
  const now = options.now ? options.now() : new Date()
  const at = now.toISOString()
  const listRunsFn = options.runs ?? listRuns
  const listAgentsFn = options.agents ?? listAgents
  const update = options.update ?? updateAgent
  let changed = 0

  for (const run of listRunsFn()) {
    if (run.ended_at) continue
    for (const agent of listAgentsFn(run.id)) {
      const previous = agent.attention ?? null
      let detected: DetectedAttention | null = null
      // Pane ids are reused after a tmux server restart, so a stored id can address another
      // session's pane; capturing it would persist a stranger's command line on this record.
      // Same membership rule as the read path (peekAgent in runtime.ts).
      if (!agent.ended_at && !agent.headless && agent.tmux_pane_id
        && paneBelongsToAgent(agent.tmux_session, agent.tmux_pane_id)) {
        let paneText: string
        try {
          paneText = capture(agent.tmux_pane_id)
        } catch {
          // The window can disappear between the sweep and the capture; treat it as idle.
          paneText = ''
        }
        const raw = detectAgentAttention(agent, paneText)
        // The detail is raw pane text (an approval prompt carries the command line), so it
        // can hold a pasted key. The field is surfaced by the MCP `list` output and the Web
        // state as stored, so redaction has to happen before it is persisted.
        detected = raw ? { reason: raw.reason, detail: redactSecrets(raw.detail) } : null
      }
      const next = nextAttentionState(previous, detected, at)
      if (next?.reason === previous?.reason && next?.detail === previous?.detail && next?.since === previous?.since) {
        continue
      }
      if (next === null && previous === null) continue
      update(run.id, agent.id, { attention: next })
      changed += 1
    }
  }
  lastSweepAt = now.getTime()
  return changed
}

/** Sweep at most once per `throttleMs`; safe to call from a 1.5 s UI tick. */
export function sweepAttentionThrottled(options: AttentionSweepOptions = {}): number {
  const nowMs = options.now ? options.now().getTime() : Date.now()
  const throttleMs = options.throttleMs ?? 1500
  if (nowMs - lastSweepAt < throttleMs) return 0
  return sweepAttention(options)
}

/** Reset the throttle marker (tests and run restarts). */
export function resetAttentionSweepThrottle(): void {
  lastSweepAt = 0
}
