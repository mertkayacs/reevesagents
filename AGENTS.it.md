# AGENTS.md

[English](AGENTS.md) · [Deutsch](AGENTS.de.md) · [Français](AGENTS.fr.md) · [Español](AGENTS.es.md) · [Português](AGENTS.pt.md) · **Italiano** · [Türkçe](AGENTS.tr.md) · [Русский](AGENTS.ru.md) · [简体中文](AGENTS.zh-Hans.md) · [العربية](AGENTS.ar.md)

Come un agente di codifica IA guida ReevesAgents. Questo file è la guida dell'operatore per lo
strumento stesso. Non cambia il modo in cui gli agenti si comportano nei tuoi progetti.

ReevesAgents esegue CLI di codifica IA (Claude Code, Codex, Kimi, Qwen, OpenCode, Hermes e altri)
fianco a fianco, ciascuno come CLI reale nella sua finestra tmux. Un agente può generare, sterzare
e supervisionare gli altri. Lo stato vive in JSON locale sotto `~/.reeves`. Nessuna chiave API,
nessun database, nessun daemon in background.

## Due modi di usarlo

1. **Guida direttamente la CLI.** Esegui `reevesagents spawn ...` per avviare gli agenti, poi
   `runs`, `peek`, `send` e `stop` per osservarli e sterzarli. Buono per script e orchestrazione
   occasionale.
2. **Lascia che la tua CLI host guidi gli altri via MCP.** `reevesagents attach <cli>` dà a quella
   CLI una serie di strumenti di controllo degli agenti (spawn, send_text, read, kill, ...). Dopo
   che riavvii la CLI, una sola sessione può generare un team e dirigerlo. Questa è la funzione
   principale. Vedi [docs/mcp.md](docs/mcp.md).

## Controlla prima il setup

```sh
reevesagents doctor
```

Segnala tmux, Node, la cartella dello stato `~/.reeves` e quali CLI del provider sono installate
e CLI-compatibili (ispeziona l'output `--help` di ciascuna CLI). Non può testare se una CLI è
loggata, quindi una CLI installata ma scollegata passa ugualmente qui. Eseguilo prima di generare
così un run non fallisce per una CLI mancante; `peek` (sotto) cattura una finestra ferma su una
schermata di login. `reevesagents doctor --json` ritorna lo stesso come JSON leggibile da macchina.

Requisiti: Node 20.19+, tmux 3.0+ e almeno una CLI del provider installata e autenticata.
macOS, Linux o WSL (Windows nativo non è il target).

## Installa

```sh
pnpm add -g reevesagents     # o: npm install -g reevesagents
```

Esecuzione senza installazione: `pnpm dlx reevesagents doctor`.

## Genera agenti

Ogni agente è scritto come `provider[:nickname[:model]]`; nickname e model sono opzionali.
Il primo agente guida il run; gli altri vi si uniscono come worker.

```sh
# Un lead Claude Code, un secondo revisore Claude Code, due worker Codex, un worker Kimi.
reevesagents spawn cc:lead cc:review codex:api codex:tests kimi:docs \
  --name "feature x" --skip \
  --prompt "Costruisci la feature X. Lead coordina; ogni worker prende una sezione."
```

Prima di avviare qualcosa, `spawn` verifica che ogni CLI del provider nominato sia su PATH e
elenca qualsiasi mancanza, così un refuso o una CLI non installata fallisce velocemente invece
di metà-avviare un run. Su successo stampa l'id del run, l'id di ogni agente e i comandi esatti
`peek`/`send`/`open` per guidarli.

Flag utili per `spawn`: `--name <run>`, `--cwd <dir>` (di default la cartella corrente),
`--prompt <text>` (incollato in ogni agente all'avvio), `--skip` (avvia agenti senza i loro
stessi prompt di permesso; usalo quando nessun umano è lì per approvare), `--run <run-id>`
(aggiungi agenti a un run esistente invece di avviarne uno nuovo), `--json` (stampa i run
e gli id degli agenti come JSON invece di testo).

## Id del provider e alias

Esegui `reevesagents providers` (aggiungi `--json` per una lista da macchina). Qualsiasi alias
funziona come il provider in una spec di spawn.

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

## Osserva e sterzai agenti in esecuzione

```sh
reevesagents runs                      # elenca i run attivi (aggiungi --json per script)
reevesagents agents <run-id>           # elenca gli agenti in un run
reevesagents peek <agent-id> -n 40     # output recente da un agente
reevesagents send <agent-id> "do X"    # incolla testo al prompt dell'agente
reevesagents key <agent-id> enter      # invialo (send non invia da solo)
reevesagents interrupt <agent-id>      # ctrl-c l'agente
reevesagents open <run-id|agent-id>    # salta alla sua finestra tmux
```

`send` solo incolla; seguilo con `key <agent-id> enter` per inviare. Tasti accettati da
`key`: `enter`, `escape`, `backspace`, `tab`, `space`, `up`, `down`, `left`, `right`,
`ctrl-c`.

## Ferma pulito

```sh
reevesagents stop <run-id> --yes       # termina un intero run e demolisci la sua sessione tmux
reevesagents kill <agent-id> --yes     # termina un agente
```

`stop` e `kill` sono gli unici comandi distruttivi, così si rifiutano di girare senza
`--yes`.

## Un esempio pratico: cinque agenti, poi guidali

Lo scenario "installa reevesagents, genera due Claude, due Codex e un Kimi, e mettili al
lavoro" da inizio a fine.

```sh
# 1. Conferma che i cinque CLI sono installati e compatibili.
reevesagents doctor

# 2. Avvia il team. --skip così i worker non si fermano per i loro stessi prompt di permesso.
reevesagents spawn cc:lead cc:review codex:api codex:tests kimi:docs \
  --name "feature x" --skip \
  --prompt "Costruisci la feature X. Lead coordina; ogni worker possiede una sezione."

# 3. spawn stampa ogni id di agente. Elencali tutti, o leggi uno.
reevesagents agents <run-id>
reevesagents peek <agent-id> -n 40

# 4. Sterza: incolla un messaggio, poi invialo.
reevesagents send <agent-id> "rebase su main, poi esegui i test"
reevesagents key  <agent-id> enter

# 5. Aggiungi un worker allo stesso run dopo.
reevesagents spawn codex:perf --run <run-id> --skip --prompt "profila il percorso caldo"

# 6. Termina il run quando finito.
reevesagents stop <run-id> --yes
```

Guidandolo da una CLI host via MCP invece della shell, lo stesso scenario è un'istruzione:
"Usa reevesagents per avviare un team, un lead Claude Code, un secondo revisore Claude Code,
due worker Codex (api e tests) e un worker Kimi per docs. Salta i prompt di permesso, dai
loro il briefing, poi guarda e riporta i progressi." L'host chiama gli strumenti spawn/read/send
stesso. Vedi [docs/mcp.md](docs/mcp.md).

## Fai e non fare

Fai:

- Esegui `doctor` prima di un spawn e assicurati che ogni provider che nomini sia installato **e
  loggato**. doctor non può testare il login; se una finestra si blocca, `peek` mostra la
  schermata di login.
- Tratta `spawn` come fire-and-forget. Ritorna id, non risposte. Sonda con `runs`,
  `agents <run-id>` e `peek <agent-id> -n 40` per vedere cosa sta facendo un team.
- Invia input in due step: `send <agent-id> "..."` incolla, `key <agent-id> enter` invia.
- Passa `--skip` quando nessun umano siederà per approvare i prompt, o i worker si fermeranno
  al primo.
- Usa `--json` (su `spawn`, `runs`, `agents`, `providers`, `doctor`) quando uno script o un
  agente ha bisogno di leggere id e stato invece di testo.
- Nomina i provider per id o qualsiasi alias da `reevesagents providers` (`cc` o `claude`,
  `codex`, `kimi`, ...).

Non fare:

- Non aspettarti che `spawn` ti consegni il risultato di un agente; avvia il team, poi leggilo.
- Non inviare `send` e presumere che sia stato eseguito; nulla invia finché non fai `key <agent-id> enter`.
- Non generare un provider che è mancante o scollegato; spawn rifiuta il primo e il secondo
  lascia una finestra parcheggiata su un prompt di login che non fa mai il lavoro.
- Non eseguire `stop` o `kill` senza `--yes`; sono gli unici comandi distruttivi.
- Non target Windows nativo; esegui dentro WSL con tmux e le CLI installate lì.
- Non incollare segreti in un `--prompt` o `send`; l'output è catturato e mostrato via `peek`
  e la Web UI.

## Note di scripting

- `spawn`, `runs`, `agents`, `providers` e `doctor` accettano tutti `--json`.
- `spawn --json` stampa l'id del run e ogni id di agente; catturali, o leggili indietro
  da `runs --json` e `agents <run-id> --json`.
- Sovrascrivi la cartella dello stato con `REEVES_REGISTRY` e il file di configurazione con
  `REEVES_CONFIG` per mantenere un run con script isolato da `~/.reeves`.

## Altro

- [README](README.md): tour completo delle funzioni e ogni comando.
- [docs/GUIDE.md](docs/GUIDE.md): guida utente passo dopo passo.
- [docs/mcp.md](docs/mcp.md): il design di agent-control MCP e l'elenco degli strumenti.
