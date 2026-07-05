# AGENTS.md

[English](AGENTS.md) · [Deutsch](AGENTS.de.md) · [Français](AGENTS.fr.md) · [Español](AGENTS.es.md) · [Português](AGENTS.pt.md) · **Italiano** · [Türkçe](AGENTS.tr.md) · [Русский](AGENTS.ru.md) · [简体中文](AGENTS.zh-Hans.md) · [العربية](AGENTS.ar.md)

Come un agente di codifica IA guida ReevesAgents. Questo file è la guida dell'operatore per lo
strumento stesso. Non cambia il modo in cui gli agenti si comportano nei tuoi progetti.

ReevesAgents esegue CLI di codifica IA (Claude Code, Codex, Kimi, Qwen, OpenCode, Hermes e
altre) fianco a fianco, ciascuna come CLI reale nella propria finestra tmux. Un agente può
generare, sterzare e supervisionare gli altri. Lo stato vive in JSON locale sotto `~/.reeves`.
Nessuna chiave API, nessun database, nessun daemon in background.

## Due modi di usarlo

1. **Guida direttamente la CLI.** Esegui `reevesagents spawn ...` per avviare gli agenti, poi
   `runs`, `peek`, `send` e `stop` per osservarli e sterzarli. Adatto a script e orchestrazione
   occasionale.
2. **Lascia che la tua CLI host guidi le altre via MCP.** `reevesagents attach <cli>` dà a quella
   CLI una serie di strumenti di controllo degli agenti (spawn, send_text, read, kill, ...). Dopo
   il riavvio della CLI, una singola sessione può generare un team e dirigerlo. Questa è la
   funzione principale. Vedi [docs/mcp.md](docs/mcp.md).

## Controlla prima il setup

```sh
reevesagents doctor
```

Segnala tmux, Node, la cartella dello stato `~/.reeves` e quali CLI dei provider sono installate
e CLI-compatibili (ispeziona l'output `--help` di ciascuna). Non può verificare se una CLI è
loggata, quindi una CLI installata ma senza login qui passa comunque. Eseguilo prima di generare,
così un run non fallisce per una CLI mancante; `peek` (sotto) intercetta una finestra rimasta
ferma su una schermata di login. `reevesagents doctor --json` restituisce lo stesso risultato
in JSON leggibile da macchina.

Requisiti: Node 20.19+, tmux 3.0+ e almeno una CLI di provider installata e autenticata.
macOS, Linux o WSL (Windows nativo non è il target).

## Installa

```sh
pnpm add -g reevesagents     # o: npm install -g reevesagents
```

Esecuzione senza installazione: `pnpm dlx reevesagents doctor`.

## Genera agenti

Ogni agente si scrive come `provider[:nickname[:model]]`; nickname e model sono opzionali.
Il primo agente guida il run; gli altri vi si uniscono come worker.

```sh
# Un lead Claude Code, un secondo revisore Claude Code, due worker Codex, un worker Kimi.
reevesagents spawn cc:lead cc:review codex:api codex:tests kimi:docs \
  --name "feature x" --skip \
  --prompt "Costruisci la feature X. Il lead coordina; ogni worker prende una sezione."
```

Prima di avviare qualsiasi cosa, `spawn` verifica che ogni CLI di provider nominata sia su PATH
e segnala per nome quelle mancanti, così un refuso o una CLI non installata fallisce subito
invece di avviare un run a metà. In caso di successo stampa l'id del run, l'id di ogni agente e
i comandi esatti `peek`/`send`/`open` per guidarli.

Flag utili di `spawn`: `--name <run>`, `--cwd <dir>` (di default la cartella corrente),
`--prompt <text>` (incollato in ogni agente all'avvio), `--skip` (avvia gli agenti senza i loro
prompt di permesso; usalo quando non c'è un umano pronto ad approvare), `--run <run-id>`
(aggiunge agenti a un run esistente invece di avviarne uno nuovo), `--extra-args <args>`
(flag aggiunti al lancio di ogni agente, per opzioni di provider che ReevesAgents non prevede,
per esempio `--remote-control`), `--json` (stampa gli id del run e degli agenti come JSON invece
che come testo).

## Id del provider e alias

Esegui `reevesagents providers` (aggiungi `--json` per un elenco leggibile da macchina).
Qualsiasi alias funziona come provider in una spec di spawn.

| id         | provider     | alias comuni                |
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

## Osserva e sterza gli agenti in esecuzione

```sh
reevesagents runs                      # elenca i run attivi (aggiungi --json per gli script)
reevesagents agents <run-id>           # elenca gli agenti di un run
reevesagents peek <agent-id> -n 40     # output recente di un agente
reevesagents send <agent-id> "do X"    # incolla testo al prompt dell'agente
reevesagents key <agent-id> enter      # lo invia (send da solo non invia)
reevesagents interrupt <agent-id>      # manda ctrl-c all'agente
reevesagents open <run-id|agent-id>    # salta alla sua finestra tmux
reevesagents approvals                 # richieste di approvazione in sospeso (aggiungi --json)
reevesagents approve <approval-id>     # ne risolve una; deny <approval-id> la nega
```

`send` si limita a incollare; fallo seguire da `key <agent-id> enter` per inviare. Tasti
accettati da `key`: `enter`, `escape`, `backspace`, `tab`, `space`, `up`, `down`, `left`,
`right`, `ctrl-c`.

## Ferma in modo pulito

```sh
reevesagents stop <run-id> --yes       # termina un intero run e smonta la sua sessione tmux
reevesagents kill <agent-id> --yes     # termina un singolo agente
```

`stop` e `kill` si rifiutano di girare senza `--yes`. La stessa protezione vale anche per la
pulizia: `delete <agent-id>` e `delete-run <run-id>` rimuovono i record terminati, e
`delete-history <id>` rimuove un record archiviato.

## Un esempio pratico: cinque agenti, poi guidali

Lo scenario "installa reevesagents, genera due Claude, due Codex e un Kimi, e mettili al
lavoro" dall'inizio alla fine.

```sh
# 1. Conferma che le cinque CLI siano installate e compatibili.
reevesagents doctor

# 2. Avvia il team. --skip così i worker non si fermano ai propri prompt di permesso.
reevesagents spawn cc:lead cc:review codex:api codex:tests kimi:docs \
  --name "feature x" --skip \
  --prompt "Costruisci la feature X. Il lead coordina; ogni worker possiede una sezione."

# 3. spawn stampa l'id di ogni agente. Elencali tutti o leggine uno.
reevesagents agents <run-id>
reevesagents peek <agent-id> -n 40

# 4. Sterza: incolla un messaggio, poi invialo.
reevesagents send <agent-id> "rebase su main, poi esegui i test"
reevesagents key  <agent-id> enter

# 5. Aggiungi più tardi un worker allo stesso run.
reevesagents spawn codex:perf --run <run-id> --skip --prompt "profila il percorso caldo"

# 6. Termina il run a lavoro finito.
reevesagents stop <run-id> --yes
```

Guidato da una CLI host via MCP invece che dalla shell, lo stesso scenario diventa una sola
istruzione: "Usa reevesagents per avviare un team, un lead Claude Code, un secondo revisore
Claude Code, due worker Codex (api e tests) e un worker Kimi per docs. Salta i prompt di
permesso, dai loro il briefing, poi osserva e riferisci i progressi." È l'host stesso a chiamare
gli strumenti spawn/read/send. Vedi [docs/mcp.md](docs/mcp.md).

## Fai e non fare

Fai:

- Esegui `doctor` prima di uno spawn e assicurati che ogni provider che nomini sia installato
  **e loggato**. doctor non può verificare il login; se una finestra si blocca, `peek` mostra
  la schermata di login.
- Tratta `spawn` come fire-and-forget. Restituisce id, non risposte. Controlla con `runs`,
  `agents <run-id>` e `peek <agent-id> -n 40` per vedere cosa sta facendo un team.
- Invia l'input in due passaggi: `send <agent-id> "..."` incolla, `key <agent-id> enter` invia.
- Passa `--skip` quando nessun umano sarà lì ad approvare i prompt, altrimenti i worker si
  bloccano al primo.
- Usa `--json` (su `spawn`, `runs`, `agents`, `providers`, `doctor`) quando uno script o un
  agente deve leggere id e stato invece di testo.
- Nomina i provider per id o con qualsiasi alias di `reevesagents providers` (`cc` o `claude`,
  `codex`, `kimi`, ...).

Non fare:

- Non aspettarti che `spawn` ti consegni il risultato di un agente; avvia il team, poi leggilo.
- Non fare `send` dando per scontato che sia partito; nulla viene inviato finché non fai
  `key <agent-id> enter`.
- Non generare un provider assente o senza login; spawn rifiuta il primo, e il secondo lascia
  una finestra parcheggiata su un prompt di login che non farà mai il lavoro.
- Non eseguire `stop`, `kill` o i comandi `delete` senza `--yes`; sono quelli distruttivi.
- Non puntare a Windows nativo; lavora dentro WSL con tmux e le CLI installate lì.
- Non incollare segreti in un `--prompt` o in un `send`; l'output viene catturato e mostrato
  tramite `peek` e la Web UI.

## Note di scripting

- `spawn`, `runs`, `agents`, `providers` e `doctor` accettano tutti `--json`.
- `spawn --json` stampa l'id del run e ogni id di agente; catturali, oppure rileggili da
  `runs --json` e `agents <run-id> --json`.
- Sovrascrivi la cartella dello stato con `REEVES_REGISTRY` e il file di configurazione con
  `REEVES_CONFIG`, così un run lanciato da script resta isolato da `~/.reeves`.

## Altro

- [README](README.md): il tour completo delle funzioni e ogni comando.
- [docs/GUIDE.md](docs/GUIDE.md): la guida utente passo dopo passo.
- [docs/mcp.md](docs/mcp.md): il design dell'MCP di Controllo agenti e l'elenco degli strumenti.
