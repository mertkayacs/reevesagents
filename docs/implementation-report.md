# ReevesAgents V1 Implementation Report

**Status: historical. Superseded by the current TUI design in `README.md` and `REEVESAGENTS_DESIGN.md`.**

This note records the current main-package shape after the spawner-only cleanup.

## Product Shape

ReevesAgents is a local tmux-first workspace manager for real AI CLI terminals.

- Spawner is the stable main-package path: multiple independent provider CLI terminals, no provider config writes, no injected ReevesAgents context, and no root/worker startup note.
- Runs are tracked in local state. The registry is the source of truth; tmux sessions and windows are execution/view surfaces.
- Each run owns a tmux session; each terminal is one window inside that run session.
- Provider terminals are real CLIs: Claude Code, Codex CLI, OpenCode CLI, or Hermes.
- TUI is the human dashboard.
- CLI is an operator surface with friendly commands for common spawner actions.
- Connected agent coordination was moved out of the main install and kept as PRE-BETA test code.

ReevesAgents does not store provider credentials, proxy model traffic, embed a terminal emulator, mutate provider config during install, or replace provider authentication.

## Runtime And State

Current main-package runtime and state model:

- `src/state/runs.ts`: run, terminal, inbox, and lock-managed JSON state under `~/.reeves/runs`.
- `src/launcher/runtime.ts`: spawner-only tmux runtime with one per-run session and one terminal per window.
- `src/launcher/provider-launch.ts`: spawner launch helpers for working directories and shell-safe command construction.
- `src/launcher/providers.ts`: provider command detection and flag construction.
- `src/launcher/model-data/*.ts`: curated provider-scoped model choices used by the TUI picker. Blank model keeps the provider CLI default.
- `src/cli.ts`: compact CLI surface.

State layout:

```text
~/.reeves/
  config.json
  presets/
  runs/
    <run-id>/
      run.json
      agents/
        <terminal-id>.json
```

The `agents` folder name remains for state compatibility. The main package presents those records as terminals in visible UI and CLI copy.

`REEVES_REGISTRY` points to an isolated state root for tests and smoke runs.

## Providers

Supported providers:

- `cc`: Claude Code through `claude`
- `codex`: Codex CLI through `codex`
- `opencode`: OpenCode CLI through `opencode`
- `hermes`: Hermes through `hermes chat`

Gemini support was removed from v1. OpenCode was added and uses documented prompt/model flags only.

## TUI

The TUI remains Ink/React.

Current pages:

- Welcome
- Runs
- Run
- Terminal
- New Run
- Add Terminal
- Settings
- Reference
- Credits
- Doctor

The UI no longer uses the same three-pane layout everywhere. Layouts vary by page and terminal width:

- Welcome is a small animated entry screen.
- Runs is a compact dashboard with sectioned run rows and visible actions.
- Run is a workspace view with rows for real spawner terminals. Reeves is a TUI anchor, not a provider terminal row.
- New Run opens the spawner form flow directly. Add Terminal uses the same form layout.
- Terminal, Settings, Reference, Credits, and Doctor use inspector-style layouts.
- Narrow terminals use shorter metrics, fewer row fields, and shorter footer text.

Welcome behavior:

- Shows animated blue `REEVES AGENTS` block art and a blue duck mark.
- Shows a persistent main menu.
- Opens the selected page on Enter.
- Shows Current Run when launched with run context.

Visual sources and choices:

- Claude Code docs were used as a terminal UX reference for simple input patterns, visible command discovery, and reduced redraw noise.
- `termcn` was used as a research reference for Ink-native block text and terminal component patterns.
- The duck mark is adapted from the `small-duck` entry in the CTAN `ducksay` manual.
- Lottie was considered, but not added. Browser Lottie targets SVG, canvas, or HTML, while this app is an Ink terminal TUI. The implemented animation is terminal-native and dependency-free.

## CLI

Current main-package CLI commands:

```sh
reevesagents
reevesagents runs
reevesagents open <id>
reevesagents peek <terminal-id>
reevesagents stop <run-id>
reevesagents kill <terminal-id>
reevesagents doctor
reevesagents spawn [spec...]
```

`stop` and `kill` require `--yes` or `ALLOW_DESTRUCTIVE=1`.

## Removed Or Split Code

The old tree-oriented UI and legacy runtime pieces were removed, hidden, or moved out of the main package. Removed main-package surfaces include:

- mode/preset wizard steps
- connected-only decision screens
- connected setup commands
- slash-command picker
- old shared three-pane screen layout
- old status line and banner/goodbye modules
- old launcher spawn/peek/jump/watcher modules
- old registry/session coordination state modules
- old navigation/pane hooks
- old tests tied to removed surfaces

Connected coordination code lives under `packages/orchestrator` for PRE-BETA testing. It is not part of the main workspace install path or packed root release.

## Documentation Work

Updated and checked:

- `README.md`: current quick start, provider list, TUI pages, visual design, CLI, state layout, development verification, and status.
- `docs/use-cases.md`: main-package surface map and refactor rules.
- `docs/testing.md`: isolated main-package test matrix, acceptance criteria, and manual TUI check.
- `docs/release-readiness.md`: first public release checklist and add-on policy.
- `REEVESAGENTS_DESIGN.md`: current main-package product and architecture model.
- This report: v1 implementation notes, removed legacy surfaces, UI changes, source references, and verification record.

## Test And Smoke Work

Key test and smoke surfaces:

- `test/runs-state.test.ts`
- `test/runtime.test.ts`
- `test/router.test.ts`
- `test/screens/*`
- `scripts/smoke-cli.mjs`

Package scripts:

```sh
pnpm smoke:cli
pnpm verify
```

Isolation guarantees:

- Unit tests use temp state and fake drivers.
- CLI smoke uses temp registry/config/home and fake provider binaries.
- Real user provider credentials are not printed, read, or written by these tests.

## Verification Record

Latest local verification for the spawner-only cleanup completed on June 1, 2026:

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm smoke:cli
pnpm pack --dry-run
```

Observed:

- Frozen install passed with the spawner-only workspace lockfile.
- Typecheck passed.
- Lint passed.
- Vitest passed with 63 files and 474 tests.
- Build passed.
- CLI smoke passed against isolated setup and fake provider binaries.
- Packed root tarball contains the main package only: `dist`, README, changelog, license, and package metadata.
- Clean tarball install in a temp project returned version `0.9.0` and `doctor --json` returned `ok: true`.

## Source References

- Claude Code interactive mode: https://code.claude.com/docs/en/interactive-mode
- Claude Code commands and `/tui fullscreen`: https://code.claude.com/docs/en/commands
- termcn Big Text: https://www.termcn.dev/docs/components/ink/typography/big-text
- termcn repo: https://github.com/Aniket-508/termcn
- CTAN ducksay manual: https://mirrors.mit.edu/CTAN/macros/latex/contrib/ducksay/ducksay.pdf
