<p align="center"><a href="https://reevesagents.mertkayacs.com/zh-Hans/"><img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-banner.gif" width="800" alt="ReevesAgents：让多个 AI 编程助手协同工作"></a></p>

# reevesagents：AI 编程工具的工作区

在你的电脑上并排运行 Claude Code、Codex、Kimi、OpenCode、Hermes 等 AI 编程工具。reevesagents 把它们的终端会话集中在一起，你可以在同一个地方查看每个工具的进展、发送指令、停止运行。

<img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-hero.webp" width="720" alt="一块金框主面板通过细金线连接八块发光的玻璃面板，每块代表运行中的一个工具">

[查看演示](https://reevesagents.mertkayacs.com/zh-Hans/demo/)，或按下面的步骤安装命令行工具。

## 快速上手

需要 Node.js 20.19 或更高版本、tmux 3.0 或更高版本，以及一个已安装并已登录的 AI 编程工具。支持 macOS、Linux 和 WSL。关闭界面后，tmux 会让这些工具继续运行。

```sh
npm install -g reevesagents && reevesagents doctor && reevesagents
```

这条命令会打开终端界面。要使用浏览器界面，运行 `reevesagents web`；它只监听本机的回环地址。

## 启动一个团队

给工具布置任务，启动一次运行：

```sh
reevesagents spawn claude-code:lead codex:tests --name "review" --prompt "审查代码和测试。"
```

在终端界面或浏览器界面中查看输出、指挥每个工具。每个提供方使用自己的登录，并自行发送模型请求。运行状态以 JSON 形式保存在 `~/.reeves` 下。

<img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-newrun-zh-Hans.png" width="720" alt="reevesagents Web UI 新建运行界面：运行名称、可选的工具（如 Claude Code、Codex CLI、Kimi Code）、模型和权限模式">

## 让一个工具指挥其他工具

把可选的 MCP 服务器（Model Context Protocol，AI 工具之间的标准连接方式）接到你信任的宿主工具上：

```sh
reevesagents attach claude && reevesagents hosts
```

重启该宿主以加载连接。之后它就能启动、读取、指挥和停止其他工具。工作者默认不会获得 MCP 连接。请保持各提供方的权限确认处于开启状态，并在执行敏感操作前检查审批请求。

在 Claude Code 中，可以把连接和使用说明作为插件一起安装：

```sh
claude plugin marketplace add mertkayacs/reevesagents
claude plugin install reevesagents@reevesagents
```

其他宿主可以通过 [reevesagents skill](https://github.com/mertkayacs/reevesagents-skill) 获取使用说明。工具列表和宿主要求见 [MCP 参考文档](../mcp.md)。

该服务器已收录在[官方 MCP Registry](https://registry.modelcontextprotocol.io/?q=io.github.mertkayacs/reevesagents) 中，名称为 `io.github.mertkayacs/reevesagents`。

<img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-steer.webp" width="560" alt="金框主面板沿金线向另外三块面板发送消息">

## 选择界面

| 界面 | 用途 |
| --- | --- |
| 终端界面 | 用键盘查看和控制运行 |
| Web UI | 在浏览器中查看运行、实时输出、审批和历史记录 |
| 命令行 | 在脚本中启动运行并读取输出 |
| MCP 服务器 | 让一个受信任的 AI 编程工具指挥团队 |

<details>
<summary>Web UI 截图</summary>

<img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-web-zh-Hans.png" width="720" alt="尚无运行时的 reevesagents Web UI：空的智能体列表、新运行按钮以及语言和设置控件">

</details>

## 文档

- [用户指南](https://reevesagents.mertkayacs.com/zh-Hans/docs/): 安装、命令和配置。
- [常见问题](https://reevesagents.mertkayacs.com/zh-Hans/faq/): 提供方设置和故障排查。
- [MCP 参考文档](../mcp.md): 工具和宿主连接（英文）。
- [贡献指南](../../.github/CONTRIBUTING.md)、[测试](../testing.md)和[更新日志](../../CHANGELOG.md)（英文）。

其他语言： [English](../../README.md), [Deutsch](README.de.md), [Français](README.fr.md), [Español](README.es.md), [Português](README.pt.md), [Italiano](README.it.md), [Türkçe](README.tr.md), [Русский](README.ru.md), [العربية](README.ar.md).

## 许可证

[Apache-2.0](../../LICENSE). 可在 [npm](https://www.npmjs.com/package/reevesagents) 上获取。

<a href="https://eschatialabs.com"><picture><source media="(prefers-color-scheme: dark) and (min-resolution: 2dppx)" srcset="https://eschatialabs.com/brand/lockup-46-dark@2x.png"><source media="(prefers-color-scheme: dark)" srcset="https://eschatialabs.com/brand/lockup-46-dark@1x.png"><source media="(min-resolution: 2dppx)" srcset="https://eschatialabs.com/brand/lockup-46@2x.png"><img src="https://eschatialabs.com/brand/lockup-46@1x.png" width="124" height="46" alt="Eschatia Labs"></picture></a><br>[Eschatia Labs](https://eschatialabs.com) 项目，作者 [Mert Kaya](https://mertkayacs.com)。
