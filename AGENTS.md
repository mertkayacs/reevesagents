# AGENTS.md

**English** · [Deutsch](AGENTS.de.md) · [Français](AGENTS.fr.md) · [Español](AGENTS.es.md) · [Português](AGENTS.pt.md) · [Italiano](AGENTS.it.md) · [Türkçe](AGENTS.tr.md) · [Русский](AGENTS.ru.md) · [简体中文](AGENTS.zh-Hans.md) · [العربية](AGENTS.ar.md)

How an AI coding agent drives ReevesAgents. This file is the operator's guide for
the tool itself. It does not change how agents behave in your own projects.

ReevesAgents runs AI coding CLIs (Claude Code, Codex, Kimi, Qwen, OpenCode, Hermes,
and others) side by side, each as a real CLI in its own tmux window. One agent can
spawn, steer, and supervise the rest. State lives in local JSON under `~/.reeves`.
No API keys, no database, no background daemon.

## Two ways to use it

1. **Drive the CLI directly.** Run `reevesagents spawn ...` to start agents, then
   `runs`, `peek`, `send`, and `stop` to watch and steer them. Good for scripts and
   one-off orchestration.
2. **Let your host CLI drive others over MCP.** `reevesagents attach <cli>` gives that
   CLI a set of agent-control tools (spawn, send_text, read, kill, ...). After you
   restart the CLI, a single session can spawn a team and direct it. This is the core
   feature. See [docs/mcp.md](docs/mcp.md).

## Setup check first

```sh
reevesagents doctor
```

Reports tmux, Node, the `~/.reeves` state dir, and which provider CLIs are installed
and CLI-compatible (it inspects each CLI's `--help`). It cannot test whether a CLI is
signed in, so an installed but signed-out CLI still passes here. Run it before spawning
so a run does not fail on a missing CLI; `peek` (below) catches a window left sitting at
a login screen. `reevesagents doctor --json` returns the same as machine-readable JSON.

Requirements: Node 20.19+, tmux 3.0+, and at least one provider CLI installed and
authenticated. macOS, Linux, or WSL (native Windows is not a target).

## Install

```sh
pnpm add -g reevesagents     # or: npm install -g reevesagents
```

No-install run: `pnpm dlx reevesagents doctor`.

## Spawn agents

Each agent is written as `provider[:nickname[:model]]`; nickname and model are
optional. The first agent leads the run; the rest join it as workers.

```sh
# A Claude Code lead, a second Claude Code reviewer, two Codex workers, one Kimi worker.
reevesagents spawn cc:lead cc:review codex:api codex:tests kimi:docs \
  --name "feature x" --skip \
  --prompt "Build feature X. Lead coordinates; each worker takes a slice."
```

Before it starts anything, `spawn` checks that every named provider CLI is on PATH and
names any that are missing, so a typo or an uninstalled CLI fails fast instead of
half-starting a run. On success it prints the run id, each agent's id, and the exact
`peek`/`send`/`open` commands to drive them.

Useful `spawn` flags: `--name <run>`, `--cwd <dir>` (defaults to the current dir),
`--prompt <text>` (pasted into every agent on startup), `--skip` (launch agents without
their own permission prompts; use it when no human is there to approve), `--run <run-id>`
(add agents to an existing run instead of starting a new one), `--extra-args <args>`
(flags appended to every agent launch, for provider options ReevesAgents does not model,
e.g. `--remote-control`), `--json` (print the run and agent ids as JSON instead of text).

## Provider ids and aliases

Run `reevesagents providers` (add `--json` for a machine list). Any alias works as the
provider in a spawn spec.

| id         | provider     | common aliases              |
| ---------- | ------------ | --------------------------- |
| `cc`       | Claude Code  | `claude`, `claude-code`     |
| `codex`    | Codex CLI    | `codex-cli`                 |
| `kimi`     | Kimi Code    | `kimi-code`                 |
| `qwen`     | Qwen Code    | `qwen-code`                 |
| `opencode` | OpenCode CLI | `open_code`                 |
| `hermes`   | Hermes       |                             |
| `pi`       | Pi           |                             |
| `aider`    | Aider        |                             |
| `deepseek` | DeepSeek CLI | `deepseek-cli`              |

## Watch and steer running agents

```sh
reevesagents runs                      # list live runs (add --json for scripts)
reevesagents agents <run-id>           # list the agents in one run
reevesagents peek <agent-id> -n 40     # recent output from one agent
reevesagents send <agent-id> "do X"    # paste text at the agent's prompt
reevesagents key <agent-id> enter      # submit it (send does not submit on its own)
reevesagents interrupt <agent-id>      # ctrl-c the agent
reevesagents open <run-id|agent-id>    # jump to its tmux window
reevesagents approvals                 # pending approval requests (add --json)
reevesagents approve <approval-id>     # resolve one; deny <approval-id> refuses it
```

`send` only pastes; follow it with `key <agent-id> enter` to submit. Keys accepted by
`key`: `enter`, `escape`, `backspace`, `tab`, `space`, `up`, `down`, `left`, `right`,
`ctrl-c`.

## Stop cleanly

```sh
reevesagents stop <run-id> --yes       # end a whole run and tear down its tmux session
reevesagents kill <agent-id> --yes     # end one agent
```

`stop` and `kill` refuse to run without `--yes`. The same gate covers cleanup:
`delete <agent-id>` and `delete-run <run-id>` remove ended records, and
`delete-history <id>` removes an archived one.

## A worked example: five agents, then drive them

The scenario "install reevesagents, spawn two Claude, two Codex, and one Kimi, and put
them to work" from start to finish.

```sh
# 1. Confirm the five CLIs are installed and compatible.
reevesagents doctor

# 2. Start the team. --skip so workers do not stop for their own permission prompts.
reevesagents spawn cc:lead cc:review codex:api codex:tests kimi:docs \
  --name "feature x" --skip \
  --prompt "Build feature X. Lead coordinates; each worker owns one slice."

# 3. spawn prints each agent id. List them all, or read one.
reevesagents agents <run-id>
reevesagents peek <agent-id> -n 40

# 4. Steer: paste a message, then submit it.
reevesagents send <agent-id> "rebase on main, then run the tests"
reevesagents key  <agent-id> enter

# 5. Add a worker to the same run later.
reevesagents spawn codex:perf --run <run-id> --skip --prompt "profile the hot path"

# 6. End the run when done.
reevesagents stop <run-id> --yes
```

Driving it from a host CLI over MCP instead of the shell, the same scenario is one
instruction: "Use reevesagents to start a team, a Claude Code lead, a second Claude Code
reviewer, two Codex workers (api and tests), and a Kimi worker for docs. Skip permission
prompts, give them the brief, then watch and report progress." The host calls the
spawn/read/send tools itself. See [docs/mcp.md](docs/mcp.md).

## Do and don't

Do:

- Run `doctor` before a spawn, and make sure every provider you name is installed **and
  signed in**. doctor cannot test sign-in; if a window stalls, `peek` shows the login screen.
- Treat `spawn` as fire-and-forget. It returns ids, not answers. Poll with `runs`,
  `agents <run-id>`, and `peek <agent-id> -n 40` to see what a team is doing.
- Submit input in two steps: `send <agent-id> "..."` pastes, `key <agent-id> enter` submits.
- Pass `--skip` when no human will sit and approve prompts, or workers stall at the first one.
- Use `--json` (on `spawn`, `runs`, `agents`, `providers`, `doctor`) when a script or an
  agent needs to read ids and state instead of text.
- Name providers by id or any alias from `reevesagents providers` (`cc` or `claude`, `codex`, `kimi`, ...).

Don't:

- Don't expect `spawn` to hand back an agent's result; start the team, then read it.
- Don't `send` and assume it ran; nothing submits until you `key <agent-id> enter`.
- Don't spawn a provider that is missing or signed out; spawn refuses the first, and the
  second leaves a window parked at a login prompt that never does the work.
- Don't run `stop`, `kill`, or the `delete` commands without `--yes`; those are the destructive ones.
- Don't target native Windows; run inside WSL with tmux and the CLIs installed there.
- Don't paste secrets into a `--prompt` or `send`; output is captured and shown through `peek` and the web UI.

## Scripting notes

- `spawn`, `runs`, `agents`, `providers`, and `doctor` all accept `--json`.
- `spawn --json` prints the run id and every agent id; capture those, or read them back
  from `runs --json` and `agents <run-id> --json`.
- Override the state dir with `REEVES_REGISTRY` and the config file with `REEVES_CONFIG`
  to keep a scripted run isolated from `~/.reeves`.

## More

- [README](README.md): full feature tour and every command.
- [docs/GUIDE.md](docs/GUIDE.md): step-by-step user guide.
- [docs/mcp.md](docs/mcp.md): the agent-control MCP design and tool list.
