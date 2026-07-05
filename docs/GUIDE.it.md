# Guida dell'Utente di ReevesAgents

[English](GUIDE.md) · [Deutsch](GUIDE.de.md) · [Français](GUIDE.fr.md) · [Español](GUIDE.es.md) · [Português](GUIDE.pt.md) · **Italiano** · [Türkçe](GUIDE.tr.md) · [Русский](GUIDE.ru.md) · [简体中文](GUIDE.zh-Hans.md) · [العربية](GUIDE.ar.md)

Questa guida ti porta da un'installazione pulita fino al punto in cui è un agente a far girare gli altri per te. Quando invece ti servono tutti i comandi e tutte le opzioni, quelli vivono nel [README](i18n/README.it.md).

## Cos'è ReevesAgents

- Uno spazio di lavoro gratuito e locale dove i tuoi agenti di codifica IA (Claude Code, Codex, Hermes, DeepSeek, Kimi e altri) lavorano fianco a fianco sulla tua macchina.
- La parte che lo rende interessante: un agente può creare e guidare gli altri. Dai le redini a una sessione Claude Code e si metterà volentieri a far lavorare un team di agenti Codex e Claude Code su compiti separati.
- Si appoggia alle CLI che hai già, quindi ogni login resta esattamente dov'è sempre stato. ReevesAgents non custodisce mai una chiave API e non tocca mai il tuo traffico verso i modelli.
- Tutto il suo stato è un po' di JSON sotto `~/.reeves`. Non c'è un database da tenere in piedi, niente Docker da scaricare e niente che rimanga acceso in background.

## Prima di iniziare

- macOS, Linux o WSL (Windows nativo non è il target; usa WSL).
- Node.js 20.19 o più recente.
- tmux 3.0 o più recente.
- Almeno una CLI di provider installata e loggata: Claude Code, Codex, OpenCode, Hermes, Kimi, DeepSeek, Pi, Qwen o Aider.

## Installa e verifica

- Installalo con Homebrew: `brew install mertkayacs/reevesagents/reevesagents`, oppure globalmente con un gestore di pacchetti Node come pnpm: `pnpm add -g reevesagents`
- Controlla la tua macchina: `reevesagents doctor` (verifica Node, tmux, la cartella dello stato e quali CLI di provider riesce a vedere).
- Avvialo: `reevesagents`
- Preferisci npm, Yarn, Bun o npx? Vedi [Installazione](i18n/README.it.md#installazione) nel README.

## Il tuo primo run

Il modo più rapido e riproducibile di partire è la riga di comando. Un run ha un agente lead e quanti worker vuoi, e ogni agente si scrive come `provider[:nickname[:model]]`:

```sh
reevesagents spawn claude-code:lead codex:worker \
  --name "first run" \
  --prompt "Say hello and list the files in this folder."
```

- `claude-code:lead` è il lead, `codex:worker` è un worker. Senza agenti nominati, il run usa `codex` come default.
- `--name` etichetta il run, `--cwd` imposta la cartella di lavoro (di default quella in cui ti trovi) e `--prompt` viene incollato in ogni agente.

Preferisci partire da un'interfaccia? Lancia `reevesagents` per la TUI, oppure `reevesagents web` per la Web UI locale, e crea il run da lì.

## I cinque modi di usarlo

Agli stessi run arrivi da cinque superfici. Scegli quella che si adatta al momento:

- **TUI** (`reevesagents`): l'app da terminale dove si finisce per vivere. È tutta a menu, quindi ti bastano le frecce.
- **Web UI** (`reevesagents web`): gli stessi run su una sola pagina del browser, con una vista dal vivo dentro qualsiasi agente. Risponde solo e soltanto su loopback.
- **CLI** (`reevesagents spawn`, `runs`, `peek`, `open`, `stop`): per gli script, o per i giorni in cui preferisci digitare piuttosto che navigare.
- **tmux**: il posto dove gli agenti vivono davvero. Siccome ognuno è una CLI reale nel suo riquadro, chiudere la TUI o la Web UI non interrompe nessuno.
- **Agent control** (`reevesagents attach <cli>`): l'MCP opt-in che mette un agente alla guida degli altri. La sezione dopo lo percorre passo passo.

## Lascia che un agente guidi gli altri

È la funzione centrale, e resta spenta finché non sei tu ad accenderla.

- Accendila per la tua CLI con `reevesagents attach claude`, oppure lancia `reevesagents attach` da solo per collegare ogni CLI installata in grado di ospitarla. La schermata **Controllo agenti** nella TUI e nella Web UI fa la stessa identica cosa.
- `reevesagents hosts` ti dice a che punto sei: tutte le CLI presenti sulla macchina, e quali di loro sono collegate.
- Poi riavvia quella CLI una volta, perché gli strumenti vengono caricati solo all'avvio della sessione (è MCP puro e semplice, il modo standard con cui uno strumento di agente espone comandi a un altro).
- Da lì in poi il tuo agente può mettere un nuovo agente su un compito, scriverci dentro, leggere cosa sta facendo e approvare o negare qualunque cosa chieda.

Un esempio concreto: collega Claude Code, riavvialo, e da dentro una sola sessione Claude Code puoi lanciare un agente Codex su una issue e un secondo agente Claude Code su un'altra, e poi seguirli e pilotarli entrambi.

- CLI che oggi possono ospitarlo: claude, codex, kimi, qwen, opencode, hermes. OpenCode si collega a mano, perché il suo passaggio di aggiunta è interattivo.
- I worker questi strumenti di default non li ricevono, quindi un worker non può generare altri agenti. Se vuoi che uno guidi dei sub-agenti suoi, collega l'MCP anche alla sua CLI.
- Per scollegarti più avanti: `reevesagents detach claude`.

## Attività quotidiane

- Vedi cosa sta girando: `reevesagents runs` (aggiungi `--json` per gli script).
- Tieni d'occhio un agente senza lasciare la shell: `reevesagents peek <agent> -n 40`.
- Salta nel riquadro tmux di un agente: `reevesagents open <agent>`.
- Ferma un intero run: `reevesagents stop <run> --yes`.
- Ferma un singolo agente: `reevesagents kill <agent> --yes`.
- Vedi cosa stanno chiedendo gli agenti: `reevesagents approvals`, poi `approve <id>` o `deny <id>`.
- `stop` e `kill` terminano il lavoro, e i comandi `delete` rimuovono i record terminati. Tutti si rifiutano di girare senza `--yes`.

## Tenere i costi bassi

- Metti davanti un modello economico o gratuito a fare da smistatore, e lascia che svegli quello costoso solo quando un compito se lo merita davvero.
- Codice di routine e test sono esattamente il mestiere dei modelli più economici. Tieni quello grande per pianificare e progettare, invece di pagarlo per scrivere boilerplate.
- Qualunque cifra ti costi, è la normale fatturazione dei tuoi provider. ReevesAgents di suo non ci aggiunge niente.

## Quando qualcosa non torna

- Parti da `reevesagents doctor`, perché il più delle volte il problema te lo dice per nome: passa in rassegna Node, tmux, la cartella dello stato e ogni CLI di provider.
- **tmux manca:** installalo (`brew install tmux` o `apt install tmux`) e lascia che sia doctor a confermare.
- **Un provider non viene rilevato:** quasi sempre non è installato, oppure manca il login. ReevesAgents può avviare solo ciò che sta nel tuo `PATH` con l'accesso già fatto.
- **La Web UI segnala pacchetti mancanti:** i moduli opzionali `ws` e `@lydell/node-pty` sono stati saltati all'installazione. Di solito basta reinstallare per riaverli.
- **Porta già in uso:** non si è rotto niente; `reevesagents web` prende la prima porta libera e stampa l'URL. Passa `--port <n>` se vuoi decidere tu quale.
- Più dettagli in [Risoluzione dei problemi](i18n/README.it.md#risoluzione-dei-problemi).

## Dove andare dopo

- [Home della documentazione](README.md): l'indice completo della documentazione.
- [Comandi](i18n/README.it.md#comandi): ogni sottocomando e flag.
- [Agent control](i18n/README.it.md#agent-control): il modello opt-in completo.
- [Configurazione](i18n/README.it.md#configurazione): cosa vive sotto `~/.reeves`.
- [docs/mcp.md](mcp.md): il design di Agent control e l'elenco degli strumenti.
