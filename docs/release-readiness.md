# Release Readiness

This is the practical checklist for taking ReevesAgents from source-installable to a first public release.

## Current State

- Source install works through `pnpm install`, `pnpm build`, and `pnpm link --global`.
- Package metadata exists in `package.json`: bin, exports, engines, repository, bugs, homepage, license, and publish workflow.
- `pnpm publish` is the preferred publish command, but the public package destination is still the npm registry.
- Portable verification is `pnpm verify`.
- Real tmux/provider verification is `pnpm verify:real`.
- Real-provider approval verification is opt-in with `pnpm smoke:approval-real`.
- npm publication and Homebrew installation are not available yet.

## Release Channels

Primary channels for the first public release:

- npm registry, published with `pnpm publish`. This is the package source for npm, pnpm, yarn, and bun users.
- Homebrew tap, preferably a personal tap first such as `mertkayacs/homebrew-tap`, not `homebrew/core`.
- GitHub Releases, one release per tag with install commands, changelog notes, and known limitations.
- Official MCP Registry metadata, because ReevesAgents is also a public MCP server. The registry should point at the npm package and installation command.

Defer these unless users ask for them:

- GitHub Packages, because it duplicates npm discovery for this project.
- Docker Hub, because ReevesAgents depends on local tmux and local provider CLIs.
- Nix, AUR, Scoop, and WinGet, because each adds maintainer load.
- `homebrew/core`, until the tap formula is stable and the project has real usage.

## First Public Release Gate

- Run `git status --short --branch` and make sure the release commit contains one coherent change set.
- Run `pnpm install --frozen-lockfile`.
- Run `pnpm verify`.
- Run `pnpm verify:real` on a machine with tmux and at least one real provider CLI installed.
- Run the manual TUI pass from `docs/testing.md`.
- Run `pnpm pack --dry-run` and inspect the package contents.
- Confirm npm provenance publishing works with the GitHub `publish` workflow and `NPM_TOKEN`.
- Tag with `v<version>` only after the release commit is verified.
- Create the GitHub Release from the verified tag.
- Publish to npm with `pnpm publish --provenance` from CI when possible.
- Update the Homebrew tap formula after the npm tarball URL and checksum are known.
- Publish or update the MCP Registry metadata after the npm package is live.

## Release Blockers To Close

- Create the Homebrew tap and formula.
- Keep `0.9.0` as the first public pre-1.0 version unless the release scope changes.
- Keep release-facing docs independent from local `specs/` working notes.
- Add a small issue template and security policy before inviting external users.
- Add at least one screenshot or terminal recording to the README once the TUI visual pass is stable.

## Solo Maintainer Bias

Keep the first release small: publish npm, maintain one Homebrew tap, document source install, require tmux, and be explicit that real provider smokes depend on each user's local provider auth and quota. Defer extra package ecosystems and broader provider matrix claims until npm plus Homebrew are proven.
