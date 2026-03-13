# 飞书接入

AgentChat 0.0.2 当前支持**飞书私聊机器人**。

## 当前支持范围

### 已支持

- 飞书私聊文本消息
- `/help`、`/sessions`、`/use`、`/progress`
- `/new` 新建会话
- `/model` 查看/切换当前会话模型
- `/pwd`、`/status`、`/web`
- 普通文本直接转发到当前 active 会话或群组
- 菜单事件：帮助、会话列表、当前进展

### 暂不支持

- 飞书群聊绑定
- 文件 / 图片消息
- OAuth 账号绑定流程
- 复杂交互卡片

## 接入前提

你需要：

1. 一台已经跑起来的 AgentChat Hub
2. 至少一台在线 Runner 机器
3. 飞书开放平台应用（含机器人）
4. 能拿到飞书用户的 `open_id`，用于绑定 namespace

## 第一步：在飞书开放平台创建应用

建议按下面思路配置：

1. 创建企业自建应用
2. 打开**机器人能力**
3. 开启**事件订阅**或长连接能力（当前更推荐长连接）
4. 为机器人添加菜单项，例如：
   - 帮助
   - 最近目标
   - 当前进展

> AgentChat 当前更偏向私聊机器人模式，不依赖复杂卡片或群聊场景。

## 第二步：配置 AgentChat 环境变量

以下变量由 Hub 在启动时读取：

```ini
CLI_API_TOKEN=your-strong-token

FEISHU_ENABLED=true
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx

# 默认启用长连接；如果你显式关闭可写 false
FEISHU_LONG_CONNECTION=true

# 可选：只允许部分 open_id 使用
FEISHU_ALLOW_OPEN_IDS=ou_xxx,ou_yyy

# 推荐：直接把 open_id 映射到 namespace
FEISHU_USER_BINDINGS=ou_xxx:default,ou_yyy:alice

# 可选：飞书私聊收到第一条普通文本时自动建会话
FEISHU_AUTO_CREATE_SESSION=true

# 可选：默认使用哪台机器来自动创建会话
FEISHU_DEFAULT_MACHINE_ID=machine-1

# 可选：等待 Agent 回复的超时时间（毫秒）
FEISHU_REPLY_TIMEOUT_MS=90000

# 可选：如果需要生成外链，设置你对外可访问的基础地址
FEISHU_BASE_URL=https://agentchat.example.com
```

## 第三步：绑定用户到 namespace

最简单方式是配置：

```ini
FEISHU_USER_BINDINGS=ou_xxx:default
```

含义：

- 当飞书 `open_id=ou_xxx` 的用户私聊机器人时
- 它会进入 AgentChat 的 `default` namespace

如果不做绑定，机器人会提示：当前飞书账号未绑定 namespace。

## 第四步：启动 Hub 和 Runner

### 启动 Hub

```bash
CLI_API_TOKEN=your-strong-token FEISHU_ENABLED=true FEISHU_APP_ID=cli_xxx FEISHU_APP_SECRET=xxx FEISHU_USER_BINDINGS=ou_xxx:default agentchat hub
```

源码方式：

```bash
CLI_API_TOKEN=your-strong-token FEISHU_ENABLED=true FEISHU_APP_ID=cli_xxx FEISHU_APP_SECRET=xxx FEISHU_USER_BINDINGS=ou_xxx:default bun run dev:hub
```

### 启动 Runner

```bash
CLI_API_TOKEN=your-strong-token AGENTCHAT_API_URL=http://127.0.0.1:3217 agentchat runner start-sync
```

如果没有在线机器，飞书会直接把错误返回给用户，而不是静默失败。

## 第五步：首次联调

建议按这个顺序测试：

1. 飞书私聊机器人发送 `/help`
2. 发送 `/sessions`
3. 发送 `/new`
4. 再发送一条普通文本，例如“帮我看下当前项目状态”
5. 发送 `/progress`
6. 发送 `/web` 看能否拿到当前会话的 Web 链接

## 常用命令

```text
/help
/progress
/sessions
/use 1
/new
/new codex
/new gemini
/new /Users/name/project
/model
/model list
/model gpt-5.4
/pwd
/status
/web
```

### `/new` 示例

```text
/new
/new codex
/new gemini
/new agent=codex
/new /Users/name/project
/new codex /Users/name/project
/new agent=codex path=/Users/name/project
```

## 菜单建议

推荐给飞书机器人配置三个菜单入口：

- 帮助
- 最近目标
- 当前进展

这样最符合 AgentChat 当前能力边界，也最稳定。

## 常见问题

### 机器人回复“当前飞书账号未绑定 AgentChat namespace”

说明你的 `open_id` 还没有映射到 namespace。

优先检查：

- `FEISHU_USER_BINDINGS`
- 或你自己的用户映射逻辑

### 飞书里发消息后说没有在线机器

说明 Hub 已收到消息，但当前 namespace 没有在线 Runner。

检查：

- runner 是否启动
- runner 是否连到了正确的 hub
- runner 的 token / namespace 是否正确

### Provider 错误直接回到了飞书

这是预期行为。AgentChat 会把 provider/runtime 错误直接返回给用户，便于排查，而不是吞掉错误。

### 菜单点击重复触发

AgentChat 已按 `event_id` 去重；如果你仍观察到异常，先检查飞书侧是否真的多次下发事件。

### 普通文本为什么被转发到旧会话？

因为飞书机器人总是把普通文本发送到**当前 active 目标**。你可以先执行：

```text
/sessions
/use 1
```

切换后再继续聊。
