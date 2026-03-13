# AgentChat

AgentChat 是一个**本地优先的 AI Agent 远程控制台**。

你可以在自己的机器上运行 **Claude Code、Codex、Gemini、Cursor Agent、OpenCode**，然后通过：

- **远程网页 / PWA**
- **飞书 App 里的机器人会话**

去查看会话、发消息、审批权限、切换目标、继续推进任务。

它不只是“把终端搬到网页上”。

AgentChat 还支持 **多 Agent 群组 / Rooms**：你可以把 **Claude Code、Codex、Gemini、Cursor Agent、OpenCode** 这样的不同 Agent 放进同一个协作群组，让它们围绕同一个任务分工、对话、协调和推进工作。

GitHub 仓库：

- `https://github.com/shouyan/AgentChat`

当前版本：**0.0.3**

## 这个项目能做什么

### 1. 远程控制本地 Agent

你在本机或服务器上运行 Agent，AgentChat 负责把控制面开放到：

- Web
- 手机 PWA
- 飞书私聊机器人

适合这些场景：

- 人不在电脑前，但要继续盯 Claude Code / Codex 的执行进度
- 在手机上给会话补一句指令
- 在网页上审批权限、查看文件、打开终端
- 在飞书里直接问“现在做到哪了”

### 2. 多 Agent 群组协作

你可以创建一个多 Agent 群组，把不同能力的 Agent 拉进来，例如：

- Claude Code 负责主实现
- Codex 负责另一路方案或测试修复
- Gemini 负责总结、检索、结构化输出
- Cursor Agent / OpenCode 负责特定工具链或独立任务

然后让它们在一个群组里围绕同一目标持续协作。

这类场景适合：

- 一个 Agent 写代码，另一个 Agent 补测试
- 一个 Agent 做规划，另一个 Agent 落地实现
- 多条实现路线并行探索，再由协调者汇总

## 核心能力

- 通过 **网页 / PWA / 飞书 App** 远程控制本地 Agent
- 支持 **Claude Code、Codex、Gemini、Cursor Agent、OpenCode**
- 支持 **多 Agent 群组协作**
- 支持从网页端**远程创建新会话**
- 支持查看会话消息、文件、终端、机器状态
- 支持 `agentchat attach <sessionId>` 回到终端继续附着已有会话
- 数据和运行环境保留在你自己的机器上

## 安装方式

AgentChat 当前提供两种安装方式：

### 1. GitHub Release 安装

适合普通用户。

- 从 GitHub Releases 下载当前平台对应的二进制
- 解压后直接运行 `agentchat`
- 不需要先安装 Bun

文档：[`docs/guide/release-install.md`](docs/guide/release-install.md)

### 2. 源码安装

适合开发者、贡献者、需要修改源码的用户。

- 克隆仓库
- `bun install`
- 从仓库根目录启动 hub / web / runner

文档：[`docs/guide/source-install.md`](docs/guide/source-install.md)

## 5 分钟快速开始

### 前置条件

- Node.js 20+
- Bun 1.3+
- 至少安装一个本地 Agent CLI

### 最小本地启动（源码方式）

```bash
bun install

# 终端 1：启动 hub
CLI_API_TOKEN=your-strong-token bun run dev:hub

# 终端 2：启动 web 开发服务器
bun run dev:web -- --host 0.0.0.0 --port 4173

# 终端 3：启动 runner
CLI_API_TOKEN=your-strong-token AGENTCHAT_API_URL=http://127.0.0.1:3217 bun run --cwd cli dev -- runner start-sync
```

打开：

- Web：`http://127.0.0.1:4173/`
- 登录 token：和上面相同的 `CLI_API_TOKEN`

然后检查：

1. **Machines & providers** 页面能看到在线机器
2. 创建一个新会话
3. 发一条消息
4. 打开 **Files** 或 **Terminal** 页面确认联通

更完整说明见：[`docs/guide/quick-start.md`](docs/guide/quick-start.md)

## Provider 配置（可选）

Provider 配置是**可选项**，不是必填项。

只有在你确实需要给 Runner 注入 **Claude / Gemini 的 API 信息或网关地址** 时，才需要编辑：

- `~/.agentchat/runner.env`

例如：

```ini
ANTHROPIC_BASE_URL=
ANTHROPIC_AUTH_TOKEN=
GOOGLE_GEMINI_BASE_URL=
GEMINI_API_KEY=
```

如果你当前：

- 不打算用 Claude / Gemini
- 或本机上的 Claude Code / Gemini 方案本来就已经能独立工作

那这些值都可以先留空，不需要为了启动 AgentChat 硬填。

你也可以在 Web 的 **Machines & providers** 页面直接编辑同一个 `runner.env` 文件。

文档：[`docs/guide/provider-setup.md`](docs/guide/provider-setup.md)

## 飞书接入

AgentChat 支持在**飞书 App**里通过机器人远程控制会话。

最小接入思路：

1. 在飞书开放平台创建应用
2. 给应用添加机器人
3. 给机器人开通合理的消息权限
4. 在 Hub 环境变量里填入：
   - `FEISHU_APP_ID`
   - `FEISHU_APP_SECRET`
5. 启动 Hub 和 Runner

默认情况下，飞书用户会进入 `default` namespace；如果你需要更细的多用户隔离，再额外配置：

- `FEISHU_USER_BINDINGS`
- 或 users 表里的飞书用户映射

说明：

- 菜单是可选的
- 卡片不是必需项
- 当前最稳定的是**私聊机器人文本交互**

文档：[`docs/guide/feishu.md`](docs/guide/feishu.md)

## 支持平台

0.0.3 目标平台：

- macOS `arm64` / `x64`
- Linux `arm64` / `x64`
- Windows `x64`

已知限制：

- Windows 暂不支持 Web Terminal

更多见：[`docs/guide/support-matrix.md`](docs/guide/support-matrix.md)

## 发布前建议检查

```bash
bun run typecheck
bun run test
bun run smoke:web
```

`bun run smoke:web` 会拉起一个临时 hub / web / runner，自动登录 Web、创建会话、保存截图，再自动清理。

常用覆盖参数：

- `SMOKE_AGENT=cursor`
- `SMOKE_DIRECTORY=/absolute/path/to/project`
- `SMOKE_BROWSER_CHANNEL=chrome`
- `SMOKE_BROWSER_EXECUTABLE_PATH=/path/to/browser`
- `SMOKE_HEADED=1`

## 文档索引

- [文档首页](docs/index.md)
- [安装总览](docs/guide/installation.md)
- [Release 安装](docs/guide/release-install.md)
- [源码安装](docs/guide/source-install.md)
- [快速开始](docs/guide/quick-start.md)
- [Provider 配置](docs/guide/provider-setup.md)
- [飞书接入](docs/guide/feishu.md)
- [FAQ](docs/guide/faq.md)
- [故障排查](docs/guide/troubleshooting.md)

## 开源与许可证

- License：**AGPL-3.0-only**
- 欢迎自托管、二次开发与提交 PR

## 致谢

本项目的整体思路与部分实现参考了 HAPI 项目：

- `https://github.com/tiann/hapi`
