# reevesagents

Local tmux-first workspace manager for AI CLI terminals.

The main `reevesagents` package is the stable spawner install:

- Start one tmux workspace with multiple independent provider CLI terminals.
- Keep the human in charge of coordination.
- Do not write provider config, inject ReevesAgents environment variables, or create root/worker roles.

The Orchestrator work is PRE-BETA test code under `packages/orchestrator`. It is not installed by the main package, not included in the root workspace install, and not part of the stable TUI or CLI.

ReevesAgents tracks each run in local state and opens every terminal in its own tmux window. The registry is the source of truth; tmux is the execution and viewing surface. The TUI stays in the current or fallback `reeves` session, while each run gets its own tmux session to keep tabs uncluttered.

## What It Does

- Shows active, ended, and stale runs in a visible-menu TUI.
- Starts multiple independent provider CLI terminals.
- Opens the real provider CLI window for each terminal.
- Stores local JSON state under `~/.reeves/runs`.
- Uses a small animated Welcome screen, page-specific TUI layouts, and a static Runs dashboard to reduce terminal flicker.

ReevesAgents does not store provider credentials, proxy model traffic, embed a terminal emulator, or replace provider authentication.

## Requirements

Core runtime:

- macOS, Linux, or WSL
- Node.js 20.19+
- tmux, 3.0+ recommended
- A normal interactive shell on `PATH`

Provider runtime:

- At least one provider CLI for the provider you launch: `claude`, `codex`, `opencode`, `hermes`, `kimi`, `deepseek`, `pi`, `qwen`, or `aider`
- Provider authentication handled by that provider CLI

Spawner mode needs only the core runtime plus the provider CLIs you launch.

Not required:

- Provider API keys in ReevesAgents config
- Database, Docker, browser runtime, background service, or daemon
- Orchestration setup for Spawner mode

Install is passive: no postinstall, no provider config writes, no background service.

## Providers

| Key | CLI | Launch | Notes |
| --- | --- | --- | --- |
| `cc` | Claude Code | `claude` | Supports model, API-key auth mode, effort, and skip permissions |
| `codex` | Codex CLI | `codex` | Supports model and skip permissions; Codex app-server remote control is managed outside agent launches |
| `opencode` | OpenCode CLI | `opencode` | Supports `--prompt` and `--model`; ReevesAgents does not add undocumented skip flags |
| `hermes` | Hermes | `hermes chat` | Supports model and `--yolo` skip permissions |
| `kimi` | Kimi Code | `kimi` | Supports model and `--yolo` skip permissions |
| `deepseek` | DeepSeek CLI | `deepseek` | Supports model; ReevesAgents does not add undocumented skip flags |
| `pi` | Pi | `pi` | Supports model; ReevesAgents does not add undocumented skip flags |
| `qwen` | Qwen Code | `qwen` | Supports model and `--approval-mode yolo` skip permissions |
| `aider` | Aider | `aider` | Supports model and `--yes-always` skip confirmations |

The TUI model picker is provider-scoped and intentionally small. Choosing `provider default` leaves the provider CLI to use its own configured default and ReevesAgents does not pass `--model`. The curated optional values live in `src/launcher/model-data/*.ts`, with one source file per provider.

Default permissions are `ask`. Use `skip` only in trusted disposable workspaces.

## Install

The supported install surfaces all install the main spawner app only. They do not install `packages/orchestrator`, do not register MCP config, and do not add approval or orchestration commands.

After npm publish:

```sh
npm install -g reevesagents
reevesagents doctor
```

Other npm-registry clients consume the same package:

```sh
pnpm add -g reevesagents
npx reevesagents doctor
pnpm dlx reevesagents doctor
yarn dlx reevesagents doctor
bunx reevesagents doctor
```

After the Homebrew tap exists:

```sh
brew install mertkayacs/tap/reevesagents
reevesagents doctor
```

From a GitHub Release tarball:

```sh
npm install -g ./reevesagents-0.9.0.tgz
reevesagents doctor
```

From source:

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
reevesagents
```

The first screen is always Welcome. It is a persistent main menu: use arrows and Enter to choose New Run, Runs, Doctor, Settings, Reference, Credits, or Quit. New Run starts the spawner wizard directly. When launched with run context, Welcome also shows Current Run. Runs auto-cleans ended and stale entries on refresh.

Spawner mode can also start from the CLI:

```sh
reevesagents spawn codex:builder cc:reviewer --name "release check" --prompt "Inspect the release state."
```

Terminal specs can include an optional model as `provider:nickname:model`:

```sh
reevesagents spawn cc:planner:sonnet codex:builder:gpt-5-codex
```

Leave the model off to use the provider CLI default.

## TUI Pages

- Welcome: animated `REEVES AGENTS` block logo, chafa-rendered blocky duck mascot, and persistent main menu.
- Runs: list all running, ended, and stale runs. Ended and stale runs auto-clean on refresh.
- Run hub: show terminals, output, add-terminal, stop, and back actions.
- Terminal detail: inspect provider, status, working directory, tmux ids, recent output, prompt, open window, and close window.
- New Run wizard: configure providers, prompts, and windows.
- Settings: provider detection and state paths.
- Doctor: setup and environment health checks only.
- Reference: compact in-app map of the TUI, CLI, and tmux workflow.
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
reevesagents spawn [spec...] # start a low-permission multi-terminal spawner run
reevesagents runs            # list runs
reevesagents open <id>       # open a run's reeves window or a terminal window
reevesagents peek <terminal-id> # print recent terminal output
reevesagents stop <run-id>   # stop one run, requires --yes or ALLOW_DESTRUCTIVE=1
reevesagents kill <terminal-id> # close one terminal, requires --yes or ALLOW_DESTRUCTIVE=1
reevesagents doctor          # setup checks
```

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
```

`REEVES_REGISTRY` can point at an isolated state root for tests and smoke runs.

## Orchestrator PRE-BETA

`packages/orchestrator` contains experimental MCP coordination code for testing root/worker agent flows. It is intentionally separate from the main app:

- Root `pnpm install` installs only the spawner app.
- The root CLI exposes no orchestrator, MCP, approval, or setup commands.
- The root npm tarball does not include `packages/orchestrator`.
- The PRE-BETA package can change or break without a main-app semver promise.

Do not publish or install the orchestrator package as a normal user path yet. Use it only when explicitly testing orchestration. Stable app users should install and run `reevesagents`.

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

See [docs/testing.md](docs/testing.md) for the isolated test matrix and manual TUI check.

See [docs/use-cases.md](docs/use-cases.md) for the product surface map used for careful refactors.

See [docs/release-readiness.md](docs/release-readiness.md) for the first public release checklist.

For future-agent handoff, start with [docs/agent-brief.md](docs/agent-brief.md).

See [docs/implementation-report.md](docs/implementation-report.md) for the end-to-end v1 implementation notes, removed legacy surfaces, UI changes, and verification record.

## Status

The TUI was redesigned in May 2026 with Spawner as the default low-permission path, a unified color system, responsive frame component, focused pages, auto-cleanup of ended runs, and a visible-menu interaction model. The current source of truth is this README plus [REEVESAGENTS_DESIGN.md](REEVESAGENTS_DESIGN.md).

- Version: `0.9.0`
- npm package: not published yet
- Homebrew formula: not available yet

## License

Apache 2.0
