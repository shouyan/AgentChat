# Provider 配置

AgentChat 0.0.5 使用**机器级** `runner.env` 作为 provider 配置的事实来源。

但这份配置是**可选的**，不是启动 AgentChat 的前置必填项。

## 配置文件位置

每台运行 runner 的机器都会读取：

- `~/.agentchat/runner.env`

只有在**启动新会话**时，AgentChat 才会把这个文件里的环境变量注入到新的 Agent 进程中。

> 这意味着：你修改 `runner.env` 后，**旧会话不会自动生效**，需要新建一个会话再验证。

## 什么时候才需要填

只有在你确实要给 Runner 注入 **Claude / Gemini 的 API 信息、网关地址、默认模型别名** 时，才需要编辑这份文件。

如果你当前：

- 只使用 Codex / Cursor Agent / OpenCode
- 暂时不用 Claude / Gemini
- 或你的 Claude Code / Gemini 方案已经在本机独立配置好了

那 `runner.env` 可以先留空。

## 当前内置管理的键

```ini
ANTHROPIC_BASE_URL=
ANTHROPIC_AUTH_TOKEN=
ANTHROPIC_DEFAULT_OPUS_MODEL=
ANTHROPIC_DEFAULT_SONNET_MODEL=
ANTHROPIC_DEFAULT_HAIKU_MODEL=
GOOGLE_GEMINI_BASE_URL=
GEMINI_API_KEY=
```

## 不同 Agent 的配置方式

### Claude Code

如果你要通过 Runner 显式传入 Claude 相关配置，常见写法是：

```ini
ANTHROPIC_BASE_URL=https://your-claude-gateway.example.com
ANTHROPIC_AUTH_TOKEN=your-token
```

可选：指定默认模型别名

```ini
ANTHROPIC_DEFAULT_OPUS_MODEL=claude-opus-4
ANTHROPIC_DEFAULT_SONNET_MODEL=claude-sonnet-4
ANTHROPIC_DEFAULT_HAIKU_MODEL=claude-haiku-4
```

### Gemini

如果你要通过 Runner 显式传入 Gemini API：

```ini
GOOGLE_GEMINI_BASE_URL=https://generativelanguage.googleapis.com
GEMINI_API_KEY=your-key
```

### Codex / Cursor / OpenCode

这几个更多依赖各自 CLI 的本地安装与登录状态。AgentChat 会检测它们是否可用，但不一定通过 `runner.env` 管理其全部认证信息。

建议你先在本机终端确认对应 CLI 已能独立工作，再接入 AgentChat。

## 两种编辑方式

### 方式一：本地直接编辑

用任意编辑器打开：

- `~/.agentchat/runner.env`

### 方式二：在 Web 中编辑

进入：

- **Settings → Machines & providers**

在机器对应的 **Runner environment** 文本框里修改并保存。

## 推荐验证方式

修改完成后：

1. 保存 `runner.env`
2. 新建一个全新的会话
3. 在新会话里发送一条最简单的消息
4. 再看 Provider 是否真正生效

如果你没有要改的 Provider 项，这一步可以跳过。

## 常见问题

### 本机终端里 Claude 能用，但 AgentChat 里 Claude 不能用

通常是因为：

- 你的 shell profile 里有 provider 环境变量
- 但 `runner.env` 里没有

AgentChat Runner 启动新会话时，读的是 `runner.env`，不是你的 shell 当前临时状态。

### 页面显示 Provider 未配置

如果你本来就没打算用对应 Provider，这并不一定是问题。

只有在你确实要用该 Provider，却又期望它由 Runner 环境变量提供配置时，才需要继续检查：

检查：

- 键名是否完全一致
- 是否误留了旧 token / 旧 base URL
- 是否保存成功
- 是否用新会话验证

### 修改后旧会话没变化

这是预期行为。`runner.env` 只影响**新建会话**。
