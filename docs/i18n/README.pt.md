<p align="center">
  <a href="https://reevesagents.mertkayacs.com">
    <img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-header.gif" alt="ReevesAgents" width="800" />
  </a>
</p>

[![npm version](https://img.shields.io/npm/v/reevesagents.svg)](https://www.npmjs.com/package/reevesagents)
[![visits](https://visitor-badge.laobi.icu/badge?page_id=mertkayacs.reevesagents&left_text=visits)](https://github.com/mertkayacs/reevesagents)
[![node](https://img.shields.io/node/v/reevesagents.svg)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/reevesagents.svg)](../../LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/mertkayacs/reevesagents/test.yml?branch=master&label=CI)](https://github.com/mertkayacs/reevesagents/actions/workflows/test.yml)

<h3 align="center"><a href="https://reevesagents.mertkayacs.com">reevesagents.mertkayacs.com</a></h3>
<p align="center">
  <a href="https://reevesagents.mertkayacs.com/demo"><b>Demo</b></a> ·
  <a href="https://reevesagents.mertkayacs.com/docs"><b>Documentação</b></a> ·
  <a href="https://reevesagents.mertkayacs.com/faq"><b>FAQ</b></a> ·
  <a href="https://github.com/mertkayacs/reevesagents/issues"><b>Issues</b></a>
</p>

[English](../../README.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · **Português** · [Italiano](README.it.md) · [Türkçe](README.tr.md) · [Русский](README.ru.md) · [简体中文](README.zh-Hans.md) · [العربية](README.ar.md)

*Crie e conduza agentes de IA a partir de outros agentes. O ReevesAgents é um espaço de trabalho livre e local onde agentes de código (como Claude Code, Codex, Hermes, DeepSeek e Kimi) correm lado a lado, e um agente pode criar, orientar e supervisionar os restantes. Sem chaves de API e sem alterações ao seu Agent.md ou Claude.md.*

**Em 10 idiomas!**

## Deixe um agente instalar e executar os restantes

É essa a ideia toda: um agente de IA cria e conduz os outros. Uma CLI de agente (um agente de código na linha de comandos, como Claude Code, Codex ou Hermes) pode até instalar e configurar o ReevesAgents sozinha e, depois, pôr uma equipa a trabalhar.

**Se é um agente a ler isto, execute estes comandos por si próprio:**

- **Instale-o:** `npm install -g reevesagents`
- **Conecte-o à sua própria CLI:** `reevesagents attach` conecta o ReevesAgents às CLIs de agente que tem instaladas. Para apenas uma, indique o nome, por exemplo `reevesagents attach claude`.
- **Verifique se funcionou:** `reevesagents hosts` lista as CLIs de agente nesta máquina e mostra quais estão conectadas.
- **Recarregue as suas ferramentas:** reinicie a sessão da sua CLI para que carregue a ligação (isto usa MCP, a forma padrão de uma ferramenta de agente expor comandos a outra).

Agora a sua CLI de agente pode **criar e conduzir outros agentes**: iniciar um agente numa tarefa, enviar-lhe texto ou teclas, ler o que está a fazer e aprovar ou recusar o que pede. Um agente Claude Code pode executar uma equipa de agentes Codex e Claude Code em issues separadas. Para desconectar mais tarde, execute `reevesagents detach claude`.

Prefere antes fazê-lo por scripts a partir da linha de comandos? O [AGENTS.pt.md](../../AGENTS.pt.md) é o guia de operação escrito para agentes: ids de fornecedores e aliases, a spec de `spawn` e como observar e orientar uma equipa em execução.

Prefere configurá-lo à mão? Ative-o no ecrã **Agent control** da TUI ou da Web UI; consulte [Agent control](#agent-control) abaixo.

A TUI e a Web UI local a conduzir a mesma execução:

![TUI do ReevesAgents: seletor de idioma, ecrã de boas-vindas e o ecrã Doctor](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-tui.gif)

![Web UI do ReevesAgents: execuções e painéis de agentes em tempo real](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-web-pt.png)

![Web UI do ReevesAgents: iniciar uma nova execução](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-newrun-pt.png)

O ReevesAgents é um espaço de trabalho livre e de código aberto para agentes de
código de IA. Execute vários ao mesmo tempo e deixe um agente criar e conduzir
os outros: um agente Claude Code a gerir agentes Codex e Claude Code em issues
separadas. Ponha cada agente onde é mais forte, por exemplo o DeepSeek no
backend, o Claude na direção de produto e web, o Codex num design system ou numa
passagem de implementação, e o Hermes em correio, pesquisa ou investigação.

A interface está disponível em 10 idiomas: inglês, alemão, francês, espanhol,
português, italiano, turco, russo, chinês simplificado e árabe.

Novo no ReevesAgents? O [Guia do Utilizador](../GUIDE.pt.md) acompanha-o pela
instalação, pela primeira execução e por deixar um agente conduzir os restantes.

## Superfícies

| Superfície | Para que serve |
| --- | --- |
| **TUI** | Controlo rápido, com prioridade ao teclado, dentro do terminal. |
| **Web UI** | Uma vista visual única de execuções, agentes, painéis em tempo real e histórico. |
| **CLI** | Scripts, comandos rápidos de spawn, verificações do doctor e abertura no tmux. |
| **tmux** | Janelas reais das CLIs dos fornecedores que continuam a correr localmente. |
| **Agent control** | A ideia central: um agente cria e conduz os outros. Ativa-o por CLI e, depois, um agente Claude Code pode executar agentes Codex, Hermes e Claude Code ao mesmo tempo. |

## Porquê o ReevesAgents

- **Deixe o seu agente conduzir agentes.** A sua CLI principal (digamos, o Claude Code) cria e orienta um conjunto de agentes Claude, Codex, DeepSeek, Hermes, OpenCode ou outros através de MCP.
- **Multitarefa e ciclos.** Corra vários agentes em paralelo em partes diferentes de um projeto, mantenha agentes de longa duração a trabalhar e observe-os todos numa única vista. Ponha um modelo mais barato à frente para encaminhar o trabalho para agentes mais inteligentes ou mais pequenos.
- **Mantenha o custo prático.** Deixe modelos baratos ou gratuitos escrever o código e os testes de rotina enquanto planeia e desenha com um maior, em vez de empurrar tudo por um único modelo padrão dispendioso.
- **Um espaço de trabalho, sem perder o fio.** Se já salta entre Claude, Codex, DeepSeek, Hermes ou OpenCode, o ReevesAgents junta essas sessões num único sítio local; abra qualquer agente a partir da TUI ou da Web UI para o conduzir diretamente.
- **Mantenha-se flexível quanto a fornecedores.** O início de sessão do fornecedor fica com cada CLI. O ReevesAgents nunca armazena credenciais nem encaminha o tráfego dos modelos, por isso pode adicionar, remover ou trocar de CLI livremente.
- **Veja o trabalho de relance.** Execuções ativas, agentes, modelos, modos de permissão, ações de parar e eliminar e o histórico numa única vista da Web UI, enquanto o tmux mantém vivas as CLIs reais.

Isto não é uma plataforma de agentes na cloud. É uma pequena camada local em
torno de CLIs reais: sem base de dados, sem Docker, sem daemon em segundo plano e
sem chaves de API armazenadas pelo ReevesAgents.

## Instalação

O ReevesAgents é publicado no npm como `reevesagents`. Instale-o globalmente com o
gestor de pacotes que já utiliza e, depois, verifique a máquina com `doctor`.

```sh
npm install -g reevesagents
reevesagents doctor
reevesagents
```

Para fixar uma versão, acrescente `@<version>` ao nome do pacote, por exemplo
`npm install -g reevesagents@1.3.1`.

<details>
<summary><b>pnpm</b></summary>

```sh
pnpm add -g reevesagents
reevesagents doctor
reevesagents
```

Numa só passagem, sem instalação global:

```sh
pnpm dlx reevesagents doctor
```

</details>

<details>
<summary><b>Yarn</b></summary>

Numa só passagem com Yarn (Berry):

```sh
yarn dlx reevesagents doctor
```

Instalação global com Yarn Classic:

```sh
yarn global add reevesagents
reevesagents doctor
reevesagents
```

</details>

<details>
<summary><b>Bun</b></summary>

```sh
bun add -g reevesagents
reevesagents doctor
reevesagents
```

Numa só passagem, sem instalação global:

```sh
bunx reevesagents doctor
```

</details>

<details>
<summary><b>npx (sem instalação)</b></summary>

```sh
npx reevesagents doctor
```

</details>

<details>
<summary><b>Homebrew</b></summary>

```sh
brew tap mertkayacs/reevesagents
brew install reevesagents
reevesagents doctor
reevesagents
```

</details>

<details>
<summary><b>A partir do código-fonte</b></summary>

Use o código-fonte quando quiser inspecionar o código, contribuir ou executar a
partir do repositório.

```sh
git clone https://github.com/mertkayacs/reevesagents.git
cd reevesagents
pnpm install
pnpm build
pnpm link --global
reevesagents doctor
reevesagents
```

</details>

## Pré-requisitos

O ReevesAgents é local-first. Espera uma máquina de programador normal com tmux e
pelo menos uma CLI de fornecedor já instalada.

- macOS, Linux ou WSL. O Windows nativo não é o ambiente de execução alvo; use WSL.
- Node.js `20.19+`.
- tmux. Recomenda-se a versão `3.0+`.
- Uma shell interativa normal no `PATH`.
- Pelo menos uma CLI de fornecedor suportada no `PATH`.

O ReevesAgents pode lançar estas CLIs de fornecedor quando estão instaladas e
autenticadas na sua máquina: Claude Code, Codex CLI, OpenCode, Hermes, Kimi,
DeepSeek, Pi, Qwen e Aider. O início de sessão do fornecedor, os modelos, as
ferramentas, as quotas e os pedidos de permissão ficam com cada fornecedor. O
ReevesAgents não armazena chaves de API de fornecedores e não encaminha o tráfego
dos modelos.

## Início Rápido

```sh
reevesagents                 # lançar a TUI
reevesagents web             # abrir a Web UI local
reevesagents doctor          # verificar a máquina
```

Inicie uma execução com nome a partir da CLI. A primeira spec é a principal, as
restantes são trabalhadoras, e cada spec é `provider[:nickname[:model]]`:

```sh
reevesagents spawn deepseek:backend claude-code:product codex:system hermes:research \
  --name "launch week build" \
  --prompt "Plan the backend, product surface, design system, and research notes."
```

Para um percurso completo, consulte o [Guia do Utilizador](../GUIDE.pt.md).

## Comandos

Sem argumentos, lança a TUI. Os subcomandos são a superfície de operação para
pessoas e scripts.

A superfície do dia a dia:

| Comando | Finalidade |
| --- | --- |
| `reevesagents` | Lançar a TUI (sem subcomando). |
| `spawn [spec...]` | Iniciar uma execução com um ou mais agentes de fornecedor. Cada `spec` é `provider[:nickname[:model]]`. A primeira spec é a principal, as restantes são trabalhadoras. Sem spec, assume `codex` por defeito. Flags principais: `--name <name>` (por defeito `run`), `--cwd <dir>` (por defeito o diretório atual), `--prompt <text>` (colado em cada agente), `--skip` (salta os pedidos de permissão), `--run <run-id>` (adiciona agentes a uma execução existente), `--auth-mode <mode>`, `--effort <level>`, `--json`. |
| `runs` | Listar as execuções ativas, uma por linha. Flags principais: `--json` (registos completos das execuções como um array JSON). |
| `agents [run-id]` | Listar os agentes de todas as execuções, ou os de uma só execução. Flags principais: `--json`. |
| `open <id>` | Mudar o tmux para a janela Reeves de uma execução ou para uma janela de agente. Dentro do tmux, muda; fora do tmux num TTY, liga-se; caso contrário, imprime um comando tmux pronto a colar. Aceita um id/nome de execução ou um id/nickname de agente (é permitida a correspondência por prefixo). |
| `peek <agent-id>` | Imprimir a saída recente de um agente. Flags principais: `-n, --lines <n>` (por defeito `20`), `--json` (linhas como um array). |
| `send <agent-id> <text...>` | Colar texto no prompt de um agente. Não submete; siga com `key <agent-id> enter`. |
| `key <agent-id> <key>` | Enviar uma tecla: `enter`, `escape`, `backspace`, `tab`, `space`, `up`, `down`, `left`, `right` ou `ctrl-c`. |
| `interrupt <agent-id>` | Enviar ctrl-c a um agente. |
| `stop <run-id>` | Parar uma execução. Flags principais: `-y, --yes` (ou `ALLOW_DESTRUCTIVE=1`). |
| `kill <agent-id>` | Parar um agente. Flags principais: `-y, --yes` (ou `ALLOW_DESTRUCTIVE=1`). |
| `doctor` | Executar verificações de saúde do ambiente (Node, tmux, caminho de estado, CLIs de fornecedores). Termina com código diferente de zero em qualquer verificação falhada. Flags principais: `--json`. |
| `web` | Iniciar a Web UI a pedido, só por loopback. Corre em primeiro plano; os agentes continuam a correr depois de a parar. Flags principais: `--port <n>` (porta preferida, recua para a próxima porta livre), `--no-open` (não abrir o browser). |

Descoberta, aprovações, controlo de agentes, configuração e limpeza:

| Comando | Finalidade |
| --- | --- |
| `providers` | Listar todos os fornecedores com disponibilidade, aliases e modelos conhecidos. Flags principais: `--models`, `--json`. |
| `approvals` | Listar os pedidos de aprovação pendentes dos agentes. Flags principais: `--json`. |
| `approve <approval-id> [note]` | Resolver um pedido de aprovação como aprovado. |
| `deny <approval-id> [note]` | Resolver um pedido de aprovação como recusado. |
| `hosts` | Listar as CLIs de agente nesta máquina e mostrar a quais o ReevesAgents está conectado. |
| `attach [cli]` | Conectar o ReevesAgents a uma CLI de agente, ou a todas as instaladas quando não se indica nenhum nome. Executa o próprio `mcp add` dessa CLI. |
| `detach <cli>` | Desconectar o ReevesAgents de uma CLI de agente. Executa o próprio `mcp remove` dessa CLI. |
| `mcp` | Iniciar o servidor MCP de Agent control por stdio. Não se executa à mão; é a CLI à qual o associa que o executa. |
| `config [key] [value]` | Mostrar todas as definições editáveis, ler uma ou definir uma. Flags principais: `--json`. |
| `presets` | Listar as predefinições de execução guardadas. Flags principais: `--json`. |
| `save-preset <run-id> <name> [description...]` | Capturar uma execução em curso como predefinição reutilizável. |
| `start-preset <name>` | Iniciar uma nova execução a partir de uma predefinição. Flags principais: `--name <run>`, `--cwd <dir>`. |
| `delete-preset <name>` | Eliminar uma predefinição. Flags principais: `-y, --yes`. |
| `delete <agent-id>` | Eliminar o registo de um agente terminado. Flags principais: `-y, --yes`. |
| `delete-run <run-id>` | Eliminar uma execução terminada e arquivá-la no histórico. Flags principais: `-y, --yes`. |
| `history` | Listar as execuções terminadas e obsoletas arquivadas. Flags principais: `--json`. |
| `delete-history <id>` | Eliminar um registo arquivado do histórico. Flags principais: `-y, --yes`. |

`stop`, `kill` e os comandos `delete` são destrutivos. Recusam-se a correr sem
`--yes` ou `ALLOW_DESTRUCTIVE=1`.

## Agent control

O ReevesAgents inclui um servidor MCP opcional que permite a uma CLI de IA criar e
conduzir outras CLIs de IA: iniciar um agente, colar um prompt, enviar teclas, ler
a saída e resolver pedidos de aprovação. É um mecanismo simples, não uma política
de orquestração: sem papéis, sem ciclos autónomos, sem protocolo de coordenação.

Está desativado por defeito. O ReevesAgents nunca o associa a uma CLI por
iniciativa própria.

Ativa-o a partir do ecrã **Agent control** na TUI ou na Web UI. Esse ecrã lista as
CLIs desta máquina que podem alojar um servidor MCP (claude, codex, kimi, qwen,
opencode, hermes) e permite associar, desassociar ou associar todas. Associar
executa o próprio comando `mcp add` dessa CLI (por exemplo
`claude mcp add reevesagents -- reevesagents mcp`); desassociar executa o remove
correspondente. O ReevesAgents só invoca o comando próprio de cada CLI e nunca
edita à mão os ficheiros de configuração dos fornecedores. O OpenCode é a exceção:
o seu `mcp add` é interativo e não tem remove, por isso o ecrã marca-o como
associar à mão.

Assim que uma CLI está associada, passa a ter as ferramentas de Agent Control
sempre que arranca. Instalá-lo é uma escolha explícita sua, e essa escolha é o
consentimento. Uma execução é a CLI controladora como cabeça, mais os agentes que
criou, e o grupo inteiro aparece na TUI e na Web UI como qualquer outra execução.

Os trabalhadores criados não recebem o MCP por defeito, por isso não conseguem
criar mais agentes. Para deixar um trabalhador conduzir os seus próprios
subtrabalhadores, associe o MCP à CLI desse trabalhador a partir do mesmo ecrã.
As salvaguardas ficam ao nível dos recursos: um limite de agentes por execução
(`max_agents`), imposto quando a ferramenta de spawn adiciona a uma execução, e o
facto de cada agente ser um processo de CLI real no seu próprio painel tmux.

Uma CLI associada também consegue descobrir o que pode lançar: a ferramenta
`list_providers` e o recurso `reevesagents://providers` devolvem os fornecedores
desta máquina com os seus ids, estado de instalação, aliases e modelos conhecidos,
para que um agente passe um id real ao `spawn` em vez de adivinhar.

Consulte [docs/mcp.md](../mcp.md) para o design completo e a lista de
ferramentas.

## Configuração

O estado e a configuração são JSON local. Sem base de dados, sem daemon.

O estado fica em `~/.reeves`:

```text
~/.reeves/
  config.json     definições globais (intervalo de peek, idioma, permissões por defeito, limites)
  presets/        predefinições de execução guardadas
  runs/           uma pasta por execução ativa (run.json mais agents/<id>.json)
  history/        execuções terminadas e obsoletas arquivadas (history/runs/<id>.json)
```

Duas variáveis de ambiente substituem os valores por defeito, sobretudo para
testes isolados ou utilização multi-perfil:

- `REEVES_REGISTRY`: substituição da raiz de estado. Substitui `~/.reeves` como
  diretório para `runs/`, `history/` e `presets/`.
- `REEVES_CONFIG`: substituição do caminho do ficheiro de configuração. Substitui
  `~/.reeves/config.json`.

Os campos de texto que podem conter segredos são ocultados antes de serem
escritos no estado.

## Exemplos

Distribua um projeto pelas CLIs que se adequam a cada tarefa:

```sh
reevesagents spawn deepseek:backend claude-code:product codex:review \
  --name "feature x" --prompt "Backend, product copy, and a review pass."
```

Liste o que está vivo e obtenha o id da execução:

```sh
reevesagents runs
reevesagents runs --json   # adequado a scripts
```

Observe um único agente sem sair da sua shell e entre nele quando ele precisar
de si:

```sh
reevesagents peek backend -n 40
reevesagents open backend
```

Quando o trabalho estiver concluído, pare a execução inteira numa só chamada:

```sh
reevesagents stop "feature x" --yes
```

## Web UI

A Web UI é local e só por loopback.

```sh
reevesagents web
```

Liga-se a `127.0.0.1`, corre em primeiro plano e termina quando a parar. Os
agentes continuam a correr no tmux depois disso. A partir do browser pode criar
execuções, adicionar agentes, escolher modelos de fornecedores e modos de
permissão, parar agentes, eliminar trabalho terminado e inspecionar o histórico
enquanto as CLIs reais continuam a correr.

A Web UI usa dois módulos de runtime opcionais, `ws` e `@lydell/node-pty`. O npm
instala-os por defeito. A CLI e a TUI continuam a funcionar sem eles, e o comando
`web` explica o que está em falta.

Para alcançar a Web UI a partir de outra máquina, encaminhe a porta de loopback
por SSH. Não há túnel integrado:

```sh
ssh -L 8080:127.0.0.1:8080 user@host
# depois navegue para http://localhost:8080
```

## Resolução de Problemas

**O tmux não está instalado.** O ReevesAgents precisa do tmux para a navegação
baseada em janelas. Instale-o (`brew install tmux` ou `apt install tmux`) e
execute `reevesagents doctor`. A TUI envolve-se automaticamente numa sessão tmux
chamada `reeves`; defina `REEVES_NO_TMUX_WRAPPER=1` para ignorar esse
comportamento.

**Uma CLI de fornecedor está em falta ou o Doctor reporta uma falha.** O
ReevesAgents apenas lança CLIs de fornecedores que já estejam no seu `PATH` e
autenticadas. Execute `reevesagents doctor` para ver quais os fornecedores
detetados e o que está a falhar e, depois, instale ou inicie sessão na CLI de
fornecedor de que precisa.

**A Web UI reporta pacotes em falta.** A Web UI precisa de `ws` e
`@lydell/node-pty`. Podem ser ignorados quando a plataforma não tem um binário
pré-compilado de `@lydell/node-pty` ou quando a instalação omitiu dependências
opcionais. Reinstale com as dependências opcionais ativadas e, depois, execute
`reevesagents doctor`.

**A porta já está em uso.** O `reevesagents web` arranca na porta `8080` por
defeito. Se estiver ocupada, o servidor liga-se à próxima porta livre num pequeno
intervalo e imprime o URL escolhido. Passe `--port <n>` para escolher uma porta
de arranque diferente.

## Não é Necessário

Não precisa de chaves de API armazenadas pelo ReevesAgents, base de dados,
Docker, um serviço em segundo plano ou configuração de MCP para execuções de
agentes normais e estáveis. A instalação é passiva: o pacote estável não tem
script de postinstall e não reescreve a configuração dos fornecedores. Associar o
MCP de Agent Control é o único passo explícito e opcional que toca na configuração
do fornecedor, e apenas através do próprio comando `mcp add` de cada CLI.

## Contribuir

Consulte [CONTRIBUTING.md](../../.github/CONTRIBUTING.md) para os ramos e o fluxo de
pull requests, [SECURITY.md](../../.github/SECURITY.md) para reportar vulnerabilidades, e
[CHANGELOG.md](../../CHANGELOG.md) para as alterações recentes. O modelo de design fica
em [REEVESAGENTS_DESIGN.md](../REEVESAGENTS_DESIGN.md) e a documentação para
contribuidores está em [docs/](..).

Os utilizadores finais não precisam da toolchain de desenvolvimento. Os
contribuidores usam pnpm, TypeScript, tsup, Vitest e ESLint a partir do
repositório.

## Ligações

- Site: https://reevesagents.mertkayacs.com
- npm: https://www.npmjs.com/package/reevesagents
- GitHub: https://github.com/mertkayacs/reevesagents
- Releases: https://github.com/mertkayacs/reevesagents/releases
- Issues: https://github.com/mertkayacs/reevesagents/issues
- Changelog: [CHANGELOG.md](../../CHANGELOG.md)
- Licença: [Apache-2.0](../../LICENSE)

## Licença

Apache-2.0
