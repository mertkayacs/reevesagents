# Guide utilisateur ReevesAgents

[English](GUIDE.md) · [Deutsch](GUIDE.de.md) · **Français** · [Español](GUIDE.es.md) · [Português](GUIDE.pt.md) · [Italiano](GUIDE.it.md) · [Türkçe](GUIDE.tr.md) · [Русский](GUIDE.ru.md) · [简体中文](GUIDE.zh-Hans.md) · [العربية](GUIDE.ar.md)

Un parcours simple, étape par étape : installez l'outil, lancez votre première
exécution, puis laissez un agent piloter les autres. Pour la référence complète
des commandes et options, consultez le [README](i18n/README.fr.md).

## Qu'est-ce que ReevesAgents

- Un espace de travail libre et local pour les agents de programmation d'IA
  (Claude Code, Codex, Hermes, DeepSeek, Kimi et d'autres). Ils tournent côte à
  côte sur votre machine.
- L'idée phare : un agent crée et pilote les autres. Un agent Claude Code peut
  démarrer puis diriger une équipe d'agents Codex et Claude Code sur des tâches
  distinctes.
- Il s'appuie sur les vraies CLI que vous avez déjà. L'authentification du
  fournisseur reste avec chaque CLI. ReevesAgents ne stocke aucune clé API et ne
  fait jamais transiter votre trafic de modèles.
- Pas de base de données, pas de Docker, pas de service en arrière-plan. L'état
  est du JSON local sous `~/.reeves`.

## Avant de commencer

- macOS, Linux ou WSL (Windows natif n'est pas la cible ; utilisez WSL).
- Node.js 20.19 ou plus récent.
- tmux 3.0 ou plus récent.
- Au moins une CLI de fournisseur installée et authentifiée : Claude Code, Codex,
  OpenCode, Hermes, Kimi, DeepSeek, Pi, Qwen ou Aider.

## Installation et vérification

- Installez-le globalement : `npm install -g reevesagents`
- Vérifiez votre machine : `reevesagents doctor` (contrôle Node, tmux, le dossier
  d'état et les CLI de fournisseurs qu'il détecte).
- Lancez-le : `reevesagents`
- Vous préférez pnpm, Yarn, Bun, npx ou Homebrew ? Consultez [Installation](i18n/README.fr.md#installation)
  dans le README.

## Votre première exécution

Le chemin le plus rapide et le plus reproductible passe par la ligne de commande.
Une exécution comprend un agent pilote et autant de workers que nécessaire ;
chaque agent s'écrit `provider[:nickname[:model]]` :

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
`reevesagents web` pour la Web UI locale, et créez l'exécution depuis là.

## Les cinq façons de l'utiliser

Vous retrouvez les mêmes exécutions par cinq surfaces. Prenez celle qui convient
sur le moment :

- **TUI** (`reevesagents`) : contrôle rapide, au clavier, dans le terminal.
- **Web UI** (`reevesagents web`) : une vue visuelle unique des exécutions, des
  agents, des panneaux en direct et de l'historique. Locale et en loopback
  uniquement.
- **CLI** (`reevesagents spawn`, `runs`, `peek`, `open`, `stop`) : scripts,
  commandes rapides et vérifications de santé.
- **tmux** : chaque agent est une vraie CLI dans son propre panneau tmux ; les
  sessions continuent donc de tourner localement même après la fermeture de la
  TUI ou de la Web UI.
- **Contrôle d'agent** (`reevesagents attach <cli>`) : le MCP opt-in qui permet à
  un agent de piloter les autres. La section suivante le détaille.

## Laissez un agent en piloter d'autres

C'est la fonctionnalité centrale, et elle reste désactivée tant que vous ne
l'activez pas.

- Activez-la pour votre CLI : `reevesagents attach claude` (ou `reevesagents attach`
  pour connecter toutes les CLI installées capables de l'héberger). Vous pouvez
  aussi passer par l'écran **Contrôle d'agent** de la TUI ou de la Web UI.
- Confirmez : `reevesagents hosts` liste les CLI de votre machine et indique
  lesquelles sont connectées.
- Rechargez votre CLI : redémarrez la session pour qu'elle charge les nouveaux
  outils (cela passe par MCP, la façon standard pour un outil d'agent d'exposer
  des commandes à un autre).
- Votre agent peut maintenant créer et piloter d'autres agents : démarrer un
  agent sur une tâche, lui envoyer du texte ou des touches, lire ce qu'il fait,
  et approuver ou refuser ce qu'il demande.

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

- Placez un modèle moins cher ou gratuit en amont pour router le travail, et
  laissez-le confier les tâches lourdes à un agent plus fort seulement quand
  c'est nécessaire.
- Laissez les modèles bon marché écrire le code courant et les tests pendant que
  vous planifiez et concevez avec un modèle plus grand, au lieu de tout faire
  passer par un seul modèle par défaut coûteux.
- Les quotas et la facturation des fournisseurs restent liés à chaque CLI.
  ReevesAgents n'ajoute aucun coût propre.

## En cas de problème

- Commencez par `reevesagents doctor`. Il contrôle Node, tmux, le dossier d'état
  et vos CLI de fournisseurs, et vous dit ce qui échoue.
- **tmux manquant :** installez-le (`brew install tmux` ou `apt install tmux`) et
  relancez doctor.
- **Un fournisseur n'est pas détecté :** ReevesAgents ne lance que les CLI
  présentes sur votre `PATH` et authentifiées. Installez cette CLI ou
  connectez-vous.
- **La Web UI signale des paquets manquants :** il lui faut `ws` et
  `@lydell/node-pty`. Réinstallez avec les dépendances optionnelles activées.
- **Port déjà utilisé :** `reevesagents web` démarre sur `8080` et bascule sur le
  port libre suivant ; passez `--port <n>` pour en choisir un autre.
- Plus de détails dans [Dépannage](i18n/README.fr.md#dépannage).

## Où aller ensuite

- [Accueil de la doc](README.md) : l'index complet de la documentation.
- [Commandes](i18n/README.fr.md#commandes) : chaque sous-commande et chaque flag.
- [Contrôle d'agent](i18n/README.fr.md#contrôle-dagent) : le modèle opt-in complet.
- [Configuration](i18n/README.fr.md#configuration) : ce qui vit sous `~/.reeves`.
- [docs/mcp.md](mcp.md) : la conception du Contrôle d'agent et la liste des outils.
