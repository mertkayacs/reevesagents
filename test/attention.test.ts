import { describe, expect, it } from 'vitest'
import {
  detectAgentAttention,
  detectCodexAttention,
  detectHermesAttention,
  detectOpencodeAttention,
  nextAttentionState,
  sweepAttention,
  type AttentionSweepOptions,
} from '../src/core/attention.js'
import type { AgentRecord, AttentionState } from '../src/core/types.js'

// Captured from a live `hermes chat` pane (approvals.mode=manual, ru UI): the blocking
// approval modal as prompt_toolkit draws it. Fixtures stay verbatim: if Hermes changes
// its chrome, this test is the alarm that the detector needs a new marker.
const HERMES_APPROVAL_MODAL = `
╭────────────────────────────────────────────────╮
│ ⚠️   Опасная команда                            │
│                                                │
│ rm -rf /tmp/reeves-probe-attention2            │
│                                                │
│ ❯ 1. Разрешить один раз                        │
│   2. Разрешить на этот сеанс                   │
│   3. Добавить в постоянный список разрешённых  │
│   4. Отклонить                                 │
│                                                │
│ delete in root path                            │
╰────────────────────────────────────────────────╯
  ↑/↓ — выбрать, Enter — подтвердить  (38s)
── ⠦ 💻 rm -rf /tmp/reeves-probe-attention2 · 26s · ↓ 187 tok ──────────────
⚠ ❯
──────────────────────────────────────────────────────────────────────────
 ☤ deepseek-v4.1-flash · 26.4K/1M · [░░░] 3% · ◎ 31.3% · ↑ 89 т/с · 1m · ⏱ 25 с · /tmp
`

// Captured from a live `hermes chat` pane (ru UI): the clarify picker. Unlike the
// approval modal it is not an approval: the body ends with a question.
const HERMES_CLARIFY_MODAL = `
╭─ Hermes Agent ждёт вашего ответа ──────────────╮
│ 1 вопрос                                       │
│ ▸ Синий или зелёный?                           │
│   ❯ 1. Синий (Recommended)                     │
│     2. Зелёный                                 │
│     3. Другое (введите свой ответ)             │
╰────────────────────────────────────────────────╯

  ↑/↓ — выбрать, Enter — зафиксировать, Tab — следующий вопрос  (598s)
── ⠧ ❓ Синий или зелёный? · 5s · ↓ 197 tok ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────── Задать вопрос: синий или зелёный ─
? ❯
─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
 ☤ deepseek-v4.1-flash · 26.6K/1M · [░░░░░░░░░░] 3% · ◎ 57.0% · ◷ 1.6с · ↑ 60 т/с · 19s · ⏱ 4 с · /tmp
`

// Captured from a live `codex` pane (v0.165, `-a on-request -s workspace-write`): the
// approval prompt. Codex renders a flat choice list, with no box frame.
const CODEX_APPROVAL_PROMPT = `

  Would you like to run the following command?

  Environment: local

  Reason: May I create the requested approval probe file at /home/dmytro/codex-approval-probe2?

  $ touch /home/dmytro/codex-approval-probe2


› 1. Yes, proceed (y)
  2. Yes, and don't ask again for commands that start with \`touch /home/dmytro/codex-approval-probe2\` (p)
  3. No, and tell Codex what to do differently (esc)

  Press enter to confirm or esc to cancel
`

const HERMES_IDLE_QUESTION = `
● Готово: обновил home.php и снял замеры.

  TTFB 125 → 78 мс, запросов 88 → 41.

Нужно ли прогонять профиль ещё раз по листингу?
──────────────────────────────────────────────────────────────────────────
❯ Спросите о чём угодно или введите / для команд…
──────────────────────────────────────────────────────────────────────────
 ☤ deepseek-v4.1-flash · 76.8K/1M · [█░░] 7% · ◎ 95.7% · ◷ 4.3с · 8m · ⏲ 0s · ✓ 2 мин · ~/projects/referat-ok.com.ua
`

const HERMES_IDLE_STATEMENT = `
● Готово. Изменения закоммичены локально.

──────────────────────────────────────────────────────────────────────────
❯ Введите сообщение…
──────────────────────────────────────────────────────────────────────────
 ☤ deepseek-v4.1-flash · 40.0K/1M · [█░░] 4% · ◎ 92.0% · ◷ 3.0с · 5m · ⏲ 0s · ✓ 1 мин · /tmp
`

const HERMES_BUSY = `
● Читаю home.php

── ⠸ 💻 grep -rn "orderby" wp-content/themes/ · 8s · ↓ 759 tok ───────────
☤ ❯ пишите, чтобы перенаправить этот ход · Tab ставит в очередь на потом
──────────────────────────────────────────────────────────────────────────
 ☤ deepseek-v4.1-flash · 38.1K/1M · [█░░] 4% · ◎ 34.2% · ◷ 1.7с · ↑ 169 т/с · 3m · ⏱ 7 с · /tmp
`

const HERMES_BLOCKED_GATE = `
BLOCKED: Command was not approved: the approval prompt could not be delivered or was not answered.
retry this command, do NOT rephrase it, and do NOT attempt the same outcome via a different command.
──────────────────────────────────────────────────────────────────────────
❯ Спросите о чём угодно или введите / для команд…
──────────────────────────────────────────────────────────────────────────
 ☤ deepseek-v4.1-flash · 26.4K/1M · [█░░] 3% · ◎ 31.3% · ◷ 2.1с · 1m · ⏲ 0s · /tmp
`

// Captured from a live `opencode` pane (v1.18, permission.bash=ask): the permission dialog.
// OpenCode draws no box frame line and no numbered options: just a title, a kind line,
// the command and a button row.
const OPENCODE_PERMISSION_PROMPT = `
  ┃  △ Permission required
  ┃    # Shell command
  ┃
  ┃  $ touch /tmp/opencode-probe2
  ┃
  ┃                                                                                                                                                                                                                                          /tmp
  ┃   Allow once   Allow always   Reject                                                                                                                                                    ctrl+f fullscreen  ⇆ select  enter confirm
`

describe('Hermes attention detection', () => {
  it('detects a blocking approval modal and keeps the command as the detail', () => {
    const detected = detectHermesAttention(HERMES_APPROVAL_MODAL)
    expect(detected?.reason).toBe('approval')
    expect(detected?.detail).toContain('rm -rf /tmp/reeves-probe-attention2')
  })

  it('classifies a clarify picker as a question, not an approval', () => {
    const detected = detectHermesAttention(HERMES_CLARIFY_MODAL)
    expect(detected?.reason).toBe('input')
    expect(detected?.detail).toContain('Синий или зелёный')
  })

  // Regression: an old clarify question can still be on screen above a fresh approval box.
  // Classifying by the whole tail turned that approval into an "answer" prompt.
  it('classifies by the modal that is open, not by stale text above it', () => {
    const stale = '☤ Hermes\nСколько строк в отчёте — 10 или 20?\n──────────────────────────'
    const detected = detectHermesAttention(`${stale}\n${HERMES_APPROVAL_MODAL}`)
    expect(detected?.reason).toBe('approval')
    expect(detected?.detail).toContain('rm -rf /tmp/reeves-probe-attention2')
  })

  // A finished turn that ends with a question looks exactly the same in the pane as one
  // whose answer is already typed into the input box, so it must NOT raise a badge: that
  // heuristic hung "ждёт ответа" on agents the operator had already answered.
  it('does not flag a finished turn that ends with a question', () => {
    expect(detectHermesAttention(HERMES_IDLE_QUESTION)).toBeNull()
  })

  it('still detects a modal when tmux pads the pane with blank rows', () => {
    const padded = `${HERMES_APPROVAL_MODAL}\n\n\n\n\n\n`
    expect(detectHermesAttention(padded)?.reason).toBe('approval')
  })

  it('stays quiet on a finished turn that states a result', () => {
    expect(detectHermesAttention(HERMES_IDLE_STATEMENT)).toBeNull()
  })

  it('stays quiet while the agent is working', () => {
    expect(detectHermesAttention(HERMES_BUSY)).toBeNull()
  })

  it('flags a command blocked before any prompt could be shown', () => {
    const detected = detectHermesAttention(HERMES_BLOCKED_GATE)
    expect(detected?.reason).toBe('approval')
  })

  it('ignores ANSI colour codes around the modal', () => {
    const coloured = HERMES_APPROVAL_MODAL.replace('╭', '\u001b[33m╭\u001b[0m')
    expect(detectHermesAttention(coloured)?.reason).toBe('approval')
  })

  it('only reads its own provider panes', () => {
    expect(detectAgentAttention({ provider: 'cc' }, HERMES_APPROVAL_MODAL)).toBeNull()
    expect(detectAgentAttention({ provider: 'codex' }, HERMES_APPROVAL_MODAL)).toBeNull()
    expect(detectAgentAttention({ provider: 'hermes' }, HERMES_APPROVAL_MODAL)?.reason).toBe('approval')
  })
})

describe('attention persistence', () => {
  it('keeps the original `since` while the same prompt is still open', () => {
    const first = nextAttentionState(null, { reason: 'approval', detail: 'rm -rf x' }, '2026-10-28T10:00:00.000Z')
    const again = nextAttentionState(first, { reason: 'approval', detail: 'rm -rf x' }, '2026-10-28T10:00:30.000Z')
    expect(again?.since).toBe('2026-10-28T10:00:00.000Z')
  })

  it('restamps `since` when a different prompt appears', () => {
    const first = nextAttentionState(null, { reason: 'approval', detail: 'rm -rf x' }, '2026-10-28T10:00:00.000Z')
    const second = nextAttentionState(first, { reason: 'question', detail: 'continue?' }, '2026-10-28T10:05:00.000Z')
    expect(second).toEqual({ reason: 'question', detail: 'continue?', since: '2026-10-28T10:05:00.000Z' })
  })

  it('clears the state when the prompt is gone', () => {
    const first = nextAttentionState(null, { reason: 'approval', detail: 'x' }, '2026-10-28T10:00:00.000Z')
    expect(nextAttentionState(first, null, '2026-10-28T10:01:00.000Z')).toBeNull()
  })
})

function agent(overrides: Partial<AgentRecord> = {}): AgentRecord {
  return {
    id: 'a1',
    run_id: 'r1',
    nickname: 'Hermes',
    provider: 'hermes',
    model: '',
    role: 'root',
    working_dir: '/tmp',
    task: '',
    task_status: 'working',
    task_note: '',
    tmux_session: 'reeves-x-aaaaaaaa',
    tmux_window_id: '@1',
    tmux_pane_id: '%1',
    pane_pid: 123,
    rc_enabled: false,
    permissions: 'ask',
    inbox: [],
    last_seen: 0,
    started_at: '2026-10-28T10:00:00.000Z',
    ended_at: null,
    ...overrides,
  }
}

describe('attention sweep', () => {
  function sweep(
    paneText: string,
    previous: AttentionState | null = null,
    agentOverrides: Partial<AgentRecord> = {},
    extra: Partial<AttentionSweepOptions> = {},
  ) {
    const updates: Array<{ id: string; patch: { attention?: AttentionState | null } }> = []
    const options: AttentionSweepOptions = {
      capture: () => paneText,
      // Default seams for every test that is not about pane membership: the sweep must not
      // reach a real tmux server. The membership rule has its own tests below.
      paneInSession: () => true,
      now: () => new Date('2026-10-28T11:00:00.000Z'),
      runs: () => [{ id: 'r1', ended_at: null } as never],
      agents: () => [agent({ attention: previous, ...agentOverrides })],
      update: (_runId, agentId, patch) => { updates.push({ id: agentId, patch }) },
      ...extra,
    }
    const changed = sweepAttention(options)
    return { changed, updates }
  }

  it('persists a newly detected prompt', () => {
    const { changed, updates } = sweep(HERMES_APPROVAL_MODAL)
    expect(changed).toBe(1)
    expect(updates[0]?.patch.attention?.reason).toBe('approval')
  })

  it('does not rewrite the record while the same prompt stays open', () => {
    const open: AttentionState = { reason: 'approval', detail: 'rm -rf /tmp/reeves-probe-attention2', since: '2026-10-28T10:00:00.000Z' }
    const { changed } = sweep(HERMES_APPROVAL_MODAL, open)
    expect(changed).toBe(0)
  })

  it('clears a stale prompt once the pane no longer shows it', () => {
    const open: AttentionState = { reason: 'approval', detail: 'old', since: '2026-10-28T10:00:00.000Z' }
    const { changed, updates } = sweep(HERMES_IDLE_STATEMENT, open)
    expect(changed).toBe(1)
    expect(updates[0]?.patch.attention).toBeNull()
  })

  // Regression: pane ids survive a tmux server restart but then belong to another session,
  // so a stored id can read a stranger's pane and persist its command line on this record.
  it('does not read a pane id that no longer belongs to the agent session', () => {
    const open: AttentionState = { reason: 'approval', detail: 'old', since: '2026-10-28T10:00:00.000Z' }
    const captured: string[] = []
    const { changed, updates } = sweep(HERMES_APPROVAL_MODAL, open, {}, {
      capture: paneId => { captured.push(paneId); return HERMES_APPROVAL_MODAL },
      paneInSession: () => false,
    })
    expect(captured).toEqual([])
    // The badge cannot be trusted any more either: the pane it described is gone.
    expect(changed).toBe(1)
    expect(updates[0]?.patch.attention).toBeNull()
  })

  it('reads the pane while the stored id still belongs to the agent session', () => {
    const probed: Array<[string, string]> = []
    const { updates } = sweep(HERMES_APPROVAL_MODAL, null, {}, {
      paneInSession: (session, paneId) => { probed.push([session, paneId]); return true },
    })
    expect(probed).toEqual([['reeves-x-aaaaaaaa', '%1']])
    expect(updates[0]?.patch.attention?.reason).toBe('approval')
  })

  // The detail is raw pane text (an approval prompt carries the command line), and the
  // record is surfaced by the MCP `list` output and the Web state as stored.
  it('redacts a secret in the detail before persisting it', () => {
    // Assembled at runtime so the repository never holds a key-shaped literal.
    const fakeKey = ['sk', 'ant', 'abcdefghijklmnopqrstuvwxyz'].join('-')
    const leaked = CODEX_APPROVAL_PROMPT.replace(
      '$ touch /home/dmytro/codex-approval-probe2',
      `$ curl -H "x-api-key: ${fakeKey}" https://example.test`,
    )
    const { updates } = sweep(leaked, null, { provider: 'codex' })
    const detail = updates[0]?.patch.attention?.detail ?? ''
    expect(detail).toContain('[REDACTED]')
    expect(detail).not.toContain(fakeKey)
  })
})

describe('Codex attention detection', () => {
  it('detects the command-approval prompt and shows the command', () => {
    const detected = detectCodexAttention(CODEX_APPROVAL_PROMPT)
    expect(detected?.reason).toBe('approval')
    expect(detected?.detail).toBe('$ touch /home/dmytro/codex-approval-probe2')
  })

  it('does not mistake a numbered list in ordinary output for a prompt', () => {
    const output = [
      '• Plan:',
      '  1. read the file',
      '  2. change the config',
      '  3. run the tests',
      '› Ask Codex to do anything',
    ].join('\n')
    expect(detectCodexAttention(output)).toBeNull()
  })

  it('stays quiet while codex is working', () => {
    const busy = ['› Run the tests', '• Working (2s • esc to interrupt)', ''].join('\n')
    expect(detectCodexAttention(busy)).toBeNull()
  })

  it('is wired into the provider registry', () => {
    expect(detectAgentAttention({ provider: 'codex' }, CODEX_APPROVAL_PROMPT)?.reason).toBe('approval')
  })
})

describe('OpenCode attention detection', () => {
  it('detects the permission dialog and shows the command', () => {
    const detected = detectOpencodeAttention(OPENCODE_PERMISSION_PROMPT)
    expect(detected?.reason).toBe('approval')
    expect(detected?.detail).toBe('$ touch /tmp/opencode-probe2')
  })

  it('stays quiet on ordinary output that mentions permissions', () => {
    const output = [
      '  △ Permission required',
      '    # Shell command',
      '   the user has not answered yet',
      '› Ask anything',
    ].join('\n')
    expect(detectOpencodeAttention(output)).toBeNull()
  })

  it('is wired into the provider registry', () => {
    expect(detectAgentAttention({ provider: 'opencode' }, OPENCODE_PERMISSION_PROMPT)?.reason).toBe('approval')
  })
})
