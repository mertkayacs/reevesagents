// Busy detection: the fail-closed gate in front of every automated write.
//
// The rules under test are the ones a live pane taught: only the bottom lines carry the
// provider's status (scrollback keeps earlier turns), an unverified provider is 'unknown' and
// never 'idle', and padding/ANSI from tmux must not hide the marker.

import { describe, expect, it } from 'vitest'
import { BUSY_TAIL_LINES, busyProviders, detectPaneBusy, paneTail, providerHasBusyDetector } from '../src/core/activity.js'

const HERMES_BUSY = '  ⏵⏵ working · enter прервать'
const CODEX_BUSY = '  ◦ Working (8s • esc to interrupt)'

describe('detectPaneBusy', () => {
  it('reports busy for the verified provider markers', () => {
    expect(detectPaneBusy(HERMES_BUSY, 'hermes')).toBe('busy')
    expect(detectPaneBusy('esc to interrupt', 'hermes')).toBe('busy')
    expect(detectPaneBusy(CODEX_BUSY, 'codex')).toBe('busy')
  })

  it('reports idle when the tail carries no marker', () => {
    expect(detectPaneBusy('> what next?\n\n', 'codex')).toBe('idle')
    expect(detectPaneBusy('done\n❯ ', 'hermes')).toBe('idle')
  })

  it('ignores a busy marker that only survives in scrollback', () => {
    // The real failure this rule fixes: a 12-line window kept an idle agent "busy" forever.
    const pane = [CODEX_BUSY, 'VERDICT: ACCEPT', 'MAJOR nothing', 'idle', '❯ '].join('\n')
    expect(detectPaneBusy(pane, 'codex')).toBe('idle')
    expect(paneTail(pane, BUSY_TAIL_LINES)).toEqual(['MAJOR nothing', 'idle', '❯'])
  })

  it('is unknown, not idle, when the provider has no verified marker', () => {
    for (const provider of ['cc', 'opencode', 'kimi', 'qwen', 'deepseek', 'pi', 'aider'] as const) {
      expect(providerHasBusyDetector(provider)).toBe(false)
      expect(detectPaneBusy('anything at all\n> ', provider)).toBe('unknown')
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
    expect(busyProviders().sort()).toEqual(['codex', 'hermes'])
  })

  it('keeps a three-line tail by default', () => {
    const pane = ['one', 'two', 'three', 'four'].map(line => `  ${line}  `).join('\n')
    expect(paneTail(pane)).toEqual(['two', 'three', 'four'])
    expect(paneTail(pane, 0)).toHaveLength(4)
  })
})
