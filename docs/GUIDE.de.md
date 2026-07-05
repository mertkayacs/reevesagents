# ReevesAgents-Benutzerhandbuch

[English](GUIDE.md) · **Deutsch** · [Français](GUIDE.fr.md) · [Español](GUIDE.es.md) · [Português](GUIDE.pt.md) · [Italiano](GUIDE.it.md) · [Türkçe](GUIDE.tr.md) · [Русский](GUIDE.ru.md) · [简体中文](GUIDE.zh-Hans.md) · [العربية](GUIDE.ar.md)

Dieses Handbuch bringt dich von der frischen Installation bis zu dem Punkt, an dem ein
Agent die anderen für dich betreibt. Und wenn du stattdessen jeden Befehl mit jeder
Option brauchst: Das steht in der [README](i18n/README.de.md).

## Was ReevesAgents ist

- Ein kostenloser, lokaler Arbeitsbereich, in dem deine KI-Coding-Agenten (Claude Code,
  Codex, Hermes, DeepSeek, Kimi und weitere) Seite an Seite auf deiner Maschine arbeiten.
- Der Teil, der es interessant macht: Ein Agent kann die anderen erstellen und steuern.
  Gib einer Claude-Code-Sitzung die Zügel, und sie betreibt dir bereitwillig ein Team
  aus Codex- und Claude-Code-Agenten an getrennten Aufgaben.
- Es setzt auf den CLIs auf, die du ohnehin hast, jedes Login bleibt also da, wo es
  immer war. ReevesAgents hält nie einen API-Schlüssel und rührt deinen Modell-Traffic
  nicht an.
- Der gesamte State ist ein bisschen JSON unter `~/.reeves`. Es gibt keine Datenbank,
  die du betreiben müsstest, kein Docker-Image, das gezogen werden will, und nichts,
  was im Hintergrund mitläuft.

## Bevor du anfängst

- macOS, Linux oder WSL (natives Windows ist kein Ziel; nutze WSL).
- Node.js 20.19 oder neuer.
- tmux 3.0 oder neuer.
- Mindestens eine Provider-CLI installiert und angemeldet: Claude Code, Codex,
  OpenCode, Hermes, Kimi, DeepSeek, Pi, Qwen oder Aider.

## Installation und Überprüfung

- Installiere es mit Homebrew: `brew install mertkayacs/reevesagents/reevesagents`,
  oder global mit einem Node-Paketmanager wie pnpm: `pnpm add -g reevesagents`
- Prüfe deine Maschine: `reevesagents doctor` (prüft Node, tmux, den State-Ordner
  und welche Provider-CLIs sichtbar sind).
- Starte es: `reevesagents`
- Lieber npm, Yarn, Bun oder npx? Siehe [Installation](i18n/README.de.md#installation)
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

- **TUI** (`reevesagents`): die Terminal-App, in der die meisten am Ende wohnen. Alles
  ist ein Menü, du kommst also mit den Pfeiltasten überall hin.
- **Web UI** (`reevesagents web`): dieselben Durchläufe auf einer Browserseite, mit
  Live-Blick in jeden Agenten. Sie antwortet grundsätzlich nur auf Loopback.
- **CLI** (`reevesagents spawn`, `runs`, `peek`, `open`, `stop`): für Skripte, oder für
  die Tage, an denen du lieber tippst als klickst.
- **tmux**: Hier leben die Agenten wirklich. Weil jeder eine echte CLI im eigenen Pane
  ist, unterbricht das Schließen der TUI oder Web UI niemanden.
- **Agent-Control** (`reevesagents attach <cli>`): der Opt-in-MCP, über den ein Agent die
  anderen steuert. Der nächste Abschnitt geht ihn Schritt für Schritt durch.

## Lass einen Agenten die anderen steuern

Das ist die Kernfunktion, und sie bleibt aus, bis du sie einschaltest.

- Schalte sie für deine CLI mit `reevesagents attach claude` ein, oder verbinde mit einem
  bloßen `reevesagents attach` gleich jede installierte CLI, die den Server hosten kann.
  Der Bildschirm **Agentensteuerung** in der TUI und Web UI tut dasselbe.
- `reevesagents hosts` zeigt dir, wo du stehst: jede CLI auf der Maschine, und welche
  davon verbunden sind.
- Starte diese CLI danach einmal neu, denn Tools werden nur beim Sitzungsstart eingelesen
  (das ist schlichtes MCP, der Standardweg, über den ein Agent-Tool einem anderen Befehle
  bereitstellt).
- Von da an kann dein Agent einen neuen Agenten auf eine Aufgabe setzen, in ihn
  hineintippen, mitlesen, was er gerade tut, und freigeben oder ablehnen, was auch immer
  er anfragt.

Ein Beispiel aus der Praxis: Hänge ReevesAgents an Claude Code an, starte es neu, und aus
einer einzigen Claude-Code-Sitzung heraus setzt du einen Codex-Agenten auf ein Issue und
einen zweiten Claude-Code-Agenten auf ein anderes. Danach schaust du beiden zu und lenkst
sie.

- CLIs, die das heute hosten können: claude, codex, kimi, qwen, opencode, hermes.
  OpenCode hängst du von Hand an, weil sein eigener add-Schritt interaktiv ist.
- Worker bekommen diese Tools standardmäßig nicht, ein Worker kann also keine weiteren
  Agenten starten. Soll ein Worker eigene Sub-Agenten steuern, hänge den MCP auch an
  seine CLI an.
- Zum späteren Trennen: `reevesagents detach claude`.

## Alltägliche Aufgaben

- Sieh nach, was läuft: `reevesagents runs` (mit `--json` für Skripte).
- Beobachte einen Agenten, ohne deine Shell zu verlassen: `reevesagents peek <agent> -n 40`.
- Spring in den tmux-Pane eines Agenten: `reevesagents open <agent>`.
- Stoppe einen ganzen Durchlauf: `reevesagents stop <run> --yes`.
- Stoppe einen einzelnen Agenten: `reevesagents kill <agent> --yes`.
- Sieh nach, worum Agenten gerade bitten: `reevesagents approvals`, dann
  `approve <id>` oder `deny <id>`.
- `stop` und `kill` beenden Arbeit, und die `delete`-Befehle räumen beendete Datensätze
  weg. Ohne `--yes` läuft keiner von ihnen.

## Kosten niedrig halten

- Setz ein günstiges oder kostenloses Modell als Router davor und lass es das teure nur
  dann wecken, wenn eine Aufgabe das wirklich verdient.
- Routine-Code und Tests sind genau das, wofür die günstigeren Modelle da sind. Heb dir
  das große fürs Planen und Entwerfen auf, statt es fürs Boilerplate-Tippen zu bezahlen.
- Und was immer dich das kostet: Es ist die ganz normale Abrechnung deiner Provider.
  ReevesAgents selbst legt nichts obendrauf.

## Wenn etwas hakt

- Fang mit `reevesagents doctor` an, denn meist nennt es dir das Problem direkt: Node,
  tmux, der State-Ordner und jede Provider-CLI werden geprüft.
- **tmux fehlt:** Installiere es (`brew install tmux` oder `apt install tmux`) und lass
  es dir von doctor bestätigen.
- **Ein Provider wird nicht erkannt:** Fast immer ist er schlicht nicht installiert oder
  nicht angemeldet. ReevesAgents kann nur starten, was auf deinem `PATH` liegt und
  eingeloggt ist.
- **Die Web UI meldet fehlende Pakete:** Die optionalen Module `ws` und
  `@lydell/node-pty` wurden bei der Installation übersprungen. Eine gewöhnliche
  Neuinstallation bringt sie zurück.
- **Port bereits in Benutzung:** Da ist nichts kaputt. `reevesagents web` nimmt einfach
  den nächsten freien Port und gibt die URL aus. Übergib `--port <n>`, wenn dir der
  Port nicht egal ist.
- Mehr Details unter [Fehlerbehebung](i18n/README.de.md#fehlerbehebung).

## Wie es weitergeht

- [Doku-Übersicht](README.md): der vollständige Dokumentationsindex.
- [Befehle](i18n/README.de.md#befehle): jeder Subcommand mit allen Flags.
- [Agent-Control](i18n/README.de.md#agent-control): das vollständige Opt-in-Modell.
- [Konfiguration](i18n/README.de.md#konfiguration): was unter `~/.reeves` liegt.
- [docs/mcp.md](mcp.md): das Agent-Control-Design und die Tool-Liste.
