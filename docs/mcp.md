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

- `flow_status { run_id }` returns the state, the round budget, the commit under
  review, the last verdict, the review deadline and the last decision. It is
  read-only: it does not tick the flow and sends nothing to an agent.
- `flow_add_spec { run_id, path }` queues a block spec file as the next piece of
  work. A JSON file is a structured block (id, title, goal, requirements, checks,
  report); a markdown file is queued as an unstructured block whose id comes from
  its heading. A relative path resolves inside the flow's project directory and
  may not leave it; an absolute path is taken as written. Queueing dispatches
  nothing.

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
