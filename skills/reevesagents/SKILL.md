---
name: reevesagents
description: Drive a team of other AI coding CLIs from the current session through the reevesagents MCP server. Use when the user asks to delegate work to another model, run several agents in parallel, or orchestrate a multi-agent team: spawn Claude Code, Codex, Kimi, Qwen, OpenCode and other installed CLIs each in its own tmux window, send them prompts, read their output, and stop or reap them. Assumes the reevesagents MCP server is attached to this CLI (run: reevesagents attach).
---

# reevesagents: drive a team of AI CLIs

reevesagents lets you, from this session, run and steer other AI coding CLIs. Each
agent is a real CLI in its own tmux window on this machine. reevesagents never
proxies model traffic; every CLI uses its own login.

The tools below come from the reevesagents MCP server. Depending on this host they
may appear as bare names (`spawn`), as `mcp__reevesagents__spawn` (Claude Code,
Kimi), or as `reevesagents_spawn` (OpenCode). Use whichever form your tool list
shows; the bare names are used here.

## When to use
- The user wants to hand a slice of work to another model and keep working.
- Several independent tasks can run in parallel across different CLIs.
- The user asks for a team (a lead plus workers) or to orchestrate multiple agents.

## Drive loop
1. list_providers - the CLIs installed here and their models. Spawn only these.
2. spawn { provider, task } - start an agent; returns agent_id and run_id. Omit
   run_id to keep agents in one run (a team); pass run_id to add to an existing run.
   Set permissions:"skip" for an autonomous worker when no human will approve prompts.
3. read { agent_id } - the agent's recent output. spawn is fire-and-forget: it
   returns ids, not answers, so poll read until the agent replies or its output
   settles. A fresh agent may sit at a login or trust prompt; read first.
4. send_text { agent_id, text } then send_key { agent_id, key: "enter" } - type a
   message, then submit it. send_text alone does NOT submit.
5. kill { agent_id } or stop { run_id } when done.

## Worked example: hand a task to Codex, then steer it
1. list_providers                        confirm "codex" is installed
2. spawn { "provider": "codex", "task": "summarize README.md" }   -> { agent_id, run_id }
3. read { "agent_id": "..." }            poll until it answers
4. send_text { "agent_id": "...", "text": "now write tests for it" }
   send_key  { "agent_id": "...", "key": "enter" }
5. kill { "agent_id": "..." }            stop it when finished

## Spawn a team
Spawn several agents with run_id omitted so they land in one run, then poll each:
   spawn { "provider": "cc",    "task": "lead: coordinate the others", "permissions": "skip" }
   spawn { "provider": "codex", "task": "worker: the API slice",       "permissions": "skip" }
   spawn { "provider": "kimi",  "task": "worker: the docs" }

## Housekeeping
- list shows every live run and agent; list_history shows ended ones.
- reap ends zombie agents: any whose tmux window died, plus any older than
  max_lifetime_ms. reevesagents also reaps in the background, but call reap to force
  an immediate sweep.
- get_config / set_config read and change global settings, including the per-run
  agent cap (max_agents) and the auto-reap age (max_lifetime_ms; 0 disables it).
- request_approval / resolve_approval gate a risky action behind a human or another
  agent before it runs.

## Notes
- send_text types but does not submit; always follow it with send_key enter.
- permissions:"skip" runs a worker autonomously; use it when no human will approve.
- Spawned agents are plain CLIs and cannot spawn others unless reevesagents is also
  attached to them.
- If a spawn is rejected because a run is at the agent cap, raise max_agents with
  set_config.
