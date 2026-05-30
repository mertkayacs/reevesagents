# ReevesAgents V1 Implementation Report

**Status: historical. Superseded by the current TUI design in `README.md` and `REEVESAGENTS_DESIGN.md`.**

This is the current implementation note for the v1 rebuild. It records what changed, why it changed, and how it was tested.

## Product Shape

ReevesAgents is now a local tmux-first run manager for real AI CLI agents.

- Runs are tracked in local state. The registry is the source of truth; tmux sessions and windows are execution/view surfaces.
- Each run owns a tmux session; each agent is one window inside that run session.
- Agents are real provider CLIs: Claude Code, Codex CLI, OpenCode CLI, or Hermes.
- TUI is the human dashboard.
- MCP is the programmatic control plane for agents and operators.
- CLI is an operator surface: friendly commands for common actions plus `call` for direct access to MCP tools.

ReevesAgents does not store provider credentials, proxy model traffic, embed a terminal emulator, or replace provider authentication.

## Runtime And State

Added the v1 runtime and state model:

- `src/state/runs.ts`: run, agent, approval, inbox, and lock-managed JSON state under `~/.reeves/runs`.
- `src/launcher/runtime.ts`: tmux runtime with one per-run session and one agent per window.
- `src/launcher/provider-launch.ts`: provider launch helpers for initial tasks, MCP env injection, and shell-safe command construction.
- `src/mcp.ts`: v1 MCP tools with caller role enforcement.
- `src/cli.ts`: compact CLI surface.

State layout:

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
```

`REEVES_REGISTRY` points to an isolated state root for tests and smoke runs.

## Providers

Supported providers:

- `cc`: Claude Code through `claude`
- `codex`: Codex CLI through `codex`
- `opencode`: OpenCode CLI through `opencode`
- `hermes`: Hermes through `hermes chat`

Gemini support was removed from v1. OpenCode was added and uses documented prompt/model flags only.

## TUI

The TUI remains Ink/React.

Current pages:

- Welcome
- Runs
- Run
- Agent
- New Run
- Add Worker
- Approvals
- Settings
- Reference
- Credits
- Doctor

The UI no longer uses the same three-pane layout everywhere. Layouts vary by page and terminal width:

- Welcome is a small animated entry screen.
- Runs is a compact dashboard with sectioned run rows and visible actions.
- Run is a workspace view with rows for real root and worker agents. Reeves is a TUI anchor, not an agent node.
- New Run and Add Worker use form layouts.
- Agent, Settings, Reference, Credits, and Doctor use inspector-style layouts.
- Narrow terminals use shorter metrics, fewer row fields, and shorter footer text.

Welcome behavior:

- Shows animated blue `REEVES AGENTS` block art and a blue duck mark.
- Shows a persistent main menu.
- Opens the selected page on Enter.
- Shows Current Run when launched with run context.

Visual sources and choices:

- Claude Code docs were used as a terminal UX reference for simple input patterns, visible command discovery, and reduced redraw noise.
- `termcn` was used as a research reference for Ink-native block text and terminal component patterns.
- The duck mark is adapted from the `small-duck` entry in the CTAN `ducksay` manual.
- Lottie was considered, but not added. Browser Lottie targets SVG, canvas, or HTML, while this app is an Ink terminal TUI. The implemented animation is terminal-native and dependency-free.

## MCP

`reevesagents mcp` exposes 26 tools:

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

Caller roles:

- No `REEVES_SESSION_ID`: external operator.
- Root agent: knows its current run, controls workers, spawns workers, stops the run, and resolves worker approvals in its run.
- Worker agent: knows its current run, checks messages, updates itself, requests approval, and checks its own approvals.

Agents also receive `REEVES_AGENT_ID`, `REEVES_RUN_ID`, `REEVES_ROLE`, and `REEVES_REGISTRY`.

## CLI

Current CLI commands:

```sh
reevesagents
reevesagents runs
reevesagents open <id>
reevesagents peek <agent-id>
reevesagents stop <run-id>
reevesagents kill <agent-id>
reevesagents doctor
reevesagents setup
reevesagents mcp
reevesagents call <tool> [json]
```

`stop` and `kill` require `--yes` or `ALLOW_DESTRUCTIVE=1`. `call` invokes the same MCP tool handler used by `reevesagents mcp`, with JSON arguments from an inline value, stdin, or `--file`.

## Removed Legacy Code

The old tree-orchestrator UI and legacy runtime pieces were removed or replaced. Removed surfaces include:

- Welcome/TreeNavigator/Spawn/Orchestrate/Help legacy screens
- slash-command picker
- old shared three-pane screen layout
- old status line and banner/goodbye modules
- old launcher spawn/peek/jump/watcher modules
- old registry/session/approval state modules
- old navigation/pane hooks
- old tests tied to the removed surfaces

The replacement is the v1 run/window model described above.

## Documentation Work

Updated and checked:

- `README.md`: current quick start, provider list, TUI pages, visual design, CLI including `call`, MCP tools, state layout, development verification, and status.
- `docs/testing.md`: isolated test matrix, acceptance criteria, manual TUI check, and latest local verification record.
- `docs/mcp-tools.md`: caller roles, tool groups, current tool count, CLI `call`, and headless-root inbox behavior.
- `REEVESAGENTS_DESIGN.md`: Welcome, Reference/Credits, page-specific layouts, visible-menu interaction, and current run/window model.
- This report: v1 implementation notes, removed legacy surfaces, UI changes, source references, and verification record.

## Test And Smoke Work

Key test and smoke surfaces:

- `test/runs-state.test.ts`
- `test/runtime.test.ts`
- `test/mcp.test.ts`
- `test/router.test.ts`
- `test/screens/*`
- `scripts/smoke-real.mjs`
- `scripts/smoke-cli.mjs`
- `scripts/smoke-tmux-run.mjs`
- `scripts/smoke-providers-real.mjs`
- `scripts/smoke-approval-real.mjs`

Package scripts:

```sh
pnpm smoke:mcp
pnpm smoke:cli
pnpm smoke:tmux
pnpm verify
pnpm verify:real
```

Isolation guarantees:

- Unit tests use temp state and fake drivers.
- CLI smoke uses temp registry/config/home and fake provider binaries.
- MCP smoke uses temp registry/config and the built CLI.
- Real tmux smoke uses a private tmux socket and fake provider binaries.
- Real user provider credentials are not printed, read, or written by these tests.

## Verification Record

Latest local verification completed:

```sh
CI=true pnpm typecheck
CI=true pnpm lint
CI=true pnpm test
CI=true pnpm build
pnpm smoke:mcp
pnpm smoke:cli
pnpm smoke:tmux
```

Observed:

- Typecheck passed.
- Lint passed.
- Vitest passed with 66 files and 483 tests.
- Build passed.
- MCP smoke passed and listed all 26 v1 tools.
- CLI smoke passed against isolated setup, doctor checks, and MCP-backed `call`.
- Real tmux smoke passed against a private tmux socket and fake providers.
- Manual TUI renders were checked for Welcome main menu, sectioned Runs page, Main Menu return, and a narrow 52-column terminal.

## Source References

- Claude Code interactive mode: https://code.claude.com/docs/en/interactive-mode
- Claude Code commands and `/tui fullscreen`: https://code.claude.com/docs/en/commands
- termcn Big Text: https://www.termcn.dev/docs/components/ink/typography/big-text
- termcn repo: https://github.com/Aniket-508/termcn
- CTAN ducksay manual: https://mirrors.mit.edu/CTAN/macros/latex/contrib/ducksay/ducksay.pdf
