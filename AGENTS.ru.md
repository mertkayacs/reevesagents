# AGENTS.md

[English](AGENTS.md) · [Deutsch](AGENTS.de.md) · [Français](AGENTS.fr.md) · [Español](AGENTS.es.md) · [Português](AGENTS.pt.md) · [Italiano](AGENTS.it.md) · [Türkçe](AGENTS.tr.md) · **Русский** · [简体中文](AGENTS.zh-Hans.md) · [العربية](AGENTS.ar.md)

Как AI-агент для работы с кодом управляет ReevesAgents. Этот файл служит
справочником оператора по самому инструменту. Он не меняет поведение агентов в
ваших собственных проектах.

ReevesAgents запускает AI CLI для работы с кодом (Claude Code, Codex, Kimi,
Qwen, OpenCode, Hermes и другие) бок о бок, каждый как реальный CLI в
собственном окне tmux. Один агент может запускать остальных, управлять ими и
контролировать их работу. Состояние живёт в локальном JSON под `~/.reeves`.
Без API-ключей, без базы данных, без фонового демона.

## Два способа использования

1. **Управлять CLI напрямую.** Выполните `reevesagents spawn ...`, чтобы поднять
   агентов, затем следите за ними и направляйте их через `runs`, `peek`, `send`
   и `stop`. Удобно для скриптов и разовой оркестрации.
2. **Позвольте вашему основному CLI управлять другими через MCP.**
   `reevesagents attach <cli>` даёт этому CLI набор инструментов управления
   агентами (spawn, send_text, read, kill, ...). После перезапуска CLI одна
   сессия может собрать команду и руководить ею. Это основная функция.
   См. [docs/mcp.md](docs/mcp.md).

## Сначала проверка окружения

```sh
reevesagents doctor
```

Показывает состояние tmux, Node, каталога состояния `~/.reeves` и то, какие
провайдерские CLI установлены и совместимы (он читает `--help` каждого CLI).
Проверить, выполнен ли вход в CLI, он не может, поэтому установленный, но не
авторизованный CLI здесь всё равно проходит. Запускайте его перед spawn, чтобы
run не падал из-за отсутствующего CLI, а окно, застрявшее на экране входа, вы
заметите через `peek` (ниже). `reevesagents doctor --json` возвращает то же самое в
машиночитаемом JSON.

Требования: Node 20.19+, tmux 3.0+ и хотя бы один провайдерский CLI,
установленный и с выполненным входом. macOS, Linux или WSL (нативный Windows
не является целью).

## Установка

```sh
pnpm add -g reevesagents     # или: npm install -g reevesagents
```

Запуск без установки: `pnpm dlx reevesagents doctor`.

## Запуск агентов

Каждый агент записывается как `provider[:nickname[:model]]`; nickname и model
необязательны. Первый агент ведёт run, остальные присоединяются как исполнители.

```sh
# Ведущий Claude Code, второй Claude Code на ревью, два исполнителя Codex, один исполнитель Kimi.
reevesagents spawn cc:lead cc:review codex:api codex:tests kimi:docs \
  --name "feature x" --skip \
  --prompt "Build feature X. Lead coordinates; each worker takes a slice."
```

Прежде чем что-либо запустить, `spawn` проверяет, что каждый названный
провайдерский CLI есть в PATH, и перечисляет отсутствующие, поэтому опечатка
или неустановленный CLI даёт быструю ошибку, а не наполовину поднятый run. При
успехе печатает id run'а, id каждого агента и готовые команды
`peek`/`send`/`open` для управления ими.

Полезные флаги `spawn`: `--name <run>`, `--cwd <dir>` (по умолчанию текущий
каталог), `--prompt <text>` (вставляется каждому агенту при старте), `--skip`
(запустить агентов без их собственных запросов разрешений; используйте, когда
рядом нет человека, который их одобрит), `--run <run-id>` (добавить агентов в
существующий run вместо создания нового), `--extra-args <args>` (флаги,
добавляемые к каждому запуску агента, для параметров провайдера, которые
ReevesAgents не предусматривает, например `--remote-control`), `--json`
(напечатать id run'а и агентов в JSON вместо текста).

## Id провайдеров и алиасы

Выполните `reevesagents providers` (добавьте `--json` для машинного списка).
Любой алиас работает как провайдер в спецификации spawn.

| id         | провайдер    | распространённые алиасы     |
| ---------- | ------------ | --------------------------- |
| `cc`       | Claude Code  | `claude`, `claude-code`     |
| `codex`    | Codex CLI    | `codex-cli`                 |
| `kimi`     | Kimi Code    | `kimi-code`                 |
| `qwen`     | Qwen Code    | `qwen-code`                 |
| `opencode` | OpenCode CLI | `open_code`                 |
| `hermes`   | Hermes       |                             |
| `pi`       | Pi           |                             |
| `aider`    | Aider        |                             |
| `deepseek` | DeepSeek CLI | `deepseek-cli`              |

## Наблюдение за запущенными агентами и управление ими

```sh
reevesagents runs                      # список живых run'ов (добавьте --json для скриптов)
reevesagents agents <run-id>           # список агентов одного run'а
reevesagents peek <agent-id> -n 40     # недавний вывод одного агента
reevesagents send <agent-id> "do X"    # вставить текст в строку ввода агента
reevesagents key <agent-id> enter      # отправить его (send сам не отправляет)
reevesagents interrupt <agent-id>      # послать агенту ctrl-c
reevesagents open <run-id|agent-id>    # перейти в его окно tmux
reevesagents approvals                 # ожидающие запросы на одобрение (добавьте --json)
reevesagents approve <approval-id>     # одобрить один; deny <approval-id> отклоняет
```

`send` только вставляет; следом выполните `key <agent-id> enter`, чтобы
отправить. Клавиши, которые принимает `key`: `enter`, `escape`, `backspace`,
`tab`, `space`, `up`, `down`, `left`, `right`, `ctrl-c`.

## Чистая остановка

```sh
reevesagents stop <run-id> --yes       # завершить весь run и снести его сессию tmux
reevesagents kill <agent-id> --yes     # завершить одного агента
```

`stop` и `kill` отказываются работать без `--yes`. Тот же предохранитель
распространяется и на очистку: `delete <agent-id>` и `delete-run <run-id>`
удаляют записи о завершённых агентах и run'ах, а `delete-history <id>` удаляет
запись из архива.

## Практический пример: пять агентов, затем управление ими

Сценарий «установить reevesagents, поднять двух Claude, двух Codex и одного
Kimi и дать им работу» от начала до конца.

```sh
# 1. Убедитесь, что все пять CLI установлены и совместимы.
reevesagents doctor

# 2. Запустите команду. --skip, чтобы исполнители не вставали на собственных запросах разрешений.
reevesagents spawn cc:lead cc:review codex:api codex:tests kimi:docs \
  --name "feature x" --skip \
  --prompt "Build feature X. Lead coordinates; each worker owns one slice."

# 3. spawn печатает id каждого агента. Перечислите всех или прочитайте одного.
reevesagents agents <run-id>
reevesagents peek <agent-id> -n 40

# 4. Направляйте: вставьте сообщение, затем отправьте его.
reevesagents send <agent-id> "rebase on main, then run the tests"
reevesagents key  <agent-id> enter

# 5. Позже добавьте исполнителя в тот же run.
reevesagents spawn codex:perf --run <run-id> --skip --prompt "profile the hot path"

# 6. Завершите run, когда работа сделана.
reevesagents stop <run-id> --yes
```

Если управлять этим из основного CLI через MCP, а не из оболочки, весь сценарий
укладывается в одну инструкцию: «Используй reevesagents, чтобы поднять команду:
ведущий Claude Code, второй Claude Code на ревью, два исполнителя Codex (api и
tests) и исполнитель Kimi для документации. Пропусти запросы разрешений, выдай
им задание, затем наблюдай и докладывай о прогрессе». Основной CLI сам вызывает
инструменты spawn/read/send. См. [docs/mcp.md](docs/mcp.md).

## Что делать и чего не делать

Что делать:

- Запускайте `doctor` перед spawn и убедитесь, что каждый названный провайдер
  установлен **и в нём выполнен вход**. Проверить вход doctor не умеет; если
  окно застыло, `peek` покажет экран входа.
- Считайте `spawn` командой «запустил и забыл». Она возвращает id, а не ответы.
  Опрашивайте `runs`, `agents <run-id>` и `peek <agent-id> -n 40`, чтобы
  видеть, чем занята команда.
- Отправляйте ввод в два шага: `send <agent-id> "..."` вставляет,
  `key <agent-id> enter` отправляет.
- Передавайте `--skip`, когда рядом не будет человека, одобряющего запросы,
  иначе исполнители встанут на первом же.
- Используйте `--json` (у `spawn`, `runs`, `agents`, `providers`, `doctor`),
  когда скрипту или агенту нужно читать id и состояние, а не текст.
- Называйте провайдеров по id или любому алиасу из `reevesagents providers`
  (`cc` или `claude`, `codex`, `kimi`, ...).

Чего не делать:

- Не ждите, что `spawn` вернёт результат агента; поднимите команду, затем
  читайте вывод.
- Не считайте, что после `send` текст уже ушёл; ничего не отправится, пока вы
  не выполните `key <agent-id> enter`.
- Не запускайте провайдера, который не установлен или в который не выполнен
  вход; в первом случае spawn откажет сразу, во втором окно так и останется
  стоять на экране входа и работу не начнёт.
- Не запускайте `stop`, `kill` и команды `delete` без `--yes`; это и есть
  деструктивные команды.
- Не рассчитывайте на нативный Windows; работайте внутри WSL с установленными
  там tmux и CLI.
- Не вставляйте секреты в `--prompt` или `send`; вывод захватывается и виден
  через `peek` и Web UI.

## Примечания по скриптам

- `spawn`, `runs`, `agents`, `providers` и `doctor` принимают `--json`.
- `spawn --json` печатает id run'а и id каждого агента; сохраните их или
  прочитайте заново из `runs --json` и `agents <run-id> --json`.
- Переопределяйте каталог состояния через `REEVES_REGISTRY`, а файл
  конфигурации через `REEVES_CONFIG`, чтобы скриптовый run оставался
  изолированным от `~/.reeves`.

## Дальше

- [README](README.md): полный обзор возможностей и все команды.
- [docs/GUIDE.md](docs/GUIDE.md): пошаговое руководство пользователя.
- [docs/mcp.md](docs/mcp.md): дизайн MCP управления агентами и список
  инструментов.
