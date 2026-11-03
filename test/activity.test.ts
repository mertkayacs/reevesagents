// Busy detection: the fail-closed gate in front of every automated write.
//
// The fixtures are real pane text captured from live runs on this machine, because every rule
// here came from a real pane: the busy hint lives on the status line, the idle input box is a
// positive signal, and anything else on screen (a login prompt, an error, a modal) is 'unknown'.

import { describe, expect, it } from 'vitest'
import {
  BUSY_SCAN_LINES, detectPaneBusy, gatedProviders, inspectPane, paneTail, providerHasBusyDetector,
} from '../src/core/activity.js'

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

  it('reads a busy hint only on the status rows, never in the body of a report (block 74)', () => {
    // The live `flow-finish` pane: a free composer, and the agent's own report quoting the hint above it. The whole-frame scan
    // of block 73 held that flow for six minutes.
    const quoted = [
      'report: the pane printed `◦ Working (8s • esc to interrupt)` and then went idle',
      'MAJOR src/a.ts:1 — nothing to see',
      'MINOR docs/b.md:2 — and `esc to interrupt` quoted again',
      '› ',
      'GPT-6-Luna high · ~/projects/flow-finish',
      '← for agents · ? for shortcuts',
    ].join('\n')
    expect(detectPaneBusy(quoted, 'codex')).toBe('idle')
  })

  it('keeps the capture window as what excludes ancient hints', () => {
    const stale = [CODEX_BUSY, ...Array.from({ length: 45 }, (_, index) => `row ${index}`), '› '].join('\n')
    const captured = paneTail(stale, BUSY_SCAN_LINES).join('\n')
    expect(captured).not.toContain('esc to interrupt')
    expect(detectPaneBusy(captured, 'codex')).toBe('idle')
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

// The incident of 2026-11-03 (block 73): a live codex pane with the placeholder and the footer drawn but **no** `›` in
// front of the placeholder. The frame was complete; only the glyph was missing, and the engine held on
// `review_pane_unknown` for ten minutes while the reviewer sat idle.
const CODEX_NO_GLYPH = [
  '  Ask Codex to do anything',
  '  GPT-6-Luna high · ~/projects/flow-finish',
  '  ← for agents · ? for shortcuts',
].join('\n')

describe('a composer without the glyph (block 73)', () => {
  it('reads the incident pane as idle once a second capture agrees', () => {
    const first = inspectPane(CODEX_NO_GLYPH, 'codex', { now: 10_000 })
    // One look is not an answer: the fallback needs the same frame twice, a second apart.
    expect(first).toMatchObject({ state: 'unknown', reason: 'placeholder_pending' })
    // A single-sample caller (the pure detector) never turns that into idle.
    expect(detectPaneBusy(CODEX_NO_GLYPH, 'codex')).toBe('unknown')

    const second = inspectPane(CODEX_NO_GLYPH, 'codex', { now: 11_200, previous: first.sample })
    expect(second).toMatchObject({ state: 'idle', reason: 'composer_placeholder' })
  })

  it('refuses the same pane when the frame changed between the two captures', () => {
    const first = inspectPane(CODEX_NO_GLYPH, 'codex', { now: 10_000 })
    const redrawn = CODEX_NO_GLYPH.replace('~/projects/flow-finish', '~/projects/other')
    expect(inspectPane(redrawn, 'codex', { now: 11_200, previous: first.sample }))
      .toMatchObject({ state: 'unknown', reason: 'placeholder_pending' })
    // And two looks closer together than a second are not a confirmation either.
    expect(inspectPane(CODEX_NO_GLYPH, 'codex', { now: 10_500, previous: first.sample }))
      .toMatchObject({ state: 'unknown', reason: 'placeholder_pending' })
  })

  it('keeps busy above the fallback: a placeholder with an interrupt hint is busy, not free', () => {
    const busy = [
      '  ◦ Working (8s • esc to interrupt)',
      '  Ask Codex to do anything',
      '  GPT-6-Luna high · ~/projects/flow-finish',
      '  ← for agents · ? for shortcuts',
    ].join('\n')
    const first = inspectPane(busy, 'codex', { now: 10_000 })
    expect(first).toMatchObject({ state: 'busy', reason: 'busy_hint' })
    // Even with a confirming second look: busy outranks idle, always.
    expect(inspectPane(busy, 'codex', { now: 12_000, previous: first.sample })).toMatchObject({ state: 'busy' })
    // A narrow pane wraps the status line onto two rows: still busy.
    expect(inspectPane('  ◦ Working (3s • esc to\n  interrupt)\n  Ask Codex to do anything', 'codex', { now: 10_000 }).state)
      .toBe('busy')
    // Nine rows above the composer is the body, not the status line: busy no longer follows the hint up there (block 74).
    const far = [busy, ...Array.from({ length: 9 }, (_, index) => `  row ${index}`)].join('\n')
    expect(inspectPane(far, 'codex', { now: 10_000 }).state).not.toBe('busy')
  })

  it('never reads these frames as idle', () => {
    const first = inspectPane(CODEX_NO_GLYPH, 'codex', { now: 10_000 })
    // Each frame is one of the shapes that must never be read as free. The *reason* is the detector's own diagnosis — a
    // frame can be refused for more than one of them — so the assertion is the state plus a reason to print in the journal.
    const cases: string[] = [
      // A pane scrolled into its own history: verdict lines and no composer.
      'MAJOR src/a.ts:1 — x\nVERDICT: CHANGES_REQUESTED\nMINOR docs/b.md:2 — y',
      // A modal over the composer: the row where the composer belongs is the dialog.
      '  ▌ Select an environment\n    1. staging\n    2. production\n  ← for agents · ? for shortcuts',
      // A partial redraw: the placeholder is there, the footer is not.
      '  Ask Codex to do anything',
      // A pane holding somebody's draft: text is not a placeholder, so the fallback does not apply.
      '  please refactor the parser\n  ← for agents · ? for shortcuts',
      // Copy mode: the badge is the only marker tmux leaves.
      '[12/345]  Ask Codex to do anything\n  ← for agents · ? for shortcuts',
    ]
    for (const frame of cases) {
      const inspection = inspectPane(frame, 'codex', { now: 11_000, previous: first.sample })
      expect(inspection.state, frame).toBe('unknown')
      expect(inspection.reason, frame).not.toBe('')
    }
    // The two structural refusals that have exactly one cause keep their exact code — they are what the journal prints.
    expect(inspectPane('  Ask Codex to do anything', 'codex', { now: 11_000, previous: first.sample }).reason)
      .toBe('footer_absent')
    expect(inspectPane('  please refactor the parser\n  ← for agents · ? for shortcuts', 'codex', { now: 11_000 }).reason)
      .toBe('placeholder_absent')
    expect(inspectPane('[12/345]  Ask Codex to do anything\n  ← for agents · ? for shortcuts', 'codex', { now: 11_000 }).reason)
      .toBe('copy_mode')
  })

  it('still reads the glyph itself, wherever it sits', () => {
    const glyph = ['  › ', '  GPT-6-Luna high · ~/repo', '  ← for agents · ? for shortcuts'].join('\n')
    expect(inspectPane(glyph, 'codex', { now: 10_000 })).toMatchObject({ state: 'idle', reason: 'composer_glyph' })
  })
})

describe('the glyph counts only where the composer is (block 73, review round 1)', () => {
  it('does not read a prompt quoted in the body as a live composer', () => {
    // A pane whose input box has been replaced by a modal, with an old prompt a few rows above it: the `›` belongs to a turn
    // that ended, and a paste here would land on a pane that has nothing to paste into.
    const frame = [
      '› разберись с парсером',
      'VERDICT: CHANGES_REQUESTED',
      '▌ Select an environment',
      '  1. staging',
      '  2. production',
      '← for agents · ? for shortcuts',
    ].join('\n')
    const inspection = inspectPane(frame, 'codex', { now: 10_000 })
    expect(inspection.state).toBe('unknown')
    expect(inspection.reason).not.toBe('composer_glyph')
  })

  it('does not read a marker that an answer separates from the composer', () => {
    // The real shape: the previous turn's marker, the answer, a rule, then the modal. The marker's block ends at the rule.
    // (No `esc to interrupt` in this frame: where a busy hint is read from is block 74's subject, not this one's.)
    const frame = [
      '› починить сборку',
      'done — 3 files changed',
      '────────────────────────────',
      '▌ Allow this command?',
      '  1. yes',
      '  2. no',
      '← for agents · ? for shortcuts',
    ].join('\n')
    expect(inspectPane(frame, 'codex', { now: 10_000 }).state).toBe('unknown')
  })

  it('still reads a marker whose block is the box itself, however many rows it fills', () => {
    // A draft of three lines: the marker introduces the block and nothing else sits between them (block 44's case for a
    // brief that was pasted and not sent).
    const draft = [
      '› first line of the brief',
      '  second line of the brief',
      '  third line of the brief',
      'GPT-6-Luna high · ~/repo',
      '← for agents · ? for shortcuts',
    ].join('\n')
    expect(inspectPane(draft, 'codex', { now: 10_000 })).toMatchObject({ state: 'idle', reason: 'composer_glyph' })
  })

  it('stops at transcript content: a stale marker above an answer is not this composer', () => {
    // The shape the second pass named: the previous turn's `›`, its answer, the verdict, and then a composer that drew no glyph
    // at all (the incident of 2026-11-03). One look must stay `unknown` — the fallback has to confirm it with a second capture.
    const frame = [
      '› разберись с парсером',
      '• Fixed the parser and the reader.',
      'VERDICT: ACCEPT',
      'Ask Codex to do anything',
      'GPT-6-Luna high · ~/repo',
      '← for agents · ? for shortcuts',
    ].join('\n')
    const first = inspectPane(frame, 'codex', { now: 10_000 })
    expect(first.state).toBe('unknown')
    expect(first.reason).toBe('placeholder_pending')
    // And it is idle only once a second capture agrees — the placeholder path, not the glyph path.
    expect(inspectPane(frame, 'codex', { now: 11_200, previous: first.sample }))
      .toMatchObject({ state: 'idle', reason: 'composer_placeholder' })
  })

  it('stops at plain answer prose that carries no marker at all', () => {
    // The frame the second pass named: a stale `›`, an answer printed at the left margin without a bullet, and a composer
    // that drew no glyph. Prose is not the box's text, and the walk must not cross it.
    const frame = [
      '› разберись с парсером',
      'Fixed the parser. The suite passes.',
      'Ask Codex to do anything',
      'GPT-6-Luna high · ~/repo',
      '← for agents · ? for shortcuts',
    ].join('\n')
    const first = inspectPane(frame, 'codex', { now: 10_000 })
    expect(first.state).toBe('unknown')
    expect(first.reason).toBe('placeholder_pending')
    expect(inspectPane(frame, 'codex', { now: 11_200, previous: first.sample }))
      .toMatchObject({ state: 'idle', reason: 'composer_placeholder' })
  })

  it('stops at an answer bullet as well as at a verdict line', () => {
    const bulleted = [
      '› починить сборку',
      '• Ran the suite — 1621 passed.',
      'Ask Codex to do anything',
      '← for agents · ? for shortcuts',
    ].join('\n')
    expect(inspectPane(bulleted, 'codex', { now: 10_000 }).state).toBe('unknown')
  })

  it('walks through the Markdown bullets and diff rows of a pasted brief (block 73, review round 2)', () => {
    // A brief pasted into the box is prose with its own structure: `- item` bullets and diff rows, all indented to the box's
    // text column. None of them is transcript, and the marker above them is this composer's.
    const brief = [
      '› разберись с парсером, вот план:',
      '  - прочитать src/core/plan.ts',
      '  - починить границы строк',
      '  + добавить тест',
      '  • проверить на стенде',
      '  и прогнать гейты',
      'GPT-6-Luna high · ~/repo',
      '← for agents · ? for shortcuts',
    ].join('\n')
    expect(inspectPane(brief, 'codex', { now: 10_000 })).toMatchObject({ state: 'idle', reason: 'composer_glyph' })
  })

  it('still stops at the same bullet once it is a finished turn\'s output', () => {
    // The same words at the left margin are the answer above the composer, not the box.
    const transcript = [
      '› разберись с парсером',
      '- прочитал src/core/plan.ts',
      'Ask Codex to do anything',
      'GPT-6-Luna high · ~/repo',
      '← for agents · ? for shortcuts',
    ].join('\n')
    expect(inspectPane(transcript, 'codex', { now: 10_000 }).state).toBe('unknown')
  })

  it('keeps a bare prompt and a placeholder composer working', () => {
    expect(inspectPane('› \n  ← for agents · ? for shortcuts', 'codex', { now: 10_000 }))
      .toMatchObject({ state: 'idle', reason: 'composer_glyph' })
  })
})

// Block 74's incident, verbatim in shape: hermes, a free status bar, and the agent's own report in the body quoting both
// hints the detector knows (`◦ Working (8s • esc to interrupt)` and `enter прервать`).
const HERMES_QUOTING_BODY = [
  '  Итог: панель цитирует `◦ Working (8s • esc to interrupt)` и `enter прервать` в собственном отчёте.',
  '  ────────────────────────────────────────────────────────────',
  '❯ ',
  '──────────────────────────────────────────────────────────────────────────',
  ' ☤ deepseek-v4.1-flash · 282K/1M · ✓ 6m · ~/projects/flow-finish',
].join('\n')

describe('busy is read off the status rows only (block 74)', () => {
  it('does not hold a free hermes pane whose report quotes both hints', () => {
    expect(inspectPane(HERMES_QUOTING_BODY, 'hermes', { now: 10_000 }))
      .toMatchObject({ state: 'idle', reason: 'composer_glyph' })
  })

  it('does not hold a free codex pane whose report quotes the working line', () => {
    const frame = [
      '◦ Working (8s • esc to interrupt)',
      '— quoted from the earlier run, twice: esc to interrupt',
      '› Ask Codex to do anything',
      '  GPT-6-Luna high · ~/projects/flow-finish',
      '  ← for agents · ? for shortcuts',
    ].join('\n')
    expect(inspectPane(frame, 'codex', { now: 10_000 }).state).toBe('idle')
  })

  it('does not read a report bullet in the bottom rows as the status line (block 74, review round 1)', () => {
    // A bullet that quotes the working line sits in the bottom rows, opens with the same glyph, and carries `esc to interrupt`
    // in its text. It is a report, not the status block.
    const quotedBullet = [
      '• Working (8s • esc to interrupt) was what it printed, then the pane went idle',
      '› Ask Codex to do anything',
      '  GPT-6-Luna high · ~/projects/flow-finish',
      '  ← for agents · ? for shortcuts',
    ].join('\n')
    expect(inspectPane(quotedBullet, 'codex', { now: 10_000 }))
      .toMatchObject({ state: 'idle', reason: 'composer_glyph' })

    // The same words without the trailing prose are the status line itself.
    const statusLine = [
      '• Working (8s • esc to interrupt)',
      '› Ask Codex to do anything',
      '  GPT-6-Luna high · ~/projects/flow-finish',
      '  ← for agents · ? for shortcuts',
    ].join('\n')
    expect(inspectPane(statusLine, 'codex', { now: 10_000 })).toMatchObject({ state: 'busy', reason: 'busy_hint' })
  })

  it('does not hold a pane whose report quotes the status line exactly (block 74, review round 1)', () => {
    // Exactly the line codex draws, inside the bottom rows — and the report continues under it. The status row is the one that
    // sits straight above the box; this one has the report between itself and the box.
    const exactQuote = [
      'MAJOR src/core/activity.ts:57 — the shape also matches a quotation',
      '◦ Working (8s • esc to interrupt)',
      'MINOR docs/flows-design.md:88 — worth a sentence',
      '› Ask Codex to do anything',
      '  GPT-6-Luna high · ~/projects/flow-finish',
      '  ← for agents · ? for shortcuts',
    ].join('\n')
    expect(inspectPane(exactQuote, 'codex', { now: 10_000 }))
      .toMatchObject({ state: 'idle', reason: 'composer_glyph' })

    // The same quotation inside a fenced block of the report: the fence is transcript as well.
    const fenced = [
      '◦ Working (8s • esc to interrupt)',
      '```',
      '› Ask Codex to do anything',
      '  GPT-6-Luna high · ~/projects/flow-finish',
      '  ← for agents · ? for shortcuts',
    ].join('\n')
    expect(inspectPane(fenced, 'codex', { now: 10_000 }).state).toBe('idle')
  })

  it('is not busy when an exact quoted status row is continued by ordinary prose (block 74, review round 1)', () => {
    // No token, no bullet, no fence: the report simply runs on under the quoted line, and prose is a separator too — the box
    // draws its own rows at its text column, everything further left is the answer. The pane is free, and it is not busy.
    const prose = [
      '◦ Working (8s • esc to interrupt)',
      'The tests passed and the tree is clean, so the pane was idle when the next tick looked at it.',
      '› Ask Codex to do anything',
      '  GPT-6-Luna high · ~/projects/flow-finish',
      '  ← for agents · ? for shortcuts',
    ].join('\n')
    expect(inspectPane(prose, 'codex', { now: 10_000 })).toMatchObject({ state: 'idle', reason: 'composer_glyph' })
  })

  it('is not busy when an exact quoted status row sits directly before the composer', () => {
    // The hardest shape: the quotation is the last row of the report, immediately above the box, so it occupies the status
    // position itself. It continues the answer instead of opening a block, and that is what the pane is read on.
    const directly = [
      'The tests passed and the tree is clean.',
      '◦ Working (8s • esc to interrupt)',
      '› Ask Codex to do anything',
      '  GPT-6-Luna high · ~/projects/flow-finish',
      '  ← for agents · ? for shortcuts',
    ].join('\n')
    expect(inspectPane(directly, 'codex', { now: 10_000 }).state).not.toBe('busy')
  })

  it('reads a real turn as busy whatever the body says', () => {
    const quoting = [
      '  ◦ Working (8s • esc to interrupt)',
      '  Ask Codex to do anything',
      '  GPT-6-Luna high · ~/repo',
      '  ← for agents · ? for shortcuts',
    ].join('\n')
    expect(inspectPane(quoting, 'codex', { now: 10_000 })).toMatchObject({ state: 'busy', reason: 'busy_hint' })
  })

  it('reads a narrow pane whose status bar wraps onto two rows', () => {
    const narrow = [
      '❯ ',
      '──────────────────────────',
      ' ☤ deepseek-v4.1-flash · 282K/1M',
      '   · enter прервать · tab в очередь',
    ].join('\n')
    expect(inspectPane(narrow, 'hermes', { now: 10_000 }).state).toBe('busy')
  })

  it('leaves the hint in scrollback alone when the status rows are free', () => {
    const scrollback = [
      '  ◦ Working (8s • esc to interrupt)',
      '  done — 3 files changed',
      '  ────────────────────────────────────────',
      '› Ask Codex to do anything',
      '  GPT-6-Luna high · ~/repo',
      '  ← for agents · ? for shortcuts',
    ].join('\n')
    expect(inspectPane(scrollback, 'codex', { now: 10_000 }).state).toBe('idle')
  })

  it('still refuses an empty frame and a modal', () => {
    expect(detectPaneBusy('', 'codex')).toBe('unknown')
    const modal = ['▌ Select an environment', '  1. staging', '  2. production', '← for agents · ? for shortcuts'].join('\n')
    expect(inspectPane(modal, 'codex', { now: 10_000 }).state).toBe('unknown')
  })

  it('does not hold a pane whose hint is exactly on the status rows of a finished turn', () => {
    // The other side of the asymmetry: hermes prints `enter прервать` on the very row it prints the box on, so a hint there
    // is a turn running — not a quote.
    expect(inspectPane(HERMES_BUSY, 'hermes', { now: 10_000 })).toMatchObject({ state: 'busy' })
  })
})
