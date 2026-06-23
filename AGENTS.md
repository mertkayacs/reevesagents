# AGENTS.md

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
and logged in. Run it before spawning so a run does not fail on a missing or
signed-out CLI. `reevesagents doctor --json` returns the same as machine-readable JSON.

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
# A Claude Code lead with two Codex workers and one Kimi worker.
reevesagents spawn cc:lead cc:review codex:api codex:tests kimi:docs \
  --name "feature x" \
  --prompt "Build feature X. Lead coordinates; each worker takes a slice."
```

Useful `spawn` flags: `--name <run>`, `--cwd <dir>` (defaults to the current dir),
`--prompt <text>` (pasted into every agent on startup), `--run <run-id>` (add agents
to an existing run instead of starting a new one), `--skip` (run agents without
permission prompts).

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
```

`send` only pastes; follow it with `key <agent-id> enter` to submit. Keys accepted by
`key`: `enter`, `escape`, `backspace`, `tab`, `space`, `up`, `down`, `left`, `right`,
`ctrl-c`.

## Stop cleanly

```sh
reevesagents stop <run-id> --yes       # end a whole run and tear down its tmux session
reevesagents kill <agent-id> --yes     # end one agent
```

`stop` and `kill` are the only destructive commands, so they refuse to run without
`--yes`.

## Scripting notes

- `runs`, `agents`, `providers`, and `doctor` all accept `--json`.
- `spawn` prints the new run id (first 8 chars) and agent count; capture it, or read it
  back from `runs --json`.
- Override the state dir with `REEVES_REGISTRY` and the config file with `REEVES_CONFIG`
  to keep a scripted run isolated from `~/.reeves`.

## More

- [README](README.md): full feature tour and every command.
- [docs/GUIDE.md](docs/GUIDE.md): step-by-step user guide.
- [docs/mcp.md](docs/mcp.md): the agent-control MCP design and tool list.
