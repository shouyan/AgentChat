# 源码安装

适合：开发者、贡献者、需要调试和修改 AgentChat 的用户。

> 仓库地址暂未最终确定。请先把下面的占位符替换成你实际创建的 GitHub 仓库地址。

## 1. 克隆仓库

```bash
git clone https://github.com/<你的组织>/<你的仓库名>.git
cd <你的仓库目录>
```

## 2. 安装依赖

```bash
bun install
```

## 3. 启动 Hub

```bash
CLI_API_TOKEN=your-strong-token bun run dev:hub
```

默认监听：

- `http://127.0.0.1:3217`

## 4. 启动 Web 开发服务器

```bash
bun run dev:web -- --host 0.0.0.0 --port 4173
```

浏览器访问：

- `http://127.0.0.1:4173/`

## 5. 启动 Runner

```bash
CLI_API_TOKEN=your-strong-token AGENTCHAT_API_URL=http://127.0.0.1:3217 bun run --cwd cli dev -- runner start-sync
```

## 6. 登录并验证

使用同一个 `CLI_API_TOKEN` 登录 Web。

建议按顺序验证：

1. 登录成功
2. 机器在线
3. 创建新会话
4. 发消息
5. 打开 Files / Terminal
6. 运行 `agentchat attach <sessionId>` 终端附着已有会话

## 常用开发命令

```bash
bun run typecheck
bun run test
bun run smoke:web
```

### 单独构建文档

```bash
cd docs
bun run docs:build
```

### 单独构建 CLI

```bash
bun run build:cli
```

## 提交前建议

```bash
bun run typecheck
bun run test
```

如果你修改了文档，再补一条：

```bash
cd docs && bun run docs:build
```
