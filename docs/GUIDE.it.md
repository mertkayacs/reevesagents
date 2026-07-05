# Guida dell'Utente di ReevesAgents

[English](GUIDE.md) · [Deutsch](GUIDE.de.md) · [Français](GUIDE.fr.md) · [Español](GUIDE.es.md) · [Português](GUIDE.pt.md) · **Italiano** · [Türkçe](GUIDE.tr.md) · [Русский](GUIDE.ru.md) · [简体中文](GUIDE.zh-Hans.md) · [العربية](GUIDE.ar.md)

Una guida semplice, passo dopo passo: installalo, fai il tuo primo run e lascia che un agente guidi gli altri. Per il riferimento completo di comandi e opzioni, vedi il [README](i18n/README.it.md).

## Cos'è ReevesAgents

- Uno spazio di lavoro gratuito e locale per agenti di codifica IA (Claude Code, Codex, Hermes, DeepSeek, Kimi e altri). Girano fianco a fianco sulla tua macchina.
- L'idea principale: un agente crea e guida gli altri. Un agente Claude Code può avviare e sterzare un team di agenti Codex e Claude Code su attività separate.
- Gira sopra le CLI reali che hai già. Il login del provider resta con ogni CLI. ReevesAgents non memorizza chiavi API e non fa mai da proxy al traffico dei modelli.
- Nessun database, nessun Docker, nessun servizio in background. Lo stato è JSON locale sotto `~/.reeves`.

## Prima di iniziare

- macOS, Linux o WSL (Windows nativo non è il target; usa WSL).
- Node.js 20.19 o più recente.
- tmux 3.0 o più recente.
- Almeno una CLI di provider installata e loggata: Claude Code, Codex, OpenCode, Hermes, Kimi, DeepSeek, Pi, Qwen o Aider.

## Installa e verifica

- Installalo globalmente: `npm install -g reevesagents`
- Controlla la tua macchina: `reevesagents doctor` (verifica Node, tmux, la cartella dello stato e quali CLI di provider riesce a vedere).
- Avvialo: `reevesagents`
- Preferisci pnpm, Yarn, Bun, npx o Homebrew? Vedi [Installazione](i18n/README.it.md#installazione) nel README.

## Il tuo primo run

Il run più rapido e riproducibile parte dalla riga di comando. Un run ha un agente lead e un numero qualsiasi di worker; ogni agente si scrive come `provider[:nickname[:model]]`:

```sh
reevesagents spawn claude-code:lead codex:worker \
  --name "first run" \
  --prompt "Say hello and list the files in this folder."
```

- `claude-code:lead` è il lead, `codex:worker` è un worker. Senza agenti nominati, il run usa `codex` come default.
- `--name` etichetta il run, `--cwd` imposta la cartella di lavoro (di default quella in cui ti trovi) e `--prompt` viene incollato in ogni agente.

Preferisci un avvio visuale? Esegui `reevesagents` per la TUI o `reevesagents web` per la Web UI locale e crea il run da lì.

## I cinque modi di usarlo

Raggiungi gli stessi run attraverso cinque superfici. Scegli quella che si adatta al momento:

- **TUI** (`reevesagents`): controllo veloce, keyboard-first dentro il terminale.
- **Web UI** (`reevesagents web`): un'unica vista d'insieme di run, agenti, riquadri dal vivo e cronologia. Locale e solo loopback.
- **CLI** (`reevesagents spawn`, `runs`, `peek`, `open`, `stop`): script, comandi rapidi e controlli di integrità.
- **tmux**: ogni agente è una CLI reale nel proprio riquadro tmux, così le sessioni continuano a girare in locale anche dopo che chiudi la TUI o la Web UI.
- **Agent control** (`reevesagents attach <cli>`): l'MCP opt-in che permette a un agente di guidare gli altri. La sezione successiva lo spiega passo passo.

## Lascia che un agente guidi gli altri

Questa è la funzione principale, e resta disattivata finché non la attivi.

- Attivala per la tua CLI: `reevesagents attach claude` (o `reevesagents attach` per collegare ogni CLI installata in grado di ospitarlo). Puoi farlo anche dalla schermata **Agent control** nella TUI o nella Web UI.
- Confermalo: `reevesagents hosts` elenca le CLI sulla tua macchina e mostra quali sono collegate.
- Ricarica la tua CLI: riavvia la sessione in modo che carichi i nuovi strumenti (usa MCP, il modo standard con cui uno strumento di agente espone comandi a un altro).
- Ora il tuo agente può creare e guidare altri agenti: avviare un agente su un compito, inviargli testo o pressioni di tasti, leggere cosa sta facendo e approvare o negare ciò che chiede.

Un esempio pratico: collega Claude Code, riavvialo, e da dentro una singola sessione Claude Code puoi avviare un agente Codex su una issue e un secondo agente Claude Code su un'altra, poi osservarli e sterzarli entrambi.

- CLI che oggi possono ospitarlo: claude, codex, kimi, qwen, opencode, hermes. OpenCode si collega a mano, perché il suo passaggio di aggiunta è interattivo.
- I worker non ricevono questi strumenti per default, quindi un worker non può generare altri agenti. Per permettere a un worker di guidare i propri sub-agenti, collega l'MCP anche alla CLI di quel worker.
- Per scollegare in seguito: `reevesagents detach claude`.

## Attività quotidiane

- Vedi cosa sta girando: `reevesagents runs` (aggiungi `--json` per gli script).
- Tieni d'occhio un agente senza lasciare la shell: `reevesagents peek <agent> -n 40`.
- Salta nel riquadro tmux di un agente: `reevesagents open <agent>`.
- Ferma un intero run: `reevesagents stop <run> --yes`.
- Ferma un singolo agente: `reevesagents kill <agent> --yes`.
- Vedi cosa stanno chiedendo gli agenti: `reevesagents approvals`, poi `approve <id>` o `deny <id>`.
- `stop` e `kill` terminano il lavoro, e i comandi `delete` rimuovono i record terminati. Tutti si rifiutano di girare senza `--yes`.

## Tenere i costi bassi

- Metti davanti un modello più economico o gratuito per instradare il lavoro, e lascia che passi i compiti pesanti a un agente più forte solo quando serve.
- Lascia che i modelli economici scrivano codice di routine e test mentre tu pianifichi e progetti con uno più grande, invece di far passare tutto attraverso un unico default costoso.
- Quote e fatturazione dei provider restano con ogni CLI. ReevesAgents non aggiunge costi propri.

## Quando qualcosa non torna

- Esegui prima `reevesagents doctor`. Controlla Node, tmux, la cartella dello stato e le CLI dei provider, e ti dice cosa sta fallendo.
- **tmux manca:** installalo (`brew install tmux` o `apt install tmux`) ed esegui di nuovo doctor.
- **Un provider non viene rilevato:** ReevesAgents avvia solo le CLI che sono nel tuo `PATH` e loggate. Installa quella CLI o esegui l'accesso.
- **La Web UI segnala pacchetti mancanti:** servono `ws` e `@lydell/node-pty`. Reinstalla con le dipendenze opzionali abilitate.
- **Porta già in uso:** `reevesagents web` parte sulla `8080` e ripiega sulla porta libera successiva; passa `--port <n>` per sceglierne un'altra.
- Più dettagli in [Risoluzione dei problemi](i18n/README.it.md#risoluzione-dei-problemi).

## Dove andare dopo

- [Home della documentazione](README.md): l'indice completo della documentazione.
- [Comandi](i18n/README.it.md#comandi): ogni sottocomando e flag.
- [Agent control](i18n/README.it.md#agent-control): il modello opt-in completo.
- [Configurazione](i18n/README.it.md#configurazione): cosa vive sotto `~/.reeves`.
- [docs/mcp.md](mcp.md): il design di Agent control e l'elenco degli strumenti.
