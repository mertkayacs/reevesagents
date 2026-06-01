# reevesagents-orchestrator PRE-BETA

PRE-BETA MCP orchestration test package for ReevesAgents.

This is not the main app. The stable `reevesagents` package is the spawner TUI, CLI, and Web beta. This package exists so maintainers and explicit pre-beta users can test MCP-connected root/worker coordination before it is stable enough for normal users.

Current boundaries:

- Root `pnpm install` does not install this package.
- The root `reevesagents` CLI exposes no MCP, setup, approval, or orchestration commands.
- The root npm tarball does not include this directory.
- Normal npm, pnpm, one-off runner, Homebrew, GitHub Release tarball, and source installs for `reevesagents` are stable spawner installs only.
- The all-in PRE-BETA path installs this package separately beside `reevesagents`.
- This package may change or break before it becomes stable.

Test it only when you intentionally want provider CLIs or host agents to call the ReevesAgents MCP control plane.

```sh
cd packages/orchestrator
pnpm install --frozen-lockfile
pnpm verify
```

For the stable spawner TUI and CLI, install and run `reevesagents`.

## Install

Stable app plus PRE-BETA orchestrator from npm:

```sh
npm install -g reevesagents reevesagents-orchestrator
reevesagents web --prebeta-orchestrator
```

From release tarballs:

```sh
npm install -g ./reevesagents-1.0.0.tgz ./reevesagents-orchestrator-1.0.0.tgz
reevesagents web --prebeta-orchestrator
```

Direct orchestrator CLI:

```sh
reevesagents-orchestrator --help
reevesagents-orchestrator mcp
```

Provider MCP registration is explicit and PRE-BETA:

```sh
reevesagents-orchestrator setup
```

`setup` may write provider MCP config entries for supported provider CLIs. The
stable `reevesagents` package never runs this command automatically.

See [docs/mcp-tools.md](docs/mcp-tools.md) for tool roles, scope, and approval behavior.
