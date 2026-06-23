# ReevesAgents 用户指南

[English](GUIDE.md) · [Deutsch](GUIDE.de.md) · [Français](GUIDE.fr.md) · [Español](GUIDE.es.md) · [Português](GUIDE.pt.md) · [Italiano](GUIDE.it.md) · [Türkçe](GUIDE.tr.md) · [Русский](GUIDE.ru.md) · **简体中文** · [العربية](GUIDE.ar.md)

一个简明的循序渐进式教程：安装它、进行第一次运行，然后让一个智能体驱动其他的。完整的命令和选项参考，见 [README](../README.zh-Hans.md)。

## ReevesAgents 是什么

- 一个免费的本地工作区，用于 AI 编码智能体（Claude Code、Codex、Hermes、DeepSeek、Kimi 等）。它们在你的机器上并行运行。
- 核心理念：一个智能体创建并驱动其他的。一个 Claude Code 智能体可以启动并控制一个由 Codex 和 Claude Code 智能体组成的团队，分别完成不同的任务。
- 它运行在你已有的真实 CLI 之上。提供方登录信息留在各自的 CLI 中。ReevesAgents 不存储 API 密钥，也不代理你的模型流量。
- 没有数据库、没有 Docker、没有后台服务。状态是 `~/.reeves` 下的本地 JSON。

## 开始前

- macOS、Linux 或 WSL（原生 Windows 不是目标；请使用 WSL）。
- Node.js 20.19 或更新版本。
- tmux 3.0 或更新版本。
- 至少一个已安装并登录的提供方 CLI：Claude Code、Codex、OpenCode、Hermes、Kimi、DeepSeek、Pi、Qwen 或 Aider。

## 安装和检查

- 全局安装它：`npm install -g reevesagents`
- 检查你的机器：`reevesagents doctor`（验证 Node、tmux、状态文件夹，以及它能检测到哪些提供方 CLI）。
- 启动它：`reevesagents`
- 倾向于 pnpm、Yarn、Bun、npx 或 Homebrew？见 README 中的 [安装](../README.zh-Hans.md#安装)。

## 第一次运行

最快的可复现运行是从命令行进行。一个运行包含一个主控智能体和任意数量的工作者；每个智能体的写法为 `provider[:nickname[:model]]`：

```sh
reevesagents spawn claude-code:lead codex:worker \
  --name "first run" \
  --prompt "Say hello and list the files in this folder."
```

- `claude-code:lead` 是主控，`codex:worker` 是工作者。不指定智能体名称时，运行默认为 `codex`。
- `--name` 标记运行名称，`--cwd` 设置工作目录（默认为当前位置），`--prompt` 会被粘贴到每个智能体中。

倾向于可视化的开始？运行 `reevesagents` 启动 TUI 或 `reevesagents web` 启动本地 Web UI，然后从那里创建运行。

## 四种使用方式

你可以通过四个界面访问同一运行。选择任何适合当下的方式：

- **TUI** (`reevesagents`)：在终端内进行快速、键盘优先的控制。
- **Web UI** (`reevesagents web`)：一个可视化视图，查看运行、智能体、实时窗格和历史。本地且仅限回环。
- **CLI** (`reevesagents spawn`、`runs`、`peek`、`open`、`stop`)：脚本、快速命令和健康检查。
- **tmux**：每个智能体是其自身 tmux 窗格中的真实 CLI，所以会话在你关闭 TUI 或 Web UI 后仍在本地持续运行。

## 让一个智能体驱动其他的

这是核心特性，默认关闭。

- 为你的 CLI 打开它：`reevesagents attach claude`（或 `reevesagents attach` 来连接它能托管的所有已安装的 CLI）。你也可以从 TUI 或 Web UI 的 **智能体控制** 屏幕做这件事。
- 确认它：`reevesagents hosts` 列出你机器上的 CLI，并显示哪些已连接。
- 重新加载你的 CLI：重启会话以便它获取新工具（这使用 MCP，即一个智能体工具向另一个公开命令的标准方式）。
- 现在你的智能体可以创建并驱动其他智能体：在一个任务上启动一个智能体、向它发送文本或按键、读取它在做什么，以及批准或拒绝它的请求。

一个实际例子：连接到 Claude Code，重启它，然后在一个 Claude Code 会话内你可以在一个议题上生成一个 Codex 智能体，在另一个议题上生成第二个 Claude Code 智能体，然后观察并控制两者。

- 能今天托管这个的 CLI：claude、codex、kimi、qwen、opencode、hermes。OpenCode 需要手工连接，因为它自己的添加步骤是交互式的。
- 工作者默认不会获得这些工具，所以工作者无法生成更多智能体。要让工作者驱动自己的子智能体，也把 MCP 连接到该工作者的 CLI。
- 要稍后断开连接：`reevesagents detach claude`。

## 日常任务

- 查看运行中的内容：`reevesagents runs`（添加 `--json` 供脚本使用）。
- 监看一个智能体，不离开你的 shell：`reevesagents peek <agent> -n 40`。
- 跳进一个智能体的 tmux 窗格：`reevesagents open <agent>`。
- 停止整个运行：`reevesagents stop <run> --yes`。
- 停止单个智能体：`reevesagents kill <agent> --yes`。
- `stop` 和 `kill` 是仅有的结束工作的命令，所以它们拒绝不带 `--yes` 的运行。

## 控制成本

- 在前面放一个便宜或免费的模型来路由工作，仅当需要时才把重任务交给更强大的智能体。
- 让便宜的模型写日常代码和测试，同时你用更大的模型来规划和设计，而不是把所有事都推送到一个昂贵的默认模型。
- 提供方配额和账单留在各自的 CLI 中。ReevesAgents 自身不增加成本。

## 当某些东西看起来不对时

- 先运行 `reevesagents doctor`。它检查 Node、tmux、状态文件夹和你的提供方 CLI，并告诉你什么失败了。
- **tmux 缺失：** 安装它（`brew install tmux` 或 `apt install tmux`）然后再运行 doctor。
- **某个提供方未被检测到：** ReevesAgents 仅启动那些在你的 `PATH` 上且已登录的 CLI。安装或登录那个 CLI。
- **Web UI 报告缺少包：** 它需要 `ws` 和 `@lydell/node-pty`。在启用可选依赖的情况下重新安装。
- **端口已在使用：** `reevesagents web` 在 `8080` 启动，被占用时会退回到下一个空闲端口；传入 `--port <n>` 来选择另一个。
- 更多细节见 [故障排查](../README.zh-Hans.md#故障排查)。

## 接下来去哪里

- [文档主页](README.md)：完整的文档索引。
- [命令](../README.zh-Hans.md#命令)：每个子命令和标志。
- [智能体控制](../README.zh-Hans.md#智能体控制)：完整的选择加入模型。
- [配置](../README.zh-Hans.md#配置)：`~/.reeves` 下有什么。
- [docs/mcp.md](mcp.md)：智能体控制的设计和工具列表。
