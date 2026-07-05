# AGENTS.md

[English](AGENTS.md) · [Deutsch](AGENTS.de.md) · [Français](AGENTS.fr.md) · [Español](AGENTS.es.md) · **Português** · [Italiano](AGENTS.it.md) · [Türkçe](AGENTS.tr.md) · [Русский](AGENTS.ru.md) · [简体中文](AGENTS.zh-Hans.md) · [العربية](AGENTS.ar.md)

Como um agente de código de IA conduz o ReevesAgents. Este ficheiro é o guia de
operação da própria ferramenta. Não altera o comportamento dos agentes nos seus
próprios projetos.

O ReevesAgents executa CLIs de código de IA (Claude Code, Codex, Kimi, Qwen,
OpenCode, Hermes e outras) lado a lado, cada uma como uma CLI real na sua própria
janela tmux. Um agente pode criar, orientar e supervisionar os restantes. O
estado fica em JSON local, dentro de `~/.reeves`. Sem chaves de API, sem base de
dados, sem daemon em segundo plano.

## Duas formas de utilizar

1. **Conduzir a CLI diretamente.** Execute `reevesagents spawn ...` para iniciar
   agentes e depois `runs`, `peek`, `send` e `stop` para os observar e orientar.
   Bom para scripts e orquestração pontual.
2. **Deixar a sua CLI anfitriã conduzir as outras via MCP.** `reevesagents
   attach <cli>` dá a essa CLI um conjunto de ferramentas de controlo de agentes
   (spawn, send_text, read, kill, ...). Depois de reiniciar a CLI, uma única
   sessão consegue criar uma equipa e dirigi-la. Esta é a funcionalidade
   central. Consulte [docs/mcp.md](docs/mcp.md).

## Verificar a configuração em primeiro lugar

```sh
reevesagents doctor
```

Reporta o tmux, o Node, a pasta de estado `~/.reeves` e que CLIs de
fornecedor estão instaladas e compatíveis (inspeciona o `--help` de cada uma). Não
consegue testar se uma CLI tem sessão iniciada, por isso uma CLI
instalada mas sem sessão iniciada continua a passar aqui. Execute-o antes de
criar agentes, para que uma execução não falhe por uma CLI em falta; o `peek`
(abaixo) apanha uma janela deixada num ecrã de início de sessão.
`reevesagents doctor --json` devolve o mesmo em JSON legível por máquina.

Requisitos: Node 20.19+, tmux 3.0+ e pelo menos uma CLI de fornecedor instalada
e autenticada. macOS, Linux ou WSL (o Windows nativo não é um alvo).

## Instalar

```sh
pnpm add -g reevesagents     # ou: npm install -g reevesagents
```

Execução sem instalação: `pnpm dlx reevesagents doctor`.

## Iniciar agentes

Cada agente escreve-se como `provider[:nickname[:model]]`; nickname e model são
opcionais. O primeiro agente lidera a execução; os restantes juntam-se como
trabalhadores.

```sh
# Um Claude Code principal, um segundo Claude Code revisor, dois trabalhadores Codex, um trabalhador Kimi.
reevesagents spawn cc:lead cc:review codex:api codex:tests kimi:docs \
  --name "feature x" --skip \
  --prompt "Build feature X. Lead coordinates; each worker takes a slice."
```

Antes de iniciar o que quer que seja, o `spawn` verifica se cada CLI de
fornecedor indicada está no PATH e nomeia as que faltam, para que um erro de
escrita ou uma CLI por instalar falhe cedo, em vez de deixar uma execução meio
arrancada. Em caso de sucesso, imprime o id da execução, o id de cada
agente e os comandos exatos de `peek`/`send`/`open` para os conduzir.

Flags úteis de `spawn`: `--name <run>`, `--cwd <dir>` (por defeito, o diretório
atual), `--prompt <text>` (colado em cada agente no arranque), `--skip` (lança
os agentes sem os seus próprios pedidos de permissão; use-o quando não houver um
humano para aprovar), `--run <run-id>` (adiciona agentes a uma execução
existente em vez de iniciar uma nova), `--extra-args <args>` (flags acrescentadas
a cada lançamento de agente, para opções de fornecedor que o ReevesAgents não
contempla, por exemplo `--remote-control`), `--json` (imprime os ids da execução
e dos agentes como JSON em vez de texto).

## Ids de fornecedores e aliases

Execute `reevesagents providers` (acrescente `--json` para uma lista legível por
máquina). Qualquer alias serve como fornecedor numa spec de spawn.

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
reevesagents agents <run-id>           # listar os agentes de uma execução
reevesagents peek <agent-id> -n 40     # saída recente de um agente
reevesagents send <agent-id> "do X"    # colar texto no prompt do agente
reevesagents key <agent-id> enter      # submeter (send não submete por si próprio)
reevesagents interrupt <agent-id>      # enviar ctrl-c ao agente
reevesagents open <run-id|agent-id>    # saltar para a sua janela tmux
reevesagents approvals                 # pedidos de aprovação pendentes (acrescente --json)
reevesagents approve <approval-id>     # resolver um; deny <approval-id> recusa-o
```

O `send` apenas cola; siga-o com `key <agent-id> enter` para submeter. Teclas
aceites por `key`: `enter`, `escape`, `backspace`, `tab`, `space`, `up`, `down`,
`left`, `right`, `ctrl-c`.

## Parar de forma limpa

```sh
reevesagents stop <run-id> --yes       # terminar uma execução inteira e desmontar a sua sessão tmux
reevesagents kill <agent-id> --yes     # terminar um agente
```

`stop` e `kill` recusam-se a correr sem `--yes`. A mesma proteção aplica-se à
limpeza: `delete <agent-id>` e `delete-run <run-id>` removem registos
terminados, e `delete-history <id>` remove um registo arquivado.

## Um exemplo trabalhado: cinco agentes, depois orientá-los

O cenário "instalar o reevesagents, criar dois Claude, dois Codex e um Kimi, e
pô-los a trabalhar", do início ao fim.

```sh
# 1. Confirmar que as cinco CLIs estão instaladas e compatíveis.
reevesagents doctor

# 2. Iniciar a equipa. --skip para que os trabalhadores não parem nos seus próprios pedidos de permissão.
reevesagents spawn cc:lead cc:review codex:api codex:tests kimi:docs \
  --name "feature x" --skip \
  --prompt "Build feature X. Lead coordinates; each worker owns one slice."

# 3. spawn imprime o id de cada agente. Listar todos, ou ler apenas um.
reevesagents agents <run-id>
reevesagents peek <agent-id> -n 40

# 4. Orientar: colar uma mensagem e depois submetê-la.
reevesagents send <agent-id> "rebase on main, then run the tests"
reevesagents key  <agent-id> enter

# 5. Adicionar um trabalhador à mesma execução mais tarde.
reevesagents spawn codex:perf --run <run-id> --skip --prompt "profile the hot path"

# 6. Terminar a execução quando estiver concluída.
reevesagents stop <run-id> --yes
```

Conduzido a partir de uma CLI anfitriã via MCP, em vez da shell, o mesmo cenário
é uma única instrução: "Usar o reevesagents para iniciar uma equipa: um Claude
Code principal, um segundo revisor Claude Code, dois trabalhadores Codex (api e
tests) e um trabalhador Kimi para docs. Saltar os pedidos de permissão,
entregar-lhes o briefing e depois observar e reportar o progresso." A anfitriã
chama ela própria as ferramentas de spawn/read/send. Consulte
[docs/mcp.md](docs/mcp.md).

## Fazer e não fazer

Fazer:

- Execute `doctor` antes de um spawn e certifique-se de que cada fornecedor que
  nomeia está instalado **e com sessão iniciada**. O doctor não consegue testar
  o início de sessão; se uma janela ficar parada, o `peek` mostra o ecrã de
  início de sessão.
- Trate o `spawn` como fire-and-forget. Devolve ids, não respostas. Vá
  consultando `runs`, `agents <run-id>` e `peek <agent-id> -n 40` para ver o que
  uma equipa está a fazer.
- Submeta a entrada em dois passos: `send <agent-id> "..."` cola,
  `key <agent-id> enter` submete.
- Passe `--skip` quando não houver um humano para aprovar os pedidos, ou os
  trabalhadores ficam presos logo no primeiro.
- Use `--json` (em `spawn`, `runs`, `agents`, `providers`, `doctor`) quando um
  script ou um agente precisar de ler ids e estado em vez de texto.
- Nomeie fornecedores pelo id ou por qualquer alias de `reevesagents providers`
  (`cc` ou `claude`, `codex`, `kimi`, ...).

Não fazer:

- Não espere que o `spawn` devolva o resultado de um agente; inicie a equipa e
  depois leia-o.
- Não faça `send` e assuma que correu; nada é submetido até fazer
  `key <agent-id> enter`.
- Não faça spawn de um fornecedor em falta ou sem sessão iniciada; o spawn
  recusa o primeiro, e o segundo deixa uma janela parada num prompt de início de
  sessão que nunca faz o trabalho.
- Não execute `stop`, `kill` nem os comandos `delete` sem `--yes`; esses são os
  destrutivos.
- Não tenha o Windows nativo como alvo; corra dentro do WSL, com o tmux e as
  CLIs aí instalados.
- Não cole segredos num `--prompt` nem num `send`; a saída é capturada e
  mostrada através do `peek` e da Web UI.

## Notas de scripting

- `spawn`, `runs`, `agents`, `providers` e `doctor` aceitam todos `--json`.
- `spawn --json` imprime o id da execução e o id de cada agente; capture-os, ou
  volte a lê-los com `runs --json` e `agents <run-id> --json`.
- Substitua o diretório de estado com `REEVES_REGISTRY` e o ficheiro de
  configuração com `REEVES_CONFIG` para manter uma execução por script isolada
  de `~/.reeves`.

## Mais

- [README](README.md): a panorâmica completa das funcionalidades e todos os
  comandos.
- [docs/GUIDE.md](docs/GUIDE.md): guia do utilizador passo a passo.
- [docs/mcp.md](docs/mcp.md): o design do MCP de controlo de agentes e a lista
  de ferramentas.
