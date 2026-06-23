# Guia do Utilizador ReevesAgents

[English](GUIDE.md) · [Deutsch](GUIDE.de.md) · [Français](GUIDE.fr.md) · [Español](GUIDE.es.md) · **Português** · [Italiano](GUIDE.it.md) · [Türkçe](GUIDE.tr.md) · [Русский](GUIDE.ru.md) · [简体中文](GUIDE.zh-Hans.md) · [العربية](GUIDE.ar.md)

Um percurso simples e passo a passo: instale, execute pela primeira vez, e deixe um
agente conduzir os outros. Para referência completa de comandos e opções, consulte
o [README](../README.pt.md).

## O que é o ReevesAgents

- Um espaço de trabalho livre e local para agentes de código de IA (Claude Code, Codex, Hermes,
  DeepSeek, Kimi e outros). Funcionam lado a lado na sua máquina.
- A ideia principal: um agente cria e conduz os outros. Um agente Claude Code
  pode iniciar e orientar um grupo de agentes Codex e Claude Code em tarefas separadas.
- Funciona em cima das CLIs reais que já tem. O início de sessão do fornecedor fica com
  cada CLI. O ReevesAgents não armazena chaves de API e nunca encaminha o tráfego dos seus modelos.
- Sem base de dados, sem Docker, sem serviço em segundo plano. O estado é JSON local sob
  `~/.reeves`.

## Antes de começar

- macOS, Linux ou WSL (o Windows nativo não é o alvo; use WSL).
- Node.js 20.19 ou mais recente.
- tmux 3.0 ou mais recente.
- Pelo menos uma CLI de fornecedor instalada e autenticada: Claude Code, Codex,
  OpenCode, Hermes, Kimi, DeepSeek, Pi, Qwen ou Aider.

## Instalar e verificar

- Instale-o globalmente: `npm install -g reevesagents`
- Verifique a sua máquina: `reevesagents doctor` (verifica Node, tmux, a pasta de estado,
  e qual CLIs de fornecedor consegue ver).
- Lance-o: `reevesagents`
- Prefere pnpm, Yarn, Bun, npx ou Homebrew? Consulte [Instalação](../README.pt.md#instalação)
  no README.

## A sua primeira execução

A execução reproduzível mais rápida é a partir da linha de comandos. Uma execução tem um agente principal
e qualquer número de trabalhadores; cada agente é escrito como `provider[:nickname[:model]]`:

```sh
reevesagents spawn claude-code:lead codex:worker \
  --name "first run" \
  --prompt "Say hello and list the files in this folder."
```

- `claude-code:lead` é a principal, `codex:worker` é uma trabalhadora. Sem agente
  nomeado, a execução assume `codex` por defeito.
- `--name` rotula a execução, `--cwd` define a pasta de trabalho (por defeito onde
  está), e `--prompt` é colado em cada agente.

Prefere um início visual? Execute `reevesagents` para a TUI ou `reevesagents web` para
a Web UI local e crie a execução a partir daí.

## Os quatro modos de utilização

Alcança as mesmas execuções através de quatro superfícies. Escolha qual se adequa ao momento:

- **TUI** (`reevesagents`): controlo rápido, com prioridade ao teclado, dentro do terminal.
- **Web UI** (`reevesagents web`): uma vista visual de execuções, agentes, painéis em tempo real,
  e histórico. Local e apenas loopback.
- **CLI** (`reevesagents spawn`, `runs`, `peek`, `open`, `stop`): scripts, comandos rápidos,
  e verificações de saúde.
- **tmux**: cada agente é uma CLI real no seu próprio painel tmux, por isso as sessões continuam
  a funcionar localmente mesmo depois de fechar a TUI ou Web UI.

## Deixe um agente conduzir os restantes

Esta é a funcionalidade principal, e fica desativada até a ligar.

- Ligue-a na sua CLI: `reevesagents attach claude` (ou `reevesagents attach`
  para conectar todas as CLIs instaladas que consegue alojar). Também pode fazer isto no ecrã
  **Agent control** na TUI ou Web UI.
- Confirme: `reevesagents hosts` lista as CLIs na sua máquina e mostra qual as que estão conectadas.
- Recarregue a sua CLI: reinicie a sessão para que carregue as novas ferramentas (isto usa
  MCP, a forma padrão de uma ferramenta de agente expor comandos a outro).
- Agora o seu agente consegue criar e conduzir outros agentes: inicie um agente numa tarefa,
  envie-lhe texto ou teclas, leia o que está a fazer, e aprove ou recuse o que pede.

Um exemplo elaborado: conecte a Claude Code, reinicie-a, e de dentro de uma sessão Claude Code
consegue iniciar um agente Codex numa issue e um segundo agente Claude Code noutro, depois observar
e orientar ambos.

- CLIs que conseguem alojar isto hoje: claude, codex, kimi, qwen, opencode, hermes.
  OpenCode é conectada manualmente, porque o seu próprio passo de adição é interativo.
- Os trabalhadores não recebem estas ferramentas por defeito, por isso um trabalhador não consegue
  iniciar mais agentes. Para deixar um trabalhador conduzir os seus próprios sub-agentes, conecte o MCP
  à CLI desse trabalhador também.
- Para desconectar depois: `reevesagents detach claude`.

## Tarefas do dia a dia

- Veja o que está a correr: `reevesagents runs` (acrescente `--json` para scripts).
- Observe um agente sem sair da sua shell: `reevesagents peek <agent> -n 40`.
- Entre num painel tmux de um agente: `reevesagents open <agent>`.
- Pare uma execução inteira: `reevesagents stop <run> --yes`.
- Pare um único agente: `reevesagents kill <agent> --yes`.
- `stop` e `kill` são os únicos comandos que terminam o trabalho, por isso recusam-se a correr
  sem `--yes`.

## Manter o custo baixo

- Coloque um modelo mais barato ou livre à frente para encaminhar o trabalho, e deixe-o passar
  tarefas pesadas para um agente mais forte apenas quando necessário.
- Deixe modelos baratos escrever código e testes de rotina enquanto planeia e desenha com um
  maior, em vez de empurrar tudo através de um único padrão dispendioso.
- As quotas e faturas dos fornecedores ficam em cada CLI. O ReevesAgents não acrescenta custo algum.

## Quando algo parece errado

- Execute `reevesagents doctor` primeiro. Verifica Node, tmux, a pasta de estado, e
  as suas CLIs de fornecedor, e diz-lhe o que está a falhar.
- **tmux em falta:** instale-o (`brew install tmux` ou `apt install tmux`) e
  execute doctor de novo.
- **Um fornecedor não é detetado:** O ReevesAgents apenas lança CLIs que estão no seu
  `PATH` e autenticadas. Instale ou inicie sessão nessa CLI.
- **Web UI reporta pacotes em falta:** precisa `ws` e `@lydell/node-pty`.
  Reinstale com dependências opcionais ativadas.
- **Porta já em uso:** `reevesagents web` arranca na porta `8080` e baixa para
  a próxima porta livre; passe `--port <n>` para escolher outra.
- Mais detalhes em [Resolução de Problemas](../README.pt.md#resolução-de-problemas).

## Para onde ir a seguir

- [Início da documentação](README.md): o índice completo da documentação.
- [Comandos](../README.pt.md#comandos): todo o subcomando e flag.
- [Agent control](../README.pt.md#agent-control): o modelo opt-in completo.
- [Configuração](../README.pt.md#configuração): o que fica sob `~/.reeves`.
- [docs/mcp.md](mcp.md): o design de Agent control e lista de ferramentas.
