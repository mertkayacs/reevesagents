<p align="center">
  <a href="https://reevesagents.mertkayacs.com">
    <img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-header.gif" alt="ReevesAgents" width="800" />
  </a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/reevesagents"><img src="https://img.shields.io/npm/v/reevesagents.svg" alt="npm version" /></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/node/v/reevesagents.svg" alt="node" /></a>
  <a href="../../LICENSE"><img src="https://img.shields.io/npm/l/reevesagents.svg" alt="license" /></a>
  <a href="https://github.com/mertkayacs/reevesagents/actions/workflows/test.yml"><img src="https://img.shields.io/github/actions/workflow/status/mertkayacs/reevesagents/test.yml?branch=master&label=CI" alt="CI" /></a>
</p>

<p align="center">
  <a href="https://reevesagents.mertkayacs.com/demo"><b>Demo</b></a> ·
  <a href="https://reevesagents.mertkayacs.com/docs"><b>Doku</b></a> ·
  <a href="https://reevesagents.mertkayacs.com/faq"><b>FAQ</b></a> ·
  <a href="https://github.com/mertkayacs/reevesagents/issues"><b>Issues</b></a>
</p>

[English](../../README.md) · **Deutsch** · [Français](README.fr.md) · [Español](README.es.md) · [Português](README.pt.md) · [Italiano](README.it.md) · [Türkçe](README.tr.md) · [Русский](README.ru.md) · [简体中文](README.zh-Hans.md) · [العربية](README.ar.md)

ReevesAgents ist ein lokaler Workspace für KI-Coding-CLIs. Es lässt Claude Code,
Codex, OpenCode, Hermes, Kimi, DeepSeek, Qwen, Pi, Aider und weitere
Anbieter-CLIs nebeneinander in tmux laufen. Du kannst es als ganz normale
CLI/TUI/Web UI nutzen oder seinen Opt-in-MCP anhängen, damit ein Agent die
übrigen starten, auslesen, lenken und stoppen kann.

Das Login bleibt in der jeweiligen Anbieter-CLI. ReevesAgents legt seinen eigenen Zustand
in ein paar einfachen JSON-Dateien unter `~/.reeves` ab und läuft nur, solange du oder eine
angehängte CLI es nutzt.

## Schnellstart

```sh
pnpm add -g reevesagents
reevesagents doctor
reevesagents
```

Einen Run aus der CLI starten:

```sh
reevesagents spawn claude-code:lead codex:tests hermes:research \
  --name "release check" \
  --prompt "Review the release path, test coverage, and docs."
```

Die Web UI öffnen:

```sh
reevesagents web
```

Einen angehängten Agenten die anderen steuern lassen:

```sh
reevesagents attach codex
reevesagents hosts
```

Starte diese CLI nach dem Anhängen neu, damit sie die MCP-Tools lädt.

## Was du bekommst

| Oberfläche | Wofür |
| --- | --- |
| **TUI** | Run-Steuerung per Tastatur, direkt im Terminal. |
| **Web UI** | Lokale, visuelle Ansicht von Runs, Panes, Agenten, Freigaben und Verlauf. |
| **CLI** | Skripte, Smoke-Checks, Agenten starten, State aufräumen und in tmux springen. |
| **Agentensteuerung (MCP)** | Eine vertrauenswürdige CLI startet und steuert andere CLIs über lokale Tools. |
| **tmux** | Echte Fenster der Anbieter-CLIs, die weiterlaufen, wenn die UI geschlossen ist. |

ReevesAgents ist bewusst lokal gebaut. Der State liegt als reines JSON unter
`~/.reeves`, und die CLIs, die es startet, sind dieselben, die du sonst von Hand
benutzt.

<a id="install"></a>
<details>
<summary><strong>Installation</strong></summary>

ReevesAgents braucht Node.js `20.19+`, tmux `3.0+` und mindestens eine
unterstützte Anbieter-CLI, die installiert und eingeloggt ist. Es läuft auf
macOS, Linux und WSL.

```sh
# Homebrew
brew tap mertkayacs/reevesagents
brew install reevesagents

# pnpm
pnpm add -g reevesagents

# npm
npm install -g reevesagents

# one-shot checks
pnpm dlx reevesagents doctor
npx reevesagents doctor
```

Eine bestimmte Version pinnst du, indem du `<version>` ersetzt:

```sh
pnpm add -g reevesagents@<version>
```

Installation aus dem Quellcode:

```sh
git clone https://github.com/mertkayacs/reevesagents.git
cd reevesagents
pnpm install
pnpm build
pnpm link --global
reevesagents doctor
```

</details>

<a id="screenshots"></a>
<details>
<summary><strong>Screenshots</strong></summary>

TUI und Web UI steuern dieselben lokalen Runs:

![ReevesAgents TUI: Sprachauswahl, Startmenü und Doctor](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-tui.gif)

![ReevesAgents Web UI: Runs und Live-Panes der Agenten](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-web-de.png)

![ReevesAgents Web UI: einen neuen Run starten](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-newrun-de.png)

</details>

<a id="commands"></a>
<details>
<summary><strong>Befehle</strong></summary>

Ohne Argumente startet die TUI.

| Befehl | Zweck |
| --- | --- |
| `reevesagents` | Startet die TUI. |
| `spawn [spec...]` | Startet einen Run. Jede Spec hat die Form `provider[:nickname[:model]]`. |
| `add [spec...]` | Fügt dem jüngsten aktiven Run Agenten hinzu. |
| `runs` | Listet aktive Runs auf. |
| `agents [run-id]` | Listet Agenten über alle Runs hinweg oder innerhalb eines Runs auf. |
| `open <id>` | Springt ins tmux-Fenster eines Runs oder Agenten. |
| `peek <agent-id>` | Zeigt die letzte Ausgabe eines Agenten. |
| `send <agent-id> <text...>` | Fügt Text bei einem Agenten ein, ohne ihn abzuschicken. |
| `key <agent-id> <key>` | Sendet `enter`, `escape`, Pfeiltasten, `tab`, `space`, `backspace` oder `ctrl-c`. |
| `interrupt <agent-id>` | Sendet Ctrl-C an einen Agenten. |
| `stop <run-id>` | Stoppt einen Run. Braucht `--yes` oder `ALLOW_DESTRUCTIVE=1`. |
| `kill <agent-id>` | Stoppt einen Agenten. Braucht `--yes` oder `ALLOW_DESTRUCTIVE=1`. |
| `setup` | Prüfung beim ersten Start. `--attach` verbindet jede installierte Host-CLI. |
| `doctor` | Prüft Node, tmux, State und Anbieter-CLIs. |
| `web` | Startet die Web UI, die nur auf Loopback lauscht. |
| `providers` | Listet Anbieter-IDs, Aliasse, Modelle und Verfügbarkeit auf. |
| `approvals` | Listet offene Freigabeanfragen auf. |
| `approve` / `deny` | Entscheidet eine Freigabeanfrage. |
| `hosts` | Zeigt, an welchen Host-CLIs ReevesAgents hängt. |
| `attach [cli]` | Verbindet den MCP der Agentensteuerung mit einer Host-CLI oder mit allen installierten Hosts. |
| `detach <cli>` | Entfernt diese MCP-Verbindung wieder aus einer Host-CLI. |
| `skills [action]` | Installiert, entfernt oder prüft den ReevesAgents-Skill. |
| `mcp` | Startet den MCP-Server über stdio. Das übernehmen die Host-CLIs. |
| `config [key] [value]` | Zeigt oder ändert editierbare Einstellungen. |
| `presets` | Listet gespeicherte Run-Presets auf. |
| `save-preset` | Speichert einen laufenden Run als Preset. |
| `start-preset` | Startet einen Run aus einem Preset. |
| `delete-preset` | Löscht ein Preset. |
| `delete` | Löscht den Eintrag eines beendeten Agenten. Fragt vorher nach. |
| `delete-run` | Löscht einen beendeten Run und archiviert ihn. Fragt vorher nach. |
| `history` | Listet archivierte Runs auf. |
| `delete-history` | Löscht einen archivierten Verlaufseintrag. Fragt vorher nach. |
| `reap` | Beendet Zombie-Agenten und Agenten, deren Laufzeit `max_lifetime_ms` überschritten hat, und räumt verwaiste tmux-Sessions ab, zu denen kein Run-Eintrag gehört. |

Häufige Flags:

- `--json`: bei den Listen- und Aktionsbefehlen, die Skripte nutzen.
- `--name <name>`: gibt einem Run einen Namen.
- `--cwd <dir>`: startet die Agenten in einem bestimmten Verzeichnis.
- `--prompt <text>`: fügt jedem gestarteten Agenten einen Starttext ein.
- `--skip`: überspringt die Berechtigungsabfragen der Anbieter, für unbeaufsichtigte Worker.
- `--run <run-id>`: fügt Agenten einem bestimmten Run hinzu.
- `--port <n>` und `--no-open`: Startoptionen der Web UI.

</details>

<a id="agent-control"></a>
<details>
<summary><strong>Agentensteuerung</strong></summary>

Die Agentensteuerung ist ein optionaler MCP-Server. Häng ihn nur an eine CLI,
der du die Steuerung lokaler Tools anvertraust:

```sh
reevesagents attach claude
reevesagents hosts
```

Nach dem Neustart bekommt diese CLI Tools für `spawn`, `read`, `send_text`,
`send_key`, `interrupt`, `kill` und `stop`, dazu Tools, um Freigaben und Presets
zu verwalten und die Hosts zu prüfen. Den Anbieterkatalog gibt es außerdem als
`reevesagents://providers`.

Worker bekommen den MCP standardmäßig nicht. Soll ein Worker eigene Worker
starten, hängst du ReevesAgents ausdrücklich an die CLI dieses Workers.

Codex führt MCP-Aufrufe standardmäßig in einer Sandbox aus, und die blockiert
tmux-Starts. Wenn Codex als Host die Agenten steuert, starte es mit vollem
Zugriff, etwa mit `codex --sandbox danger-full-access`, oder nutze ein
Codex-Profil mit `sandbox_mode = "danger-full-access"`.

Vollständige Tool-Referenz: [docs/mcp.md](../mcp.md). Anleitung für Agenten:
[AGENTS.de.md](../../AGENTS.de.md).

</details>

<a id="configuration"></a>
<details>
<summary><strong>Konfiguration</strong></summary>

Der State liegt unter `~/.reeves`:

```text
~/.reeves/
  config.json
  presets/
  runs/
  history/
```

Zwei Umgebungsvariablen überschreiben die Standardpfade:

- `REEVES_REGISTRY`: ersetzt das State-Verzeichnis für `runs/`, `history/` und `presets/`.
- `REEVES_CONFIG`: ersetzt den Pfad der Konfigurationsdatei.

Eine Registry pro tmux-Server: Der Hintergrundlauf, der verwaiste Sessions
aufräumt, entscheidet anhand der aktuellen Registry, wem eine Session gehört.
Zwei Registries dürfen sich deshalb keinen tmux-Server teilen.

Alles, was ein Secret enthalten könnte, wird bereinigt, bevor es in eine Datei
geschrieben wird.

</details>

<a id="examples"></a>
<details>
<summary><strong>Beispiele</strong></summary>

Ein Projekt auf mehrere CLIs verteilen:

```sh
reevesagents spawn deepseek:backend claude-code:product codex:review \
  --name "feature x" \
  --prompt "Backend, product copy, and a review pass."
```

Einem Agenten zuschauen und dann sein Fenster öffnen:

```sh
reevesagents peek backend -n 40
reevesagents open backend
```

Den Run stoppen, wenn die Arbeit erledigt ist:

```sh
reevesagents stop "feature x" --yes
```

</details>

<a id="web-ui"></a>
<details>
<summary><strong>Web UI</strong></summary>

```sh
reevesagents web
```

Die Web UI bindet ausschließlich an `127.0.0.1` und läuft im Vordergrund. Die
Agenten laufen weiter, wenn du die Seite schließt, denn sie leben in tmux.

Die Web UI nutzt die optionalen Laufzeitmodule `ws` und `@lydell/node-pty`. npm
installiert sie standardmäßig mit. CLI- und TUI-Befehle funktionieren auch ohne
sie, und `reevesagents web` erklärt, was fehlt.

Von einem anderen Rechner aus erreichst du sie, indem du den Loopback-Port per
SSH weiterleitest:

```sh
ssh -L 8080:127.0.0.1:8080 user@host
```

</details>

<a id="troubleshooting"></a>
<details>
<summary><strong>Fehlerbehebung</strong></summary>

**tmux ist nicht installiert.** Installiere tmux und führe `reevesagents doctor`
aus. Die TUI packt sich automatisch in eine tmux-Session namens `reeves`; mit
`REEVES_NO_TMUX_WRAPPER=1` schaltest du das ab.

**Eine Anbieter-CLI fehlt oder ist abgemeldet.** ReevesAgents startet
Anbieter-CLIs, die bereits auf dem `PATH` liegen und eingeloggt sind.
`reevesagents doctor` zeigt, was erkannt wurde. Wartet ein gestartetes Fenster
auf ein Login, siehst du das mit `peek`.

**Die Web UI meldet fehlende Pakete.** Installiere mit aktivierten optionalen
Abhängigkeiten neu und führe danach `reevesagents doctor` aus.

**Der Port ist schon belegt.** `reevesagents web` startet standardmäßig auf
`8080`. Ist der Port belegt, nimmt der Server den nächsten freien aus einem
kleinen Bereich und gibt die URL aus.

</details>

<a id="contributing"></a>
<details>
<summary><strong>Mitwirken</strong></summary>

Die Doku für Mitwirkende liegt unter [docs/](..). Fang mit
[CONTRIBUTING.md](../../.github/CONTRIBUTING.md), [Tests](../testing.md) und
[Releases](../releasing.md) an.

Wer ReevesAgents nur nutzt, braucht die Entwicklungs-Toolchain nicht. Mitwirkende
arbeiten im Repository mit pnpm, TypeScript, tsup, Vitest und ESLint.

</details>

## Links

- Website: https://reevesagents.mertkayacs.com
- npm: https://www.npmjs.com/package/reevesagents
- GitHub: https://github.com/mertkayacs/reevesagents
- Releases: https://github.com/mertkayacs/reevesagents/releases
- Issues: https://github.com/mertkayacs/reevesagents/issues
- Changelog: [CHANGELOG.md](../../CHANGELOG.md)
- Lizenz: [Apache-2.0](../../LICENSE)
