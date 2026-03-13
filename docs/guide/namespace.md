# Namespace（高级）

Namespace 允许一个小团队共用同一个公开的 AgentChat Hub，但把会话、机器和访问范围按用户隔离开。

## 它是怎么工作的？

Hub 只保存一份基础 token：

```text
CLI_API_TOKEN=your-base-token
```

客户端在连接时追加 namespace：

```text
your-base-token:alice
your-base-token:bob
```

这样就能在同一个 Hub 上把不同用户的数据隔离开。

## 最常见的配置方式

### Hub 侧

```bash
CLI_API_TOKEN="your-base-token"
```

注意：**Hub 自己的 token 不要带 `:namespace` 后缀**。

### 客户端侧

例如 Alice：

```bash
CLI_API_TOKEN="your-base-token:alice"
```

Bob：

```bash
CLI_API_TOKEN="your-base-token:bob"
```

他们在 Web、PWA、CLI 中都使用各自的 `base:namespace` token。

## 会隔离哪些内容？

- 会话
- 机器
- Web 登录视图
- 飞书映射到的目标

## 使用时要注意

- 同一个机器 ID 不能跨 namespace 复用
- 如果同一台机器要同时服务多个 namespace，建议使用不同的 `AGENTCHAT_HOME`
- 飞书接入时，也需要把飞书用户映射到正确的 namespace

## 适用场景

Namespace 更适合：

- 个人多环境隔离
- 小团队共享一个 Hub
- 一台服务器上托管多个使用者

如果你只是单人使用，通常直接用 `default` 就够了。
