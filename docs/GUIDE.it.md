# Guida dell'Utente di ReevesAgents

[English](GUIDE.md) · [Deutsch](GUIDE.de.md) · [Français](GUIDE.fr.md) · [Español](GUIDE.es.md) · [Português](GUIDE.pt.md) · **Italiano** · [Türkçe](GUIDE.tr.md) · [Русский](GUIDE.ru.md) · [简体中文](GUIDE.zh-Hans.md) · [العربية](GUIDE.ar.md)

Una procedura dettagliata passo dopo passo: installalo, fai il tuo primo run, e lascia che un agente guidi gli altri. Per il riferimento completo dei comandi e delle opzioni, vedi il [README](../README.it.md).

## Cos'è ReevesAgents

- Uno spazio di lavoro libero e locale per agenti di codifica IA (Claude Code, Codex, Hermes, DeepSeek, Kimi e altri). Girano fianco a fianco sulla tua macchina.
- L'idea principale: un agente crea e guida gli altri. Un agente Claude Code può avviare e sterzare un team di agenti Codex e Claude Code su attività separate.
- Gira in cima alle CLI reali che già hai. Il login del provider resta con ogni CLI. ReevesAgents non memorizza le chiavi API e non fa mai da proxy al traffico del modello.
- Nessun database, nessun Docker, nessun servizio in background. Lo stato è JSON locale sotto `~/.reeves`.

## Prima di iniziare

- macOS, Linux o WSL (Windows nativo non è il target; usa WSL).
- Node.js 20.19 o più recente.
- tmux 3.0 o più recente.
- Almeno una CLI del provider installata e loggata: Claude Code, Codex, OpenCode, Hermes, Kimi, DeepSeek, Pi, Qwen o Aider.

## Installa e verifica

- Installalo globalmente: `npm install -g reevesagents`
- Verifica la tua macchina: `reevesagents doctor` (verifica Node, tmux, la cartella dello stato e quali CLI del provider riesce a vedere).
- Avvialo: `reevesagents`
- Preferisci pnpm, Yarn, Bun, npx o Homebrew? Vedi [Installazione](../README.it.md#installazione) nel README.

## Il tuo primo run

Il run più rapido e riproducibile è da riga di comando. Un run ha un agente lead e un numero qualsiasi di worker; ogni agente è scritto come `provider[:nickname[:model]]`:

```sh
reevesagents spawn claude-code:lead codex:worker \
  --name "first run" \
  --prompt "Say hello and list the files in this folder."
```

- `claude-code:lead` è il lead, `codex:worker` è un worker. Senza un agente denominato, il run usa come default `codex`.
- `--name` etichetta il run, `--cwd` imposta la cartella di lavoro (di default dove sei), e `--prompt` è incollato in ogni agente.

Preferisci un avvio visuale? Esegui `reevesagents` per la TUI o `reevesagents web` per la Web UI locale e crea il run da lì.

## I quattro modi di usarlo

Raggiungi gli stessi run attraverso quattro superfici. Scegli quella che si adatta al momento:

- **TUI** (`reevesagents`): controllo veloce, keyboard-first dentro il terminale.
- **Web UI** (`reevesagents web`): una vista visuale unica di run, agenti, riquadri dal vivo e cronologia. Locale e solo loopback.
- **CLI** (`reevesagents spawn`, `runs`, `peek`, `open`, `stop`): script, comandi rapidi e controlli di integrità.
- **tmux**: ogni agente è una CLI reale nel suo riquadro tmux, così le sessioni continuano a girare localmente anche dopo che chiudi la TUI o la Web UI.

## Lascia che un agente guidi gli altri

Questa è la funzione principale, e rimane disattivata finché non la attivi.

- Attivala per la tua CLI: `reevesagents attach claude` (o `reevesagents attach` per connettere ogni CLI installata che riesce a ospitare). Puoi fare questo anche dalla schermata **Agent control** nella TUI o nella Web UI.
- Confermalo: `reevesagents hosts` elenca le CLI sulla tua macchina e mostra quali sono collegate.
- Ricarica la tua CLI: riavvia la sessione così carica i nuovi strumenti (utilizza MCP, il modo standard in cui uno strumento di agente espone comandi a un altro).
- Ora il tuo agente può creare e guidare altri agenti: avvia un agente su un compito, invigli testo o pressioni di tasti, leggi cosa sta facendo, e approva o nega ciò che chiede.

Un esempio pratico: collega Claude Code, riavvialo, e da dentro una sessione Claude Code puoi avviare un agente Codex su un issue e un secondo agente Claude Code su un altro, quindi guarda e sterzali entrambi.

- CLI che possono ospitarlo oggi: claude, codex, kimi, qwen, opencode, hermes. OpenCode si collega a mano, poiché il suo passaggio di aggiunta è interattivo.
- I worker non ricevono questi strumenti per default, così un worker non può avviare altri agenti. Per permettere a un worker di guidare i suoi sub-agenti, collega l'MCP alla CLI di quel worker anche.
- Per disconnettere dopo: `reevesagents detach claude`.

## Attività quotidiane

- Vedi cosa sta girando: `reevesagents runs` (aggiungi `--json` per gli script).
- Guarda un agente senza lasciare la tua shell: `reevesagents peek <agent> -n 40`.
- Salta nel riquadro tmux di un agente: `reevesagents open <agent>`.
- Ferma un run intero: `reevesagents stop <run> --yes`.
- Ferma un singolo agente: `reevesagents kill <agent> --yes`.
- `stop` e `kill` sono gli unici comandi che terminano il lavoro, così si rifiutano di girare senza `--yes`.

## Tenere i costi bassi

- Metti un modello più economico o gratuito davanti per instradare il lavoro, e affidalo a un agente più forte solo quando necessario.
- Lascia che modelli economici scrivano codice di routine e test mentre tu pianifichi e progetti con uno più grande, invece di far passare tutto attraverso un unico default costoso.
- Le quote e la fatturazione dei provider restano con ogni CLI. ReevesAgents non aggiunge alcun costo proprio.

## Quando qualcosa sembra sbagliato

- Esegui `reevesagents doctor` per primo. Verifica Node, tmux, la cartella dello stato e le tue CLI del provider, e ti dice cosa sta fallendo.
- **tmux manca:** installalo (`brew install tmux` o `apt install tmux`) ed esegui doctor di nuovo.
- **Un provider non viene rilevato:** ReevesAgents avvia solo le CLI che sono nel tuo `PATH` e loggato. Installa o accedi a quella CLI.
- **La Web UI segnala pacchetti mancanti:** ha bisogno di `ws` e `@lydell/node-pty`. Reinstalla con le dipendenze opzionali abilitate.
- **Porta già in uso:** `reevesagents web` si avvia sulla porta `8080` e torna indietro alla prossima porta libera; passa `--port <n>` per sceglierne un'altra.
- Più dettagli in [Risoluzione dei problemi](../README.it.md#risoluzione-dei-problemi).

## Dove andare dopo

- [Home della documentazione](README.md): l'indice completo della documentazione.
- [Comandi](../README.it.md#comandi): ogni sottocomando e flag.
- [Agent control](../README.it.md#agent-control): il modello opt-in completo.
- [Configurazione](../README.it.md#configurazione): cosa vive sotto `~/.reeves`.
- [docs/mcp.md](mcp.md): il design di Agent control e l'elenco degli strumenti.
