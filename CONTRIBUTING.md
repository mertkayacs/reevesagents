# Contributing

Thanks for working on ReevesAgents. Keep changes small, testable, and easy to review.

## Branches

Use short-lived branches and open pull requests against `master`.

Recommended branch names:

- `fix/<short-name>` for bug fixes.
- `feature/<short-name>` for stable root package work.
- `web/<short-name>` for Web UI beta work.
- `docs/<short-name>` for contributor, release, or user docs.

Long-lived branches:

- `master`: default development branch and normal pull request target.
- `release/v1.2`: current stable release line. Use this only for verified release fixes, release notes, and packaging corrections.

Tags use `v<version>`, for example `v1.2.0`, and should point at a verified release commit.

More detail is in [docs/branching.md](docs/branching.md).

## Before Opening A Pull Request

Run the focused checks for the files you touched. For most changes, run:

```sh
pnpm typecheck
pnpm lint
pnpm test
```

For package or release-surface changes, also run:

```sh
pnpm build
pnpm smoke:cli
pnpm check:package
pnpm check:install-matrix
```

## Releasing

Releases are automated. You do not edit the version by hand. From a clean
`master`, `pnpm verify` then `pnpm release` bumps the version from the
Conventional Commit history, writes the changelog, tags, pushes, and the tag
push publishes to npm through CI. The full process is in
[docs/releasing.md](docs/releasing.md).

## Package Boundaries

The package is the CLI, TUI, optional Web beta, and the opt-in agent-control MCP. The MCP stays a flat mechanism: no roles, autonomous loops, or coordination protocol.

Keep generated build output, private notes, local screenshots, and debugging artifacts out of pull requests.

## Pull Request Style

- One logical change per pull request.
- Prefer existing project patterns over new abstractions.
- Include tests for behavior changes.
- Keep visible copy clear. Use "agent" for user-facing agent controls.
- Do not include AI signatures, generated co-author trailers, or internal planning notes.
