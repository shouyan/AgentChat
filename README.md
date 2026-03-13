# AgentChat

AgentChat 是一个**本地优先**的 AI 编程代理控制台：你在自己的机器上运行 Claude Code、Codex、Cursor Agent、Gemini 或 OpenCode，再通过网页、手机 PWA、飞书私聊远程查看、发消息、审批权限和管理会话。

> 说明：文档里的 `https://github.com/<你的组织>/<你的仓库名>` 仍是占位符。等你创建好 GitHub 仓库后，我再统一替换成最终地址。

当前版本：**0.0.1**

## 核心能力

- 在本机运行 AI 编程代理，数据保留在自己的机器上
- 通过 Web / PWA 远程查看会话、发消息、审批权限
- Runner 模式支持从网页远程创建新会话
- 支持多 Agent：Claude Code、Codex、Cursor Agent、Gemini、OpenCode
- 支持飞书私聊机器人查看进度、切换会话、直接发消息
- 支持 `agentchat attach <sessionId>` 在终端附着已有会话并继续发送消息

## 安装方式

AgentChat 首发先提供两种安装方式：

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

## Provider 配置

AgentChat 读取**机器级** provider 配置文件：

- `~/.agentchat/runner.env`

当前内置管理的键：

```ini
ANTHROPIC_BASE_URL=
ANTHROPIC_AUTH_TOKEN=
ANTHROPIC_DEFAULT_OPUS_MODEL=
ANTHROPIC_DEFAULT_SONNET_MODEL=
ANTHROPIC_DEFAULT_HAIKU_MODEL=
GOOGLE_GEMINI_BASE_URL=
GEMINI_API_KEY=
```

你也可以在 Web 的 **Machines & providers** 页面直接编辑同一个 `runner.env` 文件。

文档：[`docs/guide/provider-setup.md`](docs/guide/provider-setup.md)

## 飞书支持

0.0.1 当前支持：

- 飞书**私聊机器人**文本消息
- `/help`、`/sessions`、`/use`、`/progress`、`/new`、`/model`、`/pwd`、`/status`、`/web`
- 将普通文本转发到当前 active 会话或群组

当前不支持：

- 飞书群聊绑定
- 文件 / 图片消息
- OAuth 账号绑定流程
- 复杂交互卡片

文档：[`docs/guide/feishu.md`](docs/guide/feishu.md)

## 支持平台

0.0.1 目标平台：

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

