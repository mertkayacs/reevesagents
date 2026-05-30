# ReevesAgents Agent Brief

Read this first when returning to ReevesAgents after a context break or on a later day. It is the handoff map, not a replacement for the source.

## TL;DR

- ReevesAgents is a local tmux-first workspace manager for AI CLI terminals and agent teams.
- Spawner mode is the default: one run owns one tmux session with multiple independent provider CLI terminals and no ReevesAgents injection.
- Orchestrator mode is BETA: one run owns one tmux session with root/worker agents connected through MCP.
- The local JSON registry is the source of truth. tmux is the execution and viewing surface.
- The TUI, CLI, and MCP all use the same registry and runtime behavior.
- The TUI is the human dashboard. The CLI is a human/script operator surface. MCP is the programmatic control plane.
- The human remains the primary operator. Root agents and workers exist only in Orchestrator BETA and serve that workflow through scoped MCP tools.
- Current product direction is strong inspection and control across many runs, with easier first-time TUI navigation.

## First Checks

Before editing, run:

```sh
git status --short --branch
```

Assume the worktree may already be dirty. Do not revert unrelated changes. If files you need are dirty, read them carefully and work with the current contents.

## Reading Order

Read these in order:

1. `README.md`: product overview, install, quick start, TUI pages, CLI commands, MCP tool list, state layout, and status.
2. `REEVESAGENTS_DESIGN.md`: canonical product and architecture model.
3. `docs/use-cases.md`: core use cases, release-facing surfaces, and refactor rules.
4. `docs/mcp-tools.md`: MCP roles, authorization scope, tool groups, approval flow, and CLI `call` behavior.
5. `docs/testing.md`: current test layers, isolation rules, acceptance criteria, real tmux smoke, and real provider approval smoke.
6. `docs/release-readiness.md`: first public release checklist and open release decisions.
7. `CHANGELOG.md`: recent decisions and behavior changes.
8. `package.json`: package version, executable path, runtime dependencies, and verification scripts.

Then read the code in this order:

1. `src/state/types.ts`
2. `src/state/runs.ts`
3. `src/launcher/providers.ts`
4. `src/launcher/provider-launch.ts`
5. `src/launcher/runtime.ts`
6. `src/mcp.ts`
7. `src/cli.ts`
8. `src/router.tsx`
9. `src/screens/`
10. `src/components/`
11. `scripts/smoke-*.mjs`
12. `test/`

Treat `specs/` as local historical design notes. The directory is git-ignored, so release-facing docs should not depend on it.

## Current Architecture

The important invariant is:

```text
run = one tmux session
spawner terminal = one independent provider CLI window inside that run session
orchestrator agent = one provider CLI window with ReevesAgents context inside that run session
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

The `reeves` window is the TUI anchor for that run. It is not an agent and does not talk to a model.

In Orchestrator BETA, the windows are root/worker agents and can also include a headless root. In that mode, `start_run` writes a root `AgentRecord` but does not create a root tmux window. The calling host CLI becomes the root by using that root agent id as `REEVES_SESSION_ID` or `REEVES_AGENT_ID`.

## Surfaces

TUI:

- Best for first-time human use, visual run inspection, opening terminals/agents, approvals, and stopping runs.
- Starts on persistent Welcome.
- Uses visible menus with arrows, Enter, Esc, and Backspace.
- Uses "Open Agent" for switching into a provider CLI window.

CLI:

- Best for setup, diagnostics, listing, opening, peeking, scripted control, and emergency stop or kill.
- Friendly commands cover common work.
- `reevesagents call <tool>` is the direct operator bridge into the MCP tool handler.

MCP (BETA):

- Full programmatic control plane for external operators, root agents, and worker agents in Orchestrator mode.
- Spawner terminals are not MCP callers and receive no ReevesAgents environment variables.
- Caller role is inferred from `REEVES_SESSION_ID` or `REEVES_AGENT_ID`.
- Operators can manage all local runs.
- Roots can control their own run, spawn workers, drive workers, and resolve approvals.
- Workers can inspect themselves, update status, read inbox, request approvals, and check their own approvals.

## What Is Ready

- Source install and build path.
- TUI run manager with Welcome, Runs, Run hub, Agent detail, New Run, Add Worker, Approvals, Settings, Doctor, Reference, and Credits pages.
- Per-run tmux sessions with independent Spawner terminals or Orchestrator BETA agent windows.
- Local JSON registry under `~/.reeves/runs`.
- Provider launch support for `cc`, `codex`, `opencode`, and `hermes`.
- MCP v1 Orchestrator BETA control plane with 26 tools.
- CLI operator commands, including `context` and `call`.
- Headless root pattern through `root_is_caller: true`.
- Approval records, polling, resolving, and worker approval checks.
- Fake-provider unit and smoke coverage.
- Real tmux smoke coverage.
- Opt-in real provider approval smoke.

## What Is Not Ready

- npm package publication is not available yet.
- Homebrew installation is not available yet.
- Real provider smokes depend on local provider installation, auth, quota, and current provider CLI behavior.
- Browser-style UI automation does not cover the Ink TUI. The TUI still needs a short manual terminal pass.
- `specs/` contains local historical design notes, not release documentation.
- Some internal symbol names still use older labels such as `Agent` or `OpenCLI`; visible Spawner UI copy should say terminal, and visible Orchestrator UI copy should say agent.

## Known Verification State

The current docs record these passing local checks:

```sh
pnpm verify
pnpm smoke:tmux
```

The real provider approval drill has been exercised successfully with Claude Code:

```sh
REEVES_REAL_PROVIDER=cc pnpm smoke:approval-real
```

The Codex real approval drill exposed a provider launch or interactive-session issue in this environment. Treat that as unresolved unless you re-test and update the docs.

## Verification Commands

Normal portable verification:

```sh
pnpm verify
```

Real tmux and provider-command verification:

```sh
pnpm verify:real
```

Opt-in real provider approval drill:

```sh
pnpm smoke:approval-real
REEVES_REAL_PROVIDER=codex pnpm smoke:approval-real
REEVES_REAL_PROVIDER=opencode pnpm smoke:approval-real
REEVES_REAL_PROVIDER=hermes pnpm smoke:approval-real
```

Only run real provider checks when the user explicitly wants to spend provider auth and quota.

## Working Rules For Future Agents

- Read `git status --short --branch` before editing.
- Prefer `rg` and `rg --files` for discovery.
- Do not read or print secrets.
- Do not revert unrelated dirty files.
- Keep edits small and tied to the request.
- Prefer fake-provider tests and isolated registries before real-provider tests.
- Use `REEVES_REGISTRY` and `REEVES_CONFIG` for isolated manual runs.
- Before changing behavior, find the shared path used by TUI, CLI, and MCP.
- If changing MCP behavior, update `README.md`, `docs/mcp-tools.md`, tests, and smokes as needed.
- If changing the TUI wording or navigation, update tests and make sure first-time use remains clear.
