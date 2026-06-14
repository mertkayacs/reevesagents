# Releasing

ReevesAgents uses convention-driven releases. You do not edit the version by
hand. The version number, the changelog, the git tag, and the npm publish all
follow from the commit history, so a release is one command.

## How the version is chosen

Commits follow Conventional Commits, and the next version comes from the commits
since the last `v*` tag:

- `feat: ...` gives a minor bump (`1.2.0` to `1.3.0`).
- `fix: ...` gives a patch bump (`1.2.0` to `1.2.1`).
- a commit with `BREAKING CHANGE:` in its body gives a major bump.
- `docs:`, `test:`, `refactor:`, and `chore:` do not bump the version and are
  kept out of the changelog.

The tool that does this is `release-it` with the conventional-changelog plugin,
configured in `.release-it.json`.

## Cutting a release

From a clean `master` with everything pushed:

```sh
pnpm verify     # typecheck, lint, test, build, smoke. Must pass first.
pnpm release    # everything below, in one step.
```

`pnpm release` runs `release-it`, which:

1. Reads the commits since the last tag and picks the next version.
2. Writes the new section into `CHANGELOG.md`.
3. Commits `chore(release): vX.Y.Z` and creates the `vX.Y.Z` tag.
4. Pushes the commit and the tag to `origin/master`.
5. Creates the matching GitHub release.

Pushing the `vX.Y.Z` tag is what publishes to npm. It triggers the `publish`
workflow (`.github/workflows/publish.yml`), which checks that the tag matches
`package.json`, runs `pnpm verify:release`, and then runs
`pnpm publish --provenance --access public`. The npm publish happens in CI, not
from your machine.

Preview a release without changing anything:

```sh
pnpm release --dry-run
```

## What you need

- You are on `master`, the working tree is clean, and `origin/master` is up to
  date.
- Push access to the repository.
- `GH_TOKEN` set in your shell. `release-it` uses it to create the GitHub
  release (see `tokenRef` in `.release-it.json`).
- An `NPM_TOKEN` secret configured on the repository. The publish workflow uses
  it to publish to npm. You do not need an npm token on your machine.

## Pre-beta orchestrator package

The separate `reevesagents-orchestrator` package is not released on a tag. It is
published on demand: run the `publish pre-beta orchestrator` workflow
(`.github/workflows/publish-orchestrator.yml`) from the GitHub Actions tab. It
publishes under the `pre-beta-research` dist-tag, so it never takes the npm
`latest` tag from the stable package.

## If a release goes wrong

If the publish workflow fails after the tag is pushed (for example a failing
`verify:release`), npm is not published, so the npm registry is unaffected. Fix
the problem on `master`, remove the bad tag locally and on the remote, delete the
GitHub release if one was created, then run `pnpm release` again:

```sh
git tag -d vX.Y.Z
git push origin :refs/tags/vX.Y.Z
```
