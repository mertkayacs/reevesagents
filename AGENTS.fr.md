# AGENTS.md

[English](AGENTS.md) · [Deutsch](AGENTS.de.md) · **Français** · [Español](AGENTS.es.md) · [Português](AGENTS.pt.md) · [Italiano](AGENTS.it.md) · [Türkçe](AGENTS.tr.md) · [Русский](AGENTS.ru.md) · [简体中文](AGENTS.zh-Hans.md) · [العربية](AGENTS.ar.md)

Comment un agent de codage IA pilote ReevesAgents. Ce fichier est le guide de
l'opérateur pour l'outil lui-même. Il ne change en rien le comportement des
agents dans vos propres projets.

ReevesAgents exécute des CLI de codage IA (Claude Code, Codex, Kimi, Qwen,
OpenCode, Hermes et d'autres) côte à côte, chacune étant une vraie CLI dans sa
propre fenêtre tmux. Un agent peut créer, diriger et superviser les autres.
L'état vit en JSON local sous `~/.reeves`. Aucune clé API, aucune base de
données, aucun démon en arrière-plan.

## Deux façons de l'utiliser

1. **Pilotez la CLI directement.** Lancez `reevesagents spawn ...` pour démarrer
   des agents, puis `runs`, `peek`, `send` et `stop` pour les suivre et les
   diriger. Idéal pour les scripts et l'orchestration ponctuelle.
2. **Laissez votre CLI hôte piloter les autres via MCP.** `reevesagents attach <cli>`
   donne à cette CLI un ensemble d'outils de contrôle d'agent (spawn, send_text,
   read, kill, ...). Après redémarrage de la CLI, une seule session peut créer
   une équipe et la diriger. C'est la fonctionnalité centrale. Voir
   [docs/mcp.md](docs/mcp.md).

## Vérifiez d'abord l'environnement

```sh
reevesagents doctor
```

Fait le point sur tmux, Node, le répertoire d'état `~/.reeves`, et indique
quelles CLI de fournisseurs sont installées et compatibles (il inspecte le
`--help` de chaque CLI). Il ne peut pas vérifier qu'une CLI est connectée : une
CLI installée mais déconnectée passe donc ce contrôle. Lancez-le avant de créer
des agents, pour qu'une exécution n'échoue pas sur une CLI manquante ; `peek`
(ci-dessous) repère une fenêtre restée sur un écran de connexion.
`reevesagents doctor --json` renvoie les mêmes informations en JSON exploitable
par un script.

Prérequis : Node 20.19+, tmux 3.0+, et au moins une CLI de fournisseur installée
et authentifiée. macOS, Linux ou WSL (Windows natif n'est pas une cible).

## Installation

```sh
pnpm add -g reevesagents     # ou : npm install -g reevesagents
```

Exécution sans installation : `pnpm dlx reevesagents doctor`.

## Créer des agents

Chaque agent s'écrit `provider[:nickname[:model]]` ; nickname et model sont
optionnels. Le premier agent dirige l'exécution ; les autres la rejoignent
comme workers.

```sh
# Un lead Claude Code, un deuxième reviewer Claude Code, deux workers Codex, un worker Kimi.
reevesagents spawn cc:lead cc:review codex:api codex:tests kimi:docs \
  --name "feature x" --skip \
  --prompt "Build feature X. Lead coordinates; each worker takes a slice."
```

Avant de lancer quoi que ce soit, `spawn` vérifie que chaque CLI de fournisseur
nommée est sur le PATH et cite celles qui manquent : une faute de frappe ou une
CLI absente échoue donc immédiatement, au lieu de laisser une exécution démarrer
à moitié. En cas de succès, il affiche l'id de l'exécution, l'id de chaque agent
et les commandes `peek`/`send`/`open` exactes pour les piloter.

Flags `spawn` utiles : `--name <run>`, `--cwd <dir>` (par défaut le répertoire
courant), `--prompt <text>` (collé dans chaque agent au démarrage), `--skip`
(lance les agents sans leurs propres demandes de permission ; utilisez-le quand
aucun humain n'est là pour approuver), `--run <run-id>` (ajoute des agents à une
exécution existante au lieu d'en démarrer une nouvelle), `--json` (affiche les
ids de l'exécution et des agents en JSON plutôt qu'en texte).

## Ids de fournisseur et alias

Lancez `reevesagents providers` (ajoutez `--json` pour une liste exploitable par
machine). N'importe quel alias peut tenir lieu de fournisseur dans un spec de
`spawn`.

| id         | fournisseur  | alias courants                  |
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

## Observer et diriger les agents en cours d'exécution

```sh
reevesagents runs                      # liste les exécutions en cours (ajoutez --json pour les scripts)
reevesagents agents <run-id>           # liste les agents d'une exécution
reevesagents peek <agent-id> -n 40     # sortie récente d'un agent
reevesagents send <agent-id> "do X"    # colle du texte au prompt de l'agent
reevesagents key <agent-id> enter      # soumet (send ne soumet pas de lui-même)
reevesagents interrupt <agent-id>      # envoie ctrl-c à l'agent
reevesagents open <run-id|agent-id>    # bascule vers sa fenêtre tmux
reevesagents approvals                 # demandes d'approbation en attente (ajoutez --json)
reevesagents approve <approval-id>     # en résout une ; deny <approval-id> la refuse
```

`send` ne fait que coller ; enchaînez avec `key <agent-id> enter` pour soumettre.
Touches acceptées par `key` : `enter`, `escape`, `backspace`, `tab`, `space`,
`up`, `down`, `left`, `right`, `ctrl-c`.

## Arrêter proprement

```sh
reevesagents stop <run-id> --yes       # termine une exécution entière et démonte sa session tmux
reevesagents kill <agent-id> --yes     # termine un agent
```

`stop` et `kill` refusent de s'exécuter sans `--yes`. Le même verrou couvre le
nettoyage : `delete <agent-id>` et `delete-run <run-id>` suppriment des
enregistrements terminés, et `delete-history <id>` supprime une entrée archivée.

## Un exemple concret : cinq agents, puis les diriger

Le scénario « installer reevesagents, créer deux Claude, deux Codex et un Kimi,
puis les mettre au travail », du début à la fin.

```sh
# 1. Confirmez que les cinq CLI sont installées et compatibles.
reevesagents doctor

# 2. Démarrez l'équipe. --skip pour que les workers ne bloquent pas sur leurs propres demandes de permission.
reevesagents spawn cc:lead cc:review codex:api codex:tests kimi:docs \
  --name "feature x" --skip \
  --prompt "Build feature X. Lead coordinates; each worker owns one slice."

# 3. spawn affiche chaque id d'agent. Listez-les tous, ou lisez-en un.
reevesagents agents <run-id>
reevesagents peek <agent-id> -n 40

# 4. Dirigez : collez un message, puis soumettez-le.
reevesagents send <agent-id> "rebase on main, then run the tests"
reevesagents key  <agent-id> enter

# 5. Ajoutez un worker à la même exécution plus tard.
reevesagents spawn codex:perf --run <run-id> --skip --prompt "profile the hot path"

# 6. Terminez l'exécution une fois le travail fini.
reevesagents stop <run-id> --yes
```

Piloté depuis une CLI hôte via MCP plutôt que depuis le shell, le même scénario
tient en une seule instruction : « Utilisez reevesagents pour démarrer une
équipe : un lead Claude Code, un second reviewer Claude Code, deux workers Codex
(api et tests) et un worker Kimi pour les docs. Sautez les demandes de
permission, donnez-leur le brief, puis surveillez et rapportez l'avancement. »
La CLI hôte appelle elle-même les outils spawn/read/send. Voir
[docs/mcp.md](docs/mcp.md).

## À faire et à éviter

À faire :

- Lancez `doctor` avant de créer des agents, et vérifiez que chaque fournisseur
  nommé est installé **et connecté**. doctor ne peut pas tester la connexion ; si
  une fenêtre reste figée, `peek` montre l'écran de connexion.
- Traitez `spawn` comme du fire-and-forget : il renvoie des ids, pas des
  réponses. Suivez l'équipe avec `runs`, `agents <run-id>` et
  `peek <agent-id> -n 40` pour voir ce qu'elle fait.
- Soumettez l'entrée en deux temps : `send <agent-id> "..."` colle,
  `key <agent-id> enter` soumet.
- Passez `--skip` quand personne ne sera là pour approuver les demandes, sinon
  les workers bloquent dès la première.
- Utilisez `--json` (sur `spawn`, `runs`, `agents`, `providers`, `doctor`) quand
  un script ou un agent doit lire des ids et de l'état plutôt que du texte.
- Nommez les fournisseurs par id ou par n'importe quel alias de
  `reevesagents providers` (`cc` ou `claude`, `codex`, `kimi`, ...).

À éviter :

- N'attendez pas de `spawn` le résultat d'un agent ; démarrez l'équipe, puis
  lisez sa sortie.
- Ne supposez pas qu'un `send` a suffi ; rien n'est soumis tant que vous
  n'envoyez pas `key <agent-id> enter`.
- Ne lancez pas un fournisseur manquant ou déconnecté ; `spawn` refuse le
  premier, et le second laisse une fenêtre bloquée sur un prompt de connexion qui
  ne fera jamais le travail.
- N'exécutez pas `stop`, `kill` ou les commandes `delete` sans `--yes` ; ce sont
  les commandes destructives.
- Ne visez pas Windows natif ; travaillez dans WSL, avec tmux et les CLI
  installés à l'intérieur.
- Ne collez pas de secrets dans un `--prompt` ou un `send` ; la sortie est
  capturée et visible via `peek` et la Web UI.

## Notes pour les scripts

- `spawn`, `runs`, `agents`, `providers` et `doctor` acceptent tous `--json`.
- `spawn --json` affiche l'id de l'exécution et l'id de chaque agent ;
  capturez-les, ou relisez-les via `runs --json` et `agents <run-id> --json`.
- Surchargez le répertoire d'état avec `REEVES_REGISTRY` et le fichier de config
  avec `REEVES_CONFIG` pour isoler une exécution scriptée de `~/.reeves`.

## Pour aller plus loin

- [README](README.md) : visite complète des fonctionnalités et toutes les commandes.
- [docs/GUIDE.md](docs/GUIDE.md) : le guide utilisateur pas à pas.
- [docs/mcp.md](docs/mcp.md) : la conception du MCP de contrôle d'agent et la liste des outils.
