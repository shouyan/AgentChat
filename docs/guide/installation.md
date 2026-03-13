# 安装总览

这份文档用于帮你判断应该使用哪种安装方式，以及每种方式分别适合谁。

## 你应该选哪一种？

| 方式 | 适合谁 | 是否需要 Bun | 是否适合开发修改 | 推荐程度 |
| --- | --- | --- | --- | --- |
| GitHub Release 安装 | 普通用户、只想直接运行的人 | 否 | 否 | 推荐 |
| 源码安装 | 开发者、贡献者、需要调试的人 | 是 | 是 | 推荐给开发场景 |

## 组件说明

| 组件 | 作用 | 是否必须 |
| --- | --- | --- |
| Hub | HTTP API、SQLite、SSE、Socket.IO、Web 后端 | 必须 |
| Web / PWA | 浏览器远程控制界面 | 必须 |
| Runner | 让网页能远程创建会话、汇报机器状态 | 想从网页新建会话时必须 |
| Agent CLI | Claude / Codex / Cursor / Gemini / OpenCode 本地命令行 | 至少一个 |

## 前置条件

### Release 安装

- 下载对应平台的 AgentChat 二进制
- 至少安装一个你要使用的 Agent CLI

### 源码安装

- Node.js 20+
- Bun 1.3+
- 至少安装一个你要使用的 Agent CLI

## 默认端口与目录

### 默认端口

- Hub：`3217`
- 源码模式下 Web 开发服务器常用：`4173`

### 默认数据目录

- `~/.agentchat`

常见文件：

- `settings.json`
- `agentchat.db`
- `runner.state.json`
- `runner.env`
- `logs/`

## 下一步

- 想直接运行：看 [Release 安装](./release-install.md)
- 想从仓库启动：看 [源码安装](./source-install.md)
- 想快速走通一遍：看 [快速开始](./quick-start.md)
