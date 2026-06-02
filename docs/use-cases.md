# Use Cases And Surfaces

This document is the product map for careful refactors. A surface should stay only if it serves one of these use cases clearly.

## Core Use Cases

- First setup: install ReevesAgents, run Doctor, and confirm tmux plus provider CLIs are available without writing provider configs.
- Start a run: create multiple independent provider CLI agents in one tmux session for the human to coordinate.
- Watch a run: inspect active runs and shared history; see agents, prompt status, and recent output.
- Open an agent: jump from ReevesAgents to the provider CLI tmux window and type directly.
- Add an agent: extend an existing run with another independent provider CLI window.
- Clean up: close an agent or stop a run with explicit confirmation.
- Diagnose setup: inspect provider detection, state paths, and environment health without touching credentials.

## Human TUI

The TUI is the primary human surface. It should stay visible-menu first and avoid hidden commands.

- Welcome: main entry, current run shortcut, setup/help pages, quit.
- Runs: dashboard for active runs and shared history.
- Run hub: run actions, agent list, output, add agent, stop run.
- Agent pages: detail, output, prompt, open provider CLI, close agent.
- New Run: basics, first agent, additional agents, review, starting.
- Add Agent: one-screen setup inside a run.
- Settings and Doctor: provider detection, state paths, health checks.
- Reference and Credits: in-app map and project metadata.

## CLI

The CLI is for humans and scripts. It should stay compact.

- `reevesagents`: open the TUI.
- `spawn`: start a low-permission multi-agent run.
- `runs`: list runs, with `--json` for scripts.
- `open`: jump to a run's Reeves window or an agent window.
- `peek`: print recent agent output.
- `doctor`: run setup and environment checks.
- `stop` and `kill`: confirmed cleanup only.

## Package Surface

The main package is a TUI and CLI product first. Programmatic exports exist for local integration, but they are not the primary public API.

- Stable release-facing surfaces: CLI binary, TUI, README, docs, GitHub Releases, npm package, and Homebrew tap.
- Review before promising as stable API: runtime exports, state exports, config/preset exports, and React components.
- Do not promise provider credentials, hosted model traffic, terminal emulation, policy enforcement, background daemon behavior, provider config mutation, or cross-machine coordination.

## Refactor Rule

Before removing a feature, tie it to this map:

- Keep it if it directly serves a core use case.
- Merge it if another surface already serves the same user with less complexity.
- Remove or hide it if it is undocumented, untested, not release-facing, and not needed by the TUI, CLI, or package consumers.
