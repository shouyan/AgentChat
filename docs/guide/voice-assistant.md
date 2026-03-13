# 语音助手

AgentChat 提供基于 ElevenLabs Conversational AI 的语音助手，让你通过语音和当前 AI 编程代理交互。

## 能做什么？

- 直接对当前 Agent 说话
- 通过语音批准或拒绝权限请求
- 在任务完成或出错时接收语音摘要

## 前置条件

- 你有一个 ElevenLabs 账号
- 你有 ElevenLabs API Key
- Hub 已正常运行

## 配置方式

### 最小配置

在启动 Hub 之前设置：

```bash
export ELEVENLABS_API_KEY="your-api-key"
agentchat hub
```

源码方式：

```bash
export ELEVENLABS_API_KEY="your-api-key"
bun run dev:hub
```

首次使用时，Hub 会在你的 ElevenLabs 账号下自动创建一个默认语音助手。

### 使用自定义 Agent（可选）

```bash
export ELEVENLABS_AGENT_ID="your-agent-id"
```

## 使用方式

1. 在 Web 中打开一个会话
2. 点击输入区附近的麦克风按钮
3. 按提示授权浏览器使用麦克风
4. 开始说话

## 常见说法示例

| 你可以这样说 | 效果 |
| --- | --- |
| “帮我继续看 auth 模块” | 把请求转发给当前编码 Agent |
| “把登录逻辑重构一下” | 作为新的编码指令发送 |
| “同意” / “允许” | 批准当前权限请求 |
| “拒绝” / “取消” | 拒绝当前权限请求 |

## 背后流程

```text
浏览器 → WebRTC → ElevenLabs ConvAI → 语音助手 → AgentChat Hub → 当前编码 Agent
```

## 常见问题

### 提示没有配置 ElevenLabs API Key

检查是否已设置：

```bash
ELEVENLABS_API_KEY
```

然后重启 Hub。

### 浏览器无法获取麦克风权限

检查：

- 浏览器是否禁止了麦克风
- 是否有其他应用占用了麦克风
- 是否需要刷新页面重试

### 语音响应慢或没有声音

检查：

- 当前会话是否在线
- 网络是否稳定
- ElevenLabs 账号是否仍有可用额度

### 自动创建 ElevenLabs agent 失败

检查：

- API key 是否有效
- 账号额度是否足够
- 或者直接指定 `ELEVENLABS_AGENT_ID`
