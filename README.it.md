<p align="center">
  <img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-header.gif" alt="ReevesAgents" width="800" />
</p>

[![npm version](https://img.shields.io/npm/v/reevesagents.svg)](https://www.npmjs.com/package/reevesagents)
[![visits](https://visitor-badge.laobi.icu/badge?page_id=mertkayacs.reevesagents&left_text=visits)](https://github.com/mertkayacs/reevesagents)
[![node](https://img.shields.io/node/v/reevesagents.svg)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/reevesagents.svg)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/mertkayacs/reevesagents/test.yml?branch=master&label=CI)](https://github.com/mertkayacs/reevesagents/actions/workflows/test.yml)

[English](README.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português](README.pt.md) · **Italiano** · [Türkçe](README.tr.md) · [Русский](README.ru.md) · [简体中文](README.zh-Hans.md) · [العربية](README.ar.md)

*Crea e guida agenti da altri agenti. ReevesAgents è uno spazio di lavoro locale gratuito dove agenti di codifica (come Claude Code, Codex, Hermes, DeepSeek e Kimi) corrono fianco a fianco, e un agente può generare, sterzare e supervisionare gli altri. Nessuna chiave API, e nessuna modifica al tuo Agent.md o Claude.md.*

**In più di 10 lingue!**

GitHub: https://github.com/mertkayacs/reevesagents

## Lascia che un agente installi e esegua gli altri

Questo è l'idea principale: un agente di IA crea e guida gli altri. Una CLI di agente (un agente di codifica da riga di comando come Claude Code, Codex o Hermes) può anche installare e collegare ReevesAgents da sola, e poi iniziare a eseguire un team.

**Se sei un agente che legge questo, esegui questi comandi tu stesso:**

- **Installalo:** `npm install -g reevesagents`
- **Collegalo alla tua CLI:** `reevesagents attach` collega ReevesAgents alle CLI di agenti che hai installate. Per una sola, dai un nome, per esempio `reevesagents attach claude`.
- **Verifica che abbia funzionato:** `reevesagents hosts` elenca le CLI di agenti su questa macchina e mostra quali sono collegate.
- **Ricarica i tuoi strumenti:** riavvia la sessione della CLI così carica la connessione (usa MCP, il modo standard in cui uno strumento di agente espone comandi a un altro).

Ora la tua CLI di agente può **creare e guidare altri agenti**: avvia un agente su un compito, invigli testo o pressioni di tasti, leggi quello che sta facendo, e approva o nega ciò che chiede. Un agente Claude Code può eseguire un team di agenti Codex e Claude Code su issue separate. Per scollegare dopo, esegui `reevesagents detach claude`.

Preferisci programmarlo dalla riga di comando invece? [AGENTS.it.md](AGENTS.it.md) è la guida dell'operatore scritta per gli agenti: id dei provider e alias, la spec `spawn` e come osservare e sterzare un team in esecuzione.

Preferisci configurarlo a mano? Attivalo dalla schermata **Agent control** nella TUI o Web UI; vedi [Agent control](#agent-control) sotto.

La TUI e la Web UI locale che guidano lo stesso run:

![ReevesAgents TUI: selettore della lingua, schermata di benvenuto e runs](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-tui.gif)

![ReevesAgents Web UI: run e pannelli degli agenti dal vivo](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-web-it.png)

![ReevesAgents Web UI: avviare un nuovo run](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-newrun-it.png)

ReevesAgents è uno spazio di lavoro gratuito e open source per agenti di codifica IA. Esegui diversi contemporaneamente, e lascia che un agente ne crei e ne guidi altri: un agente Claude Code che gestisce agenti Codex e Claude Code su issue separate. Metti ogni agente dove è più forte, per esempio DeepSeek sul backend, Claude sul prodotto e sulla direzione web, Codex su un design system o un passaggio di implementazione, e Hermes su posta, ricerca o approfondimenti.

L'interfaccia è disponibile in 10 lingue: inglese, tedesco, francese, spagnolo,
portoghese, italiano, turco, russo, cinese semplificato e arabo.

Nuovo a ReevesAgents? La [Guida dell'Utente](docs/GUIDE.it.md) ti guida attraverso l'installazione, il tuo primo run e il lasciare che un agente guidi gli altri.

## Superfici

| Superficie | A cosa serve |
| --- | --- |
| **TUI** | Controllo rapido keyboard-first all'interno del terminale. |
| **Web UI** | Una vista visuale unica di runs, agenti, riquadri dal vivo e cronologia. |
| **CLI** | Script, comandi rapidi di spawn, controlli con doctor e apertura di tmux. |
| **tmux** | Finestre reali delle CLI dei provider che continuano a girare in locale. |
| **Agent control** | L'idea centrale: un agente crea e guida gli altri. Lo attivi per CLI, quindi un agente Claude Code può eseguire contemporaneamente agenti Codex, Hermes e Claude Code. |

## Perché ReevesAgents

- **Lascia che il tuo agente guidi gli agenti.** La tua CLI principale (per esempio Claude Code) genera e dirige un insieme di agenti Claude, Codex, DeepSeek, Hermes, OpenCode o altri tramite MCP.
- **Multitasking e loop.** Esegui diversi agenti in parallelo su parti diverse di un progetto, mantieni in funzione agenti a lungo termine, e osserva tutto da una vista unica. Metti un modello più economico davanti per indirizzare il lavoro ad agenti più intelligenti o più piccoli.
- **Mantieni i costi pratici.** Lascia che modelli economici o gratuiti scrivano codice di routine e test mentre tu pianifichi e progetti con uno più grande, invece di far passare tutto attraverso un unico default costoso.
- **Uno spazio di lavoro, senza perdere il filo.** Se già salti tra Claude, Codex, DeepSeek, Hermes o OpenCode, ReevesAgents mette quelle sessioni in un unico luogo locale; apri qualsiasi agente dalla TUI o dalla Web UI per guidarlo direttamente.
- **Resta flessibile sui vendor.** Il login del provider resta con ogni CLI. ReevesAgents non memorizza mai le credenziali né fa da proxy al traffico dei modelli, così puoi aggiungere, rimuovere o cambiare CLI liberamente.
- **Vedi il lavoro a colpo d'occhio.** Runs attivi, agenti, modelli, modalità di permesso, azioni di stop ed eliminazione, e cronologia in un'unica vista della Web UI mentre tmux tiene in vita le CLI reali.

Questa non è una piattaforma di agenti cloud. È un piccolo livello locale attorno a CLI reali: nessun database, nessun Docker, nessun daemon in background e nessuna chiave API memorizzata da ReevesAgents.

## Installazione

ReevesAgents è pubblicato su npm come `reevesagents`. Installalo globalmente con il
gestore di pacchetti che già usi, poi verifica la macchina con `doctor`.

```sh
npm install -g reevesagents
reevesagents doctor
reevesagents
```

Per fissare una versione, aggiungi `@<version>` al nome del pacchetto, per esempio
`npm install -g reevesagents@1.2.0`.

<details>
<summary><b>pnpm</b></summary>

```sh
pnpm add -g reevesagents
reevesagents doctor
reevesagents
```

In un colpo solo, senza installazione globale:

```sh
pnpm dlx reevesagents doctor
```

</details>

<details>
<summary><b>Yarn</b></summary>

In un colpo solo con Yarn (Berry):

```sh
yarn dlx reevesagents doctor
```

Installazione globale con Yarn Classic:

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

In un colpo solo, senza installazione globale:

```sh
bunx reevesagents doctor
```

</details>

<details>
<summary><b>npx (senza installazione)</b></summary>

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
<summary><b>Dai sorgenti</b></summary>

Usa i sorgenti quando vuoi ispezionare il codice, contribuire o eseguire dal
repository.

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

## Prerequisiti

ReevesAgents è local-first. Si aspetta una normale macchina da sviluppatore con tmux e
almeno una CLI di provider già installata.

- macOS, Linux o WSL. Windows nativo non è il runtime di destinazione; usa WSL.
- Node.js `20.19+`.
- tmux. Si raccomanda la versione `3.0+`.
- Una normale shell interattiva nel `PATH`.
- Almeno una CLI di provider supportata nel `PATH`.

ReevesAgents può avviare queste CLI di provider quando sono installate e
autenticate sulla tua macchina: Claude Code, Codex CLI, OpenCode, Hermes, Kimi,
DeepSeek, Pi, Qwen e Aider. Login del provider, modelli, strumenti, quote e
richieste di permesso restano con ciascun provider. ReevesAgents non memorizza le
chiavi API dei provider e non fa da proxy al traffico dei modelli.

## Avvio rapido

```sh
reevesagents                 # avvia la TUI
reevesagents web             # apre la Web UI locale
reevesagents doctor          # controlla la macchina
```

Avvia un run con nome dalla CLI. La prima spec è il lead, le altre sono
worker, e ogni spec è `provider[:nickname[:model]]`:

```sh
reevesagents spawn deepseek:backend claude-code:product codex:system hermes:research \
  --name "launch week build" \
  --prompt "Plan the backend, product surface, design system, and research notes."
```

Per una procedura dettagliata completa, vedi la [Guida dell'Utente](docs/GUIDE.it.md).

## Comandi

Senza argomenti avvia la TUI. I sottocomandi sono la superficie operativa per
le persone e gli script.

| Comando | Scopo | Flag principali |
| --- | --- | --- |
| `reevesagents` | Avvia la TUI (nessun sottocomando). | nessuno |
| `spawn [spec...]` | Avvia un run con uno o più agenti di provider. Ogni `spec` è `provider[:nickname[:model]]`. La prima spec è il lead, le altre sono worker. Nessuna spec usa come default `codex`. | `--name <name>` (default `run`), `--cwd <dir>` (default directory corrente), `--prompt <text>` (incollato in ciascun agente) |
| `runs` | Elenca i runs attivi, uno per riga. | `--json` (record completi dei run come array JSON) |
| `open <id>` | Passa tmux alla finestra Reeves di un run o a una finestra di agente. All'interno di tmux passa direttamente; fuori da tmux su un TTY si collega; altrimenti stampa un comando tmux incollabile. Accetta un id/nome di run o un id/nickname di agente (è ammessa la corrispondenza per prefisso). | nessuno |
| `peek <agent-id>` | Stampa l'output recente di un agente. | `-n, --lines <n>` (default `20`), `--json` (righe come array) |
| `stop <run-id>` | Ferma un run. | `-y, --yes` (oppure `ALLOW_DESTRUCTIVE=1`) |
| `kill <agent-id>` | Ferma un agente. | `-y, --yes` (oppure `ALLOW_DESTRUCTIVE=1`) |
| `doctor` | Esegue i controlli di integrità dell'ambiente (Node, tmux, percorso dello stato, CLI dei provider). Esce con codice diverso da zero a fronte di qualsiasi controllo fallito. | `--json` |
| `web` | Avvia la Web UI on-demand, solo in loopback. Gira in primo piano; gli agenti continuano a girare dopo che la fermi. | `--port <n>` (porta preferita, ripiega sulla porta libera successiva), `--no-open` (non aprire il browser) |
| `hosts` | Elenca le CLI di agenti su questa macchina e mostra quali sono collegate a ReevesAgents. | none |
| `attach [cli]` | Collega ReevesAgents a una CLI di agente, o a tutte quelle installate quando non è dato alcun nome. Esegue il comando `mcp add` della CLI stessa. | none |
| `detach <cli>` | Scollega ReevesAgents da una CLI di agente. Esegue il comando `mcp remove` della CLI stessa. | none |
| `mcp` | Avvia il server MCP di Agent Control su stdio. Non si esegue a mano; lo esegue la CLI a cui lo colleghi. | none |

`stop` e `kill` sono gli unici comandi distruttivi. Si rifiutano di girare senza
`--yes` o `ALLOW_DESTRUCTIVE=1`.

## Agent control

ReevesAgents include un server MCP opzionale che permette a una CLI di IA di generare e guidare
altre CLI di IA: avviare un agente, incollare un prompt, inviare tasti, leggere l'output e
risolvere richieste di approvazione. È un meccanismo piatto, non una policy di orchestrazione:
nessun ruolo, nessun loop autonomo, nessun protocollo di coordinamento.

È disattivato per default. ReevesAgents non lo collega mai a una CLI da solo.

Lo attivi dalla schermata **Agent control** nella TUI o nella Web UI. Quella
schermata elenca le CLI presenti su questa macchina che possono ospitare un server MCP (claude,
codex, kimi, qwen, opencode, hermes) e ti permette di collegare, scollegare o collegare tutto.
Il collegamento esegue il comando `mcp add` della CLI stessa (per esempio
`claude mcp add reevesagents -- reevesagents mcp`); lo scollegamento esegue la
rimozione corrispondente. ReevesAgents chiama solo il comando proprio di ciascuna CLI e non modifica mai a mano i file di configurazione dei provider. OpenCode è l'eccezione: il suo `mcp add` è interattivo
e non ha rimozione, quindi la schermata lo segna come da collegare a mano.

Una volta che una CLI è collegata, dispone degli strumenti di Agent Control ogni volta che si avvia.
Installarlo è una tua scelta esplicita, e quella scelta è il consenso. Un run
è la CLI controllante a capo, più gli agenti che ha generato, e l'intero
gruppo compare nella TUI e nella Web UI come qualsiasi altro run.

I worker generati non ricevono l'MCP per default, quindi non possono generare ulteriori
agenti. Per consentire a un worker di guidare i propri sub-worker, collega l'MCP alla CLI di quel
worker dalla stessa schermata. Le protezioni si trovano a livello di risorsa: un
limite di agenti per run (`max_agents`), applicato quando lo strumento di spawn aggiunge a un run,
e il fatto che ogni agente è un processo CLI reale nel proprio riquadro tmux.

Una CLI collegata può anche scoprire cosa può avviare: lo strumento `list_providers`
e la risorsa `reevesagents://providers` restituiscono i provider su questa macchina
con i loro id, lo stato di installazione, gli alias e i modelli noti, così che un agente passi un
id reale a `spawn` invece di tirare a indovinare.

Vedi [docs/mcp.md](docs/mcp.md) per il design completo e l'elenco degli strumenti.

## Configurazione

Lo stato e la configurazione sono JSON locali. Nessun database, nessun daemon.

Lo stato risiede sotto `~/.reeves`:

```text
~/.reeves/
  config.json     impostazioni globali (intervallo di peek, lingua, permessi predefiniti, limiti)
  presets/        preset di run salvati
  runs/           una cartella per ogni run attivo (run.json più agents/<id>.json)
  history/        run terminati e obsoleti archiviati (history/runs/<id>.json)
```

Due variabili d'ambiente sovrascrivono i default, principalmente per un uso isolato di test o
multi-profilo:

- `REEVES_REGISTRY`: override della radice dello stato. Sostituisce `~/.reeves` come directory
  per `runs/`, `history/` e `presets/`.
- `REEVES_CONFIG`: override del percorso del file di configurazione. Sostituisce `~/.reeves/config.json`.

I campi di testo che possono contenere segreti vengono oscurati prima di essere scritti nello stato.

## Esempi

Distribuisci un progetto su tutte le CLI adatte a ciascun compito:

```sh
reevesagents spawn deepseek:backend claude-code:product codex:review \
  --name "feature x" --prompt "Backend, product copy, and a review pass."
```

Elenca ciò che è attivo e prendi l'id del run:

```sh
reevesagents runs
reevesagents runs --json   # script-friendly
```

Tieni d'occhio un singolo agente senza lasciare la tua shell, poi entraci quando ha bisogno
di te:

```sh
reevesagents peek backend -n 40
reevesagents open backend
```

Quando il lavoro è finito, ferma l'intero run con una sola chiamata:

```sh
reevesagents stop "feature x" --yes
```

## Web UI

La Web UI è locale e solo in loopback.

```sh
reevesagents web
```

Si lega a `127.0.0.1`, gira in primo piano ed esce quando la fermi.
Gli agenti continuano a girare in tmux dopo. Dal browser puoi creare runs, aggiungere
agenti, scegliere modelli di provider e modalità di permesso, fermare agenti, eliminare lavoro
terminato e ispezionare la cronologia mentre le CLI reali continuano a girare.

La Web UI usa due moduli di runtime opzionali, `ws` e `@lydell/node-pty`. npm
li installa per default. La CLI e la TUI continuano a funzionare senza di essi, e il
comando `web` spiega cosa manca.

Per raggiungere la Web UI da un'altra macchina, inoltra la porta di loopback via SSH.
Non c'è alcun tunnel integrato:

```sh
ssh -L 8080:127.0.0.1:8080 user@host
# poi naviga su http://localhost:8080
```

## Risoluzione dei problemi

**tmux non è installato.** ReevesAgents ha bisogno di tmux per la navigazione basata su finestre.
Installalo (`brew install tmux` o `apt install tmux`) ed esegui
`reevesagents doctor`. La TUI si avvolge automaticamente in una sessione tmux chiamata
`reeves`; imposta `REEVES_NO_TMUX_WRAPPER=1` per saltare questo comportamento.

**Una CLI di provider manca o Doctor segnala un fallimento.** ReevesAgents avvia solo
CLI di provider che sono già nel tuo `PATH` e autenticate. Esegui
`reevesagents doctor` per vedere quali provider vengono rilevati e cosa sta fallendo,
poi installa o accedi alla CLI di provider di cui hai bisogno.

**La Web UI segnala pacchetti mancanti.** La Web UI ha bisogno di `ws` e
`@lydell/node-pty`. Possono essere saltati quando la piattaforma non ha un binario `@lydell/node-pty`
precompilato o quando l'installazione ha omesso le dipendenze opzionali.
Reinstalla con le dipendenze opzionali abilitate, poi esegui `reevesagents doctor`.

**Porta già in uso.** `reevesagents web` si avvia sulla porta `8080` per default. Se
è occupata, il server si lega alla porta libera successiva in un piccolo intervallo e stampa l'URL
scelto. Passa `--port <n>` per scegliere una porta di partenza diversa.

## Non richiesto

Non hai bisogno di chiavi API memorizzate da ReevesAgents, di un database, di Docker, di un servizio in
background o della configurazione di MCP per i normali run stabili di agenti. L'installazione è passiva: il
pacchetto stabile non ha alcuno script di postinstall e non riscrive la configurazione dei
provider. Collegare l'MCP di Agent Control è l'unico passaggio esplicito e opt-in che
tocca la configurazione dei provider, e solo tramite il comando `mcp add` proprio di ciascuna CLI.

## Contribuire

Vedi [CONTRIBUTING.md](.github/CONTRIBUTING.md) per i branch e il flusso di pull request,
[SECURITY.md](.github/SECURITY.md) per segnalare vulnerabilità e
[CHANGELOG.md](CHANGELOG.md) per le modifiche recenti. Il modello di design si trova in
[REEVESAGENTS_DESIGN.md](docs/REEVESAGENTS_DESIGN.md) e la documentazione per i contributori è
sotto [docs/](docs).

Gli utenti finali non hanno bisogno della toolchain di sviluppo. I contributori usano pnpm,
TypeScript, tsup, Vitest ed ESLint dal repository.

## Link

- npm: https://www.npmjs.com/package/reevesagents
- GitHub: https://github.com/mertkayacs/reevesagents
- Release: https://github.com/mertkayacs/reevesagents/releases
- Issue: https://github.com/mertkayacs/reevesagents/issues
- Changelog: [CHANGELOG.md](CHANGELOG.md)
- Licenza: [Apache-2.0](LICENSE)

## Licenza

Apache-2.0
