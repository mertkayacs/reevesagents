# ReevesAgents

Version: `1.2.0`

GitHub: https://github.com/mertkayacs/reevesagents

ReevesAgents is a free and open source workspace manager for AI CLI agents. It
helps you run several provider CLIs side by side in tmux, keep each agent in its
own window, and control the work from a clean CLI, TUI, or local Web UI.

The goal is simple: use the CLIs you already like more effectively. You can ask
DeepSeek to work on backend code, keep Claude focused on product design, use
Codex for a design system or implementation pass, and keep Hermes agents busy
with mail, web, X, or academic-search tasks when those CLIs are configured for
that work. ReevesAgents coordinates the local workspace; provider login, tools,
models, and permissions stay with each provider CLI.

## Install

Requirements:

- macOS, Linux, or WSL
- Node.js `20.19+`
- tmux
- At least one supported provider CLI on your `PATH`

Supported provider CLIs include Claude Code, Codex CLI, OpenCode, Hermes, Kimi,
DeepSeek, Pi, Qwen, and Aider.

### npm

```sh
npm install -g reevesagents@1.2.0
reevesagents doctor
reevesagents
```

One-shot run:

```sh
npx reevesagents@1.2.0 doctor
```

### pnpm

```sh
pnpm add -g reevesagents@1.2.0
reevesagents doctor
reevesagents
```

One-shot run:

```sh
pnpm dlx reevesagents@1.2.0 doctor
```

### Yarn

Modern Yarn one-shot run:

```sh
yarn dlx reevesagents@1.2.0 doctor
```

Yarn Classic global install:

```sh
yarn global add reevesagents@1.2.0
reevesagents doctor
reevesagents
```

### Bun

```sh
bun add -g reevesagents@1.2.0
reevesagents doctor
reevesagents
```

One-shot run:

```sh
bunx reevesagents@1.2.0 doctor
```

### Homebrew

```sh
brew tap mertkayacs/reevesagents
brew install reevesagents
reevesagents doctor
reevesagents
```

### Source

Use source when you want to inspect the code, contribute, or run the pre-beta
research package from the repository.

```sh
git clone https://github.com/mertkayacs/reevesagents.git
cd reevesagents
pnpm install
pnpm build
pnpm link --global
reevesagents doctor
reevesagents
```

## Web UI

The Web UI is local and loopback-only.

```sh
reevesagents web
```

It lets you create runs, add agents, stop agents, delete ended work, and inspect
history from the browser while the real CLIs keep running in tmux.

## Pre-Beta Research: MCP Orchestrator

The normal `reevesagents` package is the stable CLI, TUI, and Web UI. The
MCP-connected root/child orchestration mode is separate and pre-beta.

Use it only when you want to test root/worker agent coordination, MCP setup, and
prompt injection that tells the root and child agents how to work inside the
ReevesAgents registry.

From npm-registry clients:

```sh
npm install -g reevesagents@1.2.0 reevesagents-orchestrator@pre-beta-research
reevesagents-orchestrator setup
reevesagents web --prebeta-orchestrator
```

Equivalent package managers:

```sh
pnpm add -g reevesagents@1.2.0 reevesagents-orchestrator@pre-beta-research
yarn global add reevesagents@1.2.0 reevesagents-orchestrator@pre-beta-research
bun add -g reevesagents@1.2.0 reevesagents-orchestrator@pre-beta-research
```

From source:

```sh
git clone https://github.com/mertkayacs/reevesagents.git
cd reevesagents
pnpm install
pnpm build
pnpm --dir packages/orchestrator build
pnpm link --global
pnpm --dir packages/orchestrator link --global
reevesagents-orchestrator setup
reevesagents web --prebeta-orchestrator
```

The setup command may write MCP entries into provider CLI configuration. Run
`reevesagents doctor` and `reevesagents-orchestrator setup --help` first if you
want to review what will happen.

## Quick Start

Start the TUI:

```sh
reevesagents
```

Start a named run from the CLI:

```sh
reevesagents spawn deepseek-cli:backend codex-cli:system claude-code:product --name "app build" --prompt "Plan and build the first useful slice."
```

Open the local Web UI:

```sh
reevesagents web
```

Check your machine:

```sh
reevesagents doctor
```

## What ReevesAgents Does

- Starts and tracks multi-agent CLI runs.
- Opens each agent in tmux.
- Keeps run history in local JSON files under `~/.reeves`.
- Provides a terminal TUI, normal CLI commands, and a local Web UI.
- Keeps provider authentication and model traffic inside the provider CLIs.
- Does not run a cloud service, database, daemon, or proxy.

## License

Apache-2.0
