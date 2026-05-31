# Testing ReevesAgents

This document covers the stable main package. The current release path is spawner-only.

## Isolation Rules

- Unit tests must use temp `REEVES_REGISTRY` and fake runtime drivers when they touch run state or tmux behavior.
- CLI smokes must run against built `dist/cli.js`.
- Smoke tests must set temp `REEVES_REGISTRY` and `REEVES_CONFIG`.
- Provider CLIs in smoke tests are fake executables. They prove ReevesAgents launches and wires commands correctly without provider credentials.
- Manual TUI checks must set temp `REEVES_REGISTRY` and `REEVES_CONFIG`.

## Test Matrix

| Layer | Command | What it proves | Isolation |
| --- | --- | --- | --- |
| TypeScript | `CI=true pnpm typecheck` | Public types and internal imports compile. | No runtime state. |
| Lint | `CI=true pnpm lint` | Source and unit tests match lint rules. | No runtime state. |
| Unit | `CI=true pnpm test` | State normalization, provider command building, router behavior, spawner TUI flow, and runtime calls. | Temp registry plus fake drivers. |
| Build | `CI=true pnpm build` | The package emits `dist/cli.js` and `dist/index.js`. | No user state. |
| CLI smoke | `pnpm smoke:cli` | Built spawner CLI runs `runs` and `doctor` against fake providers. | Temp registry/config and fake `tmux`/provider bins. |
| Manual TUI smoke | `node dist/cli.js` with temp env | Welcome menu, Runs page, Main Menu return, narrow terminal behavior, and visible action flow. | Temp registry/config. |

## Acceptance Criteria

- When a run starts, provider terminals shall receive no `REEVES_*` environment variables, no provider config override, and no root/worker startup instructions.
- When `pnpm smoke:cli` runs, `doctor --json` shall return a checks array with no fail checks under fake tmux/provider binaries.
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
pnpm smoke:cli
```

Use this to verify the packed package installs in a clean project without touching the real home directory:

```sh
pnpm pack --pack-destination /tmp
tmp=$(mktemp -d)
mkdir -p "$tmp/home" "$tmp/registry"
cd "$tmp"
pnpm init
HOME="$tmp/home" pnpm add /tmp/reevesagents-0.9.0.tgz
./node_modules/.bin/reevesagents --version
REEVES_REGISTRY="$tmp/registry" REEVES_CONFIG="$tmp/config.json" ./node_modules/.bin/reevesagents doctor --json
```

## PRE-BETA Orchestrator Checks

The stable release check is root `pnpm verify`. The Orchestrator package under `packages/orchestrator` is PRE-BETA test code and is not part of the root install. Run its checks only when changing that directory:

```sh
pnpm --dir packages/orchestrator verify
```

## Manual TUI Check

Automated tests cover the state, CLI, and tmux runtime boundaries. The TUI still needs a short manual pass because it is an interactive Ink interface:

1. Run `pnpm build`.
2. Run `REEVES_REGISTRY=$(mktemp -d) REEVES_CONFIG=$(mktemp) node dist/cli.js`.
3. Confirm Welcome opens with the animated `REEVES AGENTS` logo, the blue duck, and the main menu.
4. Select Runs and confirm the Runs page opens with visible actions.
5. Confirm the Runs page uses sectioned Runs and Actions panels without animated art.
6. Use Main Menu and confirm Welcome does not auto-skip after returning from Runs.
7. Confirm New Run opens the spawner wizard directly.
8. Confirm spawner copy says terminals, local tmux, and no injected Reeves context.
9. Confirm Add Terminal, Settings, and Doctor pages render without hidden slash commands.
10. Run once in a narrow terminal, around 52 columns, and confirm the footer and Runs list remain readable.
11. Exit the TUI and remove the temp registry directory.

## Last Verified Locally

The current spawner-only main package cleanup was checked locally on June 1, 2026 with:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm smoke:cli
pnpm pack --dry-run
```

Observed results:

- Frozen install passed with the spawner-only workspace lockfile.
- Typecheck passed.
- Lint passed.
- Vitest passed with 63 files and 474 tests.
- Build passed.
- CLI smoke passed against isolated fake setup.
- Root package dry-run contained only `dist`, README, changelog, license, and package metadata.
- Clean tarball install in a temp project returned version `0.9.0` and `doctor --json` returned `ok: true` with fake `HOME`, `REEVES_REGISTRY`, and `REEVES_CONFIG`.
- PRE-BETA orchestrator check passed separately with 6 files and 73 tests.
