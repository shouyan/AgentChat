# 飞书接入

AgentChat 0.0.4 当前支持**飞书私聊机器人**。

这一版的推荐思路是：**先走最小接入**。

也就是：

- 建一个飞书应用
- 给它加机器人
- 给机器人开通合理的消息权限
- 在 Hub 里填 `FEISHU_APP_ID` 和 `FEISHU_APP_SECRET`

先让机器人能聊起来；菜单、卡片、多用户隔离这些都属于可选增强项。

## 当前支持范围

### 已支持

- 飞书私聊文本消息
- `/help`、`/sessions`、`/use`、`/progress`
- `/new` 新建会话
- `/model` 查看/切换当前会话模型
- `/pwd`、`/status`、`/web`
- `/permissions`、`/approve`、`/deny`、`/abort`
- 普通文本直接转发到当前 active 会话或群组
- 菜单事件：帮助、会话列表、当前进展、当前请求快捷审批
- 权限请求卡片通知
- 飞书卡片按钮审批

### 暂不支持

- 飞书群聊绑定
- 文件 / 图片消息
- OAuth 账号绑定流程
- 问答型权限请求的结构化回答（仍建议转 Web）

## 接入前提

你需要：

1. 一台已经跑起来的 AgentChat Hub
2. 至少一台在线 Runner 机器
3. 飞书开放平台应用（含机器人）

## 第一步：在飞书开放平台创建应用

建议按下面思路配置：

1. 创建企业自建应用
2. 打开**机器人能力**
3. 确保机器人有基本的消息接收/发送能力
4. 开启**事件订阅**或长连接能力（当前默认推荐长连接）
5. 如有需要，再为机器人添加菜单项，例如：
   - 帮助
   - 最近目标
   - 当前进展
   - 同意当前请求
   - 拒绝当前请求

说明：

- **卡片不是必需项**
- **菜单不是必需项**
- 先把最基础的私聊文本链路打通最重要

> AgentChat 当前更偏向私聊机器人模式，不依赖复杂卡片或群聊场景。

## 第二步：配置 AgentChat 环境变量

最小可用配置：

```ini
CLI_API_TOKEN=your-strong-token

FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
```

只要 `FEISHU_APP_ID` 和 `FEISHU_APP_SECRET` 存在，Hub 就会自动启用飞书集成。

下面这些是**可选增强项**：

```ini

# 默认启用长连接；如果你显式关闭可写 false
FEISHU_LONG_CONNECTION=true

# 默认进入 default namespace；单用户场景通常不需要改
FEISHU_DEFAULT_NAMESPACE=default

# 可选：只允许部分 open_id 使用
FEISHU_ALLOW_OPEN_IDS=ou_xxx,ou_yyy

# 可选：把指定 open_id 映射到不同 namespace
FEISHU_USER_BINDINGS=ou_xxx:default,ou_yyy:alice

# 可选：飞书私聊收到第一条普通文本时自动建会话
FEISHU_AUTO_CREATE_SESSION=true

# 可选：默认使用哪台机器来自动创建会话
FEISHU_DEFAULT_MACHINE_ID=machine-1

# 可选：等待 Agent 回复的超时时间（毫秒）
FEISHU_REPLY_TIMEOUT_MS=90000

# 可选：如果需要生成外链，设置你对外可访问的基础地址
FEISHU_BASE_URL=https://agentchat.example.com

# 可选：启用飞书卡片回调安全校验
FEISHU_CARD_VERIFICATION_TOKEN=
FEISHU_CARD_ENCRYPT_KEY=
```

如果你启用卡片按钮审批，需要把飞书开放平台里的卡片回调地址指到：

```text
https://你的Hub地址/feishu/card
```

## 第三步：理解默认 namespace 行为

默认情况下，如果你没有额外配置用户映射，飞书用户会进入：

- `default` namespace

这已经足够覆盖大多数**单用户自用**场景。

如果你需要更细的隔离，再使用：

- `FEISHU_USER_BINDINGS`
- 或 users 表里的飞书用户映射

## 第四步：启动 Hub 和 Runner

### 启动 Hub

```bash
CLI_API_TOKEN=your-strong-token FEISHU_APP_ID=cli_xxx FEISHU_APP_SECRET=xxx agentchat hub
```

源码方式：

```bash
CLI_API_TOKEN=your-strong-token FEISHU_APP_ID=cli_xxx FEISHU_APP_SECRET=xxx bun run dev:hub
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
7. 触发一个权限请求，确认：
   - 飞书收到审批卡片
   - 菜单按钮 `agentchat_permission_approve / agentchat_permission_deny` 可工作

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
/permissions
/approve 1
/approve current
/approve 1 session
/approve 1 edits
/deny 1
/abort 1
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

菜单是可选项。

推荐给飞书机器人至少配置下面几个菜单入口：

- `agentchat_help`：帮助
- `agentchat_sessions`：最近目标
- `agentchat_progress`：当前进展
- `agentchat_permission_approve`：同意当前请求
- `agentchat_permission_deny`：拒绝当前请求

其中：

- `agentchat_permission_approve` 等价 `/approve current`
- `agentchat_permission_deny` 等价 `/deny current`

这两个快捷菜单会作用于**当前 active 目标下最新一条 pending request**。

如果你更习惯显式确认，也可以保留文本命令流：

```text
/permissions
/approve 1
/deny 1
```

## 常见问题

### 机器人回复“当前飞书账号未绑定 AgentChat namespace”

这种情况通常只会出现在你自己做了额外用户隔离逻辑、或改了默认用户映射行为时。

优先检查：

- `FEISHU_USER_BINDINGS`
- `FEISHU_DEFAULT_NAMESPACE`
- 或你自己的用户映射逻辑 / users 表

### 飞书里发消息后说没有在线机器

说明 Hub 已收到消息，但当前 namespace 没有在线 Runner。

检查：

- runner 是否启动
- runner 是否连到了正确的 hub
- runner 的 token / namespace 是否正确

### Provider 错误直接回到了飞书

这是预期行为。AgentChat 会把 provider/runtime 错误直接返回给用户，便于排查，而不是吞掉错误。

### 飞书卡片按钮点了没反应

优先检查：

- 飞书开放平台里的卡片回调地址是否指向 `/feishu/card`
- `FEISHU_BASE_URL` / 对外域名是否可访问
- 如果启用了安全校验，`FEISHU_CARD_VERIFICATION_TOKEN`、`FEISHU_CARD_ENCRYPT_KEY` 是否与飞书侧一致

### 菜单点击重复触发

AgentChat 已按 `event_id` 去重；如果你仍观察到异常，先检查飞书侧是否真的多次下发事件。

### 普通文本为什么被转发到旧会话？

因为飞书机器人总是把普通文本发送到**当前 active 目标**。你可以先执行：

```text
/sessions
/use 1
```

切换后再继续聊。
