<p align="center">
  <a href="https://reevesagents.mertkayacs.com">
    <img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-header.gif" alt="ReevesAgents" width="800" />
  </a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/reevesagents"><img src="https://img.shields.io/npm/v/reevesagents.svg" alt="version npm" /></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/node/v/reevesagents.svg" alt="node" /></a>
  <a href="../../LICENSE"><img src="https://img.shields.io/npm/l/reevesagents.svg" alt="licence" /></a>
  <a href="https://github.com/mertkayacs/reevesagents/actions/workflows/test.yml"><img src="https://img.shields.io/github/actions/workflow/status/mertkayacs/reevesagents/test.yml?branch=master&label=CI" alt="CI" /></a>
</p>

<p align="center">
  <a href="https://reevesagents.mertkayacs.com/demo"><b>Démo</b></a> ·
  <a href="https://reevesagents.mertkayacs.com/docs"><b>Docs</b></a> ·
  <a href="https://reevesagents.mertkayacs.com/faq"><b>FAQ</b></a> ·
  <a href="https://github.com/mertkayacs/reevesagents/issues"><b>Issues</b></a>
</p>

[English](../../README.md) · [Deutsch](README.de.md) · **Français** · [Español](README.es.md) · [Português](README.pt.md) · [Italiano](README.it.md) · [Türkçe](README.tr.md) · [Русский](README.ru.md) · [简体中文](README.zh-Hans.md) · [العربية](README.ar.md)

ReevesAgents est un espace de travail local pour les CLI de code IA. Il fait
tourner Claude Code, Codex, OpenCode, Hermes, Kimi, DeepSeek, Qwen, Pi, Aider et
d'autres CLI de fournisseurs côte à côte dans tmux. Vous pouvez l'utiliser comme
une CLI, une TUI ou une Web UI classique, ou attacher son MCP optionnel pour
qu'un agent puisse lancer, lire, diriger et arrêter les autres.

La connexion au fournisseur reste dans chaque CLI. ReevesAgents garde son propre état dans
quelques fichiers JSON sous `~/.reeves`, et il tourne seulement pendant que vous ou une CLI
attachée l'utilisez.

## Démarrage rapide

```sh
pnpm add -g reevesagents
reevesagents doctor
reevesagents
```

Lancer un run depuis la CLI :

```sh
reevesagents spawn claude-code:lead codex:tests hermes:research \
  --name "release check" \
  --prompt "Review the release path, test coverage, and docs."
```

Ouvrir la Web UI :

```sh
reevesagents web
```

Laisser un agent attaché piloter les autres :

```sh
reevesagents attach codex
reevesagents hosts
```

Redémarrez ensuite cette CLI pour qu'elle charge les outils MCP.

## Ce qu'il vous apporte

| Surface | À quoi elle sert |
| --- | --- |
| **TUI** | Contrôle des runs au clavier, dans le terminal. |
| **Web UI** | Vue locale des runs, des panneaux, des agents, des approbations et de l'historique. |
| **CLI** | Scripts, vérifications rapides, lancement d'agents, nettoyage de l'état et saut vers les fenêtres tmux. |
| **MCP Agent Control** | Une CLI de confiance peut lancer et piloter d'autres CLI grâce à des outils locaux. |
| **tmux** | De vraies fenêtres de CLI de fournisseur, qui continuent de tourner après la fermeture de l'UI. |

ReevesAgents est local par conception. L'état est du JSON simple sous
`~/.reeves`, et les CLI qu'il démarre sont celles que vous utilisez déjà à la main.

<a id="install"></a>
<details>
<summary><strong>Installation</strong></summary>

ReevesAgents nécessite Node.js `20.19+`, tmux `3.0+` et au moins une CLI de
fournisseur prise en charge, installée et authentifiée. Il fonctionne sous macOS,
Linux et WSL.

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

Pour épingler une version, remplacez `<version>` :

```sh
pnpm add -g reevesagents@<version>
```

Installation depuis les sources :

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
<summary><strong>Captures d'écran</strong></summary>

La TUI et la Web UI pilotent les mêmes runs locaux :

![TUI de ReevesAgents : choix de la langue, menu d'accueil et doctor](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-tui.gif)

![Web UI de ReevesAgents : runs et panneaux d'agents en direct](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-web-fr.png)

![Web UI de ReevesAgents : lancement d'un nouveau run](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-newrun-fr.png)

</details>

<a id="commands"></a>
<details>
<summary><strong>Commandes</strong></summary>

Sans argument, la commande lance la TUI.

| Commande | Rôle |
| --- | --- |
| `reevesagents` | Lance la TUI. |
| `spawn [spec...]` | Démarre un run. Chaque spec s'écrit `provider[:nickname[:model]]`. |
| `add [spec...]` | Ajoute des agents au run actif le plus récent. |
| `runs` | Liste les runs actifs. |
| `agents [run-id]` | Liste les agents de tous les runs, ou d'un seul. |
| `open <id>` | Ouvre la fenêtre tmux d'un run ou d'un agent. |
| `peek <agent-id>` | Affiche la sortie récente d'un agent. |
| `send <agent-id> <text...>` | Colle du texte dans un agent sans le soumettre. |
| `key <agent-id> <key>` | Envoie `enter`, `escape`, une flèche, `tab`, `space`, `backspace` ou `ctrl-c`. |
| `interrupt <agent-id>` | Envoie Ctrl-C à un agent. |
| `stop <run-id>` | Arrête un run. Exige `--yes` ou `ALLOW_DESTRUCTIVE=1`. |
| `kill <agent-id>` | Arrête un agent. Exige `--yes` ou `ALLOW_DESTRUCTIVE=1`. |
| `setup` | Vérification de premier démarrage. `--attach` connecte toutes les CLI hôtes installées. |
| `doctor` | Vérifie Node, tmux, l'état et les CLI de fournisseurs. |
| `web` | Démarre la Web UI, accessible uniquement en loopback. |
| `providers` | Liste les ids de fournisseurs, les alias, les modèles et leur disponibilité. |
| `approvals` | Liste les demandes d'approbation en attente. |
| `approve` / `deny` | Tranche une demande d'approbation. |
| `hosts` | Indique les CLI hôtes auxquelles ReevesAgents est attaché. |
| `attach [cli]` | Connecte le MCP Agent Control à une CLI hôte, ou à tous les hôtes installés. |
| `detach <cli>` | Retire cette connexion MCP d'une CLI hôte. |
| `skills [action]` | Installe, retire ou inspecte le skill ReevesAgents. |
| `mcp` | Démarre le serveur MCP sur stdio. Ce sont les CLI hôtes qui l'exécutent. |
| `config [key] [value]` | Affiche ou modifie les réglages. |
| `presets` | Liste les presets de run enregistrés. |
| `save-preset` | Enregistre un run en cours comme preset. |
| `start-preset` | Démarre un run à partir d'un preset. |
| `delete-preset` | Supprime un preset. |
| `delete` | Supprime l'enregistrement d'un agent terminé. Demande confirmation. |
| `delete-run` | Supprime un run terminé et l'archive. Demande confirmation. |
| `history` | Liste les runs archivés. |
| `delete-history` | Supprime une entrée de l'historique archivé. Demande confirmation. |
| `reap` | Termine les agents zombies et ceux qui ont dépassé `max_lifetime_ms`, puis tue les sessions tmux orphelines qu'aucun run ne possède. |

Options courantes :

- `--json` : disponible sur les commandes de liste et d'action destinées aux scripts.
- `--name <name>` : donne un nom au run.
- `--cwd <dir>` : lance les agents depuis un répertoire donné.
- `--prompt <text>` : colle un texte de démarrage dans chaque agent lancé.
- `--skip` : saute les demandes de permission des fournisseurs, pour les workers sans surveillance.
- `--run <run-id>` : ajoute des agents à un run précis.
- `--port <n>` et `--no-open` : options de démarrage de la Web UI.

</details>

<a id="agent-control"></a>
<details>
<summary><strong>Agent Control</strong></summary>

Agent Control est un serveur MCP optionnel. Attachez-le uniquement à une CLI à
laquelle vous confiez le pilotage d'outils locaux :

```sh
reevesagents attach claude
reevesagents hosts
```

Après redémarrage, cette CLI reçoit des outils pour `spawn`, `read`, `send_text`,
`send_key`, `interrupt`, `kill` et `stop`, pour gérer les approbations et les
presets, et pour inspecter les hôtes. Le catalogue des fournisseurs est aussi
exposé sous `reevesagents://providers`.

Par défaut, les workers ne reçoivent pas le MCP. Si un worker doit créer ses
propres workers, attachez explicitement ReevesAgents à la CLI de ce worker.

Codex place par défaut les appels MCP dans un sandbox, ce qui bloque les
lancements tmux. Si Codex sert d'hôte pour piloter des agents, lancez-le avec un
accès complet, par exemple `codex --sandbox danger-full-access`, ou utilisez un
profil Codex qui définit `sandbox_mode = "danger-full-access"`.

Référence complète des outils : [docs/mcp.md](../mcp.md). Guide de l'opérateur
écrit pour les agents : [AGENTS.fr.md](../../AGENTS.fr.md).

</details>

<a id="configuration"></a>
<details>
<summary><strong>Configuration</strong></summary>

L'état se trouve sous `~/.reeves` :

```text
~/.reeves/
  config.json
  presets/
  runs/
  history/
```

Deux variables d'environnement remplacent les chemins par défaut :

- `REEVES_REGISTRY` : autre racine d'état pour `runs/`, `history/` et `presets/`.
- `REEVES_CONFIG` : autre chemin pour le fichier de configuration.

Un registre par serveur tmux : le nettoyage des orphelins, qui tourne en
arrière-plan, juge à qui appartient chaque session d'après le registre courant.
Deux registres ne doivent donc pas partager le même serveur tmux.

Tout ce qui pourrait contenir un secret est nettoyé avant d'être écrit dans un
fichier.

</details>

<a id="examples"></a>
<details>
<summary><strong>Exemples</strong></summary>

Répartir un projet entre plusieurs CLI :

```sh
reevesagents spawn deepseek:backend claude-code:product codex:review \
  --name "feature x" \
  --prompt "Backend, product copy, and a review pass."
```

Suivre un agent, puis ouvrir sa fenêtre :

```sh
reevesagents peek backend -n 40
reevesagents open backend
```

Arrêter le run une fois le travail terminé :

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

La Web UI écoute uniquement sur `127.0.0.1` et tourne au premier plan. Les agents
continuent de tourner après la fermeture de la page, puisqu'ils vivent dans tmux.

La Web UI s'appuie sur deux modules d'exécution optionnels, `ws` et
`@lydell/node-pty`, que npm installe par défaut. Les commandes CLI et TUI
fonctionnent sans eux, et `reevesagents web` explique ce qui manque.

Pour y accéder depuis une autre machine, redirigez le port loopback via SSH :

```sh
ssh -L 8080:127.0.0.1:8080 user@host
```

</details>

<a id="troubleshooting"></a>
<details>
<summary><strong>Dépannage</strong></summary>

**tmux n'est pas installé.** Installez tmux et lancez `reevesagents doctor`. La
TUI s'enveloppe automatiquement dans une session tmux nommée `reeves` ; posez
`REEVES_NO_TMUX_WRAPPER=1` pour désactiver ce comportement.

**Une CLI de fournisseur est absente ou déconnectée.** ReevesAgents lance les CLI
de fournisseurs déjà présentes sur le `PATH` et authentifiées. `reevesagents doctor`
montre ce qu'il détecte. Si une fenêtre lancée attend une connexion, `peek`
l'affiche.

**La Web UI signale des paquets manquants.** Réinstallez avec les dépendances
optionnelles activées, puis lancez `reevesagents doctor`.

**Port déjà utilisé.** `reevesagents web` démarre par défaut sur `8080`. Si ce
port est pris, le serveur se lie au port libre suivant dans une petite plage et
affiche l'URL.

</details>

<a id="contributing"></a>
<details>
<summary><strong>Contribuer</strong></summary>

La documentation des contributeurs se trouve sous [docs/](..). Commencez par
[CONTRIBUTING.md](../../.github/CONTRIBUTING.md), [les tests](../testing.md) et
[les releases](../releasing.md).

Les utilisateurs finaux n'ont besoin d'aucune chaîne d'outils de développement.
Les contributeurs utilisent pnpm, TypeScript, tsup, Vitest et ESLint depuis le
dépôt.

</details>

## Liens

- Site web : https://reevesagents.mertkayacs.com
- npm : https://www.npmjs.com/package/reevesagents
- GitHub : https://github.com/mertkayacs/reevesagents
- Releases : https://github.com/mertkayacs/reevesagents/releases
- Issues : https://github.com/mertkayacs/reevesagents/issues
- Changelog : [CHANGELOG.md](../../CHANGELOG.md)
- Licence : [Apache-2.0](../../LICENSE)
