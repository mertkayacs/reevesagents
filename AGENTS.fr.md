# AGENTS.md

[English](AGENTS.md) · [Deutsch](AGENTS.de.md) · **Français** · [Español](AGENTS.es.md) · [Português](AGENTS.pt.md) · [Italiano](AGENTS.it.md) · [Türkçe](AGENTS.tr.md) · [Русский](AGENTS.ru.md) · [简体中文](AGENTS.zh-Hans.md) · [العربية](AGENTS.ar.md)

Comment un agent de codage d'IA pilote ReevesAgents. Ce fichier est le guide de l'opérateur pour
l'outil lui-même. Il ne change pas comment les agents se comportent dans vos propres projets.

ReevesAgents exécute des CLI de codage d'IA (Claude Code, Codex, Kimi, Qwen, OpenCode, Hermes,
et autres) côte à côte, chacune comme une vraie CLI dans sa propre fenêtre tmux. Un agent peut
créer, diriger et superviser les autres. L'état vit en JSON local sous `~/.reeves`.
Aucune clé API, aucune base de données, aucun démon en arrière-plan.

## Deux façons de l'utiliser

1. **Pilotez la CLI directement.** Exécutez `reevesagents spawn ...` pour démarrer des agents, puis
   `runs`, `peek`, `send`, et `stop` pour les regarder et les diriger. Bon pour les scripts et
   l'orchestration ponctuelle.
2. **Laissez votre CLI hôte piloter les autres via MCP.** `reevesagents attach <cli>` donne à cette
   CLI un ensemble d'outils de contrôle d'agent (spawn, send_text, read, kill, ...). Après avoir
   redémarré la CLI, une seule session peut créer une équipe et la diriger. C'est la fonctionnalité clé. Voir [docs/mcp.md](docs/mcp.md).

## Vérification de la configuration d'abord

```sh
reevesagents doctor
```

Rapporte tmux, Node, le répertoire d'état `~/.reeves`, et quels CLI de fournisseur sont installés
et compatibles avec la CLI (il inspecte le `--help` de chaque CLI). Il ne peut pas tester si une CLI est
connectée, donc une CLI installée mais non connectée passe quand même ici. Exécutez-la avant de créer
pour qu'une exécution n'échoue pas sur une CLI manquante ; `peek` (ci-dessous) détecte une fenêtre laissée sur
un écran de connexion. `reevesagents doctor --json` retourne les mêmes données en JSON lisible par machine.

Pré-requis : Node 20.19+, tmux 3.0+, et au moins une CLI de fournisseur installée et
authentifiée. macOS, Linux, ou WSL (Windows natif n'est pas la cible).

## Installation

```sh
pnpm add -g reevesagents     # ou : npm install -g reevesagents
```

Exécution sans installation : `pnpm dlx reevesagents doctor`.

## Créer des agents

Chaque agent s'écrit comme `provider[:nickname[:model]]` ; nickname et model sont
optionnels. Le premier agent dirige l'exécution ; les autres la rejoignent comme workers.

```sh
# Un lead Claude Code, un deuxième reviewer Claude Code, deux workers Codex, un worker Kimi.
reevesagents spawn cc:lead cc:review codex:api codex:tests kimi:docs \
  --name "feature x" --skip \
  --prompt "Build feature X. Lead coordinates; each worker takes a slice."
```

Avant de commencer quoi que ce soit, `spawn` vérifie que chaque CLI de fournisseur nommée est sur PATH et
nomme celles qui manquent, de sorte qu'une faute de frappe ou une CLI non installée échoue vite au lieu de
démarrer à moitié une exécution. En cas de succès, il affiche l'id d'exécution, l'id de chaque agent, et les commandes exactes
`peek`/`send`/`open` pour les piloter.

Flags `spawn` utiles : `--name <run>`, `--cwd <dir>` (par défaut le répertoire courant),
`--prompt <text>` (collé dans chaque agent au démarrage), `--skip` (lance les agents sans
leurs propres demandes de permission ; utilisez-le quand aucun humain n'est là pour approuver), `--run <run-id>`
(ajoute des agents à une exécution existante au lieu de commencer une nouvelle), `--json` (affiche l'exécution
et les ids des agents en JSON au lieu de texte).

## Ids de fournisseur et alias

Exécutez `reevesagents providers` (ajoutez `--json` pour une liste lisible par machine). N'importe quel alias fonctionne comme le
fournisseur dans un spec de création.

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

## Regarder et diriger les agents en cours d'exécution

```sh
reevesagents runs                      # liste les exécutions en direct (ajoutez --json pour les scripts)
reevesagents agents <run-id>           # liste les agents dans une exécution
reevesagents peek <agent-id> -n 40     # sortie récente d'un agent
reevesagents send <agent-id> "do X"    # colle du texte au prompt de l'agent
reevesagents key <agent-id> enter      # le soumet (send ne soumet pas seul)
reevesagents interrupt <agent-id>      # ctrl-c l'agent
reevesagents open <run-id|agent-id>    # va à sa fenêtre tmux
```

`send` colle seulement ; suivez-le avec `key <agent-id> enter` pour soumettre. Les touches acceptées par
`key` : `enter`, `escape`, `backspace`, `tab`, `space`, `up`, `down`, `left`, `right`,
`ctrl-c`.

## Arrêter proprement

```sh
reevesagents stop <run-id> --yes       # termine une exécution entière et démontte sa session tmux
reevesagents kill <agent-id> --yes     # termine un agent
```

`stop` et `kill` sont les seules commandes destructives, donc elles refusent de s'exécuter sans
`--yes`.

## Un exemple travaillé : cinq agents, puis les diriger

Le scénario "installer reevesagents, créer deux Claude, deux Codex, et un Kimi, et les mettre au travail" du début à la fin.

```sh
# 1. Confirmez que les cinq CLI sont installées et compatibles.
reevesagents doctor

# 2. Démarrez l'équipe. --skip pour que les workers ne s'arrêtent pas sur leurs propres demandes de permission.
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

# 6. Terminez l'exécution quand c'est fait.
reevesagents stop <run-id> --yes
```

Le piloter à partir d'une CLI hôte via MCP au lieu du shell, le même scénario est une
instruction : "Utilisez reevesagents pour démarrer une équipe, un lead Claude Code, un deuxième reviewer Claude Code,
deux workers Codex (api et tests), et un worker Kimi pour les docs. Omettez les demandes de permission,
donnez-leur le brief, puis regardez et rapportez la progression." L'hôte appelle lui-même les
outils spawn/read/send. Voir [docs/mcp.md](docs/mcp.md).

## Faire et ne pas faire

Faire :

- Exécutez `doctor` avant une création, et assurez-vous que chaque fournisseur que vous nommez est installé **et
  connecté**. doctor ne peut pas tester la connexion ; si une fenêtre s'arrête, `peek` montre l'écran de connexion.
- Traitez `spawn` comme du tir et oubli. Il retourne les ids, pas les réponses. Sondez avec `runs`,
  `agents <run-id>`, et `peek <agent-id> -n 40` pour voir ce qu'une équipe fait.
- Soumettez l'entrée en deux étapes : `send <agent-id> "..."` colle, `key <agent-id> enter` soumet.
- Passez `--skip` quand aucun humain ne s'assiéra pour approuver les prompts, ou les workers s'arrêteront au premier.
- Utilisez `--json` (sur `spawn`, `runs`, `agents`, `providers`, `doctor`) quand un script ou un
  agent doit lire les ids et l'état au lieu de texte.
- Nommez les fournisseurs par id ou n'importe quel alias de `reevesagents providers` (`cc` ou `claude`, `codex`, `kimi`, ...).

Ne pas faire :

- N'attendez pas que `spawn` retourne le résultat d'un agent ; démarrez l'équipe, puis lisez-la.
- N'envoyez pas et n'assumez pas que ça a marché ; rien ne se soumet jusqu'à ce que vous fassiez `key <agent-id> enter`.
- Ne créez pas un fournisseur qui manque ou est déconnecté ; spawn refuse le premier, et
  le deuxième laisse une fenêtre garée à un prompt de connexion qui ne fait jamais le travail.
- N'exécutez pas `stop` ou `kill` sans `--yes` ; ce sont les seules commandes destructives.
- Ne ciblez pas Windows natif ; exécutez à l'intérieur de WSL avec tmux et les CLI installées là.
- Ne collez pas de secrets dans un `--prompt` ou `send` ; la sortie est capturée et affichée via `peek` et l'interface Web.

## Notes de script

- `spawn`, `runs`, `agents`, `providers`, et `doctor` acceptent tous `--json`.
- `spawn --json` affiche l'id d'exécution et chaque id d'agent ; capturez-les, ou relisez-les
  depuis `runs --json` et `agents <run-id> --json`.
- Remplacez le répertoire d'état avec `REEVES_REGISTRY` et le fichier de config avec `REEVES_CONFIG`
  pour garder une exécution scriptée isolée de `~/.reeves`.

## Ailleurs

- [README](README.md): tour complet des fonctionnalités et chaque commande.
- [docs/GUIDE.md](docs/GUIDE.md): guide utilisateur pas à pas.
- [docs/mcp.md](docs/mcp.md): la conception MCP de contrôle d'agent et la liste des outils.
