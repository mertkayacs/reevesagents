<p align="center">
  <a href="https://reevesagents.mertkayacs.com">
    <img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-header.gif" alt="ReevesAgents" width="800" />
  </a>
</p>

[![npm version](https://img.shields.io/npm/v/reevesagents.svg)](https://www.npmjs.com/package/reevesagents)
[![visits](https://visitor-badge.laobi.icu/badge?page_id=mertkayacs.reevesagents&left_text=visits)](https://github.com/mertkayacs/reevesagents)
[![node](https://img.shields.io/node/v/reevesagents.svg)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/reevesagents.svg)](../../LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/mertkayacs/reevesagents/test.yml?branch=master&label=CI)](https://github.com/mertkayacs/reevesagents/actions/workflows/test.yml)

<h3 align="center"><a href="https://reevesagents.mertkayacs.com">reevesagents.mertkayacs.com</a></h3>
<p align="center">
  <a href="https://reevesagents.mertkayacs.com/demo"><b>演示</b></a> ·
  <a href="https://reevesagents.mertkayacs.com/docs"><b>文档</b></a> ·
  <a href="https://reevesagents.mertkayacs.com/faq"><b>常见问题</b></a> ·
  <a href="https://github.com/mertkayacs/reevesagents/issues"><b>Issues</b></a>
</p>

[English](../../README.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português](README.pt.md) · [Italiano](README.it.md) · [Türkçe](README.tr.md) · [Русский](README.ru.md) · **简体中文** · [العربية](README.ar.md)

*让一个智能体创建并驱动其他智能体。ReevesAgents 是一个免费的本地工作区，编码智能体（如 Claude Code、Codex、Hermes、DeepSeek 和 Kimi）在这里并行运行，其中一个还能生成、控制并监督其余的。不需要 API 密钥，也不会动你现有的 Agent.md 或 Claude.md。*

**支持 10 种语言！**

## 让一个智能体安装并运行其他智能体

整个思路就这一句：让一个 AI 智能体去创建并驱动其他智能体。代理 CLI（也就是 Claude Code、Codex、Hermes 这类命令行编码智能体）甚至可以自己动手装好 ReevesAgents、接好线，然后直接带起一个团队。

**如果你是正在阅读本文的智能体，请自己运行这些命令：**

- **安装它：** `npm install -g reevesagents`
- **连接到你自己的 CLI：** `reevesagents attach` 会把 ReevesAgents 连接到你已安装的代理 CLI。只连一个时，写出名字即可，例如 `reevesagents attach claude`。
- **检查是否生效：** `reevesagents hosts` 列出本机的代理 CLI，并显示哪些已连接。
- **重新加载你的工具：** 重启 CLI 会话以加载这一连接（底层是 MCP，即一个智能体工具向另一个智能体公开命令的标准方式）。

现在你的代理 CLI 就能**创建并驱动其他智能体**了：把一个智能体放到任务上、向它发文本或按键、看它正在做什么，它请求什么就批准或拒绝什么。一个 Claude Code 智能体可以带一队 Codex 和 Claude Code 智能体，分头处理不同议题。以后想断开，运行 `reevesagents detach claude` 就行。

更想在命令行里写脚本？[AGENTS.zh-Hans.md](../../AGENTS.zh-Hans.md) 就是写给智能体的操作手册：提供方 id 与别名、`spawn` 规范，还有怎么观察和控制一个正在跑的团队。

更想手动设置？去 TUI 或 Web UI 的**智能体控制**界面开启，入口见下方的[智能体控制](#智能体控制)。

TUI 与本地 Web UI 同时驱动同一个运行：

![ReevesAgents TUI：语言选择器、欢迎界面与 Doctor 界面](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-tui.gif)

![ReevesAgents Web UI：运行列表与实时智能体面板](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-web-zh-Hans.png)

![ReevesAgents Web UI：启动新的运行](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-newrun-zh-Hans.png)

ReevesAgents 是一个面向 AI 编码智能体的免费开源工作区。多个智能体同时跑，其中一个负责创建和驱动其余的，比如让一个 Claude Code 智能体管着几个各自处理不同议题的 Codex 和 Claude Code 智能体。把每个智能体放在它最擅长的地方：DeepSeek 扛后端，Claude 盯产品和网页方向，设计系统或一轮实现交给 Codex，邮件、搜索、调研这类活就归 Hermes。

界面提供 10 种语言：英语、德语、法语、西班牙语、葡萄牙语、意大利语、土耳其语、俄语、简体中文和阿拉伯语。

第一次接触 ReevesAgents？[用户指南](../GUIDE.zh-Hans.md)会带你装好它、跑通第一个运行，一直到让一个智能体驱动其余的。

## 两种使用方式

- **作为工作区。** 生成你想要的智能体，再用 `reevesagents add` 一次一个地不断往里加。它们并排运行，每个都待在自己的 tmux 窗口里，谁也不控制谁。这是最简单的上手方式：把你手头各式各样的 CLI 凑到本地的同一个地方。
- **作为编排器。** 把需要手动开启的 Agent Control MCP 附加到某一个 CLI 上，那个智能体就拿到了生成并驱动其余智能体的工具。这是它的招牌功能，在你亲手开启之前一直是关着的。

两者用的是同一批运行、同一批界面，所以你可以先从一个纯粹的工作区起步，之后再上手编排，也可以永远都不碰。

## 界面

| 界面 | 适用场景 |
| --- | --- |
| **TUI** | 在终端内以键盘优先的方式快速控制。 |
| **Web UI** | 在一个可视化视图里查看运行、智能体、实时窗格与历史。 |
| **CLI** | 脚本、快捷的 spawn 命令、doctor 检查以及打开 tmux。 |
| **tmux** | 在本地持续运行的真实提供方 CLI 窗口。 |
| **智能体控制** | 核心理念：一个智能体创建并驱动其余智能体。按 CLI 逐个开启后，一个 Claude Code 智能体就能同时运行 Codex、Hermes 和 Claude Code 智能体。 |

## 为什么选择 ReevesAgents

- **让你的智能体驱动其他智能体。** 你的主控 CLI（比如 Claude Code）通过 MCP 生成并指挥一组 Claude、Codex、DeepSeek、Hermes、OpenCode 或其他智能体。
- **多任务与循环。** 让多个智能体在项目的不同部分并行干活，长任务放着继续跑，全部进度在一个视图里就能看完。前面还可以放一个更便宜的模型做分派，把工作路由给更聪明或更小的智能体。
- **把成本控制在合理范围。** 日常代码和测试交给便宜甚至免费的模型去写，规划和设计你再用大模型，而不是什么都压在一个昂贵的默认模型上。
- **一个工作区，思路不中断。** 如果你已经在 Claude、Codex、DeepSeek、Hermes 或 OpenCode 之间来回切换，ReevesAgents 会把这些会话集中到本地一处，想驱动哪个智能体，从 TUI 或 Web UI 打开它就行。
- **不被厂商绑定。** 提供方登录信息留在各自的 CLI 里。ReevesAgents 从不存储凭据，也不代理模型流量，因此你可以随意添加、移除或更换 CLI。
- **一眼看清工作进展。** 活跃的运行、智能体、模型、权限模式、停止与删除操作以及历史，都汇总在一个 Web UI 视图里，真实的 CLI 则由 tmux 保持存活。

这不是云端智能体平台，只是围着真实 CLI 包了薄薄一层的本地工具。它不带数据库，不需要 Docker，后台没有守护进程，API 密钥更是从不经 ReevesAgents 的手。

## 安装

用 Homebrew 安装 ReevesAgents，或者用任意 Node 包管理器（pnpm、npm、Yarn 或 Bun）全局安装，然后用 `doctor` 检查机器。

```sh
# Homebrew
brew install mertkayacs/reevesagents/reevesagents

# 或用 Node 包管理器，这里以 pnpm 为例
pnpm add -g reevesagents
```

```sh
reevesagents doctor
reevesagents
```

要固定版本，在包名后追加 `@<version>`，例如 `pnpm add -g reevesagents@1.4.0`。

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
<summary><b>npm</b></summary>

```sh
npm install -g reevesagents
reevesagents doctor
reevesagents
```

一次性运行，不做全局安装：

```sh
npx reevesagents doctor
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

当你想查看代码、参与贡献或直接从仓库运行时，选择源码方式。

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

ReevesAgents 以本地为先，假定这是一台普通的开发机，已装好 tmux 和至少一个提供方 CLI。

- macOS、Linux 或 WSL。原生 Windows 不是目标运行环境；请使用 WSL。
- Node.js `20.19+`。
- tmux。推荐 `3.0+` 版本。
- `PATH` 上有一个正常的交互式 shell。
- `PATH` 上至少有一个受支持的提供方 CLI。

只要这些提供方 CLI 已经在你的机器上装好并完成认证，ReevesAgents 就能启动它们：Claude Code、Codex CLI、OpenCode、Hermes、Kimi、DeepSeek、Pi、Qwen 和 Aider。每个 CLI 保留自己的登录、模型、配额和权限提示，跟你亲手启动它时一模一样，所以 ReevesAgents 从头到尾都不需要保管 API 密钥，也不用挡在流量路径中间。

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

或者从小处起步，一次一个地把工作区扩起来。`add` 会加入最近的那个运行，所以你永远不用到处复制运行 id：

```sh
reevesagents spawn claude-code:product   # start a workspace
reevesagents add codex:system            # add to it later
reevesagents add hermes:research
```

完整的操作流程见[用户指南](../GUIDE.zh-Hans.md)。

## 命令

不带参数运行会启动 TUI。这些子命令是面向人和脚本的操作界面。

日常常用命令：

- `reevesagents`: 启动 TUI（无子命令）。
- `spawn [spec...]`: 用一个或多个提供方智能体启动一个运行。每个 `spec` 的格式为 `provider[:nickname[:model]]`。第一个 spec 是主控，其余是工作者。不带 spec 时默认为 `codex`。关键标志: `--name <name>`（默认 `run`）、`--cwd <dir>`（默认当前目录）、`--prompt <text>`（粘贴到每个智能体中）、`--skip`（跳过权限提示）、`--run <run-id>`（把智能体加进现有运行）、`--auth-mode <mode>`、`--effort <level>`、`--extra-args <args>`（追加到每次智能体启动的标志，例如 `"--remote-control"`）、`--json`。
- `add [spec...]`: 把一个或多个智能体加到当前工作区，也就是最近一个活跃的运行，无需传入运行 id。用它可以一次一个地扩充工作区。各智能体标志与 `spawn` 相同，另外还有 `--run <run-id>`，用来指定某个具体运行，而不是最新的那个。
- `runs`: 列出活跃的运行，每行一个。关键标志: `--json`（以 JSON 数组形式返回完整运行记录）。
- `agents [run-id]`: 列出所有运行中的智能体，或某一个运行中的智能体。关键标志: `--json`。
- `open <id>`: 把 tmux 切换到某个运行的 Reeves 窗口或某个智能体窗口。在 tmux 内会切换；在 tmux 外的 TTY 上会附加；否则打印一条可粘贴的 tmux 命令。接受运行 id/名称或智能体 id/昵称（允许前缀匹配）。
- `peek <agent-id>`: 打印某个智能体最近的输出。关键标志: `-n, --lines <n>`（默认 `20`）、`--json`（以数组形式返回各行）。
- `send <agent-id> <text...>`: 在智能体的提示符处粘贴文本。它不会提交；随后用 `key <agent-id> enter`。
- `key <agent-id> <key>`: 发送一个按键：`enter`、`escape`、`backspace`、`tab`、`space`、`up`、`down`、`left`、`right` 或 `ctrl-c`。
- `interrupt <agent-id>`: 向一个智能体发送 ctrl-c。
- `stop <run-id>`: 停止一个运行。关键标志: `-y, --yes`（或 `ALLOW_DESTRUCTIVE=1`）。
- `kill <agent-id>`: 停止一个智能体。关键标志: `-y, --yes`（或 `ALLOW_DESTRUCTIVE=1`）。
- `doctor`: 运行环境健康检查（Node、tmux、状态路径、提供方 CLI）。任一检查失败时以非零状态退出。关键标志: `--json`。
- `web`: 启动按需、仅回环的 Web UI。在前台运行；停止后智能体继续运行。关键标志: `--port <n>`（首选端口，被占用时退到下一个空闲端口）、`--no-open`（不打开浏览器）。

发现、审批、智能体控制、配置与清理：

- `providers`: 列出每个提供方及其可用性、别名和已知模型。关键标志: `--models`、`--json`。
- `approvals`: 列出来自智能体的待处理审批请求。关键标志: `--json`。
- `approve <approval-id> [note]`: 把一个审批请求处理为批准。
- `deny <approval-id> [note]`: 把一个审批请求处理为拒绝。
- `hosts`: 列出本机上的代理 CLI 并显示 ReevesAgents 已连接到哪些。
- `attach [cli]`: 把 ReevesAgents 连接到一个代理 CLI，不指定名称时连接到每个已安装的 CLI。运行该 CLI 自己的 `mcp add`。
- `detach <cli>`: 从一个代理 CLI 断开 ReevesAgents。运行该 CLI 自己的 `mcp remove`。
- `mcp`: 通过 stdio 启动智能体控制 MCP 服务器。无需手动运行；由你把它连接到的 CLI 来运行。
- `config [key] [value]`: 显示所有可编辑设置、读取一项或设置一项。关键标志: `--json`。
- `presets`: 列出已保存的运行预设。关键标志: `--json`。
- `save-preset <run-id> <name> [description...]`: 把一个存活的运行保存为可复用的预设。
- `start-preset <name>`: 从预设启动一个新运行。关键标志: `--name <run>`、`--cwd <dir>`。
- `delete-preset <name>`: 删除一个预设。关键标志: `-y, --yes`。
- `delete <agent-id>`: 删除一个已结束智能体的记录。关键标志: `-y, --yes`。
- `delete-run <run-id>`: 删除一个已结束的运行并归档到历史。关键标志: `-y, --yes`。
- `history`: 列出已归档的已结束和陈旧运行。关键标志: `--json`。
- `delete-history <id>`: 删除一条已归档的历史记录。关键标志: `-y, --yes`。

`stop`、`kill` 和各个 `delete` 命令是破坏性操作。没有 `--yes` 或 `ALLOW_DESTRUCTIVE=1` 时，它们会拒绝执行。

## 智能体控制

ReevesAgents 附带一个可选的 MCP 服务器，让一个 AI CLI 生成并驱动其他 AI CLI：启动智能体、粘贴提示词、发送按键、读取输出、处理审批请求。它只是一层扁平机制，谈不上编排策略：不分角色，不搞自主循环，也没有什么协调协议。

它默认关闭，ReevesAgents 也绝不会背着你把它附加到任何 CLI 上。

你在 TUI 或 Web UI 的**智能体控制**界面里开启它。界面会列出本机能托管 MCP 服务器的 CLI（claude、codex、kimi、qwen、opencode、hermes），让你逐个附加、分离，或者全部附加。附加时它运行该 CLI 自带的 `mcp add` 命令（例如 `claude mcp add reevesagents -- reevesagents mcp`），分离时运行对应的移除命令。ReevesAgents 只调用每个 CLI 自己的命令，从不手动去改提供方的配置文件。OpenCode 是例外：它的 `mcp add` 是交互式的，也没有移除命令，所以界面把它标成需手动附加。

CLI 一旦附加，之后每次启动都会带上 Agent Control 工具。要不要装完全是你自己的明确选择，而这个选择本身就是同意。一个运行就是作为头节点的控制 CLI 加上它生成的那些智能体，整组会像普通运行一样出现在 TUI 和 Web UI 里。

被生成的工作者默认拿不到这个 MCP，所以没法继续往下生成智能体。想让某个工作者驱动自己的子工作者，就在同一个界面把 MCP 附加到那个工作者的 CLI 上。防护措施设在资源层面：每个运行有智能体上限（`max_agents`），spawn 工具往运行里加智能体时会强制检查，再加上每个智能体本来就是自己 tmux 窗格里的一个真实 CLI 进程。

已附加的 CLI 还能查清自己能启动什么：`list_providers` 工具和 `reevesagents://providers` 资源会返回本机的提供方，连同 id、安装状态、别名和已知模型，这样智能体传给 `spawn` 的就是真实存在的 id，而不是靠猜。

完整设计与工具列表见 [docs/mcp.md](../mcp.md)。

## 配置

所有状态和配置都是你磁盘上的普通 JSON 文件，所以没有什么需要管理的，不用它的时候也没有任何东西在跑。

状态位于 `~/.reeves` 下：

```text
~/.reeves/
  config.json     全局设置（peek 间隔、语言、默认权限、限制）
  presets/        保存的运行预设
  runs/           每个活跃运行一个文件夹（run.json 加上 agents/<id>.json）
  history/        归档的已结束和陈旧运行（history/runs/<id>.json）
```

两个环境变量可以覆盖默认值，主要用于隔离测试或多配置文件场景：

- `REEVES_REGISTRY`：覆盖状态根目录。取代 `~/.reeves`，作为 `runs/`、`history/` 和 `presets/` 的存放目录。
- `REEVES_CONFIG`：覆盖配置文件路径。取代 `~/.reeves/config.json`。

凡是可能含有机密的内容，写进文件之前都会先脱敏。

## 示例

把一个项目分配给最适合各项工作的 CLI：

```sh
reevesagents spawn deepseek:backend claude-code:product codex:review \
  --name "feature x" --prompt "Backend, product copy, and a review pass."
```

列出存活的运行并拿到运行 id：

```sh
reevesagents runs
reevesagents runs --json   # 适合脚本使用
```

不用离开 shell 就能观察单个智能体，需要介入时再切进去：

```sh
reevesagents peek backend -n 40
reevesagents open backend
```

工作完成后，一条命令停止整个运行：

```sh
reevesagents stop "feature x" --yes
```

## Web UI

Web UI 只在本地运行，且仅监听回环地址。

```sh
reevesagents web
```

它只应答 `127.0.0.1`，并且会一直待在前台，直到你把它停掉。停掉也不影响智能体半分，因为它们住在 tmux 里，不在这个页面里。在浏览器里你可以创建运行、按选好的模型和权限模式添加智能体、停掉该停的，再翻翻历史，底下的真实 CLI 一直在干活。

Web UI 用到两个可选的运行时模块：`ws` 和 `@lydell/node-pty`。npm 默认会安装它们。缺了它们，CLI 和 TUI 照常工作，`web` 命令也会说明缺了什么。

要从另一台机器访问 Web UI，就用 SSH 转发回环端口，这里没有内置隧道：

```sh
ssh -L 8080:127.0.0.1:8080 user@host
# 然后在浏览器中访问 http://localhost:8080
```

## 故障排查

**tmux 未安装。** ReevesAgents 依赖 tmux 做基于窗口的导航。装上它（`brew install tmux` 或 `apt install tmux`），再运行 `reevesagents doctor`。TUI 会自动把自己包进一个名为 `reeves` 的 tmux 会话，不想要这个行为就设置 `REEVES_NO_TMUX_WRAPPER=1`。

**缺少某个提供方 CLI，或 Doctor 报告失败。** ReevesAgents 只启动已经在 `PATH` 上并完成认证的提供方 CLI。运行 `reevesagents doctor` 看看检测到了哪些提供方、哪里失败，然后把需要的那个装上或登录。

**Web UI 报告缺少包。** Web UI 需要 `ws` 和 `@lydell/node-pty`。平台没有预构建的 `@lydell/node-pty` 二进制文件，或者安装时省略了可选依赖，它们就可能被跳过。启用可选依赖重新安装，然后运行 `reevesagents doctor`。

**端口已被占用。** `reevesagents web` 默认在 `8080` 端口启动。被占用时，服务器会在一个小范围内绑定下一个空闲端口并打印所选 URL。想换起始端口就传 `--port <n>`。

## 无需准备的东西

正常跑稳定版的智能体运行，不需要 ReevesAgents 替你保存 API 密钥，也用不上数据库、Docker、后台服务或任何 MCP 设置。安装是被动的：稳定版包没有 postinstall 脚本，也不会重写提供方配置。唯一会碰提供方配置的步骤是附加 Agent Control MCP，那一步要你明确启用，而且只通过每个 CLI 自带的 `mcp add` 命令进行。

## 参与贡献

分支与拉取请求流程见 [CONTRIBUTING.md](../../.github/CONTRIBUTING.md)，漏洞报告见 [SECURITY.md](../../.github/SECURITY.md)，近期变更见 [CHANGELOG.md](../../CHANGELOG.md)。设计模型在 [REEVESAGENTS_DESIGN.md](../REEVESAGENTS_DESIGN.md)，贡献者文档位于 [docs/](..) 下。

最终用户不需要开发工具链。贡献者使用仓库里的 pnpm、TypeScript、tsup、Vitest 和 ESLint。

## 链接

- 网站: https://reevesagents.mertkayacs.com
- npm: https://www.npmjs.com/package/reevesagents
- GitHub: https://github.com/mertkayacs/reevesagents
- Releases: https://github.com/mertkayacs/reevesagents/releases
- Issues: https://github.com/mertkayacs/reevesagents/issues
- Changelog: [CHANGELOG.md](../../CHANGELOG.md)
- License: [Apache-2.0](../../LICENSE)

## 许可证

Apache-2.0
