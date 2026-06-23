# AGENTS.md

[English](AGENTS.md) · [Deutsch](AGENTS.de.md) · [Français](AGENTS.fr.md) · [Español](AGENTS.es.md) · [Português](AGENTS.pt.md) · [Italiano](AGENTS.it.md) · [Türkçe](AGENTS.tr.md) · **Русский** · [简体中文](AGENTS.zh-Hans.md) · [العربية](AGENTS.ar.md)

Как AI агент управляет ReevesAgents. Этот файл — справочник оператора для самого инструмента.
Он не влияет на поведение агентов в ваших собственных проектах.

ReevesAgents запускает AI CLI (Claude Code, Codex, Kimi, Qwen, OpenCode, Hermes и другие)
рядом, каждый как реальный CLI в собственном окне tmux. Один агент может создавать,
управлять и контролировать остальных. Состояние живёт в локальном JSON под `~/.reeves`.
Без API-ключей, без базы данных, без фонового демона.

## Два способа использования

1. **Управлять CLI напрямую.** Запустите `reevesagents spawn ...` для запуска агентов, затем
   используйте `runs`, `peek`, `send` и `stop` для наблюдения и управления ими. Хорошо для
   скриптов и одноразовой оркестровки.
2. **Позвольте вашему основному CLI управлять другими через MCP.** `reevesagents attach <cli>`
   даёт этому CLI набор инструментов управления агентами (spawn, send_text, read, kill, ...).
   После перезагрузки CLI одна сессия может создать команду и направить её. Это основная
   функция. См. [docs/mcp.md](docs/mcp.md).

## Сначала проверка настройки

```sh
reevesagents doctor
```

Проверяет tmux, Node, папку состояния `~/.reeves` и какие провайдерские CLI установлены
и совместимы с CLI (проверяет `--help` каждого). Не может проверить, подписан ли CLI,
поэтому установленный, но неавторизованный CLI всё ещё пройдёт здесь. Запустите до spawn,
чтобы run не провалился на отсутствующем CLI; `peek` (ниже) перехватит окно, застрявшее
на экране входа. `reevesagents doctor --json` возвращает то же самое как машиночитаемый JSON.

Требования: Node 20.19+, tmux 3.0+ и хотя бы один установленный и аутентифицированный
провайдерский CLI. macOS, Linux или WSL (нативный Windows не является целью).

## Установка

```sh
pnpm add -g reevesagents     # или: npm install -g reevesagents
```

Запуск без установки: `pnpm dlx reevesagents doctor`.

## Создание агентов

Каждый агент записывается как `provider[:nickname[:model]]`; nickname и model опциональны.
Первый агент — ведущий; остальные — рабочие.

```sh
# Ведущий Claude Code, второй ревьюер Claude Code, два рабочих Codex, один рабочий Kimi.
reevesagents spawn cc:lead cc:review codex:api codex:tests kimi:docs \
  --name "feature x" --skip \
  --prompt "Build feature X. Lead coordinates; each worker takes a slice."
```

Перед запуском spawn проверяет, что каждый именованный провайдерский CLI находится на PATH
и называет любые отсутствующие, так что опечатка или не установленный CLI быстро провалится
вместо половинчатого запуска run'а. При успехе выводит id run'а, id каждого агента и точные
команды `peek`/`send`/`open` для управления ими.

Полезные флаги `spawn`: `--name <run>`, `--cwd <dir>` (по умолчанию текущая папка),
`--prompt <text>` (вставляется в каждого агента при запуске), `--skip` (запустить агентов
без их собственных запросов разрешений; используйте, когда нет человека для одобрения),
`--run <run-id>` (добавить агентов к существующему run вместо запуска нового),
`--json` (напечатать id run'а и агентов как JSON вместо текста).

## Id провайдеров и алиасы

Запустите `reevesagents providers` (добавьте `--json` для машинного списка). Любой алиас
работает как провайдер в спецификации spawn.

| id         | поставщик    | распространённые алиасы     |
| ---------- | ------------ | ----------------------------- |
| `cc`       | Claude Code  | `claude`, `claude-code`     |
| `codex`    | Codex CLI    | `codex-cli`                 |
| `kimi`     | Kimi Code    | `kimi-code`                 |
| `qwen`     | Qwen Code    | `qwen-code`                 |
| `opencode` | OpenCode CLI | `open_code`                 |
| `hermes`   | Hermes       |                             |
| `pi`       | Pi           |                             |
| `aider`    | Aider        |                             |
| `deepseek` | DeepSeek CLI | `deepseek-cli`              |

## Наблюдение и управление запущенными агентами

```sh
reevesagents runs                      # список активных run'ов (добавьте --json для скриптов)
reevesagents agents <run-id>           # список агентов в одном run'е
reevesagents peek <agent-id> -n 40     # недавний вывод от одного агента
reevesagents send <agent-id> "do X"    # вставить текст в приглашение агента
reevesagents key <agent-id> enter      # отправить его (send не отправляет самостоятельно)
reevesagents interrupt <agent-id>      # ctrl-c агента
reevesagents open <run-id|agent-id>    # перейти в его окно tmux
```

`send` только вставляет; следуйте за ним с `key <agent-id> enter` для отправки. Клавиши,
принимаемые `key`: `enter`, `escape`, `backspace`, `tab`, `space`, `up`, `down`, `left`, `right`,
`ctrl-c`.

## Чистая остановка

```sh
reevesagents stop <run-id> --yes       # завершить весь run и разобрать его сессию tmux
reevesagents kill <agent-id> --yes     # завершить одного агента
```

`stop` и `kill` — единственные деструктивные команды, так что они отказываются работать без `--yes`.

## Практический пример: пять агентов, потом управляйте ими

Сценарий "установить reevesagents, создать двух Claude, двух Codex и одного Kimi, и поставить
их работать" от начала до конца.

```sh
# 1. Подтвердите, что пять CLI установлены и совместимы.
reevesagents doctor

# 2. Запустите команду. --skip чтобы рабочие не останавливались на своих собственных запросах разрешений.
reevesagents spawn cc:lead cc:review codex:api codex:tests kimi:docs \
  --name "feature x" --skip \
  --prompt "Build feature X. Lead coordinates; each worker owns one slice."

# 3. spawn выводит каждый id агента. Перечислите все или прочитайте один.
reevesagents agents <run-id>
reevesagents peek <agent-id> -n 40

# 4. Управляйте: вставьте сообщение, потом отправьте его.
reevesagents send <agent-id> "rebase on main, then run the tests"
reevesagents key  <agent-id> enter

# 5. Добавьте рабочего к тому же run'у позже.
reevesagents spawn codex:perf --run <run-id> --skip --prompt "profile the hot path"

# 6. Завершите run когда закончите.
reevesagents stop <run-id> --yes
```

Управляя из основного CLI через MCP вместо оболочки, тот же сценарий — одна инструкция:
"Используйте reevesagents для запуска команды, ведущего Claude Code, второго ревьюера Claude Code,
двух рабочих Codex (api и tests) и рабочего Kimi для документации. Пропустите запросы разрешений,
дайте им задачу, потом наблюдайте и докладывайте прогресс." Основной CLI вызывает инструменты
spawn/read/send сам. См. [docs/mcp.md](docs/mcp.md).

## Делайте и не делайте

Делайте:

- Запустите `doctor` перед spawn и убедитесь, что каждый провайдер, который вы называете,
  установлен **и подписан**. doctor не может проверить подпись; если окно зависает,
  `peek` показывает экран входа.
- Относитесь к `spawn` как fire-and-forget. Он возвращает id, не ответы. Опрашивайте с `runs`,
  `agents <run-id>` и `peek <agent-id> -n 40` чтобы увидеть, что делает команда.
- Отправляйте ввод в два этапа: `send <agent-id> "..."` вставляет, `key <agent-id> enter` отправляет.
- Передавайте `--skip` когда никакой человек не будет сидеть и одобрять подсказки, иначе рабочие
  зависнут на первой.
- Используйте `--json` (на `spawn`, `runs`, `agents`, `providers`, `doctor`) когда скрипт или
  агент нуждаются в чтении id и состояния вместо текста.
- Называйте поставщиков по id или любому алиасу из `reevesagents providers` (`cc` или `claude`,
  `codex`, `kimi`, ...).

Не делайте:

- Не ожидайте, что `spawn` вернёт результат агента; запустите команду, потом прочитайте его.
- Не `send` и не предполагайте, что это запустилось; ничего не отправляется, пока вы не `key <agent-id> enter`.
- Не создавайте провайдера, который отсутствует или не подписан; spawn отказывает первое, и второе
  оставляет окно припаркованным на экране входа, который никогда не выполняет работу.
- Не запускайте `stop` или `kill` без `--yes`; это единственные деструктивные команды.
- Не нацеливайтесь на нативный Windows; запускайте внутри WSL с tmux и установленными там CLI.
- Не вставляйте секреты в `--prompt` или `send`; вывод захватывается и показывается через
  `peek` и веб UI.

## Примечания по скриптам

- `spawn`, `runs`, `agents`, `providers` и `doctor` все принимают `--json`.
- `spawn --json` выводит id run'а и каждый id агента; захватите их или прочитайте их обратно
  из `runs --json` и `agents <run-id> --json`.
- Переопределите папку состояния с `REEVES_REGISTRY` и файл конфигурации с `REEVES_CONFIG`
  чтобы держать скриптовый run изолированным от `~/.reeves`.

## Дальше

- [README](README.md): полный тур функций и каждая команда.
- [docs/GUIDE.md](docs/GUIDE.md): пошаговое руководство пользователя.
- [docs/mcp.md](docs/mcp.md): дизайн управления агентом и список инструментов.
