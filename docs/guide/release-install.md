# Release 安装

适合：只想使用 AgentChat，不想先安装 Bun 的用户。

## 1. 下载对应平台的二进制

打开：

- `https://github.com/shouyan/AgentChat/releases`

下载与你的平台匹配的压缩包或二进制文件。

## 2. 解压并放到 PATH（推荐）

### macOS / Linux

```bash
chmod +x ./agentchat
sudo mv ./agentchat /usr/local/bin/agentchat
```

验证：

```bash
agentchat --help
```

### Windows

- 解压后得到 `agentchat.exe`
- 可以直接双击运行，或将其所在目录加入 `PATH`

验证：

```powershell
agentchat.exe --help
```

## 3. 启动 Hub

第一次启动前，建议自己先设置一个强 token：

```bash
export CLI_API_TOKEN="your-strong-token"
agentchat hub
```

如果你不手动设置，Hub 会在首次启动时自动生成 token，并写入：

- `~/.agentchat/settings.json`

Hub 默认监听：

- `http://127.0.0.1:3217`

## 4. 启动 Runner（可选但强烈建议）

如果你希望从网页端远程创建会话，需要 runner 在线：

```bash
CLI_API_TOKEN="your-strong-token" AGENTCHAT_API_URL=http://127.0.0.1:3217 agentchat runner start-sync
```

## 5. 打开 Web

如果 Release 产物是内嵌 Web 的单文件版本，直接访问：

- `http://127.0.0.1:3217`

使用同一个 `CLI_API_TOKEN` 登录。

## 6. 验证

建议至少检查以下项目：

- 能成功登录
- **Machines & providers** 页面能看到在线机器
- 能创建一个新会话
- 能发送一条消息
- 能打开 **Files** 或 **Terminal** 页面

## 常见问题

### 浏览器打不开页面

检查：

- `agentchat hub` 是否仍在运行
- 端口 `3217` 是否被占用
- 如果是远程访问，是否正确设置了 `AGENTCHAT_PUBLIC_URL`

### 网页里看不到机器

检查：

- runner 是否已启动
- `AGENTCHAT_API_URL` 是否指向正确的 hub
- hub 与 runner 使用的 `CLI_API_TOKEN` 是否一致

### 更新版本怎么做？

- 停掉 hub / runner
- 下载新的 Release
- 覆盖旧二进制
- 再重新启动

会话数据默认仍保留在 `~/.agentchat`，不会因为替换二进制而自动丢失。
