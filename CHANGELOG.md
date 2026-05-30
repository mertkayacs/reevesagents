# Changelog

Entries before `0.9.0` describe internal development milestones from the reorganized pre-release history. The first public prerelease is `0.9.0`.

## 0.9.0 - Initial Public Prerelease

### Added
- Public prerelease package metadata, README, release readiness notes, and verification docs.
- Release checks for typecheck, lint, unit tests, build, MCP smoke, CLI smoke, real tmux smoke, and package packing.
- Opt-in real-provider approval smoke for end-to-end approval flows.
- Spawner mode as the default low-permission multi-terminal run path.
- Orchestrator mode labeling for BETA MCP-connected root/worker coordination.

### Changed
- Set the package, CLI, MCP server, README, and Credits page version to `0.9.0`.
- Cleaned up the main TUI pages with sectioned Runs, Run, Terminals/Agents, and Detail layouts.
- Reorganized the changelog around versioned internal milestones.
- Clarified docs and TUI copy so MCP setup and agent coordination are explicit Orchestrator BETA actions, not install-time requirements.

## 0.8.0 - Verification And Release Docs

### Added
- `pnpm verify` for portable local verification.
- MCP stdio smoke and CLI smoke tests with isolated temp state.
- Real tmux and provider smoke scripts for release validation.
- Release readiness, testing, MCP tool, and project handoff docs.

## 0.7.0 - Run Management Polish

### Added
- Persistent Welcome main menu with Current Run, Runs, Doctor, Settings, Approvals, Reference, Credits, and Quit.
- Runs dashboard with automatic cleanup of ended and stale runs.
- Run hub, terminal/agent list, output pages, approvals pages, add-terminal/worker flow, and stop-run confirmation.

### Changed
- Moved each run to its own tmux session while keeping the local registry as the source of truth.
- Renamed visible TUI actions from Open CLI to Open Terminal or Open Agent.

## 0.6.0 - TUI Redesign

### Added
- Ink-based TUI frame, header, rows, sections, status bar, pagination, dialogs, and responsive layout helpers.
- Dark ReevesAgents visual system with provider colors and terminal-friendly wordmark/mascot rendering.
- New Run wizard with mode, preset, basics, first terminal/root, terminals/workers, review, and starting steps.

### Removed
- Legacy slash-command and hidden-help interaction patterns.
- Old multi-pane frame model in favor of visible menu pages.

## 0.5.0 - CLI Operator Surface

### Added
- `reevesagents spawn`, `context`, `runs`, `open`, `peek`, `stop`, `kill`, `orchestrator setup`, `doctor`, `mcp`, and `call`.
- JSON output and MCP-backed `call` support for scripts and human operator workflows.
- Destructive command gates with `--yes` or `ALLOW_DESTRUCTIVE=1`.

## 0.4.0 - MCP Control Plane

### Added
- MCP tools for run discovery, lifecycle, tmux window control, coordination, approvals, and diagnostics.
- Role-aware caller handling for external operators, root agents, workers, and headless roots.
- Approval polling and inbox access for root-driven worker workflows.

## 0.3.0 - Tmux Runtime

### Added
- Runtime support for starting runs, spawning terminals/workers, opening terminal/agent windows, peeking output, sending text/keys, interrupting agents, closing terminals/workers, and stopping runs.
- Provider launch helpers for Claude Code, Codex CLI, OpenCode CLI, and Hermes.
- Startup prompts that give agents their role, run id, agent id, and MCP context.

## 0.2.0 - Local State

### Added
- Local JSON registry under `~/.reeves`.
- Run, agent, approval, inbox, config, and preset state.
- State redaction and isolated registry support for tests and smoke runs.

## 0.1.0 - Project Scaffold

### Added
- TypeScript Node package with pnpm, tsup, Vitest, ESLint, and Ink.
- Initial CLI and programmatic package entry points.
- Apache-2.0 license and repository metadata.
