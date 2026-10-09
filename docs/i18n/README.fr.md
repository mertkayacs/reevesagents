<p align="center"><a href="https://reevesagents.mertkayacs.com/fr/"><img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-banner.png" width="800" alt="ReevesAgents : faire travailler ensemble les assistants de code IA"></a></p>

# reevesagents : un espace de travail pour les outils de code IA

Lancez Claude Code, Codex, Kimi, OpenCode, Hermes et d'autres outils de code IA côte à côte sur votre ordinateur. reevesagents regroupe leurs sessions de terminal : vous suivez le travail de chaque outil, envoyez des instructions et arrêtez un run depuis un seul endroit.

<img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-hero.webp" width="720" alt="Une vitre principale cerclée d'or reliée par de fins fils dorés à huit vitres lumineuses, une par outil du run">

[Voir la démo](https://reevesagents.mertkayacs.com/fr/demo/) ou installer l'outil en ligne de commande ci-dessous.

## Démarrage rapide

Il faut Node.js 20.19 ou plus récent, tmux 3.0 ou plus récent et un outil de code IA installé et connecté. Fonctionne sous macOS, Linux et WSL. tmux garde les outils actifs quand vous fermez l'interface.

```sh
npm install -g reevesagents && reevesagents doctor && reevesagents
```

Cette commande ouvre l'interface terminal. Pour l'interface navigateur, lancez `reevesagents web` ; elle n'écoute que sur l'adresse de bouclage (loopback) de votre ordinateur.

## Lancer une équipe

Démarrez un run avec une tâche pour les outils :

```sh
reevesagents spawn claude-code:lead codex:tests --name "review" --prompt "Relis le code et les tests."
```

Lisez la sortie et pilotez chaque outil depuis l'interface terminal ou navigateur. Chaque fournisseur garde sa propre connexion et envoie ses propres requêtes au modèle. L'état des runs est enregistré en JSON dans `~/.reeves`.

<img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-newrun-fr.png" width="720" alt="Web UI de reevesagents au lancement d'un nouveau run : nom du run, choix des outils comme Claude Code, Codex CLI et Kimi Code, modèle et mode de permissions">

## Un outil pilote les autres

Connectez le serveur MCP optionnel (Model Context Protocol, une connexion standard entre outils d'IA) à un hôte de confiance :

```sh
reevesagents attach claude && reevesagents hosts
```

Redémarrez cet hôte pour qu'il charge la connexion. Il peut ensuite lancer, lire, piloter et arrêter les autres outils. Par défaut, les workers n'ont aucune connexion MCP. Laissez les demandes de permission des fournisseurs activées et vérifiez les approbations avant toute action sensible.

Dans Claude Code, vous pouvez installer la connexion et son mode d'emploi en une fois, sous forme de plugin :

```sh
claude plugin marketplace add mertkayacs/reevesagents
claude plugin install reevesagents@reevesagents
```

Pour les autres hôtes, le [skill reevesagents](https://github.com/mertkayacs/reevesagents-skill) fournit le mode d'emploi. La [référence MCP](../mcp.md) détaille les outils et les prérequis des hôtes.

Le serveur figure dans le [registre MCP officiel](https://registry.modelcontextprotocol.io/?q=io.github.mertkayacs/reevesagents) sous le nom `io.github.mertkayacs/reevesagents`.

<img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-steer.webp" width="560" alt="Une vitre principale cerclée d'or envoie des messages le long de fils dorés vers trois autres vitres">

## Choisir une interface

| Interface | Usage |
| --- | --- |
| Interface terminal | Suivre et piloter les runs au clavier |
| Web UI | Suivre les runs, la sortie en direct, les approbations et l'historique dans le navigateur |
| Ligne de commande | Lancer des runs et lire la sortie depuis des scripts |
| Serveur MCP | Confier une équipe à un outil de code IA de confiance |

<details>
<summary>Capture de la Web UI</summary>

<img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-web-fr.png" width="720" alt="Web UI de reevesagents avant tout run : liste d'agents vide, boutons Nouveau run et réglages de langue et de paramètres">

</details>

## Documentation

- [Guide d'utilisation](https://reevesagents.mertkayacs.com/fr/docs/): installation, commandes et configuration.
- [FAQ](https://reevesagents.mertkayacs.com/fr/faq/): configuration des fournisseurs et dépannage.
- [Référence MCP](../mcp.md): outils et connexions des hôtes (en anglais).
- [Contribuer](../../.github/CONTRIBUTING.md), [tests](../testing.md) et [journal des modifications](../../CHANGELOG.md) (en anglais).

Autres langues : [English](../../README.md), [Deutsch](README.de.md), [Español](README.es.md), [Português](README.pt.md), [Italiano](README.it.md), [Türkçe](README.tr.md), [Русский](README.ru.md), [简体中文](README.zh-Hans.md), [العربية](README.ar.md).

## Licence

[Apache-2.0](../../LICENSE). Disponible sur [npm](https://www.npmjs.com/package/reevesagents).

<a href="https://eschatialabs.com"><picture><source media="(prefers-color-scheme: dark) and (min-resolution: 2dppx)" srcset="https://eschatialabs.com/brand/lockup-46-dark@2x.png"><source media="(prefers-color-scheme: dark)" srcset="https://eschatialabs.com/brand/lockup-46-dark@1x.png"><source media="(min-resolution: 2dppx)" srcset="https://eschatialabs.com/brand/lockup-46@2x.png"><img src="https://eschatialabs.com/brand/lockup-46@1x.png" width="124" height="46" alt="Eschatia Labs"></picture></a><br>Un projet [Eschatia Labs](https://eschatialabs.com) par [Mert Kaya](https://mertkayacs.com).
