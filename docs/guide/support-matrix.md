# 支持矩阵

本文给出 AgentChat 0.0.4 当前的目标平台和主要能力范围。

## 平台支持

| 平台 | 架构 | 说明 |
| --- | --- | --- |
| macOS | `arm64`、`x64` | 当前最佳路径 |
| Linux | `arm64`、`x64` | 适合服务器、自托管环境 |
| Windows | `x64` | 基础可用，但 Web Terminal 暂不支持 |

## Agent 支持概览

| Agent | 说明 |
| --- | --- |
| Claude Code | 推荐路径，功能最完整 |
| Codex | 支持本地与远程控制，适合 OpenAI 工作流 |
| Cursor Agent | 支持从本机或 Web 控制 Cursor Agent CLI |
| Gemini | 通过 ACP 接入 |
| OpenCode | 通过 ACP 接入 |

## 0.0.4 已知限制

- Windows 暂不支持 Web Terminal
- `runner.env` 的 provider 变更只影响**新会话**
- 飞书当前只支持**私聊文本消息**
- 飞书暂不支持群绑定、文件/图片消息、OAuth 绑定

## 测试与兼容建议

为了避免跨平台路径问题，测试里建议：

- 不要硬编码 `/tmp`、`/private/tmp`、`/bin/bash` 这类路径
- 路径匹配尽量走仓库内统一的 path normalization 逻辑
- 需要 Web 远程创建会话时，一定保持 runner 在线

## 对外发布建议

如果你准备做公开 Release，建议至少在以下组合上做一次手动验证：

- macOS + Claude
- macOS + Cursor
- Linux + Codex
- Linux + Gemini
- Web 登录 + 创建会话 + 发消息
- `agentchat attach <sessionId>` 附着已有会话
