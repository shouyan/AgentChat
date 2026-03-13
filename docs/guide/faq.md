# FAQ

## 基础问题

### AgentChat 是什么？

AgentChat 是一个本地优先、自托管的 AI 编程代理控制台。你可以在自己的电脑上运行会话，再通过网页、手机或飞书私聊远程查看、发消息和审批权限。

### AgentChat 这个名字是什么意思？

AgentChat（曾经也有人叫它“哈皮”）强调的是“把 AI Agent 对话和控制面统一起来”，让你不用一直被困在终端里。

### 它免费吗？

是的。AgentChat 是开源软件，许可证为 **AGPL-3.0-only**。

### 支持哪些 Agent？

当前支持：

- Claude Code
- Codex
- Cursor Agent
- Gemini
- OpenCode

## 安装与部署

### 我一定要单独部署一个 Hub 吗？

AgentChat 的 Hub 是核心组件，但它已经内置在 AgentChat 里。你只需要运行：

```bash
agentchat hub
```

或源码模式下：

```bash
bun run dev:hub
```

### 手机怎么访问？

局域网访问时，通常是：

```text
http://<你的电脑 IP>:3217
```

如果要通过公网访问：

- 请务必放到 HTTPS 后面
- 或使用 Cloudflare Tunnel、Tailscale、ngrok 等隧道方案

### `CLI_API_TOKEN` 是做什么的？

它是 Hub、Runner 和 Web 登录共用的访问令牌，用来控制谁可以接入你的 AgentChat。

### 支持多账号吗？

支持轻量隔离方式：**namespace**。详见 [Namespace（高级）](./namespace.md)。

## 使用问题

### 如何远程审批权限？

当 Agent 请求权限时：

1. 打开 Web / PWA
2. 进入对应会话
3. 在会话里批准或拒绝该请求

### 能从手机给 Agent 发消息吗？

可以。打开会话后直接在聊天框输入即可。

### 能远程打开终端吗？

可以。进入会话的 **Terminal** 页面。

### 能在终端附着已有会话吗？

可以：

```bash
agentchat attach <sessionId>
```

attach 后你可以：

- 查看实时消息
- 从终端继续发送消息
- detach 不会结束底层会话

### 能远程创建会话吗？

可以，但要求 runner 在线：

1. 启动 `agentchat runner start-sync`
2. 在 Web 里看到在线机器
3. 从网页里选择目录和 Agent 类型创建会话

## 安全问题

### 数据会上传到 AgentChat 官方服务器吗？

不会。AgentChat 是本地优先的：

- 会话数据存在你的机器上
- 数据库默认在 `~/.agentchat/`
- 是否对公网开放，由你自己决定

### Token 登录安全吗？

本地环境下足够实用；如果要对外提供访问，**必须使用 HTTPS**，并使用强随机 token。

### 别人能访问我的实例吗？

只有知道你的访问 token 的人才能登录。所以建议：

- 使用强 token
- 公网环境必须走 HTTPS
- 优先用 Tailscale 之类的私网方案

## 飞书问题

### 飞书支持群聊吗？

0.0.1 暂不支持。当前只支持**私聊文本消息**。

### 飞书里为什么提示用户未绑定 namespace？

说明你还没有给该飞书 `open_id` 配置映射。最简单做法是设置：

```ini
FEISHU_USER_BINDINGS=ou_xxx:default
```

详见 [飞书接入](./feishu.md)。

## 还有问题怎么办？

先看：

- [故障排查](./troubleshooting.md)
- [Provider 配置](./provider-setup.md)
- [飞书接入](./feishu.md)
