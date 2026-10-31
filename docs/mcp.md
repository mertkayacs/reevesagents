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
- `flow_start`: attach a dev -> review -> fix flow to an existing run.
- `flow_status`: read the dev -> review -> fix pipeline attached to one run.
- `flow_add_spec`: queue a block spec file on that pipeline.
- `flow_step`: run one engine step (the `flow tick` equivalent) — the only flow tool that can send.
- `flow_control`: pause, resume, stop or queue a block, with an explicit `action`.

The provider catalog is also available as the `reevesagents://providers` MCP
resource. The guide is available as `reevesagents://guide`.

## Flows

A flow attaches the dev -> review -> fix pipeline to one run: the dev commits, a
reviewer answers with a verdict, the engine sends the findings back or queues the
next block.

### `flow_start { run_id, dev, review, repo?, max_rounds?, review_timeout_sec?, replace? }`

Attaches a pipeline to a run that already exists. This is the only way to create a
flow: `flow_status` and `flow_add_spec` both need a flow file, and neither of them
creates one.

- `dev` / `review`: agent ids or nicknames *inside that run*. An agent of another run
  is refused, because the engine would otherwise paste into a pane nobody meant to
  drive. A unique prefix is accepted; both must differ.
- `repo`: the directory the flow watches, defaults to the run's working directory. It
  must be a git repository with a commit, since every verdict is bound to a HEAD.
- The flow starts from the current HEAD and waits for the *next* commit, so creating
  one does not review the work that is already there.
- One flow per run: an active flow is refused, and `replace: true` restarts only a
  closed one (`escalated` or `done`).
- Writes one file and sends nothing. Nothing in this server ticks a flow.

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
- `pending`: the dispatch a tick has claimed but not settled yet (`kind`, `target`,
  `at`), or `null`. A flow sitting on a claim is waiting for that paste to finish, not
  stuck: the next tick after it settles moves the state, and one that never settles is
  escalated to a human.
- `last_decision` / `log`: the most recent events, which is where
  `dispatch_unconfirmed` shows up when a paste landed but the submit was not
  confirmed.

### `flow_add_spec { run_id, path }`

Queues a block spec file as the next piece of work; it does not dispatch it. A
JSON file is a structured block (id, title, goal, requirements, checks, report); a
markdown file is queued as an unstructured block with the heading as its id and
title. The path must be an existing readable file: a relative path resolves inside
the flow's project directory and may not leave it — the check runs on the
resolved path, so a symlink that lands outside is refused too — while an
absolute path is taken as written. Refused without touching the flow file: a
missing or empty file, a spec without requirements or checks, a block id already
queued or dispatched, and a closed flow (`escalated` or `done`).

### `flow_step { run_id, dry_run? }`

One engine step: observe, decide, claim, send and settle — the same code path as
`reevesagents flow tick`, and the only flow tool that can type into a pane. It sends
at most one prompt, and only into a pane that is positively idle; the rules (round
budget, review deadline, escalation, pane guard) stay in the engine, so no surface can
talk its way past them.

The answer tells a polling host whether anything happened:

- `changed: false` with `reason` for a hold — `head_unchanged`, `dev_pane_unknown`,
  `dispatch_pending`, `flow_paused`, `flow_closed`, … Polling it is cheap and writes
  nothing.
- `changed: true` when the step moved the flow; `flow` is the same payload
  `flow_status` returns.
- `send: { sent, reason }` names the paste outcome: `sent: false` with `pane_changed`
  or `unconfirmed` is the one case a human should look at.

Two concurrent calls cannot paste twice. The first writes a `pending` claim into the
flow before the paste; the second reads that claim, answers
`{changed: false, reason: "dispatch_pending"}` and sends nothing. The same claim is
what makes an MCP step, a cron `flow tick` and a manual tick mutually exclusive.

### `flow_control { run_id, action, file?, markdown?, confirm? }`

One tool, four explicit actions — no implicit anything:

- `pause` parks the flow. A paused flow is never ticked: no git call, no pane capture,
  no send. It also drops an unsettled dispatch claim, so a later resume cannot inherit
  a stuck send.
- `resume` returns the flow to the state it was paused *from* (a paused `fixing` flow
  resumes into `fixing`). On an `escalated` flow it grants a fresh round budget and
  logs that it did.
- `stop` closes the flow for good and requires `confirm: true`; without it the answer
  is an error, never `ok: true`. The file is kept so `flow status`/`flow logs` still
  explain what happened, and nothing is sent afterwards.
- `add_spec` queues one block file per call: `file` for a structured JSON spec
  (`requirements`/`checks` are mandatory), `markdown` for an explicit unstructured
  ingest with the same containment rules as `flow_add_spec`.

Every accepted action answers with the `flow_status` payload; a refused one answers the
reason (`cannot resume a flow in state done (…)`, `stop closes the flow for good; pass
confirm: true`, …).

Paths and log text in every flow tool come back home-shortened and redacted: a tool
answer is a transcript, so a spec title carrying a token is reported as
`[REDACTED]` while the flow file keeps the author's text.

The MCP never runs the pipeline by itself: no tool here starts a loop or a timer. A
step happens only when the host calls `flow_step`, or when someone runs
`reevesagents flow tick` on a schedule; the TUI and the Web UI render the badge and
tick nothing. Every call is explicit, which keeps this server flat — it gives a host
control, not an autonomous process.

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
