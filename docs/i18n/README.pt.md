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
  <a href="https://reevesagents.mertkayacs.com/docs"><b>Documentação</b></a> ·
  <a href="https://reevesagents.mertkayacs.com/faq"><b>FAQ</b></a> ·
  <a href="https://github.com/mertkayacs/reevesagents/issues"><b>Issues</b></a>
</p>

[English](../../README.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · **Português** · [Italiano](README.it.md) · [Türkçe](README.tr.md) · [Русский](README.ru.md) · [简体中文](README.zh-Hans.md) · [العربية](README.ar.md)

O ReevesAgents é um espaço de trabalho local para CLIs de programação com IA.
Põe o Claude Code, o Codex, o OpenCode, o Hermes, o Kimi, o DeepSeek, o Qwen, o
Pi, o Aider e outras CLIs de fornecedor a correr lado a lado no tmux. Pode
usá-lo como uma CLI/TUI/Web UI normal, ou associar o seu MCP opcional para que
um agente possa criar, ler, orientar e parar os restantes.

O início de sessão de cada fornecedor fica dentro da respetiva CLI. O ReevesAgents guarda o
seu estado em alguns ficheiros JSON simples em `~/.reeves` e só está a correr enquanto o
estiver a usar, diretamente ou através de uma CLI associada.

## Início rápido

```sh
pnpm add -g reevesagents
reevesagents doctor
reevesagents
```

Iniciar uma execução a partir da CLI:

```sh
reevesagents spawn claude-code:lead codex:tests hermes:research \
  --name "release check" \
  --prompt "Review the release path, test coverage, and docs."
```

Abrir a Web UI:

```sh
reevesagents web
```

Deixar um agente associado conduzir os outros:

```sh
reevesagents attach codex
reevesagents hosts
```

Reinicie essa CLI depois de a associar, para que carregue as ferramentas MCP.

## O que oferece

| Superfície | Para que serve |
| --- | --- |
| **TUI** | Controlo das execuções pelo teclado, dentro do terminal. |
| **Web UI** | Vista visual local de execuções, painéis, agentes, aprovações e histórico. |
| **CLI** | Scripts, verificações rápidas, criação de agentes, limpeza de estado e saltos no tmux. |
| **Agent Control MCP** | Uma CLI de confiança pode criar e conduzir outras CLIs através de ferramentas locais. |
| **tmux** | Janelas com as CLIs reais dos fornecedores, que continuam a correr depois de fechar a interface. |

O ReevesAgents é local por conceção. O estado é JSON simples em `~/.reeves`, e
as CLIs que arranca são as mesmas que já usa à mão.

<a id="install"></a>
<details>
<summary><strong>Instalação</strong></summary>

O ReevesAgents precisa de Node.js `20.19+`, tmux `3.0+` e pelo menos uma CLI de
fornecedor suportada, instalada e autenticada. Funciona em macOS, Linux e WSL.

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

Para fixar uma versão, substitua `<version>`:

```sh
pnpm add -g reevesagents@<version>
```

Instalação a partir do código-fonte:

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
<summary><strong>Capturas de ecrã</strong></summary>

A TUI e a Web UI conduzem as mesmas execuções locais:

![TUI do ReevesAgents: seletor de idioma, menu de boas-vindas e doctor](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-tui.gif)

![Web UI do ReevesAgents: execuções e painéis de agentes ao vivo](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-web-pt.png)

![Web UI do ReevesAgents: iniciar uma nova execução](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-newrun-pt.png)

</details>

<a id="commands"></a>
<details>
<summary><strong>Comandos</strong></summary>

Sem argumentos, abre a TUI.

| Comando | Função |
| --- | --- |
| `reevesagents` | Abre a TUI. |
| `spawn [spec...]` | Inicia uma execução. Cada spec tem a forma `provider[:nickname[:model]]`. |
| `add [spec...]` | Acrescenta agentes à execução ativa mais recente. |
| `runs` | Lista as execuções ativas. |
| `agents [run-id]` | Lista os agentes de todas as execuções ou de uma só. |
| `open <id>` | Salta para a janela tmux de uma execução ou de um agente. |
| `peek <agent-id>` | Mostra a saída recente de um agente. |
| `send <agent-id> <text...>` | Cola texto num agente sem o submeter. |
| `key <agent-id> <key>` | Envia `enter`, `escape`, setas, `tab`, `space`, `backspace` ou `ctrl-c`. |
| `interrupt <agent-id>` | Envia Ctrl-C a um agente. |
| `stop <run-id>` | Para uma execução. Requer `--yes` ou `ALLOW_DESTRUCTIVE=1`. |
| `kill <agent-id>` | Para um agente. Requer `--yes` ou `ALLOW_DESTRUCTIVE=1`. |
| `setup` | Verificação da primeira utilização. `--attach` liga todas as CLIs anfitriãs instaladas. |
| `doctor` | Verifica o Node, o tmux, o estado e as CLIs de fornecedor. |
| `web` | Inicia a Web UI, acessível apenas por loopback. |
| `providers` | Lista ids de fornecedores, aliases, modelos e disponibilidade. |
| `approvals` | Lista os pedidos de aprovação pendentes. |
| `approve` / `deny` | Resolve um pedido de aprovação. |
| `hosts` | Mostra que CLIs anfitriãs têm o ReevesAgents associado. |
| `attach [cli]` | Liga o MCP de Agent Control a uma CLI anfitriã, ou a todas as instaladas. |
| `detach <cli>` | Remove essa ligação MCP de uma CLI anfitriã. |
| `skills [action]` | Instala, remove ou inspeciona a skill do ReevesAgents. |
| `mcp` | Inicia o servidor MCP por stdio. São as CLIs anfitriãs que o executam. |
| `config [key] [value]` | Mostra ou altera as definições editáveis. |
| `presets` | Lista os presets de execução guardados. |
| `save-preset` | Guarda uma execução ativa como preset. |
| `start-preset` | Inicia uma execução a partir de um preset. |
| `delete-preset` | Apaga um preset. |
| `delete` | Apaga o registo de um agente terminado. Pede confirmação. |
| `delete-run` | Apaga uma execução terminada e arquiva-a. Pede confirmação. |
| `history` | Lista as execuções arquivadas. |
| `delete-history` | Apaga um registo do histórico arquivado. Pede confirmação. |
| `reap` | Termina agentes zombie e agentes que passaram `max_lifetime_ms`, e mata sessões tmux órfãs que nenhum registo de execução reclama. |

Flags comuns:

- `--json`: disponível nos comandos de listagem e de ação pensados para scripts.
- `--name <name>`: dá nome a uma execução.
- `--cwd <dir>`: corre os agentes a partir de um diretório.
- `--prompt <text>`: cola texto inicial em cada agente criado.
- `--skip`: salta os pedidos de permissão do fornecedor, para trabalhadores sem supervisão.
- `--run <run-id>`: acrescenta agentes a uma execução específica.
- `--port <n>` e `--no-open`: opções de arranque da Web UI.

</details>

<a id="agent-control"></a>
<details>
<summary><strong>Agent Control</strong></summary>

O Agent Control é um servidor MCP opcional. Associe-o apenas a uma CLI em que
confie para conduzir ferramentas locais:

```sh
reevesagents attach claude
reevesagents hosts
```

Depois de reiniciar, essa CLI recebe ferramentas para `spawn`, `read`,
`send_text`, `send_key`, `interrupt`, `kill` e `stop`, para gerir aprovações e
presets e para inspecionar anfitriãs. O catálogo de fornecedores fica também
disponível como `reevesagents://providers`.

Por defeito, os trabalhadores ficam sem o MCP. Se um trabalhador tiver de criar
os seus próprios trabalhadores, associe o ReevesAgents à CLI desse trabalhador
de forma explícita.

O Codex coloca as chamadas MCP numa sandbox por defeito, o que bloqueia o
arranque de sessões tmux. Quando usar o Codex como anfitriã que conduz agentes,
corra-o com acesso total, por exemplo `codex --sandbox danger-full-access`, ou
use um perfil do Codex que defina `sandbox_mode = "danger-full-access"`.

Referência completa das ferramentas: [docs/mcp.md](../mcp.md). Guia de operação
escrito para agentes: [AGENTS.pt.md](../../AGENTS.pt.md).

</details>

<a id="configuration"></a>
<details>
<summary><strong>Configuração</strong></summary>

O estado fica em `~/.reeves`:

```text
~/.reeves/
  config.json
  presets/
  runs/
  history/
```

Duas variáveis de ambiente substituem os caminhos predefinidos:

- `REEVES_REGISTRY`: muda a raiz do estado para `runs/`, `history/` e `presets/`.
- `REEVES_CONFIG`: muda o caminho do ficheiro de configuração.

Um registo por servidor tmux: a limpeza de órfãos em segundo plano decide a
quem pertence cada sessão com base no registo atual, por isso dois registos
nunca devem partilhar o mesmo servidor tmux.

Tudo o que possa conter um segredo é limpo antes de chegar a um ficheiro.

</details>

<a id="examples"></a>
<details>
<summary><strong>Exemplos</strong></summary>

Distribuir um projeto por várias CLIs:

```sh
reevesagents spawn deepseek:backend claude-code:product codex:review \
  --name "feature x" \
  --prompt "Backend, product copy, and a review pass."
```

Acompanhar um agente e depois abrir a janela dele:

```sh
reevesagents peek backend -n 40
reevesagents open backend
```

Parar a execução quando o trabalho estiver feito:

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

A Web UI liga-se apenas a `127.0.0.1` e corre em primeiro plano. Os agentes
continuam a correr depois de fechar a página, porque vivem no tmux.

A Web UI usa dois módulos opcionais de runtime, `ws` e `@lydell/node-pty`, que
o npm instala por defeito. Os comandos da CLI e da TUI funcionam sem eles, e o
`reevesagents web` explica o que falta.

Para lhe aceder a partir de outra máquina, encaminhe a porta de loopback por
SSH:

```sh
ssh -L 8080:127.0.0.1:8080 user@host
```

</details>

<a id="troubleshooting"></a>
<details>
<summary><strong>Resolução de problemas</strong></summary>

**O tmux não está instalado.** Instale o tmux e corra `reevesagents doctor`. A
TUI embrulha-se automaticamente numa sessão tmux chamada `reeves`; defina
`REEVES_NO_TMUX_WRAPPER=1` para desativar esse comportamento.

**Falta uma CLI de fornecedor ou a sessão expirou.** O ReevesAgents lança CLIs
de fornecedor que já estejam no `PATH` e autenticadas. O `reevesagents doctor`
mostra o que foi detetado. Se uma janela lançada ficar à espera no início de
sessão, o `peek` mostra-o.

**A Web UI indica pacotes em falta.** Reinstale com as dependências opcionais
ativadas e depois corra `reevesagents doctor`.

**A porta já está em uso.** O `reevesagents web` começa pela `8080` por
defeito. Se estiver ocupada, o servidor fica com a porta livre seguinte dentro
de um pequeno intervalo e imprime o URL.

</details>

<a id="contributing"></a>
<details>
<summary><strong>Contribuir</strong></summary>

A documentação para quem contribui está em [docs/](..). Comece pelo
[CONTRIBUTING.md](../../.github/CONTRIBUTING.md), pelos [testes](../testing.md)
e pelo processo de [releases](../releasing.md).

Quem só usa a ferramenta dispensa a toolchain de desenvolvimento. Quem contribui
usa pnpm, TypeScript, tsup, Vitest e ESLint a partir do repositório.

</details>

## Links

- Site: https://reevesagents.mertkayacs.com
- npm: https://www.npmjs.com/package/reevesagents
- GitHub: https://github.com/mertkayacs/reevesagents
- Releases: https://github.com/mertkayacs/reevesagents/releases
- Issues: https://github.com/mertkayacs/reevesagents/issues
- Changelog: [CHANGELOG.md](../../CHANGELOG.md)
- Licença: [Apache-2.0](../../LICENSE)
