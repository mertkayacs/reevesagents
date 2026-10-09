<p align="center"><a href="https://reevesagents.mertkayacs.com/"><img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-banner.png" width="800" alt="ReevesAgents: Run AI coding assistants together"></a></p>

# reevesagents: a workspace for AI coding tools

Run Claude Code, Codex, Kimi, OpenCode, Hermes and other AI coding tools side by side on your computer. reevesagents keeps their terminal sessions together so you can inspect each tool's work, send instructions and stop a run from one place.

<img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-hero.webp" width="720" alt="A gold-framed lead pane joined by fine gold threads to eight glowing glass panes, one for each tool in a run">

[See the demo](https://reevesagents.mertkayacs.com/demo/) or install the command-line tool below.

## Quick start

Requires Node.js 20.19 or newer, tmux 3.0 or newer, and an installed, authenticated AI coding tool. Supports macOS, Linux and WSL. tmux keeps the tools running when you close the interface.

```sh
npm install -g reevesagents && reevesagents doctor && reevesagents
```

This opens the terminal interface. For the browser interface, run `reevesagents web`; it listens only on your computer's loopback address.

## Run a team

Start a run with a task for the tools:

```sh
reevesagents spawn claude-code:lead codex:tests --name "review" --prompt "Review the code and tests."
```

Use the terminal or browser interface to read output and steer each tool. Each provider keeps its own login and sends its own model requests. Run state is stored as JSON under `~/.reeves`.

<img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-newrun-en.png" width="720" alt="reevesagents Web UI starting a new run: a run name, a choice of provider tools such as Claude Code, Codex CLI and Kimi Code, a model and a permission mode">

## Let one tool direct the others

Attach the optional Model Context Protocol (MCP) server, a standard connection between AI tools, to a host you trust:

```sh
reevesagents attach claude && reevesagents hosts
```

Restart that host to load the connection. It can then start, read, steer and stop other tools. Workers receive no MCP connection by default. Keep provider permission prompts enabled and review approvals before sensitive actions.

In Claude Code you can install the connection and its operating instructions together as a plugin:

```sh
claude plugin marketplace add mertkayacs/reevesagents
claude plugin install reevesagents@reevesagents
```

For other hosts, the [reevesagents skill](https://github.com/mertkayacs/reevesagents-skill) supplies the operating instructions. See the [MCP reference](docs/mcp.md) for tools and host requirements.

The server is listed in the [official MCP Registry](https://registry.modelcontextprotocol.io/?q=io.github.mertkayacs/reevesagents) as `io.github.mertkayacs/reevesagents`.

<img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-steer.webp" width="560" alt="A gold-framed lead pane sending messages along gold threads to three other panes">

## Choose an interface

| Interface | Purpose |
| --- | --- |
| Terminal UI | Inspect and control runs with the keyboard |
| Web UI | Inspect runs, live output, approvals and history in a browser |
| Command line | Start runs and inspect output from scripts |
| MCP server | Let a trusted AI coding tool control a team |

<details>
<summary>Web UI screenshot</summary>

<img src="docs/assets/reevesagents-web-en.png" width="720" alt="reevesagents Web UI before any run: an empty agent list, New run buttons and the language and settings controls">

</details>

## Documentation

- [User guide](https://reevesagents.mertkayacs.com/docs/): installation, commands and configuration.
- [FAQ](https://reevesagents.mertkayacs.com/faq/): provider setup and troubleshooting.
- [MCP reference](docs/mcp.md): tools and host connections.
- [Contributing](.github/CONTRIBUTING.md), [testing](docs/testing.md) and [changelog](CHANGELOG.md).

Translations: [Deutsch](docs/i18n/README.de.md), [Français](docs/i18n/README.fr.md), [Español](docs/i18n/README.es.md), [Português](docs/i18n/README.pt.md), [Italiano](docs/i18n/README.it.md), [Türkçe](docs/i18n/README.tr.md), [Русский](docs/i18n/README.ru.md), [简体中文](docs/i18n/README.zh-Hans.md), [العربية](docs/i18n/README.ar.md). These are separate README translations.

## License

[Apache-2.0](LICENSE). Available on [npm](https://www.npmjs.com/package/reevesagents).

<a href="https://eschatialabs.com"><picture><source media="(prefers-color-scheme: dark) and (min-resolution: 2dppx)" srcset="https://eschatialabs.com/brand/lockup-46-dark@2x.png"><source media="(prefers-color-scheme: dark)" srcset="https://eschatialabs.com/brand/lockup-46-dark@1x.png"><source media="(min-resolution: 2dppx)" srcset="https://eschatialabs.com/brand/lockup-46@2x.png"><img src="https://eschatialabs.com/brand/lockup-46@1x.png" width="124" height="46" alt="Eschatia Labs"></picture></a><br>An [Eschatia Labs](https://eschatialabs.com) project by [Mert Kaya](https://mertkayacs.com).
