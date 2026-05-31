# reevesagents-orchestrator PRE-BETA

PRE-BETA MCP orchestration test package for ReevesAgents.

This is not the main app. The stable `reevesagents` package is the spawner TUI and CLI. This package exists so maintainers can test MCP-connected root/worker coordination before it is stable enough for normal users.

Current boundaries:

- Root `pnpm install` does not install this package.
- The root `reevesagents` CLI exposes no MCP, setup, approval, or orchestration commands.
- The root npm tarball does not include this directory.
- npm, pnpm, one-off runner, Homebrew, GitHub Release tarball, and source installs for `reevesagents` are stable spawner installs only.
- This package may change or break before it becomes stable.

Test it only when you intentionally want provider CLIs or host agents to call the ReevesAgents MCP control plane.

```sh
cd packages/orchestrator
pnpm install
pnpm verify
```

For the stable spawner TUI and CLI, install and run `reevesagents`.

See [docs/mcp-tools.md](docs/mcp-tools.md) for tool roles, scope, and approval behavior.
