# ReevesAgents-Benutzerhandbuch

[English](GUIDE.md) · **Deutsch** · [Français](GUIDE.fr.md) · [Español](GUIDE.es.md) · [Português](GUIDE.pt.md) · [Italiano](GUIDE.it.md) · [Türkçe](GUIDE.tr.md) · [Русский](GUIDE.ru.md) · [简体中文](GUIDE.zh-Hans.md) · [العربية](GUIDE.ar.md)

Eine schlichte Schritt-für-Schritt-Anleitung: installieren, den ersten Durchlauf starten
und dann einen Agenten die anderen steuern lassen. Die vollständige Befehls- und
Optionsreferenz steht in der [README](i18n/README.de.md).

## Was ReevesAgents ist

- Ein kostenloser, lokaler Arbeitsbereich für KI-Coding-Agenten (Claude Code, Codex, Hermes,
  DeepSeek, Kimi und weitere). Sie laufen nebeneinander auf deiner Maschine.
- Die Kernidee: Ein Agent erstellt und steuert die anderen. Ein Claude-Code-Agent
  kann ein Team aus Codex- und Claude-Code-Agenten an separaten Aufgaben starten und lenken.
- Es setzt auf den echten CLIs auf, die du schon hast. Das Provider-Login bleibt bei
  der jeweiligen CLI. ReevesAgents speichert keine API-Schlüssel und leitet deinen
  Modell-Traffic nie weiter.
- Keine Datenbank, kein Docker, kein Hintergrunddienst. Der State ist lokales JSON unter
  `~/.reeves`.

## Bevor du anfängst

- macOS, Linux oder WSL (natives Windows ist kein Ziel; nutze WSL).
- Node.js 20.19 oder neuer.
- tmux 3.0 oder neuer.
- Mindestens eine Provider-CLI installiert und angemeldet: Claude Code, Codex,
  OpenCode, Hermes, Kimi, DeepSeek, Pi, Qwen oder Aider.

## Installation und Überprüfung

- Installiere es global: `npm install -g reevesagents`
- Prüfe deine Maschine: `reevesagents doctor` (prüft Node, tmux, den State-Ordner
  und welche Provider-CLIs sichtbar sind).
- Starte es: `reevesagents`
- Lieber pnpm, Yarn, Bun, npx oder Homebrew? Siehe [Installation](i18n/README.de.md#installation)
  in der README.

## Dein erster Durchlauf

Am schnellsten reproduzierbar startest du von der Kommandozeile. Ein Durchlauf hat einen
Lead-Agenten und beliebig viele Worker; jeder Agent wird als `provider[:nickname[:model]]`
geschrieben:

```sh
reevesagents spawn claude-code:lead codex:worker \
  --name "first run" \
  --prompt "Say hello and list the files in this folder."
```

- `claude-code:lead` ist der Lead, `codex:worker` ein Worker. Ohne benannten Agenten
  fällt der Durchlauf auf `codex` zurück.
- `--name` benennt den Durchlauf, `--cwd` setzt den Arbeitsordner (Standard: dort, wo du
  gerade bist), und `--prompt` wird in jeden Agenten eingefügt.

Lieber visuell starten? Führe `reevesagents` für die TUI oder `reevesagents web` für
die lokale Web UI aus und lege den Durchlauf dort an.

## Die fünf Wege, es zu nutzen

Du erreichst dieselben Durchläufe über fünf Oberflächen. Nimm die, die gerade passt:

- **TUI** (`reevesagents`): schnelle, tastaturorientierte Steuerung im Terminal.
- **Web UI** (`reevesagents web`): eine visuelle Ansicht über Durchläufe, Agenten, Live-Panes
  und Verlauf. Lokal und nur an Loopback gebunden.
- **CLI** (`reevesagents spawn`, `runs`, `peek`, `open`, `stop`): Skripte, schnelle
  Befehle und Health-Checks.
- **tmux**: Jeder Agent ist eine echte CLI in seinem eigenen tmux-Pane, die Sitzungen laufen
  also lokal weiter, auch wenn du die TUI oder Web UI schließt.
- **Agent-Control** (`reevesagents attach <cli>`): der Opt-in-MCP, über den ein Agent die
  anderen steuert. Wie das geht, zeigt der nächste Abschnitt.

## Lass einen Agenten die anderen steuern

Das ist die Kernfunktion, und sie bleibt aus, bis du sie einschaltest.

- Schalte sie für deine CLI ein: `reevesagents attach claude` (oder `reevesagents attach`,
  um jede installierte CLI zu verbinden, die den Server hosten kann). Das geht auch über
  den Bildschirm **Agentensteuerung** in der TUI oder Web UI.
- Bestätige es: `reevesagents hosts` listet die CLIs auf deiner Maschine auf und zeigt,
  welche verbunden sind.
- Lade deine CLI neu: Starte die Sitzung neu, damit sie die neuen Tools aufnimmt (das läuft
  über MCP, den Standardweg, über den ein Agent-Tool einem anderen Befehle bereitstellt).
- Jetzt kann dein Agent andere Agenten erstellen und steuern: einen Agenten auf eine Aufgabe
  ansetzen, ihm Text oder Tastendrücke schicken, mitlesen, was er tut, und freigeben oder
  ablehnen, was er anfordert.

Ein Beispiel aus der Praxis: Hänge ReevesAgents an Claude Code an, starte es neu, und aus
einer einzigen Claude-Code-Sitzung heraus setzt du einen Codex-Agenten auf ein Issue und
einen zweiten Claude-Code-Agenten auf ein anderes, und beobachtest und lenkst dann beide.

- CLIs, die das heute hosten können: claude, codex, kimi, qwen, opencode, hermes.
  OpenCode hängst du von Hand an, weil sein eigener add-Schritt interaktiv ist.
- Worker bekommen diese Tools standardmäßig nicht, ein Worker kann also keine weiteren
  Agenten starten. Damit ein Worker eigene Sub-Agenten steuert, hänge den MCP auch an
  die CLI dieses Workers an.
- Zum späteren Trennen: `reevesagents detach claude`.

## Alltägliche Aufgaben

- Sieh nach, was läuft: `reevesagents runs` (mit `--json` für Skripte).
- Beobachte einen Agenten, ohne deine Shell zu verlassen: `reevesagents peek <agent> -n 40`.
- Spring in den tmux-Pane eines Agenten: `reevesagents open <agent>`.
- Stoppe einen ganzen Durchlauf: `reevesagents stop <run> --yes`.
- Stoppe einen einzelnen Agenten: `reevesagents kill <agent> --yes`.
- Sieh nach, worum Agenten gerade bitten: `reevesagents approvals`, dann
  `approve <id>` oder `deny <id>`.
- `stop` und `kill` beenden Arbeit, die `delete`-Befehle entfernen beendete Datensätze.
  Alle verweigern die Ausführung ohne `--yes`.

## Kosten niedrig halten

- Setz ein günstigeres oder kostenloses Modell davor, das die Arbeit verteilt und schwere
  Aufgaben nur bei Bedarf an einen stärkeren Agenten übergibt.
- Lass günstige Modelle Routine-Code und Tests schreiben, während du mit einem größeren
  Modell planst und entwirfst, statt alles durch ein einziges teures Standardmodell zu schieben.
- Provider-Kontingente und Abrechnung bleiben bei der jeweiligen CLI. ReevesAgents verursacht
  selbst keine Kosten.

## Wenn etwas hakt

- Führe zuerst `reevesagents doctor` aus. Es prüft Node, tmux, den State-Ordner und
  deine Provider-CLIs und sagt dir, was fehlschlägt.
- **tmux fehlt:** Installiere es (`brew install tmux` oder `apt install tmux`) und
  lass doctor noch einmal laufen.
- **Ein Provider wird nicht erkannt:** ReevesAgents startet nur CLIs, die auf deinem
  `PATH` liegen und angemeldet sind. Installiere die CLI oder melde dich dort an.
- **Die Web UI meldet fehlende Pakete:** Sie braucht `ws` und `@lydell/node-pty`.
  Installiere mit aktivierten optionalen Abhängigkeiten neu.
- **Port bereits in Benutzung:** `reevesagents web` startet auf `8080` und weicht auf den
  nächsten freien Port aus; wähle mit `--port <n>` einen anderen.
- Mehr Details unter [Fehlerbehebung](i18n/README.de.md#fehlerbehebung).

## Wie es weitergeht

- [Doku-Übersicht](README.md): der vollständige Dokumentationsindex.
- [Befehle](i18n/README.de.md#befehle): jeder Subcommand mit allen Flags.
- [Agent-Control](i18n/README.de.md#agent-control): das vollständige Opt-in-Modell.
- [Konfiguration](i18n/README.de.md#konfiguration): was unter `~/.reeves` liegt.
- [docs/mcp.md](mcp.md): das Agent-Control-Design und die Tool-Liste.
