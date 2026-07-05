# Guide utilisateur ReevesAgents

[English](GUIDE.md) · [Deutsch](GUIDE.de.md) · **Français** · [Español](GUIDE.es.md) · [Português](GUIDE.pt.md) · [Italiano](GUIDE.it.md) · [Türkçe](GUIDE.tr.md) · [Русский](GUIDE.ru.md) · [简体中文](GUIDE.zh-Hans.md) · [العربية](GUIDE.ar.md)

Ce guide vous emmène d'une installation toute fraîche jusqu'au moment où un
agent fait tourner les autres pour vous. Le jour où il vous faut plutôt chaque
commande et chaque option, tout est recensé dans le [README](i18n/README.fr.md).

## Qu'est-ce que ReevesAgents

- Un espace de travail libre et local où vos agents de programmation d'IA
  (Claude Code, Codex, Hermes, DeepSeek, Kimi et d'autres) travaillent côte à
  côte sur votre machine.
- Ce qui le rend vraiment intéressant : un agent peut créer et piloter les
  autres. Confiez les rênes à une session Claude Code et elle se fera un plaisir
  de mener une équipe d'agents Codex et Claude Code sur des tâches distinctes.
- Il se pose sur les CLI que vous avez déjà, si bien que chaque connexion reste
  exactement là où elle a toujours été. ReevesAgents ne détient jamais de clé
  API et ne touche jamais à votre trafic de modèles.
- Tout son état tient dans un peu de JSON sous `~/.reeves`. Aucune base de
  données à faire tourner, aucune image Docker à récupérer, rien qui traîne en
  arrière-plan.

## Avant de commencer

- macOS, Linux ou WSL (Windows natif n'est pas la cible ; utilisez WSL).
- Node.js 20.19 ou plus récent.
- tmux 3.0 ou plus récent.
- Au moins une CLI de fournisseur installée et authentifiée : Claude Code, Codex,
  OpenCode, Hermes, Kimi, DeepSeek, Pi, Qwen ou Aider.

## Installation et vérification

- Installez-le avec Homebrew : `brew install mertkayacs/reevesagents/reevesagents`,
  ou globalement avec un gestionnaire de paquets Node comme pnpm : `pnpm add -g reevesagents`
- Vérifiez votre machine : `reevesagents doctor` (contrôle Node, tmux, le dossier
  d'état et les CLI de fournisseurs qu'il détecte).
- Lancez-le : `reevesagents`
- Vous préférez npm, Yarn, Bun ou npx ? Consultez [Installation](i18n/README.fr.md#installation)
  dans le README.

## Votre première exécution

Le plus rapide à reproduire, c'est la ligne de commande. Une exécution réunit un
agent pilote et autant de workers que vous voulez, chaque agent s'écrivant
`provider[:nickname[:model]]` :

```sh
reevesagents spawn claude-code:lead codex:worker \
  --name "first run" \
  --prompt "Say hello and list the files in this folder."
```

- `claude-code:lead` est le pilote, `codex:worker` un worker. Sans agent nommé,
  l'exécution part par défaut sur `codex`.
- `--name` étiquette l'exécution, `--cwd` fixe le dossier de travail (par défaut
  là où vous êtes), et `--prompt` est collé dans chaque agent.

Vous préférez un démarrage visuel ? Lancez `reevesagents` pour la TUI ou
`reevesagents web` pour la Web UI locale, et créez l'exécution directement
depuis l'interface.

## Les cinq façons de l'utiliser

Cinq surfaces mènent aux mêmes exécutions, à vous de prendre celle qui convient
sur le moment :

- **TUI** (`reevesagents`) : l'application terminal où la plupart des gens
  passent leurs journées. Tout y est menu, alors les flèches du clavier
  suffisent.
- **Web UI** (`reevesagents web`) : les mêmes exécutions sur une seule page de
  navigateur, avec une vue en direct dans n'importe quel agent. Elle ne répond
  jamais ailleurs qu'en loopback.
- **CLI** (`reevesagents spawn`, `runs`, `peek`, `open`, `stop`) : pour les
  scripts, ou pour les jours où vous préférez taper plutôt que cliquer.
- **tmux** : là où les agents vivent pour de bon. Comme chacun est une vraie CLI
  dans son propre panneau, fermer la TUI ou la Web UI n'interrompt jamais
  personne.
- **Contrôle d'agent** (`reevesagents attach <cli>`) : le MCP opt-in qui permet à
  un agent de piloter les autres. La section suivante le déroule pas à pas.

## Laissez un agent en piloter d'autres

C'est la fonctionnalité centrale, et elle reste désactivée tant que vous ne
l'activez pas.

- Activez-la pour votre CLI avec `reevesagents attach claude`, ou lancez un
  simple `reevesagents attach` pour connecter toutes les CLI installées capables
  de l'héberger. L'écran **Contrôle d'agent** de la TUI et de la Web UI fait
  exactement la même chose.
- `reevesagents hosts` vous dit où vous en êtes : toutes les CLI de la machine,
  et lesquelles sont connectées.
- Redémarrez ensuite cette CLI une fois, parce que les outils ne sont chargés
  qu'au démarrage de session (c'est du MCP tout à fait standard, la façon
  habituelle pour un outil d'agent d'exposer des commandes à un autre).
- À partir de là, votre agent peut mettre un nouvel agent sur une tâche, taper
  dedans, lire ce qu'il fait, et approuver ou refuser tout ce qu'il demande.

Un exemple concret : attachez Claude Code, redémarrez-le, et depuis une seule
session Claude Code vous pouvez lancer un agent Codex sur une issue et un second
agent Claude Code sur une autre, puis observer et diriger les deux.

- Les CLI qui peuvent héberger cela aujourd'hui : claude, codex, kimi, qwen,
  opencode, hermes. OpenCode s'attache à la main, car son étape d'ajout est
  interactive.
- Les workers ne reçoivent pas ces outils par défaut ; un worker ne peut donc pas
  lancer d'autres agents. Pour qu'un worker pilote ses propres sous-agents,
  attachez aussi le MCP à la CLI de ce worker.
- Pour vous déconnecter plus tard : `reevesagents detach claude`.

## Tâches quotidiennes

- Voyez ce qui tourne : `reevesagents runs` (ajoutez `--json` pour les scripts).
- Observez un agent sans quitter votre shell : `reevesagents peek <agent> -n 40`.
- Sautez dans le panneau tmux d'un agent : `reevesagents open <agent>`.
- Arrêtez une exécution entière : `reevesagents stop <run> --yes`.
- Arrêtez un seul agent : `reevesagents kill <agent> --yes`.
- Voyez ce que les agents demandent : `reevesagents approvals`, puis
  `approve <id>` ou `deny <id>`.
- `stop` et `kill` mettent fin au travail, et les commandes `delete` suppriment
  les enregistrements terminés. Toutes refusent de s'exécuter sans `--yes`.

## Maintenir les coûts bas

- Placez un modèle bon marché ou gratuit en amont comme routeur, et laissez-le
  réveiller le modèle cher seulement quand une tâche le mérite vraiment.
- Le code courant et les tests, c'est exactement ce pour quoi les petits modèles
  sont faits. Gardez le gros pour la planification et la conception, plutôt que
  de le payer à écrire du boilerplate.
- Quoi que tout cela vous coûte, c'est la facturation normale de vos
  fournisseurs. ReevesAgents, lui, n'ajoute rien par-dessus.

## En cas de problème

- Commencez par `reevesagents doctor`, parce qu'il met en général un nom sur le
  problème : Node, tmux, le dossier d'état et chaque CLI de fournisseur y
  passent.
- **tmux manquant :** installez-le (`brew install tmux` ou `apt install tmux`) et
  laissez doctor confirmer.
- **Un fournisseur n'est pas détecté :** neuf fois sur dix, il n'est pas installé
  ou pas connecté. ReevesAgents ne peut lancer que ce qui est sur votre `PATH`
  et authentifié.
- **La Web UI signale des paquets manquants :** les modules optionnels `ws` et
  `@lydell/node-pty` ont été sautés à l'installation. Une réinstallation normale
  les ramène.
- **Port déjà utilisé :** rien de grave, `reevesagents web` prend simplement le
  port libre suivant et affiche l'URL. Passez `--port <n>` si le numéro vous
  importe.
- Plus de détails dans [Dépannage](i18n/README.fr.md#dépannage).

## Où aller ensuite

- [Accueil de la doc](README.md) : l'index complet de la documentation.
- [Commandes](i18n/README.fr.md#commandes) : chaque sous-commande et chaque flag.
- [Contrôle d'agent](i18n/README.fr.md#contrôle-dagent) : le modèle opt-in complet.
- [Configuration](i18n/README.fr.md#configuration) : ce qui vit sous `~/.reeves`.
- [docs/mcp.md](mcp.md) : la conception du Contrôle d'agent et la liste des outils.
