# ReevesAgents Documentation

The complete doc index for ReevesAgents. New here? Start with the User Guide.
Looking for a command or a config key? That lives in the main
[README](../README.md).

## Start here

**[User Guide](GUIDE.md).** Install it, make your first run, and let one agent
drive the others.

Languages: [English](GUIDE.md) · [Deutsch](GUIDE.de.md) · [Français](GUIDE.fr.md) · [Español](GUIDE.es.md) · [Português](GUIDE.pt.md) · [Italiano](GUIDE.it.md) · [Türkçe](GUIDE.tr.md) · [Русский](GUIDE.ru.md) · [简体中文](GUIDE.zh-Hans.md) · [العربية](GUIDE.ar.md)

## Reference

The command and option reference lives in the main README:

- [Commands](../README.md#commands): every subcommand and flag.
- [Configuration](../README.md#configuration): what lives under `~/.reeves`.
- [Agent control](../README.md#agent-control): the opt-in model for one agent driving others.

README languages: [English](../README.md) · [Deutsch](i18n/README.de.md) · [Français](i18n/README.fr.md) · [Español](i18n/README.es.md) · [Português](i18n/README.pt.md) · [Italiano](i18n/README.it.md) · [Türkçe](i18n/README.tr.md) · [Русский](i18n/README.ru.md) · [简体中文](i18n/README.zh-Hans.md) · [العربية](i18n/README.ar.md)

## Source Layout

- `src/core`: shared run state, provider detection, runtime, config, and health checks.
- `src/surfaces/cli`: command parser and command handlers.
- `src/surfaces/mcp`: Agent Control MCP server, host setup, and installer helpers.
- `src/surfaces/tui`: Ink screens, components, contexts, and terminal branding.
- `src/surfaces/webui`: loopback Web UI server, browser client assets, bridge, and state view.
- `src/i18n` and `src/utils`: shared language catalog and utility helpers.

Published output stays stable: the npm package still exposes `dist/cli.js`,
`dist/index.js`, and Web UI assets under `dist/web/`.

## Contributing

- [Contributing guide](../.github/CONTRIBUTING.md): how to propose a change.
- [Agent Control MCP](mcp.md): the public control surface and tool list.
- [Branching model](branching.md): `master`, the stable release line, and short-lived work branches.
- [Testing](testing.md): isolation rules and how to run the suites.
- [Releasing](releasing.md): convention-driven releases from commit history.
- [Security policy](../.github/SECURITY.md): how to report a vulnerability.
