# AGENTS.md

[English](AGENTS.md) · **Deutsch** · [Français](AGENTS.fr.md) · [Español](AGENTS.es.md) · [Português](AGENTS.pt.md) · [Italiano](AGENTS.it.md) · [Türkçe](AGENTS.tr.md) · [Русский](AGENTS.ru.md) · [简体中文](AGENTS.zh-Hans.md) · [العربية](AGENTS.ar.md)

Wie ein KI-Coding-Agent ReevesAgents bedient. Diese Datei ist die Betreiberanleitung für
das Werkzeug selbst. Sie ändert nichts daran, wie sich Agenten in deinen eigenen Projekten
verhalten.

ReevesAgents führt KI-Coding-CLIs (Claude Code, Codex, Kimi, Qwen, OpenCode, Hermes
und andere) nebeneinander aus, jede als echte CLI in ihrem eigenen tmux-Fenster. Ein Agent
kann die übrigen spawnen, steuern und beaufsichtigen. Der State liegt als lokales JSON
unter `~/.reeves`. Keine API-Schlüssel, keine Datenbank, kein Hintergrund-Daemon.

## Zwei Wege, es zu nutzen

1. **Steuere die CLI direkt.** Führe `reevesagents spawn ...` aus, um Agenten zu starten,
   dann `runs`, `peek`, `send` und `stop`, um sie zu beobachten und zu lenken. Gut für
   Skripte und einmalige Orchestrierung.
2. **Lass deine Host-CLI andere über MCP steuern.** `reevesagents attach <cli>` gibt dieser
   CLI einen Satz Agent-Control-Tools (spawn, send_text, read, kill, ...). Nach einem
   Neustart der CLI kann eine einzelne Sitzung ein Team starten und dirigieren. Das ist die
   Kernfunktion. Siehe [docs/mcp.md](docs/mcp.md).

## Erst der Setup-Check

```sh
reevesagents doctor
```

Meldet tmux, Node, das State-Verzeichnis `~/.reeves` und welche Provider-CLIs installiert
und CLI-kompatibel sind (dazu inspiziert es das `--help` jeder CLI). Ob eine CLI angemeldet
ist, kann es nicht prüfen; eine installierte, aber abgemeldete CLI besteht hier also trotzdem.
Führe es vor dem Spawnen aus, damit ein Run nicht an einer fehlenden CLI scheitert; `peek`
(unten) entlarvt ein Fenster, das an einem Login-Bildschirm hängt. `reevesagents doctor --json`
liefert dasselbe als maschinenlesbares JSON.

Voraussetzungen: Node 20.19+, tmux 3.0+ und mindestens eine Provider-CLI, installiert und
authentifiziert. macOS, Linux oder WSL (natives Windows ist kein Ziel).

## Installation

```sh
pnpm add -g reevesagents     # oder: npm install -g reevesagents
```

Ohne Installation: `pnpm dlx reevesagents doctor`.

## Agenten spawnen

Jeder Agent wird als `provider[:nickname[:model]]` geschrieben; nickname und model sind
optional. Der erste Agent führt den Run an; die übrigen kommen als Worker dazu.

```sh
# Ein Claude-Code-Lead, ein zweiter Claude-Code-Reviewer, zwei Codex-Worker, ein Kimi-Worker.
reevesagents spawn cc:lead cc:review codex:api codex:tests kimi:docs \
  --name "feature x" --skip \
  --prompt "Build feature X. Lead coordinates; each worker takes a slice."
```

Bevor `spawn` irgendetwas startet, prüft es, ob jede genannte Provider-CLI auf dem PATH
liegt, und nennt alle fehlenden. Ein Tippfehler oder eine nicht installierte CLI schlägt so
sofort fehl, statt einen Run halb zu starten. Bei Erfolg gibt es die Run-id, die id jedes
Agenten und die genauen `peek`/`send`/`open`-Befehle zum Steuern aus.

Nützliche `spawn`-Flags: `--name <run>`, `--cwd <dir>` (Standard: aktuelles Verzeichnis),
`--prompt <text>` (wird beim Start in jeden Agenten eingefügt), `--skip` (Agenten ohne ihre
eigenen Berechtigungsabfragen starten; nutze es, wenn kein Mensch zum Genehmigen da ist),
`--run <run-id>` (Agenten einem bestehenden Run hinzufügen, statt einen neuen zu starten),
`--json` (Run- und Agenten-ids als JSON statt Text ausgeben).

## Provider-ids und Aliasse

Führe `reevesagents providers` aus (mit `--json` für eine Maschinenliste). Jeder Alias
funktioniert als Provider in einer spawn-Spec.

| id         | provider     | gängige Aliasse             |
| ---------- | ------------ | --------------------------- |
| `cc`       | Claude Code  | `claude`, `claude-code`     |
| `codex`    | Codex CLI    | `codex-cli`                 |
| `kimi`     | Kimi Code    | `kimi-code`                 |
| `qwen`     | Qwen Code    | `qwen-code`                 |
| `opencode` | OpenCode CLI | `open_code`                 |
| `hermes`   | Hermes       |                             |
| `pi`       | Pi           |                             |
| `aider`    | Aider        |                             |
| `deepseek` | DeepSeek CLI | `deepseek-cli`              |

## Laufende Agenten beobachten und lenken

```sh
reevesagents runs                      # aktive Runs auflisten (mit --json für Skripte)
reevesagents agents <run-id>           # die Agenten eines Runs auflisten
reevesagents peek <agent-id> -n 40     # jüngste Ausgabe eines Agenten
reevesagents send <agent-id> "do X"    # Text am Prompt des Agenten einfügen
reevesagents key <agent-id> enter      # abschicken (send schickt nicht von selbst ab)
reevesagents interrupt <agent-id>      # ctrl-c an den Agenten
reevesagents open <run-id|agent-id>    # zu seinem tmux-Fenster springen
reevesagents approvals                 # offene Freigabeanfragen (mit --json)
reevesagents approve <approval-id>     # eine freigeben; deny <approval-id> lehnt ab
```

`send` fügt nur ein; erst `key <agent-id> enter` schickt ab. Tasten, die `key` akzeptiert:
`enter`, `escape`, `backspace`, `tab`, `space`, `up`, `down`, `left`, `right`,
`ctrl-c`.

## Sauber stoppen

```sh
reevesagents stop <run-id> --yes       # einen ganzen Run beenden und seine tmux-Sitzung abbauen
reevesagents kill <agent-id> --yes     # einen einzelnen Agenten beenden
```

`stop` und `kill` verweigern die Ausführung ohne `--yes`. Dieselbe Sperre gilt fürs
Aufräumen: `delete <agent-id>` und `delete-run <run-id>` entfernen beendete Datensätze,
und `delete-history <id>` entfernt einen archivierten Eintrag.

## Ein durchgespieltes Beispiel: fünf Agenten, dann lenken

Das Szenario "ReevesAgents installieren, zwei Claude-, zwei Codex- und einen Kimi-Agenten
spawnen und sie an die Arbeit setzen" von Anfang bis Ende.

```sh
# 1. Bestätige, dass die fünf CLIs installiert und kompatibel sind.
reevesagents doctor

# 2. Starte das Team. --skip, damit Worker nicht an ihren eigenen Berechtigungsabfragen stehen bleiben.
reevesagents spawn cc:lead cc:review codex:api codex:tests kimi:docs \
  --name "feature x" --skip \
  --prompt "Build feature X. Lead coordinates; each worker owns one slice."

# 3. spawn gibt jede Agenten-id aus. Liste alle auf oder lies einen einzelnen.
reevesagents agents <run-id>
reevesagents peek <agent-id> -n 40

# 4. Lenken: eine Nachricht einfügen, dann abschicken.
reevesagents send <agent-id> "rebase on main, then run the tests"
reevesagents key  <agent-id> enter

# 5. Später einen weiteren Worker in denselben Run hängen.
reevesagents spawn codex:perf --run <run-id> --skip --prompt "profile the hot path"

# 6. Am Ende den Run beenden.
reevesagents stop <run-id> --yes
```

Steuert man dasselbe Szenario von einer Host-CLI über MCP statt über die Shell, ist es eine
einzige Anweisung: "Nutze reevesagents, um ein Team zu starten: einen Claude-Code-Lead,
einen zweiten Claude Code als Reviewer, zwei Codex-Worker (api und tests) und einen
Kimi-Worker für Docs. Überspringe Berechtigungsabfragen, gib ihnen den Auftrag und
beobachte dann den Fortschritt und berichte." Die Host-CLI ruft die spawn/read/send-Tools
selbst auf. Siehe [docs/mcp.md](docs/mcp.md).

## Dos und Don'ts

Dos:

- Führe vor dem Spawnen `doctor` aus und stelle sicher, dass jeder genannte Provider
  installiert **und angemeldet** ist. doctor kann die Anmeldung nicht prüfen; bleibt ein
  Fenster hängen, zeigt `peek` den Login-Bildschirm.
- Behandle `spawn` als Fire-and-forget. Es liefert ids, keine Antworten. Frage mit `runs`,
  `agents <run-id>` und `peek <agent-id> -n 40` nach, was ein Team gerade tut.
- Übermittle Eingaben in zwei Schritten: `send <agent-id> "..."` fügt ein, `key <agent-id> enter` schickt ab.
- Übergib `--skip`, wenn niemand daneben sitzt und Abfragen genehmigt, sonst bleiben Worker an der ersten hängen.
- Nutze `--json` (bei `spawn`, `runs`, `agents`, `providers`, `doctor`), wenn ein Skript oder
  ein Agent ids und State statt Text lesen soll.
- Benenne Provider über die id oder einen beliebigen Alias aus `reevesagents providers` (`cc` oder `claude`, `codex`, `kimi`, ...).

Don'ts:

- Erwarte nicht, dass `spawn` das Ergebnis eines Agenten zurückliefert; starte das Team und lies dann nach.
- Geh nach `send` nicht davon aus, dass etwas lief; nichts wird abgeschickt, bevor du `key <agent-id> enter` sendest.
- Spawne keinen Provider, der fehlt oder abgemeldet ist; beim ersten verweigert spawn den
  Start, beim zweiten bleibt ein Fenster an einem Login-Prompt hängen, und die Arbeit passiert nie.
- Führe `stop`, `kill` oder die `delete`-Befehle nicht ohne `--yes` aus; das sind die destruktiven.
- Ziele nicht auf natives Windows; arbeite in WSL, mit tmux und den CLIs dort installiert.
- Füge keine Geheimnisse in `--prompt` oder `send` ein; die Ausgabe wird mitgeschnitten und über `peek` und die Web UI angezeigt.

## Scripting-Notizen

- `spawn`, `runs`, `agents`, `providers` und `doctor` akzeptieren alle `--json`.
- `spawn --json` gibt die Run-id und jede Agenten-id aus; greif sie dort ab oder lies sie
  später über `runs --json` und `agents <run-id> --json` nach.
- Überschreibe das State-Verzeichnis mit `REEVES_REGISTRY` und die Konfigurationsdatei mit
  `REEVES_CONFIG`, um einen gescripteten Run von `~/.reeves` zu isolieren.

## Mehr

- [README](README.md): kompletter Funktionsüberblick und alle Befehle.
- [docs/GUIDE.md](docs/GUIDE.md): das Schritt-für-Schritt-Benutzerhandbuch.
- [docs/mcp.md](docs/mcp.md): Design und Tool-Liste des Agent-Control-MCP.
