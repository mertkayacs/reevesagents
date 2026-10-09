<p align="center"><a href="https://reevesagents.mertkayacs.com/pt/"><img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-banner.gif" width="800" alt="ReevesAgents: execute assistentes de programação com IA em conjunto"></a></p>

# reevesagents: um espaço de trabalho para ferramentas de programação com IA

Execute o Claude Code, o Codex, o Kimi, o OpenCode, o Hermes e outras ferramentas de programação com IA lado a lado no seu computador. O reevesagents junta as sessões de terminal de todas, para que possa ver o trabalho de cada ferramenta, enviar instruções e parar uma execução a partir de um só sítio.

<img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-hero.webp" width="720" alt="Um painel principal com moldura dourada ligado por finos fios de ouro a oito painéis de vidro iluminados, um por cada ferramenta da execução">

[Ver a demo](https://reevesagents.mertkayacs.com/pt/demo/) ou instalar a ferramenta de linha de comandos abaixo.

## Início rápido

Requer Node.js 20.19 ou mais recente, tmux 3.0 ou mais recente e uma ferramenta de programação com IA instalada e com sessão iniciada. Funciona em macOS, Linux e WSL. O tmux mantém as ferramentas a correr quando fecha a interface.

```sh
npm install -g reevesagents && reevesagents doctor && reevesagents
```

Isto abre a interface de terminal. Para a interface no navegador, execute `reevesagents web`; só fica à escuta no endereço de loopback do seu computador.

## Lançar uma equipa

Inicie uma execução com uma tarefa para as ferramentas:

```sh
reevesagents spawn claude-code:lead codex:tests --name "review" --prompt "Revê o código e os testes."
```

Use a interface de terminal ou de navegador para ler o resultado e orientar cada ferramenta. Cada fornecedor mantém o seu próprio início de sessão e envia os seus próprios pedidos ao modelo. O estado das execuções fica guardado em JSON em `~/.reeves`.

<img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-newrun-pt.png" width="720" alt="Web UI do reevesagents a iniciar uma nova execução: nome da execução, escolha de ferramentas como Claude Code, Codex CLI e Kimi Code, um modelo e um modo de permissões">

## Uma ferramenta orienta as outras

Ligue o servidor MCP opcional (Model Context Protocol, uma ligação padrão entre ferramentas de IA) a um anfitrião em que confie:

```sh
reevesagents attach claude && reevesagents hosts
```

Reinicie esse anfitrião para carregar a ligação. A partir daí, pode iniciar, ler, orientar e parar outras ferramentas. Por omissão, os workers não recebem ligação MCP. Mantenha ativos os pedidos de permissão dos fornecedores e reveja as aprovações antes de ações sensíveis.

No Claude Code, pode instalar a ligação e as respetivas instruções de utilização em conjunto, como plugin:

```sh
claude plugin marketplace add mertkayacs/reevesagents
claude plugin install reevesagents@reevesagents
```

Para outros anfitriões, o [skill do reevesagents](https://github.com/mertkayacs/reevesagents-skill) fornece as instruções de utilização. Consulte a [referência MCP](../mcp.md) para ver as ferramentas e os requisitos de cada anfitrião.

O servidor está listado no [registo oficial de MCP](https://registry.modelcontextprotocol.io/?q=io.github.mertkayacs/reevesagents) como `io.github.mertkayacs/reevesagents`.

<img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-steer.webp" width="560" alt="Um painel principal com moldura dourada envia mensagens por fios de ouro a outros três painéis">

## Escolher uma interface

| Interface | Para que serve |
| --- | --- |
| Interface de terminal | Ver e controlar execuções com o teclado |
| Web UI | Ver execuções, resultado em direto, aprovações e histórico no navegador |
| Linha de comandos | Iniciar execuções e ler o resultado a partir de scripts |
| Servidor MCP | Deixar uma ferramenta de programação com IA de confiança orientar uma equipa |

<details>
<summary>Captura de ecrã da Web UI</summary>

<img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-web-pt.png" width="720" alt="Web UI do reevesagents antes de qualquer execução: lista de agentes vazia, botões Nova execução e controlos de idioma e definições">

</details>

## Documentação

- [Guia do utilizador](https://reevesagents.mertkayacs.com/pt/docs/): instalação, comandos e configuração.
- [Perguntas frequentes](https://reevesagents.mertkayacs.com/pt/faq/): configuração dos fornecedores e resolução de problemas.
- [Referência MCP](../mcp.md): ferramentas e ligações de anfitriões (em inglês).
- [Como contribuir](../../.github/CONTRIBUTING.md), [testes](../testing.md) e [registo de alterações](../../CHANGELOG.md) (em inglês).

Outros idiomas: [English](../../README.md), [Deutsch](README.de.md), [Français](README.fr.md), [Español](README.es.md), [Italiano](README.it.md), [Türkçe](README.tr.md), [Русский](README.ru.md), [简体中文](README.zh-Hans.md), [العربية](README.ar.md).

## Licença

[Apache-2.0](../../LICENSE). Disponível no [npm](https://www.npmjs.com/package/reevesagents).

<a href="https://eschatialabs.com"><picture><source media="(prefers-color-scheme: dark) and (min-resolution: 2dppx)" srcset="https://eschatialabs.com/brand/lockup-46-dark@2x.png"><source media="(prefers-color-scheme: dark)" srcset="https://eschatialabs.com/brand/lockup-46-dark@1x.png"><source media="(min-resolution: 2dppx)" srcset="https://eschatialabs.com/brand/lockup-46@2x.png"><img src="https://eschatialabs.com/brand/lockup-46@1x.png" width="124" height="46" alt="Eschatia Labs"></picture></a><br>Um projeto [Eschatia Labs](https://eschatialabs.com) de [Mert Kaya](https://mertkayacs.com).
