<p align="center">
  <img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-header.gif" alt="ReevesAgents" width="800" />
</p>

[![npm version](https://img.shields.io/npm/v/reevesagents.svg)](https://www.npmjs.com/package/reevesagents)
[![visits](https://visitor-badge.laobi.icu/badge?page_id=mertkayacs.reevesagents&left_text=visits)](https://github.com/mertkayacs/reevesagents)
[![node](https://img.shields.io/node/v/reevesagents.svg)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/reevesagents.svg)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/mertkayacs/reevesagents/test.yml?branch=master&label=CI)](https://github.com/mertkayacs/reevesagents/actions/workflows/test.yml)

**English** · [Deutsch](docs/i18n/README.de.md) · [Français](docs/i18n/README.fr.md) · [Español](docs/i18n/README.es.md) · [Português](docs/i18n/README.pt.md) · [Italiano](docs/i18n/README.it.md) · [Türkçe](docs/i18n/README.tr.md) · [Русский](docs/i18n/README.ru.md) · [简体中文](docs/i18n/README.zh-Hans.md) · [العربية](docs/i18n/README.ar.md)

*Let one agent create and control others. A local, tmux-first workspace to spawn and drive agents (Claude Code, Codex, Hermes, DeepSeek, Kimi, and more) from a TUI, Web UI, CLI, and MCP. No API keys, no changes to your Agent.md or Claude.md.*

**In more than 10 languages!**

GitHub: https://github.com/mertkayacs/reevesagents

The TUI and the local Web UI driving the same run:

![ReevesAgents TUI: language picker, welcome screen, and runs](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-tui.gif)

![ReevesAgents Web UI: a live multi-agent run](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-web.png)

ReevesAgents is a free and open source workspace manager for AI CLI agents. Run
several at once, and over MCP let one agent spawn and drive others: a Claude Code
agent managing Codex and Claude Code agents on separate issues. Put each CLI
where it is strongest, for example DeepSeek on backend, Claude on product and web
direction, Codex on a design system or an implementation pass, and Hermes on
mail, search, or research.

The UI is available in 10 languages: English, German, French, Spanish,
Portuguese, Italian, Turkish, Russian, Simplified Chinese, and Arabic.

## Surfaces

| Surface | What it is good for |
| --- | --- |
| **TUI** | Fast keyboard-first control inside the terminal. |
| **Web UI** | One visual view of runs, agents, live panes, and history. |
| **CLI** | Scripts, quick spawn commands, doctor checks, and tmux opening. |
| **tmux** | Real provider CLI windows that keep running locally. |
| **Agent Control (opt-in)** | An MCP you turn on per CLI so one agent can spawn and drive others (Claude Code running Codex, Hermes, and Claude Code agents at once). |

## Why ReevesAgents

- **Let your agent drive agents.** Your lead CLI (say Claude Code) spawns and steers a set of Claude, Codex, DeepSeek, Hermes, OpenCode, or other agents over MCP.
- **Multitask and loop.** Compose agents with orchestration-based runs and put a low-to-medium-cost router model in front to drive smarter or smaller ones. Run several in parallel on different parts of a project, keep looping agents going, and watch the whole orchestration from one view.
- **Keep cost practical.** Let cheap or free models write CRUDs and tests while you plan and design with a bigger one, instead of pushing everything through one expensive default.
- **One workspace, no lost thread.** If you already jump between Claude, Codex, DeepSeek, Hermes, or OpenCode, ReevesAgents puts those sessions in one local place; open any agent from the TUI or Web UI to drive it directly.
- **Stay vendor-flexible.** Provider login stays with each CLI. ReevesAgents never stores credentials or proxies model traffic, so you can add, remove, or switch CLIs freely.
- **See the work at a glance.** Active runs, agents, models, permission modes, stop and delete actions, and history in one Web UI view while tmux keeps the real CLIs alive.

This is not a cloud agent platform. It is a small local layer around real CLIs: no database, no Docker, no background daemon, and no ReevesAgents-stored API keys.

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

Use source when you want to inspect the code, contribute, or run from the
repository.

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
| `web` | Start the on-demand, loopback-only Web UI. Runs in the foreground; agents keep running after you stop it. | `--port <n>` (preferred port, falls back to the next free port), `--no-open` (do not open the browser) |
| `mcp` | Start the Agent Control MCP server over stdio. Not run by hand; the CLI you attach it to from the Agent Control screen runs it. | none |

`stop` and `kill` are the only destructive commands. They refuse to run without
`--yes` or `ALLOW_DESTRUCTIVE=1`.

## Agent Control (opt-in MCP)

ReevesAgents ships an optional MCP server that lets one AI CLI spawn and drive
other AI CLIs: start an agent, paste a prompt, send keys, read output, and
resolve approval requests. It is a flat mechanism, not an orchestration policy:
no roles, no autonomous loops, no coordination protocol.

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

An attached CLI can also discover what it can launch: the `list_providers` tool
and the `reevesagents://providers` resource return the providers on this machine
with their ids, install status, aliases, and known models, so an agent passes a
real id to `spawn` instead of guessing.

See [docs/mcp.md](docs/mcp.md) for the full design and tool list.

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

## Web UI

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

## Not Required

You do not need ReevesAgents-stored API keys, a database, Docker, a background
service, or MCP setup for normal stable agent runs. Install is passive: the
stable package has no postinstall script and does not rewrite provider
configuration. Attaching the Agent Control MCP is the one explicit, opt-in step
that touches provider config, and only through each CLI's own `mcp add` command.

## Contributing

See [CONTRIBUTING.md](.github/CONTRIBUTING.md) for branches and pull request flow,
[SECURITY.md](.github/SECURITY.md) for reporting vulnerabilities, and
[CHANGELOG.md](CHANGELOG.md) for recent changes. The design model lives in
[REEVESAGENTS_DESIGN.md](docs/REEVESAGENTS_DESIGN.md) and the contributor docs are
under [docs/](docs).

End users do not need the development toolchain. Contributors use pnpm,
TypeScript, tsup, Vitest, and ESLint from the repository.

## Links

- npm: https://www.npmjs.com/package/reevesagents
- GitHub: https://github.com/mertkayacs/reevesagents
- Releases: https://github.com/mertkayacs/reevesagents/releases
- Issues: https://github.com/mertkayacs/reevesagents/issues
- Changelog: [CHANGELOG.md](CHANGELOG.md)
- License: [Apache-2.0](LICENSE)

## License

Apache-2.0
