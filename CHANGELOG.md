# Changelog

Entries before `0.9.0` describe internal development milestones from the reorganized pre-release history. The first public prerelease is `0.9.0`.

## 1.2.0 - Language And Web UX Polish

### Added
- Added TUI and Web language switching with English, German, French, Spanish, Portuguese, Italian, Turkish, Simplified Chinese, and Arabic.
- Added separate Web actions for New Run and New Agent with provider model and permission mode selection.
- Added shared TUI/Web history for archived ended and stale runs.
- Added the animated Web duck mark as the top-left brand asset.
- Added contributor branch policy, issue templates, pull request template, and security policy.

### Changed
- Runs pages now keep active runs separate from history.
- Web beta uses direct click-to-open agent selection without drag-and-drop behavior.
- TUI pages are more responsive in narrow terminals and keep loaded pages scrollable with arrow keys.
- Visible UI copy now uses agent wording for user-facing run controls.

## 1.0.11 - Web UI Workbench Polish

### Changed
- Refined the Web beta into a compact agent workbench with richer agent cards, improved stage framing, and better responsive behavior.
- Set the root package, CLI smoke expectations, README, and release docs to `1.0.11`.

## 0.9.0 - Initial Public Prerelease

### Added
- Public prerelease package metadata, README, release readiness notes, and verification docs.
- Release checks for typecheck, lint, unit tests, build, CLI smoke, and package packing.
- Spawner mode as the default low-permission multi-agent run path.
- PRE-BETA orchestrator test package kept outside the default install path.
- Install surface policy for npm, pnpm, one-off runners, GitHub release tarballs, Homebrew, and source.

### Changed
- Set the package, CLI, README, and Credits page version to `0.9.0`.
- Cleaned up the main TUI pages with sectioned Runs, Run, Agents, and Detail layouts.
- Reorganized the changelog around versioned internal milestones.
- Clarified docs and TUI copy so the main app is spawner-first and orchestration is PRE-BETA test code.

## 0.8.0 - Verification And Release Docs

### Added
- `pnpm verify` for portable local verification.
- CLI smoke tests with isolated temp state.
- Real tmux and provider smoke scripts for release validation.
- Release readiness, testing, and project handoff docs.

## 0.7.0 - Run Management Polish

### Added
- Persistent Welcome main menu with Current Run, Runs, Doctor, Settings, Reference, Credits, and Quit.
- Runs dashboard with automatic cleanup of ended and stale runs.
- Run hub, agent list, output pages, add-agent flow, and stop-run confirmation.

### Changed
- Moved each run to its own tmux session while keeping the local registry as the source of truth.
- Renamed visible TUI actions from Open CLI to Open Agent.

## 0.6.0 - TUI Redesign

### Added
- Ink-based TUI frame, header, rows, sections, status bar, pagination, dialogs, and responsive layout helpers.
- Dark ReevesAgents visual system with provider colors and terminal-friendly wordmark/mascot rendering.
- New Run wizard with basics, first agent, additional agents, review, and starting steps.

### Removed
- Legacy slash-command and hidden-help interaction patterns.
- Old multi-pane frame model in favor of visible menu pages.

## 0.5.0 - CLI Operator Surface

### Added
- `reevesagents spawn`, `runs`, `open`, `peek`, `stop`, `kill`, and `doctor`.
- JSON output support for scripts and human operator workflows.
- Destructive command gates with `--yes` or `ALLOW_DESTRUCTIVE=1`.

## 0.4.0 - Run Inspection Prototype

### Added
- Prototype commands for run discovery, lifecycle, tmux window control, and diagnostics.
- Early status tracking for agent windows.
- Pane output peeking for local inspection.

## 0.3.0 - Tmux Runtime

### Added
- Runtime support for starting runs, spawning agents, opening agent windows, peeking output, closing agents, and stopping runs.
- Provider launch helpers for Claude Code, Codex CLI, OpenCode CLI, and Hermes.
- Optional startup prompt paste for newly opened provider agents.

## 0.2.0 - Local State

### Added
- Local JSON registry under `~/.reeves`.
- Run, agent, inbox, config, and preset state.
- State redaction and isolated registry support for tests and smoke runs.

## 0.1.0 - Project Scaffold

### Added
- TypeScript Node package with pnpm, tsup, Vitest, ESLint, and Ink.
- Initial CLI and programmatic package entry points.
- Apache-2.0 license and repository metadata.
