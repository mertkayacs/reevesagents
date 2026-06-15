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
`npm publish --provenance --access public`. The npm publish happens in CI, not
from your machine, and is signed with npm provenance.

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
- npm publishing configured for the repository: either a trusted publisher set
  up on npmjs.com (recommended, see below) or an `NPM_TOKEN` repository secret as
  the fallback. The npm publish runs in CI, so you never need an npm token on
  your machine.

## Where it publishes

A release reaches these places:

1. **npm: `reevesagents`** (the stable package), from the `publish` workflow on a
   `vX.Y.Z` tag, with provenance.
2. **GitHub Releases**, created by `release-it` during `pnpm release`.
3. **Homebrew tap `mertkayacs/homebrew-reevesagents`**: after the npm publish, the
   `homebrew` job in `publish.yml` bumps `Formula/reevesagents.rb` (url + sha256 +
   version) to the new release, so `brew upgrade reevesagents` tracks npm. This
   needs a `HOMEBREW_TAP_TOKEN` repository secret: a PAT with `repo` + `workflow`
   scope and write access to the tap. If it is missing, only that job fails; the
   npm publish is unaffected.
4. **npm: `reevesagents-orchestrator`** (the pre-beta package), published
   separately and on demand (see below), under the `pre-beta-research` dist-tag.

Not used, on purpose: JSR is for packages you `import`, and reevesagents is a CLI
(a `bin`), so it does not fit. GitHub Packages would only duplicate the public
npm package.

## Trusted publishing (npm OIDC)

The publish workflows are set up for npm trusted publishing (OIDC), which is the
current recommended method: GitHub authenticates to npm with a short-lived,
workflow-scoped token, so no long-lived `NPM_TOKEN` is needed and provenance is
automatic. This is a one-time setup on npmjs.com, per package:

1. On npmjs.com, open the package settings and add a trusted publisher:
   GitHub Actions, repository `mertkayacs/reevesagents`, workflow
   `publish.yml` (and `publish-orchestrator.yml` for the orchestrator package).
2. Recommended: set publishing access to "require two-factor authentication and
   disallow tokens".

Until a trusted publisher is configured, the workflows fall back to the
`NPM_TOKEN` repository secret, so publishing keeps working either way. The
workflows already request `id-token: write`, use `npm` 11.5.1+, and pass
`--provenance`.

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
