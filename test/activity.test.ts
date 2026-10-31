// Busy detection: the fail-closed gate in front of every automated write.
//
// The fixtures are real pane text captured from live runs on this machine, because every rule
// here came from a real pane: the busy hint lives on the status line, the idle input box is a
// positive signal, and anything else on screen (a login prompt, an error, a modal) is 'unknown'.

import { describe, expect, it } from 'vitest'
import { BUSY_TAIL_LINES, detectPaneBusy, gatedProviders, paneTail, providerHasBusyDetector } from '../src/core/activity.js'

// Hermes, mid-turn: the input box switches to "redirect this turn" and the status line carries
// the interrupt hint.
const HERMES_BUSY = [
  '── ⠼ 💻 bash -n loop_supervisor.sh + 9 команд(ы) · 2m · ↓ 4.7k tok ───────────────────────',
  '☤ ❯ пишите, чтобы перенаправить этот ход · Tab ставит в очередь на потом',
  '──────────────────────────────────────────────────────────────────────────────────────────',
  ' ☤ deepseek-v4.1-flash · 622K/1M · [██████░░░░] 59% · ◎ 99.2% · ◷ 5.6с · ↑ 110 т/с · 23h   enter прервать · tab в очередь · ctrl+c стоп',
].join('\n')

// Hermes, idle: the input box holds the operator's text and the status line has no hint.
const HERMES_IDLE = [
  '❯ Объясни эту ошибку и как её исправить',
  '──────────────────────────────────────────────────────────────────────────────────────────',
  ' ☤ deepseek-v4.1-flash · 282K/1M · [███░░░░░░░] 27% · ◎ 99.0% · ◷ 6.6с · ↑ 167 т/с · ✓ 6m · ~/projects/salon-dashboard (main)',
].join('\n')

// Codex, idle: the input box is present, no "esc to interrupt" anywhere.
const CODEX_IDLE = [
  '› Ask Codex to do anything',
  '',
  '  GPT-6-Luna high · ~/projects/reevesagents-flow · Проведи read-only ревью архитектуры',
  '  ← for agents · ? for shortcuts',
].join('\n')

// Codex, mid-turn.
const CODEX_BUSY = [
  '  ◦ Working (8s • esc to interrupt)',
  '',
  '› Ask Codex to do anything',
  '  GPT-6-Luna high · ~/projects/reevesagents-flow',
].join('\n')

describe('detectPaneBusy', () => {
  it('reads the verified busy hints off the status line', () => {
    expect(detectPaneBusy(HERMES_BUSY, 'hermes')).toBe('busy')
    expect(detectPaneBusy('  esc to interrupt', 'hermes')).toBe('busy')
    expect(detectPaneBusy(CODEX_BUSY, 'codex')).toBe('busy')
  })

  it('needs a positive idle signal, not just the absence of a busy hint', () => {
    expect(detectPaneBusy(HERMES_IDLE, 'hermes')).toBe('idle')
    expect(detectPaneBusy(CODEX_IDLE, 'codex')).toBe('idle')
    // No input box anywhere: a login screen, an error or a half-drawn frame. Never "free".
    for (const screen of ['Welcome to Codex\nPlease sign in', 'error: connection refused', '▌']) {
      expect(detectPaneBusy(screen, 'codex')).toBe('unknown')
      expect(detectPaneBusy(screen, 'hermes')).toBe('unknown')
    }
  })

  it('ignores a busy hint that only survives in scrollback', () => {
    // The real failure this rule fixes: a 12-line window kept an idle agent "busy" forever.
    const pane = [CODEX_BUSY, 'VERDICT: ACCEPT', 'MAJOR nothing', 'idle', '› '].join('\n')
    expect(detectPaneBusy(pane, 'codex')).toBe('idle')
    expect(paneTail(pane, BUSY_TAIL_LINES)).toEqual(['MAJOR nothing', 'idle', '›'])
  })

  it('is unknown, not idle, when the provider has no verified signals', () => {
    for (const provider of ['cc', 'opencode', 'kimi', 'qwen', 'deepseek', 'pi', 'aider'] as const) {
      expect(providerHasBusyDetector(provider)).toBe(false)
      expect(detectPaneBusy(CODEX_IDLE, provider)).toBe('unknown')
    }
  })

  it('is unknown when nothing was captured', () => {
    expect(detectPaneBusy('', 'codex')).toBe('unknown')
    expect(detectPaneBusy('\n\n   \n', 'hermes')).toBe('unknown')
  })

  it('strips ANSI and the padding tmux appends before matching', () => {
    const pane = `\u001b[2m\u001b[32m${CODEX_BUSY}\u001b[0m\n${'\n'.repeat(20)}`
    expect(detectPaneBusy(pane, 'codex')).toBe('busy')
  })

  it('lists exactly the providers it can gate', () => {
    expect(gatedProviders().sort()).toEqual(['codex', 'hermes'])
  })

  it('keeps a three-line tail by default', () => {
    const pane = ['one', 'two', 'three', 'four'].map(line => `  ${line}  `).join('\n')
    expect(paneTail(pane)).toEqual(['two', 'three', 'four'])
    expect(paneTail(pane, 0)).toHaveLength(4)
  })
})
