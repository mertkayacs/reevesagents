# AGENTS.md

[English](AGENTS.md) · [Deutsch](AGENTS.de.md) · [Français](AGENTS.fr.md) · [Español](AGENTS.es.md) · [Português](AGENTS.pt.md) · [Italiano](AGENTS.it.md) · [Türkçe](AGENTS.tr.md) · [Русский](AGENTS.ru.md) · **简体中文** · [العربية](AGENTS.ar.md)

AI 编码智能体如何驱动 ReevesAgents。此文件是该工具本身的操作员指南。它不会改变智能体在你自己项目中的行为方式。

ReevesAgents 运行 AI 编码 CLI（如 Claude Code、Codex、Kimi、Qwen、OpenCode、Hermes 等），每个都作为其自身 tmux 窗口中的真实 CLI 并行运行。一个智能体可以生成、控制和监督其余的。状态保存在 `~/.reeves` 下的本地 JSON 中。无需 API 密钥、无需数据库、无需后台守护进程。

## 两种使用方式

1. **直接驱动 CLI。** 运行 `reevesagents spawn ...` 来启动智能体，然后用 `runs`、`peek`、`send` 和 `stop` 来观察和控制它们。适合脚本和一次性编排。
2. **让你的主控 CLI 通过 MCP 驱动其他的。** `reevesagents attach <cli>` 给该 CLI 一组智能体控制工具（spawn、send_text、read、kill 等）。重启 CLI 后，单个会话可以生成一个团队并指挥它。这是核心功能。见 [docs/mcp.md](docs/mcp.md)。

## 先做设置检查

```sh
reevesagents doctor
```

报告 tmux、Node、`~/.reeves` 状态目录，以及哪些提供方 CLI 已安装并兼容 CLI（它检查每个 CLI 的 `--help`）。它无法测试某个 CLI 是否已登录，所以已安装但未登录的 CLI 仍然通过这里。生成前运行它，这样生成就不会因为缺失 CLI 而失败；`peek`（见下文）会捕捉窗口停在登录屏幕的情况。`reevesagents doctor --json` 以机器可读 JSON 返回相同内容。

要求：Node 20.19+、tmux 3.0+，以及至少一个已安装并认证的提供方 CLI。macOS、Linux 或 WSL（原生 Windows 不是目标）。

## 安装

```sh
pnpm add -g reevesagents     # 或：npm install -g reevesagents
```

无安装运行：`pnpm dlx reevesagents doctor`。

## 生成智能体

每个智能体写作 `provider[:nickname[:model]]`；nickname 和 model 是可选的。第一个智能体是主控；其余的作为工作者加入它。

```sh
# 一个 Claude Code 主控、一个第二个 Claude Code 审阅者、两个 Codex 工作者、一个 Kimi 工作者。
reevesagents spawn cc:lead cc:review codex:api codex:tests kimi:docs \
  --name "feature x" --skip \
  --prompt "Build feature X. Lead coordinates; each worker takes a slice."
```

在启动任何东西之前，`spawn` 检查每个已命名的提供方 CLI 是否在 PATH 上，并列出任何缺失的，所以一个拼写错误或未安装的 CLI 快速失败而不是半启动一个运行。成功后，它打印运行 id、每个智能体的 id，以及精确的 `peek`/`send`/`open` 命令来驱动它们。

有用的 `spawn` 标志：`--name <run>`、`--cwd <dir>`（默认当前目录）、`--prompt <text>`（粘贴到每个智能体的启动）、`--skip`（启动智能体而无需它们自己的权限提示；当没有人在那里批准时使用）、`--run <run-id>`（将智能体添加到现有运行而不是启动新的）、`--json`（以 JSON 而不是文本打印运行和智能体 id）。

## 提供方 id 和别名

运行 `reevesagents providers`（添加 `--json` 获得机器列表）。任何别名都可以作为生成 spec 中的提供方。

| id         | 提供方     | 常见别名                    |
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

## 观察和控制正在运行的智能体

```sh
reevesagents runs                      # 列出活跃运行（添加 --json 供脚本使用）
reevesagents agents <run-id>           # 列出一个运行中的智能体
reevesagents peek <agent-id> -n 40     # 一个智能体的最近输出
reevesagents send <agent-id> "do X"    # 在智能体提示符处粘贴文本
reevesagents key <agent-id> enter      # 提交它（send 本身不提交）
reevesagents interrupt <agent-id>      # 对智能体按 ctrl-c
reevesagents open <run-id|agent-id>    # 跳到它的 tmux 窗口
```

`send` 仅粘贴；后跟 `key <agent-id> enter` 来提交。`key` 接受的按键：`enter`、`escape`、`backspace`、`tab`、`space`、`up`、`down`、`left`、`right`、`ctrl-c`。

## 干净地停止

```sh
reevesagents stop <run-id> --yes       # 结束整个运行并撕下其 tmux 会话
reevesagents kill <agent-id> --yes     # 结束一个智能体
```

`stop` 和 `kill` 是仅有的破坏性命令，所以它们拒绝不带 `--yes` 的运行。

## 一个实际例子：五个智能体，然后驱动它们

场景"安装 reevesagents，生成两个 Claude、两个 Codex 和一个 Kimi，并让它们工作"从头到尾。

```sh
# 1. 确认五个 CLI 已安装并兼容。
reevesagents doctor

# 2. 启动团队。--skip 使得工作者不会因为它们自己的权限提示而停止。
reevesagents spawn cc:lead cc:review codex:api codex:tests kimi:docs \
  --name "feature x" --skip \
  --prompt "Build feature X. Lead coordinates; each worker owns one slice."

# 3. spawn 打印每个智能体 id。列出它们全部，或读取一个。
reevesagents agents <run-id>
reevesagents peek <agent-id> -n 40

# 4. 控制：粘贴一条消息，然后提交它。
reevesagents send <agent-id> "rebase on main, then run the tests"
reevesagents key  <agent-id> enter

# 5. 稍后向同一运行添加一个工作者。
reevesagents spawn codex:perf --run <run-id> --skip --prompt "profile the hot path"

# 6. 完成时结束运行。
reevesagents stop <run-id> --yes
```

通过 MCP 从主控 CLI 驱动而不是从 shell，同样的场景是一条指令："使用 reevesagents 启动一个团队，一个 Claude Code 主控、一个第二个 Claude Code 审阅者、两个 Codex 工作者（api 和 tests）和一个 Kimi 工作者用于 docs。跳过权限提示，给他们简介，然后观察并报告进度。"主控调用生成/读取/发送工具本身。见 [docs/mcp.md](docs/mcp.md)。

## 做与不做

做：

- 生成前运行 `doctor`，并确保每个你命名的提供方都已安装**并已登录**。doctor 无法测试登录；如果窗口停滞，`peek` 显示登录屏幕。
- 把 `spawn` 当作一劳永逸。它返回 id，不是答案。用 `runs`、`agents <run-id>` 和 `peek <agent-id> -n 40` 轮询来看一个团队在做什么。
- 分两步提交输入：`send <agent-id> "..."` 粘贴，`key <agent-id> enter` 提交。
- 当没有人会坐着批准提示，或工作者会在第一个提示处停滞时，传入 `--skip`。
- 当脚本或智能体需要读取 id 和状态而不是文本时，使用 `--json`（在 `spawn`、`runs`、`agents`、`providers`、`doctor` 上）。
- 按 id 或 `reevesagents providers` 中的任何别名来命名提供方（`cc` 或 `claude`、`codex`、`kimi` 等）。

不做：

- 不要期望 `spawn` 交回智能体的结果；启动团队，然后读取它。
- 不要 `send` 并假设它运行了；除非你 `key <agent-id> enter`，否则什么都不提交。
- 不要生成缺失或未登录的提供方；生成拒绝前者，后者留下一个窗口停在登录提示处而永远不做工作。
- 不要不带 `--yes` 运行 `stop` 或 `kill`；它们是仅有的破坏性命令。
- 不要针对原生 Windows；在 WSL 中运行，使用 tmux 和那里安装的 CLI。
- 不要把秘密粘贴到 `--prompt` 或 `send`；输出被捕捉并通过 `peek` 和 Web UI 显示。

## 脚本笔记

- `spawn`、`runs`、`agents`、`providers` 和 `doctor` 都接受 `--json`。
- `spawn --json` 打印运行 id 和每个智能体 id；捕捉那些，或从 `runs --json` 和 `agents <run-id> --json` 读回它们。
- 用 `REEVES_REGISTRY` 覆盖状态目录，用 `REEVES_CONFIG` 覆盖配置文件，以保持脚本化运行与 `~/.reeves` 隔离。

## 更多

- [README](README.md)：完整功能游览和每条命令。
- [docs/GUIDE.md](docs/GUIDE.md)：循序渐进用户指南。
- [docs/mcp.md](docs/mcp.md)：智能体控制 MCP 设计和工具列表。
