# Cursor Agent

AgentChat 支持接入 [Cursor Agent CLI](https://cursor.com/docs/cli/using)，让你在本机运行 Cursor Agent，同时通过网页或手机远程查看和控制。

## 前置条件

先安装 Cursor Agent CLI。

### macOS / Linux

```bash
curl https://cursor.com/install -fsS | bash
```

### Windows

```powershell
irm 'https://cursor.com/install?win32=true' | iex
```

验证安装：

```bash
agent --version
```

## 常用命令

```bash
agentchat cursor
agentchat cursor resume <chatId>
agentchat cursor --continue
agentchat cursor --mode plan
agentchat cursor --mode ask
agentchat cursor --yolo
agentchat cursor --model <model>
```

## 使用方式

### 本地模式

适合直接在终端工作：

- 交互最完整
- 键盘反馈最快
- 适合长时间本地专注编码

### 远程模式

适合从 Web / PWA 继续操作：

- 可以在网页端查看与发消息
- 可以远程审批权限
- 如果 runner 在线，也可以从网页端直接创建 Cursor 会话

## 与 AgentChat 的联动

Cursor 会话启动后，会出现在 AgentChat 的 Web / PWA 中。你可以：

- 查看会话活动
- 在远程界面继续发送消息
- 用 `agentchat attach <sessionId>` 在终端重新附着已有会话

## 相关文档

- [工作原理](./how-it-works.md)
- [支持矩阵](./support-matrix.md)
