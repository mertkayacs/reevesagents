<p align="center">
  <a href="https://reevesagents.mertkayacs.com">
    <img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-header.gif" alt="ReevesAgents" width="800" />
  </a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/reevesagents"><img src="https://img.shields.io/npm/v/reevesagents.svg" alt="npm version" /></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/node/v/reevesagents.svg" alt="node" /></a>
  <a href="../../LICENSE"><img src="https://img.shields.io/npm/l/reevesagents.svg" alt="license" /></a>
  <a href="https://github.com/mertkayacs/reevesagents/actions/workflows/test.yml"><img src="https://img.shields.io/github/actions/workflow/status/mertkayacs/reevesagents/test.yml?branch=master&label=CI" alt="CI" /></a>
</p>

<p align="center">
  <a href="https://reevesagents.mertkayacs.com/demo"><b>Демо</b></a> ·
  <a href="https://reevesagents.mertkayacs.com/docs"><b>Документация</b></a> ·
  <a href="https://reevesagents.mertkayacs.com/faq"><b>Вопросы и ответы</b></a> ·
  <a href="https://github.com/mertkayacs/reevesagents/issues"><b>Issues</b></a>
</p>

[English](../../README.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português](README.pt.md) · [Italiano](README.it.md) · [Türkçe](README.tr.md) · **Русский** · [简体中文](README.zh-Hans.md) · [العربية](README.ar.md)

ReevesAgents: локальное рабочее пространство для AI CLI, которые пишут код.
Он запускает Claude Code, Codex, OpenCode, Hermes, Kimi, DeepSeek, Qwen, Pi,
Aider и CLI других провайдеров бок о бок в tmux. Им можно пользоваться как
обычным CLI, TUI или Web UI, а можно подключить опциональный MCP, и тогда один
агент сможет запускать остальных, читать их вывод, направлять их и
останавливать.

Вход в аккаунт каждого провайдера остаётся внутри его CLI. Своё состояние ReevesAgents хранит
в нескольких простых JSON-файлах в `~/.reeves` и работает, только пока им пользуетесь вы или
подключённый CLI.

## Быстрый старт

```sh
pnpm add -g reevesagents
reevesagents doctor
reevesagents
```

Запустите run из CLI:

```sh
reevesagents spawn claude-code:lead codex:tests hermes:research \
  --name "release check" \
  --prompt "Review the release path, test coverage, and docs."
```

Откройте Web UI:

```sh
reevesagents web
```

Дайте одному подключённому агенту управлять остальными:

```sh
reevesagents attach codex
reevesagents hosts
```

После `attach` перезапустите этот CLI, чтобы он загрузил инструменты MCP.

## Что вы получаете

| Интерфейс | Для чего |
| --- | --- |
| **TUI** | Управление run'ами с клавиатуры прямо в терминале. |
| **Web UI** | Локальный визуальный обзор run'ов, панелей, агентов, подтверждений и истории. |
| **CLI** | Скрипты, быстрые проверки, запуск агентов, очистка состояния и переходы в tmux. |
| **Agent Control MCP** | Один доверенный CLI запускает другие CLI и управляет ими через локальные инструменты. |
| **tmux** | Настоящие окна CLI провайдеров, которые продолжают работать после закрытия интерфейса. |

ReevesAgents работает локально, так он и задуман. Состояние хранится в обычном
JSON в `~/.reeves`, а запускает он те же CLI, которыми вы и так пользуетесь
вручную.

<a id="install"></a>
<details>
<summary><strong>Установка</strong></summary>

Для ReevesAgents нужны Node.js `20.19+`, tmux `3.0+` и хотя бы один
поддерживаемый CLI провайдера, который установлен и в котором выполнен вход.
Поддерживаются macOS, Linux и WSL.

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

Чтобы зафиксировать версию, подставьте её вместо `<version>`:

```sh
pnpm add -g reevesagents@<version>
```

Установка из исходников:

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
<summary><strong>Скриншоты</strong></summary>

TUI и Web UI управляют одними и теми же локальными run'ами:

![ReevesAgents TUI: выбор языка, приветственное меню и doctor](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-tui.gif)

![ReevesAgents Web UI: run'ы и живые панели агентов](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-web-ru.png)

![ReevesAgents Web UI: запуск нового run'а](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-newrun-ru.png)

</details>

<a id="commands"></a>
<details>
<summary><strong>Команды</strong></summary>

Без аргументов открывается TUI.

| Команда | Назначение |
| --- | --- |
| `reevesagents` | Открыть TUI. |
| `spawn [spec...]` | Запустить run. Каждая спецификация имеет вид `provider[:nickname[:model]]`. |
| `add [spec...]` | Добавить агентов в самый свежий активный run. |
| `runs` | Показать активные run'ы. |
| `agents [run-id]` | Показать агентов во всех run'ах или в одном. |
| `open <id>` | Перейти в окно tmux нужного run'а или агента. |
| `peek <agent-id>` | Напечатать недавний вывод одного агента. |
| `send <agent-id> <text...>` | Вставить текст агенту без отправки. |
| `key <agent-id> <key>` | Отправить `enter`, `escape`, стрелки, `tab`, `space`, `backspace` или `ctrl-c`. |
| `interrupt <agent-id>` | Отправить Ctrl-C одному агенту. |
| `stop <run-id>` | Остановить run. Требует `--yes` или `ALLOW_DESTRUCTIVE=1`. |
| `kill <agent-id>` | Остановить одного агента. Требует `--yes` или `ALLOW_DESTRUCTIVE=1`. |
| `setup` | Проверка при первом запуске. `--attach` подключает все установленные хост-CLI. |
| `doctor` | Проверить Node, tmux, состояние и CLI провайдеров. |
| `web` | Запустить Web UI, доступный только через loopback. |
| `providers` | Показать id провайдеров, алиасы, модели и доступность. |
| `approvals` | Показать ожидающие запросы на подтверждение. |
| `approve` / `deny` | Одобрить или отклонить один запрос. |
| `hosts` | Показать, к каким хост-CLI подключён ReevesAgents. |
| `attach [cli]` | Подключить Agent Control MCP к одному хост-CLI или ко всем установленным. |
| `detach <cli>` | Убрать это подключение MCP у одного хост-CLI. |
| `skills [action]` | Установить, удалить или проверить скилл ReevesAgents. |
| `mcp` | Запустить MCP-сервер через stdio. Его запускают хост-CLI. |
| `config [key] [value]` | Показать или изменить редактируемые настройки. |
| `presets` | Показать сохранённые пресеты run'ов. |
| `save-preset` | Сохранить работающий run как пресет. |
| `start-preset` | Запустить run из пресета. |
| `delete-preset` | Удалить пресет. |
| `delete` | Удалить запись одного завершённого агента. Требует подтверждения. |
| `delete-run` | Удалить один завершённый run и отправить его в архив. Требует подтверждения. |
| `history` | Показать архивные run'ы. |
| `delete-history` | Удалить одну запись из архива истории. Требует подтверждения. |
| `reap` | Завершить агентов-зомби и агентов, превысивших `max_lifetime_ms`, и убить осиротевшие сессии tmux, у которых нет записи run'а. |

Общие флаги:

- `--json`: есть у команд списков и действий, рассчитанных на скрипты.
- `--name <name>`: имя run'а.
- `--cwd <dir>`: каталог, из которого запускаются агенты.
- `--prompt <text>`: стартовый текст, который вставляется каждому запущенному агенту.
- `--skip`: пропустить запросы разрешений провайдера для воркеров без присмотра.
- `--run <run-id>`: добавить агентов в конкретный run.
- `--port <n>` и `--no-open`: параметры запуска Web UI.

</details>

<a id="agent-control"></a>
<details>
<summary><strong>Agent Control</strong></summary>

Agent Control: опциональный MCP-сервер. Подключайте его только к тому CLI,
которому доверяете управление локальными инструментами:

```sh
reevesagents attach claude
reevesagents hosts
```

После перезапуска этот CLI получает инструменты `spawn`, `read`, `send_text`,
`send_key`, `interrupt`, `kill`, `stop`, а также инструменты для подтверждений,
пресетов и просмотра хостов. Каталог провайдеров доступен ещё и как ресурс
`reevesagents://providers`.

По умолчанию воркеры MCP не получают. Если воркер должен создавать собственных
воркеров, явно подключите ReevesAgents к CLI этого воркера.

Codex по умолчанию запускает вызовы MCP в песочнице, и она блокирует запуски
tmux. Если Codex выступает хостом, который управляет агентами, запускайте его с
полным доступом, например `codex --sandbox danger-full-access`, или используйте
профиль Codex с `sandbox_mode = "danger-full-access"`.

Полный справочник по инструментам: [docs/mcp.md](../mcp.md). Руководство
оператора для агентов: [AGENTS.ru.md](../../AGENTS.ru.md).

</details>

<a id="configuration"></a>
<details>
<summary><strong>Конфигурация</strong></summary>

Состояние хранится в `~/.reeves`:

```text
~/.reeves/
  config.json
  presets/
  runs/
  history/
```

Две переменные окружения переопределяют пути по умолчанию:

- `REEVES_REGISTRY`: другой корень состояния для `runs/`, `history/` и `presets/`.
- `REEVES_CONFIG`: другой путь к файлу конфигурации.

На один сервер tmux приходится один реестр. Фоновая очистка осиротевших сессий
определяет их владельца по текущему реестру, поэтому два реестра на одном
сервере tmux работать не должны.

Всё, что может содержать секрет, вычищается ещё до записи в файл.

</details>

<a id="examples"></a>
<details>
<summary><strong>Примеры</strong></summary>

Разнесите один проект по нескольким CLI:

```sh
reevesagents spawn deepseek:backend claude-code:product codex:review \
  --name "feature x" \
  --prompt "Backend, product copy, and a review pass."
```

Посмотрите на одного агента, а затем откройте его окно:

```sh
reevesagents peek backend -n 40
reevesagents open backend
```

Когда работа сделана, остановите run:

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

Web UI слушает только `127.0.0.1` и работает на переднем плане. Агенты живут в
tmux, поэтому продолжают работать и после закрытия страницы.

Web UI использует опциональные модули времени выполнения `ws` и
`@lydell/node-pty`. npm ставит их по умолчанию. Команды CLI и TUI работают и без
них, а `reevesagents web` объясняет, чего не хватает.

Чтобы открыть его с другой машины, пробросьте loopback-порт по SSH:

```sh
ssh -L 8080:127.0.0.1:8080 user@host
```

</details>

<a id="troubleshooting"></a>
<details>
<summary><strong>Устранение неполадок</strong></summary>

**tmux не установлен.** Установите tmux и запустите `reevesagents doctor`. TUI
сам заворачивается в tmux-сессию с именем `reeves`. Чтобы это отключить,
задайте `REEVES_NO_TMUX_WRAPPER=1`.

**CLI провайдера отсутствует или в нём не выполнен вход.** ReevesAgents
запускает CLI провайдеров, которые уже есть в `PATH` и авторизованы.
`reevesagents doctor` показывает, что удалось найти. Если запущенное окно ждёт
входа, это видно через `peek`.

**Web UI сообщает об отсутствующих пакетах.** Переустановите пакет с
включёнными опциональными зависимостями и запустите `reevesagents doctor`.

**Порт уже занят.** По умолчанию `reevesagents web` стартует на `8080`. Если
порт занят, сервер берёт следующий свободный из небольшого диапазона и печатает
URL.

</details>

<a id="contributing"></a>
<details>
<summary><strong>Участие в разработке</strong></summary>

Документация для контрибьюторов лежит в [docs/](..). Начните с
[CONTRIBUTING.md](../../.github/CONTRIBUTING.md), [тестирования](../testing.md) и
[выпуска релизов](../releasing.md).

Конечным пользователям инструменты разработки не нужны. Контрибьюторы
используют pnpm, TypeScript, tsup, Vitest и ESLint из репозитория.

</details>

## Ссылки

- Сайт: https://reevesagents.mertkayacs.com
- npm: https://www.npmjs.com/package/reevesagents
- GitHub: https://github.com/mertkayacs/reevesagents
- Релизы: https://github.com/mertkayacs/reevesagents/releases
- Issues: https://github.com/mertkayacs/reevesagents/issues
- Список изменений: [CHANGELOG.md](../../CHANGELOG.md)
- Лицензия: [Apache-2.0](../../LICENSE)
