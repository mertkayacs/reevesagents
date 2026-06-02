# Contributing

Thanks for working on ReevesAgents. Keep changes small, testable, and easy to review.

## Branches

Use short-lived branches and open pull requests against `master`.

Recommended branch names:

- `fix/<short-name>` for bug fixes.
- `feature/<short-name>` for stable root package work.
- `web/<short-name>` for Web UI beta work.
- `prebeta/<short-name>` for orchestrator or MCP work.
- `docs/<short-name>` for contributor, release, or user docs.

Long-lived branches:

- `master`: default development branch and normal pull request target.
- `release/v1.0`: current stable release line. Use this only for verified release fixes, release notes, and packaging corrections.

Tags use `v<version>`, for example `v1.0.11`, and should point at a verified release commit.

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

For orchestrator package changes, run:

```sh
pnpm --dir packages/orchestrator verify
```

## Package Boundaries

The root package is the stable CLI, TUI, and Web beta. It must not bundle the pre-beta orchestrator package.

The pre-beta orchestrator package lives under `packages/orchestrator` and is installed explicitly as `reevesagents-orchestrator`.

Keep generated build output, private notes, local screenshots, and debugging artifacts out of pull requests.

## Pull Request Style

- One logical change per pull request.
- Prefer existing project patterns over new abstractions.
- Include tests for behavior changes.
- Keep visible copy clear. Use "agent" for user-facing agent controls.
- Do not include AI signatures, generated co-author trailers, or internal planning notes.
