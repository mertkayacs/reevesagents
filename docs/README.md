# ReevesAgents Documentation

The complete doc index for ReevesAgents. New here? Start with the User Guide.
Looking for a command or a config key? That lives in the main
[README](../README.md). Curious how it works inside? See Design and internals.

## Start here

**[User Guide](GUIDE.md).** Install it, make your first run, and let one agent
drive the others.

Languages: [English](GUIDE.md) · [Deutsch](GUIDE.de.md) · [Français](GUIDE.fr.md) · [Español](GUIDE.es.md) · [Português](GUIDE.pt.md) · [Italiano](GUIDE.it.md) · [Türkçe](GUIDE.tr.md) · [Русский](GUIDE.ru.md) · [简体中文](GUIDE.zh-Hans.md) · [العربية](GUIDE.ar.md)

## Reference

The command and option reference lives in the main README:

- [Commands](../README.md#commands): every subcommand and flag.
- [Configuration](../README.md#configuration): what lives under `~/.reeves`.
- [Agent control](../README.md#agent-control): the opt-in model for one agent driving others.

README languages: [English](../README.md) · [Deutsch](../README.de.md) · [Français](../README.fr.md) · [Español](../README.es.md) · [Português](../README.pt.md) · [Italiano](../README.it.md) · [Türkçe](../README.tr.md) · [Русский](../README.ru.md) · [简体中文](../README.zh-Hans.md) · [العربية](../README.ar.md)

## Design and internals

- [Architecture](REEVESAGENTS_DESIGN.md): the canonical design covering the spawner CLI and TUI, the Web UI, and the agent-control MCP.
- [Agent Control MCP](mcp.md): the flat control surface, its tool set, and the off-by-default install model.

## Contributing

- [Contributing guide](../.github/CONTRIBUTING.md): how to propose a change.
- [Branching model](branching.md): `master`, the stable release line, and short-lived work branches.
- [Testing](testing.md): isolation rules and how to run the suites.
- [Releasing](releasing.md): convention-driven releases from commit history.
- [Security policy](../.github/SECURITY.md): how to report a vulnerability.
