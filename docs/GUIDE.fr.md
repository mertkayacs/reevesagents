# Guide utilisateur ReevesAgents

[English](GUIDE.md) · [Deutsch](GUIDE.de.md) · **Français** · [Español](GUIDE.es.md) · [Português](GUIDE.pt.md) · [Italiano](GUIDE.it.md) · [Türkçe](GUIDE.tr.md) · [Русский](GUIDE.ru.md) · [简体中文](GUIDE.zh-Hans.md) · [العربية](GUIDE.ar.md)

Une présentation simple, étape par étape : installez-le, effectuez votre première exécution, et laissez un
agent en piloter d'autres. Pour la référence complète des commandes et options, consultez le
[README](../README.fr.md).

## Qu'est-ce que ReevesAgents

- Un espace de travail libre et local pour les agents de programmation d'IA (Claude Code, Codex, Hermes,
  DeepSeek, Kimi et autres). Ils s'exécutent côte à côte sur votre machine.
- L'idée clé : un agent crée et pilote les autres. Un agent Claude Code peut démarrer et diriger une équipe
  d'agents Codex et Claude Code sur des tâches distinctes.
- Il s'exécute au-dessus des vraies CLI que vous avez déjà. L'authentification du fournisseur reste avec
  chaque CLI. ReevesAgents ne stocke pas les clés API et ne fait jamais transiter votre trafic de modèle.
- Pas de base de données, pas de Docker, pas de service en arrière-plan. L'état est du JSON local sous
  `~/.reeves`.

## Avant de commencer

- macOS, Linux ou WSL (Windows natif n'est pas la cible ; utilisez WSL).
- Node.js 20.19 ou plus récent.
- tmux 3.0 ou plus récent.
- Au moins une CLI de fournisseur installée et authentifiée : Claude Code, Codex,
  OpenCode, Hermes, Kimi, DeepSeek, Pi, Qwen ou Aider.

## Installation et vérification

- Installez-le globalement : `npm install -g reevesagents`
- Vérifiez votre machine : `reevesagents doctor` (vérifie Node, tmux, le dossier d'état,
  et quelles CLI de fournisseur il peut voir).
- Lancez-le : `reevesagents`
- Vous préférez pnpm, Yarn, Bun, npx ou Homebrew ? Consultez [Installation](../README.fr.md#installation)
  dans le README.

## Votre première exécution

L'exécution la plus simple et reproductible se fait depuis la ligne de commande. Une exécution a un agent pilote
et un nombre quelconque de workers ; chaque agent s'écrit comme `provider[:nickname[:model]]` :

```sh
reevesagents spawn claude-code:lead codex:worker \
  --name "first run" \
  --prompt "Say hello and list the files in this folder."
```

- `claude-code:lead` est le pilote, `codex:worker` est un worker. Sans agent
  nommé, l'exécution est par défaut `codex`.
- `--name` étiquette l'exécution, `--cwd` définit le dossier de travail (par défaut où vous
  êtes), et `--prompt` est collé dans chaque agent.

Vous préférez un démarrage visuel ? Exécutez `reevesagents` pour la TUI ou `reevesagents web` pour
l'interface Web locale et créez l'exécution à partir de là.

## Les quatre façons de l'utiliser

Vous atteignez les mêmes exécutions via quatre surfaces. Choisissez celle qui convient au moment :

- **TUI** (`reevesagents`) : contrôle rapide et au clavier dans le terminal.
- **Web UI** (`reevesagents web`) : une vue visuelle unique des exécutions, des agents, des panneaux en direct,
  et de l'historique. Local et loopback uniquement.
- **CLI** (`reevesagents spawn`, `runs`, `peek`, `open`, `stop`) : scripts, commandes rapides, et vérifications de santé.
- **tmux** : chaque agent est une vraie CLI dans son propre panneau tmux, de sorte que les sessions restent
  locales même après la fermeture de la TUI ou de la Web UI.

## Laissez un agent en piloter d'autres

C'est la fonctionnalité clé, et elle reste désactivée jusqu'à ce que vous la activiez.

- Activez-la pour votre CLI : `reevesagents attach claude` (ou `reevesagents attach`
  pour connecter chaque CLI installée qu'il peut héberger). Vous pouvez également le faire à partir de l'écran
  **Contrôle d'agent** dans la TUI ou la Web UI.
- Confirmez-le : `reevesagents hosts` liste les CLI sur votre machine et affiche lesquelles sont connectées.
- Rechargez votre CLI : redémarrez la session pour qu'elle charge les nouveaux outils (cela utilise
  MCP, le moyen standard pour qu'un outil d'agent expose des commandes à un autre).
- Maintenant votre agent peut créer et piloter d'autres agents : démarrez un agent sur une tâche,
  envoyez-lui du texte ou des touches, lisez ce qu'il fait, et approuvez ou refusez ce qu'il
  demande.

Un exemple travaillé : attachez-le à Claude Code, redémarrez-le, et à partir d'une session Claude Code
vous pouvez spawner un agent Codex sur une issue et un deuxième agent Claude Code sur une autre, puis regarder et diriger les deux.

- Les CLI qui peuvent héberger ceci aujourd'hui : claude, codex, kimi, qwen, opencode, hermes.
  OpenCode est attaché à la main, puisque son ajout est interactif.
- Les workers ne reçoivent pas ces outils par défaut, donc un worker ne peut pas spawner plus
  d'agents. Pour permettre à un worker de piloter ses propres sous-agents, attachez le MCP à la CLI de ce
  worker aussi.
- Pour vous déconnecter plus tard : `reevesagents detach claude`.

## Tâches quotidiennes

- Voyez ce qui est en cours : `reevesagents runs` (ajoutez `--json` pour les scripts).
- Regardez un agent sans quitter votre shell : `reevesagents peek <agent> -n 40`.
- Entrez dans le panneau tmux d'un agent : `reevesagents open <agent>`.
- Arrêtez une exécution complète : `reevesagents stop <run> --yes`.
- Arrêtez un agent unique : `reevesagents kill <agent> --yes`.
- `stop` et `kill` sont les seules commandes qui terminent le travail, donc elles refusent de s'exécuter
  sans `--yes`.

## Maintenir les coûts bas

- Mettez un modèle moins cher ou gratuit en avant pour router le travail, et laissez-le confier des tâches lourdes
  à un agent plus puissant uniquement si nécessaire.
- Laissez les modèles bon marché écrire du code routine et des tests pendant que vous planifiez et concevez avec un
  modèle plus grand, au lieu de tout pousser par un seul défaut coûteux.
- Les quotas et la facturation des fournisseurs restent avec chaque CLI. ReevesAgents n'ajoute aucun coût
  par lui-même.

## Quand quelque chose semble anormal

- Exécutez d'abord `reevesagents doctor`. Il vérifie Node, tmux, le dossier d'état, et
  vos CLI de fournisseur, et vous dit ce qui échoue.
- **tmux manquant :** installez-le (`brew install tmux` ou `apt install tmux`) et
  exécutez doctor à nouveau.
- **Un fournisseur n'est pas détecté :** ReevesAgents ne lance que les CLI qui sont sur
  votre `PATH` et authentifiées. Installez ou connectez-vous à cette CLI.
- **La Web UI signale des paquets manquants :** elle a besoin de `ws` et `@lydell/node-pty`.
  Réinstallez avec les dépendances optionnelles activées.
- **Port déjà utilisé :** `reevesagents web` démarre sur `8080` et bascule vers le port libre suivant ; passez `--port <n>` pour en choisir un autre.
- Plus de détails dans [Dépannage](../README.fr.md#dépannage).

## Où aller ensuite

- [Accueil de la doc](README.md) : l'index complet de la documentation.
- [Commandes](../README.fr.md#commandes) : chaque sous-commande et flag.
- [Contrôle d'agent](../README.fr.md#contrôle-dagent) : le modèle complet opt-in.
- [Configuration](../README.fr.md#configuration) : ce qui vit sous `~/.reeves`.
- [docs/mcp.md](mcp.md) : la conception du Contrôle d'agent et la liste des outils.
