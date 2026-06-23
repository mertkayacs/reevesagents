# ReevesAgents-Benutzerhandbuch

[English](GUIDE.md) · **Deutsch** · [Français](GUIDE.fr.md) · [Español](GUIDE.es.md) · [Português](GUIDE.pt.md) · [Italiano](GUIDE.it.md) · [Türkçe](GUIDE.tr.md) · [Русский](GUIDE.ru.md) · [简体中文](GUIDE.zh-Hans.md) · [العربية](GUIDE.ar.md)

Eine schlichte, schrittweise Anleitung: Installiere es, mache deinen ersten Durchlauf, und lass einen
Agenten die anderen steuern. Die vollständige Befehls- und Optionsreferenz findest du in der
[README](../README.de.md).

## Was ReevesAgents ist

- Ein kostenloser, lokaler Arbeitsbereich für KI-Coding-Agenten (Claude Code, Codex, Hermes,
  DeepSeek, Kimi und mehr). Sie laufen nebeneinander auf deiner Maschine.
- Die Kernidee: Ein Agent erstellt und steuert die anderen. Ein Claude-Code-Agent
  kann ein Team von Codex- und Claude-Code-Agenten an separaten Aufgaben starten und lenken.
- Es läuft auf den echten CLIs, die du bereits hast. Provider-Login bleibt bei
  jeder CLI. ReevesAgents speichert keine API-Schlüssel und leitet niemals deinen Model-Traffic weiter.
- Keine Datenbank, kein Docker, kein Background-Service. Der State ist lokales JSON unter
  `~/.reeves`.

## Bevor du anfängst

- macOS, Linux oder WSL (natives Windows ist nicht das Ziel; nutze WSL).
- Node.js 20.19 oder neuer.
- tmux 3.0 oder neuer.
- Mindestens eine Provider-CLI installiert und angemeldet: Claude Code, Codex,
  OpenCode, Hermes, Kimi, DeepSeek, Pi, Qwen oder Aider.

## Installation und Überprüfung

- Installiere es global: `npm install -g reevesagents`
- Überprüfe deine Maschine: `reevesagents doctor` (überprüft Node, tmux, den State-Ordner
  und welche Provider-CLIs es sehen kann).
- Starte es: `reevesagents`
- Bevorzugst du pnpm, Yarn, Bun, npx oder Homebrew? Siehe [Installation](../README.de.md#installation)
  in der README.

## Dein erster Durchlauf

Der schnellste reproduzierbare Durchlauf erfolgt von der Kommandozeile. Ein Durchlauf hat einen Lead-Agenten
und eine beliebige Anzahl von Workern; jeder Agent wird als `provider[:nickname[:model]]` geschrieben:

```sh
reevesagents spawn claude-code:lead codex:worker \
  --name "first run" \
  --prompt "Say hello and list the files in this folder."
```

- `claude-code:lead` ist der Lead, `codex:worker` ist ein Worker. Ohne benannten Agenten
  wird der Durchlauf auf `codex` als Standard gesetzt.
- `--name` beschriftet den Durchlauf, `--cwd` setzt den Arbeitsordner (Standard ist dein aktueller Ort), und `--prompt` wird in jeden Agenten eingefügt.

Bevorzugst du einen visuellen Start? Führe `reevesagents` für die TUI oder `reevesagents web` für
die lokale Web UI aus und erstelle den Durchlauf von dort.

## Die vier Wege, ihn zu nutzen

Du erreichst die gleichen Durchläufe über vier Oberflächen. Wähle, was dem Moment entspricht:

- **TUI** (`reevesagents`): schnell, tastaturorientierte Steuerung im Terminal.
- **Web UI** (`reevesagents web`): eine visuelle Ansicht von Durchläufen, Agenten, Live-Panes
  und Verlauf. Lokal und nur auf Loopback.
- **CLI** (`reevesagents spawn`, `runs`, `peek`, `open`, `stop`): Skripte, schnelle
  Befehle und Health-Checks.
- **tmux**: Jeder Agent ist eine echte CLI in seinem eigenen tmux-Pane, so dass die Sitzungen lokal
  weiterlaufen, auch nachdem du die TUI oder Web UI geschlossen hast.

## Lass einen Agenten die anderen steuern

Das ist die Kernfunktion, und sie ist standardmäßig deaktiviert.

- Aktiviere sie für deine CLI: `reevesagents attach claude` (oder `reevesagents attach`
  um jede installierte CLI zu verbinden, die sie hosten kann). Du kannst dies auch vom
  Bildschirm **Agent-Control** in der TUI oder Web UI aus tun.
- Bestätige es: `reevesagents hosts` listet die CLIs auf deiner Maschine auf und zeigt, welche
  verbunden sind.
- Lade deine CLI neu: Starte die Sitzung neu, damit sie die neuen Tools aufgreift (dies nutzt
  MCP, die Standard-Art, wie ein Agent-Tool Befehle einem anderen bereitstellt).
- Jetzt kann dein Agent andere Agenten erstellen und steuern: Starte einen Agenten bei einer Aufgabe,
  sende ihm Text oder Tastatureingaben, lies, was er tut, und genehmige oder verweigere, was er
  anfodert.

Ein ausgearbeitetes Beispiel: Verbinde dich mit Claude Code, starte es neu, und von einer Claude-Code-Sitzung
aus kannst du einen Codex-Agenten auf eine Issue starten und einen zweiten Claude-Code-Agenten
auf eine andere, dann beobachte und lenke beide.

- CLIs, die dies heute hosten können: claude, codex, kimi, qwen, opencode, hermes.
  OpenCode wird manuell angehängt, da sein eigener add-Schritt interaktiv ist.
- Worker erhalten diese Tools standardmäßig nicht, daher kann ein Worker keine weitere
  Agenten starten. Um einem Worker zu erlauben, seine eigenen Sub-Agenten zu steuern, hänge die MCP
  an die CLI dieses Workers an.
- Um später zu trennen: `reevesagents detach claude`.

## Alltägliche Aufgaben

- Sehe, was läuft: `reevesagents runs` (füge `--json` für Skripte hinzu).
- Beobachte einen Agenten, ohne deine Shell zu verlassen: `reevesagents peek <agent> -n 40`.
- Springe in den tmux-Pane eines Agenten: `reevesagents open <agent>`.
- Stoppe einen ganzen Durchlauf: `reevesagents stop <run> --yes`.
- Stoppe einen einzelnen Agenten: `reevesagents kill <agent> --yes`.
- `stop` und `kill` sind die einzigen Befehle, die Arbeit beenden, daher weigern sie sich,
  ohne `--yes` zu laufen.

## Kosten niedrig halten

- Setze ein günstigeres oder kostenloses Modell davor, um Arbeit weiterzuleiten, und lass es
  schwere Aufgaben nur bei Bedarf an einen stärkeren Agenten übergeben.
- Lass günstige Modelle Routine-Code und Tests schreiben, während du mit einem größeren planst und entwirfst,
  statt alles durch einen einzigen teuren Standard zu schieben.
- Provider-Quoten und Abrechnung bleiben bei jeder CLI. ReevesAgents fügt keine Kosten hinzu.

## Wenn etwas falsch aussieht

- Führe zuerst `reevesagents doctor` aus. Es überprüft Node, tmux, den State-Ordner und
  deine Provider-CLIs und sagt dir, was fehlschlägt.
- **tmux fehlt:** Installiere es (`brew install tmux` oder `apt install tmux`) und
  führe doctor erneut aus.
- **Ein Provider wird nicht erkannt:** ReevesAgents startet nur CLIs, die auf
  deinem `PATH` sind und angemeldet sind. Installiere oder melde dich bei dieser CLI an.
- **Web UI meldet fehlende Pakete:** Sie benötigt `ws` und `@lydell/node-pty`.
  Installiere mit aktivierten optionalen Abhängigkeiten neu.
- **Port bereits in Benutzung:** `reevesagents web` startet auf `8080` und fällt auf den
  nächsten freien Port zurück; übergib `--port <n>`, um einen anderen zu wählen.
- Mehr Details in [Fehlerbehebung](../README.de.md#fehlerbehebung).

## Wo geht es danach hin

- [Doku-Übersicht](README.md): der vollständige Dokumentationsindex.
- [Befehle](../README.de.md#befehle): jeder Subcommand und Flag.
- [Agent-Control](../README.de.md#agent-control): das vollständige Opt-in-Modell.
- [Konfiguration](../README.de.md#konfiguration): was unter `~/.reeves` lebt.
- [docs/mcp.md](mcp.md): das Agent-Control-Design und die Tool-Liste.
