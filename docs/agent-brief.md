# ReevesAgents Agent Brief

Read this first when returning to ReevesAgents after a context break or on a later day. It is the handoff map, not a replacement for the source.

## TL;DR

- ReevesAgents is a local tmux-first workspace manager for AI CLI terminals.
- The main package uses agent runs: one run owns one tmux session with multiple independent provider CLI agents.
- The main install is passive: no provider config writes, no background service, and no ReevesAgents context injected into provider CLIs.
- The local JSON registry is the source of truth. tmux is the execution and viewing surface.
- The TUI is the human dashboard. The CLI is a compact human/script operator surface.
- Non-root experimental packages must not leak into the root install, TUI, CLI, or stable package docs.

## First Checks

Before editing, run:

```sh
git status --short --branch
```

Assume the worktree may already be dirty. Do not revert unrelated changes. If files you need are dirty, read them carefully and work with the current contents.

## Reading Order

Read these in order:

1. `README.md`: product overview, install, quick start, TUI pages, CLI commands, state layout, and status.
2. `REEVESAGENTS_DESIGN.md`: canonical main-package product and architecture model.
3. `docs/use-cases.md`: core use cases, release-facing surfaces, and refactor rules.
4. `docs/testing.md`: current test layers, isolation rules, acceptance criteria, and manual TUI smoke.
5. `docs/release-readiness.md`: first public release checklist and open release decisions.
6. `CHANGELOG.md`: recent decisions and behavior changes.
7. `package.json`: package version, executable path, runtime dependencies, and verification scripts.

Then read the code in this order:

1. `src/state/types.ts`
2. `src/state/runs.ts`
3. `src/launcher/providers.ts`
4. `src/launcher/provider-launch.ts`
5. `src/launcher/runtime.ts`
6. `src/cli.ts`
7. `src/router.tsx`
8. `src/screens/`
9. `src/components/`
10. `scripts/smoke-cli.mjs`
11. `test/`

Only read or edit non-root packages when the task explicitly asks for them.

## Current Architecture

The important invariant is:

```text
run = one tmux session
terminal = one independent provider CLI window inside that run session
registry = source of truth
tmux = execution and viewing surface
```

Typical run layout:

```text
tmux session: reeves_<run-name>_<id>
  window 0: reeves when tmux linking succeeds
  window 1: <provider-or-nickname>
  window 2: <provider-or-nickname>
  window 3: <provider-or-nickname>
```

The `reeves` window is the TUI anchor for that run. It is not a provider terminal and does not talk to a model.

## Surfaces

TUI:

- Best for first-time human use, visual run inspection, opening agents, and stopping runs.
- Starts on persistent Welcome.
- Uses visible menus with arrows, Enter, Esc, and Backspace.
- Uses Open Agent for switching into a provider CLI window.

CLI:

- Best for diagnostics, listing, opening, peeking, scripted spawner control, and emergency stop or kill.
- Friendly commands cover common work.
- Destructive commands require `--yes` or `ALLOW_DESTRUCTIVE=1`.

## What Is Ready

- Source install and build path.
- TUI run manager with Welcome, Runs, Run hub, Agent detail, New Run, Add Agent, Settings, Doctor, Reference, and Credits pages.
- Per-run tmux sessions with independent provider terminals.
- Local JSON registry under `~/.reeves/runs`.
- Provider launch support for Claude Code, Codex CLI, OpenCode CLI, Hermes, Kimi Code, DeepSeek CLI, Pi, Qwen Code, and Aider.
- Agent-run CLI operator commands.
- Fake-provider unit and smoke coverage.

## What Is Not Ready

- npm package publication is not available yet.
- Homebrew installation is not available yet.
- All future stable install paths must install the root spawner package only: npm, pnpm, one-off runners, GitHub Release tarballs, Homebrew, and source.
- Real provider checks depend on local provider installation, auth, quota, and current provider CLI behavior.
- Browser-style UI automation does not cover the Ink TUI. The TUI still needs a short manual terminal pass.
- `specs/` contains local historical design notes, not release documentation.
- Non-root packages are not part of the stable install.
- Some internal symbols still reflect older schemas, but visible main-package UI copy should say agent.

## Verification Commands

Normal portable verification:

```sh
pnpm verify
```

## Working Rules For Future Agents

- Read `git status --short --branch` before editing.
- Prefer `rg` and `rg --files` for discovery.
- Do not read or print secrets.
- Do not revert unrelated dirty files.
- Keep edits small and tied to the request.
- Prefer fake-provider tests and isolated registries before real-provider tests.
- Use `REEVES_REGISTRY` and `REEVES_CONFIG` for isolated manual runs.
- Before changing behavior, find the shared path used by TUI and CLI.
- If changing the TUI wording or navigation, update tests and make sure first-time use remains clear.
