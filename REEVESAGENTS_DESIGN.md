# ReevesAgents Design

This document is the canonical design for the stable main package and the explicit PRE-BETA add-on path. The default release path is the spawner app with optional Web beta. Orchestrator/MCP is a separate PRE-BETA package and must be installed intentionally.

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
- at least one provider CLI: `claude`, `codex`, `opencode`, `hermes`, `kimi`, `deepseek`, `pi`, `qwen`, or `aider`

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
| `kimi` | Kimi Code | `kimi` |
| `deepseek` | DeepSeek CLI | `deepseek` |
| `pi` | Pi | `pi` |
| `qwen` | Qwen Code | `qwen` |
| `aider` | Aider | `aider` |

Agent-run launch rules:

- pass only provider-supported launch flags
- paste the optional initial prompt into the terminal
- leave model defaults to the provider when the model field is blank
- default permissions to `ask`
- allow skip permissions only when the provider has a known CLI flag for it

Agent runs must not inject ReevesAgents runtime environment variables into provider CLIs.

## TUI

The TUI is visible-menu first:

- arrows move
- Enter selects
- Esc/Backspace goes back
- no slash commands
- no hidden command palette
- no embedded terminal emulator

Pages:

- Welcome: persistent main menu, current run shortcut, and Start Web UI (beta).
- Runs: sectioned run dashboard with stable, low-flicker rows.
- Run: workspace view for one run.
- Agents: list provider windows in the run.
- Agent detail: inspect provider, status, working directory, ids, prompt, output, open, and close.
- New Run: configure a run and its initial agents.
- Add Agent: add one agent to an existing run.
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
reevesagents web
reevesagents web --prebeta-orchestrator
```

CLI design rules:

- No args opens the TUI.
- `spawn` creates an independent multi-terminal run.
- `runs --json` is the script-friendly listing surface.
- `open` switches tmux to a run or terminal when possible; otherwise it prints a pasteable tmux command.
- `peek` prints recent terminal output.
- `stop` and `kill` require `--yes` or `ALLOW_DESTRUCTIVE=1`.
- `web` starts an on-demand, loopback-only browser UI for spawner terminals and stops when the process exits.
- `web --prebeta-orchestrator` starts the same browser UI with PRE-BETA orchestrator/MCP run controls, only when the separate orchestrator package is installed.

## Config And Doctor

Config is local and optional. Doctor should check only things the main package needs:

- Node.js version
- tmux availability
- state path writability
- provider CLI availability

Doctor must not write provider config files or ask for provider secrets.

## Web UI (Beta)

The web UI is an optional, on-demand surface for driving spawner terminals from a browser. It is part of the stable package, not connected-agent coordination. It does not change the spawner model: a run is still a tmux session, a terminal is still one provider CLI window. The web UI reads the same registry and drives the same tmux targets the TUI and CLI use. It is a viewer and controller over state that already exists, never a new control plane.

It stays inside the product rules:

- on-demand foreground process, started and stopped by the human, not a background service
- loopback only, with no network-exposure flag in the beta
- no provider config writes and no injected ReevesAgents environment into terminals
- destructive actions confirm, matching CLI and TUI

Remote access is a documented SSH local port-forward, not a product feature. A user who wants the page on another device forwards the loopback port over SSH (`ssh -L 8080:127.0.0.1:8080 user@host`) and opens `http://localhost:8080`. The tool ships no VPN or tunnel and assumes none.

Transport: the page renders each terminal with xterm.js, fed by a small websocket bridge (`ws`) in the same Node process. node-pty attaches that bridge to the terminal's tmux pane, carrying output to the browser and keystrokes back. All three ship inside the package, so there is no external binary to install.

Platforms: macOS and Linux natively, Windows through WSL2. This is the same matrix as the rest of the product, because tmux is the persistence layer and is Unix-only. node-pty is the one native dependency and ships prebuilt binaries for these targets.

Layout:

- a left column of cards, one per terminal in the registry, grouped under its run name
- each card shows a provider-colored monogram avatar, the terminal name, the run name, and a status indicator
- the main area shows the selected terminal, live and interactive
- no brand logos; a local `~/.reeves/logos/<provider>.svg` override is allowed but off by default

Acceptance criteria use EARS. Launch and lifecycle:

- The web server shall run only as an on-demand foreground process started by `reevesagents web` or the TUI Start Web UI entry.
- When the server starts, the system shall bind its HTTP listener to `127.0.0.1` only.
- When the default port is occupied, the system shall bind the next free port in a fixed small range and print the chosen URL.
- When the server starts, the system shall print the access URL and open the browser unless `--no-open` is passed.
- When the server receives SIGINT or SIGTERM, the system shall close every node-pty terminal bridge it opened and exit without leaving an orphaned listener.

Local-access safety (no user login in the loopback beta):

- If a request Host header is outside the loopback allowlist, then the system shall reject the request.
- If a state-changing request Origin does not match the server origin, then the system shall reject the request.

Terminal bridge:

- The system shall bridge the browser to a terminal only through an in-process websocket; no terminal server shall listen on its own network port.
- When a card is opened, the system shall attach node-pty to the tmux target read from that terminal's registry record, never from client-supplied values.
- If tmux is unavailable, then the web UI shall show a clear message and Doctor shall report it.

Sidebar and live state:

- The web UI shall render one card per registry terminal, grouped by run, each showing a provider-colored monogram, the terminal name, the run name, and status.
- While the server runs, the system shall watch the registry and push list and status updates to clients over SSE.
- When a terminal record is added, changed, or removed, the system shall update the affected card without a full page reload.

Actions:

- When the user creates a terminal from the web UI, the system shall reuse the existing spawn path with the validated provider set and a sanitized nickname, and shall type any prompt into the pane rather than a shell.
- When the user selects a card, the system shall present that terminal live and interactive.
- If the user kills a terminal or stops a run, then the system shall require an in-UI confirmation and a server-side confirm flag before acting.
- When the user stops the web server, the system shall leave every tmux terminal running and unchanged.

Doctor and packaging:

- Where the web UI is used, Doctor shall report whether the node-pty terminal bridge loads on this platform.
- The system shall include the web client assets under `dist/` in the published package, asserted by the package contents check.

## Web UI PRE-BETA Orchestrator Mode

The Web UI may opt into orchestrator mode through `reevesagents web --prebeta-orchestrator`.
This is not the default Web UI. It requires `reevesagents-orchestrator` to be installed beside `reevesagents`.

Rules:

- Default `reevesagents web` shall show only spawner runs and call only the root spawner runtime.
- `reevesagents web --prebeta-orchestrator` shall show both spawner and orchestrator runs.
- The pre-beta Web server shall load `reevesagents-orchestrator` dynamically at startup; the root bundle must not statically import MCP code.
- If the orchestrator package is missing, the pre-beta Web command shall fail with a clear install message.
- New runs created in default Web mode shall always be spawner runs.
- New runs created in pre-beta Web mode may be spawner or orchestrator runs.
- Adding a terminal to an existing run shall infer the run mode and dispatch to the matching runtime.
- Headless orchestrator roots shall render as records but shall not be attachable in the browser terminal.
- Orchestrator root kill shall be rejected; stopping the run remains the root-level destructive action.
- Provider options for orchestrator runs shall be limited to the orchestrator-supported set: `cc`, `codex`, `opencode`, and `hermes`.

## Release Boundary

Connected agent coordination is intentionally outside the default main install and root release package. The main package should not depend on it and should not expose setup for it in normal flows.

`beta/orchestrator` may exist in the repository as PRE-BETA code for MCP-connected root/worker flows. It is not part of the root npm tarball, root Homebrew formula, or stable default app. It may ship as the separate `reevesagents-orchestrator` package for users who explicitly choose the all-in PRE-BETA option.

Install choices:

- CLI/TUI only: install `reevesagents` without optional dependencies.
- CLI/TUI plus Web beta: install `reevesagents` normally.
- All-in PRE-BETA: install `reevesagents` and `reevesagents-orchestrator`, then start Web with `--prebeta-orchestrator` or use `reevesagents-orchestrator` directly.

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
- static imports from the root package into orchestrator/MCP modules

## Release Bar

A release-ready main package must pass:

```sh
pnpm verify
pnpm --dir beta/orchestrator verify
pnpm check:install-matrix
pnpm pack --dry-run
```

Before tagging, also install the packed tarball in a clean temp project with fake `HOME`, `REEVES_REGISTRY`, and `REEVES_CONFIG`, then run:

```sh
reevesagents --version
reevesagents doctor --json
```

Manual TUI smoke remains required before public release because Ink UI behavior is terminal-dependent.
