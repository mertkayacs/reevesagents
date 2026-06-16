# ReevesAgents

[![npm version](https://img.shields.io/npm/v/reevesagents.svg)](https://www.npmjs.com/package/reevesagents)
[![npm downloads](https://img.shields.io/npm/dm/reevesagents.svg)](https://www.npmjs.com/package/reevesagents)
[![node](https://img.shields.io/node/v/reevesagents.svg)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/reevesagents.svg)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/mertkayacs/reevesagents/test.yml?branch=master&label=CI)](https://github.com/mertkayacs/reevesagents/actions/workflows/test.yml)

*No Api-keys / Without any change to your Mds. A WebUi/Tui/Cli/mcp to mix-match and spawn agents such as Claude Code, Codex, HermesAgent, DeepSeekCli, KimiCode and many others. With reevesagents you can use the webui to spawn runs where the hermes sends mails where multiple claudecode and codex agents work on the separate parts of the projects or to maintain more than one task at parallel. Reevesagents also can be used to install custom mcps to these agents which gives them the ability to spawn and control other agents. With loop engineering user can have multiple looping agents and a full view of these orchastrations. From tui and webui view you can easily jump into each agent to control them directly. Reevesagents is a local tmux-first workspace manager for AI CLI agents.*

GitHub: https://github.com/mertkayacs/reevesagents

ReevesAgents is a free and open source workspace manager for AI CLI agents. It
helps you use several agents (ClaudeCode, Codex, Hermes ..) at the same time offering the ability to use these agents via mcp. So that a Claude agent can create and manage a set of Codex and ClaudeCode agents tackling separate issues.
Put each CLI where it is strongest: ask DeepSeek to work on backend code, use
Claude for product and website direction, use Codex for a design system or
implementation pass, and keep Hermes agents on mail, web, search, or research
tasks when those CLIs are configured for that work. ReevesAgents gives the work
a shared local shape: runs, agents, tmux windows, history, a TUI, and a local
Web UI.

The UI is available in 10 languages: English, German, French, Spanish,
Portuguese, Italian, Turkish, Russian, Simplified Chinese, and Arabic.

## Surfaces

| Surface | What it is good for |
| --- | --- |
| **TUI** | Fast keyboard-first control inside the terminal. |
| **Web UI (beta)** | One visual view of runs, agents, live panes, and history. |
| **CLI** | Scripts, quick spawn commands, doctor checks, and tmux opening. |
| **tmux** | Real provider CLI windows that keep running locally. |
| **Agent Control (opt-in)** | An MCP you can install tp turn on per CLI so an agent can spawn and drive other agents (Claude using HermesAgent, Codex, ClaudeCode simultaneously. |
## Why ReevesAgents

**Use more than one CLI without losing the thread.** If you already jump between
Claude, Codex, DeepSeek, Hermes, OpenCode, or other agent CLIs, ReevesAgents
puts those sessions into one local workspace.

**Stay vendor-flexible.** Provider login still belongs to each provider CLI, but
ReevesAgents does not become another place for credentials or model traffic. You
can add, remove, or switch CLIs without rebuilding the way you manage runs.

**Keep cost practical.** Route work to the CLI that makes sense for the task
instead of pushing everything through one expensive default.

**See the work at a glance.** The Web UI is useful when several agents are
running: active runs, agents, models, permission modes, stop and delete actions,
and history are visible from one browser view while tmux keeps the real CLIs
alive.

This is not a cloud agent platform. It is a small local layer around real CLIs.
There is no database, no Docker, no background daemon, and no ReevesAgents-stored
API keys.

## Screenshots

The launch-week demo shows the core workflow: split one project across the CLIs
that fit each job, keep every session local in tmux, and watch the whole run
from the TUI or Web UI.

### TUI

Recorded with VHS. Pick a language, jump from the ASCII-art welcome screen into
active runs, then open the run to see agents, tasks, status, and history.

![ReevesAgents TUI language selection, welcome screen, and runs page](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-tui.gif)

### Web UI (beta)

The same local run in the browser: DeepSeek drafts the backend, Claude Code
works on product and web direction, Codex reviews the implementation path, and
Hermes waits for explicit research approval.

![ReevesAgents Web UI showing a live multi-agent run](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-web.png)

## Install

ReevesAgents is published on npm as `reevesagents`. Install it globally with the
package manager you already use, then verify the machine with `doctor`.

```sh
npm install -g reevesagents
reevesagents doctor
reevesagents
```

To pin a version, append `@<version>` to the package name, for example
`npm install -g reevesagents@1.2.0`.

<details>
<summary><b>pnpm</b></summary>

```sh
pnpm add -g reevesagents
reevesagents doctor
reevesagents
```

One-shot, no global install:

```sh
pnpm dlx reevesagents doctor
```

</details>

<details>
<summary><b>Yarn</b></summary>

One-shot with Yarn (Berry):

```sh
yarn dlx reevesagents doctor
```

Global install with Yarn Classic:

```sh
yarn global add reevesagents
reevesagents doctor
reevesagents
```

</details>

<details>
<summary><b>Bun</b></summary>

```sh
bun add -g reevesagents
reevesagents doctor
reevesagents
```

One-shot, no global install:

```sh
bunx reevesagents doctor
```

</details>

<details>
<summary><b>npx (no install)</b></summary>

```sh
npx reevesagents doctor
```

</details>

<details>
<summary><b>Homebrew</b></summary>

```sh
brew tap mertkayacs/reevesagents
brew install reevesagents
reevesagents doctor
reevesagents
```

</details>

<details>
<summary><b>From source</b></summary>

Use source when you want to inspect the code, contribute, or test the pre-beta
research package from the repository.

```sh
git clone https://github.com/mertkayacs/reevesagents.git
cd reevesagents
pnpm install
pnpm build
pnpm link --global
reevesagents doctor
reevesagents
```

</details>

## Prerequisites

ReevesAgents is local-first. It expects a normal developer machine with tmux and
at least one provider CLI already installed.

- macOS, Linux, or WSL. Native Windows is not the target runtime; use WSL.
- Node.js `20.19+`.
- tmux. Version `3.0+` is recommended.
- A normal interactive shell on `PATH`.
- At least one supported provider CLI on `PATH`.

ReevesAgents can launch these provider CLIs when they are installed and
authenticated on your machine: Claude Code, Codex CLI, OpenCode, Hermes, Kimi,
DeepSeek, Pi, Qwen, and Aider. Provider login, models, tools, quotas, and
permission prompts stay with each provider. ReevesAgents does not store provider
API keys and does not proxy model traffic.

## Quick Start

```sh
reevesagents                 # launch the TUI
reevesagents web             # open the local Web UI
reevesagents doctor          # check the machine
```

Start a named run from the CLI. The first spec is the lead, the rest are
workers, and each spec is `provider[:nickname[:model]]`:

```sh
reevesagents spawn deepseek:backend claude-code:product codex:system hermes:research \
  --name "launch week build" \
  --prompt "Plan the backend, product surface, design system, and research notes."
```

## Commands

No arguments launches the TUI. The subcommands are the operator surface for
humans and scripts.

| Command | Purpose | Key flags |
| --- | --- | --- |
| `reevesagents` | Launch the TUI (no subcommand). | none |
| `spawn [spec...]` | Start a run with one or more provider agents. Each `spec` is `provider[:nickname[:model]]`. The first spec is the lead, the rest are workers. No spec defaults to `codex`. | `--name <name>` (default `run`), `--cwd <dir>` (default current dir), `--prompt <text>` (pasted into each agent) |
| `runs` | List active runs, one per line. | `--json` (full run records as a JSON array) |
| `open <id>` | Switch tmux to a run's Reeves window or an agent window. Inside tmux it switches; outside tmux on a TTY it attaches; otherwise it prints a pasteable tmux command. Accepts a run id/name or an agent id/nickname (prefix match allowed). | none |
| `peek <agent-id>` | Print recent output from one agent. | `-n, --lines <n>` (default `20`), `--json` (lines as an array) |
| `stop <run-id>` | Stop one run. | `-y, --yes` (or `ALLOW_DESTRUCTIVE=1`) |
| `kill <agent-id>` | Stop one agent. | `-y, --yes` (or `ALLOW_DESTRUCTIVE=1`) |
| `doctor` | Run environment health checks (Node, tmux, state path, provider CLIs). Exits non-zero on any failed check. | `--json` |
| `web` | Start the on-demand, loopback-only Web UI. Runs in the foreground; agents keep running after you stop it. | `--port <n>` (preferred port, falls back to the next free port), `--no-open` (do not open the browser), `--prebeta-orchestrator` (enable pre-beta orchestrator controls when the separate package is installed) |
| `mcp` | Start the Agent Control MCP server over stdio. Not run by hand; the CLI you attach it to from the Agent Control screen runs it. | none |

`stop` and `kill` are the only destructive commands. They refuse to run without
`--yes` or `ALLOW_DESTRUCTIVE=1`.

## Agent Control (opt-in MCP)

ReevesAgents ships an optional MCP server that lets one AI CLI spawn and drive
other AI CLIs: start an agent, paste a prompt, send keys, read output, and
resolve approval requests. It is a mechanism, not an orchestration policy. The
heavier autonomous coordination (roles, loops, the coordination protocol) stays
in the separate pre-beta `reevesagents-orchestrator` package.

It is off by default. ReevesAgents never attaches it to a CLI on its own.

You turn it on from the **Agent control** screen in the TUI or the Web UI. That
screen lists the CLIs on this machine that can host an MCP server (claude,
codex, kimi, qwen, opencode, hermes) and lets you attach, detach, or attach all.
Attaching runs that CLI's own `mcp add` command (for example
`claude mcp add reevesagents -- reevesagents mcp`); detaching runs the matching
remove. ReevesAgents only calls each CLI's own command and never edits provider
config files by hand. OpenCode is the exception: its `mcp add` is interactive
and has no remove, so the screen marks it attach-by-hand.

Once a CLI is attached, it has the Agent Control tools whenever it starts.
Installing it is your explicit choice, and that choice is the consent. One run
is the controlling CLI as the head plus the agents it spawned, and the whole
group shows up in the TUI and Web UI like any other run.

Spawned workers do not receive the MCP by default, so they cannot spawn further
agents. To let a worker drive its own sub-workers, attach the MCP to that
worker's CLI from the same screen. Guardrails sit at the resource level: a
per-run agent cap (`max_agents`), enforced when the spawn tool adds to a run,
and the fact that each agent is a real CLI process in its own tmux pane.

See [docs/agent-mcp.md](docs/agent-mcp.md) for the full design and tool list.

## Configuration

State and config are local JSON. No database, no daemon.

State lives under `~/.reeves`:

```text
~/.reeves/
  config.json     global settings (peek interval, language, default permissions, limits)
  presets/        saved run presets
  runs/           one folder per active run (run.json plus agents/<id>.json)
  history/        archived ended and stale runs (history/runs/<id>.json)
```

Two environment variables override the defaults, mainly for isolated test or
multi-profile use:

- `REEVES_REGISTRY`: state root override. Replaces `~/.reeves` as the directory
  for `runs/`, `history/`, and `presets/`.
- `REEVES_CONFIG`: config file path override. Replaces `~/.reeves/config.json`.

Text fields that can hold secrets are redacted before they are written to state.

## Examples

Spread one project across the CLIs that fit each job:

```sh
reevesagents spawn deepseek:backend claude-code:product codex:review \
  --name "feature x" --prompt "Backend, product copy, and a review pass."
```

List what is alive and grab the run id:

```sh
reevesagents runs
reevesagents runs --json   # script-friendly
```

Watch a single agent without leaving your shell, then jump into it when it needs
you:

```sh
reevesagents peek backend -n 40
reevesagents open backend
```

When the work is done, stop the whole run in one call:

```sh
reevesagents stop "feature x" --yes
```

## Web UI (beta)

The Web UI is local and loopback-only.

```sh
reevesagents web
```

It binds to `127.0.0.1`, runs in the foreground, and exits when you stop it.
Agents keep running in tmux afterward. From the browser you can create runs, add
agents, choose provider models and permission modes, stop agents, delete ended
work, and inspect history while the real CLIs keep running.

The Web UI uses two optional runtime modules, `ws` and `@lydell/node-pty`. npm
installs them by default. The CLI and TUI keep working without them, and the
`web` command explains what is missing.

To reach the Web UI from another machine, forward the loopback port over SSH.
There is no built-in tunnel:

```sh
ssh -L 8080:127.0.0.1:8080 user@host
# then browse to http://localhost:8080
```

## Troubleshooting

**tmux is not installed.** ReevesAgents needs tmux for window-based navigation.
Install it (`brew install tmux` or `apt install tmux`) and run
`reevesagents doctor`. The TUI auto-wraps itself in a tmux session named
`reeves`; set `REEVES_NO_TMUX_WRAPPER=1` to skip that behavior.

**A provider CLI is missing or Doctor reports a failure.** ReevesAgents only
launches provider CLIs that are already on your `PATH` and authenticated. Run
`reevesagents doctor` to see which providers are detected and what is failing,
then install or log in to the provider CLI you need.

**The Web UI reports missing packages.** The Web UI needs `ws` and
`@lydell/node-pty`. They may be skipped when the platform has no prebuilt
`@lydell/node-pty` binary or when the install omitted optional dependencies.
Reinstall with optional dependencies enabled, then run `reevesagents doctor`.

**Port already in use.** `reevesagents web` starts on port `8080` by default. If
it is taken, the server binds the next free port in a small range and prints the
chosen URL. Pass `--port <n>` to pick a different starting port.

## Pre-Beta Research: MCP Orchestrator

The stable `reevesagents` package is the CLI, TUI, Web UI, and the opt-in Agent
Control MCP. Connected root/child orchestration with roles, autonomous loops,
and a coordination protocol is separate and pre-beta, in the
`reevesagents-orchestrator` package.

The idea: a root agent coordinates worker agents over MCP, instead of you
dispatching each worker by hand. Orchestrator runs are limited to the
orchestrator-supported providers: `cc`, `codex`, `opencode`, and `hermes`.

**Research-only disclaimer:** orchestrator mode is experimental. Do not use it
to create unattended fully autonomous agent systems. Be careful when routing
outputs between different provider CLIs, especially if one provider's output is
used to prompt or evaluate another. Provider terms, data policies, and
automation rules differ, and some combinations may violate a provider's rules.
Review the terms for the CLIs you use and keep a human in control.

```sh
npm install -g reevesagents reevesagents-orchestrator@pre-beta-research
reevesagents-orchestrator setup
reevesagents web --prebeta-orchestrator
```

`reevesagents-orchestrator setup` may write MCP entries into provider CLI
configuration. Run `reevesagents doctor` and
`reevesagents-orchestrator setup --help` first if you want to review the path
before changing local provider config.

## Not Required

You do not need ReevesAgents-stored API keys, a database, Docker, a background
service, or MCP setup for normal stable agent runs. Install is passive: the
stable package has no postinstall script and does not rewrite provider
configuration. Attaching the Agent Control MCP is the one explicit, opt-in step
that touches provider config, and only through each CLI's own `mcp add` command.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for branches and pull request flow,
[SECURITY.md](SECURITY.md) for reporting vulnerabilities, and
[CHANGELOG.md](CHANGELOG.md) for recent changes. The design model lives in
[REEVESAGENTS_DESIGN.md](REEVESAGENTS_DESIGN.md) and the contributor docs are
under [docs/](docs).

End users do not need the development toolchain. Contributors use pnpm,
TypeScript, tsup, Vitest, ESLint, and Prettier from the repository.

## Links

- npm: https://www.npmjs.com/package/reevesagents
- GitHub: https://github.com/mertkayacs/reevesagents
- Releases: https://github.com/mertkayacs/reevesagents/releases
- Issues: https://github.com/mertkayacs/reevesagents/issues
- Changelog: [CHANGELOG.md](CHANGELOG.md)
- License: [Apache-2.0](LICENSE)

## License

Apache-2.0
