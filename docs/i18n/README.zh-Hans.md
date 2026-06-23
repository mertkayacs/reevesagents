<p align="center">
  <img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-header.gif" alt="ReevesAgents" width="800" />
</p>

[![npm version](https://img.shields.io/npm/v/reevesagents.svg)](https://www.npmjs.com/package/reevesagents)
[![visits](https://visitor-badge.laobi.icu/badge?page_id=mertkayacs.reevesagents&left_text=visits)](https://github.com/mertkayacs/reevesagents)
[![node](https://img.shields.io/node/v/reevesagents.svg)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/reevesagents.svg)](../../LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/mertkayacs/reevesagents/test.yml?branch=master&label=CI)](https://github.com/mertkayacs/reevesagents/actions/workflows/test.yml)

[English](../../README.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português](README.pt.md) · [Italiano](README.it.md) · [Türkçe](README.tr.md) · [Русский](README.ru.md) · **简体中文** · [العربية](README.ar.md)

*让一个智能体创建并控制其他智能体。一个本地、以 tmux 为先的工作区，从 TUI、Web UI、CLI 和 MCP 生成并驱动各类智能体（Claude Code、Codex、Hermes、DeepSeek、Kimi 等）。无需 API 密钥，无需改动你的 Agent.md 或 Claude.md。*

**支持 10 余种语言！**

GitHub: https://github.com/mertkayacs/reevesagents

TUI 与本地 Web UI 同时驱动同一个运行：

![ReevesAgents TUI：语言选择器、欢迎界面与运行列表](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-tui.gif)

![ReevesAgents Web UI：一个实时的多智能体运行](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-web.png)

ReevesAgents 是一个面向 AI CLI 智能体的免费开源工作区管理器。可同时运行多个智能体，并通过 MCP 让一个智能体生成并驱动其他智能体：一个 Claude Code 智能体在不同议题上管理多个 Codex 和 Claude Code 智能体。把每个 CLI 放在它最擅长的位置，例如 DeepSeek 负责后端，Claude 负责产品与网页方向，Codex 负责设计系统或一轮实现，Hermes 负责邮件、搜索或调研。

界面提供 10 种语言：英语、德语、法语、西班牙语、葡萄牙语、意大利语、土耳其语、俄语、简体中文和阿拉伯语。

## 界面

| 界面 | 适用场景 |
| --- | --- |
| **TUI** | 在终端内以键盘优先的方式快速控制。 |
| **Web UI** | 用一个可视化视图查看运行、智能体、实时窗格与历史。 |
| **CLI** | 脚本、快速生成命令、doctor 检查以及打开 tmux。 |
| **tmux** | 在本地持续运行的真实提供方 CLI 窗口。 |
| **Agent Control（按需启用）** | 一个按 CLI 开启的 MCP，让一个智能体生成并驱动其他智能体（同时运行 Codex、Hermes 和 Claude Code 智能体的 Claude Code）。 |

## 为什么选择 ReevesAgents

- **让你的智能体驱动其他智能体。** 你的主控 CLI（比如 Claude Code）通过 MCP 生成并指挥一组 Claude、Codex、DeepSeek、Hermes、OpenCode 或其他智能体。
- **多任务与循环。** 用基于编排的运行来组合智能体，并在前面放一个低到中等成本的路由模型，去驱动更聪明或更小的模型。在项目的不同部分并行运行多个智能体，让循环式智能体持续工作，并从一个视图观察整个编排。
- **把成本控制在合理范围。** 让便宜或免费的模型去写 CRUD 和测试，而你用更大的模型来规划和设计，而不是把所有事都塞进一个昂贵的默认模型。
- **一个工作区，思路不中断。** 如果你已经在 Claude、Codex、DeepSeek、Hermes 或 OpenCode 之间来回切换，ReevesAgents 会把这些会话放在一个本地位置；从 TUI 或 Web UI 打开任意智能体即可直接驱动它。
- **保持厂商灵活性。** 提供方登录信息留在各自的 CLI 中。ReevesAgents 从不存储凭据，也不代理模型流量，因此你可以自由添加、移除或切换 CLI。
- **一眼看清工作进展。** 活跃的运行、智能体、模型、权限模式、停止与删除操作以及历史，都在一个 Web UI 视图中，同时 tmux 让真实的 CLI 保持存活。

这不是一个云端智能体平台。它是围绕真实 CLI 的一个小型本地层：没有数据库、没有 Docker、没有后台守护进程，也没有由 ReevesAgents 存储的 API 密钥。

## 安装

ReevesAgents 以 `reevesagents` 之名发布在 npm 上。用你已经在用的包管理器全局安装它，然后用 `doctor` 检查机器。

```sh
npm install -g reevesagents
reevesagents doctor
reevesagents
```

要固定某个版本，在包名后追加 `@<version>`，例如 `npm install -g reevesagents@1.2.0`。

<details>
<summary><b>pnpm</b></summary>

```sh
pnpm add -g reevesagents
reevesagents doctor
reevesagents
```

一次性运行，不做全局安装：

```sh
pnpm dlx reevesagents doctor
```

</details>

<details>
<summary><b>Yarn</b></summary>

用 Yarn（Berry）一次性运行：

```sh
yarn dlx reevesagents doctor
```

用 Yarn Classic 全局安装：

```sh
yarn global add reevesagents
reevesagents doctor
reevesagents
```

</details>

<details>
<summary><b>Bun</b></summary>

```sh
bun add -g reevesagents
reevesagents doctor
reevesagents
```

一次性运行，不做全局安装：

```sh
bunx reevesagents doctor
```

</details>

<details>
<summary><b>npx（免安装）</b></summary>

```sh
npx reevesagents doctor
```

</details>

<details>
<summary><b>Homebrew</b></summary>

```sh
brew tap mertkayacs/reevesagents
brew install reevesagents
reevesagents doctor
reevesagents
```

</details>

<details>
<summary><b>从源码安装</b></summary>

当你想查看代码、参与贡献或从仓库运行时，使用源码方式。

```sh
git clone https://github.com/mertkayacs/reevesagents.git
cd reevesagents
pnpm install
pnpm build
pnpm link --global
reevesagents doctor
reevesagents
```

</details>

## 先决条件

ReevesAgents 以本地为先。它期望一台普通的开发者机器，已安装 tmux 以及至少一个提供方 CLI。

- macOS、Linux 或 WSL。原生 Windows 不是目标运行环境；请使用 WSL。
- Node.js `20.19+`。
- tmux。推荐版本 `3.0+`。
- `PATH` 上有一个正常的交互式 shell。
- `PATH` 上至少有一个受支持的提供方 CLI。

当下列提供方 CLI 已在你的机器上安装并完成认证时，ReevesAgents 可以启动它们：Claude Code、Codex CLI、OpenCode、Hermes、Kimi、DeepSeek、Pi、Qwen 和 Aider。提供方登录、模型、工具、配额和权限提示都留在各自的提供方处。ReevesAgents 不存储提供方 API 密钥，也不代理模型流量。

## 快速开始

```sh
reevesagents                 # 启动 TUI
reevesagents web             # 打开本地 Web UI
reevesagents doctor          # 检查机器
```

从 CLI 启动一个具名运行。第一个 spec 是主控，其余是工作者，每个 spec 的格式为 `provider[:nickname[:model]]`：

```sh
reevesagents spawn deepseek:backend claude-code:product codex:system hermes:research \
  --name "launch week build" \
  --prompt "Plan the backend, product surface, design system, and research notes."
```

## 命令

不带参数运行会启动 TUI。这些子命令是供人和脚本使用的操作界面。

| 命令 | 用途 | 关键标志 |
| --- | --- | --- |
| `reevesagents` | 启动 TUI（无子命令）。 | 无 |
| `spawn [spec...]` | 用一个或多个提供方智能体启动一个运行。每个 `spec` 的格式为 `provider[:nickname[:model]]`。第一个 spec 是主控，其余是工作者。不带 spec 时默认为 `codex`。 | `--name <name>`（默认 `run`）、`--cwd <dir>`（默认当前目录）、`--prompt <text>`（粘贴到每个智能体中） |
| `runs` | 列出活跃的运行，每行一个。 | `--json`（以 JSON 数组形式返回完整运行记录） |
| `open <id>` | 把 tmux 切换到某个运行的 Reeves 窗口或某个智能体窗口。在 tmux 内会切换；在 tmux 外的 TTY 上会附加；否则打印一条可粘贴的 tmux 命令。接受运行 id/名称或智能体 id/昵称（允许前缀匹配）。 | 无 |
| `peek <agent-id>` | 打印某个智能体最近的输出。 | `-n, --lines <n>`（默认 `20`）、`--json`（以数组形式返回各行） |
| `stop <run-id>` | 停止一个运行。 | `-y, --yes`（或 `ALLOW_DESTRUCTIVE=1`） |
| `kill <agent-id>` | 停止一个智能体。 | `-y, --yes`（或 `ALLOW_DESTRUCTIVE=1`） |
| `doctor` | 运行环境健康检查（Node、tmux、状态路径、提供方 CLI）。任一检查失败时以非零状态退出。 | `--json` |
| `web` | 启动按需、仅回环的 Web UI。在前台运行；停止后智能体继续运行。 | `--port <n>`（首选端口，被占用时退回到下一个空闲端口）、`--no-open`（不打开浏览器） |
| `mcp` | 通过 stdio 启动 Agent Control MCP 服务器。不手动运行；由你在 Agent Control 界面附加它的那个 CLI 来运行。 | 无 |

`stop` 和 `kill` 是仅有的破坏性命令。没有 `--yes` 或 `ALLOW_DESTRUCTIVE=1` 时它们会拒绝运行。

## Agent Control（按需启用的 MCP）

ReevesAgents 附带一个可选的 MCP 服务器，让一个 AI CLI 生成并驱动其他 AI CLI：启动一个智能体、粘贴提示、发送按键、读取输出，以及处理审批请求。它是一种扁平机制，而非编排策略：没有角色、没有自主循环、没有协调协议。

它默认关闭。ReevesAgents 绝不会自行把它附加到某个 CLI 上。

你在 TUI 或 Web UI 的 **Agent control** 界面将它打开。该界面会列出本机上能够托管 MCP 服务器的 CLI（claude、codex、kimi、qwen、opencode、hermes），并让你附加、分离或全部附加。附加会运行该 CLI 自带的 `mcp add` 命令（例如 `claude mcp add reevesagents -- reevesagents mcp`）；分离会运行对应的移除命令。ReevesAgents 只调用每个 CLI 自带的命令，绝不手动编辑提供方配置文件。OpenCode 是例外：它的 `mcp add` 是交互式的且没有移除命令，因此该界面将其标记为需手动附加。

一旦某个 CLI 被附加，它每次启动时就拥有 Agent Control 工具。安装它是你的明确选择，而这一选择即是同意。一个运行由作为头节点的控制 CLI 加上它生成的智能体组成，整组会像任何其他运行一样显示在 TUI 和 Web UI 中。

被生成的工作者默认不会收到该 MCP，因此它们无法进一步生成智能体。要让某个工作者驱动自己的子工作者，从同一界面把 MCP 附加到该工作者的 CLI 上。防护栏位于资源层面：每个运行的智能体上限（`max_agents`），在生成工具向某个运行添加智能体时强制执行；以及每个智能体都是其自身 tmux 窗格中的一个真实 CLI 进程这一事实。

被附加的 CLI 还能发现自己可以启动什么：`list_providers` 工具和 `reevesagents://providers` 资源会返回本机上的提供方及其 id、安装状态、别名和已知模型，这样智能体就能把一个真实的 id 传给 `spawn`，而不是靠猜。

完整设计与工具列表见 [docs/mcp.md](../mcp.md)。

## 配置

状态和配置都是本地 JSON。没有数据库，没有守护进程。

状态位于 `~/.reeves` 下：

```text
~/.reeves/
  config.json     全局设置（peek 间隔、语言、默认权限、限制）
  presets/        保存的运行预设
  runs/           每个活跃运行一个文件夹（run.json 加上 agents/<id>.json）
  history/        归档的已结束和陈旧运行（history/runs/<id>.json）
```

两个环境变量可覆盖默认值，主要用于隔离测试或多配置场景：

- `REEVES_REGISTRY`：状态根目录覆盖。用它取代 `~/.reeves` 作为 `runs/`、`history/` 和 `presets/` 的目录。
- `REEVES_CONFIG`：配置文件路径覆盖。用它取代 `~/.reeves/config.json`。

可能包含机密的文本字段在写入状态前会被脱敏。

## 示例

把一个项目分配给最适合各项工作的 CLI：

```sh
reevesagents spawn deepseek:backend claude-code:product codex:review \
  --name "feature x" --prompt "Backend, product copy, and a review pass."
```

列出存活的内容并获取运行 id：

```sh
reevesagents runs
reevesagents runs --json   # 适合脚本使用
```

不离开你的 shell 即可观察单个智能体，在它需要你时再切进去：

```sh
reevesagents peek backend -n 40
reevesagents open backend
```

工作完成后，用一个调用停止整个运行：

```sh
reevesagents stop "feature x" --yes
```

## Web UI

Web UI 是本地的，且仅限回环。

```sh
reevesagents web
```

它绑定到 `127.0.0.1`，在前台运行，停止时退出。之后智能体在 tmux 中继续运行。在浏览器中你可以创建运行、添加智能体、选择提供方模型和权限模式、停止智能体、删除已结束的工作，并在真实 CLI 持续运行的同时查看历史。

Web UI 使用两个可选的运行时模块，`ws` 和 `@lydell/node-pty`。npm 默认会安装它们。没有它们时 CLI 和 TUI 仍可正常工作，而 `web` 命令会说明缺少了什么。

要从另一台机器访问 Web UI，通过 SSH 转发该回环端口。没有内置隧道：

```sh
ssh -L 8080:127.0.0.1:8080 user@host
# 然后在浏览器中访问 http://localhost:8080
```

## 故障排查

**tmux 未安装。** ReevesAgents 需要 tmux 来进行基于窗口的导航。安装它（`brew install tmux` 或 `apt install tmux`）并运行 `reevesagents doctor`。TUI 会自动把自己包裹在一个名为 `reeves` 的 tmux 会话中；设置 `REEVES_NO_TMUX_WRAPPER=1` 可跳过该行为。

**某个提供方 CLI 缺失，或 Doctor 报告了失败。** ReevesAgents 只启动那些已在你的 `PATH` 上并完成认证的提供方 CLI。运行 `reevesagents doctor` 查看检测到了哪些提供方以及哪里出了问题，然后安装或登录你需要的那个提供方 CLI。

**Web UI 报告缺少包。** Web UI 需要 `ws` 和 `@lydell/node-pty`。当平台没有预构建的 `@lydell/node-pty` 二进制文件，或安装时省略了可选依赖时，它们可能被跳过。启用可选依赖重新安装，然后运行 `reevesagents doctor`。

**端口已被占用。** `reevesagents web` 默认在端口 `8080` 上启动。如果该端口被占用，服务器会在一个小范围内绑定下一个空闲端口并打印所选的 URL。传入 `--port <n>` 以选择不同的起始端口。

## 无需事项

对于正常稳定的智能体运行，你不需要由 ReevesAgents 存储的 API 密钥、数据库、Docker、后台服务或 MCP 设置。安装是被动的：稳定版包没有 postinstall 脚本，也不会重写提供方配置。附加 Agent Control MCP 是唯一明确的、按需启用的步骤，它会触及提供方配置，而且只通过每个 CLI 自带的 `mcp add` 命令。

## 参与贡献

分支与拉取请求流程见 [CONTRIBUTING.md](../../.github/CONTRIBUTING.md)，漏洞报告见 [SECURITY.md](../../.github/SECURITY.md)，近期变更见 [CHANGELOG.md](../../CHANGELOG.md)。设计模型位于 [REEVESAGENTS_DESIGN.md](../REEVESAGENTS_DESIGN.md)，贡献者文档在 [docs/](..) 下。

终端用户不需要开发工具链。贡献者使用仓库中的 pnpm、TypeScript、tsup、Vitest 和 ESLint。

## 链接

- npm: https://www.npmjs.com/package/reevesagents
- GitHub: https://github.com/mertkayacs/reevesagents
- Releases: https://github.com/mertkayacs/reevesagents/releases
- Issues: https://github.com/mertkayacs/reevesagents/issues
- Changelog: [CHANGELOG.md](../../CHANGELOG.md)
- License: [Apache-2.0](../../LICENSE)

## 许可证

Apache-2.0
