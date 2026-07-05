# Guia do Utilizador do ReevesAgents

[English](GUIDE.md) · [Deutsch](GUIDE.de.md) · [Français](GUIDE.fr.md) · [Español](GUIDE.es.md) · **Português** · [Italiano](GUIDE.it.md) · [Türkçe](GUIDE.tr.md) · [Русский](GUIDE.ru.md) · [简体中文](GUIDE.zh-Hans.md) · [العربية](GUIDE.ar.md)

Um percurso simples, passo a passo: instalar, fazer a primeira execução e deixar
um agente conduzir os outros. Para a referência completa de comandos e opções,
consulte o [README](i18n/README.pt.md).

## O que é o ReevesAgents

- Um espaço de trabalho livre e local para agentes de código de IA (Claude Code,
  Codex, Hermes, DeepSeek, Kimi e outros). Correm lado a lado na sua máquina.
- A ideia principal: um agente cria e conduz os outros. Um agente Claude Code
  pode iniciar e orientar uma equipa de agentes Codex e Claude Code em tarefas
  separadas.
- Funciona em cima das CLIs reais que já tem. O início de sessão do fornecedor
  fica com cada CLI. O ReevesAgents não armazena chaves de API e nunca encaminha
  o tráfego dos seus modelos.
- Sem base de dados, sem Docker, sem serviço em segundo plano. O estado é JSON
  local sob `~/.reeves`.

## Antes de começar

- macOS, Linux ou WSL (o Windows nativo não é o alvo; use WSL).
- Node.js 20.19 ou mais recente.
- tmux 3.0 ou mais recente.
- Pelo menos uma CLI de fornecedor instalada e autenticada: Claude Code, Codex,
  OpenCode, Hermes, Kimi, DeepSeek, Pi, Qwen ou Aider.

## Instalar e verificar

- Instale-o globalmente: `npm install -g reevesagents`
- Verifique a sua máquina: `reevesagents doctor` (verifica o Node, o tmux, a
  pasta de estado e que CLIs de fornecedor consegue ver).
- Lance-o: `reevesagents`
- Prefere pnpm, Yarn, Bun, npx ou Homebrew? Consulte [Instalação](i18n/README.pt.md#instalação)
  no README.

## A sua primeira execução

A execução reproduzível mais rápida faz-se a partir da linha de comandos. Uma
execução tem um agente principal e qualquer número de trabalhadores; cada agente
escreve-se como `provider[:nickname[:model]]`:

```sh
reevesagents spawn claude-code:lead codex:worker \
  --name "first run" \
  --prompt "Say hello and list the files in this folder."
```

- `claude-code:lead` é o principal, `codex:worker` é um trabalhador. Sem nenhum
  agente indicado, a execução assume `codex` por defeito.
- `--name` dá nome à execução, `--cwd` define a pasta de trabalho (por defeito,
  onde está) e `--prompt` é colado em cada agente.

Prefere um arranque visual? Execute `reevesagents` para a TUI ou
`reevesagents web` para a Web UI local e crie a execução a partir daí.

## Os cinco modos de utilização

Chega às mesmas execuções por cinco superfícies. Escolha a que se adequar ao
momento:

- **TUI** (`reevesagents`): controlo rápido, com prioridade ao teclado, dentro do
  terminal.
- **Web UI** (`reevesagents web`): uma vista visual única de execuções, agentes,
  painéis em tempo real e histórico. Local e só por loopback.
- **CLI** (`reevesagents spawn`, `runs`, `peek`, `open`, `stop`): scripts,
  comandos rápidos e verificações de saúde.
- **tmux**: cada agente é uma CLI real no seu próprio painel tmux, por isso as
  sessões continuam a correr localmente mesmo depois de fechar a TUI ou a Web UI.
- **Agent control** (`reevesagents attach <cli>`): o MCP opt-in que permite a um
  agente conduzir os restantes. A secção seguinte percorre-o passo a passo.

## Deixe um agente conduzir os restantes

Esta é a funcionalidade central, e fica desligada até a ativar.

- Ative-a para a sua CLI: `reevesagents attach claude` (ou `reevesagents attach`
  para conectar todas as CLIs instaladas que o podem alojar). Também pode fazê-lo
  a partir do ecrã **Agent control** da TUI ou da Web UI.
- Confirme: `reevesagents hosts` lista as CLIs na sua máquina e mostra quais
  estão conectadas.
- Recarregue a sua CLI: reinicie a sessão para que apanhe as novas ferramentas
  (isto usa MCP, a forma padrão de uma ferramenta de agente expor comandos a
  outra).
- Agora o seu agente consegue criar e conduzir outros agentes: iniciar um agente
  numa tarefa, enviar-lhe texto ou teclas, ler o que está a fazer e aprovar ou
  recusar o que pede.

Um exemplo concreto: conecte o ReevesAgents ao Claude Code, reinicie-o e, de
dentro de uma sessão Claude Code, consegue criar um agente Codex numa issue e um
segundo agente Claude Code noutra, e depois observar e orientar ambos.

- CLIs que hoje conseguem alojar isto: claude, codex, kimi, qwen, opencode,
  hermes. O OpenCode conecta-se à mão, porque o seu passo de adição é interativo.
- Os trabalhadores não recebem estas ferramentas por defeito, por isso um
  trabalhador não consegue criar mais agentes. Para deixar um trabalhador
  conduzir os seus próprios subagentes, conecte o MCP também à CLI desse
  trabalhador.
- Para desconectar mais tarde: `reevesagents detach claude`.

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

- Coloque um modelo mais barato ou gratuito à frente para encaminhar o trabalho,
  e deixe-o entregar tarefas pesadas a um agente mais forte apenas quando for
  preciso.
- Deixe modelos baratos escrever o código e os testes de rotina enquanto planeia
  e desenha com um maior, em vez de empurrar tudo por um único modelo padrão
  dispendioso.
- As quotas e a faturação dos fornecedores ficam com cada CLI. O ReevesAgents não
  acrescenta custos próprios.

## Quando algo parece errado

- Execute `reevesagents doctor` primeiro. Verifica o Node, o tmux, a pasta de
  estado e as suas CLIs de fornecedor, e diz-lhe o que está a falhar.
- **tmux em falta:** instale-o (`brew install tmux` ou `apt install tmux`) e
  volte a correr o doctor.
- **Um fornecedor não é detetado:** o ReevesAgents apenas lança CLIs que estão no
  seu `PATH` e autenticadas. Instale essa CLI ou inicie sessão nela.
- **A Web UI reporta pacotes em falta:** precisa de `ws` e `@lydell/node-pty`.
  Reinstale com as dependências opcionais ativadas.
- **Porta já em uso:** `reevesagents web` arranca na `8080` e recua para a
  próxima porta livre; passe `--port <n>` para escolher outra.
- Mais detalhe em [Resolução de Problemas](i18n/README.pt.md#resolução-de-problemas).

## Para onde ir a seguir

- [Início da documentação](README.md): o índice completo da documentação.
- [Comandos](i18n/README.pt.md#comandos): todos os subcomandos e flags.
- [Agent control](i18n/README.pt.md#agent-control): o modelo opt-in completo.
- [Configuração](i18n/README.pt.md#configuração): o que fica sob `~/.reeves`.
- [docs/mcp.md](mcp.md): o design do Agent control e a lista de ferramentas.
