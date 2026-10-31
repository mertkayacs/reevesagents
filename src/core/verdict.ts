// Verdict parsing: what did the reviewer decide?
//
// Input: a raw pane capture. Output: how many verdicts it printed, the latest one, and the
// findings lines. The raw text never leaves this module, and the notes it returns are already
// redacted: a reviewer can quote a secret in a finding, and everything downstream of this
// module ends up in a log, a toast or an approval record.

import { redactSecrets } from './redact.js'

export type FlowVerdict = 'ACCEPT' | 'CHANGES_REQUESTED'

export interface VerdictScan {
  // Verdicts inside the scanned window. Callers key their "a new verdict appeared" check on
  // this count, so the window must be the same for every call of one flow.
  count: number
  last: FlowVerdict | null
  // The reviewer's actionable lines, oldest first, already redacted.
  notes: string
}

// A review scrolls; the window is generous so a verdict rendered before a long findings list
// still counts.
export const VERDICT_SCAN_LINES = 400
export const NOTES_LIMIT = 20

// Both spellings that have been observed in practice: a review prompt may ask for either, and
// the parser should not care which language the reviewer answered in. Optional separators cover
// "VERDICT: ACCEPT", "ВЕРДИКТ — CHANGES_REQUESTED" and the bare "verdict ACCEPT".
const VERDICT_PATTERN = /(?:VERDICT|ВЕРДИКТ)\s*[:\-—]?\s*(ACCEPT|CHANGES_REQUESTED)/gi
const NOTES_PATTERN = /^(BLOCKER|MAJOR|MINOR)\b/

// Trimmed window of the capture: `tmux capture-pane -S -400` returns history with the pane's
// padding, and match positions do not matter, only order.
function scanWindow(paneText: string, lines = VERDICT_SCAN_LINES): string[] {
  const all = paneText.split('\n').map(line => line.trimEnd())
  return lines > 0 ? all.slice(-lines) : all
}

export function countVerdicts(paneText: string, lines = VERDICT_SCAN_LINES): number {
  const text = scanWindow(paneText, lines).join('\n')
  return text.match(VERDICT_PATTERN)?.length ?? 0
}

export function lastVerdict(paneText: string, lines = VERDICT_SCAN_LINES): FlowVerdict | null {
  const text = scanWindow(paneText, lines).join('\n')
  const matches = [...text.matchAll(VERDICT_PATTERN)]
  const last = matches.at(-1)
  if (!last) return null
  return last[1]?.toUpperCase() === 'ACCEPT' ? 'ACCEPT' : 'CHANGES_REQUESTED'
}

// Redacted here, not by the caller: notes are what ends up in a log, a toast and an approval
// record, and a reviewer can quote a leaked secret in a finding.
export function verdictNotes(paneText: string, lines = VERDICT_SCAN_LINES, limit = NOTES_LIMIT): string {
  const notes = scanWindow(paneText, lines)
    .map(line => line.trim())
    .filter(line => NOTES_PATTERN.test(line))
    .slice(-limit)
    .join('\n')
  return redactSecrets(notes)
}

// One pass for the callers that need all three facts about the same capture.
export function scanVerdict(paneText: string, lines = VERDICT_SCAN_LINES): VerdictScan {
  return {
    count: countVerdicts(paneText, lines),
    last: lastVerdict(paneText, lines),
    notes: verdictNotes(paneText, lines),
  }
}
