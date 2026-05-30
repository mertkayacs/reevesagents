# Testing ReevesAgents

This project has four test layers plus a short manual TUI pass. Each layer has a different job and a different isolation boundary.

## Isolation Rules

- Unit tests must use temp `REEVES_REGISTRY` and fake runtime drivers when they touch run state or tmux behavior.
- CLI and MCP smokes must run against built `dist/cli.js`, not TypeScript source.
- Smoke tests must set temp `REEVES_REGISTRY` and `REEVES_CONFIG`.
- Setup tests must set temp `REEVES_SETUP_HOME` so real provider MCP config files are not modified.
- Provider CLIs in smoke tests are fake executables. They prove ReevesAgents launches and wires commands correctly without provider credentials.
- The real tmux smoke uses a private tmux socket and kills only that socket/session during cleanup.
- The real approval smoke is opt-in because it launches real provider CLIs and can consume provider quota.
- Manual TUI checks must set temp `REEVES_REGISTRY` and `REEVES_CONFIG`.

## Test Matrix

| Layer | Command | What it proves | Isolation |
| --- | --- | --- | --- |
| TypeScript | `CI=true pnpm typecheck` | Public types and internal imports compile. | No runtime state. |
| Lint | `CI=true pnpm lint` | Source and unit tests match lint rules. | No runtime state. |
| Unit | `CI=true pnpm test` | State normalization, provider command building, MCP authorization, setup writers, router behavior, and runtime calls. | Temp registry plus fake drivers. |
| Build | `CI=true pnpm build` | The package emits `dist/cli.js` and `dist/index.js`. | No user state. |
| MCP stdio smoke | `pnpm smoke:mcp` | Built MCP server starts over stdio, exposes the v1 tool set, and reads empty isolated state. | Temp registry/config, no tmux windows. |
| CLI smoke | `pnpm smoke:cli` | Built CLI runs `context`, `runs`, `call`, `setup`, and `doctor` against fake providers and temp setup home. | Temp registry/config/home and fake `tmux`/provider bins. |
| Real tmux smoke | `pnpm smoke:tmux` | Built MCP starts a real run, creates real tmux windows, peeks panes, sends input, opens windows, spawns/kills workers, handles messages and approvals, and stops the run. | Temp registry/config/home, private tmux socket, fake provider bins. |
| Real provider approval smoke | `pnpm smoke:approval-real` | A real provider worker requests approval through MCP, receives approval, writes a marker file, marks itself done, and the run cleans up. | Temp registry/config/home, private tmux socket, real provider CLI/auth/quota. |
| Manual TUI smoke | `node dist/cli.js` with temp env | Welcome menu, sectioned Runs page, Main Menu return, narrow terminal behavior, and visible action flow. | Temp registry/config. |

## Acceptance Criteria

- When `pnpm smoke:mcp` runs, ReevesAgents shall expose exactly the v1 MCP tool names documented in the README.
- When `pnpm smoke:cli` runs, `context --json` shall return operator scope with isolated runs.
- When `pnpm smoke:cli` runs, `call context` and `call list_runs` shall reach MCP tools through the CLI against isolated state.
- When `pnpm smoke:cli` runs, ReevesAgents shall register MCP config only under temp `REEVES_SETUP_HOME`.
- When `pnpm smoke:cli` runs, `doctor --json` shall return a checks array with no fail checks under fake tmux/provider binaries.
- When `pnpm smoke:tmux` runs, ReevesAgents shall keep the `reeves` TUI window in the Reeves session and create a separate run tmux session with root and worker windows.
- When `pnpm smoke:tmux` sends text and Enter to a worker, the worker pane shall receive that input.
- When `pnpm smoke:tmux` opens an agent and then Reeves, the selected tmux window shall change to the expected window.
- When `pnpm smoke:tmux` requests approval as a worker, an operator caller shall be able to list and resolve it.
- When `pnpm smoke:tmux` stops the run, the run tmux session shall be gone and the run state shall be marked ended.
- When `pnpm smoke:approval-real` runs with an installed supported provider, the real worker shall request approval, observe approval, write the expected marker file, and mark its task done.
- When the TUI starts, ReevesAgents shall show Welcome first.
- When Enter is pressed on a selected Welcome menu item, ReevesAgents shall open that selected page.
- When no key is pressed on startup Welcome, ReevesAgents shall stay on the main menu.
- When launched with run context, Welcome shall include a Current Run menu item.
- When the TUI opens or refreshes Runs, ended and stale runs are auto-removed from the visible list.
- When the Runs page is open, the logo shall be static to reduce redraw flicker.

## Normal Verification

Use this for source checks and portable smokes:

```sh
pnpm verify
```

This expands to:

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm smoke:mcp
pnpm smoke:cli
```

Use this when tmux is installed and real process checks are required:

```sh
pnpm verify:real
```

`verify:real` runs `verify` first, then `pnpm smoke:tmux` and `pnpm smoke:providers-real`.

Run this opt-in integration check only when real provider auth/quota can be used:

```sh
pnpm smoke:approval-real
REEVES_REAL_PROVIDER=codex pnpm smoke:approval-real
```

By default it tries Claude Code (`cc`) when installed. Set `REEVES_REAL_PROVIDER=codex`, `REEVES_REAL_PROVIDER=opencode`, or `REEVES_REAL_PROVIDER=hermes` to try another provider with its current launch/MCP behavior.

## Manual TUI Check

Automated tests cover the state, MCP, CLI, and tmux runtime boundaries. The TUI still needs a short manual pass because it is an interactive Ink interface:

1. Run `pnpm build`.
2. Run `REEVES_REGISTRY=$(mktemp -d) REEVES_CONFIG=$(mktemp) node dist/cli.js`.
3. Confirm Welcome opens with the animated `REEVES AGENTS` logo, the blue duck, and the main menu.
4. Select Runs and confirm the Runs page opens with visible actions.
5. Confirm the Runs page uses sectioned Runs and Actions panels without animated art.
6. Use Main Menu and confirm Welcome does not auto-skip after returning from Runs.
7. Confirm New Run, Add Worker, Approvals, Settings, and Doctor pages render without hidden slash commands.
8. Run once in a narrow terminal, around 52 columns, and confirm the footer and Runs list remain readable.
9. Exit the TUI and remove the temp registry directory.

## Last Verified Locally

The current v1 UI/runtime changes were last checked with:

```sh
CI=true pnpm typecheck
CI=true pnpm lint
CI=true pnpm test
CI=true pnpm build
pnpm smoke:mcp
pnpm smoke:cli
pnpm smoke:tmux
```

Observed results:

- Typecheck passed.
- Lint passed.
- Vitest passed with 483 tests.
- Build passed.
- MCP smoke passed with 26 tools.
- CLI smoke passed with isolated setup, `context`, MCP-backed `call`, and doctor checks.
- Real tmux smoke passed with isolated fake providers and a private tmux socket.
