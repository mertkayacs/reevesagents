# AGENTS.md

[English](AGENTS.md) · **Deutsch** · [Français](AGENTS.fr.md) · [Español](AGENTS.es.md) · [Português](AGENTS.pt.md) · [Italiano](AGENTS.it.md) · [Türkçe](AGENTS.tr.md) · [Русский](AGENTS.ru.md) · [简体中文](AGENTS.zh-Hans.md) · [العربية](AGENTS.ar.md)

Wie ein KI-Coding-Agent ReevesAgents steuert. Diese Datei ist die Betreiberanleitung für
das Werkzeug selbst. Sie ändert nicht, wie Agenten sich in deinen eigenen Projekten verhalten.

ReevesAgents führt KI-Coding-CLIs (Claude Code, Codex, Kimi, Qwen, OpenCode, Hermes,
und andere) nebeneinander aus, jeder als echter CLI in seinem eigenen tmux-Fenster. Ein Agent kann
andere spawnen, steuern und beaufsichtigen. Der State lebt in lokales JSON unter `~/.reeves`.
Keine API-Schlüssel, keine Datenbank, kein Background-Daemon.

## Zwei Wege, es zu nutzen

1. **Steuere den CLI direkt.** Führe `reevesagents spawn ...` aus, um Agenten zu starten, dann
   nutze `runs`, `peek`, `send` und `stop`, um sie zu beobachten und zu lenken. Gut für Skripte und
   einmalige Orchestrierung.
2. **Lass deinen Host-CLI andere über MCP steuern.** `reevesagents attach <cli>` gibt diesem
   CLI eine Reihe von Agent-Control-Tools (spawn, send_text, read, kill, ...). Nach dem Neustart des CLI
   kann eine einzige Sitzung ein Team starten und lenken. Das ist die Kernfunktion. Siehe [docs/mcp.md](docs/mcp.md).

## Zuerst einen Setup-Check machen

```sh
reevesagents doctor
```

Meldet tmux, Node, das `~/.reeves` State-Verzeichnis und welche Provider-CLIs installiert
und CLI-kompatibel sind (es inspiziert das `--help` jedes CLI). Es kann nicht testen, ob ein CLI angemeldet ist,
daher besteht ein installiertes, aber abgemeldetes CLI diesen Test dennoch. Führe es vor dem Spawning aus,
damit ein Run nicht wegen eines fehlenden CLI fehlschlägt; `peek` (unten) fängt ein Fenster auf,
das bei einem Login-Bildschirm steckenbleibt. `reevesagents doctor --json` gibt das Gleiche als maschinenlesbares JSON zurück.

Anforderungen: Node 20.19+, tmux 3.0+ und mindestens ein Provider-CLI installiert und
authentifiziert. macOS, Linux oder WSL (natives Windows ist nicht das Ziel).

## Installation

```sh
pnpm add -g reevesagents     # oder: npm install -g reevesagents
```

Einmalig ohne Installation: `pnpm dlx reevesagents doctor`.

## Agenten spawnen

Jeder Agent wird als `provider[:nickname[:model]]` geschrieben; nickname und model sind
optional. Der erste Agent leitet den Run; der Rest treten als Worker bei.

```sh
# Ein Claude-Code-Lead, ein zweiter Claude-Code-Reviewer, zwei Codex-Worker, ein Kimi-Worker.
reevesagents spawn cc:lead cc:review codex:api codex:tests kimi:docs \
  --name "feature x" --skip \
  --prompt "Build feature X. Lead coordinates; each worker takes a slice."
```

Bevor es etwas startet, prüft `spawn`, dass jeder benannte Provider-CLI auf PATH ist
und nennt alle, die fehlen, daher schlägt ein Tippfehler oder ein uninstallierter CLI schnell fehl,
statt einen Run nur teilweise zu starten. Erfolgreich gibt es die Run-id, jede Agent-id und die genauen
`peek`/`send`/`open`-Befehle aus, um sie zu steuern.

Nützliche `spawn`-Flags: `--name <run>`, `--cwd <dir>` (Standard ist das aktuelle Verzeichnis),
`--prompt <text>` (in jeden Agenten eingefügt), `--skip` (Agenten starten ohne ihre eigenen
Genehmigungsabfragen; nutze es, wenn kein Mensch zum Genehmigen da ist), `--run <run-id>`
(füge Agenten zu einem existierenden Run hinzu, statt einen neuen zu starten), `--json` (gib die Run-
und Agent-ids als JSON statt Text aus).

## Provider-ids und Aliases

Führe `reevesagents providers` aus (füge `--json` für eine Maschinenliste hinzu). Jeder Alias
funktioniert als Provider in einer Spawn-Spec.

| id         | provider     | gängige Aliases                 |
| ---------- | ------------ | ------------------------------- |
| `cc`       | Claude Code  | `claude`, `claude-code`         |
| `codex`    | Codex CLI    | `codex-cli`                     |
| `kimi`     | Kimi Code    | `kimi-code`                     |
| `qwen`     | Qwen Code    | `qwen-code`                     |
| `opencode` | OpenCode CLI | `open_code`                     |
| `hermes`   | Hermes       |                                 |
| `pi`       | Pi           |                                 |
| `aider`    | Aider        |                                 |
| `deepseek` | DeepSeek CLI | `deepseek-cli`                  |

## Laufende Agenten beobachten und lenken

```sh
reevesagents runs                      # aktive Runs auflisten (füge --json für Skripte hinzu)
reevesagents agents <run-id>           # die Agenten in einem Run auflisten
reevesagents peek <agent-id> -n 40     # aktuelle Ausgabe eines Agenten
reevesagents send <agent-id> "do X"    # Text in die Agent-Eingabeaufforderung einfügen
reevesagents key <agent-id> enter      # Text abschicken (send schickt nicht von selbst ab)
reevesagents interrupt <agent-id>      # ctrl-c dem Agenten senden
reevesagents open <run-id|agent-id>    # zu seinem tmux-Fenster springen
```

`send` fügt nur ein; folge es mit `key <agent-id> enter`, um abzuschicken. Tasten, die von
`key` akzeptiert werden: `enter`, `escape`, `backspace`, `tab`, `space`, `up`, `down`, `left`, `right`,
`ctrl-c`.

## Sauber stoppen

```sh
reevesagents stop <run-id> --yes       # einen ganzen Run beenden und seine tmux-Sitzung abbauen
reevesagents kill <agent-id> --yes     # einen Agenten beenden
```

`stop` und `kill` sind die einzigen destruktiven Befehle, daher weigern sie sich,
ohne `--yes` zu laufen.

## Ein durchgearbeitetes Beispiel: fünf Agenten, dann lenke sie

Das Szenario "ReevesAgents installieren, zwei Claude, zwei Codex und eine Kimi spawnen,
und sie zur Arbeit bringen" von Anfang bis Ende.

```sh
# 1. Bestätige, dass die fünf CLIs installiert und kompatibel sind.
reevesagents doctor

# 2. Starte das Team. --skip, damit Worker nicht für ihre eigenen Genehmigungsabfragen stoppen.
reevesagents spawn cc:lead cc:review codex:api codex:tests kimi:docs \
  --name "feature x" --skip \
  --prompt "Build feature X. Lead coordinates; each worker owns one slice."

# 3. spawn gibt jede Agent-id aus. Listet sie alle auf, oder lies eine.
reevesagents agents <run-id>
reevesagents peek <agent-id> -n 40

# 4. Lenke: füge eine Nachricht ein, dann schicke sie ab.
reevesagents send <agent-id> "rebase on main, then run the tests"
reevesagents key  <agent-id> enter

# 5. Füge einen Worker zum gleichen Run später hinzu.
reevesagents spawn codex:perf --run <run-id> --skip --prompt "profile the hot path"

# 6. Beende den Run, wenn erledigt.
reevesagents stop <run-id> --yes
```

Wenn du es von einem Host-CLI über MCP statt der Shell steuert, ist das gleiche Szenario eine
Anweisung: "Nutze reevesagents, um ein Team zu starten, einen Claude-Code-Lead, einen zweiten Claude-Code-
Reviewer, zwei Codex-Worker (api und tests) und einen Kimi-Worker für Docs. Überspringe Genehmigungsabfragen,
gib ihnen den Auftrag, dann beobachte und berichte Fortschritt." Der Host ruft die spawn/read/send-Tools selbst auf.
Siehe [docs/mcp.md](docs/mcp.md).

## Tu und lass sein

Tu:

- Führe `doctor` vor einem Spawn aus, und stelle sicher, dass jeder Provider, den du nennst, installiert **und
  angemeldet** ist. doctor kann die Anmeldung nicht testen; wenn ein Fenster steckenbleibt, zeigt `peek` den Login-Bildschirm.
- Behandle `spawn` als fire-and-forget. Es gibt ids, nicht Antworten. Pollst mit `runs`,
  `agents <run-id>` und `peek <agent-id> -n 40`, um zu sehen, was ein Team tut.
- Füge Eingabe in zwei Schritten ein: `send <agent-id> "..."` fügt ein, `key <agent-id> enter` schickt ab.
- Übergib `--skip`, wenn kein Mensch zum Genehmigen von Eingabeaufforderungen da sitzt, sonst steckenbleiben Worker bei der ersten.
- Nutze `--json` (auf `spawn`, `runs`, `agents`, `providers`, `doctor`), wenn ein Skript oder ein
  Agent ids und State statt Text lesen muss.
- Benenne Provider nach id oder einem Alias von `reevesagents providers` (`cc` oder `claude`, `codex`, `kimi`, ...).

Lass sein:

- Erwarte nicht, dass `spawn` ein Agenten-Ergebnis zurückgibt; starte das Team, dann lies es.
- `send` nicht und davon ausgehen, dass es lief; nichts wird abgeschickt, bis du `key <agent-id> enter` gibst.
- Spawne keinen Provider, der fehlt oder abgemeldet ist; spawn weigert sich beim ersten, und
  der zweite lässt ein Fenster bei einer Login-Eingabeaufforderung stecken, die niemals die Arbeit tut.
- Führe `stop` oder `kill` nicht ohne `--yes` aus; sie sind die einzigen destruktiven Befehle.
- Ziele nicht auf natives Windows; führe es stattdessen innerhalb von WSL aus, mit tmux und den CLIs dort installiert.
- Füge keine Geheimnisse in eine `--prompt` oder `send` ein; Ausgabe wird erfasst und über `peek` und die Web UI angezeigt.

## Scripting-Notizen

- `spawn`, `runs`, `agents`, `providers` und `doctor` akzeptieren alle `--json`.
- `spawn --json` gibt die Run-id und jede Agent-id aus; erfasse diese, oder lies sie zurück
  von `runs --json` und `agents <run-id> --json`.
- Überschreibe das State-Verzeichnis mit `REEVES_REGISTRY` und die Konfigurationsdatei mit `REEVES_CONFIG`,
  um einen gescripteten Run von `~/.reeves` isoliert zu halten.

## Mehr

- [README](README.md): volle Feature-Tour und jeder Befehl.
- [docs/GUIDE.md](docs/GUIDE.md): Schritt-für-Schritt-Benutzerhandbuch.
- [docs/mcp.md](docs/mcp.md): das Agent-Control-MCP-Design und die Tool-Liste.
