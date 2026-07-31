<p align="center">
  <a href="https://reevesagents.mertkayacs.com">
    <img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-header.gif" alt="ReevesAgents" width="800" />
  </a>
</p>

[![npm version](https://img.shields.io/npm/v/reevesagents.svg)](https://www.npmjs.com/package/reevesagents)
[![visits](https://visitor-badge.laobi.icu/badge?page_id=mertkayacs.reevesagents&left_text=visits)](https://github.com/mertkayacs/reevesagents)
[![node](https://img.shields.io/node/v/reevesagents.svg)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/reevesagents.svg)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/mertkayacs/reevesagents/test.yml?branch=master&label=CI)](https://github.com/mertkayacs/reevesagents/actions/workflows/test.yml)

<h3 align="center"><a href="https://reevesagents.mertkayacs.com">reevesagents.mertkayacs.com</a></h3>

<p align="center">
  <a href="https://reevesagents.mertkayacs.com/demo"><b>Demo</b></a> ·
  <a href="https://reevesagents.mertkayacs.com/docs"><b>Docs</b></a> ·
  <a href="https://reevesagents.mertkayacs.com/faq"><b>FAQ</b></a> ·
  <a href="https://github.com/mertkayacs/reevesagents/issues"><b>Issues</b></a>
</p>

<p align="center">
  <a href="#quick-start"><b>Quick Start</b></a> ·
  <a href="#install"><b>Install</b></a> ·
  <a href="#commands"><b>Commands</b></a> ·
  <a href="#agent-control"><b>Agent Control</b></a> ·
  <a href="#web-ui"><b>Web UI</b></a> ·
  <a href="#configuration"><b>Config</b></a>
</p>

**English** · [Deutsch](docs/i18n/README.de.md) · [Français](docs/i18n/README.fr.md) · [Español](docs/i18n/README.es.md) · [Português](docs/i18n/README.pt.md) · [Italiano](docs/i18n/README.it.md) · [Türkçe](docs/i18n/README.tr.md) · [Русский](docs/i18n/README.ru.md) · [简体中文](docs/i18n/README.zh-Hans.md) · [العربية](docs/i18n/README.ar.md)

ReevesAgents is a local workspace for AI coding CLIs. It runs Claude Code,
Codex, OpenCode, Hermes, Kimi, DeepSeek, Qwen, Pi, Aider, and other provider
CLIs side by side in tmux. You can use it as a normal CLI/TUI/Web UI, or attach
its opt-in MCP so one agent can spawn, read, steer, and stop the rest.

No ReevesAgents-stored API keys. No database. No Docker. No background daemon.
Provider login stays inside each provider CLI.

## Quick Start

```sh
pnpm add -g reevesagents
reevesagents doctor
reevesagents
```

Start a run from the CLI:

```sh
reevesagents spawn claude-code:lead codex:tests hermes:research \
  --name "release check" \
  --prompt "Review the release path, test coverage, and docs."
```

Open the Web UI:

```sh
reevesagents web
```

Let one attached agent drive the others:

```sh
reevesagents attach codex
reevesagents hosts
```

Restart that CLI after attach so it loads the MCP tools.

## What It Gives You

| Surface | Use it for |
| --- | --- |
| **TUI** | Keyboard-first run control inside the terminal. |
| **Web UI** | Local visual view of runs, panes, agents, approvals, and history. |
| **CLI** | Scripts, smoke checks, spawning, state cleanup, and tmux jumps. |
| **Agent Control MCP** | One trusted CLI can spawn and drive other CLIs through local tools. |
| **tmux** | Real provider CLI windows that keep running after the UI closes. |

ReevesAgents is local by design. State is plain JSON under `~/.reeves`, and the
CLIs it starts are the same CLIs you already use by hand.

<a id="install"></a>
<details>
<summary><strong>Install</strong></summary>

ReevesAgents needs Node.js `20.19+`, tmux `3.0+`, and at least one supported
provider CLI installed and authenticated. It supports macOS, Linux, and WSL.

```sh
# Homebrew
brew tap mertkayacs/reevesagents
brew install reevesagents

# pnpm
pnpm add -g reevesagents

# npm
npm install -g reevesagents

# one-shot checks
pnpm dlx reevesagents doctor
npx reevesagents doctor
```

Pin a version with `@<version>`, for example:

```sh
pnpm add -g reevesagents@1.7.2
```

Source install:

```sh
git clone https://github.com/mertkayacs/reevesagents.git
cd reevesagents
pnpm install
pnpm build
pnpm link --global
reevesagents doctor
```

</details>

<a id="screenshots"></a>
<details>
<summary><strong>Screenshots</strong></summary>

The TUI and Web UI drive the same local runs:

![ReevesAgents TUI: language picker, welcome menu, and doctor](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-tui.gif)

![ReevesAgents Web UI: runs and live agent panes](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-web-en.png)

![ReevesAgents Web UI: starting a new run](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-newrun-en.png)

</details>

<a id="commands"></a>
<details>
<summary><strong>Commands</strong></summary>

No arguments launches the TUI.

| Command | Purpose |
| --- | --- |
| `reevesagents` | Launch the TUI. |
| `spawn [spec...]` | Start a run. Each spec is `provider[:nickname[:model]]`. |
| `add [spec...]` | Add agents to the most recent active run. |
| `runs` | List active runs. |
| `agents [run-id]` | List agents across runs or inside one run. |
| `open <id>` | Jump to a run or agent tmux window. |
| `peek <agent-id>` | Print recent output from one agent. |
| `send <agent-id> <text...>` | Paste text into an agent without submitting. |
| `key <agent-id> <key>` | Send `enter`, `escape`, arrows, `tab`, `space`, `backspace`, or `ctrl-c`. |
| `interrupt <agent-id>` | Send Ctrl-C to one agent. |
| `stop <run-id>` | Stop a run. Requires `--yes` or `ALLOW_DESTRUCTIVE=1`. |
| `kill <agent-id>` | Stop one agent. Requires `--yes` or `ALLOW_DESTRUCTIVE=1`. |
| `doctor` | Check Node, tmux, state, and provider CLIs. |
| `web` | Start the loopback-only Web UI. |
| `providers` | List provider ids, aliases, models, and availability. |
| `approvals` | List pending approval requests. |
| `approve` / `deny` | Resolve one approval request. |
| `hosts` | Show which host CLIs have ReevesAgents attached. |
| `attach [cli]` | Connect the Agent Control MCP to one host CLI, or all installed hosts. |
| `detach <cli>` | Remove that MCP connection from one host CLI. |
| `skills [action]` | Install, remove, or inspect the ReevesAgents skill. |
| `mcp` | Start the MCP server over stdio. Host CLIs run this. |
| `config [key] [value]` | Show or update editable settings. |
| `presets` | List saved run presets. |
| `save-preset` | Save a live run as a preset. |
| `start-preset` | Start a run from a preset. |
| `delete-preset` | Delete a preset. |
| `delete` | Delete one ended agent record. Requires confirmation. |
| `delete-run` | Delete one ended run and archive it. Requires confirmation. |
| `history` | List archived runs. |
| `delete-history` | Delete one archived history record. Requires confirmation. |
| `reap` | End zombie agents and agents past `max_lifetime_ms`. |

Common flags:

- `--json`: available on script-facing list and action commands.
- `--name <name>`: name a run.
- `--cwd <dir>`: run agents from a directory.
- `--prompt <text>`: paste startup text into each spawned agent.
- `--skip`: skip provider permission prompts for unattended workers.
- `--run <run-id>`: add agents to a specific run.
- `--port <n>` and `--no-open`: Web UI startup options.

</details>

<a id="agent-control"></a>
<details>
<summary><strong>Agent Control</strong></summary>

Agent Control is an optional MCP server. Attach it only to a CLI you trust to
drive local tools:

```sh
reevesagents attach claude
reevesagents hosts
```

After restart, that CLI receives tools to `spawn`, `read`, `send_text`,
`send_key`, `interrupt`, `kill`, `stop`, manage approvals, manage presets, and
inspect hosts. The provider catalog is also exposed as `reevesagents://providers`.

Workers do not receive the MCP by default. If a worker should create its own
workers, attach ReevesAgents to that worker's CLI explicitly.

Codex sandboxes MCP calls by default, which blocks tmux launches. When using
Codex as the host that drives agents, run it with full access, for example
`codex --sandbox danger-full-access`, or use a Codex profile that sets
`sandbox_mode = "danger-full-access"`.

Full tool reference: [docs/mcp.md](docs/mcp.md). Agent-facing operator guide:
[AGENTS.md](AGENTS.md).

</details>

<a id="configuration"></a>
<details>
<summary><strong>Configuration</strong></summary>

State lives under `~/.reeves`:

```text
~/.reeves/
  config.json
  presets/
  runs/
  history/
```

Two environment variables override the default paths:

- `REEVES_REGISTRY`: state root override for `runs/`, `history/`, and `presets/`.
- `REEVES_CONFIG`: config file path override.

Anything that might contain a secret is scrubbed before it reaches a file.

</details>

<a id="examples"></a>
<details>
<summary><strong>Examples</strong></summary>

Spread one project across multiple CLIs:

```sh
reevesagents spawn deepseek:backend claude-code:product codex:review \
  --name "feature x" \
  --prompt "Backend, product copy, and a review pass."
```

Watch one agent and then open its window:

```sh
reevesagents peek backend -n 40
reevesagents open backend
```

Stop the run when the work is done:

```sh
reevesagents stop "feature x" --yes
```

</details>

<a id="web-ui"></a>
<details>
<summary><strong>Web UI</strong></summary>

```sh
reevesagents web
```

The Web UI binds to `127.0.0.1` only and runs in the foreground. Agents keep
running after the page closes because they live in tmux.

The Web UI uses optional runtime modules, `ws` and `@lydell/node-pty`. npm
installs them by default. CLI and TUI commands keep working without them, and
`reevesagents web` explains what is missing.

To reach it from another machine, forward the loopback port over SSH:

```sh
ssh -L 8080:127.0.0.1:8080 user@host
```

</details>

<a id="troubleshooting"></a>
<details>
<summary><strong>Troubleshooting</strong></summary>

**tmux is not installed.** Install tmux and run `reevesagents doctor`. The TUI
auto-wraps itself in a tmux session named `reeves`; set
`REEVES_NO_TMUX_WRAPPER=1` to skip that behavior.

**A provider CLI is missing or signed out.** ReevesAgents launches provider CLIs
that are already on `PATH` and authenticated. `reevesagents doctor` shows what
is detected. If a launched window is waiting at login, `peek` shows it.

**The Web UI reports missing packages.** Reinstall with optional dependencies
enabled, then run `reevesagents doctor`.

**Port already in use.** `reevesagents web` starts at `8080` by default. If it is
taken, the server binds the next free port in a small range and prints the URL.

</details>

<a id="contributing"></a>
<details>
<summary><strong>Contributing</strong></summary>

Contributor docs live under [docs/](docs). Start with
[CONTRIBUTING.md](.github/CONTRIBUTING.md), [testing](docs/testing.md), and
[releasing](docs/releasing.md).

End users do not need the development toolchain. Contributors use pnpm,
TypeScript, tsup, Vitest, and ESLint from the repository.

</details>

## Links

- Website: https://reevesagents.mertkayacs.com
- npm: https://www.npmjs.com/package/reevesagents
- GitHub: https://github.com/mertkayacs/reevesagents
- Releases: https://github.com/mertkayacs/reevesagents/releases
- Issues: https://github.com/mertkayacs/reevesagents/issues
- Changelog: [CHANGELOG.md](CHANGELOG.md)
- License: [Apache-2.0](LICENSE)

## License

Apache-2.0
