# reevesagents

Local tmux-first workspace manager for AI CLI agents.

The main `reevesagents` package is the stable spawner install:

- Start one tmux workspace with multiple independent provider CLI agents.
- Keep the human in charge of coordination.
- Do not write provider config, inject ReevesAgents environment variables, or create agent roles.

ReevesAgents tracks each run in local state and opens every agent in its own tmux window. The registry is the source of truth; tmux is the execution and viewing surface. The TUI stays in the current or fallback `reeves` session, while each run gets its own tmux session to keep tabs uncluttered.

## What It Does

- Shows active runs plus shared TUI/Web history for ended and stale runs.
- Starts multiple independent provider CLI agents.
- Opens the real provider CLI window for each agent.
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
The Web UI beta also needs the optional `ws` and `@lydell/node-pty` packages,
which npm installs by default. The TUI and CLI do not need those optional
packages.

Not required:

- Provider API keys in ReevesAgents config
- Database, Docker, browser runtime, background service, or daemon
- MCP or approval setup

Install is passive: no postinstall, no provider config writes, no background service.

## Providers

| Provider spec | CLI | Launch | Notes |
| --- | --- | --- | --- |
| `claude-code` | Claude Code | `claude` | Supports model, API-key auth mode, effort, and skip permissions |
| `codex-cli` | Codex CLI | `codex` | Supports model and skip permissions; Codex app-server remote control is managed outside agent launches |
| `opencode-cli` | OpenCode CLI | `opencode` | Supports `--prompt` and `--model`; ReevesAgents does not add undocumented skip flags |
| `hermes` | Hermes | `hermes chat` | Supports model and `--yolo` skip permissions |
| `kimi-code` | Kimi Code | `kimi` | Supports model and `--yolo` skip permissions |
| `deepseek-cli` | DeepSeek CLI | `deepseek` | Supports model; ReevesAgents does not add undocumented skip flags |
| `pi` | Pi | `pi` | Supports model; ReevesAgents does not add undocumented skip flags |
| `qwen-code` | Qwen Code | `qwen` | Supports model and `--approval-mode yolo` skip permissions |
| `aider` | Aider | `aider` | Supports model and `--yes-always` skip confirmations |

The TUI model picker is provider-scoped and intentionally small. Choosing `provider default` leaves the provider CLI to use its own configured default and ReevesAgents does not pass `--model`. The curated optional values live in `src/launcher/model-data/*.ts`, with one source file per provider.

Default permissions are `ask`. Use `skip` only in trusted disposable workspaces.

## Install

Choose the smallest install surface that matches what you want to run.

### Core CLI/TUI Only

Use this when you do not want the optional browser agent bridge:

```sh
npm install -g --omit=optional reevesagents
reevesagents doctor
reevesagents
```

This installs the stable CLI and TUI. `reevesagents web` will print a clear
message explaining which optional Web package is missing.

### CLI/TUI Plus Web Beta

This is the default stable install. It includes the CLI, TUI, and loopback-only
Web UI beta.

After npm publish:

```sh
npm install -g reevesagents
reevesagents doctor
reevesagents web
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
npm install -g ./reevesagents-1.0.0.tgz
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

The first screen is always Welcome. It is a persistent main menu: use arrows and Enter to choose New Run, Runs, Doctor, Settings, Reference, Credits, or Quit. New Run starts the spawner wizard directly. When launched with run context, Welcome also shows Current Run. Runs auto-archives ended and stale run records on refresh.

Spawner mode can also start from the CLI:

```sh
reevesagents spawn codex-cli:builder claude-code:reviewer --name "release check" --prompt "Inspect the release state."
```

Agent specs can include an optional model as `provider:nickname:model`:

```sh
reevesagents spawn claude-code:planner:sonnet codex-cli:builder:gpt-5-codex
```

Leave the model off to use the provider CLI default.

## TUI Pages

- Welcome: animated `REEVES AGENTS` block logo, chafa-rendered blocky duck mascot, and persistent main menu.
- Runs: list active runs, spawn new runs, and open shared run history.
- History: show archived ended and stale runs with simple metadata.
- Run hub: show agents, output, add-agent, stop, and back actions.
- Agent detail: inspect provider, status, working directory, tmux ids, recent output, prompt, open window, and close window.
- New Run wizard: configure providers, prompts, and windows.
- Settings: provider detection and state paths.
- Doctor: setup and environment health checks only.
- Reference: compact in-app map of the TUI, CLI, and tmux workflow.
- Credits: package metadata, stack, providers, license, and repository.

The TUI is visible-menu first: arrows navigate, Enter selects, and Esc/Backspace goes back. Text fields accept normal typing, non-model pickers use Left/Right, and model fields open a selectable model list with Enter. Welcome also accepts `q` to quit. There are no slash commands, Tab-driven focus panes, hidden command palette, or embedded terminal.

## Visual Design

- The Welcome page animates the blue block logo and shows the duck hero variant.
- The Runs page uses a static sectioned list to reduce flicker during normal use.
- The interactive TUI enables color even when the parent shell exports `NO_COLOR` or `TERM=dumb`; set `REEVES_NO_COLOR=1` to force monochrome.
- The mascot is an in-house chafa-rendered blocky duck (src/brand/assets/duck.svg).
- Layouts adapt by page and terminal width instead of forcing one three-pane layout everywhere.
- The design reference is Claude Code style terminal UX: simple visible controls, compact status, and low redraw noise.

## CLI

```sh
reevesagents                 # open TUI
reevesagents spawn [spec...] # start a low-permission multi-agent spawner run
reevesagents runs            # list runs
reevesagents open <id>       # open a run's reeves window or an agent window
reevesagents peek <agent-id> # print recent agent output
reevesagents stop <run-id>   # stop one run, requires --yes or ALLOW_DESTRUCTIVE=1
reevesagents kill <agent-id> # close one agent, requires --yes or ALLOW_DESTRUCTIVE=1
reevesagents doctor          # setup checks
reevesagents web             # start loopback Web UI beta
```

## State Layout

```text
~/.reeves/
  config.json
  presets/
  history/
    runs/
      <run-id>.json
  runs/
    <run-id>/
      run.json
      agents/
        <agent-id>.json
```

`REEVES_REGISTRY` can point at an isolated state root for tests and smoke runs.

## Development

```sh
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Contributors should open pull requests against `master`. Release stabilization
uses `release/v1.0`; tags are cut only from verified release commits. See
[CONTRIBUTING.md](CONTRIBUTING.md) and [docs/branching.md](docs/branching.md).

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

- Version: `1.0.0`
- npm package: not published yet
- Homebrew formula: not available yet

## License

Apache 2.0
