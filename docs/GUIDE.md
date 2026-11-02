# ReevesAgents User Guide

**English** · [Deutsch](GUIDE.de.md) · [Français](GUIDE.fr.md) · [Español](GUIDE.es.md) · [Português](GUIDE.pt.md) · [Italiano](GUIDE.it.md) · [Türkçe](GUIDE.tr.md) · [Русский](GUIDE.ru.md) · [简体中文](GUIDE.zh-Hans.md) · [العربية](GUIDE.ar.md)

This guide walks you from a fresh install to the point where one agent is
running the others for you. When you need every command and option instead,
that lives in the [online user guide](https://reevesagents.mertkayacs.com/docs/).

## What ReevesAgents is

- A free, local workspace where your AI coding agents (Claude Code, Codex,
  Hermes, DeepSeek, Kimi, Gemini CLI, Cline CLI, Crush, Goose, Kilo Code,
  Letta Code, Mistral Vibe, Grok Build, Kiro CLI, Factory Droid, Qoder CLI,
  Warp, Junie CLI, GitHub Copilot CLI, Cursor CLI, Rovo Dev CLI, and more) work
  side by side on your machine.
- One agent can create and drive the others through the MCP. For example, a
  Claude Code session can run Codex and Claude Code agents on separate tasks.
- You can also use ReevesAgents as a plain workspace: spawn the agents you want
  and keep adding more with `reevesagents add`. They sit side by side, and
  nobody controls anyone until you opt into the MCP.
- It sits on top of the CLIs you already have, so every login stays where it
  always was. ReevesAgents never holds an API key and never touches your model
  traffic.
- Its entire state is a bit of JSON under `~/.reeves`. There is no database
  to run, no Docker to pull, and nothing sitting in the background.

## Before you start

- macOS, Linux, or Windows 10 1809+ (native Windows is supported through the built-in winmux (ConPTY) runtime; WSL also works).
- Node.js 22.12 or newer.
- tmux 3.0 or newer (not needed on native Windows; winmux ships with reevesagents).
- At least one provider CLI installed and logged in: Claude Code, Codex,
  OpenCode, Hermes, Kimi, DeepSeek, Pi, Qwen, Aider, Gemini CLI, Cline CLI,
  Crush, Goose, Kilo Code, Letta Code, Mistral Vibe, Grok Build, Kiro CLI,
  Factory Droid, Qoder CLI, Warp, Junie CLI, GitHub Copilot CLI, Cursor CLI, or
  Rovo Dev CLI.

## Tools

- Four tools sit next to the coding CLIs: Perplexity CLI (web search),
  Google Colab CLI (CPU, GPU and TPU runtimes), Hugging Face CLI (models and
  datasets on the Hub) and Ollama (local and cloud models). Agents run them from
  their own shell.
- `reevesagents tools` shows which of them are installed and whether you are
  signed in (for Ollama: whether the server answers), with a purpose and an
  example command for each. Add `--json` for scripts.
- An agent with the MCP attached calls `list_tools` to get the same list.

## Install and check

- Install it with Homebrew: `brew install mertkayacs/reevesagents/reevesagents`,
  or globally with a Node package manager like pnpm: `pnpm add -g reevesagents`
- Check your machine: `reevesagents doctor` (verifies Node, tmux, the state
  folder, and which provider CLIs it can see).
- Launch it: `reevesagents`
- Prefer npm, Yarn, Bun, or npx? See [Install](https://reevesagents.mertkayacs.com/docs/#install) in the online guide.

## Your first run

The quickest reproducible run is from the command line. A run has one lead agent
and any number of workers; each agent is written as `provider[:nickname[:model]]`:

```sh
reevesagents spawn claude-code:lead codex:worker \
  --name "first run" \
  --prompt "Say hello and list the files in this folder."
```

- `claude-code:lead` is the lead, `codex:worker` is a worker. With no agent
  named, the run defaults to `codex`.
- `--name` labels the run, `--cwd` sets the working folder (defaults to where you
  are), and `--prompt` is pasted into each agent.

Prefer a visual start? Run `reevesagents` for the TUI or `reevesagents web` for
the local Web UI and create the run from there.

Do not want to plan the whole team up front? Spawn one agent and grow the
workspace as you go. `add` joins your most recent run, so there is no run id to
copy around:

```sh
reevesagents spawn claude-code:lead
reevesagents add codex:worker
```

## The five ways to use it

You reach the same runs through five surfaces. Pick whichever fits the moment:

- **TUI** (`reevesagents`): the terminal app most people live in. Everything is
  a menu, so the arrow keys are all you need.
- **Web UI** (`reevesagents web`): the same runs on one browser page, with a
  live look into any agent. It only ever answers on loopback.
- **CLI** (`reevesagents spawn`, `runs`, `peek`, `open`, `stop`): for scripts,
  or for the days you would rather type than browse.
- **tmux**: where the agents actually live. Because each one is a real CLI in
  its own pane, closing the TUI or the Web UI never interrupts anyone.
- **Agent control** (`reevesagents attach <cli>`): the opt-in MCP that lets one
  agent drive the rest. The next section walks through it.

## Let one agent drive the rest

This is the core feature, and it stays off until you turn it on.

- Turn it on for your CLI with `reevesagents attach claude`, or run a bare
  `reevesagents attach` to connect every installed CLI it can host. The
  **Agent control** screen in the TUI and Web UI does the same thing.
- `reevesagents hosts` shows where you stand: every CLI on the machine, and
  which of them are connected.
- Then restart that CLI once, because tools are only picked up at session start
  (this is plain MCP, the standard way one agent tool exposes commands to
  another).
- From that point on, your agent can put a new agent on a task, type into it,
  read what it is doing, and approve or deny whatever it asks for.

A worked example: attach to Claude Code, restart it, and from inside one Claude
Code session you can spawn a Codex agent on one issue and a second Claude Code
agent on another, then watch and steer both.

- CLIs that can host this today: claude, codex, kimi, qwen, opencode, hermes.
  OpenCode is attached by hand, since its own add step is interactive.
- Workers do not get these tools by default, so a worker cannot spawn more
  agents. To let a worker drive its own sub-agents, attach the MCP to that
  worker's CLI too.
- To disconnect later: `reevesagents detach claude`.

## Everyday tasks

- See what is running: `reevesagents runs` (add `--json` for scripts).
- Watch one agent without leaving your shell: `reevesagents peek <agent> -n 40`.
- Jump into an agent's tmux pane: `reevesagents open <agent>`.
- Stop a whole run: `reevesagents stop <run> --yes`.
- Stop a single agent: `reevesagents kill <agent> --yes`.
- See what agents are asking for: `reevesagents approvals`, then
  `approve <id>` or `deny <id>`.
- `stop` and `kill` end work, and the `delete` commands remove ended records.
  All of them refuse to run without `--yes`.

## Running a dev -> review -> fix flow

A flow attaches the dev -> review -> fix loop to one run and keeps its state in
`~/.reeves/flows/<run-id>.json`. The run row in the TUI and the run card in the Web
UI show a badge (`flow: review (2/6)`, `flow: escalated`), and a flow that needs a
human is highlighted with the same warning colour as a stale run.

- `reevesagents flow start --run <run> --dev <agent> --review <agent>` — attach a
  flow to an existing run. Both agents must already belong to that run, and `--repo`
  defaults to the run's working directory. Add `--spec <file…>` to queue the blocks
  the dev receives after the first ACCEPT. A run carries one flow: an active one is
  never replaced, and `--replace` only restarts a closed (escalated or done) one.
- `reevesagents flow status --run <run>` — state, round budget, the commit under
  review, the last verdict and the last decision. Add `--json` for scripts.
- `reevesagents flow tick --run <run> --dry-run` — print what the engine would do
  next without sending anything or writing the flow file. Drop `--dry-run` to
  apply it; the engine then pastes through its idle check and refuses a pane that
  is not positively free.
- `reevesagents flow add-spec --run <run> --file <spec.json…>` — queue more work after
  the flow started. A structured spec must carry `requirements` and `checks`; a block
  without them is refused. `--markdown <file…>` queues a brief as an *unstructured*
  block on purpose: the CLI warns, and `flow status` shows it, because the reviewer has
  no acceptance criteria to check.
- `reevesagents flow pause --run <run>` / `reevesagents flow resume --run <run>` —
  park the flow and put it back. A paused flow is never ticked and never sends, and it
  keeps no half-finished dispatch. `resume` returns it to the state it was paused from;
  on an escalated flow it grants a fresh round budget.
- `reevesagents flow stop --run <run> --yes` — close the flow for good. Nothing is sent
  afterwards, and the file is kept so `flow status`/`flow logs` still explain what
  happened. Without `--yes` the command refuses.
- `reevesagents flow notes --run <run> [--head <sha>] [-r <N>] [--json]` — the reviewer's findings
  for one round, read from the notes file the engine published. Defaults: the commit under review and
  the newest round that has notes. A round that was answered only in the reviewer's pane has no file —
  that prints "no notes" and exits 0; a round that never happened is an error and names the rounds that
  exist. The file itself lives at `~/.reeves/flows/<run-id>/notes/<head>-r<N>.md`; secrets and
  absolute paths are already removed from it, and they are removed again on the way out.
- `reevesagents flow logs --run <run> [-n 20] [--json]` — the flow's own journal:
  transitions, dispatches, verdicts, refusals and escalations, newest last. It never
  holds a prompt body. An entry that consumed a review round points at it — `→ notes/<head>-r2.md ·
  2 MAJOR, 1 MINOR` — so the journal says where the findings are without carrying them.
- **A flow is advanced by whatever is running:** an open Web UI dashboard ticks every live flow on its own
  cadence (`flow_tick_ms`, default 60 s — see "The plan drives the flow by itself" below), and
  `reevesagents flow tick --all` does one pass for a cron job or a headless machine. The TUI only renders the
  badge and ticks nothing, and `GET /api/state` does not tick either. Set `flow_tick_ms` to `0` to switch the
  autonomous tick off and keep the manual `flow tick` / `flow tick --all` path.
- Two ticks at the same time are safe: the first writes the dispatch it is about to
  send into the flow file, and the second finds that claim and sends nothing. If a
  tick dies mid-send, the claim is escalated to a human after two minutes instead of
  being pasted again.
- `pause` and `stop` also win against a tick that is already preparing a send: the
  runner holds the dispatch gate for the whole act (check, paste, settle) and the
  control commands take the same gate, so a flow you stopped does not receive one
  last prompt (`flow tick` reports `cancelled`). If a prompt is being typed at that
  moment the command waits for it and, past 15 seconds, answers "a dispatch is in
  flight — try again in a moment" without changing anything.
- **When a flow stops on its own, the journal says why** (`reevesagents flow logs --run <id>`):
  `review_unsubstantiated` — the reviewer answered too fast or without recording a finding; the engine
  re-asked once with a stricter prompt and then escalated, so look at the reviewer's agent: `flow notes`
  shows what it actually wrote, and a second `flow tick` after a `flow resume` retries the round.
  `composer_dirty` — the pane's input box already held text that was not the flow's; nothing was pasted,
  the flow is escalated, and a human has to clear or send that text before resuming.
  `target_not_ready` — the pane has not drawn its composer yet (a fresh agent, a modal, a login screen);
  nothing was pasted and the round was not spent, so the next `flow tick` retries.
  `dispatch_unconfirmed` — the text is in the pane but the Enter did not visibly start a turn; the claim is
  released, the engine presses Enter again only if the composer still holds exactly that text, and the
  round's answer is not dispatched a second time: the flow waits for the dev to commit (a new head is picked
  up even though the round's answer is already consumed, and it starts the next review) or for you to look
  at the pane. A *refused* dispatch is different — nothing was pasted,
  so the next `flow tick` retries the same answer.
- A flow whose run was stopped, deleted or swept is parked as `orphaned`: `flow status`
  prints the reason, nothing is ticked, and `flow stop` is how you close it. Deleting
  the run's history record deletes the flow file too — that is the only automatic
  deletion.

### What you see in the Web UI

The **Logs** button in the header (right after About) opens a dialog with two tabs:

- **Plan** — the selected run's plan: a `done/total` bar, a *waiting for you* block (items without a brief, blocked
  items), the items in document order with status badges, and a click on any item shows its commit, rounds, review
  notes reference and brief path. Filters: all / open / waiting. A run without a plan shows "No plan yet".
- **Logs** — the notification journal: time, run, agent and what was reported, with a run filter and "unread only",
  plus *Mark all read*. It refreshes itself from the live stream, so there is nothing to reload.

The card of the agent that has unread news pulses — not the whole sidebar: a run-level event pulses the run's cards.
The length is `agent_pulse_ms` (`0` turns it off), it counts down from the event's own timestamp, and it stops when you
mark the log read. On a narrow window the log rows collapse to time and message.

### The notification journal

Every run that starts, every approval that waits for you, every flow that escalates and every plan item that
closes or blocks is written to `~/.reeves/notifications.jsonl` (append-only, `0600`, rotated at 2000 events or
2 MiB and trimmed to the newest 1500 / 1.5 MiB). Read it without a browser:

- `reevesagents notifications list [--run <id>] [--unread] [--limit N] [--json]` — newest first; `*` marks unread.
- `reevesagents notifications read [--seq N]` — move the watermark (monotonic; it never goes back).

`kind` says what happened (`run.created`, `run.stopped`, `run.archived`, `agent.needs_human`, `agent.failed`,
`agent.finished`, `probe.failed`, `flow.escalated`, `flow.review_timeout`, `plan.item_done`, `plan.item_blocked`,
`plan.item_needs_brief`, `external`) and `severity` says whether it needs you now: `error` — something failed, `warn` — a human is
required, `info` — progress. The two flow kinds and the three plan kinds are product-only: the ingest route refuses
them, and it always stores an ingested event as `source: external`, so a supervisor cannot fake "a human is
required".

The journal is readable today from the CLI above and from `GET /api/notifications` / `GET /api/state` (which
carries `{latest_seq, unread, latest_ts}`). The Web UI's Logs dialog and the agent-card pulse are block 15 and are
not in this branch yet; `agent_pulse_ms` is the setting that dialog will use (`0` turns the pulse off), and until
then it is a stored preference with no consumer.

### When the flow escalates

An escalation is never silent: the tick raises **an approval** (`flow escalated: <reason> (P1.7.2) — continue with a
fresh budget, or stop the flow`), so it appears where your other approvals appear — in the TUI's Approvals screen and
in the Web UI.

- **Approve** puts the item back in the queue (`queued`), zeroes the flow's round counter and returns it to `idle`:
  the next tick picks the item up again.
- **Deny** closes the flow as `done` with a `close_reason` that carries the escalation reason and your note; the item
  is closed as `skipped`. Nothing else is sent.

One escalation, one approval: a ticker that sees the same escalated flow again does not create a second ticket. A new
episode (after a `flow resume`, then another escalation) is a new decision.

### Machine tokens are not translated

Prompts are English by decision (2026-11-01). The machine tokens — `VERDICT: ACCEPT|CHANGES_REQUESTED`,
`BLOCKER|MAJOR|MINOR`, `file:line`, `no findings` — are part of the contract and are never translated, in any locale;
the parser still accepts the older `ВЕРДИКТ:` spelling so files and panes written before the canon keep working.

### The plan drives the flow by itself

Once a plan is imported and a brief is attached to an item, nobody has to type `flow tick`: an open dashboard
(Web UI) advances every live flow on its own, one step at a time, every `flow_tick_ms` (default 60 s), and
`reevesagents flow tick --all` does the same thing once for a cron job or a headless machine. Both call the same
function, and the claim protocol makes two of them harmless: if a cron tick and a dashboard tick meet, one of them
sees the other's claim and does nothing instead of pasting the prompt twice.

A fresh flow starts by itself: an imported plan with a ready item is dispatched on the **first** tick, not after
somebody else's ACCEPT. The head check still wins when the head has moved — a new commit is reviewed before the plan
takes the next item — and a queued block (`flow add-spec`) is sent the same way. `flow plan next` only reads: **it
never pastes and never queues**. The tick dispatches, and the command says so (`ready for dispatch`, then `nothing was
sent by this command`).

What happens without you is one of three things, and only the first is "progress":

- **the plan moves** — the ticker takes the next item that has a brief, dispatches it, and closes it on an
  accepted review. A reviewer asking for changes is normal work, not a stop.
- **the plan waits** — nothing can be taken. An item without a brief is skipped, not obeyed: the picker takes the
  next one that has a brief, so a single missing brief does not stop the plan. The flow waits only when no
  remaining item can move — every open item lacks a brief, or the head is `blocked_owner` (a human already decided
  to hold it), or the remaining items are `missing` from the document (they exist in the mirror but the file no
  longer lists them). `flow status` names them (`waiting: P1.7.2 (needs a brief)`) and the run badge says
  `plan: waiting for a brief (P1.7.2)`. The flow holds, stays in a working state, and does not escalate. To
  continue: attach the brief (`flow plan attach`) or decide the item (`flow plan set --item <id> --status
  queued|skipped`) — the next tick picks it up.
- **the flow escalates** — this is not a plan stop but a pipeline one: the reviewer did not answer within
  `review_timeout_sec`, the round budgets ran out (`rounds_exhausted` / `total_rounds_exhausted`), or the
  reviewer kept answering without evidence (`review_unsubstantiated`). `flow status` shows `escalated` and the
  reason, and `flow resume` gives it a fresh budget once the cause is dealt with.

The plan is **done** when every item is `done` or `skipped` — that is the only automatic close.

To turn the autonomous tick off, set `flow_tick_ms` to `0`: `flow tick` keeps working, and a machine with its own
cron usually wants that.

### Three things a flow assumes about your repository

- **The project must be a git repository with at least one commit.** `flow start` refuses a directory without a HEAD
  (`cannot read HEAD in <dir> (is it a git repository with a commit?)`), and a tick that cannot read one stops on
  `head_unknown`. This is a contract, not a limitation: a verdict, a notes file and an item closed as `done` are all
  bound to a **commit**, so without commits there is nothing to review and nothing to prove.
- **Any commit in that repository is treated as work.** The tick compares the repository HEAD with the commit it has
  already accounted for; a moved head means "the dev made progress" and the flow asks for a review of that commit — no
  matter who made it. So put the plan, the briefs and any other documentation into a commit **before** `flow start`
  (or while the flow is paused / stopped), otherwise the flow politely reviews your plan instead of your code. This is
  not a guess: it happened on the sandbox, where a plan committed mid-flow sent the reviewer after the document.
- **Briefs live inside the repository.** `flow plan attach` refuses a path outside the project (`… is outside the
  repository`) because the brief travels with the code it describes, and the mirror stores it as a repository-relative
  path. The recommended place is `docs/briefs/<item-id>.md` (or `.json`), next to the plan document.

### Order matters: the plan and its briefs are committed before `flow start`

The engine treats **any** commit as progress: a moved HEAD is reviewed. Documents about the work are not the work, so
the plan and its briefs belong in a commit **before** `flow start` — or, if they change mid-flight, while the flow is
parked:

```bash
flow pause       --run <id>          # stop handing out work
$EDITOR docs/implementation-plan.md  # and docs/briefs/<item>.md
git commit -am 'docs: plan'
flow plan import --run <id> --file docs/implementation-plan.md
flow plan attach --run <id> --item P1.7.1 --spec docs/briefs/P1.7.1.md
flow resume      --run <id>          # the new HEAD becomes the baseline
```

Two rules make that safe. `flow plan import` and `flow plan attach` move the flow's baseline to the current HEAD
(`plan_documents_anchored`), because they change documents, not code. `flow resume` re-anchors on the current HEAD as
well: everything committed while the flow was parked is "already accounted for" and earns no review. And if a commit
that touches **only** the plan or `docs/briefs/` slips in while the flow runs, the tick re-anchors on it
(`documentation commit …: baseline moved, nothing to review`) instead of sending a reviewer after a document.

### The flow's own placeholders (why an empty Hermes pane is safe)

The engine pastes into a pane only when the composer is empty. "Empty" means **the provider's hint**, not "no
characters": Hermes draws a rotating invitation (`Спросите о чём угодно или введите / для команд…`, `Ask anything, or
type / for commands…`), Codex draws `Ask Codex to do anything`. A hint is recognised in every locale the TUI ships, and
structurally too — an invitation to use commands ends in an ellipsis and names `/` — so a reworded hint does not need a
release. Anything else in the box is somebody's unsent text: the flow refuses (`composer_dirty`) instead of pasting
over it. If you ever see `composer_dirty` on a pane that looks empty, the hint was not recognised: send the pane
capture with `docs/GUIDE.md`'s troubleshooting note and it becomes a test case.

### A verdict that arrived at the wrong moment is not lost

If a review answer is collected while the flow is momentarily `idle` (a resumed flow, a round that ended in the same
tick), the next tick does not answer `head_unchanged`: it takes the verdict it already has. `CHANGES_REQUESTED` sends
the fix to the dev, an `ACCEPT` closes the plan item and takes the next one. It happens once per commit — the marker is
`verdict_handled_for` — so you will not see the same fix twice, and a new commit earns a new verdict.

### When the flow says `dispatch_unconfirmed`

`dispatch_unconfirmed` means the prompt reached the pane but nothing proved that the agent started on it: the busy
hint never appeared inside `dispatch_confirm_seconds` (default 90 s), even after the one extra Enter the engine is
allowed to press when the composer still holds exactly its text. What to do, in order:

1. **Look at the pane.** `reevesagents attach <agent>` and read the composer. If the prompt is still sitting there, the
   agent never submitted it: press Enter once by hand and let it run — the engine never types the same text again, so
   there is no risk of a double prompt. If the composer is empty and the agent is working, the dispatch simply
   confirmed late; nothing to do.
2. **Check the round, not the tick.** For a review request the round has already started (the clock is running and the
   notes file is read as soon as the reviewer writes it), so the answer will arrive on a later tick even though the
   send was reported as unconfirmed. `flow status` shows `review: waiting` and the deadline.
3. **Only then decide.** If the agent is idle with an empty composer and no notes file appeared by the deadline, the
   round times out and the flow escalates with `review_timeout`; `flow resume` gives it a fresh budget once you know
   why (a provider that was not ready, a wrong pane, a login screen).
4. **Never paste twice.** A second paste of the same prompt is how a queued Enter ends up answering something nobody
   asked for, so the engine refuses it by design and so should you.

`pane_changed` is a different message: the paste landed but the pane stopped looking idle before the Enter, and the
composer no longer held the engine's text. Nothing was submitted; the next tick retries when the pane is free.

### The plan as an object

**How a project runs on its plan:** `flow plan import` once (and again after the document changes) →
`flow plan attach` a brief for each item you want done → let the timers run (or `flow plan next` to see what comes next:
ACCEPT the engine takes the next item by itself) → review, ACCEPT, and the item closes with the commit that
closed it. `flow plan` shows `done/total`, what waits for you, and which item is next; `flow status` shows the
same one-line summary, and each item's row carries its commit, its rounds and a reference to the review notes of
the round that closed it.

A plan file that exists but cannot be read stops the tick with an error naming it: the flow will not fall back to
"there is no plan", because that is how a flow closes with items still open.

Two budgets: `--max-rounds` is the budget of **one item** (how many fix rounds it may spend before it blocks as
`blocked_owner` with `rounds_exhausted`), and `--max-total-rounds` (default `4 × max-rounds`, at most 100) is the
flow's fuse. A flow without a plan ignores the fuse and keeps the old meaning of `--max-rounds`.

`reevesagents flow plan …` mirrors the project's own plan document (the `- [ ]` / `- [x]` list in
`docs/implementation-plan.md`) into `~/.reeves/flows/<run-id>/plan.json`, so the flow knows what is done and
what is left. The design is `docs/plan-model-design.md`; two rules matter when you use it:

- the document decides **which items exist**, the mirror decides **what happened to them**. Editing the
  document cannot close an item, and a closed item is never reopened by a tick — the disagreement is
  reported as a *conflict* instead.
- `done` means an ACCEPT of the commit that closed the item, or an explicit `flow plan set … --status done
  --yes --note <why>`. A `[x]` you type yourself is not evidence.

- `reevesagents flow plan import --run <run> --file docs/implementation-plan.md [--dry-run]` — import or
  re-import the document. The path is resolved against the run's project directory (so it works from any
  cwd) and must stay inside it: a file from your home directory is refused rather than stored as `~/…`. New items
  are added as `pending`, items the document dropped are kept and marked `missing` (never deleted), and a document
  that disagrees with the record adds a conflict. An unchanged file changes nothing. Exit code 3 means conflicts.
- `reevesagents flow plan --run <run> [--json]` — progress (`12/23 done`), the buckets that wait for you
  (`needs_brief`, `blocked_owner`, `missing`, conflicts) and the next item in document order.
- `reevesagents flow plan attach --run <run> --item P1.7.1 --spec docs/briefs/P1.7.1.json [--queue]` —
  attach the brief. It is validated by the same `BlockSpec` validator as `add-spec`, its `id` must equal the
  item id (a markdown brief takes the item id instead, because a heading slug cannot equal `P1.7.1`), and it
  is stored as a *snapshot*: the dispatch stays reproducible, and an edited brief is refused
  rather than silently picked up. Without `--queue` the item becomes `queued` in the plan only — run
  the next tick (block 13/19) to put it on the flow: nothing else has to be run.
- `reevesagents flow plan status --item P1.7.1 [--run <run>] [--json]` — one item: status, the commit that
  closed it, its rounds, its notes reference and its brief.
- `reevesagents flow plan next --run <run> [--json]` — the item the plan wants next, and why. It reads only
  (block 19): the tick dispatches. It takes the first item in document order that has a brief and sends its block;
  an item without a brief is reported ("waiting for a brief"), never dispatched and never invented; one
  task per flow, so an item already in flight stops the picker.
- `reevesagents flow plan set --run <run> --item P1.7.1 --status <status> [--yes] [--note <text>]` — move an
  item by hand. `done` and `skipped` need `--yes`, and a `done` without an accepted commit also needs a
  `--note`; the manual close is recorded in the plan's conflicts so `flow plan` shows how it was closed.
  The command follows the human status table: it may triage (`pending`, `needs_brief`, `queued`,
  `blocked_owner`) and close (`done`, `skipped`), but it may not touch an item whose round is running
  (`in_work`, `reviewing` — `pause`/`stop` the flow instead), and a closed item cannot be reopened. A wrong
  close is fixed in the document and re-imported, where it shows up as a conflict instead of silently
  rewriting history.


## Keeping cost down

- Put a cheap or free model in front as the router, and let it wake the
  expensive one only when a task actually deserves it.
- Routine code and tests are exactly what the cheaper models are for. Save the
  big model for planning and design instead of paying it to write boilerplate.
- Whatever this costs you, it is your providers' normal billing. ReevesAgents
  itself adds nothing on top.

## When something looks off

- Start with `reevesagents doctor`, because it usually names the problem for
  you: Node, tmux, the state folder, and every provider CLI get checked.
- **tmux missing:** install it (`brew install tmux` or `apt install tmux`) and
  let doctor confirm.
- **A provider is not detected:** it is almost always not installed or not
  logged in. ReevesAgents can only launch what is on your `PATH` and signed in.
- **Web UI reports missing packages:** the optional `ws` and `@lydell/node-pty`
  modules were skipped at install time. Reinstalling normally brings them back.
- **Port already in use:** nothing is wrong; `reevesagents web` uses the next
  free port and prints the URL. Pass `--port <n>` if you care which one.
- More detail in [Troubleshooting](https://reevesagents.mertkayacs.com/docs/#troubleshooting).

## Where to go next

- [Docs home](README.md): the full documentation index.
- [Commands](https://reevesagents.mertkayacs.com/docs/#commands): every subcommand and flag.
- [Agent control](https://reevesagents.mertkayacs.com/docs/#agent-control): the full opt-in model.
- [Configuration](https://reevesagents.mertkayacs.com/docs/#configuration): what lives under `~/.reeves`.
- [docs/mcp.md](mcp.md): the Agent control design and tool list.
