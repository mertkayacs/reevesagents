# Release Readiness

This is the practical checklist for taking the main `reevesagents` package from source-installable to a first public release.

## Current State

- Source install works through `pnpm install`, `pnpm build`, and `pnpm link --global`.
- Package metadata exists in `package.json`: bin, exports, engines, repository, bugs, homepage, license, and publish workflow.
- Install is passive. It does not write provider configs or start background services.
- Spawner is the only stable mode in the main package: tmux, local state, provider CLIs, and optional loopback Web UI only.
- Stable installs must include only the root package. Orchestrator/MCP ships only as the separate explicit PRE-BETA `reevesagents-orchestrator` package.
- `pnpm publish` is the preferred publish command, but the public package destination is still the npm registry.
- Portable verification is `pnpm verify`.
- npm publication and Homebrew installation are not available yet.

## Release Channels

Primary channels for the first public release:

- npm registry, published with `pnpm publish`. This is the package source for npm, pnpm, yarn, and bun users.
- Homebrew tap, preferably a personal tap first such as `mertkayacs/homebrew-tap`, not `homebrew/core`.
- GitHub Releases, one release per tag with install commands, changelog notes, and known limitations.

Defer these unless users ask for them:

- GitHub Packages, because it duplicates npm discovery for this project.
- Docker Hub, because ReevesAgents depends on local tmux and local provider CLIs.
- Nix, AUR, Scoop, and WinGet, because each adds maintainer load.
- `homebrew/core`, until the tap formula is stable and the project has real usage.
- Any registry or marketplace entry for non-root experimental packages.

## Install Surface Policy

Every stable install path must land on the same spawner-only root package:

| Surface | User command | Release state |
| --- | --- | --- |
| npm global, CLI/TUI only | `npm install -g --omit=optional reevesagents` | Stable app without Web bridge optionals. |
| npm global, CLI/TUI + Web | `npm install -g reevesagents` | Stable default package. |
| npm global, all-in PRE-BETA | `npm install -g reevesagents reevesagents-orchestrator` | Explicit MCP/orchestrator add-on. |
| pnpm global | `pnpm add -g reevesagents` | Uses npm package. |
| one-off runners | `npx reevesagents`, `pnpm dlx reevesagents`, `yarn dlx reevesagents`, `bunx reevesagents` | Uses npm package. |
| GitHub Release tarball | `npm install -g ./reevesagents-1.0.11.tgz` | Attach the root package tarball only. |
| GitHub Release tarballs, all-in PRE-BETA | `npm install -g ./reevesagents-1.0.11.tgz ./reevesagents-orchestrator-1.0.0.tgz` | Attach both tarballs when pre-beta is part of the release. |
| Homebrew tap | `brew install mertkayacs/tap/reevesagents` | Add after npm tarball URL and checksum are known. |
| source | `pnpm install && pnpm build && pnpm link --global` | Root workspace only. |

The root package and root Homebrew formula must not bundle orchestrator/MCP files. The all-in PRE-BETA path installs the separate package beside the stable package.

## First Public Release Gate

- Run `git status --short --branch` and make sure the release commit contains one coherent change set.
- Run `pnpm install --frozen-lockfile`.
- Run `pnpm verify`.
- Run `CI=true pnpm --dir packages/orchestrator install --frozen-lockfile --ignore-workspace` and `pnpm --dir packages/orchestrator verify`.
- Run `pnpm check:install-matrix`.
- Install the packed tarball in a fresh temp project with fake HOME, `REEVES_REGISTRY`, and `REEVES_CONFIG`.
- Check the install surface matrix: root CLI/TUI-only install, root Web install, root plus orchestrator PRE-BETA install, temp pnpm install, and Homebrew formula contents once the tap exists.
- Run the manual TUI pass from `docs/testing.md`.
- Run `pnpm check:package` and `pnpm pack --dry-run` to inspect the package contents.
- Confirm the README clearly presents the stable spawner package as the default install.
- Confirm non-root package files are absent from the packed root tarball.
- Confirm `reevesagents web --prebeta-orchestrator` fails clearly when the separate orchestrator package is not installed and works when it is installed.
- Confirm npm provenance publishing works with the GitHub `publish` workflow and `NPM_TOKEN`.
- Tag with `v<version>` only after the release commit is verified.
- Create the GitHub Release from the verified tag.
- Publish to npm with `pnpm publish --provenance` from CI when possible.
- Update the Homebrew tap formula after the npm tarball URL and checksum are known.

## Release Blockers To Close

- Create the Homebrew tap and formula.
- Ship `1.0.11` only after the release install matrix and package content checks pass on macOS and Linux.
- Keep release-facing docs independent from local `specs/` working notes.
- Keep the main package install passive and low-permission.
- Keep non-root package files out of the root npm package.
- Publish or attach `reevesagents-orchestrator` only as an explicit PRE-BETA package or release artifact.
- Add a small issue template and security policy before inviting external users.
- Add at least one screenshot or terminal recording to the README once the TUI visual pass is stable.

## Solo Maintainer Bias

Keep the first release small: publish npm, maintain one Homebrew tap, document source install, require tmux, and be explicit that real provider checks depend on each user's local provider auth and quota. Defer extra package ecosystems and broader provider matrix claims until npm plus Homebrew are proven.
