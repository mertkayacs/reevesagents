# reevesagents plugin for Claude Code

This plugin lets Claude Code run and steer other AI coding tools: Claude Code, Codex, Kimi, Qwen, OpenCode and any other CLI that reevesagents supports. Each tool runs in its own tmux window. Claude can start them with a task, read their output, send follow-up instructions and stop them.

The plugin contains two parts:

- a skill that tells Claude how to drive a team (`skills/reevesagents/SKILL.md`)
- the `reevesagents` MCP server, started on your computer as `reevesagents mcp`

## Requirements

- Claude Code
- Node.js 20.19 or newer and tmux 3.0 or newer
- the reevesagents command-line tool: `npm install -g reevesagents` (or `brew install mertkayacs/reevesagents/reevesagents`)
- at least one other AI coding tool, installed and signed in

Run `reevesagents doctor` to check the setup.

## Install

```sh
claude plugin install reevesagents --marketplace mertkayacs/reevesagents
```

This adds the marketplace and installs the plugin in one step. The two-step form also works, in the terminal or inside Claude Code with a leading slash:

```sh
claude plugin marketplace add mertkayacs/reevesagents
claude plugin install reevesagents@reevesagents
```

Restart Claude Code afterwards.

## Use

Ask Claude for parallel or delegated work, for example "have Codex write the tests while you review the parser". Claude starts the tools, checks their output and stops them when they are done. Every tool keeps its own login and permission prompts; the MCP server sends no model requests of its own.

## Privacy

The MCP server runs only on your computer. It stores run state as JSON under `~/.reeves` and makes no network requests. The AI tools it starts talk to their own providers as they normally do.

## More

- Project site and documentation: https://reevesagents.mertkayacs.com
- Source and issues: https://github.com/mertkayacs/reevesagents
- License: Apache-2.0
