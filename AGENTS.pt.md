# AGENTS.md

[English](AGENTS.md) · [Deutsch](AGENTS.de.md) · [Français](AGENTS.fr.md) · [Español](AGENTS.es.md) · **Português** · [Italiano](AGENTS.it.md) · [Türkçe](AGENTS.tr.md) · [Русский](AGENTS.ru.md) · [简体中文](AGENTS.zh-Hans.md) · [العربية](AGENTS.ar.md)

Como um agente de código de IA conduz ReevesAgents. Este ficheiro é o guia de
operação para a ferramenta em si. Não altera o comportamento dos agentes nos seus
próprios projetos.

ReevesAgents executa CLIs de código de IA (Claude Code, Codex, Kimi, Qwen,
OpenCode, Hermes e outros) lado a lado, cada um como uma CLI real na sua própria
janela tmux. Um agente pode iniciar, orientar e supervisionar os restantes. O
estado fica em JSON local sob `~/.reeves`. Sem chaves de API, sem base de dados,
sem daemon em segundo plano.

## Duas formas de utilizar

1. **Conduzir a CLI diretamente.** Execute `reevesagents spawn ...` para iniciar
   agentes, depois `runs`, `peek`, `send` e `stop` para os observar e orientar.
   Bom para scripts e orquestração de uma só vez.
2. **Deixe a sua CLI anfitriã conduzir as outras sobre MCP.** `reevesagents
   attach <cli>` dá a essa CLI um conjunto de ferramentas de controlo de agentes
   (spawn, send_text, read, kill, ...). Depois de reiniciar a CLI, uma única
   sessão consegue iniciar um grupo e orientá-lo. Esta é a funcionalidade central.
   Consulte [docs/mcp.md](docs/mcp.md).

## Verificar a configuração em primeiro lugar

```sh
reevesagents doctor
```

Reporta tmux, Node, a pasta de estado `~/.reeves` e quais as CLIs de fornecedor
que estão instaladas e compatíveis com CLI (inspeciona o `--help` de cada CLI).
Não consegue testar se uma CLI está registada, por isso uma CLI instalada mas não
registada ainda passa aqui. Execute-a antes de iniciar agentes para que uma
execução não falhe numa CLI em falta; `peek` (abaixo) apanha uma janela parada
numa tela de login. `reevesagents doctor --json` devolve o mesmo como JSON
legível por máquina.

Requisitos: Node 20.19+, tmux 3.0+ e pelo menos uma CLI de fornecedor instalada
e autenticada. macOS, Linux ou WSL (Windows nativo não é o alvo).

## Instalar

```sh
pnpm add -g reevesagents     # ou: npm install -g reevesagents
```

Execução sem instalação: `pnpm dlx reevesagents doctor`.

## Iniciar agentes

Cada agente é escrito como `provider[:nickname[:model]]`; nickname e model são
opcionais. O primeiro agente lidera a execução; os restantes juntam-se como
trabalhadores.

```sh
# Um Claude Code principal, um segundo Claude Code revisor, dois trabalhadores Codex, um trabalhador Kimi.
reevesagents spawn cc:lead cc:review codex:api codex:tests kimi:docs \
  --name "feature x" --skip \
  --prompt "Build feature X. Lead coordinates; each worker takes a slice."
```

Antes de iniciar qualquer coisa, `spawn` verifica que cada CLI de fornecedor com
nome está em PATH e nomeia qualquer uma que esteja em falta, por isso um erro de
digitação ou uma CLI não instalada falha rapidamente em vez de iniciar a execução
pela metade. Com sucesso, imprime o id de execução, o id de cada agente e os
comandos exatos `peek`/`send`/`open` para os conduzir.

Flags úteis `spawn`: `--name <run>`, `--cwd <dir>` (pré-definição é o
diretório atual), `--prompt <text>` (colado em cada agente no arranque), `--skip`
(inicia agentes sem os seus próprios pedidos de permissão; use quando ninguém
estiver lá para aprovar), `--run <run-id>` (adicione agentes a uma execução
existente em vez de começar uma nova), `--json` (imprima os ids de execução e
agente como JSON em vez de texto).

## Ids de fornecedores e aliases

Execute `reevesagents providers` (acrescente `--json` para uma lista de máquina).
Qualquer alias funciona como o fornecedor numa spec spawn.

| id         | fornecedor   | aliases comuns                  |
| ---------- | ------------ | ------------------------------- |
| `cc`       | Claude Code  | `claude`, `claude-code`         |
| `codex`    | Codex CLI    | `codex-cli`                     |
| `kimi`     | Kimi Code    | `kimi-code`                     |
| `qwen`     | Qwen Code    | `qwen-code`                     |
| `opencode` | OpenCode CLI | `open_code`                     |
| `hermes`   | Hermes       |                                 |
| `pi`       | Pi           |                                 |
| `aider`    | Aider        |                                 |
| `deepseek` | DeepSeek CLI | `deepseek-cli`                  |

## Observar e orientar agentes em execução

```sh
reevesagents runs                      # listar execuções ativas (acrescente --json para scripts)
reevesagents agents <run-id>           # listar os agentes numa execução
reevesagents peek <agent-id> -n 40     # saída recente de um agente
reevesagents send <agent-id> "do X"    # colar texto no prompt do agente
reevesagents key <agent-id> enter      # submetê-lo (send não submete por si próprio)
reevesagents interrupt <agent-id>      # ctrl-c o agente
reevesagents open <run-id|agent-id>    # saltar para a sua janela tmux
```

`send` apenas cola; siga-o com `key <agent-id> enter` para submeter. Teclas
aceites por `key`: `enter`, `escape`, `backspace`, `tab`, `space`, `up`, `down`,
`left`, `right`, `ctrl-c`.

## Parar limpar

```sh
reevesagents stop <run-id> --yes       # terminar uma execução inteira e desmontar a sua sessão tmux
reevesagents kill <agent-id> --yes     # terminar um agente
```

`stop` e `kill` são os únicos comandos destrutivos, por isso recusam-se a correr
sem `--yes`.

## Um exemplo trabalhado: cinco agentes, depois orientá-los

O cenário "instalar reevesagents, iniciar dois Claude, dois Codex e um Kimi, e
pô-los a trabalhar" do início ao fim.

```sh
# 1. Confirmar que as cinco CLIs estão instaladas e compatíveis.
reevesagents doctor

# 2. Começar o grupo. --skip para que os trabalhadores não parem nos seus próprios pedidos de permissão.
reevesagents spawn cc:lead cc:review codex:api codex:tests kimi:docs \
  --name "feature x" --skip \
  --prompt "Build feature X. Lead coordinates; each worker owns one slice."

# 3. spawn imprime cada id de agente. Listá-los todos, ou ler um.
reevesagents agents <run-id>
reevesagents peek <agent-id> -n 40

# 4. Orientar: colar uma mensagem, depois submetê-la.
reevesagents send <agent-id> "rebase on main, then run the tests"
reevesagents key  <agent-id> enter

# 5. Adicionar um trabalhador à mesma execução mais tarde.
reevesagents spawn codex:perf --run <run-id> --skip --prompt "profile the hot path"

# 6. Terminar a execução quando concluído.
reevesagents stop <run-id> --yes
```

Conduzindo-o a partir de uma CLI anfitriã sobre MCP em vez da shell, o mesmo
cenário é uma única instrução: "Usar reevesagents para começar um grupo, um
Claude Code principal, um segundo revisor Claude Code, dois trabalhadores Codex
(api e tests) e um trabalhador Kimi para docs. Saltar pedidos de permissão,
dar-lhes o resumo, depois observar e reportar progresso." A anfitriã chama as
ferramentas spawn/read/send ela própria. Consulte [docs/mcp.md](docs/mcp.md).

## Fazer e não fazer

Fazer:

- Execute `doctor` antes de spawn e certifique-se que cada fornecedor que nomeia
  está instalado **e registado**. doctor não consegue testar registo; se uma
  janela travar, `peek` mostra a tela de login.
- Trate `spawn` como fire-and-forget. Devolve ids, não respostas. Consulte com
  `runs`, `agents <run-id>` e `peek <agent-id> -n 40` para ver o que um grupo
  está a fazer.
- Submeta entrada em dois passos: `send <agent-id> "..."` cola, `key <agent-id>
  enter` submete.
- Passe `--skip` quando ninguém estiver lá para aprovar prompts, ou os
  trabalhadores ficarão presos no primeiro.
- Use `--json` (em `spawn`, `runs`, `agents`, `providers`, `doctor`) quando um
  script ou um agente precisar ler ids e estado em vez de texto.
- Nomeie fornecedores por id ou qualquer alias de `reevesagents providers` (`cc`
  ou `claude`, `codex`, `kimi`, ...).

Não fazer:

- Não espere que `spawn` devolva o resultado de um agente; comece o grupo,
  depois leia-o.
- Não `send` e assuma que correu; nada submete até que `key <agent-id> enter`.
- Não inicie um fornecedor que está em falta ou não registado; spawn recusa o
  primeiro e o segundo deixa uma janela parked numa linha de prompt que nunca
  faz o trabalho.
- Não execute `stop` ou `kill` sem `--yes`; são os únicos comandos destrutivos.
- Não direccione Windows nativo; execute dentro do WSL com tmux e as CLIs
  instaladas lá.
- Não cole segredos num `--prompt` ou `send`; a saída é capturada e mostrada
  através de `peek` e da Web UI.

## Notas de scripting

- `spawn`, `runs`, `agents`, `providers` e `doctor` aceitam todos `--json`.
- `spawn --json` imprime o id de execução e cada id de agente; capture-os ou
  leia-os de volta de `runs --json` e `agents <run-id> --json`.
- Substitua o diretório de estado com `REEVES_REGISTRY` e o ficheiro de
  configuração com `REEVES_CONFIG` para manter uma execução com script isolada de
  `~/.reeves`.

## Mais

- [README](README.md): tour completo de funcionalidades e cada comando.
- [docs/GUIDE.md](docs/GUIDE.md): guia de utilizador passo a passo.
- [docs/mcp.md](docs/mcp.md): o design de MCP de controlo de agentes e lista de
  ferramentas.
