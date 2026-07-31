# Releasing

[Docs](README.md) / Releasing

ReevesAgents releases are automated by Release Please and GitHub Actions. Do not
edit versions by hand, do not run `npm publish` locally, and do not create normal
release tags by hand.

## How The Version Is Chosen

Release Please reads Conventional Commits since the last `v*` tag:

- `feat: ...` gives a minor bump (`1.2.0` to `1.3.0`).
- `fix: ...` gives a patch bump (`1.2.0` to `1.2.1`).
- a commit with `BREAKING CHANGE:` in its body gives a major bump.
- `docs:`, `test:`, `refactor:`, and `chore:` do not bump the version.

The config is `release-please-config.json`. It treats the root package as the
release package and keeps `packages/reevesagents-win/package.json` in lockstep
through `extra-files`.

## Normal Flow

1. Merge normal feature, fix, docs, or cleanup PRs into `master`.
2. The `release-please` workflow runs on the push to `master`.
3. If release-worthy commits exist, Release Please opens or updates a Release PR.
4. CI must pass on the Release PR.
5. Merge the Release PR.
6. Release Please updates `package.json`, `packages/reevesagents-win/package.json`,
   `.release-please-manifest.json`, and `CHANGELOG.md`, then creates the `vX.Y.Z`
   tag and GitHub Release.
7. The tag triggers `.github/workflows/publish.yml`.

For release-surface changes, run this before merge:

```sh
pnpm verify:release
```

That expands to the root verify plus the packed install matrix.

## Where It Publishes

A `vX.Y.Z` tag reaches these places:

1. **GitHub Releases**: created by Release Please.
2. **npm: `reevesagents`**: published by `publish.yml` with provenance.
3. **npm: `reevesagents-win`**: built and published by the same workflow, with
   the same version.
4. **Homebrew tap `mertkayacs/homebrew-reevesagents`**: updated by the
   `homebrew` job after npm publish succeeds. It points
   `Formula/reevesagents.rb` at the npm tarball and commits the new sha256.

The publish workflow checks that the tag matches `package.json` and that
`packages/reevesagents-win/package.json` matches the same version before either
npm package is published.

Not used, on purpose: JSR is for packages you import, and ReevesAgents is a CLI
with a `bin`. GitHub Packages would duplicate the public npm package.

## Required Repository Setup

- `secrets.CI_PAT`: classic PAT used by Release Please and the Homebrew tap bump.
  The workflow comments explain why `GITHUB_TOKEN` is not enough for this repo:
  events created with `GITHUB_TOKEN` do not start the follow-up workflows needed
  here.
- npm trusted publishing for `reevesagents` and `reevesagents-win`, or
  `secrets.NPM_TOKEN` as the fallback.

The workflow requests `id-token: write` and runs `npm publish --provenance
--access public`.

## Manual Checks After A Release

After the publish workflow completes:

```sh
npm view reevesagents version dist-tags --json
npm view reevesagents-win version dist-tags --json
gh release view vX.Y.Z --repo mertkayacs/reevesagents
gh run list --repo mertkayacs/homebrew-reevesagents --limit 5
```

Confirm both npm packages report `X.Y.Z`, the GitHub release exists, and the tap
workflow or commit updated the formula.

## If A Release Goes Wrong

First check whether either npm package reached the registry:

```sh
npm view reevesagents@X.Y.Z version
npm view reevesagents-win@X.Y.Z version
```

If either package exists, do not delete and recreate the tag. Fix the problem and
ship the next patch release.

If neither package exists and the failure was transient, rerun the failed
`publish` workflow for the existing tag. If the workflow needs a code fix, merge
that fix and let Release Please cut the next patch.
