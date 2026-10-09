<p align="center"><a href="https://reevesagents.mertkayacs.com/it/"><img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-banner.png" width="800" alt="ReevesAgents: fai lavorare insieme gli assistenti di coding AI"></a></p>

# reevesagents: uno spazio di lavoro per gli strumenti di coding AI

Esegui Claude Code, Codex, Kimi, OpenCode, Hermes e altri strumenti di coding AI fianco a fianco sul tuo computer. reevesagents tiene insieme le loro sessioni di terminale: controlli il lavoro di ogni strumento, invii istruzioni e fermi un run da un unico punto.

<img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-hero.webp" width="720" alt="Un pannello guida con cornice dorata collegato da sottili fili d'oro a otto pannelli di vetro illuminati, uno per ogni strumento del run">

[Guarda la demo](https://reevesagents.mertkayacs.com/it/demo/) oppure installa lo strumento a riga di comando qui sotto.

## Avvio rapido

Servono Node.js 20.19 o successivo, tmux 3.0 o successivo e uno strumento di coding AI installato e con accesso effettuato. Funziona su macOS, Linux e WSL. tmux tiene attivi gli strumenti anche quando chiudi l'interfaccia.

```sh
npm install -g reevesagents && reevesagents doctor && reevesagents
```

Il comando apre l'interfaccia da terminale. Per l'interfaccia nel browser esegui `reevesagents web`: resta in ascolto solo sull'indirizzo di loopback del tuo computer.

## Avvia un team

Avvia un run con un compito per gli strumenti:

```sh
reevesagents spawn claude-code:lead codex:tests --name "review" --prompt "Rivedi il codice e i test."
```

Dall'interfaccia da terminale o nel browser leggi l'output e guidi ogni strumento. Ogni provider mantiene il proprio accesso e invia le proprie richieste al modello. Lo stato dei run è salvato in JSON sotto `~/.reeves`.

<img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-newrun-it.png" width="720" alt="Web UI di reevesagents all'avvio di un nuovo run: nome del run, scelta degli strumenti come Claude Code, Codex CLI e Kimi Code, un modello e una modalità di permessi">

## Uno strumento guida gli altri

Collega il server MCP opzionale (Model Context Protocol, una connessione standard tra strumenti AI) a un host di cui ti fidi:

```sh
reevesagents attach claude && reevesagents hosts
```

Riavvia quell'host perché carichi la connessione. Da lì può avviare, leggere, guidare e fermare gli altri strumenti. Di default i worker non ricevono alcuna connessione MCP. Lascia attive le richieste di permesso dei provider e controlla le approvazioni prima delle azioni delicate.

In Claude Code puoi installare la connessione e le sue istruzioni d'uso insieme, come plugin:

```sh
claude plugin marketplace add mertkayacs/reevesagents
claude plugin install reevesagents@reevesagents
```

Per gli altri host, lo [skill di reevesagents](https://github.com/mertkayacs/reevesagents-skill) fornisce le istruzioni d'uso. Strumenti e requisiti degli host sono nel [riferimento MCP](../mcp.md).

Il server è elencato nel [registro MCP ufficiale](https://registry.modelcontextprotocol.io/?q=io.github.mertkayacs/reevesagents) come `io.github.mertkayacs/reevesagents`.

<img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-steer.webp" width="560" alt="Un pannello guida con cornice dorata invia messaggi lungo fili d'oro ad altri tre pannelli">

## Scegli un'interfaccia

| Interfaccia | A cosa serve |
| --- | --- |
| Interfaccia da terminale | Controllare e guidare i run da tastiera |
| Web UI | Controllare run, output in diretta, approvazioni e cronologia nel browser |
| Riga di comando | Avviare run e leggere l'output da script |
| Server MCP | Affidare un team a uno strumento di coding AI di fiducia |

<details>
<summary>Screenshot della Web UI</summary>

<img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-web-it.png" width="720" alt="Web UI di reevesagents prima di qualsiasi run: elenco degli agenti vuoto, pulsanti Nuovo run e controlli per lingua e impostazioni">

</details>

## Documentazione

- [Guida utente](https://reevesagents.mertkayacs.com/it/docs/): installazione, comandi e configurazione.
- [FAQ](https://reevesagents.mertkayacs.com/it/faq/): configurazione dei provider e risoluzione dei problemi.
- [Riferimento MCP](../mcp.md): strumenti e connessioni degli host (in inglese).
- [Contribuire](../../.github/CONTRIBUTING.md), [test](../testing.md) e [changelog](../../CHANGELOG.md) (in inglese).

Altre lingue: [English](../../README.md), [Deutsch](README.de.md), [Français](README.fr.md), [Español](README.es.md), [Português](README.pt.md), [Türkçe](README.tr.md), [Русский](README.ru.md), [简体中文](README.zh-Hans.md), [العربية](README.ar.md).

## Licenza

[Apache-2.0](../../LICENSE). Disponibile su [npm](https://www.npmjs.com/package/reevesagents).

<a href="https://eschatialabs.com"><picture><source media="(prefers-color-scheme: dark) and (min-resolution: 2dppx)" srcset="https://eschatialabs.com/brand/lockup-46-dark@2x.png"><source media="(prefers-color-scheme: dark)" srcset="https://eschatialabs.com/brand/lockup-46-dark@1x.png"><source media="(min-resolution: 2dppx)" srcset="https://eschatialabs.com/brand/lockup-46@2x.png"><img src="https://eschatialabs.com/brand/lockup-46@1x.png" width="124" height="46" alt="Eschatia Labs"></picture></a><br>Un progetto [Eschatia Labs](https://eschatialabs.com) di [Mert Kaya](https://mertkayacs.com).
