# Agent Control MCP

[Docs](README.md) / Agent Control MCP

The Agent Control MCP lets one AI CLI spawn and drive other local AI CLIs through
ReevesAgents. It is off by default. Attach it to a host CLI only when you want
that CLI to get ReevesAgents tools.

## Enable It

```sh
reevesagents attach claude
reevesagents hosts
```

Restart the attached CLI after `attach`; MCP tools load when the host CLI starts.
Run `reevesagents attach` without a CLI name to attach every installed host that
ReevesAgents can configure.

To disconnect one host:

```sh
reevesagents detach claude
```

The TUI and Web UI expose the same attach, detach, and status actions from the
Agent control screen.

## How Runs Work

When a host CLI uses the MCP to spawn agents, ReevesAgents records one run:

- the host CLI appears as the run head when ReevesAgents can identify it
- spawned agents follow as workers
- windowed agents run in tmux windows
- an external host CLI can be recorded as a headless head, since ReevesAgents
  does not own its terminal

Workers do not receive MCP tools automatically. Attach ReevesAgents to a worker's
own CLI only if you explicitly want that worker to spawn more agents.

## Tools

- `list_providers`: list installed provider CLIs, aliases, model ids, and launch
  capabilities.
- `spawn`: start an agent, either in a new run or an existing run.
- `read`: read recent output from one agent.
- `send_text`: paste text into an agent. It does not submit.
- `send_key`: send one key. Use `enter` after `send_text` to submit.
- `interrupt`: send Ctrl-C.
- `kill`: stop one agent.
- `stop`: stop a run.
- `list`: list live runs and agents.
- `open`: switch tmux to a run or agent window when possible.
- `doctor`: run the environment health checks.
- `reap`: end zombie agents whose tmux window is gone or whose lifetime cap is
  exceeded.
- `list_history`: list archived run history.
- `delete`: delete an ended agent record.
- `delete_run`: delete an ended run record and archive it.
- `delete_history`: delete one archived history record.
- `request_approval`: create an approval request for a proposed action.
- `resolve_approval`: approve or deny a request.
- `check_approval`: read one approval request.
- `list_approvals`: list approval requests.
- `get_config`: read global ReevesAgents settings.
- `set_config`: update global ReevesAgents settings.
- `list_presets`: list saved run presets.
- `save_preset`: save a live run as a preset.
- `start_preset`: launch a saved preset.
- `delete_preset`: delete a saved preset.
- `list_hosts`: list host CLIs that can load the MCP.
- `attach_host`: attach ReevesAgents to a host CLI.
- `detach_host`: detach ReevesAgents from a host CLI.
- `install_skills`: install the ReevesAgents skill for skill-aware CLIs.
- `flow_status`: read the dev -> review -> fix pipeline attached to one run.
- `flow_add_spec`: queue a block spec file on that pipeline.

The provider catalog is also available as the `reevesagents://providers` MCP
resource. The guide is available as `reevesagents://guide`.

## Flows

A flow attaches the dev -> review -> fix pipeline to one run: the dev commits, a
reviewer answers with a verdict, the engine sends the findings back or queues the
next block.

### `flow_status { run_id }`

Returns the flow attached to a run. `run_id` is the run's id, or a unique prefix
of it; an unknown id comes back as an error that lists the flows that do exist.
Read-only: it does not tick the flow and sends nothing to an agent.

What the fields mean when you are deciding whether to wait or to act:

- `state`: `idle` (waiting for the dev's next commit), `reviewing` (a review was
  requested), `fixing` (a fix round was handed to the dev), `escalated` (the round
  budget is spent — a human has to decide), `done` (accepted, nothing queued).
- `rounds` / `max_rounds`: the fix budget, cumulative for the whole flow and not
  reset by a new commit.
- `claim.head`: the commit the current review or fix is about. A verdict always
  belongs to this commit; a newer HEAD means the flow will re-request a review
  instead of applying an older answer.
- `claim.verdict` / `claim.verdict_count`: the last verdict read and how many
  verdicts the reviewer's pane held when the claim was taken. A verdict counts as
  new only when that counter goes up, which is why re-reading the same ACCEPT is
  not a second green light.
- `review_started_at` + `review_timeout_sec`: when the outstanding review was
  asked for and how long it may stay unanswered. A tick past the deadline
  escalates; the badge in the TUI and the Web UI shows the same condition.
- `queue`: blocks queued and not yet dispatched, with their source file.
- `last_decision` / `log`: the most recent events, which is where
  `dispatch_unconfirmed` shows up when a paste landed but the submit was not
  confirmed.

### `flow_add_spec { run_id, path }`

Queues a block spec file as the next piece of work; it does not dispatch it. A
JSON file is a structured block (id, title, goal, requirements, checks, report); a
markdown file is queued as an unstructured block with the heading as its id and
title. The path must be an existing readable file: a relative path resolves inside
the flow's project directory and may not leave it, an absolute path is taken as
written. Refused without touching the flow file: a missing or empty file, a spec
without requirements or checks, a block id already queued or dispatched, and a
closed flow (`escalated` or `done`).

Paths and log text in both tools come back home-shortened and redacted: a tool
answer is a transcript, so a spec title carrying a token is reported as
`[REDACTED]` while the flow file keeps the author's text.

The MCP never runs the pipeline by itself: no tool here starts a loop or a timer,
and a flow step happens when the TUI or Web UI ticks it or when someone runs
`reevesagents flow tick`. Every call is explicit, which keeps this server flat —
it gives a host control, not an autonomous process.

## Safety Model

The MCP is a direct local control surface. It can start CLIs, type into them, and
stop them, so attach it only to CLIs you trust to drive local tools.

ReevesAgents keeps the safety boundary simple:

- MCP attach is explicit and per host CLI.
- Provider credentials stay inside provider CLIs.
- ReevesAgents does not proxy model traffic.
- Spawned workers do not get MCP tools by default.
- `max_agents` caps how many agents a run can hold.
- `max_lifetime_ms` can cap agent lifetime; `0` disables that cap.
- `stop`, `kill`, and delete tools act only on ReevesAgents run records and tmux
  targets tracked in local state.

For the main user flow, see [Agent control](https://reevesagents.mertkayacs.com/docs/#agent-control) in the online user guide.
