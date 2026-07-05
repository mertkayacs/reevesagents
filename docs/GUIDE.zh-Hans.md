# ReevesAgents 用户指南

[English](GUIDE.md) · [Deutsch](GUIDE.de.md) · [Français](GUIDE.fr.md) · [Español](GUIDE.es.md) · [Português](GUIDE.pt.md) · [Italiano](GUIDE.it.md) · [Türkçe](GUIDE.tr.md) · [Русский](GUIDE.ru.md) · **简体中文** · [العربية](GUIDE.ar.md)

一份简明的分步教程：完成安装、跑通第一个运行，再让一个智能体驱动其余的。完整的命令与选项参考见 [README](i18n/README.zh-Hans.md)。

## ReevesAgents 是什么

- 面向 AI 编码智能体（Claude Code、Codex、Hermes、DeepSeek、Kimi 等）的免费本地工作区，它们在你的机器上并行运行。
- 核心理念：一个智能体创建并驱动其余的。一个 Claude Code 智能体可以启动并指挥一队 Codex 和 Claude Code 智能体，各自处理不同任务。
- 它跑在你已有的真实 CLI 之上。提供方登录信息留在各自的 CLI 中。ReevesAgents 不存储 API 密钥，也从不代理你的模型流量。
- 没有数据库、没有 Docker、没有后台服务。状态是 `~/.reeves` 下的本地 JSON。

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

从命令行启动最快，也最容易复现。一个运行有一个主控智能体和任意数量的工作者；每个智能体的写法是 `provider[:nickname[:model]]`：

```sh
reevesagents spawn claude-code:lead codex:worker \
  --name "first run" \
  --prompt "Say hello and list the files in this folder."
```

- `claude-code:lead` 是主控，`codex:worker` 是工作者。不指定任何智能体时，运行默认使用 `codex`。
- `--name` 给运行命名，`--cwd` 设置工作目录（默认当前所在目录），`--prompt` 会被粘贴进每个智能体。

想要可视化的入口？运行 `reevesagents` 打开 TUI，或 `reevesagents web` 打开本地 Web UI，在那里创建运行。

## 五种使用方式

同一批运行可以从五个界面操作，哪个合适用哪个：

- **TUI** (`reevesagents`)：在终端内以键盘优先的方式快速控制。
- **Web UI** (`reevesagents web`)：一个可视化视图，查看运行、智能体、实时窗格和历史。本地且仅限回环。
- **CLI** (`reevesagents spawn`、`runs`、`peek`、`open`、`stop`)：脚本、快捷命令和健康检查。
- **tmux**：每个智能体都是自己 tmux 窗格里的真实 CLI，因此即使关闭 TUI 或 Web UI，会话仍在本地继续运行。
- **智能体控制** (`reevesagents attach <cli>`)：按需启用的 MCP，让一个智能体驱动其余的。下一节详细介绍。

## 让一个智能体驱动其他的

这是核心特性，在你开启之前一直保持关闭。

- 为你的 CLI 开启：`reevesagents attach claude`（或用 `reevesagents attach` 连接它能托管的所有已安装 CLI）。也可以在 TUI 或 Web UI 的**智能体控制**界面完成。
- 确认一下：`reevesagents hosts` 列出你机器上的 CLI，并显示哪些已连接。
- 重新加载你的 CLI：重启会话让它加载新工具（底层是 MCP，即一个智能体工具向另一个公开命令的标准方式）。
- 现在你的智能体就能创建并驱动其他智能体：让一个智能体开始某项任务、向它发送文本或按键、查看它在做什么、批准或拒绝它的请求。

一个完整的例子：连接 Claude Code 并重启，然后在同一个 Claude Code 会话里，你可以生成一个处理某个议题的 Codex 智能体，再生成处理另一个议题的第二个 Claude Code 智能体，随后同时观察和控制两者。

- 目前能托管它的 CLI：claude、codex、kimi、qwen、opencode、hermes。OpenCode 需要手动连接，因为它自己的添加步骤是交互式的。
- 工作者默认拿不到这些工具，因此无法继续生成智能体。要让某个工作者驱动自己的子智能体，把 MCP 也连接到该工作者的 CLI。
- 以后要断开：`reevesagents detach claude`。

## 日常任务

- 查看正在运行的内容：`reevesagents runs`（脚本可加 `--json`）。
- 不离开 shell 观察某个智能体：`reevesagents peek <agent> -n 40`。
- 进入某个智能体的 tmux 窗格：`reevesagents open <agent>`。
- 停止整个运行：`reevesagents stop <run> --yes`。
- 停止单个智能体：`reevesagents kill <agent> --yes`。
- 查看智能体在请求什么：`reevesagents approvals`，然后 `approve <id>` 或 `deny <id>`。
- `stop` 和 `kill` 结束工作，各个 `delete` 命令删除已结束的记录。不带 `--yes` 时它们一律拒绝执行。

## 控制成本

- 让一个便宜或免费的模型在前面分派工作，只在必要时才把重活交给更强的智能体。
- 让便宜的模型写日常代码和测试，你用更大的模型做规划和设计，而不是什么都走一个昂贵的默认模型。
- 提供方的配额和账单留在各自的 CLI 里。ReevesAgents 自身不增加任何成本。

## 出现问题时

- 先运行 `reevesagents doctor`。它会检查 Node、tmux、状态文件夹和你的提供方 CLI，并指出哪里失败了。
- **tmux 缺失：** 安装它（`brew install tmux` 或 `apt install tmux`），再运行一次 doctor。
- **某个提供方未被检测到：** ReevesAgents 只启动位于 `PATH` 上且已登录的 CLI。安装或登录该 CLI。
- **Web UI 报告缺少包：** 它需要 `ws` 和 `@lydell/node-pty`。启用可选依赖重新安装。
- **端口已被占用：** `reevesagents web` 从 `8080` 启动，被占用时退到下一个空闲端口；传入 `--port <n>` 另选一个。
- 更多细节见[故障排查](i18n/README.zh-Hans.md#故障排查)。

## 下一步

- [文档主页](README.md)：完整的文档索引。
- [命令](i18n/README.zh-Hans.md#命令)：全部子命令与标志。
- [智能体控制](i18n/README.zh-Hans.md#智能体控制)：完整的按需启用设计。
- [配置](i18n/README.zh-Hans.md#配置)：`~/.reeves` 下有什么。
- [docs/mcp.md](mcp.md)：智能体控制的设计与工具列表。
