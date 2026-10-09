<p align="center"><a href="https://reevesagents.mertkayacs.com/ru/"><img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-banner.png" width="800" alt="ReevesAgents: запускайте AI-ассистентов для программирования вместе"></a></p>

# reevesagents: рабочее пространство для AI-инструментов программирования

Запускайте Claude Code, Codex, Kimi, OpenCode, Hermes и другие AI-инструменты для программирования рядом друг с другом на своём компьютере. reevesagents собирает их терминальные сессии в одном месте: вы видите работу каждого инструмента, отправляете указания и останавливаете запуск (run) оттуда же.

<img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-hero.webp" width="720" alt="Ведущая панель в золотой рамке, соединённая тонкими золотыми нитями с восемью светящимися стеклянными панелями, по одной на каждый инструмент запуска">

[Посмотреть демо](https://reevesagents.mertkayacs.com/ru/demo/) или установить консольную утилиту по инструкции ниже.

## Быстрый старт

Нужны Node.js 20.19 или новее, tmux 3.0 или новее и установленный AI-инструмент для программирования, в котором выполнен вход. Работает в macOS, Linux и WSL. Благодаря tmux инструменты продолжают работать после закрытия интерфейса.

```sh
npm install -g reevesagents && reevesagents doctor && reevesagents
```

Команда откроет терминальный интерфейс. Для браузерного интерфейса выполните `reevesagents web`: он слушает только loopback-адрес вашего компьютера.

## Запуск команды

Создайте запуск с задачей для инструментов:

```sh
reevesagents spawn claude-code:lead codex:tests --name "review" --prompt "Проверь код и тесты."
```

В терминальном или браузерном интерфейсе можно читать вывод и направлять каждый инструмент. Каждый провайдер использует свой вход и сам отправляет запросы к модели. Состояние запусков хранится в JSON в `~/.reeves`.

<img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-newrun-ru.png" width="720" alt="Web UI reevesagents при создании нового запуска: имя запуска, выбор инструментов (Claude Code, Codex CLI, Kimi Code и других), модель и режим разрешений">

## Один инструмент управляет остальными

Подключите необязательный MCP-сервер (Model Context Protocol, стандартный способ связи между AI-инструментами) к хосту, которому вы доверяете:

```sh
reevesagents attach claude && reevesagents hosts
```

Перезапустите этот хост, чтобы он загрузил подключение. После этого он сможет запускать другие инструменты, читать их вывод, направлять и останавливать их. По умолчанию воркеры не получают MCP-подключения. Не отключайте запросы разрешений у провайдеров и проверяйте подтверждения перед рискованными действиями.

В Claude Code подключение и инструкции к нему можно установить вместе, как плагин:

```sh
claude plugin marketplace add mertkayacs/reevesagents
claude plugin install reevesagents@reevesagents
```

Для других хостов инструкции даёт [skill reevesagents](https://github.com/mertkayacs/reevesagents-skill). Список инструментов и требования к хостам описаны в [справочнике по MCP](../mcp.md).

Сервер есть в [официальном реестре MCP](https://registry.modelcontextprotocol.io/?q=io.github.mertkayacs/reevesagents) под именем `io.github.mertkayacs/reevesagents`.

<img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-steer.webp" width="560" alt="Ведущая панель в золотой рамке отправляет сообщения по золотым нитям трём другим панелям">

## Выберите интерфейс

| Интерфейс | Назначение |
| --- | --- |
| Терминальный интерфейс | Просмотр запусков и управление ими с клавиатуры |
| Web UI | Запуски, живой вывод, подтверждения и история в браузере |
| Командная строка | Создание запусков и чтение вывода из скриптов |
| MCP-сервер | Доверенный AI-инструмент управляет командой |

<details>
<summary>Скриншот Web UI</summary>

<img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-web-ru.png" width="720" alt="Web UI reevesagents до первого запуска: пустой список агентов, кнопки нового запуска, настройки языка и параметров">

</details>

## Документация

- [Руководство пользователя](https://reevesagents.mertkayacs.com/ru/docs/): установка, команды и настройка.
- [Частые вопросы](https://reevesagents.mertkayacs.com/ru/faq/): настройка провайдеров и решение проблем.
- [Справочник по MCP](../mcp.md): инструменты и подключение хостов (на английском).
- [Как помочь проекту](../../.github/CONTRIBUTING.md), [тестирование](../testing.md) и [список изменений](../../CHANGELOG.md) (на английском).

Другие языки: [English](../../README.md), [Deutsch](README.de.md), [Français](README.fr.md), [Español](README.es.md), [Português](README.pt.md), [Italiano](README.it.md), [Türkçe](README.tr.md), [简体中文](README.zh-Hans.md), [العربية](README.ar.md).

## Лицензия

[Apache-2.0](../../LICENSE). Доступен в [npm](https://www.npmjs.com/package/reevesagents).

<a href="https://eschatialabs.com"><picture><source media="(prefers-color-scheme: dark) and (min-resolution: 2dppx)" srcset="https://eschatialabs.com/brand/lockup-46-dark@2x.png"><source media="(prefers-color-scheme: dark)" srcset="https://eschatialabs.com/brand/lockup-46-dark@1x.png"><source media="(min-resolution: 2dppx)" srcset="https://eschatialabs.com/brand/lockup-46@2x.png"><img src="https://eschatialabs.com/brand/lockup-46@1x.png" width="124" height="46" alt="Eschatia Labs"></picture></a><br>Проект [Eschatia Labs](https://eschatialabs.com), автор [Mert Kaya](https://mertkayacs.com).
