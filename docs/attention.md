# Agent attention: "this agent is waiting for a human"

ReevesAgents answers one question the provider CLIs do not: **is any agent blocked on me
right now?** An agent that stops for an approval prompt or a clarify picker looks
identical to an idle one in the run list: the tile says `working` forever and the prompt
itself sits inside a tmux window nobody is watching. This page describes how that state is
detected, stored and surfaced.

## What is detected

`src/core/attention.ts` classifies the last 40 lines of an agent's pane into one of two
reasons:

| reason | meaning |
|---|---|
| `approval` | a blocking approval / sudo modal, or a command refused because no prompt could be delivered |
| `input` | a clarify picker: the agent asked a question and waits for an answer |

Everything else reports `null`: working, finished with a statement, ended.

A turn that ends with a bare question is **deliberately not detected**. In the pane such
a turn looks exactly like one whose answer is already typed into the input box (the TUI
keeps the old question on screen), so the earlier "last line ends with `?`" heuristic
raised badges that hung after the operator had answered. Attention is only for panes that
block. `AttentionReason` still carries `question` and the Web UI still has its label, so a
future detector can use them; no detector returns that value today.

## Why pane text

No provider CLI exposes a machine-readable "waiting for a human" state; each renders its
own blocking overlay. The pane is therefore the only surface that is true for every
provider. Detection is a pure read of `tmux capture-pane` output: it never types into an
agent and never answers a prompt.

The modal is matched **structurally**, not by its wording, so it works in every UI
language Hermes ships (10 locales):

- a box corner (`╭` / `╰`),
- a numbered, selectable option line (`│ ❯ 1. …`),
- the `↑/↓` navigation hint,
- the answer countdown (`(38s)`).

Keywords only decide *which kind* of prompt it is: a `?` in the prompt body means a
question, approval words in ten languages mean an approval, and an unknown modal defaults
to `approval` because a decision is the safer assumption.

## Where it is stored

The sweep writes `attention` on the agent record in `~/.reeves/runs/<run>/agents/<id>.json`:

```json
"attention": { "reason": "approval", "detail": "rm -rf /tmp/build", "since": "2026-10-28T20:09:40.885Z" }
```

`since` is stamped once per prompt and preserved while the same prompt stays open, so a
tile can show how long the agent has been waiting. The field is cleared when the prompt
disappears, and also when the stored pane is gone. Writes happen only on change: a sweep
over five agents does not churn the registry.

Two guards protect the record, because the sweep stores text that comes from a pane:

- **Pane membership.** A stored `tmux_pane_id` is reused after a tmux server restart, so
  the sweep first checks that the id still belongs to the agent's `tmux_session` (the same
  `paneInSession` rule `peekAgent` uses in `src/core/runtime.ts`) and only then captures it.
  Otherwise a stale id would read another session's pane and persist its command line on
  this record.
- **Redaction.** `detail` is raw pane text and an approval prompt carries the command line,
  so it can hold a key pasted into the agent's own prompt. The sweep runs it through
  `redactSecrets` before persisting, and `redactAgent` in `src/core/runs.ts` redacts the
  field again on every write. The MCP `list` output and the Web state therefore never see
  an unredacted detail.

The sweep runs in two places, both throttled through the same module marker:

- the **TUI Runs screen** (`src/surfaces/tui/screens/Runs.tsx`, 2 s tick), so attention is
  kept current even when the browser panel was never opened (the Web UI starts on demand);
- the **Web UI server** (`startWebServer`, every 2.5 s), with or without a browser
  attached, because the point is to alert an operator who is **not** looking at that tab.

Neither call site is a daemon: both reuse the throttle pattern of `src/core/reaper.ts`.

## Where it is shown

- **Agent tile status** (web UI): the status slot shows the attention instead of the
  lifecycle word (`approval needed` in red with a pulsing dot, `answer needed` in amber)
  and the card gets a coloured left edge. The lifecycle value is not lost: it sits in the
  tooltip next to the prompt text, and it returns to the tile by itself as soon as the
  prompt is gone. Nothing in the record is rewritten to fake a status.
- **Tab title**: `(2) ReevesAgents web` while two agents need attention, which survives a
  background tab where the tile is not visible.
- **Pending MCP approvals** raised through `request_approval` are mapped onto the same
  status slot (`source: "approval"`), so the two channels read the same way.
- **TUI**: the Runs screen drives the sweep but draws no badge of its own. The state is in
  the record, so the MCP `list` output returns it unchanged.

## Adding a provider

Detectors exist for `hermes` (approval and clarify modals), `codex` (its command approval
prompt) and `opencode` (its permission dialog, `permission.bash = "ask"`; with the default
permissions OpenCode never asks, so there is nothing to flag). Claude Code and the rest
still report nothing. To add one:

1. Capture a real prompt: run the provider in a pane, trigger its approval overlay and
   `tmux capture-pane -p -S -40 -t <pane>`.
2. Write `detectXAttention(paneText)` returning `{ reason, detail } | null`, matching
   structure rather than wording whenever possible.
3. Register it in `DETECTORS` in `src/core/attention.ts`.

Nothing else changes: the sweep, the record field, the MCP output and the web badge are
provider-agnostic. Keep a captured pane as a fixture in `test/attention.test.ts`; when the
provider redesigns its overlay, that test is the alarm.
