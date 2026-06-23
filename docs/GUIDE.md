# ReevesAgents User Guide

**English** · [Deutsch](GUIDE.de.md) · [Français](GUIDE.fr.md) · [Español](GUIDE.es.md) · [Português](GUIDE.pt.md) · [Italiano](GUIDE.it.md) · [Türkçe](GUIDE.tr.md) · [Русский](GUIDE.ru.md) · [简体中文](GUIDE.zh-Hans.md) · [العربية](GUIDE.ar.md)

A plain, step-by-step walkthrough: install it, make your first run, and let one
agent drive the others. For the full command and option reference, see the
[README](../README.md).

## What ReevesAgents is

- A free, local workspace for AI coding agents (Claude Code, Codex, Hermes,
  DeepSeek, Kimi, and more). They run side by side on your machine.
- The headline idea: one agent creates and drives the others. A Claude Code
  agent can start and steer a team of Codex and Claude Code agents on separate
  tasks.
- It runs on top of the real CLIs you already have. Provider login stays with
  each CLI. ReevesAgents stores no API keys and never proxies your model traffic.
- No database, no Docker, no background service. State is local JSON under
  `~/.reeves`.

## Before you start

- macOS, Linux, or WSL (native Windows is not the target; use WSL).
- Node.js 20.19 or newer.
- tmux 3.0 or newer.
- At least one provider CLI installed and logged in: Claude Code, Codex,
  OpenCode, Hermes, Kimi, DeepSeek, Pi, Qwen, or Aider.

## Install and check

- Install it globally: `npm install -g reevesagents`
- Check your machine: `reevesagents doctor` (verifies Node, tmux, the state
  folder, and which provider CLIs it can see).
- Launch it: `reevesagents`
- Prefer pnpm, Yarn, Bun, npx, or Homebrew? See [Install](../README.md#install)
  in the README.

## Your first run

The quickest reproducible run is from the command line. A run has one lead agent
and any number of workers; each agent is written as `provider[:nickname[:model]]`:

```sh
reevesagents spawn claude-code:lead codex:worker \
  --name "first run" \
  --prompt "Say hello and list the files in this folder."
```

- `claude-code:lead` is the lead, `codex:worker` is a worker. With no agent
  named, the run defaults to `codex`.
- `--name` labels the run, `--cwd` sets the working folder (defaults to where you
  are), and `--prompt` is pasted into each agent.

Prefer a visual start? Run `reevesagents` for the TUI or `reevesagents web` for
the local Web UI and create the run from there.

## The four ways to use it

You reach the same runs through four surfaces. Pick whichever fits the moment:

- **TUI** (`reevesagents`): fast, keyboard-first control inside the terminal.
- **Web UI** (`reevesagents web`): one visual view of runs, agents, live panes,
  and history. Local and loopback-only.
- **CLI** (`reevesagents spawn`, `runs`, `peek`, `open`, `stop`): scripts, quick
  commands, and health checks.
- **tmux**: every agent is a real CLI in its own tmux pane, so the sessions keep
  running locally even after you close the TUI or Web UI.

## Let one agent drive the rest

This is the core feature, and it stays off until you turn it on.

- Turn it on for your CLI: `reevesagents attach claude` (or `reevesagents attach`
  to connect every installed CLI it can host). You can also do this from the
  **Agent control** screen in the TUI or Web UI.
- Confirm it: `reevesagents hosts` lists the CLIs on your machine and shows which
  ones are connected.
- Reload your CLI: restart the session so it picks up the new tools (this uses
  MCP, the standard way one agent tool exposes commands to another).
- Now your agent can create and drive other agents: start an agent on a task,
  send it text or keypresses, read what it is doing, and approve or deny what it
  asks for.

A worked example: attach to Claude Code, restart it, and from inside one Claude
Code session you can spawn a Codex agent on one issue and a second Claude Code
agent on another, then watch and steer both.

- CLIs that can host this today: claude, codex, kimi, qwen, opencode, hermes.
  OpenCode is attached by hand, since its own add step is interactive.
- Workers do not get these tools by default, so a worker cannot spawn more
  agents. To let a worker drive its own sub-agents, attach the MCP to that
  worker's CLI too.
- To disconnect later: `reevesagents detach claude`.

## Everyday tasks

- See what is running: `reevesagents runs` (add `--json` for scripts).
- Watch one agent without leaving your shell: `reevesagents peek <agent> -n 40`.
- Jump into an agent's tmux pane: `reevesagents open <agent>`.
- Stop a whole run: `reevesagents stop <run> --yes`.
- Stop a single agent: `reevesagents kill <agent> --yes`.
- `stop` and `kill` are the only commands that end work, so they refuse to run
  without `--yes`.

## Keeping cost down

- Put a cheaper or free model in front to route work, and let it hand heavy tasks
  to a stronger agent only when needed.
- Let cheap models write routine code and tests while you plan and design with a
  bigger one, instead of pushing everything through one expensive default.
- Provider quotas and billing stay with each CLI. ReevesAgents adds no cost of
  its own.

## When something looks off

- Run `reevesagents doctor` first. It checks Node, tmux, the state folder, and
  your provider CLIs, and tells you what is failing.
- **tmux missing:** install it (`brew install tmux` or `apt install tmux`) and
  run doctor again.
- **A provider is not detected:** ReevesAgents only launches CLIs that are on
  your `PATH` and logged in. Install or sign in to that CLI.
- **Web UI reports missing packages:** it needs `ws` and `@lydell/node-pty`.
  Reinstall with optional dependencies enabled.
- **Port already in use:** `reevesagents web` starts on `8080` and falls back to
  the next free port; pass `--port <n>` to choose another.
- More detail in [Troubleshooting](../README.md#troubleshooting).

## Where to go next

- [Docs home](README.md): the full documentation index.
- [Commands](../README.md#commands): every subcommand and flag.
- [Agent control](../README.md#agent-control): the full opt-in model.
- [Configuration](../README.md#configuration): what lives under `~/.reeves`.
- [docs/mcp.md](mcp.md): the Agent control design and tool list.
