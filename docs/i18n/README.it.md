<p align="center">
  <a href="https://reevesagents.mertkayacs.com">
    <img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-header.gif" alt="ReevesAgents" width="800" />
  </a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/reevesagents"><img src="https://img.shields.io/npm/v/reevesagents.svg" alt="npm version" /></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/node/v/reevesagents.svg" alt="node" /></a>
  <a href="../../LICENSE"><img src="https://img.shields.io/npm/l/reevesagents.svg" alt="license" /></a>
  <a href="https://github.com/mertkayacs/reevesagents/actions/workflows/test.yml"><img src="https://img.shields.io/github/actions/workflow/status/mertkayacs/reevesagents/test.yml?branch=master&label=CI" alt="CI" /></a>
</p>

<p align="center">
  <a href="https://reevesagents.mertkayacs.com/demo"><b>Demo</b></a> ·
  <a href="https://reevesagents.mertkayacs.com/docs"><b>Documentazione</b></a> ·
  <a href="https://reevesagents.mertkayacs.com/faq"><b>FAQ</b></a> ·
  <a href="https://github.com/mertkayacs/reevesagents/issues"><b>Issue</b></a>
</p>

[English](../../README.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português](README.pt.md) · **Italiano** · [Türkçe](README.tr.md) · [Русский](README.ru.md) · [简体中文](README.zh-Hans.md) · [العربية](README.ar.md)

ReevesAgents è uno spazio di lavoro locale per le CLI di coding AI. Fa girare
Claude Code, Codex, OpenCode, Hermes, Kimi, DeepSeek, Qwen, Pi, Aider e altre CLI
di provider fianco a fianco in tmux. Puoi usarlo come una normale CLI/TUI/Web UI,
oppure collegare il suo MCP opt-in, così un agente può avviare, leggere, dirigere e
fermare gli altri.

L'accesso di ogni provider resta nella sua CLI. ReevesAgents tiene il proprio stato in pochi
file JSON sotto `~/.reeves` e resta attivo solo mentre lo usi tu o una CLI collegata.

## Avvio rapido

```sh
pnpm add -g reevesagents
reevesagents doctor
reevesagents
```

Avvia un run dalla CLI:

```sh
reevesagents spawn claude-code:lead codex:tests hermes:research \
  --name "release check" \
  --prompt "Review the release path, test coverage, and docs."
```

Apri la Web UI:

```sh
reevesagents web
```

Lascia che un agente collegato guidi gli altri:

```sh
reevesagents attach codex
reevesagents hosts
```

Dopo `attach`, riavvia quella CLI perché carichi gli strumenti MCP.

## Cosa ti offre

| Interfaccia | A cosa serve |
| --- | --- |
| **TUI** | Controllo dei run da tastiera, dentro il terminale. |
| **Web UI** | Vista locale di run, pannelli, agenti, approvazioni e cronologia. |
| **CLI** | Script, controlli rapidi, avvio di agenti, pulizia dello stato e salti in tmux. |
| **MCP di Controllo agenti** | Una CLI di cui ti fidi avvia e guida altre CLI tramite strumenti locali. |
| **tmux** | Finestre con le vere CLI dei provider, che restano attive anche dopo la chiusura della UI. |

ReevesAgents è locale per scelta di progetto. Lo stato è semplice JSON sotto
`~/.reeves`, e le CLI che avvia sono le stesse che già usi a mano.

<a id="install"></a>
<details>
<summary><strong>Installazione</strong></summary>

ReevesAgents richiede Node.js `20.19+`, tmux `3.0+` e almeno una CLI di provider
supportata, installata e autenticata. Gira su macOS, Linux e WSL.

```sh
# Homebrew
brew tap mertkayacs/reevesagents
brew install reevesagents

# pnpm
pnpm add -g reevesagents

# npm
npm install -g reevesagents

# one-shot checks
pnpm dlx reevesagents doctor
npx reevesagents doctor
```

Per bloccare una versione, sostituisci `<version>`:

```sh
pnpm add -g reevesagents@<version>
```

Installazione dai sorgenti:

```sh
git clone https://github.com/mertkayacs/reevesagents.git
cd reevesagents
pnpm install
pnpm build
pnpm link --global
reevesagents doctor
```

</details>

<a id="screenshots"></a>
<details>
<summary><strong>Screenshot</strong></summary>

La TUI e la Web UI guidano gli stessi run locali:

![ReevesAgents TUI: selettore della lingua, menu di benvenuto e doctor](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-tui.gif)

![ReevesAgents Web UI: run e pannelli degli agenti dal vivo](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-web-it.png)

![ReevesAgents Web UI: avvio di un nuovo run](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-newrun-it.png)

</details>

<a id="commands"></a>
<details>
<summary><strong>Comandi</strong></summary>

Senza argomenti si apre la TUI.

| Comando | A cosa serve |
| --- | --- |
| `reevesagents` | Apre la TUI. |
| `spawn [spec...]` | Avvia un run. Ogni spec è `provider[:nickname[:model]]`. |
| `add [spec...]` | Aggiunge agenti al run attivo più recente. |
| `runs` | Elenca i run attivi. |
| `agents [run-id]` | Elenca gli agenti di tutti i run o di un singolo run. |
| `open <id>` | Porta alla finestra tmux di un run o di un agente. |
| `peek <agent-id>` | Stampa l'output recente di un agente. |
| `send <agent-id> <text...>` | Incolla testo in un agente senza inviarlo. |
| `key <agent-id> <key>` | Invia `enter`, `escape`, le frecce, `tab`, `space`, `backspace` o `ctrl-c`. |
| `interrupt <agent-id>` | Invia Ctrl-C a un agente. |
| `stop <run-id>` | Ferma un run. Richiede `--yes` o `ALLOW_DESTRUCTIVE=1`. |
| `kill <agent-id>` | Ferma un agente. Richiede `--yes` o `ALLOW_DESTRUCTIVE=1`. |
| `setup` | Controllo al primo avvio. `--attach` collega ogni CLI host installata. |
| `doctor` | Controlla Node, tmux, lo stato e le CLI dei provider. |
| `web` | Avvia la Web UI, raggiungibile solo in loopback. |
| `providers` | Elenca id, alias, modelli e disponibilità dei provider. |
| `approvals` | Elenca le richieste di approvazione in sospeso. |
| `approve` / `deny` | Risolve una richiesta di approvazione. |
| `hosts` | Mostra a quali CLI host è collegato ReevesAgents. |
| `attach [cli]` | Collega l'MCP di Controllo agenti a una CLI host, o a tutte quelle installate. |
| `detach <cli>` | Rimuove quel collegamento MCP da una CLI host. |
| `skills [action]` | Installa, rimuove o ispeziona la skill di ReevesAgents. |
| `mcp` | Avvia il server MCP su stdio. Lo eseguono le CLI host. |
| `config [key] [value]` | Mostra o modifica le impostazioni. |
| `presets` | Elenca i preset di run salvati. |
| `save-preset` | Salva un run attivo come preset. |
| `start-preset` | Avvia un run da un preset. |
| `delete-preset` | Elimina un preset. |
| `delete` | Elimina il record di un agente terminato. Chiede conferma. |
| `delete-run` | Elimina un run terminato e lo archivia. Chiede conferma. |
| `history` | Elenca i run archiviati. |
| `delete-history` | Elimina un record archiviato dalla cronologia. Chiede conferma. |
| `reap` | Chiude gli agenti zombie e quelli oltre `max_lifetime_ms`, e termina le sessioni tmux orfane che nessun record di run possiede. |

Flag comuni:

- `--json`: disponibile sui comandi di elenco e di azione pensati per gli script.
- `--name <name>`: dà un nome al run.
- `--cwd <dir>`: fa partire gli agenti da una directory.
- `--prompt <text>`: incolla un testo iniziale in ogni agente avviato.
- `--skip`: salta le richieste di permesso del provider, utile per i worker senza supervisione.
- `--run <run-id>`: aggiunge agenti a un run specifico.
- `--port <n>` e `--no-open`: opzioni di avvio della Web UI.

</details>

<a id="agent-control"></a>
<details>
<summary><strong>Controllo agenti</strong></summary>

Controllo agenti è un server MCP opzionale. Collegalo solo a una CLI di cui ti fidi
abbastanza da lasciarle usare strumenti locali:

```sh
reevesagents attach claude
reevesagents hosts
```

Dopo il riavvio, quella CLI riceve gli strumenti `spawn`, `read`, `send_text`,
`send_key`, `interrupt`, `kill`, `stop`, più quelli per gestire approvazioni e preset
e per ispezionare gli host. Il catalogo dei provider è esposto anche come
`reevesagents://providers`.

Per default i worker non ricevono l'MCP. Se un worker deve creare i propri worker,
collega esplicitamente ReevesAgents alla CLI di quel worker.

Per default Codex esegue le chiamate MCP in sandbox, e questo blocca l'avvio di tmux.
Se usi Codex come host che guida gli agenti, lancialo con accesso completo, per esempio
`codex --sandbox danger-full-access`, oppure usa un profilo Codex che imposta
`sandbox_mode = "danger-full-access"`.

Riferimento completo degli strumenti: [docs/mcp.md](../mcp.md). Guida operativa
scritta per gli agenti: [AGENTS.it.md](../../AGENTS.it.md).

</details>

<a id="configuration"></a>
<details>
<summary><strong>Configurazione</strong></summary>

Lo stato vive sotto `~/.reeves`:

```text
~/.reeves/
  config.json
  presets/
  runs/
  history/
```

Due variabili d'ambiente sostituiscono i percorsi predefiniti:

- `REEVES_REGISTRY`: radice alternativa dello stato per `runs/`, `history/` e `presets/`.
- `REEVES_CONFIG`: percorso alternativo del file di configurazione.

Serve un registro per ogni server tmux: la pulizia automatica delle sessioni orfane
decide a chi appartiene una sessione in base al registro corrente, quindi due registri
non devono condividere lo stesso server tmux.

Tutto ciò che potrebbe contenere un segreto viene ripulito prima di arrivare su file.

</details>

<a id="examples"></a>
<details>
<summary><strong>Esempi</strong></summary>

Distribuisci un progetto su più CLI:

```sh
reevesagents spawn deepseek:backend claude-code:product codex:review \
  --name "feature x" \
  --prompt "Backend, product copy, and a review pass."
```

Tieni d'occhio un agente, poi apri la sua finestra:

```sh
reevesagents peek backend -n 40
reevesagents open backend
```

Ferma il run quando il lavoro è finito:

```sh
reevesagents stop "feature x" --yes
```

</details>

<a id="web-ui"></a>
<details>
<summary><strong>Web UI</strong></summary>

```sh
reevesagents web
```

La Web UI si lega solo a `127.0.0.1` e gira in primo piano. Gli agenti continuano a
lavorare anche dopo che chiudi la pagina, perché vivono in tmux.

La Web UI usa due moduli di runtime opzionali, `ws` e `@lydell/node-pty`, che npm
installa per default. I comandi della CLI e della TUI funzionano anche senza, e
`reevesagents web` ti spiega cosa manca.

Per raggiungerla da un'altra macchina, inoltra la porta di loopback via SSH:

```sh
ssh -L 8080:127.0.0.1:8080 user@host
```

</details>

<a id="troubleshooting"></a>
<details>
<summary><strong>Risoluzione dei problemi</strong></summary>

**tmux non è installato.** Installa tmux ed esegui `reevesagents doctor`. La TUI si
avvolge da sola in una sessione tmux chiamata `reeves`; per evitarlo, imposta
`REEVES_NO_TMUX_WRAPPER=1`.

**Una CLI di provider manca o non ha il login.** ReevesAgents lancia le CLI di provider
già presenti nel `PATH` e autenticate. `reevesagents doctor` mostra cosa ha rilevato.
Se una finestra appena lanciata è ferma al login, lo vedi con `peek`.

**La Web UI segnala pacchetti mancanti.** Reinstalla con le dipendenze opzionali
abilitate, poi esegui `reevesagents doctor`.

**Porta già in uso.** Per default `reevesagents web` parte dalla porta `8080`. Se è
occupata, il server prende la prima porta libera in un piccolo intervallo e stampa l'URL.

</details>

<a id="contributing"></a>
<details>
<summary><strong>Contribuire</strong></summary>

La documentazione per chi contribuisce sta in [docs/](..). Parti da
[CONTRIBUTING.md](../../.github/CONTRIBUTING.md), [testing](../testing.md) e
[releasing](../releasing.md).

Chi usa lo strumento non ha bisogno della toolchain di sviluppo. Chi contribuisce usa
pnpm, TypeScript, tsup, Vitest ed ESLint dal repository.

</details>

## Link

- Sito web: https://reevesagents.mertkayacs.com
- npm: https://www.npmjs.com/package/reevesagents
- GitHub: https://github.com/mertkayacs/reevesagents
- Release: https://github.com/mertkayacs/reevesagents/releases
- Issue: https://github.com/mertkayacs/reevesagents/issues
- Changelog: [CHANGELOG.md](../../CHANGELOG.md)
- Licenza: [Apache-2.0](../../LICENSE)
