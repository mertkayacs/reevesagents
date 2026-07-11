# reevesagents-win

MCP-only, ConPTY-driven agent control for **native Windows**. It lets one AI CLI (Claude Code, Codex, Kimi, Qwen, Hermes) spawn and drive other AI CLIs over MCP, with no tmux and no WSL.

It is the native-Windows sibling of [`reevesagents`](https://www.npmjs.com/package/reevesagents), the tmux-based manager for macOS, Linux, and WSL. Same idea, Windows-native runtime: each agent runs as a provider CLI in its own ConPTY pseudo-console, hosted by the MCP server for the session.

## Install

```
npm install -g reevesagents-win
```

Needs Node 20.19+ and at least one provider CLI installed and signed in.

## Use it

Connect it to a host CLI, then that CLI gains the tools to spawn and steer other agents:

```
reevesagents-win attach claude    # or codex, kimi, qwen, hermes
```

Start a new session of the host CLI so it loads the tools, then ask the agent to spawn and drive others. Check your setup any time:

```
reevesagents-win doctor
reevesagents-win setup
```

## Tools

A focused drive loop over MCP: `list_providers`, `spawn`, `read`, `send_text`, `send_key`, `interrupt`, `kill`, `stop`, `list`, `list_hosts`, `attach_host`, `detach_host`, `doctor`, plus a getting-started guide resource and connect-time instructions.

## How it differs from reevesagents

- No tmux. Agents run in ConPTY consoles hosted by the MCP server, so they live for the session (close the host CLI session and they stop).
- MCP only. No TUI or web UI; it is meant to be driven by a host CLI.

Apache-2.0.
