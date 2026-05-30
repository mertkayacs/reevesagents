# Changelog

Entries before `0.9.0` describe internal development milestones from the reorganized pre-release history. The first public prerelease is `0.9.0`.

## 0.7.0 - Run Management Polish

### Added
- Persistent Welcome main menu and Runs dashboard.
- Run hub, agent list, output pages, approvals pages, add-worker flow, and stop-run confirmation.
- Per-run tmux sessions with the local registry as source of truth.

## 0.6.0 - TUI Redesign

### Added
- Ink-based TUI frame, header, rows, sections, dialogs, and responsive layout helpers.
- Dark ReevesAgents visual system with provider colors and terminal-friendly wordmark/mascot rendering.
- New Run wizard with preset, basics, root, workers, review, and starting steps.

## 0.5.0 - CLI Operator Surface

### Added
- Operator commands for context, runs, open, peek, stop, kill, setup, doctor, mcp, and call.
- JSON output and MCP-backed call support for scripts.
- Destructive command gates with --yes or ALLOW_DESTRUCTIVE=1.

## 0.4.0 - MCP Control Plane

### Added
- MCP tools for lifecycle, tmux control, coordination, approvals, and diagnostics.
- Role-aware caller handling for operators, roots, workers, and headless roots.
- Approval polling and inbox access for root-driven worker workflows.

## 0.3.0 - Tmux Runtime

### Added
- Runtime support for run and worker lifecycle operations.
- Provider launch helpers for Claude Code, Codex CLI, OpenCode CLI, and Hermes.
- Startup prompts for role, run id, agent id, and MCP context.

## 0.2.0 - Local State

### Added
- Local JSON registry under ~/.reeves.
- Run, agent, approval, inbox, config, and preset state.
- State redaction and isolated registry support.

## 0.1.0 - Project Scaffold

### Added
- TypeScript Node package with pnpm, tsup, Vitest, ESLint, and Ink.
- Initial CLI and programmatic package entry points.
- Apache-2.0 license and repository metadata.
