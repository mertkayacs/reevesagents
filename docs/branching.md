# Branching

[Docs](README.md) / Branching

This repository uses a simple open-source branch model.

## Branch Map

| Branch | Purpose | Who Targets It |
| --- | --- | --- |
| `master` | Default development branch. Feature, fix, Web UI, docs, and test work lands here after review. Releases are normally cut from a clean `master` (see [Releasing](releasing.md)). | Contributors and maintainers. |
| `release/v*` (for example `release/v1.2`) | A frozen stable release line. Keep these branches boring: verified release fixes, release notes, packaging fixes, and version metadata only. | Maintainers. |
| `fix/*`, `feature/*`, `web/*`, `docs/*` | Short-lived work branches. | Contributors and maintainers. |

Avoid long-running personal branches in the public repository. If a branch is not active review or release work, delete it after merge.

## Release Branch Rules

A release branch should stay easy to traverse:

- Use linear history where possible.
- Prefer cherry-picking one reviewed fix at a time from `master`.
- Do not land exploratory work on the release branch.
- Do not land unrelated refactors on the release branch.
- Run release verification before tagging.

Release commits should be understandable from `git log --first-parent --oneline release/v<minor>`.

## Normal Contributor Flow

```sh
git switch master
git pull --ff-only origin master
git switch -c fix/short-name
pnpm install
pnpm typecheck
pnpm lint
pnpm test
```

Open the pull request against `master`.

## Release Flow

Normal releases are cut by Release Please from `master`; the full process is in
[Releasing](releasing.md). Do not tag normal releases by hand.

A release branch exists to maintain a line that has already shipped. Start or
update one from a verified development commit:

```sh
git switch master
git pull --ff-only origin master
git switch -c release/v<minor>
pnpm verify:release
```

For a fix that is already reviewed on `master`, cherry-pick it onto the release
branch and run `pnpm verify:release`. Publish only from a verified `v*` tag.

## Clean Package Surface

The root npm package is guarded by `pnpm check:package`. It must include only the stable package surface and Web UI assets. It must not include:

- `src/`
- `test/`
- `docs/`
- `scripts/`
- `.github/`
- `packages/`
- loose source files outside the published `dist/` bundle
