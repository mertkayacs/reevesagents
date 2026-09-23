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
  <a href="https://reevesagents.mertkayacs.com/demo"><b>演示</b></a> ·
  <a href="https://reevesagents.mertkayacs.com/docs"><b>文档</b></a> ·
  <a href="https://reevesagents.mertkayacs.com/faq"><b>常见问题</b></a> ·
  <a href="https://github.com/mertkayacs/reevesagents/issues"><b>问题反馈</b></a>
</p>

[English](../../README.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português](README.pt.md) · [Italiano](README.it.md) · [Türkçe](README.tr.md) · [Русский](README.ru.md) · **简体中文** · [العربية](README.ar.md)

ReevesAgents 是一个面向 AI 编码 CLI 的本地工作区。它把 Claude Code、Codex、OpenCode、Hermes、Kimi、DeepSeek、Qwen、Pi、Aider 等提供方 CLI 并排放在 tmux 里运行。你可以把它当作普通的 CLI、TUI 或 Web UI 来用，也可以附加它那个需要手动开启的 MCP，让一个智能体去生成、读取、操控和停止其余的智能体。

提供方的登录始终留在各自的 CLI 里。ReevesAgents 把自己的状态存成 `~/.reeves` 下几个普通的 JSON 文件，只在你或已附加的 CLI 使用它时运行。

## 快速上手

```sh
pnpm add -g reevesagents
reevesagents doctor
reevesagents
```

从 CLI 启动一次运行：

```sh
reevesagents spawn claude-code:lead codex:tests hermes:research \
  --name "release check" \
  --prompt "Review the release path, test coverage, and docs."
```

打开 Web UI：

```sh
reevesagents web
```

让一个附加了 MCP 的智能体驱动其余的：

```sh
reevesagents attach codex
reevesagents hosts
```

附加之后要重启那个 CLI，它才会加载这些 MCP 工具。

## 它能做什么

| 界面 | 用途 |
| --- | --- |
| **TUI** | 在终端里用键盘操控运行。 |
| **Web UI** | 在本地用图形界面查看运行、窗格、智能体、审批和历史。 |
| **CLI** | 写脚本、做冒烟检查、生成智能体、清理状态，以及跳转到 tmux 窗口。 |
| **Agent Control MCP** | 让一个你信任的 CLI 通过本地工具生成并驱动其他 CLI。 |
| **tmux** | 真实的提供方 CLI 窗口，关掉界面后照样在跑。 |

ReevesAgents 从设计上就是纯本地的。状态是 `~/.reeves` 下的纯 JSON，它启动的 CLI 也正是你平时亲手使用的那些。

<a id="install"></a>
<details>
<summary><strong>安装</strong></summary>

ReevesAgents 需要 Node.js `20.19+`、tmux `3.0+`，以及至少一个装好并完成认证的受支持提供方 CLI。支持 macOS、Linux 和 WSL。

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

要固定某个版本，替换 `<version>` 即可：

```sh
pnpm add -g reevesagents@<version>
```

从源码安装：

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
<summary><strong>截图</strong></summary>

TUI 和 Web UI 驱动的是同一批本地运行：

![ReevesAgents TUI：语言选择、欢迎菜单和 doctor](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-tui.gif)

![ReevesAgents Web UI：运行列表和实时智能体窗格](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-web-zh-Hans.png)

![ReevesAgents Web UI：新建一次运行](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-newrun-zh-Hans.png)

</details>

<a id="commands"></a>
<details>
<summary><strong>命令</strong></summary>

不带参数时启动 TUI。

| 命令 | 作用 |
| --- | --- |
| `reevesagents` | 启动 TUI。 |
| `spawn [spec...]` | 启动一次运行。每个 spec 的格式是 `provider[:nickname[:model]]`。 |
| `add [spec...]` | 往最近一次活跃的运行里添加智能体。 |
| `runs` | 列出活跃的运行。 |
| `agents [run-id]` | 列出所有运行里的智能体，或某一次运行里的智能体。 |
| `open <id>` | 跳到某次运行或某个智能体的 tmux 窗口。 |
| `peek <agent-id>` | 打印某个智能体最近的输出。 |
| `send <agent-id> <text...>` | 把文本粘贴给智能体，但不提交。 |
| `key <agent-id> <key>` | 发送 `enter`、`escape`、方向键、`tab`、`space`、`backspace` 或 `ctrl-c`。 |
| `interrupt <agent-id>` | 给某个智能体发送 Ctrl-C。 |
| `stop <run-id>` | 停止一次运行。需要 `--yes` 或 `ALLOW_DESTRUCTIVE=1`。 |
| `kill <agent-id>` | 停止某个智能体。需要 `--yes` 或 `ALLOW_DESTRUCTIVE=1`。 |
| `setup` | 首次运行检查。加上 `--attach` 会连接每个已安装的宿主 CLI。 |
| `doctor` | 检查 Node、tmux、状态和提供方 CLI。 |
| `web` | 启动只监听回环地址的 Web UI。 |
| `providers` | 列出提供方 id、别名、模型以及是否可用。 |
| `approvals` | 列出待处理的审批请求。 |
| `approve` / `deny` | 处理一条审批请求。 |
| `hosts` | 显示哪些宿主 CLI 已附加 ReevesAgents。 |
| `attach [cli]` | 把 Agent Control MCP 连接到一个宿主 CLI，或所有已安装的宿主。 |
| `detach <cli>` | 从某个宿主 CLI 上移除这个 MCP 连接。 |
| `skills [action]` | 安装、移除或查看 ReevesAgents 技能。 |
| `mcp` | 通过 stdio 启动 MCP 服务器，由宿主 CLI 调用。 |
| `config [key] [value]` | 查看或修改可编辑的设置。 |
| `presets` | 列出已保存的运行预设。 |
| `save-preset` | 把一次正在进行的运行保存为预设。 |
| `start-preset` | 从预设启动一次运行。 |
| `delete-preset` | 删除一个预设。 |
| `delete` | 删除一条已结束的智能体记录。需要确认。 |
| `delete-run` | 删除一次已结束的运行并将其归档。需要确认。 |
| `history` | 列出已归档的运行。 |
| `delete-history` | 删除一条归档的历史记录。需要确认。 |
| `reap` | 结束僵尸智能体和超过 `max_lifetime_ms` 的智能体，并清理没有任何运行记录认领的孤立 tmux 会话。 |

常用参数：

- `--json`：面向脚本的列表和操作命令都支持。
- `--name <name>`：给运行命名。
- `--cwd <dir>`：让智能体在指定目录里运行。
- `--prompt <text>`：把启动文本粘贴给每个新生成的智能体。
- `--skip`：跳过提供方的权限提示，供无人值守的工作智能体使用。
- `--run <run-id>`：把智能体加到指定的运行里。
- `--port <n>` 和 `--no-open`：Web UI 的启动选项。

</details>

<a id="agent-control"></a>
<details>
<summary><strong>Agent Control</strong></summary>

Agent Control 是一个可选的 MCP 服务器。只把它附加到你放心交出本地工具控制权的 CLI 上：

```sh
reevesagents attach claude
reevesagents hosts
```

重启之后，那个 CLI 会拿到 `spawn`、`read`、`send_text`、`send_key`、`interrupt`、`kill`、`stop` 等工具，还能管理审批、管理预设和查看宿主。提供方目录也以 `reevesagents://providers` 的形式公开。

工作智能体默认拿不到这个 MCP。如果某个工作智能体需要自己再创建工作智能体，就把 ReevesAgents 明确附加到那个工作智能体的 CLI 上。

Codex 默认会把 MCP 调用放进沙箱，这会拦住 tmux 的启动。用 Codex 当宿主去驱动智能体时，要给它完整权限，例如 `codex --sandbox danger-full-access`，或者使用一个设置了 `sandbox_mode = "danger-full-access"` 的 Codex profile。

完整的工具参考：[docs/mcp.md](../mcp.md)。写给智能体的操作指南：[AGENTS.md](../../AGENTS.zh-Hans.md)。

</details>

<a id="configuration"></a>
<details>
<summary><strong>配置</strong></summary>

状态保存在 `~/.reeves` 下：

```text
~/.reeves/
  config.json
  presets/
  runs/
  history/
```

有两个环境变量可以覆盖默认路径：

- `REEVES_REGISTRY`：覆盖 `runs/`、`history/` 和 `presets/` 所在的状态根目录。
- `REEVES_CONFIG`：覆盖配置文件路径。

每个 tmux 服务器只对应一个注册表：后台的孤立会话清理会拿当前注册表来判断会话归属，所以两个注册表不能共用同一个 tmux 服务器。

任何可能包含机密的内容，在写入文件之前都会先被清除。

</details>

<a id="examples"></a>
<details>
<summary><strong>示例</strong></summary>

把一个项目分给多个 CLI：

```sh
reevesagents spawn deepseek:backend claude-code:product codex:review \
  --name "feature x" \
  --prompt "Backend, product copy, and a review pass."
```

先看看某个智能体的输出，再打开它的窗口：

```sh
reevesagents peek backend -n 40
reevesagents open backend
```

活干完了，就停掉这次运行：

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

Web UI 只绑定 `127.0.0.1`，在前台运行。关掉页面后智能体会继续运行，因为它们住在 tmux 里。

Web UI 用到两个可选的运行时模块：`ws` 和 `@lydell/node-pty`。npm 默认会安装它们。没有它们，CLI 和 TUI 命令照常可用，`reevesagents web` 也会说明缺了什么。

要从另一台机器访问，用 SSH 转发这个回环端口：

```sh
ssh -L 8080:127.0.0.1:8080 user@host
```

</details>

<a id="troubleshooting"></a>
<details>
<summary><strong>故障排查</strong></summary>

**没有安装 tmux。** 装好 tmux，然后运行 `reevesagents doctor`。TUI 会自动把自己包进一个名为 `reeves` 的 tmux 会话；设置 `REEVES_NO_TMUX_WRAPPER=1` 可以跳过这一步。

**某个提供方 CLI 缺失或已退出登录。** ReevesAgents 启动的是已经在 `PATH` 里、并且完成认证的提供方 CLI。`reevesagents doctor` 会显示检测到了哪些。如果某个启动的窗口停在登录界面，`peek` 能看到。

**Web UI 报告缺少包。** 在启用可选依赖的情况下重新安装，然后运行 `reevesagents doctor`。

**端口已被占用。** `reevesagents web` 默认从 `8080` 开始。如果它被占用，服务器会在一个小范围内绑定下一个空闲端口，并打印出 URL。

</details>

<a id="contributing"></a>
<details>
<summary><strong>参与贡献</strong></summary>

贡献者文档在 [docs/](..) 下。建议从 [CONTRIBUTING.md](../../.github/CONTRIBUTING.md)、[测试](../testing.md) 和 [发布](../releasing.md) 读起。

普通用户用不到开发工具链。贡献者在仓库里使用 pnpm、TypeScript、tsup、Vitest 和 ESLint。

</details>

## 链接

- 网站：https://reevesagents.mertkayacs.com
- npm：https://www.npmjs.com/package/reevesagents
- GitHub：https://github.com/mertkayacs/reevesagents
- 发行版：https://github.com/mertkayacs/reevesagents/releases
- 问题反馈：https://github.com/mertkayacs/reevesagents/issues
- 更新日志：[CHANGELOG.md](../../CHANGELOG.md)
- 许可证：[Apache-2.0](../../LICENSE)
