<p align="center"><a href="https://reevesagents.mertkayacs.com/de/"><img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-banner.png" width="800" alt="ReevesAgents: KI-Coding-Assistenten gemeinsam ausführen"></a></p>

# reevesagents: ein Arbeitsplatz für KI-Coding-Tools

Führe Claude Code, Codex, Kimi, OpenCode, Hermes und andere KI-Coding-Tools nebeneinander auf deinem Rechner aus. reevesagents hält ihre Terminal-Sitzungen zusammen: Du siehst, was jedes Tool tut, schickst Anweisungen und stoppst einen Run an einer Stelle.

<img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-hero.webp" width="720" alt="Eine goldgerahmte Leitscheibe, über feine Goldfäden mit acht leuchtenden Glasscheiben verbunden, eine für jedes Tool im Run">

[Zur Demo](https://reevesagents.mertkayacs.com/de/demo/) oder unten das Kommandozeilen-Tool installieren.

## Schnellstart

Voraussetzungen: Node.js 20.19 oder neuer, tmux 3.0 oder neuer und ein installiertes, angemeldetes KI-Coding-Tool. Läuft auf macOS, Linux und WSL. Dank tmux laufen die Tools weiter, wenn du die Oberfläche schließt.

```sh
npm install -g reevesagents && reevesagents doctor && reevesagents
```

Damit öffnet sich die Terminal-Oberfläche. Die Browser-Oberfläche startest du mit `reevesagents web`; sie ist nur über die Loopback-Adresse deines Rechners erreichbar.

## Ein Team starten

Starte einen Run und gib den Tools eine Aufgabe:

```sh
reevesagents spawn claude-code:lead codex:tests --name "review" --prompt "Prüfe den Code und die Tests."
```

In der Terminal- oder Browser-Oberfläche liest du die Ausgaben und steuerst jedes Tool. Jeder Anbieter nutzt sein eigenes Login und schickt seine eigenen Modellanfragen. Der Zustand eines Runs liegt als JSON unter `~/.reeves`.

<img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-newrun-de.png" width="720" alt="Web UI von reevesagents beim Start eines neuen Runs: Run-Name, Auswahl der Tools wie Claude Code, Codex CLI und Kimi Code, Modell und Berechtigungsmodus">

## Ein Tool steuert die anderen

Verbinde den optionalen MCP-Server (Model Context Protocol, eine Standardverbindung zwischen KI-Tools) mit einem Host, dem du vertraust:

```sh
reevesagents attach claude && reevesagents hosts
```

Starte den Host neu, damit er die Verbindung lädt. Danach kann er andere Tools starten, lesen, steuern und stoppen. Worker bekommen standardmäßig keine MCP-Verbindung. Lass die Berechtigungsabfragen der Anbieter eingeschaltet und prüfe Freigaben vor heiklen Aktionen.

In Claude Code installierst du die Verbindung samt Bedienanleitung als Plugin:

```sh
claude plugin marketplace add mertkayacs/reevesagents
claude plugin install reevesagents@reevesagents
```

Für andere Hosts liefert der [reevesagents-Skill](https://github.com/mertkayacs/reevesagents-skill) die Bedienanleitung. Tools und Host-Anforderungen beschreibt die [MCP-Referenz](../mcp.md).

Der Server ist in der [offiziellen MCP Registry](https://registry.modelcontextprotocol.io/?q=io.github.mertkayacs/reevesagents) als `io.github.mertkayacs/reevesagents` eingetragen.

<img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-steer.webp" width="560" alt="Eine goldgerahmte Leitscheibe schickt über Goldfäden Nachrichten an drei andere Scheiben">

## Oberfläche wählen

| Oberfläche | Zweck |
| --- | --- |
| Terminal-UI | Runs per Tastatur prüfen und steuern |
| Web UI | Runs, Live-Ausgabe, Freigaben und Verlauf im Browser prüfen |
| Kommandozeile | Runs aus Skripten starten und Ausgaben lesen |
| MCP-Server | Ein vertrauenswürdiges KI-Coding-Tool steuert ein Team |

<details>
<summary>Screenshot der Web UI</summary>

<img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-web-de.png" width="720" alt="Web UI von reevesagents vor dem ersten Run: leere Agentenliste, Schaltflächen für einen neuen Run sowie Sprach- und Einstellungsregler">

</details>

## Dokumentation

- [Benutzerhandbuch](https://reevesagents.mertkayacs.com/de/docs/): Installation, Befehle und Konfiguration.
- [FAQ](https://reevesagents.mertkayacs.com/de/faq/): Einrichtung der Anbieter und Fehlerbehebung.
- [MCP-Referenz](../mcp.md): Tools und Host-Verbindungen (auf Englisch).
- [Mitwirken](../../.github/CONTRIBUTING.md), [Tests](../testing.md) und [Changelog](../../CHANGELOG.md) (auf Englisch).

Andere Sprachen: [English](../../README.md), [Français](README.fr.md), [Español](README.es.md), [Português](README.pt.md), [Italiano](README.it.md), [Türkçe](README.tr.md), [Русский](README.ru.md), [简体中文](README.zh-Hans.md), [العربية](README.ar.md).

## Lizenz

[Apache-2.0](../../LICENSE). Erhältlich auf [npm](https://www.npmjs.com/package/reevesagents).

<a href="https://eschatialabs.com"><picture><source media="(prefers-color-scheme: dark) and (min-resolution: 2dppx)" srcset="https://eschatialabs.com/brand/lockup-46-dark@2x.png"><source media="(prefers-color-scheme: dark)" srcset="https://eschatialabs.com/brand/lockup-46-dark@1x.png"><source media="(min-resolution: 2dppx)" srcset="https://eschatialabs.com/brand/lockup-46@2x.png"><img src="https://eschatialabs.com/brand/lockup-46@1x.png" width="124" height="46" alt="Eschatia Labs"></picture></a><br>Ein Projekt von [Eschatia Labs](https://eschatialabs.com), entwickelt von [Mert Kaya](https://mertkayacs.com).
