# Branching

This repository uses a simple open-source branch model.

## Branch Map

| Branch | Purpose | Who Targets It |
| --- | --- | --- |
| `master` | Default development branch. Feature, fix, Web beta, docs, and test work lands here after review. | Contributors and maintainers. |
| `release/v1.2` | Stable 1.2 release line. Keep this branch boring: verified release fixes, release notes, packaging fixes, and version metadata only. | Maintainers. |
| `fix/*`, `feature/*`, `web/*`, `docs/*` | Short-lived work branches. | Contributors and maintainers. |

Avoid long-running personal branches in the public repository. If a branch is not active review or release work, delete it after merge.

## Release Branch Rules

`release/v1.2` should stay easy to traverse:

- Use linear history where possible.
- Prefer cherry-picking one reviewed fix at a time from `master`.
- Do not land exploratory work on the release branch.
- Do not land unrelated refactors on the release branch.
- Run release verification before tagging.

Release commits should be understandable from `git log --first-parent --oneline release/v1.2`.

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

Start or update the release branch from a verified development commit:

```sh
git switch master
git pull --ff-only origin master
git switch -c release/v1.2
pnpm verify:release
```

For a fix that is already reviewed on `master`, cherry-pick it:

```sh
git switch release/v1.2
git cherry-pick <commit>
pnpm verify:release
```

After verification, tag the release commit:

```sh
git tag v<version>
```

Publish only from a verified tag. The publish workflow runs on `v*` tags.

## Clean Package Surface

The root npm package is guarded by `pnpm check:package`. It must include only the stable package surface and Web beta assets. It must not include:

- `src/`
- `test/`
- `docs/`
- `scripts/`
- `.github/`
- `packages/`
- loose internal source files (everything ships bundled into `dist/`)
