# 快速开始

这份文档提供一套**最小可用**的本地启动流程，目标是让你在几分钟内把 AgentChat 跑起来。

## 前置条件

- Node.js 20+
- Bun 1.3+
- 至少安装一个本地 Agent CLI

如果你不想安装 Bun，请改看 [Release 安装](./release-install.md)。

## 第 1 步：准备一个强 token

Hub、Runner 和 Web 登录需要使用同一个 `CLI_API_TOKEN`。

示例：

```bash
export CLI_API_TOKEN="your-strong-token"
```

## 第 2 步：启动 Hub

```bash
bun run dev:hub
```

默认地址：

- `http://127.0.0.1:3217`

## 第 3 步：启动 Web

```bash
bun run dev:web -- --host 0.0.0.0 --port 4173
```

打开：

- `http://127.0.0.1:4173/`

## 第 4 步：启动 Runner

```bash
CLI_API_TOKEN=$CLI_API_TOKEN AGENTCHAT_API_URL=http://127.0.0.1:3217 bun run --cwd cli dev -- runner start-sync
```

如果你想从网页端远程创建会话，这一步必须做。

## 第 5 步：配置 Provider（可选）

编辑：

- `~/.agentchat/runner.env`

只有在你需要给 Runner 显式传入 Claude / Gemini 的 API 或网关地址时，才需要这一步。

最小 Claude 示例：

```ini
ANTHROPIC_BASE_URL=https://your-claude-gateway.example.com
ANTHROPIC_AUTH_TOKEN=your-token
```

最小 Gemini 示例：

```ini
GOOGLE_GEMINI_BASE_URL=https://generativelanguage.googleapis.com
GEMINI_API_KEY=your-key
```

更完整配置见：[Provider 配置](./provider-setup.md)

如果你当前不需要这些配置，可以直接跳到下一步。

## 第 6 步：登录 Web

使用和上面相同的 `CLI_API_TOKEN` 登录。

## 第 7 步：验证最小链路

进入 Web 后，建议按这个顺序验证：

1. **Machines & providers** 页面看到 1 台在线机器
2. 创建新会话
3. 发送一条消息
4. 打开 **Files** 页面
5. 打开 **Terminal** 页面
6. 终端执行 `agentchat attach <sessionId>` 并附着到这个会话

## 常见首屏问题

### 没有在线机器

常见原因：

- runner 没启动
- runner 连到了错误的 hub 地址
- hub 和 runner 的 token 不一致

### Provider 配好了但新会话还是不能用

检查：

- 是否把变量写进了 `runner.env`
- 是否是**新建**会话而不是继续使用旧会话
- 变量名是否完全匹配

### 网页打不开或登录失败

检查：

- hub 是否真的在 `3217` 上运行
- web dev server 是否真的在 `4173` 上运行
- `CLI_API_TOKEN` 是否一致

## 下一步

- 看 [安装总览](./installation.md)
- 看 [Release 安装](./release-install.md)
- 看 [源码安装](./source-install.md)
- 看 [飞书接入](./feishu.md)
