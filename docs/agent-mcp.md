# Agent Control MCP (design)

Status: design. No code yet. This document is the plan we agreed on; the
implementation follows it step by step.

## What this is

The main `reevesagents` package gains an optional MCP server that lets any AI
CLI agent spawn and control other AI CLI agents: start one, type into it, send
keys, read its output, and approve its requests.

It is a mechanism only. The heavier orchestration (root/child roles, autonomous
loops, the coordination protocol) stays in the separate
`reevesagents-orchestrator` package. The MCP is off by default. You turn it on
from the TUI or the Web UI.

## Why it is split this way: mechanism vs policy

- Main package is the mechanism: the raw ability to spawn a CLI and drive it.
- Orchestrator package is the policy: roles, who may control whom, autonomous
  loops, approval rules.

This keeps the main package small, and keeps the powerful, opinionated parts
opt-in and separate.

## The model: a run is a CLI plus what it spawned

When an agent uses the MCP to spawn other agents, the spawning agent and the
agents it spawned form one run.

- The spawning agent is the head of the run, shown first, at the top.
- The agents it spawned follow, in order.
- The whole run shows up in the TUI and Web UI like any other run.

The spawning agent can be one of two things:

- An agent reeves launched itself: a tmux pane reeves controls fully.
- An external CLI the user started themselves, with the MCP attached: it is
  recorded as a headless head. It is visible at the top of the run, but reeves
  does not drive its pane (it is the user's own session). This reuses the
  existing `headless` agent concept already in the code.

Either way, the group is one run, head at the top.

## The tool set (flat, mechanism only)

Any agent that has the MCP can call any of these, on any run or agent. There are
no roles at this layer; it is flat on purpose ("any agent can manage any
agent").

- `spawn`: start a CLI agent (a new run, or add one to an existing run)
- `kill`: stop one agent
- `stop`: stop a whole run
- `send_text`: paste text (a prompt) into an agent
- `send_key`: send one key (enter, escape, tab, space, up, down, left, right,
  backspace, ctrl-c)
- `interrupt`: send ctrl-c
- `read`: read an agent's recent output
- `list`: list runs and agents with their status
- `request_approval`: ask for approval before an action
- `resolve_approval`: approve or deny a request (plus `check` and `list` for
  reading approval state)

No inbox, no task-status protocol, no role scoping here. Those belong to the
orchestrator package.

## Activation: off by default, installed from the UI

The main package never attaches the MCP to any CLI on its own.

The TUI and Web UI gain an "Agent control" screen that lists the CLIs on this
machine that can host an MCP server: claude, codex, kimi, qwen, opencode,
hermes. For each one you can attach, detach, or attach all.

- Attach runs that CLI's own command, for example:
  `claude mcp add reevesagents -- reevesagents mcp`. Every supported CLI has its
  own `mcp add` / `mcp remove`, so reeves never edits provider config files by
  hand; it calls the CLI's own command.
- Detach runs the matching remove.

Installing it is your explicit choice. That choice is the consent. After that,
the CLI you attached has the reeves tools whenever it starts, and nothing else
does.

For agents reeves launches itself, the MCP can also be attached per run (scoped,
no global footprint), so a spawned worker can spawn its own sub-workers without
touching your everyday CLI config.

## Packaging

The lean MCP lives in the main package but is loaded lazily: it is only imported
when you run `reevesagents mcp`, so the TUI and CLI bundle does not pull MCP code
in by default. This is the same lazy-import pattern the `web` command already
uses.

The orchestrator package depends on the main package's mechanism and adds policy
on top. This also lets the orchestrator stop carrying its own copy of the
spawn/drive runtime.

## Safety

The control is intentionally full: any key, any text. So the guardrails sit at
the resource level, not the control level.

- A cap on how many agents can be spawned at once.
- A cap on spawn recursion depth (A spawns B spawns C ...).

OS isolation comes for free: each agent is a real CLI process in its own tmux
pane. And off-by-default plus explicit install is the first guardrail.

## Out of scope, on purpose

- No change to the state model. The existing JSON registry and run/agent records
  are reused. (The append-only event log from earlier research is a separate,
  later improvement, not part of this.)
- No roles and no autonomous loops here. Those are the orchestrator package's
  job.

## Implementation steps (each one a commit)

1. This design doc.
2. Lean MCP server module: the tool handlers, reusing the existing runtime
   primitives (spawn, send, peek, and so on).
3. `reevesagents mcp` subcommand, lazily loaded.
4. Run head model: record the spawning agent as the run head (top of the run),
   including the headless-head case for external callers.
5. Activation installer in the TUI and Web UI, using each CLI's native
   `mcp add` / `mcp remove`.
6. Guardrails: spawn-count and recursion-depth caps.
7. Tests, and a README update for the new feature.
