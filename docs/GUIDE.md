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
- **Nothing ticks a flow on its own — opening the TUI or the Web UI does not either:**
  those two only render the badge. Run `flow tick` on a schedule (cron every minute is
  the usual setup; `--run` accepts a unique prefix) or call it by hand.
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
