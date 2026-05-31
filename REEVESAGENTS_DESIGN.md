# ReevesAgents Design

This document is the canonical design for the stable main package. The current release path is spawner-only. Orchestrator code is PRE-BETA test code, not part of the main app.

## Product Thesis

ReevesAgents is a local tmux-first workspace manager for AI CLI terminals.

The main package should feel like a practical terminal workbench:

- one visible TUI for the human
- one run per tmux session
- one provider CLI per tmux window
- no install-time mutation of provider config
- no background service
- no hidden control plane in spawner runs

The human remains the coordinator. ReevesAgents groups terminals, remembers where they are, opens them quickly, peeks output, and cleans up run state.

## Requirements

Runtime requirements:

- Node.js 20.19+
- tmux, 3.0+ recommended
- a normal interactive shell on `PATH`
- at least one provider CLI: `claude`, `codex`, `opencode`, or `hermes`

Provider authentication stays inside each provider CLI. ReevesAgents does not store provider credentials or proxy model traffic.

## Architecture

```text
run = one tmux session
terminal = one independent provider CLI window in that session
reeves window = human TUI anchor
registry = local JSON source of truth
tmux = execution and viewing surface
```

Typical run layout:

```text
tmux session: reeves_<run-name>_<id>
  window 0: reeves when tmux linking succeeds
  window 1: <provider-or-nickname>
  window 2: <provider-or-nickname>
  window 3: <provider-or-nickname>
```

The `reeves` window is not a provider terminal. It is the way back to the TUI for a run.

## State

Runtime state lives under `~/.reeves` unless `REEVES_REGISTRY` points to an isolated test root.

```text
~/.reeves/
  config.json
  presets/
  runs/
    <run-id>/
      run.json
      agents/
        <terminal-id>.json
```

The `agents` directory name remains for compatibility with earlier state. Stable UI and CLI copy should call those records terminals.

State rules:

- Writes are local JSON only.
- Text fields are redacted before writing where they can contain secrets.
- Ended and stale runs are auto-cleaned from the visible Runs list.
- Destructive operations require explicit confirmation in CLI and TUI.

## Provider Launch

Provider command support:

| Key | CLI | Launch |
| --- | --- | --- |
| `cc` | Claude Code | `claude` |
| `codex` | Codex CLI | `codex` |
| `opencode` | OpenCode CLI | `opencode` |
| `hermes` | Hermes | `hermes chat` |

Spawner launch rules:

- pass only provider-supported launch flags
- paste the optional initial prompt into the terminal
- leave model defaults to the provider when the model field is blank
- default permissions to `ask`
- allow skip permissions only when the provider has a known CLI flag for it

Spawner runs must not inject ReevesAgents runtime environment variables into provider CLIs.

## TUI

The TUI is visible-menu first:

- arrows move
- Enter selects
- Esc/Backspace goes back
- no slash commands
- no hidden command palette
- no embedded terminal emulator

Pages:

- Welcome: persistent main menu and current run shortcut.
- Runs: sectioned run dashboard with stable, low-flicker rows.
- Run: workspace view for one run.
- Terminals: list provider windows in the run.
- Terminal detail: inspect provider, status, working directory, ids, prompt, output, open, and close.
- New Run: configure a run and its initial terminals.
- Add Terminal: add one terminal to an existing run.
- Settings: provider detection and state paths.
- Doctor: environment health checks only.
- Reference: compact in-app map.
- Credits: package metadata and project credits.

The UI should use terminal-sized typography. Hero-scale text belongs only on Welcome. Dense operational pages should prefer compact rows, clear sections, stable dimensions, and predictable keys.

## CLI

Main commands:

```sh
reevesagents
reevesagents spawn [spec...]
reevesagents runs
reevesagents open <id>
reevesagents peek <terminal-id>
reevesagents stop <run-id>
reevesagents kill <terminal-id>
reevesagents doctor
```

CLI design rules:

- No args opens the TUI.
- `spawn` creates an independent multi-terminal run.
- `runs --json` is the script-friendly listing surface.
- `open` switches tmux to a run or terminal when possible; otherwise it prints a pasteable tmux command.
- `peek` prints recent terminal output.
- `stop` and `kill` require `--yes` or `ALLOW_DESTRUCTIVE=1`.

## Config And Doctor

Config is local and optional. Doctor should check only things the main package needs:

- Node.js version
- tmux availability
- state path writability
- provider CLI availability

Doctor must not write provider config files or ask for provider secrets.

## Release Boundary

Connected agent coordination is intentionally outside the main install, workspace, and release package. The main package should not depend on it and should not expose setup for it in normal flows.

`packages/orchestrator` may exist in the repository as PRE-BETA test code for MCP-connected root/worker flows. It is not the product a new user installs, it is not included by root `pnpm install`, and it is not included in the root npm tarball.

Acceptable main-package references:

- Maintainer docs may mention connected coordination as PRE-BETA test code.
- Root tests may assert spawner runs do not receive injected Reeves context.
- Shared state may preserve old internal names for compatibility.

Not acceptable in the main package:

- install-time provider config writes
- add-on setup commands in root CLI help
- root/worker choice in the New Run flow
- connected-only decision screens in the main TUI
- provider launch injection for spawner terminals

## Release Bar

A release-ready main package must pass:

```sh
pnpm verify
pnpm pack --dry-run
```

Before tagging, also install the packed tarball in a clean temp project with fake `HOME`, `REEVES_REGISTRY`, and `REEVES_CONFIG`, then run:

```sh
reevesagents --version
reevesagents doctor --json
```

Manual TUI smoke remains required before public release because Ink UI behavior is terminal-dependent.
