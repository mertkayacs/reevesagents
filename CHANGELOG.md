# Changelog

## [1.7.2](https://github.com/mertkayacs/reevesagents/compare/v1.7.1...v1.7.2) (2026-07-27)


### Bug Fixes

* **mcp:** recognize Kimi Code as a host instead of reporting it detached ([#20](https://github.com/mertkayacs/reevesagents/issues/20)) ([d932fcb](https://github.com/mertkayacs/reevesagents/commit/d932fcbd8f1c6fab44b8e870f9f874a21721d192)), closes [#19](https://github.com/mertkayacs/reevesagents/issues/19)

## [1.7.1](https://github.com/mertkayacs/reevesagents/compare/v1.7.0...v1.7.1) (2026-07-26)


### Bug Fixes

* **runtime:** verify tmux ids belong to their run session before targeting them ([#18](https://github.com/mertkayacs/reevesagents/issues/18)) ([c6e9e08](https://github.com/mertkayacs/reevesagents/commit/c6e9e089fdea40297870ee75165c58209423a09e)), closes [#17](https://github.com/mertkayacs/reevesagents/issues/17)

# [1.7.0](https://github.com/mertkayacs/reevesagents/compare/v1.6.2...v1.7.0) (2026-07-26)


### Features

* **mcp:** one-command setup with OpenCode auto-attach and accurate status ([#16](https://github.com/mertkayacs/reevesagents/issues/16)) ([3998259](https://github.com/mertkayacs/reevesagents/commit/3998259178b9d5c837740da2c14e228aeddafdba)), closes [#15](https://github.com/mertkayacs/reevesagents/issues/15)

## [1.6.2](https://github.com/mertkayacs/reevesagents/compare/v1.6.1...v1.6.2) (2026-07-25)


### Bug Fixes

* **skills:** make SKILL.md frontmatter valid YAML ([3096541](https://github.com/mertkayacs/reevesagents/commit/309654120a5841077a68faef73ed0b7c54370185))

## [1.6.1](https://github.com/mertkayacs/reevesagents/compare/v1.6.0...v1.6.1) (2026-07-25)


### Bug Fixes

* republish as 1.6.1 and sync reevesagents-win ([8125062](https://github.com/mertkayacs/reevesagents/commit/81250624b155dad3a9f64eeab0978aff249ecaf1)), closes [11/#12](https://github.com/mertkayacs/reevesagents/issues/12)

# [1.6.0](https://github.com/mertkayacs/reevesagents/compare/v1.5.0...v1.6.0) (2026-07-25)


### Bug Fixes

* **cli:** harden bare-launch tmux targeting and non-tty handling ([c7e0eef](https://github.com/mertkayacs/reevesagents/commit/c7e0eef65a8f91f474e6a75c69f2ec3df937f49f)), closes [#11](https://github.com/mertkayacs/reevesagents/issues/11)
* **runs:** return not-found on corrupt or missing run and agent json ([f2ae30e](https://github.com/mertkayacs/reevesagents/commit/f2ae30e1bd493fda0d7927eacd16a7dcd17de1f6)), closes [#11](https://github.com/mertkayacs/reevesagents/issues/11)
* **runtime:** use exact/append tmux targets for the reeves anchor ([41328bc](https://github.com/mertkayacs/reevesagents/commit/41328bc96390302a7dc22f932d2a64eb2c51d8de)), closes [#12](https://github.com/mertkayacs/reevesagents/issues/12)


### Features

* auto-reap zombie agents, raise agent cap to 100, and ship an installable skill ([c32edec](https://github.com/mertkayacs/reevesagents/commit/c32edec718c88ddb3cefcb08275429a4e21fe1ff))
* **onboarding:** one connect flow, sharper MCP text, post-install nudge ([c83abc0](https://github.com/mertkayacs/reevesagents/commit/c83abc011f04f9cbbcff0006503776b5a284091b))
* **providers:** refresh model catalogs for updated CLIs and add Codex effort ([7c1b4fa](https://github.com/mertkayacs/reevesagents/commit/7c1b4fa6ad28412d98f0c8a85f454a8404a62a1d))

# [1.5.0](https://github.com/mertkayacs/reevesagents/compare/v1.4.0...v1.5.0) (2026-07-11)


### Bug Fixes

* address remaining review notes across CLI, TUI, and web ([b7753c0](https://github.com/mertkayacs/reevesagents/commit/b7753c060e8ab05e6b50650d15a8a008f1c9b4f8)), closes [#8](https://github.com/mertkayacs/reevesagents/issues/8)
* **cli:** set failure exit codes and add attach --force ([a68c247](https://github.com/mertkayacs/reevesagents/commit/a68c24782f8fb2b1311fcbaf4a03cd4d9baf17c9)), closes [#8](https://github.com/mertkayacs/reevesagents/issues/8)
* **win:** guard .cmd launchers, add setup --json, shorten status probe ([6273ea7](https://github.com/mertkayacs/reevesagents/commit/6273ea7eae7d72916edf7a1b45cedcc5a4aedfee)), closes [#8](https://github.com/mertkayacs/reevesagents/issues/8)
* **win:** protect live runs in the verifier and fix cmd.exe quoting ([52dc275](https://github.com/mertkayacs/reevesagents/commit/52dc27536c8a1e6d92cf1275d3bf99356fbf6d9c)), closes [#8](https://github.com/mertkayacs/reevesagents/issues/8)


### Features

* **cli:** add a setup command and shared onboarding core ([79dd470](https://github.com/mertkayacs/reevesagents/commit/79dd470bbaf0f4aa9598a889ecb8f7d5025b4d6b)), closes [#8](https://github.com/mertkayacs/reevesagents/issues/8)
* **mcp:** add connect-time instructions and a getting-started guide ([341c8e6](https://github.com/mertkayacs/reevesagents/commit/341c8e689b6a13057edcd8274e442bc1a71e6f5b)), closes [#8](https://github.com/mertkayacs/reevesagents/issues/8)
* **mcp:** resolve an absolute launcher and verify attach ([2315e8e](https://github.com/mertkayacs/reevesagents/commit/2315e8e494d61036f7659db82ac55d35d44fadde)), closes [#8](https://github.com/mertkayacs/reevesagents/issues/8)
* **tui:** add a first-run setup wizard ([1895611](https://github.com/mertkayacs/reevesagents/commit/18956117e6af36dbd1055ed984b3cbb589f5387b)), closes [#8](https://github.com/mertkayacs/reevesagents/issues/8)
* **web:** add a first-visit getting-started popup ([c3d909b](https://github.com/mertkayacs/reevesagents/commit/c3d909b4456052cc4398b82bf74213dc8b9af220)), closes [#8](https://github.com/mertkayacs/reevesagents/issues/8)
* **win:** add reevesagents-win, an MCP-only Windows-native package ([58dba05](https://github.com/mertkayacs/reevesagents/commit/58dba05fad8c23cf27a5ab77d97c8fd8f097468f)), closes [#8](https://github.com/mertkayacs/reevesagents/issues/8)

# [1.4.0](https://github.com/mertkayacs/reevesagents/compare/v1.3.2...v1.4.0) (2026-07-05)


### Features

* **cli:** add an `add` command to grow a workspace one agent at a time ([07f9cde](https://github.com/mertkayacs/reevesagents/commit/07f9cdedb3b33f742f209a2f1453f5af5a5d69e4))
* **spawn:** pass extra launch flags through to the provider CLI ([011f923](https://github.com/mertkayacs/reevesagents/commit/011f9233578158d1399e2580154de56f5d17bc8c))

## [1.3.2](https://github.com/mertkayacs/reevesagents/compare/v1.3.1...v1.3.2) (2026-07-02)


### Bug Fixes

* **providers:** show auth-mode and effort pickers only where they apply ([43fc16d](https://github.com/mertkayacs/reevesagents/commit/43fc16dae8e4544c6a40218956e3bee7cfafeb96))

## [1.3.1](https://github.com/mertkayacs/reevesagents/compare/v1.3.0...v1.3.1) (2026-06-26)


### Bug Fixes

* **i18n:** Turkish consistency (Effort->Çaba; action hint eylem->işlem) ([6be8bac](https://github.com/mertkayacs/reevesagents/commit/6be8baccbc2b0b5ae3a7af62c00b8f6c181bc947))
* **i18n:** word-by-word correctness audit of all 9 languages ([a9ee6a8](https://github.com/mertkayacs/reevesagents/commit/a9ee6a878c27b8ac352c89923ccc58cedbebade7))
* **tui:** size columns and borders by display width, not code units ([f008ffc](https://github.com/mertkayacs/reevesagents/commit/f008ffc82725de4d975b958ff3a350ca08b275a2))
* **tui:** use the compact Settings layout until the body fits the full view ([2bd5a95](https://github.com/mertkayacs/reevesagents/commit/2bd5a95ac97571a0a180f02f5eda6fc2396251aa))
* **web:** make agent cards readable and dialogs robust at all sizes ([2a8ed4d](https://github.com/mertkayacs/reevesagents/commit/2a8ed4d18d113c942895f9c0016d1fec4a484c47))


### Features

* **cli:** ease fresh-agent friction in spawn ([840c25a](https://github.com/mertkayacs/reevesagents/commit/840c25a9a91e8aa8ed60fa6d0e8bf7f022e068c0))
* **i18n:** localize dynamic TUI strings (agent counts, pagination, status context) ([4fe24e3](https://github.com/mertkayacs/reevesagents/commit/4fe24e375b3a8e45237adf9f091e245a19293aa5))
* **i18n:** localize the Config editor field labels ([e24d85e](https://github.com/mertkayacs/reevesagents/commit/e24d85e590a723fcbb2526d4469c260d36e6a95d))
* **i18n:** localize the remaining TUI dialog, doctor, and run-view strings ([aa6c7cf](https://github.com/mertkayacs/reevesagents/commit/aa6c7cf711ba29890f1119940b21db05b0dec8c7))
* **i18n:** wire localization for the web Doctor/About/Config/Presets dialogs and Auth/Effort fields ([34810f2](https://github.com/mertkayacs/reevesagents/commit/34810f27b8d4b8f47cd0f168e0cc68920deeea09))

# [1.3.0](https://github.com/mertkayacs/reevesagents/compare/v0.7.0...v1.3.0) (2026-06-23)


### Bug Fixes

* address critical-review findings across web, i18n, and docs ([0ca9718](https://github.com/mertkayacs/reevesagents/commit/0ca9718166efa7aa0849dd62fbda0c55af51664b))
* clamp the read tool line count to a positive value ([10c3a28](https://github.com/mertkayacs/reevesagents/commit/10c3a28d87b1b5886850667796f3e0a9793f16a5))
* **cli:** resolve bin symlink before entrypoint check ([33d0ee4](https://github.com/mertkayacs/reevesagents/commit/33d0ee490ac61123c1791ae72c48e3bfba86483e))
* correct run-head detection, session reuse, and head-run lifecycle ([5c904cf](https://github.com/mertkayacs/reevesagents/commit/5c904cf74446e666ddf18100b74b123f55de56d0))
* guard the read line count and blank run names ([01a6918](https://github.com/mertkayacs/reevesagents/commit/01a6918b292189a0ca97d40952504ac8adf49670))
* make attach-all idempotent for already-attached hosts ([226e1aa](https://github.com/mertkayacs/reevesagents/commit/226e1aa5f579a998d52cd7d3de4c5ab1e84955f6))
* redact approvals before returning them from the store ([d8ef7e2](https://github.com/mertkayacs/reevesagents/commit/d8ef7e2dc39c523777469517dda4cbbe615aa707))
* return an error when read targets a missing agent ([b75b798](https://github.com/mertkayacs/reevesagents/commit/b75b79855cd479eb2cdb9f11aab2ea1e07297180))
* **scripts:** correct render-mascot brand paths after the tui/ move ([b1c3854](https://github.com/mertkayacs/reevesagents/commit/b1c3854a1d579fed258209511326a230718acde1))
* tighten MCP attach detection and surface CLI errors ([1c5e2d0](https://github.com/mertkayacs/reevesagents/commit/1c5e2d0506a4b97ddb0c3a33a80a0df26592984e))


### Features

* add Agent Control to the Web UI as a first-class feature ([f97da03](https://github.com/mertkayacs/reevesagents/commit/f97da03f88bdd1c73101bbda5e22b6b50174c7d6))
* add lean agent control MCP server ([eafd520](https://github.com/mertkayacs/reevesagents/commit/eafd5201677dfcd95a37ef89be348f4f820a7208))
* add MCP installer engine for attaching to host CLIs ([e74bd7c](https://github.com/mertkayacs/reevesagents/commit/e74bd7cd8968bbdaecf4eb4da09cb868f1a2d669))
* add reevesagents mcp subcommand ([f9e6b46](https://github.com/mertkayacs/reevesagents/commit/f9e6b46c2c00b1f16f4ff640010d4b1e6fd3cc66))
* add Russian as the tenth UI language ([c949a57](https://github.com/mertkayacs/reevesagents/commit/c949a57802507c4e3cd52a8a38eadfd8389a27dd))
* add the Agent Control TUI screen to attach the MCP to host CLIs ([3c52cb4](https://github.com/mertkayacs/reevesagents/commit/3c52cb45d99707aab0bd35d92939bcfe51284e78))
* cap agents per run on MCP spawn (max_agents) ([9ac5f43](https://github.com/mertkayacs/reevesagents/commit/9ac5f43f8f00735bd711fe7ebaa19d3fdb00df94))
* **cli:** agents, config, and preset commands + spawn auth/effort ([a14a752](https://github.com/mertkayacs/reevesagents/commit/a14a752a7a6d4a0467785910622c1bfa7b3827d5))
* **cli:** bring the CLI to parity with the TUI and Web UI ([ce549d9](https://github.com/mertkayacs/reevesagents/commit/ce549d94c5050863dae83508419b0df40c464f4f))
* **core:** config-edit + preset save/spawn domain helpers ([80e0080](https://github.com/mertkayacs/reevesagents/commit/80e0080cfe387af46aa487cfa8df0a5d1fe99169))
* **i18n:** complete all 10 languages and restructure into per-language files ([c79aa7f](https://github.com/mertkayacs/reevesagents/commit/c79aa7fbaabb211e2c9ee90ace24486acc26a9b1))
* **i18n:** German translations for the newer screens ([35bf4ae](https://github.com/mertkayacs/reevesagents/commit/35bf4aed36dd82beb3f809760144db68301c9afb))
* make the host CLI the head of an MCP session's run ([faa92b9](https://github.com/mertkayacs/reevesagents/commit/faa92b9b09c90d7dc58ae6c16f3586e779adfb5e))
* **mcp:** add an open tool and make every tool description self-explanatory ([8a5733b](https://github.com/mertkayacs/reevesagents/commit/8a5733b03ec77ac83305dbd232851dcc6409ccdf))
* **mcp:** add delete tools and spawn permission controls ([a29934d](https://github.com/mertkayacs/reevesagents/commit/a29934d003288f7755776dd176ab1e831db5a060))
* **mcp:** config, preset, host, and doctor tools ([4f50d35](https://github.com/mertkayacs/reevesagents/commit/4f50d35e68884d5bac65495c18cb90172086326b))
* **mcp:** expose provider and model catalog over the agent-control MCP ([93ea9aa](https://github.com/mertkayacs/reevesagents/commit/93ea9aa4d7034053c966555bb4baebf1cea40bb5))
* **parity:** approvals in TUI and web, plus Doctor, About, and agent prompt in web ([a7d322d](https://github.com/mertkayacs/reevesagents/commit/a7d322da58be78ca08fd44ea10f597587d9d41a6))
* **tui:** config editor + presets screen + wizard auth picker ([953aea8](https://github.com/mertkayacs/reevesagents/commit/953aea8c5056063191bd07eee7d0ee3e54e4b973))
* **tui:** set auth mode and effort when adding an agent to a live run ([b0aa43e](https://github.com/mertkayacs/reevesagents/commit/b0aa43e3bf985e08ece54eda57f788b0e00bb455))
* **web:** config + presets panels and auth/effort selectors ([96a342d](https://github.com/mertkayacs/reevesagents/commit/96a342d4d39ad8e8e9620f4194155c4441cbed84))

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

## Pre-1.2.0 - Web UI Workbench Polish

### Changed
- Refined the Web beta into a compact agent workbench with richer agent cards, improved stage framing, and better responsive behavior.
- Prepared the root package, CLI smoke expectations, README, and release docs for the release candidate.

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
