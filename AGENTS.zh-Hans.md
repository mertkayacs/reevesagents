# AGENTS.md

[English](AGENTS.md) · [Deutsch](AGENTS.de.md) · [Français](AGENTS.fr.md) · [Español](AGENTS.es.md) · [Português](AGENTS.pt.md) · [Italiano](AGENTS.it.md) · [Türkçe](AGENTS.tr.md) · [Русский](AGENTS.ru.md) · **简体中文** · [العربية](AGENTS.ar.md)

AI 编码智能体如何驱动 ReevesAgents。本文件是这个工具本身的操作手册，不会改变智能体在你自己项目中的行为。

ReevesAgents 让 AI 编码 CLI（Claude Code、Codex、Kimi、Qwen、OpenCode、Hermes 等）并行运行，每个都是自己 tmux 窗口里的真实 CLI。一个智能体可以生成、控制并监督其余的。状态保存在 `~/.reeves` 下的本地 JSON 中。没有 API 密钥、没有数据库、没有后台守护进程。

## 两种使用方式

1. **直接驱动 CLI。** 运行 `reevesagents spawn ...` 启动智能体，再用 `runs`、`peek`、`send` 和 `stop` 观察和控制它们。适合脚本和一次性编排。
2. **让宿主 CLI 通过 MCP 驱动其他 CLI。** `reevesagents attach <cli>` 给该 CLI 一组智能体控制工具（spawn、send_text、read、kill 等）。重启该 CLI 后，一个会话就能生成并指挥整个团队。这是核心功能。见 [docs/mcp.md](docs/mcp.md)。

## 先做设置检查

```sh
reevesagents doctor
```

它报告 tmux、Node、`~/.reeves` 状态目录，以及哪些提供方 CLI 已安装且兼容（它会检查每个 CLI 的 `--help`）。它测不出 CLI 是否已登录，所以已安装但未登录的 CLI 在这里也会通过。生成智能体前先运行它，运行就不会因为缺少 CLI 而失败；`peek`（见下文）能发现停在登录界面的窗口。`reevesagents doctor --json` 以机器可读的 JSON 返回同样的内容。

要求：Node 20.19+、tmux 3.0+，以及至少一个已安装并完成认证的提供方 CLI。macOS、Linux 或 WSL（原生 Windows 不是目标）。

## 安装

```sh
pnpm add -g reevesagents     # 或：npm install -g reevesagents
```

免安装运行：`pnpm dlx reevesagents doctor`。

## 生成智能体

每个智能体的写法是 `provider[:nickname[:model]]`；nickname 和 model 可选。第一个智能体是运行的主控，其余作为工作者加入。

```sh
# 一个 Claude Code 主控、第二个 Claude Code 负责审阅、两个 Codex 工作者、一个 Kimi 工作者。
reevesagents spawn cc:lead cc:review codex:api codex:tests kimi:docs \
  --name "feature x" --skip \
  --prompt "Build feature X. Lead coordinates; each worker takes a slice."
```

`spawn` 在启动任何东西之前，会检查每个点名的提供方 CLI 是否在 PATH 上，并列出缺失的那些，因此拼写错误或未安装的 CLI 会让它快速失败，而不是把运行启动到一半。成功时它会打印运行 id、每个智能体的 id，以及驱动它们用的确切 `peek`/`send`/`open` 命令。

常用的 `spawn` 标志：`--name <run>`、`--cwd <dir>`（默认当前目录）、`--prompt <text>`（启动时粘贴进每个智能体）、`--skip`（跳过各智能体自己的权限提示；没有人在旁边批准时使用）、`--run <run-id>`（把智能体加进现有运行，而不是新建一个）、`--json`（以 JSON 而非文本打印运行和智能体 id）。

## 提供方 id 和别名

运行 `reevesagents providers`（加 `--json` 得到机器可读列表）。spawn spec 里的提供方可以用任意别名。

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
reevesagents runs                      # 列出活跃运行（脚本可加 --json）
reevesagents agents <run-id>           # 列出一个运行中的智能体
reevesagents peek <agent-id> -n 40     # 某个智能体的最近输出
reevesagents send <agent-id> "do X"    # 在智能体提示符处粘贴文本
reevesagents key <agent-id> enter      # 提交（send 本身不提交）
reevesagents interrupt <agent-id>      # 向该智能体发送 ctrl-c
reevesagents open <run-id|agent-id>    # 跳到它的 tmux 窗口
reevesagents approvals                 # 待处理的审批请求（可加 --json）
reevesagents approve <approval-id>     # 批准一个；deny <approval-id> 则拒绝
```

`send` 只负责粘贴；随后用 `key <agent-id> enter` 提交。`key` 接受的按键：`enter`、`escape`、`backspace`、`tab`、`space`、`up`、`down`、`left`、`right`、`ctrl-c`。

## 干净地停止

```sh
reevesagents stop <run-id> --yes       # 结束整个运行并拆除其 tmux 会话
reevesagents kill <agent-id> --yes     # 结束一个智能体
```

`stop` 和 `kill` 不带 `--yes` 时拒绝执行。清理命令也走同一道闸门：`delete <agent-id>` 和 `delete-run <run-id>` 删除已结束的记录，`delete-history <id>` 删除一条归档记录。

## 一个实际例子：五个智能体，然后驱动它们

把“安装 reevesagents，生成两个 Claude、两个 Codex 和一个 Kimi，并让它们干活”这个场景从头到尾走一遍。

```sh
# 1. 确认这五个 CLI 已安装且兼容。
reevesagents doctor

# 2. 启动团队。--skip 让工作者不会停在各自的权限提示上。
reevesagents spawn cc:lead cc:review codex:api codex:tests kimi:docs \
  --name "feature x" --skip \
  --prompt "Build feature X. Lead coordinates; each worker owns one slice."

# 3. spawn 会打印每个智能体的 id。列出全部，或查看某一个。
reevesagents agents <run-id>
reevesagents peek <agent-id> -n 40

# 4. 控制：先粘贴一条消息，再提交。
reevesagents send <agent-id> "rebase on main, then run the tests"
reevesagents key  <agent-id> enter

# 5. 之后再往同一个运行里加一个工作者。
reevesagents spawn codex:perf --run <run-id> --skip --prompt "profile the hot path"

# 6. 完成后结束运行。
reevesagents stop <run-id> --yes
```

改由宿主 CLI 通过 MCP 驱动而不是在 shell 里操作时，同一场景就是一条指令：“用 reevesagents 启动一个团队：一个 Claude Code 主控、第二个 Claude Code 负责审阅、两个 Codex 工作者（api 和 tests）、一个负责 docs 的 Kimi 工作者。跳过权限提示，把任务简报发给它们，然后观察并汇报进度。”宿主 CLI 会自行调用 spawn/read/send 工具。见 [docs/mcp.md](docs/mcp.md)。

## 做与不做

做：

- 生成前先运行 `doctor`，并确认点名的每个提供方都已安装**且已登录**。doctor 测不出登录状态；窗口卡住时，`peek` 会显示出登录界面。
- 把 `spawn` 当成只管启动、不等结果的命令。它返回的是 id，不是答案。用 `runs`、`agents <run-id>` 和 `peek <agent-id> -n 40` 轮询，看团队在做什么。
- 分两步提交输入：`send <agent-id> "..."` 粘贴，`key <agent-id> enter` 提交。
- 没有人守着批准提示时传入 `--skip`，否则工作者会卡在第一个提示上。
- 脚本或智能体需要读取 id 和状态而不是文本时，用 `--json`（`spawn`、`runs`、`agents`、`providers`、`doctor` 都支持）。
- 用 id 或 `reevesagents providers` 里的任意别名指定提供方（`cc` 或 `claude`、`codex`、`kimi` 等）。

不要：

- 不要指望 `spawn` 交回智能体的结果；先启动团队，再去读输出。
- 不要 `send` 完就当它执行了；在你 `key <agent-id> enter` 之前，什么都不会提交。
- 不要生成缺失或未登录的提供方；前者会被 spawn 直接拒绝，后者会留下一个停在登录提示上的窗口，永远不干活。
- 不要不带 `--yes` 运行 `stop`、`kill` 或各个 `delete` 命令；它们是破坏性命令。
- 不要在原生 Windows 上运行；请在 WSL 里使用，并在其中装好 tmux 和各个 CLI。
- 不要把机密粘贴进 `--prompt` 或 `send`；输出会被捕获，并通过 `peek` 和 Web UI 展示。

## 脚本化要点

- `spawn`、`runs`、`agents`、`providers` 和 `doctor` 都接受 `--json`。
- `spawn --json` 会打印运行 id 和每个智能体的 id；把它们记下来，或稍后从 `runs --json` 和 `agents <run-id> --json` 读回。
- 用 `REEVES_REGISTRY` 覆盖状态目录、`REEVES_CONFIG` 覆盖配置文件，让脚本化运行与 `~/.reeves` 相互隔离。

## 更多

- [README](README.md)：完整的功能介绍和全部命令。
- [docs/GUIDE.md](docs/GUIDE.md)：分步用户指南。
- [docs/mcp.md](docs/mcp.md)：智能体控制 MCP 的设计与工具列表。
