<p align="center">
  <img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-header.gif" alt="ReevesAgents" width="800" />
</p>

[![npm version](https://img.shields.io/npm/v/reevesagents.svg)](https://www.npmjs.com/package/reevesagents)
[![visits](https://visitor-badge.laobi.icu/badge?page_id=mertkayacs.reevesagents&left_text=visits)](https://github.com/mertkayacs/reevesagents)
[![node](https://img.shields.io/node/v/reevesagents.svg)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/reevesagents.svg)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/mertkayacs/reevesagents/test.yml?branch=master&label=CI)](https://github.com/mertkayacs/reevesagents/actions/workflows/test.yml)

[English](README.md) · **Deutsch** · [Français](README.fr.md) · [Español](README.es.md) · [Português](README.pt.md) · [Italiano](README.it.md) · [Türkçe](README.tr.md) · [Русский](README.ru.md) · [简体中文](README.zh-Hans.md) · [العربية](README.ar.md)

*Lass einen Agenten andere erstellen und steuern. Ein lokaler, tmux-orientierter Arbeitsbereich, um Agenten (Claude Code, Codex, Hermes, DeepSeek, Kimi und mehr) aus einer TUI, Web UI, CLI und MCP heraus zu starten und zu steuern. Keine API-Schlüssel, keine Änderungen an deiner Agent.md oder Claude.md.*

**In mehr als 10 Sprachen!**

GitHub: https://github.com/mertkayacs/reevesagents

Die TUI und die lokale Web UI steuern denselben Run:

![ReevesAgents TUI: Sprachauswahl, Begrüßungsbildschirm und Runs](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-tui.gif)

![ReevesAgents Web UI: ein Live-Run mit mehreren Agenten](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-web.png)

ReevesAgents ist ein kostenloser Open-Source-Workspace-Manager für KI-CLI-Agenten. Führe
mehrere gleichzeitig aus und lass über MCP einen Agenten andere starten und steuern: einen
Claude-Code-Agenten, der Codex- und Claude-Code-Agenten an getrennten Issues verwaltet. Setze
jede CLI dort ein, wo sie am stärksten ist, zum Beispiel DeepSeek im Backend, Claude für Produkt-
und Web-Ausrichtung, Codex für ein Design-System oder einen Implementierungsdurchlauf und Hermes
für Mail, Suche oder Recherche.

Die UI ist in 10 Sprachen verfügbar: Englisch, Deutsch, Französisch, Spanisch,
Portugiesisch, Italienisch, Türkisch, Russisch, vereinfachtes Chinesisch und Arabisch.

## Oberflächen

| Oberfläche | Wofür sie gut ist |
| --- | --- |
| **TUI** | Schnelle, tastaturorientierte Steuerung direkt im Terminal. |
| **Web UI** | Eine visuelle Ansicht von Runs, Agenten, Live-Panes und Verlauf. |
| **CLI** | Skripte, schnelle spawn-Befehle, doctor-Prüfungen und das Öffnen von tmux. |
| **tmux** | Echte Provider-CLI-Fenster, die lokal weiterlaufen. |
| **Agent Control (opt-in)** | Eine MCP, die du pro CLI aktivierst, damit ein Agent andere starten und steuern kann (Claude Code, das gleichzeitig Codex-, Hermes- und Claude-Code-Agenten ausführt). |

## Warum ReevesAgents

- **Lass deinen Agenten Agenten steuern.** Deine leitende CLI (etwa Claude Code) startet und lenkt eine Reihe von Claude-, Codex-, DeepSeek-, Hermes-, OpenCode- oder anderen Agenten über MCP.
- **Multitasking und Schleifen.** Stelle Agenten mit orchestrierungsbasierten Runs zusammen und setze ein Router-Modell mit niedrigen bis mittleren Kosten davor, um klügere oder kleinere Modelle zu steuern. Führe mehrere parallel an verschiedenen Teilen eines Projekts aus, halte Agenten in Schleifen am Laufen und beobachte die gesamte Orchestrierung aus einer Ansicht.
- **Halte die Kosten praktikabel.** Lass günstige oder kostenlose Modelle CRUDs und Tests schreiben, während du mit einem größeren planst und entwirfst, statt alles durch ein einziges teures Standardmodell zu schieben.
- **Ein Arbeitsbereich, kein verlorener Faden.** Wenn du ohnehin zwischen Claude, Codex, DeepSeek, Hermes oder OpenCode wechselst, bündelt ReevesAgents diese Sitzungen an einem lokalen Ort; öffne jeden Agenten aus der TUI oder Web UI, um ihn direkt zu steuern.
- **Bleib anbieterflexibel.** Das Provider-Login bleibt bei jeder CLI. ReevesAgents speichert niemals Zugangsdaten und leitet keinen Modell-Traffic weiter, sodass du CLIs frei hinzufügen, entfernen oder wechseln kannst.
- **Sieh die Arbeit auf einen Blick.** Aktive Runs, Agenten, Modelle, Berechtigungsmodi, Stopp- und Löschaktionen sowie Verlauf in einer Web-UI-Ansicht, während tmux die echten CLIs am Leben hält.

Dies ist keine Cloud-Agenten-Plattform. Es ist eine kleine lokale Schicht um echte CLIs: keine Datenbank, kein Docker, kein Hintergrund-Daemon und keine von ReevesAgents gespeicherten API-Schlüssel.

## Installation

ReevesAgents wird auf npm als `reevesagents` veröffentlicht. Installiere es global mit dem
Paketmanager, den du bereits nutzt, und überprüfe die Maschine anschließend mit `doctor`.

```sh
npm install -g reevesagents
reevesagents doctor
reevesagents
```

Um eine Version festzulegen, hänge `@<version>` an den Paketnamen an, zum Beispiel
`npm install -g reevesagents@1.2.0`.

<details>
<summary><b>pnpm</b></summary>

```sh
pnpm add -g reevesagents
reevesagents doctor
reevesagents
```

Einmalig, ohne globale Installation:

```sh
pnpm dlx reevesagents doctor
```

</details>

<details>
<summary><b>Yarn</b></summary>

Einmalig mit Yarn (Berry):

```sh
yarn dlx reevesagents doctor
```

Globale Installation mit Yarn Classic:

```sh
yarn global add reevesagents
reevesagents doctor
reevesagents
```

</details>

<details>
<summary><b>Bun</b></summary>

```sh
bun add -g reevesagents
reevesagents doctor
reevesagents
```

Einmalig, ohne globale Installation:

```sh
bunx reevesagents doctor
```

</details>

<details>
<summary><b>npx (ohne Installation)</b></summary>

```sh
npx reevesagents doctor
```

</details>

<details>
<summary><b>Homebrew</b></summary>

```sh
brew tap mertkayacs/reevesagents
brew install reevesagents
reevesagents doctor
reevesagents
```

</details>

<details>
<summary><b>Aus dem Quellcode</b></summary>

Nutze den Quellcode, wenn du den Code inspizieren, beitragen oder direkt aus dem
Repository heraus arbeiten möchtest.

```sh
git clone https://github.com/mertkayacs/reevesagents.git
cd reevesagents
pnpm install
pnpm build
pnpm link --global
reevesagents doctor
reevesagents
```

</details>

## Voraussetzungen

ReevesAgents ist local-first. Es setzt eine normale Entwicklermaschine voraus, auf der tmux und
mindestens eine Provider-CLI bereits installiert sind.

- macOS, Linux oder WSL. Natives Windows ist nicht die Ziellaufzeitumgebung; nutze WSL.
- Node.js `20.19+`.
- tmux. Version `3.0+` wird empfohlen.
- Eine normale interaktive Shell auf dem `PATH`.
- Mindestens eine unterstützte Provider-CLI auf dem `PATH`.

ReevesAgents kann diese Provider-CLIs starten, wenn sie auf deiner Maschine installiert und
authentifiziert sind: Claude Code, Codex CLI, OpenCode, Hermes, Kimi,
DeepSeek, Pi, Qwen und Aider. Provider-Login, Modelle, Tools, Kontingente und
Berechtigungsabfragen bleiben bei jedem Provider. ReevesAgents speichert keine
Provider-API-Schlüssel und leitet keinen Modell-Traffic weiter.

## Schnellstart

```sh
reevesagents                 # die TUI starten
reevesagents web             # die lokale Web UI öffnen
reevesagents doctor          # die Maschine prüfen
```

Starte einen benannten Run aus der CLI. Die erste Spec ist der Lead, der Rest sind
Worker, und jede Spec lautet `provider[:nickname[:model]]`:

```sh
reevesagents spawn deepseek:backend claude-code:product codex:system hermes:research \
  --name "launch week build" \
  --prompt "Plan the backend, product surface, design system, and research notes."
```

## Befehle

Ohne Argumente startet die TUI. Die Subcommands sind die Bedienoberfläche für
Menschen und Skripte.

| Befehl | Zweck | Wichtige Flags |
| --- | --- | --- |
| `reevesagents` | Die TUI starten (kein Subcommand). | keine |
| `spawn [spec...]` | Einen Run mit einem oder mehreren Provider-Agenten starten. Jede `spec` lautet `provider[:nickname[:model]]`. Die erste Spec ist der Lead, der Rest sind Worker. Ohne Spec wird `codex` als Standard verwendet. | `--name <name>` (Standard `run`), `--cwd <dir>` (Standard aktuelles Verzeichnis), `--prompt <text>` (in jeden Agenten eingefügt) |
| `runs` | Aktive Runs auflisten, einen pro Zeile. | `--json` (vollständige Run-Datensätze als JSON-Array) |
| `open <id>` | tmux zum Reeves-Fenster eines Runs oder zu einem Agentenfenster wechseln. Innerhalb von tmux wird gewechselt; außerhalb von tmux auf einem TTY wird verbunden; ansonsten wird ein einfügbarer tmux-Befehl ausgegeben. Akzeptiert eine Run-id/-name oder eine Agenten-id/-nickname (Präfix-Übereinstimmung erlaubt). | keine |
| `peek <agent-id>` | Aktuelle Ausgabe eines Agenten ausgeben. | `-n, --lines <n>` (Standard `20`), `--json` (Zeilen als Array) |
| `stop <run-id>` | Einen Run stoppen. | `-y, --yes` (oder `ALLOW_DESTRUCTIVE=1`) |
| `kill <agent-id>` | Einen Agenten stoppen. | `-y, --yes` (oder `ALLOW_DESTRUCTIVE=1`) |
| `doctor` | Health-Checks der Umgebung ausführen (Node, tmux, State-Pfad, Provider-CLIs). Beendet sich bei jeder fehlgeschlagenen Prüfung mit einem Wert ungleich null. | `--json` |
| `web` | Die bedarfsorientierte, nur auf Loopback gebundene Web UI starten. Läuft im Vordergrund; Agenten laufen weiter, nachdem du sie gestoppt hast. | `--port <n>` (bevorzugter Port, fällt auf den nächsten freien Port zurück), `--no-open` (den Browser nicht öffnen) |
| `mcp` | Den Agent-Control-MCP-Server über stdio starten. Nicht von Hand auszuführen; die CLI, an die du ihn vom Agent-Control-Bildschirm aus anhängst, führt ihn aus. | keine |

`stop` und `kill` sind die einzigen destruktiven Befehle. Sie verweigern die Ausführung ohne
`--yes` oder `ALLOW_DESTRUCTIVE=1`.

## Agent Control (opt-in MCP)

ReevesAgents bringt einen optionalen MCP-Server mit, der einer KI-CLI erlaubt, andere
KI-CLIs zu starten und zu steuern: einen Agenten starten, einen Prompt einfügen, Tasten senden,
Ausgabe lesen und Genehmigungsanfragen auflösen. Es ist ein flacher Mechanismus, keine
Orchestrierungsrichtlinie: keine Rollen, keine autonomen Schleifen, kein Koordinationsprotokoll.

Es ist standardmäßig aus. ReevesAgents hängt es niemals von selbst an eine CLI an.

Du aktivierst es über den Bildschirm **Agent control** in der TUI oder der Web UI. Dieser
Bildschirm listet die CLIs auf dieser Maschine auf, die einen MCP-Server hosten können (claude,
codex, kimi, qwen, opencode, hermes), und erlaubt dir, anzuhängen, zu trennen oder alle anzuhängen.
Das Anhängen führt den eigenen `mcp add`-Befehl dieser CLI aus (zum Beispiel
`claude mcp add reevesagents -- reevesagents mcp`); das Trennen führt das passende
remove aus. ReevesAgents ruft nur den jeweils eigenen Befehl jeder CLI auf und bearbeitet niemals
Provider-Konfigurationsdateien von Hand. OpenCode ist die Ausnahme: sein `mcp add` ist interaktiv
und hat kein remove, daher markiert der Bildschirm es als von Hand anzuhängen.

Sobald eine CLI angehängt ist, verfügt sie bei jedem Start über die Agent-Control-Tools.
Die Installation ist deine ausdrückliche Wahl, und diese Wahl ist die Zustimmung. Ein Run
besteht aus der steuernden CLI als Kopf plus den von ihr gestarteten Agenten, und die gesamte
Gruppe erscheint in der TUI und Web UI wie jeder andere Run.

Gestartete Worker erhalten die MCP standardmäßig nicht, sodass sie keine weiteren
Agenten starten können. Um einem Worker zu erlauben, eigene Sub-Worker zu steuern, hänge die MCP
über denselben Bildschirm an die CLI dieses Workers an. Die Leitplanken sitzen auf Ressourcenebene: eine
Agenten-Obergrenze pro Run (`max_agents`), die durchgesetzt wird, wenn das spawn-Tool einem Run etwas hinzufügt,
sowie die Tatsache, dass jeder Agent ein echter CLI-Prozess in seinem eigenen tmux-Pane ist.

Eine angehängte CLI kann außerdem ermitteln, was sie starten kann: das `list_providers`-Tool
und die `reevesagents://providers`-Ressource geben die Provider auf dieser Maschine zurück,
mit ihren ids, Installationsstatus, Aliassen und bekannten Modellen, sodass ein Agent eine
echte id an `spawn` übergibt, statt zu raten.

Siehe [docs/mcp.md](docs/mcp.md) für das vollständige Design und die Tool-Liste.

## Konfiguration

State und Konfiguration sind lokales JSON. Keine Datenbank, kein Daemon.

Der State liegt unter `~/.reeves`:

```text
~/.reeves/
  config.json     globale Einstellungen (peek-Intervall, Sprache, Standardberechtigungen, Limits)
  presets/        gespeicherte Run-Vorlagen
  runs/           ein Ordner pro aktivem Run (run.json plus agents/<id>.json)
  history/        archivierte beendete und veraltete Runs (history/runs/<id>.json)
```

Zwei Umgebungsvariablen überschreiben die Standardwerte, hauptsächlich für isolierte Tests oder
die Nutzung mehrerer Profile:

- `REEVES_REGISTRY`: Überschreibung des State-Roots. Ersetzt `~/.reeves` als Verzeichnis
  für `runs/`, `history/` und `presets/`.
- `REEVES_CONFIG`: Überschreibung des Konfigurationsdateipfads. Ersetzt `~/.reeves/config.json`.

Textfelder, die Geheimnisse enthalten können, werden unkenntlich gemacht, bevor sie in den State geschrieben werden.

## Beispiele

Verteile ein Projekt auf die CLIs, die zu jeder Aufgabe passen:

```sh
reevesagents spawn deepseek:backend claude-code:product codex:review \
  --name "feature x" --prompt "Backend, product copy, and a review pass."
```

Liste auf, was aktiv ist, und greife die Run-id ab:

```sh
reevesagents runs
reevesagents runs --json   # skriptfreundlich
```

Beobachte einen einzelnen Agenten, ohne deine Shell zu verlassen, und springe hinein, wenn er dich
braucht:

```sh
reevesagents peek backend -n 40
reevesagents open backend
```

Wenn die Arbeit erledigt ist, stoppe den gesamten Run mit einem Aufruf:

```sh
reevesagents stop "feature x" --yes
```

## Web UI

Die Web UI ist lokal und nur auf Loopback gebunden.

```sh
reevesagents web
```

Sie bindet an `127.0.0.1`, läuft im Vordergrund und beendet sich, wenn du sie stoppst.
Agenten laufen danach in tmux weiter. Aus dem Browser kannst du Runs erstellen, Agenten
hinzufügen, Provider-Modelle und Berechtigungsmodi wählen, Agenten stoppen, beendete
Arbeit löschen und den Verlauf inspizieren, während die echten CLIs weiterlaufen.

Die Web UI nutzt zwei optionale Laufzeitmodule, `ws` und `@lydell/node-pty`. npm
installiert sie standardmäßig. Die CLI und TUI funktionieren auch ohne sie, und der
`web`-Befehl erklärt, was fehlt.

Um die Web UI von einer anderen Maschine zu erreichen, leite den Loopback-Port über SSH weiter.
Es gibt keinen eingebauten Tunnel:

```sh
ssh -L 8080:127.0.0.1:8080 user@host
# dann http://localhost:8080 im Browser öffnen
```

## Fehlerbehebung

**tmux ist nicht installiert.** ReevesAgents benötigt tmux für die fensterbasierte Navigation.
Installiere es (`brew install tmux` oder `apt install tmux`) und führe
`reevesagents doctor` aus. Die TUI wickelt sich automatisch in eine tmux-Sitzung namens
`reeves`; setze `REEVES_NO_TMUX_WRAPPER=1`, um dieses Verhalten zu überspringen.

**Eine Provider-CLI fehlt oder Doctor meldet einen Fehler.** ReevesAgents startet nur
Provider-CLIs, die bereits auf deinem `PATH` und authentifiziert sind. Führe
`reevesagents doctor` aus, um zu sehen, welche Provider erkannt werden und was fehlschlägt,
und installiere dann die benötigte Provider-CLI oder melde dich bei ihr an.

**Die Web UI meldet fehlende Pakete.** Die Web UI benötigt `ws` und
`@lydell/node-pty`. Sie können übersprungen werden, wenn die Plattform kein vorgebautes
`@lydell/node-pty`-Binary hat oder wenn die Installation optionale Abhängigkeiten ausgelassen hat.
Installiere mit aktivierten optionalen Abhängigkeiten neu und führe dann `reevesagents doctor` aus.

**Port bereits in Verwendung.** `reevesagents web` startet standardmäßig auf Port `8080`. Ist
er belegt, bindet der Server den nächsten freien Port in einem kleinen Bereich und gibt die
gewählte URL aus. Übergib `--port <n>`, um einen anderen Startport zu wählen.

## Nicht erforderlich

Du brauchst keine von ReevesAgents gespeicherten API-Schlüssel, keine Datenbank, kein Docker, keinen Hintergrund-
Dienst und kein MCP-Setup für normale, stabile Agenten-Runs. Die Installation ist passiv: das
stabile Paket hat kein postinstall-Skript und schreibt die Provider-Konfiguration nicht um.
Das Anhängen der Agent-Control-MCP ist der eine ausdrückliche, opt-in-Schritt, der die Provider-Konfiguration
berührt, und das nur über den jeweils eigenen `mcp add`-Befehl jeder CLI.

## Mitwirken

Siehe [CONTRIBUTING.md](.github/CONTRIBUTING.md) für Branches und den Pull-Request-Ablauf,
[SECURITY.md](.github/SECURITY.md) für das Melden von Schwachstellen und
[CHANGELOG.md](CHANGELOG.md) für aktuelle Änderungen. Das Designmodell findet sich in
[REEVESAGENTS_DESIGN.md](docs/REEVESAGENTS_DESIGN.md), und die Contributor-Dokumentation liegt
unter [docs/](docs).

Endnutzer brauchen die Entwicklungs-Toolchain nicht. Mitwirkende nutzen pnpm,
TypeScript, tsup, Vitest und ESLint aus dem Repository.

## Links

- npm: https://www.npmjs.com/package/reevesagents
- GitHub: https://github.com/mertkayacs/reevesagents
- Releases: https://github.com/mertkayacs/reevesagents/releases
- Issues: https://github.com/mertkayacs/reevesagents/issues
- Changelog: [CHANGELOG.md](CHANGELOG.md)
- Lizenz: [Apache-2.0](LICENSE)

## Lizenz

Apache-2.0
