# MCP Tool Guide (PRE-BETA)

`reevesagents-orchestrator mcp` is the PRE-BETA programmatic control plane for agents and operator clients. It uses the same local JSON registry and tmux runtime as the spawner TUI and CLI. The add-on CLI can also call the same tools directly with `reevesagents-orchestrator call <tool>`.

Spawner mode does not use this path. Spawner agents receive no ReevesAgents environment variables, no MCP config, no root/worker role, and no inbox or approval instructions.

## Caller Identity

Caller role is inferred when the MCP server starts:

| Environment | Role | Scope |
| --- | --- | --- |
| no `REEVES_SESSION_ID` or `REEVES_AGENT_ID` | external operator | Can manage all local runs. The local user account is the security boundary. |
| `REEVES_SESSION_ID=<root-agent-id>` or `REEVES_AGENT_ID=<root-agent-id>` | root agent | Can inspect its run, control workers in its run, spawn workers, stop its run, and resolve worker approvals. |
| `REEVES_SESSION_ID=<worker-agent-id>` or `REEVES_AGENT_ID=<worker-agent-id>` | worker agent | Can inspect itself, read its inbox, update its task status, request approval, and check its own approvals. |

Orchestrator PRE-BETA agents also receive `REEVES_AGENT_ID`, `REEVES_RUN_ID`, `REEVES_ROLE`, and `REEVES_REGISTRY` for compatibility and direct context.

## Tool Groups

Run discovery:

- `context`: return caller identity, current run, agents, approvals, and available control scope. Root and worker callers use their current run automatically.
- `list_runs`: list visible runs.
- `list_agents`: list visible agents, optionally for one run.
- `tree`: return one run tree or all run trees with root and worker agent records. Reeves is not an agent node; use `open_reeves` with the run id to switch back to the TUI.
- `get_run`: return one run with agents and approvals. Root and worker callers may omit `run_id` to use their current run.

Run lifecycle:

- `start_run`: operator only. Create a per-run tmux session with windows for one root and optional workers. With `root_is_caller: true`, creates a headless root record instead of a root tmux window; reconnect with `REEVES_SESSION_ID=<root-agent-id>` to act as that root.
- `spawn_worker`: operator or root. Add one worker window to the run's tmux session. Root callers may omit `run_id`.
- `kill_agent`: operator or root. Kill one worker window. Use `stop_run` for the root.
- `stop_run`: operator or root. Kill this run's tmux session/windows and mark run and agents ended. Root callers may omit `run_id`.
- `wait`: wait until one visible agent is marked ended or a timeout elapses.

Window and pane control:

- `open_reeves`: select the Reeves TUI window for a run. Root and worker callers may omit `run_id`.
- `open_agent`: select a real provider CLI window for one agent.
- `peek`: return recent pane output with ANSI stripped and secrets redacted.
- `send_text`: paste text into an agent pane.
- `send_key`: send one allowed key: `enter`, `escape`, `backspace`, `tab`, `space`, `up`, `down`, `left`, `right`, or `ctrl-c`.
- `interrupt`: send Ctrl-C to one agent pane.

Coordination:

- `update_task`: set `queued`, `working`, `done`, `failed`, or `blocked` plus an optional note.
- `send_message`: write to an agent inbox.
- `check_messages`: consume the caller inbox and heartbeat `last_seen`. Agents should call this once per prompt cycle.
- `get_inbox`: read and clear an agent inbox. Operators can read any local agent, roots can read agents in their run, and workers can read only themselves. `check_messages` remains the normal worker heartbeat path; `get_inbox` is useful for headless roots receiving worker messages.

Approvals:

- `request_approval`: agent callers only. Create a pending approval with action, summary, optional details, and risk.
- `check_approval`: read one approval status. Workers can only read approvals they requested.
- `list_approvals`: operator or root. Workers cannot list approvals.
- `resolve_approval`: operator or root. Approve or deny one pending request.
- `poll_approval`: operator or root. Block until any pending approval appears in the run (1s poll interval), then return it. Returns null on timeout. Designed for headless root flows where the caller needs to wait for a worker to raise a request.

Diagnostics:

- `doctor`: run setup and environment checks. It does not clean state or kill sessions.

## Agent Use Rules

- Use `open_agent` when a real provider CLI window needs human attention.
- Use `open_reeves` to return the user to the run manager window.
- Use `peek` before sending input to another agent so the command is based on current pane output.
- Use `send_text` for pasted text and `send_key` for keys. Do not assume arbitrary key names are accepted.
- Use `request_approval` before risky actions that need root or operator approval.
- Use `update_task` whenever your visible status changes so the TUI can show current work.

## CLI Operator Calls

The CLI `call` command is a thin wrapper over this same MCP tool handler. It is useful for scripts and human operator workflows that do not need the full TUI:

```sh
reevesagents-orchestrator call context
reevesagents-orchestrator call get_run '{"run_id":"<run-id>"}'
printf '%s' '{"agent_id":"<worker-id>","text":"status?"}' | reevesagents-orchestrator call send_message
reevesagents-orchestrator call spawn_worker --caller <root-agent-id> --file worker.json
```

With no `--caller`, the command acts as an external operator unless `REEVES_SESSION_ID` or `REEVES_AGENT_ID` is already set. With `--caller <agent-id>`, it uses that root or worker scope.
