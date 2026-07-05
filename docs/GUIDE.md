# ReevesAgents User Guide

**English** · [Deutsch](GUIDE.de.md) · [Français](GUIDE.fr.md) · [Español](GUIDE.es.md) · [Português](GUIDE.pt.md) · [Italiano](GUIDE.it.md) · [Türkçe](GUIDE.tr.md) · [Русский](GUIDE.ru.md) · [简体中文](GUIDE.zh-Hans.md) · [العربية](GUIDE.ar.md)

This guide walks you from a fresh install to the point where one agent is
running the others for you. When you need every command and option instead,
that lives in the [README](../README.md).

## What ReevesAgents is

- A free, local workspace where your AI coding agents (Claude Code, Codex,
  Hermes, DeepSeek, Kimi, and more) work side by side on your machine.
- The part that makes it interesting: one agent can create and drive the
  others. Give a Claude Code session the reins and it will happily run a team
  of Codex and Claude Code agents on separate tasks.
- It sits on top of the CLIs you already have, so every login stays where it
  always was. ReevesAgents never holds an API key and never touches your model
  traffic.
- Its entire state is a bit of JSON under `~/.reeves`. There is no database
  to run, no Docker to pull, and nothing sitting in the background.

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

## The five ways to use it

You reach the same runs through five surfaces. Pick whichever fits the moment:

- **TUI** (`reevesagents`): the terminal app most people live in. Everything is
  a menu, so the arrow keys are all you need.
- **Web UI** (`reevesagents web`): the same runs on one browser page, with a
  live look into any agent. It only ever answers on loopback.
- **CLI** (`reevesagents spawn`, `runs`, `peek`, `open`, `stop`): for scripts,
  or for the days you would rather type than browse.
- **tmux**: where the agents actually live. Because each one is a real CLI in
  its own pane, closing the TUI or the Web UI never interrupts anyone.
- **Agent control** (`reevesagents attach <cli>`): the opt-in MCP that lets one
  agent drive the rest. The next section walks through it.

## Let one agent drive the rest

This is the core feature, and it stays off until you turn it on.

- Turn it on for your CLI with `reevesagents attach claude`, or run a bare
  `reevesagents attach` to connect every installed CLI it can host. The
  **Agent control** screen in the TUI and Web UI does the same thing.
- `reevesagents hosts` shows where you stand: every CLI on the machine, and
  which of them are connected.
- Then restart that CLI once, because tools are only picked up at session start
  (this is plain MCP, the standard way one agent tool exposes commands to
  another).
- From that point on, your agent can put a new agent on a task, type into it,
  read what it is doing, and approve or deny whatever it asks for.

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
- See what agents are asking for: `reevesagents approvals`, then
  `approve <id>` or `deny <id>`.
- `stop` and `kill` end work, and the `delete` commands remove ended records.
  All of them refuse to run without `--yes`.

## Keeping cost down

- Put a cheap or free model in front as the router, and let it wake the
  expensive one only when a task actually deserves it.
- Routine code and tests are exactly what the cheaper models are for. Save the
  big model for planning and design instead of paying it to write boilerplate.
- Whatever this costs you, it is your providers' normal billing. ReevesAgents
  itself adds nothing on top.

## When something looks off

- Start with `reevesagents doctor`, because it usually names the problem for
  you: Node, tmux, the state folder, and every provider CLI get checked.
- **tmux missing:** install it (`brew install tmux` or `apt install tmux`) and
  let doctor confirm.
- **A provider is not detected:** it is almost always not installed or not
  logged in. ReevesAgents can only launch what is on your `PATH` and signed in.
- **Web UI reports missing packages:** the optional `ws` and `@lydell/node-pty`
  modules were skipped at install time. Reinstalling normally brings them back.
- **Port already in use:** nothing is wrong; `reevesagents web` just takes the
  next free port and prints the URL. Pass `--port <n>` if you care which one.
- More detail in [Troubleshooting](../README.md#troubleshooting).

## Where to go next

- [Docs home](README.md): the full documentation index.
- [Commands](../README.md#commands): every subcommand and flag.
- [Agent control](../README.md#agent-control): the full opt-in model.
- [Configuration](../README.md#configuration): what lives under `~/.reeves`.
- [docs/mcp.md](mcp.md): the Agent control design and tool list.
