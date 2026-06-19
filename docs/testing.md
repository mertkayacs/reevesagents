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
| CLI smoke | `pnpm smoke:cli` | Built CLI runs `runs` and `doctor` against fake providers. | Temp registry/config and fake `tmux`/provider bins. |
| Package contents | `pnpm check:package` | Root npm tarball contains only the spawner package surface. | `npm pack --dry-run`, no install. |
| Install matrix | `pnpm check:install-matrix` | CLI/TUI-only install and Web install work from tarballs. | Temp npm projects, temp registry/config. |
| Manual TUI smoke | `node dist/cli.js` with temp env | Welcome menu, Runs page, Main Menu return, narrow terminal behavior, and visible action flow. | Temp registry/config. |

## Acceptance Criteria

- When a run starts, provider terminals shall receive no `REEVES_*` environment variables, no provider config override, and no root/worker startup instructions.
- When `pnpm smoke:cli` runs, `doctor --json` shall return a checks array with no fail checks under fake tmux/provider binaries.
- When the TUI starts, ReevesAgents shall show Welcome first.
- When Enter is pressed on a selected Welcome menu item, ReevesAgents shall open that selected page.
- When no key is pressed on startup Welcome, ReevesAgents shall stay on the main menu.
- When launched with run context, Welcome shall include a Current Run menu item.
- When the TUI opens or refreshes Runs, ended and stale runs are auto-removed from the visible list and archived to shared history.
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
pnpm check:package
```

Use this for the full release install matrix:

```sh
pnpm verify
pnpm check:install-matrix
```

The matrix proves:

- `npm install --omit=optional ./reevesagents-1.2.0.tgz` keeps CLI/TUI usable and disables Web cleanly.
- `npm install ./reevesagents-1.2.0.tgz` starts the loopback Web beta.

Use this to verify the packed package installs in a clean project without touching the real home directory:

```sh
pnpm pack --pack-destination /tmp
tmp=$(mktemp -d)
mkdir -p "$tmp/home" "$tmp/registry"
cd "$tmp"
pnpm init
HOME="$tmp/home" pnpm add /tmp/reevesagents-1.2.0.tgz
./node_modules/.bin/reevesagents --version
REEVES_REGISTRY="$tmp/registry" REEVES_CONFIG="$tmp/config.json" ./node_modules/.bin/reevesagents doctor --json
```

Use this broader install-surface check before publishing:

```sh
tmp=$(mktemp -d)
pnpm pack --pack-destination "$tmp"
npm pack --dry-run
mkdir -p "$tmp/npm-home" "$tmp/npm-registry" "$tmp/pnpm-home" "$tmp/pnpm-registry"
cd "$tmp"
mkdir npm-check pnpm-check
cd npm-check
npm init -y
HOME="$tmp/npm-home" npm install "$tmp/reevesagents-1.2.0.tgz"
./node_modules/.bin/reevesagents --version
REEVES_REGISTRY="$tmp/npm-registry" REEVES_CONFIG="$tmp/npm-config.json" ./node_modules/.bin/reevesagents doctor --json
cd ../pnpm-check
pnpm init
HOME="$tmp/pnpm-home" pnpm add "$tmp/reevesagents-1.2.0.tgz"
./node_modules/.bin/reevesagents --version
REEVES_REGISTRY="$tmp/pnpm-registry" REEVES_CONFIG="$tmp/pnpm-config.json" ./node_modules/.bin/reevesagents doctor --json
```

When the Homebrew tap exists, inspect the formula and run it against the same root tarball. The formula must install only `reevesagents`.

## Manual TUI Check

Automated tests cover the state, CLI, and tmux runtime boundaries. The TUI still needs a short manual pass because it is an interactive Ink interface:

1. Run `pnpm build`.
2. Run `REEVES_REGISTRY=$(mktemp -d) REEVES_CONFIG=$(mktemp) node dist/cli.js`.
3. Confirm Welcome opens with the animated `REEVES AGENTS` logo, the blue duck, and the main menu.
4. Select Runs and confirm the Runs page opens with visible actions.
5. Confirm the Runs page uses sectioned Runs and Actions panels without animated art.
6. Use Main Menu and confirm Welcome does not auto-skip after returning from Runs.
7. Confirm New Run opens the spawner wizard directly.
8. Confirm spawner copy says agents, local tmux, and no injected Reeves context.
9. Confirm Add Agent, Settings, and Doctor pages render without hidden slash commands.
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
pnpm check:package
pnpm pack --dry-run
npm pack --dry-run
```

Observed results:

- Frozen install passed with the workspace lockfile.
- Typecheck passed.
- Lint passed.
- Root Vitest passed with 72 files and 537 tests.
- Build passed.
- CLI smoke passed against isolated fake setup.
- Package content check passed with 43 files and only root package paths.
- Root `pnpm pack --dry-run` and `npm pack --dry-run` contained only `dist`, README, changelog, license, and package metadata.
- Clean install matrix checks returned version `1.2.0`, disabled Web cleanly without optional extras, and started the Web beta with optional extras.
