# ReevesAgents 用户指南

[English](GUIDE.md) · [Deutsch](GUIDE.de.md) · [Français](GUIDE.fr.md) · [Español](GUIDE.es.md) · [Português](GUIDE.pt.md) · [Italiano](GUIDE.it.md) · [Türkçe](GUIDE.tr.md) · [Русский](GUIDE.ru.md) · **简体中文** · [العربية](GUIDE.ar.md)

这份指南从全新安装讲起，一路带你走到让一个智能体替你运行其余智能体的那一步。至于每条命令、每个选项的完整清单，都在 [README](i18n/README.zh-Hans.md) 里。

## ReevesAgents 是什么

- 一个免费的本地工作区，你的 AI 编码智能体（Claude Code、Codex、Hermes、DeepSeek、Kimi 等）在你的机器上并肩干活。
- 有意思的正是这一点：一个智能体可以创建并驱动其余的。把缰绳交给一个 Claude Code 会话，它就会很乐意带一队 Codex 和 Claude Code 智能体，分头处理各自的任务。
- 它架在你已有的 CLI 之上，所以每一份登录信息都待在原来的地方。ReevesAgents 从不持有 API 密钥，也从不碰你的模型流量。
- 它的全部状态就是 `~/.reeves` 下的一点 JSON。没有要跑的数据库，没有要拉的 Docker，后台也没有任何东西守着。

## 开始前

- macOS、Linux 或 WSL（原生 Windows 不是目标；请使用 WSL）。
- Node.js 20.19 或更新版本。
- tmux 3.0 或更新版本。
- 至少一个已安装并登录的提供方 CLI：Claude Code、Codex、OpenCode、Hermes、Kimi、DeepSeek、Pi、Qwen 或 Aider。

## 安装和检查

- 全局安装：`npm install -g reevesagents`
- 检查机器：`reevesagents doctor`（验证 Node、tmux、状态文件夹，以及它能看到哪些提供方 CLI）。
- 启动：`reevesagents`
- 更习惯 pnpm、Yarn、Bun、npx 或 Homebrew？见 README 中的[安装](i18n/README.zh-Hans.md#安装)。

## 第一次运行

最快、也最容易复现的启动方式是命令行。一个运行由一个主控智能体带任意数量的工作者组成，每个智能体写成 `provider[:nickname[:model]]`：

```sh
reevesagents spawn claude-code:lead codex:worker \
  --name "first run" \
  --prompt "Say hello and list the files in this folder."
```

- `claude-code:lead` 是主控，`codex:worker` 是工作者。不指定任何智能体时，运行默认使用 `codex`。
- `--name` 给运行起名，`--cwd` 指定工作目录（默认就是你所在的位置），`--prompt` 会被粘贴进每个智能体。

想要可视化的入口？运行 `reevesagents` 打开 TUI，或者 `reevesagents web` 打开本地 Web UI，在那里把运行建出来。

## 五种使用方式

同一批运行可以从五个界面进去，哪个顺手用哪个：

- **TUI** (`reevesagents`)：多数人常驻的那个终端应用。所有东西都是菜单，方向键就够用了。
- **Web UI** (`reevesagents web`)：同一批运行摆在一个浏览器页面上，随时能实时看进任意一个智能体。它永远只应答回环地址。
- **CLI** (`reevesagents spawn`、`runs`、`peek`、`open`、`stop`)：写脚本时用，也留给你宁愿敲命令也不想开浏览器的那些日子。
- **tmux**：智能体真正住的地方。每个都是自己窗格里的真实 CLI，所以关掉 TUI 或 Web UI，谁都不会被打断。
- **智能体控制** (`reevesagents attach <cli>`)：按需启用的 MCP，让一个智能体驱动其余的。下一节展开讲。

## 让一个智能体驱动其他的

这是核心特性，在你亲手开启之前一直是关的。

- 用 `reevesagents attach claude` 给你的 CLI 开启，或者直接跑一句不带参数的 `reevesagents attach`，把它能托管的所有已安装 CLI 一口气接上。TUI 和 Web UI 里的**智能体控制**界面干的是同一件事。
- `reevesagents hosts` 让你看清现状：机器上有哪些 CLI，其中哪些已经接上了。
- 然后把那个 CLI 重启一次，因为工具只在会话启动时才会被加载（这就是普通的 MCP，一个智能体工具向另一个公开命令的标准方式）。
- 从这一刻起，你的智能体就能把新智能体放到任务上、往它里面打字、读它正在做什么，它请求什么就批准或拒绝什么。

举个完整的例子：附加到 Claude Code，重启，然后在这一个 Claude Code 会话里生成一个 Codex 智能体去处理某个议题，再生成第二个 Claude Code 智能体处理另一个，接着就可以同时观察和调度它们俩。

- 目前能托管它的 CLI：claude、codex、kimi、qwen、opencode、hermes。OpenCode 要手动附加，因为它自己的添加步骤是交互式的。
- 工作者默认拿不到这些工具，所以工作者没法再生成智能体。想让某个工作者驱动自己的子智能体，把 MCP 也附加到那个工作者的 CLI 上。
- 以后想断开：`reevesagents detach claude`。

## 日常任务

- 查看正在运行的内容：`reevesagents runs`（脚本可加 `--json`）。
- 不离开 shell 观察某个智能体：`reevesagents peek <agent> -n 40`。
- 进入某个智能体的 tmux 窗格：`reevesagents open <agent>`。
- 停止整个运行：`reevesagents stop <run> --yes`。
- 停止单个智能体：`reevesagents kill <agent> --yes`。
- 查看智能体在请求什么：`reevesagents approvals`，然后 `approve <id>` 或 `deny <id>`。
- `stop` 和 `kill` 结束工作，各个 `delete` 命令删除已结束的记录。不带 `--yes` 时它们一律拒绝执行。

## 控制成本

- 在最前面放一个便宜甚至免费的模型当路由，只有任务真配得上时才叫醒那个贵的。
- 日常代码和测试正是便宜模型的用武之地。把大模型留给规划和设计，别付钱让它写样板代码。
- 无论这些花了你多少，那都是各家提供方的正常账单。ReevesAgents 自己一分钱都不加。

## 出现问题时

- 先跑 `reevesagents doctor`，它通常会直接替你把问题点出来：Node、tmux、状态文件夹和每个提供方 CLI 都会检查一遍。
- **tmux 缺失：** 装上（`brew install tmux` 或 `apt install tmux`），让 doctor 确认一下。
- **某个提供方没被检测到：** 十有八九是没安装或者没登录。ReevesAgents 只能启动 `PATH` 上并且已登录的东西。
- **Web UI 报告缺少包：** 可选模块 `ws` 和 `@lydell/node-pty` 在安装时被跳过了。按正常方式重装一遍通常就回来了。
- **端口已被占用：** 这不算故障，`reevesagents web` 会自己拿下一个空闲端口并打印 URL。在乎用哪个端口就传 `--port <n>`。
- 更多细节见[故障排查](i18n/README.zh-Hans.md#故障排查)。

## 下一步

- [文档主页](README.md)：完整的文档索引。
- [命令](i18n/README.zh-Hans.md#命令)：全部子命令与标志。
- [智能体控制](i18n/README.zh-Hans.md#智能体控制)：完整的按需启用设计。
- [配置](i18n/README.zh-Hans.md#配置)：`~/.reeves` 下有什么。
- [docs/mcp.md](mcp.md)：智能体控制的设计与工具列表。
