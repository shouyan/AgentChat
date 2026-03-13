# 故障排查

这份文档收集了 AgentChat 首次安装和日常使用中最常见的问题。

## 先做这三步

出问题时，先执行：

```bash
bun run typecheck
bun run test
bun run smoke:web
```

如果你使用的是 Release 版，至少先确认：

```bash
agentchat --help
agentchat doctor
```

## 登录相关

### 页面提示 “Invalid access token”

检查：

- 你输入的 token 是否和 Hub 使用的是同一个
- token 有没有多余空格
- namespace 是否正确（例如 `base:alice`）

### 浏览器提示连接失败 / Connection refused

检查：

- Hub 是否在运行
- 端口 `3217` 是否被占用
- 浏览器访问的地址是否正确
- 如果是源码模式，Web dev server 是否真的在 `4173` 上运行

## Runner 相关

### 网页里没有在线机器

检查：

- `agentchat runner start-sync` 是否真的启动成功
- `AGENTCHAT_API_URL` 是否指向正确的 Hub
- `CLI_API_TOKEN` 是否一致
- 是否使用了错误的 namespace

### Runner 起不来

可以先看：

```bash
agentchat runner status
agentchat runner logs
```

如果怀疑状态文件锁有问题，再检查：

- `~/.agentchat/runner.state.json`
- `~/.agentchat/runner.state.json.lock`

## Provider 相关

### Claude 在本机 shell 可用，但 AgentChat 里不可用

通常说明：

- shell 里有环境变量
- 但 `~/.agentchat/runner.env` 没同步

请把正确的 provider 配置写进 `runner.env`，然后**新建一个会话**再试。

### 页面显示 Provider 未配置

检查：

- 键名是否完全匹配
- 是否保存成功
- 是否误用了旧会话验证

## 会话相关

### 新建会话失败

检查：

- 目标机器是否在线
- 该机器上对应 Agent CLI 是否已安装
- 工作目录是否存在且可访问
- provider 是否已配置

### `agentchat attach <sessionId>` 无法附着

检查：

- sessionId 是否存在
- 该会话是否属于当前 namespace
- Hub 和 CLI 使用的 token 是否一致
- 是否在交互式终端里执行 attach

### attach 能看到消息但发送失败

当前 attach 已支持失败提示与重试。你可以：

- 直接按 `Enter` 重试当前输入
- 按 `Ctrl-U` 清空当前输入
- 用 `/refresh` 刷新会话快照

## 飞书相关

### 飞书提示用户未绑定 namespace

检查：

```ini
FEISHU_USER_BINDINGS=ou_xxx:default
```

### 飞书里发消息后提示没有在线机器

说明：

- 飞书消息已到达 Hub
- 但当前 namespace 下没有在线 runner 机器

### 飞书里 provider/runtime 错误直接返回

这是预期行为，便于你直接在聊天窗口看到错误原因。

## 如何收集更多信息

### 查看日志目录

默认日志目录在：

- `~/.agentchat/logs/`

### 运行诊断

```bash
agentchat doctor
```

### 在本地复现最小链路

建议按这个顺序：

1. 先本地启动 hub
2. 再本地启动 runner
3. 再从 Web 登录
4. 新建会话
5. 发一条最简单的消息

这样最容易定位到底是 Hub、Runner、Provider 还是前端链路的问题。
