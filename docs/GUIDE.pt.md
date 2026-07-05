# Guia do Utilizador do ReevesAgents

[English](GUIDE.md) · [Deutsch](GUIDE.de.md) · [Français](GUIDE.fr.md) · [Español](GUIDE.es.md) · **Português** · [Italiano](GUIDE.it.md) · [Türkçe](GUIDE.tr.md) · [Русский](GUIDE.ru.md) · [简体中文](GUIDE.zh-Hans.md) · [العربية](GUIDE.ar.md)

Este guia acompanha-o desde uma instalação feita do zero até ao ponto em que
tem um agente a conduzir os restantes por si. Quando precisar de cada comando
e de cada opção, está tudo no [README](i18n/README.pt.md).

## O que é o ReevesAgents

- Um espaço de trabalho livre e local onde os seus agentes de código de IA
  (Claude Code, Codex, Hermes, DeepSeek, Kimi e outros) trabalham lado a lado
  na sua máquina.
- A parte que torna isto interessante: um agente pode criar e conduzir os
  outros. Entregue as rédeas a uma sessão de Claude Code e ela põe, sem se
  fazer rogada, uma equipa de agentes Codex e Claude Code a trabalhar em
  tarefas separadas.
- Assenta em cima das CLIs que já tem, por isso cada início de sessão fica
  onde sempre esteve. O ReevesAgents nunca guarda uma chave de API e nunca
  toca no tráfego dos seus modelos.
- Todo o estado dele é um punhado de JSON em `~/.reeves`. Não há uma base de
  dados para manter nem um Docker para descarregar, e nada fica a correr em
  segundo plano.

## Antes de começar

- macOS, Linux ou WSL (o Windows nativo não é o alvo; use WSL).
- Node.js 20.19 ou mais recente.
- tmux 3.0 ou mais recente.
- Pelo menos uma CLI de fornecedor instalada e com sessão iniciada: Claude
  Code, Codex, OpenCode, Hermes, Kimi, DeepSeek, Pi, Qwen ou Aider.

## Instalar e verificar

- Instale-o com o Homebrew: `brew install mertkayacs/reevesagents/reevesagents`,
  ou globalmente com um gestor de pacotes de Node como o pnpm: `pnpm add -g reevesagents`
- Verifique a sua máquina: `reevesagents doctor` (verifica o Node, o tmux, a
  pasta de estado e que CLIs de fornecedor consegue ver).
- Lance-o: `reevesagents`
- Prefere npm, Yarn, Bun ou npx? Consulte [Instalação](i18n/README.pt.md#instalação)
  no README.

## A sua primeira execução

A execução reproduzível mais rápida faz-se a partir da linha de comandos. Uma
execução tem um agente principal e os trabalhadores que quiser; cada agente
escreve-se como `provider[:nickname[:model]]`:

```sh
reevesagents spawn claude-code:lead codex:worker \
  --name "first run" \
  --prompt "Say hello and list the files in this folder."
```

- `claude-code:lead` é o principal e `codex:worker` é um trabalhador. Se não
  indicar nenhum agente, a execução assume `codex` por defeito.
- `--name` dá nome à execução, `--cwd` define a pasta de trabalho (por defeito,
  a pasta onde está) e `--prompt` é colado em cada agente.

Prefere um arranque visual? Execute `reevesagents` para a TUI ou
`reevesagents web` para a Web UI local e crie a execução a partir daí.

## Os cinco modos de utilização

Chega às mesmas execuções por cinco superfícies. Escolha a que servir o
momento:

- **TUI** (`reevesagents`): a aplicação de terminal onde a maioria das pessoas
  acaba por viver. Está tudo em menus, por isso as setas do teclado chegam.
- **Web UI** (`reevesagents web`): as mesmas execuções numa única página do
  browser, com uma vista em direto para dentro de qualquer agente. Nunca
  responde fora do loopback.
- **CLI** (`reevesagents spawn`, `runs`, `peek`, `open`, `stop`): para scripts,
  ou para os dias em que apetece mais escrever comandos do que andar em menus.
- **tmux**: é aqui que os agentes vivem de facto. Como cada um é uma CLI real
  no seu próprio painel, fechar a TUI ou a Web UI não interrompe ninguém.
- **Agent control** (`reevesagents attach <cli>`): o MCP opt-in que deixa um
  agente conduzir os restantes. A secção seguinte percorre-o passo a passo.

## Deixe um agente conduzir os restantes

Esta é a funcionalidade central, e fica desligada até ser você a ligá-la.

- Ligue-a com `reevesagents attach claude`, ou corra `reevesagents attach` sem
  argumentos para ligar todas as CLIs instaladas que a conseguem alojar. O
  ecrã **Agent control** da TUI e da Web UI faz exatamente o mesmo.
- `reevesagents hosts` mostra o ponto da situação: todas as CLIs da máquina e
  quais delas estão ligadas.
- Depois reinicie essa CLI uma vez, porque as ferramentas só são carregadas no
  arranque da sessão (isto é MCP puro e simples, a forma padrão de uma
  ferramenta de agente expor comandos a outra).
- A partir daí, o seu agente pode pôr um agente novo numa tarefa, escrever-lhe
  no prompt, ler o que ele anda a fazer e aprovar ou recusar o que ele pedir.

Um exemplo concreto: ligue o ReevesAgents ao Claude Code, reinicie-o e, de
dentro de uma sessão Claude Code, consegue criar um agente Codex numa issue e
um segundo agente Claude Code noutra, e depois observar e orientar ambos.

- As CLIs que hoje conseguem alojar isto: claude, codex, kimi, qwen, opencode,
  hermes. O OpenCode liga-se à mão, porque o passo de adição dele é interativo.
- Os trabalhadores não recebem estas ferramentas por defeito, por isso um
  trabalhador não consegue criar mais agentes. Para deixar um trabalhador
  conduzir os seus próprios subagentes, ligue o MCP também à CLI desse
  trabalhador.
- Para desligar mais tarde: `reevesagents detach claude`.

## Tarefas do dia a dia

- Veja o que está a correr: `reevesagents runs` (acrescente `--json` para scripts).
- Observe um agente sem sair da sua shell: `reevesagents peek <agent> -n 40`.
- Entre no painel tmux de um agente: `reevesagents open <agent>`.
- Pare uma execução inteira: `reevesagents stop <run> --yes`.
- Pare um único agente: `reevesagents kill <agent> --yes`.
- Veja o que os agentes estão a pedir: `reevesagents approvals`, depois
  `approve <id>` ou `deny <id>`.
- `stop` e `kill` terminam trabalho, e os comandos `delete` removem registos
  terminados. Todos eles se recusam a correr sem `--yes`.

## Manter o custo baixo

- Ponha um modelo barato ou gratuito à frente, a fazer de router, e deixe-o
  acordar o modelo caro só quando a tarefa realmente o merecer.
- Código de rotina e testes são exatamente aquilo para que os modelos mais
  baratos servem. Guarde o modelo grande para planear e desenhar, em vez de
  lhe pagar para escrever boilerplate.
- O que isto lhe custar é a faturação normal dos seus fornecedores. O
  ReevesAgents em si não acrescenta nada por cima.

## Quando algo parece errado

- Comece por `reevesagents doctor`, porque na maior parte das vezes ele
  diz-lhe logo qual é o problema: verifica o Node, o tmux, a pasta de estado e
  cada CLI de fornecedor.
- **tmux em falta:** instale-o (`brew install tmux` ou `apt install tmux`) e
  deixe o doctor confirmar.
- **Um fornecedor não é detetado:** é quase sempre porque não está instalado
  ou não tem sessão iniciada. O ReevesAgents só consegue lançar o que está no
  seu `PATH` e com sessão iniciada.
- **A Web UI reporta pacotes em falta:** os módulos opcionais `ws` e
  `@lydell/node-pty` ficaram de fora na instalação. Uma reinstalação normal
  volta a trazê-los.
- **Porta já em uso:** não há nada de errado. O `reevesagents web` limita-se a
  ocupar a porta livre seguinte e a imprimir o URL. Passe `--port <n>` se
  quiser uma em concreto.
- Mais detalhe em [Resolução de Problemas](i18n/README.pt.md#resolução-de-problemas).

## Para onde ir a seguir

- [Início da documentação](README.md): o índice completo da documentação.
- [Comandos](i18n/README.pt.md#comandos): todos os subcomandos e flags.
- [Agent control](i18n/README.pt.md#agent-control): o modelo opt-in completo.
- [Configuração](i18n/README.pt.md#configuração): o que fica em `~/.reeves`.
- [docs/mcp.md](mcp.md): o design do Agent control e a lista de ferramentas.
