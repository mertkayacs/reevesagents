# Use Cases And Surfaces

This document is the product map for careful refactors. A surface should stay only if it serves one of these use cases clearly.

## Core Use Cases

- First setup: install ReevesAgents, run Doctor, register MCP configs, and confirm provider CLIs are available.
- Start a run: create one root agent and optional workers from the TUI, CLI/MCP operator flow, or a headless-root host CLI.
- Watch a run: inspect active, ended, and stale runs; see agents, task status, recent output, and approvals.
- Open a real agent: jump from ReevesAgents to the provider CLI tmux window and type directly.
- Delegate work: let a root agent spawn workers, send prompts, read output, wait for completion, and stop the run.
- Coordinate safely: send messages, update task status, request approval, approve or deny risk, and keep the human in control.
- Clean up: close a worker or stop a run with explicit confirmation.
- Diagnose setup: inspect provider detection, MCP registration, state paths, and environment health without touching credentials.

## Human TUI

The TUI is the primary human surface. It should stay visible-menu first and avoid hidden commands.

- Welcome: main entry, current run shortcut, setup/help pages, quit.
- Runs: dashboard for active/stale/ended runs.
- Run hub: run actions, agent list, output, approvals, add worker, stop run.
- Agent pages: detail, output, task, open provider CLI, close worker.
- New Run: preset, basics, root, workers, review, starting.
- Add Worker: one-screen worker setup inside a run.
- Approvals: global and run-scoped approval review.
- Settings and Doctor: setup, registration, state paths, health checks.
- Reference and Credits: in-app map and project metadata.

## CLI

The CLI is for humans and scripts. It should stay compact.

- `reevesagents`: open the TUI.
- `context`: show caller role, current run, visible controls.
- `runs`: list runs, with `--json` for scripts.
- `open`: jump to a run's Reeves window or an agent window.
- `peek`: print recent agent output.
- `setup`: register ReevesAgents in detected provider MCP configs.
- `doctor`: run setup and environment checks.
- `stop` and `kill`: confirmed cleanup only.
- `mcp`: start the MCP server over stdio.
- `call`: invoke any MCP tool from CLI JSON.

## MCP

MCP is the full programmatic control plane for agents and operator clients.

- Discovery: `context`, `list_runs`, `list_agents`, `tree`, `get_run`.
- Lifecycle: `start_run`, `spawn_worker`, `kill_agent`, `stop_run`, `wait`.
- Window control: `open_reeves`, `open_agent`, `peek`, `send_text`, `send_key`, `interrupt`.
- Coordination: `update_task`, `send_message`, `check_messages`, `get_inbox`.
- Approvals: `request_approval`, `check_approval`, `list_approvals`, `resolve_approval`, `poll_approval`.
- Diagnostics: `doctor`.

## OSS Surface

The package is a CLI/MCP product first. Programmatic exports exist, but should be treated carefully before public release.

- Stable release-facing surfaces: CLI binary, MCP tools, README, docs, GitHub Releases, npm package, Homebrew tap, MCP Registry metadata.
- Review before promising as stable API: runtime exports, state exports, config/preset exports, setup exports, and React components.
- Do not promise provider credentials, hosted model traffic, terminal emulation, policy enforcement, background daemon behavior, or cross-machine orchestration.

## Refactor Rule

Before removing a feature, tie it to this map:

- Keep it if it directly serves a core use case.
- Merge it if another surface already serves the same user with less complexity.
- Remove or hide it if it is undocumented, untested, not release-facing, and not needed by CLI, TUI, MCP, or package consumers.
