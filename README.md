# reevesagents

Local tmux-first run manager for AI CLI agents.

ReevesAgents tracks each run in local state and opens every agent in its own tmux window. The registry is the source of truth; tmux is the execution and viewing surface. The TUI stays in the current or fallback `reeves` session, while each run gets its own tmux session to keep tabs uncluttered.

## What It Does

- Shows active, ended, and stale runs in a visible-menu TUI.
- Starts a root agent and optional worker agents as tmux windows in a per-run tmux session.
- Opens the real provider CLI window for root or worker agents.
- Lets agents and humans coordinate through MCP tools, CLI calls, and the TUI using run and agent ids.
- Stores local JSON state under `~/.reeves/runs`.
- Registers ReevesAgents as an MCP server for supported provider CLIs.
- Uses a small animated Welcome screen, page-specific TUI layouts, and a static Runs dashboard to reduce terminal flicker.

ReevesAgents does not store provider credentials, proxy model traffic, embed a terminal emulator, or replace provider authentication.

## Requirements

- macOS, Linux, or WSL
- Node.js 20.19+
- tmux
- At least one provider CLI: `claude`, `codex`, `opencode`, or `hermes`

## Providers

| Key | CLI | Launch | Notes |
| --- | --- | --- | --- |
| `cc` | Claude Code | `claude` | Supports model, API-key auth mode, effort, skip permissions, and `/remote-control` startup injection |
| `codex` | Codex CLI | `codex` | Supports model and skip permissions; Codex app-server remote control is managed outside agent launches |
| `opencode` | OpenCode CLI | `opencode` | Supports `--prompt` and `--model`; ReevesAgents does not add undocumented skip flags |
| `hermes` | Hermes | `hermes chat` | Supports model and `--yolo` skip permissions |

Default permissions are `ask`. Use `skip` only in trusted disposable workspaces.

## Install From Source

```sh
git clone https://github.com/mertkayacs/reevesagents.git
cd reevesagents
pnpm install
pnpm build
pnpm link --global
```

Verify:

```sh
reevesagents --version
reevesagents doctor
```

## Quick Start

```sh
reevesagents doctor
reevesagents setup
reevesagents
```

The first screen is always Welcome. It is a persistent main menu: use arrows and Enter to choose New Run, Runs, Doctor, Settings, Approvals, Reference, Credits, or Quit. When launched with run context, Welcome also shows Current Run. Runs auto-cleans ended and stale entries on refresh.

## TUI Pages

- Welcome: animated `REEVES AGENTS` block logo, chafa-rendered blocky duck mascot, and persistent main menu.
- Runs: list all running, ended, and stale runs. Ended and stale runs auto-clean on refresh.
- Run hub: show root agent, workers, and sub-pages (Agents, Approvals, Output, Add Worker, Return & Stop Run).
- Agent detail: inspect provider, role, status, working directory, tmux ids, recent output, and agent-specific sub-pages (Output, Task, Open Agent, Close Agent).
- New Run wizard: 5-step form to create a run from a root agent plus optional workers.
- Approvals: approve or deny per-run approval requests.
- Settings: provider detection, MCP registration, and state paths (collapsed to single page).
- Doctor: setup and environment health checks only.
- Reference: compact in-app map of the TUI, CLI, MCP tools, and roles.
- Credits: package metadata, stack, providers, license, and repository.

The TUI is visible-menu first: arrows navigate, Enter selects, and Esc/Backspace goes back. Text fields accept normal typing, picker fields use Left/Right, and Welcome also accepts `q` to quit. There are no slash commands, Tab-driven focus panes, hidden command palette, or embedded terminal.

## Visual Design

- The Welcome page animates the blue block logo and shows the duck hero variant.
- The Runs page uses a static sectioned list to reduce flicker during normal use.
- The mascot is an in-house chafa-rendered blocky duck (src/brand/assets/duck.svg).
- Layouts adapt by page and terminal width instead of forcing one three-pane layout everywhere.
- The design reference is Claude Code style terminal UX: simple visible controls, compact status, and low redraw noise.

## CLI

```sh
reevesagents                 # open TUI
reevesagents context         # show caller role, current run, and controls
reevesagents runs            # list runs
reevesagents open <id>       # open a run's reeves window or an agent window
reevesagents peek <agent-id> # print recent agent output
reevesagents stop <run-id>   # stop one run, requires --yes or ALLOW_DESTRUCTIVE=1
reevesagents kill <agent-id> # kill one worker, requires --yes or ALLOW_DESTRUCTIVE=1
reevesagents doctor          # setup checks
reevesagents setup           # register MCP configs
reevesagents mcp             # start MCP server over stdio
reevesagents call <tool>     # call any MCP tool from the CLI with JSON args
```

`call` gives the CLI the same control plane as MCP without adding a separate implementation. Arguments can be inline JSON, stdin JSON, or `--file <path>`:

```sh
reevesagents call context
reevesagents call get_run '{"run_id":"<run-id>"}'
printf '%s' '{"run_id":"<run-id>"}' | reevesagents call tree
reevesagents call spawn_worker --caller <root-agent-id> --file worker.json
```

## MCP Tools

`reevesagents mcp` exposes the v1 control plane:

```text
start_run
list_runs
context
list_agents
tree
get_run
open_reeves
open_agent
peek
wait
send_text
send_key
interrupt
spawn_worker
kill_agent
stop_run
update_task
send_message
check_messages
request_approval
check_approval
list_approvals
resolve_approval
poll_approval
get_inbox
doctor
```

Caller role is inferred from environment:

- no `REEVES_SESSION_ID` or `REEVES_AGENT_ID`: external operator
- root agent: knows its current run, controls workers, spawns workers, stops the run, and resolves approvals
- worker agent: knows its current run, updates itself, checks messages, requests approval, and opens Reeves

See [docs/mcp-tools.md](docs/mcp-tools.md) for caller roles, tool groups, and agent usage rules.

## State Layout

```text
~/.reeves/
  config.json
  presets/
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

`REEVES_REGISTRY` can point at an isolated state root for tests and smoke runs.

## MCP Config Paths

`reevesagents setup` writes only the ReevesAgents MCP entry:

- Claude Code: `~/.claude/settings.json`
- Codex CLI: `~/.codex/config.toml`
- OpenCode CLI: `~/.config/opencode/opencode.json`
- Hermes: `~/.hermes/config.yaml`

No API keys or provider credentials are written.

## Development

```sh
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Portable verification:

```sh
pnpm verify
```

Real tmux verification:

```sh
pnpm verify:real
```

Opt-in real-provider approval drill:

```sh
pnpm smoke:approval-real
REEVES_REAL_PROVIDER=codex pnpm smoke:approval-real
```

The default real approval drill targets Claude Code when installed. Use `REEVES_REAL_PROVIDER` to try another provider.

See [docs/testing.md](docs/testing.md) for the isolated test matrix and manual TUI check.

See [docs/use-cases.md](docs/use-cases.md) for the product surface map used for careful refactors.

See [docs/release-readiness.md](docs/release-readiness.md) for the first public release checklist.

For future-agent handoff, start with [docs/agent-brief.md](docs/agent-brief.md).

See [docs/implementation-report.md](docs/implementation-report.md) for the end-to-end v1 implementation notes, removed legacy surfaces, UI changes, and verification record.

## Status

The TUI was redesigned in May 2026 with a unified color system, responsive frame component, focused pages, a 5-step New Run wizard, auto-cleanup of ended runs, and a visible-menu interaction model. The current source of truth is this README plus [REEVESAGENTS_DESIGN.md](REEVESAGENTS_DESIGN.md).

- Version: `0.9.0`
- npm package: not published yet
- Homebrew formula: not available yet

## License

Apache 2.0
