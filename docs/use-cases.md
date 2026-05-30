# Use Cases And Surfaces

This document is the product map for careful refactors. A surface should stay only if it serves one of these use cases clearly.

## Core Use Cases

- First setup: install ReevesAgents, run Doctor, and confirm tmux plus provider CLIs are available without writing provider configs.
- Start a Spawner run: create multiple independent provider CLI terminals in one tmux session for the human to coordinate.
- Start an Orchestrator run (BETA): create one root agent and optional workers from the TUI, CLI/MCP operator flow, or a headless-root host CLI.
- Watch a run: inspect active, ended, and stale runs; see terminals/agents, prompt/task status, recent output, and approvals where relevant.
- Open a real terminal or agent: jump from ReevesAgents to the provider CLI tmux window and type directly.
- Delegate work (BETA): let a root agent spawn workers, send prompts, read output, wait for completion, and stop the run.
- Coordinate safely (BETA): send messages, update task status, request approval, approve or deny risk, and keep the human in control.
- Clean up: close a terminal/worker or stop a run with explicit confirmation.
- Diagnose setup: inspect provider detection, optional Orchestrator MCP registration, state paths, and environment health without touching credentials.

## Human TUI

The TUI is the primary human surface. It should stay visible-menu first and avoid hidden commands.

- Welcome: main entry, current run shortcut, setup/help pages, quit.
- Runs: dashboard for active/stale/ended runs.
- Run hub: run actions, terminal/agent list, output, approvals for Orchestrator, add terminal/worker, stop run.
- Terminal/agent pages: detail, output, prompt/task, open provider CLI, close terminal/worker.
- New Run: mode, preset for Orchestrator, basics, first terminal/root, additional terminals/workers, review, starting.
- Add Terminal/Worker: one-screen setup inside a run.
- Approvals: global and run-scoped Orchestrator BETA approval review.
- Settings and Doctor: setup, registration, state paths, health checks.
- Reference and Credits: in-app map and project metadata.

## CLI

The CLI is for humans and scripts. It should stay compact.

- `reevesagents`: open the TUI.
- `spawn`: start a low-permission multi-terminal Spawner run.
- `context`: show caller role, current run, visible controls.
- `runs`: list runs, with `--json` for scripts.
- `open`: jump to a run's Reeves window or a terminal/agent window.
- `peek`: print recent terminal/agent output.
- `orchestrator setup`: register ReevesAgents in detected provider MCP configs for Orchestrator BETA.
- `doctor`: run setup and environment checks.
- `stop` and `kill`: confirmed cleanup only.
- `mcp`: start the Orchestrator BETA MCP server over stdio.
- `call`: invoke any MCP tool from CLI JSON.

## MCP

MCP is the Orchestrator BETA programmatic control plane for agents and operator clients. Spawner terminals are intentionally not MCP callers.

- Discovery: `context`, `list_runs`, `list_agents`, `tree`, `get_run`.
- Lifecycle: `start_run`, `spawn_worker`, `kill_agent`, `stop_run`, `wait`.
- Window control: `open_reeves`, `open_agent`, `peek`, `send_text`, `send_key`, `interrupt`.
- Coordination: `update_task`, `send_message`, `check_messages`, `get_inbox`.
- Approvals: `request_approval`, `check_approval`, `list_approvals`, `resolve_approval`, `poll_approval`.
- Diagnostics: `doctor`.

## OSS Surface

The package is a CLI/MCP product first. Programmatic exports exist, but should be treated carefully before public release.

- Stable release-facing surfaces: CLI binary, Spawner mode, README, docs, GitHub Releases, npm package, and Homebrew tap.
- BETA release-facing surfaces: Orchestrator mode, MCP tools, MCP setup, and MCP Registry metadata.
- Review before promising as stable API: runtime exports, state exports, config/preset exports, setup exports, and React components.
- Do not promise provider credentials, hosted model traffic, terminal emulation, policy enforcement, background daemon behavior, or cross-machine orchestration.

## Refactor Rule

Before removing a feature, tie it to this map:

- Keep it if it directly serves a core use case.
- Merge it if another surface already serves the same user with less complexity.
- Remove or hide it if it is undocumented, untested, not release-facing, and not needed by CLI, TUI, MCP, or package consumers.
