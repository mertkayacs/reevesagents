# ReevesAgents Design

Canonical design document. Last updated 2026-05-30.

This file captures the current product shape and architecture. Local historical specs may exist under `specs/`, but they are git-ignored working notes, not release documentation. This document and the source code are the current source of truth.

## TLDR

ReevesAgents is a local, tmux-first workspace for real AI CLI terminals and agent teams.

- The human at the keyboard is the primary role.
- TUI is the human's dashboard and control room.
- Spawner mode is the default: many independent provider CLI terminals, no MCP injection, no root/worker roles.
- Orchestrator mode is BETA: root agents, workers, MCP tools, messages, approvals, and agent spawning.
- MCP is the Orchestrator BETA programmatic control plane for root agents, workers, and external operator clients.
- CLI is an optional human/script operator surface. It has friendly commands for common actions and `call` for direct access to MCP tools.
- One run is one tmux session. Each terminal or agent is a tmux window inside that run.
- Window 0 of every run is a linked or placeholder `reeves` window when tmux can provide one.
- Runtime state and presets are local JSON under `~/.reeves/`. This registry is the source of truth; tmux is the execution and viewing surface.
- Users interact with terminals or agents by opening the real provider CLI window through tmux.
- Spawner terminals do not interact with ReevesAgents or each other; the human coordinates them manually.
- Orchestrator agents interact with other agents through MCP tools.
- Interaction model: visible menus with arrows, Enter, Esc/Backspace, and text entry inside fields. Pickers use Left/Right and Welcome also accepts `q` to quit. No slash commands, Tab-driven focus panes, or hidden command palette.
- No embedded terminal emulator.

## Product Promise

ReevesAgents helps a human run, observe, open, and control multiple AI CLI terminals or agents without losing track of them.

The product answers four questions quickly:

- What runs are active?
- Which terminals or agents are inside this run?
- What is each terminal or agent doing?
- How do I open or guide the right terminal or agent?

It does not try to be a desktop IDE, a terminal emulator, a policy platform, a logs product, or a workflow engine.

## Core Terms

Run:

- A user-facing work session.
- Backed by one tmux session.
- Contains a `reeves` window when available.
- In Spawner mode, contains independent provider CLI terminals.
- In Orchestrator BETA, contains one root agent or headless root record and zero or more workers.

Terminal:

- A real provider CLI running in a tmux window.
- Backed by Codex, Claude Code, OpenCode, or Hermes.
- Has no ReevesAgents context, no MCP config, no root/worker role, and no inbox or approval flow.

Agent:

- A real provider CLI running in a tmux window.
- Backed by Codex, Claude Code, OpenCode, or Hermes.
- Has a role: root or worker.
- Exists only in Orchestrator BETA.

Reeves window:

- The ReevesAgents TUI window inside the run.
- Window 0 when tmux linking succeeds; otherwise the registry keeps the stable Reeves target.
- Shows the Run page for that run.
- Lets the human inspect the run, open terminals/agents, add terminals/workers, see Orchestrator approvals, and stop the run.
- It is not an agent. It does not talk to a model.

Local state:

- The local JSON state ReevesAgents owns under `~/.reeves/`.
- Used by TUI, MCP, and CLI to find runs, agents, tmux sessions, windows, panes, approvals, presets.

Preset:

- A JSON run template.
- Stores default provider, model, prompt, working directory, permissions, and worker list.
- Not a script, automation graph, or hidden workflow.

## Modes And Roles

### Spawner mode

Spawner mode is the default and the low-permission path. The human creates a tmux workspace with one or more independent provider CLI terminals. ReevesAgents stores metadata and can open, peek, close, and stop windows, but it does not connect those CLIs to ReevesAgents.

Spawner launch must not:

- write provider MCP config files
- pass `REEVES_SESSION_ID`, `REEVES_AGENT_ID`, `REEVES_RUN_ID`, or `REEVES_ROLE`
- generate Claude MCP config files
- add Codex MCP overrides
- paste root/worker capability notes
- create approval or inbox expectations

### Orchestrator mode (BETA)

ReevesAgents has four roles. Three are programmatic (MCP callers); one is the human at the keyboard. The human is the primary role; the others serve the human.

### The four Orchestrator roles

**Human (the boss).** Sits at the keyboard. Uses the TUI as a dashboard. Jumps into any agent's tmux window to type into that provider CLI directly. Approves or denies risky requests workers send up. Stops runs, kills workers, removes ended runs. Never locked out of any agent.

**Root agent.** The lead of one tree. Drives workers through MCP: pastes prompts with `send_text`, fires Enter with `send_key`, reads pane output with `peek`, blocks until a worker finishes with `wait`, resolves worker approvals, spawns more workers, stops its own run.

**Worker agents.** Children under one root. Each handles a specialized part. Limited MCP surface: update their own status, read their inbox, request approval, send messages inside the run, peek themselves, return the human to the reeves window.

**Operator.** Any MCP caller with no `REEVES_SESSION_ID` set. External clients, scripts, or a user's host CLI that has reevesagents MCP registered but is not yet inside a tree. Full access by default.

### Paths the human uses

0. **Spawner from TUI or CLI.** Open `reevesagents`, choose New Run, choose Spawner, configure one or more provider CLI terminals, then start. Or run `reevesagents spawn codex cc:reviewer`. The spawned CLIs receive only their own prompt. The human coordinates manually through tmux.

1. **From the TUI.** Open `reevesagents`, choose New Run, fill in root provider, model, prompt, plus optional workers, then start. The TUI calls the runtime directly. A new tmux session is created for the run with a `reeves` window at window 0 when linking succeeds, the spawned root after it, and workers after that. The human can watch from the TUI or attach to the run session.

2. **From any CLI with reevesagents MCP installed.** The human, sitting in their host CLI (e.g., Claude Code or Codex with reevesagents registered), says "use codex for this task" or "spawn a worker that reviews this file". The host CLI calls reevesagents MCP. ReevesAgents creates a tree. A new tmux session is created. The new root drives the worker via MCP. The human reaches the tree by opening the reeves TUI window in the new session.

In path 2 the host CLI is the orchestrator. The human told their Claude "delegate this to codex", and Claude, as operator, spawned a fresh root and started driving it. The TUI is still available as the visual top view.

3. **Host CLI becomes the root (headless root).** The human tells their host CLI "you are the root, spawn workers". The host CLI calls `start_run` with `root_is_caller: true`. ReevesAgents creates a tmux session and workers but writes no root tmux window — the calling CLI is the root. The host CLI then drives workers via `spawn_worker`, `send_text`, `peek`, `poll_approval`, and `get_inbox`. The root `AgentRecord` is written with `headless: true`. The TUI sees the full run including the headless root and all workers; the human uses the TUI to watch workers and manage approvals.

### Control room

Each run's tmux session is the control room for that run. Multiple runs mean multiple tmux sessions.

```txt
tmux session: reeves_<run-name>_<id>
  window 0: reeves           ← TUI anchor when tmux linking succeeds
  window 1: root-<provider>  ← the root CLI
  window 2: <worker-1>       ← child CLI
  window 3: <worker-2>       ← child CLI
  ...
```

The human moves between windows as tabs inside one run session. Window 0 is the `reeves` window when available. Selecting an agent and choosing Open Agent jumps to its window. Coming back means selecting the `reeves` window, running `reevesagents open <run-id>`, or asking an agent to call `open_reeves`.

## Hard Decisions

- tmux is required.
- The human is the primary role. Programmatic roles serve the human.
- A Spawner run can be started from the TUI or `reevesagents spawn` without MCP setup.
- An Orchestrator BETA tree can be planted from the TUI, from the CLI, or from any host CLI that has reevesagents MCP installed.
- ReevesAgents starts Spawner terminals with only the user prompt.
- ReevesAgents starts Orchestrator BETA agents with a role-specific capability note plus the user task.
- Each run owns one tmux session. Each non-headless terminal or agent is one tmux window in that run session.
- One Orchestrator run has one root agent and zero or more workers.
- Window 0 is `reeves` when tmux linking succeeds; the registry still stores the stable Reeves window id.
- Root has run-control and approval capability through ReevesAgents MCP.
- Workers use the same MCP command but get limited behavior by role.
- External MCP callers are treated as operator callers.
- The local user account is the security boundary for external MCP callers.
- There is one MCP command: `reevesagents mcp`.
- Capabilities are enforced by caller role and simple rules, not separate MCP modes.
- Workers ask root for approval.
- Root can approve or deny worker approval requests in its run.
- TUI and external operator MCP callers can also approve or deny requests.
- No embedded terminal emulator.
- TUI uses visible menus as the canonical path. Keyboard input is arrows, Enter, Esc, Backspace, text fields, picker Left/Right, and Welcome `q` to quit.
- No slash commands, Tab-driven focus panes, or hidden command palette.
- TUI does not include a prompt composer for provider conversations.
- Users type into agents by opening the real CLI window.
- Programmatic input control is MCP-only and belongs to Orchestrator BETA.
- Provider auth stays inside provider CLIs.
- ReevesAgents does not store provider API keys, OAuth tokens, passwords, or subscription credentials.
- Supported providers are Codex, Claude Code, OpenCode, and Hermes.
- Presets stay as simple run templates.
- Doctor is setup and environment health only.
- Ended and stale runs auto-clean on every Runs refresh.
- CLI stays compact but is not second-class: spawn, open, list, peek, stop, kill, doctor, Orchestrator setup, MCP server, and `call` for all MCP tools.

## Runtime Model

Each run is one tmux session:

```txt
tmux session: reeves_project_api_<id>

window 0: reeves when tmux linking succeeds
window 1: root-codex
window 2: opencode-reviewer
window 3: cc-planner
window 4: hermes-tester
```

The user-facing language is "run" and "agent", not tmux session, window, or pane.

The simplest mental model:

```txt
reeves window = manage the run
root window   = talk to the root agent
worker window = talk to a worker directly when needed
```

Internally, ReevesAgents stores stable tmux ids:

```txt
tmux_session
tmux_window_id  # @12 style id
tmux_pane_id    # %34 style id
```

Window indexes can change. Stable tmux ids are used for open, peek, send text, send keys, kill, and cleanup.

## Reeves Window Model

Every run tries to expose a `reeves` tmux window. In normal interactive use this is a linked ReevesAgents TUI window; if linking fails, the run still has registry state and terminal/agent windows.

The `reeves` window is the human way back to the ReevesAgents TUI. The Run pages list Spawner terminals or Orchestrator root/workers; `reeves` is not listed as a terminal/agent row.

Rules:

- `reeves` is not an agent.
- `reeves` does not talk to a model.
- `reeves` is the visible way back to ReevesAgents after opening root or a worker.
- Opening root or a worker switches tmux windows and leaves `reeves` running.
- Returning means selecting the `reeves` tmux window, running `reevesagents open <run-id>`, or asking an agent to call `open_reeves`.

This is why the tmux window is named `reeves`, not `control`.

## Surfaces

TUI:

- Main human interface.
- Full run and agent management.
- Visible action menus are the canonical path.
- Best place for starting, opening, approving, and stopping runs.
- Starts with a persistent Welcome main menu.

MCP:

- Full programmatic control plane.
- 26 tools (see MCP Design below).
- Used by root agents, worker agents, and external operator clients.
- Best place for automation, cross-agent control, messages, approval requests, and tmux input control.
- External operator MCP callers can do everything the TUI can do.
- Root agents can control workers and resolve worker approval requests in their own run.

CLI:

- Predictable command surface.
- Friendly commands plus `call` for direct MCP tool access.
- Best place for setup, diagnostics, listing, opening, peeking, scripted orchestration, and emergency stop/kill.
- Not a separate implementation path.

All three surfaces use the same registry and the same runtime operations. There is no separate behavior per surface.

## TUI Design

The TUI is a small run manager. Every page has one obvious job.

Common layout (top to bottom):

- header: wordmark chip, current page name, current run name when inside a run, single duck mascot
- body: one main list or one form, with optional right-side detail pane that the body owns
- detail pane: facts for the selected item and recent output where useful
- action menu: visible actions for the selected item
- status row: hint line above a separate toast line; the two do not race
- status bar: sticky at the bottom, always visible

Input rules:

- arrow keys move selection
- Enter activates the selected item
- Backspace/Esc goes back or cancels the local mode
- text fields accept normal typing, Backspace, Enter commit/newline behavior, and Esc cancel/commit behavior depending on field type
- picker rows use Left/Right to cycle options
- dangerous actions require confirmation through a modal Dialog, not a "press again" toast
- no required tmux keybindings
- no slash commands, Tab-driven focus panes, or hidden command palette

### Mascot

The mascot is Reeves the blocky pixel-art duck. The art is a hand-drawn SVG (`src/brand/assets/duck.svg`) rendered to terminal Unicode block characters via chafa (`scripts/render-mascot.mjs`) at four sizes. The result is a TypeScript constant (`src/brand/duck-rendered.ts`) that the Ink Mascot component prints directly.

Variants:

- `hero` — single large duck at 20×10 cells. Welcome on wide terminals.
- `duo` — one larger duck plus three smaller ducklings trailing right, aligned to the hero's bottom. Available to screens that need a larger brand mark.
- `single` — one normal-sized duck at 14×7 cells. Welcome on standard terminals.
- `mini` — one-row duck at 4×2 cells, kept for compact Welcome layouts.

Width rules (the screen picks, not the component):

- `< 50` cols: the Frame refuses normal pages and asks for at least 50x18.
- Welcome picks `mini` below 50 content columns, `single` below 90, and `hero` at 90+.
- Framed dashboard pages currently do not render the mascot by default.

Pipeline:

```
src/brand/assets/duck.svg   ← edit shape, colors, proportions here
       │
       ▼   pnpm render-mascot   (runs chafa at four sizes)
       │
src/brand/duck-rendered.ts  ← auto-generated, do not hand-edit
       │
       ▼   imported by
       │
src/components/Mascot.tsx   ← prints rows via Ink <Text>
```

Tooling: chafa 1.18.2 (`brew install chafa` on macOS, `apt install chafa` on Debian/Ubuntu, `winget install hpjansson.Chafa` on Windows). End users never need chafa installed — only contributors regenerating the mascot do.

### Tokens and Theme

Named design primitives. Screens reference tokens, not raw hex.

Colors (defined in `src/utils/tokens.ts`):

- `text.{primary, dim, muted, faint, subtle}` — neutral scale.
- `accent.{bright, primary, deep, ink}` — focus indicator, highlights, section labels, chrome border.
- `status.{ok, warn, error}` — semantic.
- `brand.{blue, pale, gradient}` — wordmark.
- `provider.{cc, codex, opencode, hermes}` — per-provider colors. Each distinct from `accent.primary` so a focused cc row does not collide visually with the selection cursor. cc is Claude brand peach `#d97757`.

Spacing scale (`src/utils/tokens.ts`): `none=0, sm=1, md=2, lg=3` in character rows or columns.

Glyphs (`src/utils/glyphs.ts`):

- cursor: `❯` focused, ` ` unfocused
- divider: `│`
- bullet: `•`
- chevron: `›`
- command prefix: `/`
- status dots: `●` ok, `◐` warn, `○` fail, `◌` pending
- home marker: `⌂` for the reeves row

Theme (`src/utils/theme.ts`):

- Dark palette is the implemented UI theme.
- `REEVES_THEME=light` is parsed for compatibility, but there is no light palette or theme picker UI.
- `NO_COLOR=1` strips colors entirely.
- `colorLevel()` returns 0-3 via chalk.level, dropping to named ANSI colors when 24-bit is not available.
- A theme picker UI is not in scope right now.


### Welcome Page

Entry page when `reevesagents` starts outside an existing run.

Purpose:

- Give the product a clear first impression without becoming a landing page.
- Show the wordmark and the duck mascot.
- Move users quickly into Runs.

Behavior:

- Shows the `REEVES AGENTS` blocky wordmark and the duck mascot Reeves (hero variant only on Welcome).
- Wordmark animation is a slow brightness breath, single cycle around 1.6 seconds. No other animation.
- Arrow keys move through the main menu.
- Enter opens the selected page.
- If no key is pressed, it stays on Welcome.
- If `REEVES_RUN_ID` is present, Welcome includes a Current Run menu item.

### Runs Page

Main page after Welcome. Shows all running, ended, and stale runs.

Purpose:

- Answer "what am I running right now?"
- Open a run without knowing tmux names.
- Start a new run from blank or preset.
- Stop a running run.
- Show setup problems without sending the user to a shell first.
- Return to the Welcome main menu for Credits, Settings, Doctor, Reference, and other global actions.
- Auto-clean ended and stale runs on every refresh.

List fields:

- run name
- status: running, ended, or stale
- root provider
- agent count
- latest status note or activity summary
- working directory (in detail pane only)

Actions:

- Open Run
- New Run
- Main Menu
- Quit

Behavior:

- Reads run JSON from local state.
- Checks tmux to confirm whether each running run still exists.
- Shows missing tmux sessions as stale.
- Open Run opens the run hub in the TUI. CLI and MCP `open_reeves` can switch tmux back to the Reeves window.
- Auto-removes ended and stale run folders on every Runs refresh (no manual Remove action needed).
- Does not expose a Registry page. Local state is an implementation detail.

Empty state:

- Hint: no runs yet. Pick the visible New Run action.
- Visible actions: New Run, Main Menu, Quit.

### Run Page

Main page for one active run. This is what the user sees inside the `reeves` tmux window.

Purpose:

- Answer "what is in this run?"
- Show independent terminals for Spawner runs.
- Show root and workers for Orchestrator BETA runs.
- Open the real CLI window for the selected terminal or agent.
- Make it obvious that ReevesAgents is still open in the `reeves` window.
- Inspect a terminal or agent before opening it.
- Add terminals/workers and open/close detail flows.
- See pending approvals for Orchestrator BETA runs.

Rows:

- Spawner terminal records.
- Orchestrator BETA root agent.
- Orchestrator BETA worker agents.

Row fields:

- name
- provider (with provider color from tokens)
- role, only for Orchestrator BETA agents
- task status
- short status note
- last seen or activity marker

Actions:

- Terminals or Agents
- Output
- View Terminal/Agent from the list
- Add Terminal or Add Worker
- Approvals, only for Orchestrator BETA
- Stop Run
- Back To Runs

Behavior:

- `reeves` is not an agent and is not shown as a terminal/agent row.
- Spawner terminal rows have no root badge, no role, and no MCP affordance.
- Orchestrator root is visually distinct because it has run-control capability through MCP. It carries a `root` badge.
- Opening a terminal or agent uses `tmux select-window` with the stored window id.
- Opening `reeves` uses the stored Reeves window id through `open_reeves` or `reevesagents open <run-id>`.
- The UI says "Open", not "select tmux window".
- Closing the first Spawner terminal is allowed; it is just another terminal window.
- Killing an Orchestrator root is shown as Stop Run.
- Worker close is available from Orchestrator worker detail pages.
- Back To Runs shows the global Runs page and keeps the current run alive.

### Agent Detail Page

Inspector page for one agent.

Purpose:

- Inspect one agent without jumping into the provider CLI.
- See recent output from the target tmux pane.
- See provider, role, status, note, and working directory.
- Open or kill the agent with clear confirmation.

Fields:

- name
- provider
- model
- role
- task status
- status note
- working directory
- tmux window id and pane id (for debugging)
- recent output (peek, bordered, fixed height)

Actions:

- Open Agent
- Task
- Close Agent (worker only)
- Back To Run

Behavior:

- Recent output is a short peek, not a full log browser.
- This page is not a chat surface.
- If the user wants to interact, the action is Open Agent.
- Programmatic input belongs to MCP.
- Status is read-only in the TUI; agents update it through `update_task`.

### New Run Page

Creates a Spawner run from scratch or an Orchestrator BETA run from scratch or preset.

Purpose:

- Start a low-permission Spawner workspace quickly.
- Start an Orchestrator BETA root agent when coordination is needed.
- Reuse a saved Orchestrator preset.
- Define terminals/workers before starting.
- Review the planned tmux windows before anything launches.
- Optionally save current choices as a preset.

Preset behavior:

- Presets apply to Orchestrator BETA; Spawner starts with direct terminal setup.
- Presets are selected from the Orchestrator preset step, not through a top-level page.
- Viewing or removing presets happens from that step or Settings.
- Presets stay simple JSON defaults.

Steps:

- choose Spawner or Orchestrator BETA
- choose blank or preset for Orchestrator BETA
- set run name
- set working directory
- choose first terminal/root provider
- set model, prompt, and permissions
- add terminals/workers
- set provider, model, prompt, working directory, and permissions for each extra terminal/worker
- optionally save as preset
- review run
- start run

Required-field markers (`*`) appear on run name and first provider. Spawner prompts are optional; Orchestrator prompts are required for root and workers.

Review shows:

- run name
- working directory
- tmux session name
- mode
- planned windows: Spawner terminals or Orchestrator root/workers; the run session also carries the `reeves` anchor window when tmux can link it
- terminal/root/worker providers
- permissions
- preset name when used

Start behavior:

- create one tmux session for the run
- create or link the `reeves` anchor window when tmux can provide one
- create one first terminal or root agent window
- create additional terminal or worker windows
- write JSON state with stable tmux window and pane ids
- launch Spawner provider CLIs with only the user prompt and no ReevesAgents injection
- launch Orchestrator provider CLIs with the per-provider prompt template plus capability note

### Add Terminal/Worker Page

Small form opened from the Run page.

Purpose:

- Add one terminal to an existing Spawner run or one worker to an existing Orchestrator BETA run.
- Keep the root run alive.
- Create one new tmux window in the same run session.

Fields:

- terminal/worker name
- provider
- model
- prompt
- working directory
- permissions

Actions:

- Add Terminal or Add Worker
- Cancel

Behavior:

- Creates a tmux window inside the existing run session.
- Writes one terminal/agent JSON file.
- For Spawner, launches a plain provider CLI with only the user prompt.
- For Orchestrator BETA, gives the worker the same per-provider startup template, with worker-limited permissions.

### Approvals Page

Run approval inbox.

Purpose:

- Show requests from workers that need root or operator approval.
- Let the user read the exact requested action.
- Approve or deny without opening the provider CLI when the human wants to intervene.
- Keep risky actions explicit.

Actions:

- Approve
- Deny
- View Details
- Back

Behavior:

- Can be global from Runs.
- Can be scoped to one run from Run.
- Defaults to current run when opened from Run.
- Writes approval decision to JSON.
- Root usually resolves worker requests through MCP.
- TUI and external operator MCP callers can also resolve requests.
- Workers read decisions through MCP.
- Risk shown as a colored badge: low (ok), medium (warn), high (error).

### Settings Page

Small local setup page.

Purpose:

- Inspect provider detection and MCP registration.
- See configured state directory paths.
- See where presets live.
- Change only things ReevesAgents owns.

Settings:

- provider CLI detection
- MCP registration state
- state directory path
- runs directory path
- presets directory path

Actions:

- Setup MCP (BETA; registers reevesagents in each detected provider's config for Orchestrator mode)
- Recheck
- Show Config (shows the config path)
- Back

Behavior:

- Does not edit provider credentials.
- Does not become a registry editor.
- Does not manage live runs.

### Doctor Page

Setup and environment health page.

Purpose:

- Explain why ReevesAgents cannot start or control runs.
- Help the user fix tmux, provider CLI, MCP, Node.js, or state directory setup.
- Keep setup diagnosis separate from runtime cleanup.

Checks:

- platform support (macOS, Linux, WSL ok; native Windows fails)
- node version (>= 20.19)
- tmux installed and usable (>= 3.0 recommended)
- providers detected on PATH
- provider compatibility (inspects `--help` output for required flags)
- MCP registration status per provider
- state dir, runs dir, presets dir permissions
- runs state readable

Actions:

- Recheck
- Setup MCP (BETA; calls the same Orchestrator MCP registration as Settings)
- Back

Behavior:

- Does not kill agents.
- Does not delete runs.
- Does not clean state.

### Reference Page

Compact in-app map of the visible TUI, CLI, MCP tools, and roles.

Purpose:

- Give first-time users a quick map without leaving the TUI.
- Keep the current surfaces discoverable without a hidden help overlay.

Behavior:

- Opens from Welcome.
- Uses Up/Down to scroll when content is taller than the terminal.
- Enter, Esc, or Backspace returns to the previous page.

### Credits Page

Small product metadata page.

Purpose:

- Show package identity, purpose, stack, providers, license, and repository.
- Keep project metadata available from the TUI.

Behavior:

- Opens from Welcome.
- Enter, Esc, or Backspace returns to the previous page.
- Does not include network calls.

## MCP Design

There is one MCP command:

```sh
reevesagents mcp
```

Caller role is inferred from the env that the MCP server inherits:

- no `REEVES_SESSION_ID`: external operator
- caller is the run root: root
- caller is a worker: limited worker

`REEVES_SESSION_ID` is the legacy name kept for compatibility. `REEVES_AGENT_ID` is the clearer alias and is also set on every agent spawn.

### Role rules

- Root can control workers in its run.
- Root can spawn workers in its run.
- Root can approve or deny worker approval requests in its run.
- Root can list and check approvals in its run.
- Root can stop its own run.
- External operator can control any run.
- External operator can start and stop runs.
- External operator can approve or deny approval requests.
- Worker can update itself, communicate, request approval, and open the `reeves` window for its run.
- Worker cannot kill other agents, stop runs, or resolve approvals.

### Tools

Run and tree:

```txt
start_run(run_config)
list_runs()
context()
list_agents(run_id?)
tree(run_id?)
get_run(run_id)
```

Open and view:

```txt
open_reeves(run_id)
open_agent(agent_id)
peek(agent_id, lines?)
wait(agent_id, timeout_ms?)
```

Input control:

```txt
send_text(agent_id, text)
send_key(agent_id, key)
interrupt(agent_id)
```

Allowed keys: `enter, escape, backspace, tab, space, up, down, left, right, ctrl-c`.

Lifecycle:

```txt
spawn_worker(run_id, worker_config)
kill_agent(agent_id)
stop_run(run_id)
```

Lifecycle permissions:

- `start_run` is external-operator only.
- `spawn_worker` is allowed for external operators and the root of the target run.
- `kill_agent` is allowed for external operators and the root of the target run, but root cannot kill itself.
- `stop_run` is allowed for external operators and the root of the target run.

Status:

```txt
update_task(agent_id, status, note?)
```

Messages:

```txt
send_message(agent_id, text)
check_messages()
```

Approvals:

```txt
request_approval(action, summary, details?, risk?)
check_approval(approval_id)
list_approvals(run_id?, status?)
resolve_approval(approval_id, decision, note?)
poll_approval(run_id, timeout_ms?)
```

Async inbox:

```txt
get_inbox(agent_id)
```

Approval permissions:

- Workers request approval from root.
- Workers can check approvals they requested.
- Root can list, approve, and deny worker requests in its run.
- If a human is actively using the root CLI, root presents the worker request there and lets the human decide.
- If root is running autonomously, root decides from its instructions and calls `resolve_approval`.
- TUI and external operator MCP callers can also list, approve, and deny requests.
- Workers cannot resolve approvals.
- `poll_approval` is a blocking wait: polls at 1s intervals until any pending approval appears in the run, then returns it. Useful for headless root to block until a worker needs a decision.
- `get_inbox` reads and clears an agent's inbox. Available to root and external operators; lets a headless root receive worker messages without needing the agent to call `check_messages`.

Diagnostics:

```txt
doctor()
```

Total: 26 tools.

### Input semantics

`send_text(agent_id, text)` pastes text into the target tmux pane.

`send_key(agent_id, key)` sends one explicit key to the target tmux pane.

`interrupt(agent_id)` is equivalent to sending Ctrl-C, but exists as a clearer high-level operation.

This lets the root operate worker CLI menus and confirmations without embedding a terminal emulator.

### Agent startup context

Every root and worker launch includes a capability note in its startup task. The note is split by role and lives in `src/launcher/runtime.ts`.

Root capability note covers:

- Coordinate the team: `spawn_worker`, `list_agents`, `tree`, `peek`, `wait`.
- Drive a worker pane: `send_text`, `send_key`, `interrupt`.
- Switch tmux windows: `open_agent`, `open_reeves`.
- Approvals from workers: `list_approvals`, `resolve_approval`.
- Status and messages: `update_task`, `send_message`, `check_messages`.
- End the run: `stop_run`.
- A concrete example of spawning a cc worker and driving it.

Worker capability note covers:

- Report state: `update_task`, `check_messages`.
- Ask for approval: `request_approval`, `check_approval`.
- Communicate: `send_message`, `peek` self.
- Navigate: `open_reeves`.
- Explicit list of what workers cannot do.

Each agent reads its own id from `REEVES_AGENT_ID` and its run id from `REEVES_RUN_ID`.

## Startup Prompts

When the human spawns an agent from the TUI, CLI, or MCP, ReevesAgents owns the starting prompt boundary. Current behavior is intentionally simple:

- Read the user's raw task.
- Append the role-specific capability note from `src/launcher/runtime.ts`.
- Preserve the user's raw task verbatim under `User task:`.

Per-provider prompt templates are future work. They should live behind one dispatcher only when they clearly improve provider behavior without changing run state or MCP semantics.

## CLI Design

CLI is a compact operator surface:

```sh
reevesagents
reevesagents spawn [spec...]
reevesagents runs
reevesagents open <id>
reevesagents peek <terminal-or-agent-id>
reevesagents stop <run-id>
reevesagents kill <terminal-or-agent-id>
reevesagents doctor
reevesagents orchestrator setup
reevesagents mcp
reevesagents call <tool> [json]
```

Command meanings:

- `reevesagents`: open the TUI.
- `reevesagents spawn [spec...]`: start a Spawner run with multiple independent provider CLI terminals.
- `reevesagents runs`: print a small table of runs.
- `reevesagents open <id>`: open a run's `reeves` window or a terminal/agent window.
- `reevesagents peek <terminal-or-agent-id>`: print recent output for one terminal/agent.
- `reevesagents stop <run-id>`: stop a run after confirmation.
- `reevesagents kill <terminal-or-agent-id>`: close one terminal/worker after confirmation.
- `reevesagents doctor`: run setup checks.
- `reevesagents orchestrator setup`: BETA, register local ReevesAgents MCP setup.
- `reevesagents setup`: legacy alias for Orchestrator BETA MCP setup.
- `reevesagents mcp`: BETA, start the MCP server.
- `reevesagents call <tool> [json]`: BETA, invoke any MCP tool through the CLI. Arguments can be inline JSON, stdin JSON, or `--file <path>`.

`reevesagents stop` and `reevesagents kill` require `-y` or `ALLOW_DESTRUCTIVE=1` to actually proceed.

The CLI does not grow a separate implementation for presets, approvals, run creation, or messaging. Those workflows use the same MCP tool handler through `call`.

## Jump And Return Flow

Human flow:

- From TUI, select an agent and choose Open.
- ReevesAgents selects the agent tmux window.
- User types directly into the provider CLI.
- User returns by selecting the visible `reeves` tmux window/tab.

Model flow:

- User tells root agent to open a worker or ReevesAgents.
- Root calls `open_agent` or `open_reeves` through MCP.
- ReevesAgents selects the correct tmux window.

CLI flow:

- User runs `reevesagents open <id>`.
- If inside tmux, ReevesAgents selects the target window.
- If outside tmux, ReevesAgents attaches to the run when it can safely own the terminal.
- If attach cannot be done safely, ReevesAgents prints the exact tmux command.

TUI outside tmux:

- `reevesagents` can still show the Runs page outside tmux.
- Opening a run from outside tmux attaches to that run and lands on `reeves`.
- Opening a specific terminal/agent from outside tmux attaches to the run and selects that window.
- Once inside the run, Open actions use tmux window selection.

There is no hidden ReevesAgents back key inside provider CLIs because provider CLIs own keyboard input.

## State Design

Runtime state means the local JSON files ReevesAgents writes so it can remember runs, agents, tmux ids, approvals, config, and presets.

ReevesAgents writes all state under `~/.reeves`. Tests and isolated runs override the location through the `REEVES_CONFIG` and `REEVES_REGISTRY` environment variables.

State layout:

```txt
~/.reeves/
  config.json
  presets/
    <preset-name>.json
  runs/
    <run-id>/
      run.json
      agents/
        <agent-id>.json
      approvals/
        <approval-id>.json
      mcp/
        <agent-id>-claude-mcp.json
```

Seed presets (`research-team`, `cc-pair`) are written on first launch only when the presets directory is empty.

`run.json` stores:

```txt
id
name
status
tmux_session
reeves_window_id
reeves_pane_id
root_agent_id
working_dir
preset_name
started_at
ended_at
```

Agent JSON stores:

```txt
id
run_id
nickname
provider
model
role
working_dir
task
task_status
task_note
tmux_session
tmux_window_id
tmux_pane_id
rc_enabled
permissions
headless          # optional; true when root has no tmux window (MCP caller is the root)
inbox
last_seen
started_at
ended_at
```

Agent environment variables set by the runtime:

```txt
REEVES_SESSION_ID   # existing name, same value as agent id
REEVES_AGENT_ID
REEVES_RUN_ID
REEVES_ROLE         # root or worker
REEVES_REGISTRY
```

Approval JSON stores:

```txt
id
run_id
agent_id
action
summary
details
risk
status
decision_note
requested_at
resolved_at
```

Preset JSON stores:

```txt
name
description
root                  # slot: provider, model, prompt, working_dir, permissions, auth_mode, effort, rc_enabled
workers               # array of slots
working_dir_pattern   # optional default for slots that have no working_dir
created_at
updated_at
```

Cleanup:

- Auto-cleaning an ended run deletes only that run folder.
- Stale run detection compares JSON to tmux reality.
- Runs auto-cleans ended and stale entries during refresh.
- No background daemon is required.

Atomic writes: every state write goes through `atomicWriteJson` in `src/state/runs.ts`: write to `<path>.tmp`, chmod 0600, then rename.

Multi-step mutations use `withRunsLock` in `src/state/runs.ts`: an `O_EXCL` lock file at `~/.reeves/.runs.lock`. Stale locks older than 5 seconds are reclaimed.

All user/model text is redacted on write via `redactSecrets` in `src/utils/display.ts`. Patterns covered: `sk-ant-*`, `sk-*`, `AIza*`, `gsk_*`.

## MCP Registration in provider config files

`reevesagents orchestrator setup` (or Settings -> Setup MCP (BETA)) writes an `mcpServers` entry into each detected provider's config file. This is only for Orchestrator BETA; Spawner mode does not need MCP registration.

| Provider | Config path | Format | Section |
|---|---|---|---|
| `cc` | `~/.claude/settings.json` | JSON | `mcpServers.reevesagents` |
| `codex` | `~/.codex/config.toml` | TOML | `[mcp_servers.reevesagents]` |
| `opencode` | `~/.config/opencode/opencode.json` | JSON | `mcp.reevesagents` |
| `hermes` | `~/.hermes/config.yaml` | YAML | `mcp_servers.reevesagents` |

Each entry has the same shape: `command = <reevesagents bin path>`, `args = ["mcp"]`. The path comes from `resolveReevesPath` in `src/mcp-setup.ts`, which guards against test-runner paths (vitest, jest workers) and version-manager paths (nvm, fnm, volta) leaking into user configs. For version-manager installs the fallback is the bare `reevesagents` binary name, which resolves via the shell PATH that the MCP host inherits.

When an Orchestrator BETA agent window is spawned, the runtime also writes per-run MCP env injection so the MCP server identifies that specific agent as the caller. Spawner terminals do not receive this injection:

- Codex: TOML override via `-c mcp_servers.reevesagents.env={...}` in `src/launcher/provider-launch.ts`.
- Claude Code: per-run JSON config at `~/.reeves/runs/<run-id>/mcp/<agent-id>-claude-mcp.json`, passed via `--mcp-config`.
- OpenCode and Hermes: rely on the env inherited by the launching shell.

## Status Model

Valid task statuses:

```txt
queued
working
done
failed
blocked
```

Status and optional note are written to the local agent record. Workers can update their own status. Root and external operator can update worker status.

Valid approval statuses:

```txt
pending
approved
denied
expired
```

## Provider Boundary

Provider CLIs own:

- authentication
- OAuth flows
- API keys
- model-specific login state
- provider-specific interactive UI

ReevesAgents owns:

- tmux sessions
- tmux windows
- local run state
- local presets
- MCP tools
- TUI navigation
- startup capability notes
- CLI commands backed by the same runtime and MCP handler

ReevesAgents does not store provider credentials.

## Main Use Cases

First setup:

- User installs ReevesAgents and runs `reevesagents doctor`.
- Doctor checks tmux, provider CLIs, optional Orchestrator MCP config, and state directory.
- User runs `reevesagents`.
- TUI opens on Welcome. The user selects Runs or another visible action.
- If the user wants Orchestrator BETA, they explicitly run `reevesagents orchestrator setup`.

Start a Spawner workspace:

- User chooses New Run.
- User chooses Spawner.
- User sets run name, working directory, and one or more terminal providers.
- User reviews and starts.
- ReevesAgents creates tmux session, `reeves` window, terminal windows, and JSON state.
- Provider CLIs receive only their own optional prompt.

Start one Orchestrator root:

- User chooses New Run.
- User chooses Orchestrator BETA.
- User chooses blank or preset.
- User sets provider, model, prompt, and working directory.
- User reviews and starts.
- ReevesAgents creates tmux session, `reeves` window, root window, and JSON state.

Start root with workers:

- User chooses New Run.
- User chooses Orchestrator BETA.
- User configures root.
- User adds workers.
- Review shows the planned windows.
- Start creates all windows in one tmux session.

Spawn a tree from a host CLI:

- User runs `claude` (or any registered CLI).
- User tells the CLI "spawn a tree with codex as root and two opencode workers".
- The CLI calls `start_run` via reevesagents MCP.
- ReevesAgents creates the tmux session, root, and workers.
- User attaches to the new session to watch.

Open a terminal or agent:

- User opens Run.
- User selects Terminals for Spawner or Agents for Orchestrator BETA.
- User selects a row and chooses Open Terminal or Open Agent from the detail page.
- ReevesAgents selects the terminal/agent window.

Root controls worker:

- Root peeks worker output via `peek`.
- Root pastes a prompt with `send_text`.
- Root fires Enter with `send_key`.
- Root opens worker CLI with `open_agent` if human inspection is useful.

Worker requests root approval:

- Worker calls `request_approval`.
- Root sees the request with `list_approvals`.
- If the human is using root CLI, root asks the human there.
- If root is autonomous, root decides from its instructions.
- Root approves or denies with `resolve_approval`.
- Worker checks result with `check_approval`.
- TUI Approvals page can show the same request for human visibility or override.

Clean ended run:

- User opens or refreshes Runs.
- ReevesAgents auto-removes ended and stale run folders from the visible list.

Doctor:

- User opens Doctor from TUI or runs `reevesagents doctor`.
- Doctor checks setup.
- Doctor suggests fixes.
- Doctor does not delete runtime state.

## Bug discipline

Added 2026-05-23. Bugs found at any phase are fixed inside that phase. Rules:

- Every bug seen gets a written entry in the active work log or issue. Include symptom, cause with file:line when useful, fix one-liner, auto-verify command, human-verify steps if needed, and status.
- Web-search the cause before patching. SearXNG local first (`curl -s 'http://localhost:8080/search?q=<query>&format=json'`), WebSearch as fallback. Cite what you read.
- Pick the smallest fix that does not break unrelated surfaces. If the fix touches a system invariant (alt-screen vs main buffer, tmux scrollback, MCP role enforcement, state-lock semantics), open a separate phase for it and patch only the visible symptom in the current pass.
- After patching, run `pnpm verify`. Real-tmux or real-CLI surfaces use `pnpm verify:real`. Do not commit on a regression.
- Surfaces that require a real interactive terminal (arrow-key reconciliation, cursor flicker, OSC pane title behavior) get a human verification step. The assistant says "ready to verify visually" and waits.
- Do not silently extend the loop. New bugs that surface during a fix go to the bottom of the R14 log as B<n+1>; do not bundle.

## Testing

Verification gate that runs after any code change (`pnpm verify`):

- `pnpm typecheck` — TypeScript strict mode.
- `pnpm lint` — eslint.
- `pnpm test` — vitest unit tests.
- `pnpm build` — tsup ESM bundle.
- `pnpm smoke:mcp` — MCP server smoke against isolated state.
- `pnpm smoke:cli` — CLI commands with fake provider binaries.

Real-system gate (`pnpm verify:real`): adds `pnpm smoke:tmux` and `pnpm smoke:providers-real`.

Opt-in real-provider approval smoke: `pnpm smoke:approval-real` launches a real provider worker, drives an approval request through MCP, approves it, waits for a marker file, and stops the run. It can consume provider quota.

To regenerate the mascot art:

```sh
pnpm render-mascot
```

This runs chafa over `src/brand/assets/duck.svg` and rewrites `src/brand/duck-rendered.ts`.

## Out Of Scope

- embedded terminal emulator
- required tmux keybindings
- TUI prompt composer for provider conversations
- palette commands that forward text to provider CLIs
- `!` bash prefix and `@` file reference prefix inside the palette
- registry page
- top-level presets page
- audit page
- messages page
- rules/policy editor
- logs browser
- separate database
- separate MCP modes
- advanced preset automation beyond simple run templates
- provider credential management
- theme picker UI
- native Windows support (Windows users run inside WSL with tmux and provider CLIs installed in the WSL environment)
