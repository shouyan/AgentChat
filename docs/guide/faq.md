# FAQ

## General

### What is AgentChat?

AgentChat is a local-first, self-hosted platform for running and controlling AI coding agents remotely. It lets you start sessions on your computer and monitor, message, and approve them from your phone.

### What does AgentChat stand for?

AgentChat (哈皮) is a Chinese transliteration of "Happy", reflecting the project's goal of making AI coding assistance feel lighter and less terminal-bound.

### Is AgentChat free?

Yes. AgentChat is open source and released under the AGPL-3.0-only license.

### What AI agents does AgentChat support?

- **Claude Code** (recommended)
- **OpenAI Codex**
- **Cursor Agent**
- **Google Gemini**
- **OpenCode**

## Setup & Installation

### Do I need a separate hub?

No. AgentChat includes an embedded hub. Run `agentchat hub` on the machine that hosts your sessions.

`agentchat server` remains supported as an alias.

### How do I access AgentChat from my phone?

For local network access:

```text
http://<your-computer-ip>:3217
```

For internet access:

- Put the hub behind HTTPS with a reverse proxy, or
- Use a tunnel such as Cloudflare Tunnel, Tailscale, or ngrok.

### What's the access token for?

The `CLI_API_TOKEN` is the shared secret used by:

- CLI connections to the hub
- Web app and PWA logins

It is auto-generated on first hub start and stored in `~/.agentchat/settings.json`.

### Do you support multiple accounts?

Yes. Use namespaces for lightweight multi-account isolation on one hub. See [Namespace (Advanced)](./namespace.md).

### Can I use AgentChat in a browser only?

Yes. The browser and installed PWA are the primary remote control surfaces.

## Usage

### How do I approve permissions remotely?

1. When your AI agent requests permission, you'll get an in-app or push notification.
2. Open AgentChat on your phone.
3. Navigate to the active session.
4. Approve or deny the pending permission.

### How do I receive notifications?

AgentChat supports web push notifications. Enable them when prompted in the web app or installed PWA.

### Can I start sessions remotely?

Yes, with runner mode:

1. Run `agentchat runner start` on your computer.
2. Your machine appears in the **Machines** list in the web app.
3. Spawn new sessions from anywhere.

### How do I see what files were changed?

Open the **Files** tab in a session to:

- Browse project files
- View git status
- Inspect diffs

### Can I send messages to the AI from my phone?

Yes. Open a session and use the chat interface to message the agent directly.

### Can I access a terminal remotely?

Yes. Open the **Terminal** tab inside a session.

### How do I use voice control?

Set `ELEVENLABS_API_KEY`, open a session in the web app, and click the microphone button. See [Voice Assistant](./voice-assistant.md).

## Security

### Is my data safe?

Yes. AgentChat is local-first:

- All session data stays on your machine
- Nothing is uploaded to a hosted AgentChat service
- The database lives in `~/.agentchat/`

### How secure is token authentication?

The auto-generated token is 256-bit and cryptographically secure. For any non-local access, put the hub behind HTTPS.

### Can others access my AgentChat instance?

Only if they know your access token. For stronger security:

- Use a strong unique token
- Always use HTTPS externally
- Prefer private networking such as Tailscale when possible

## Troubleshooting

### "Connection refused" error

- Ensure the hub is running: `agentchat hub`
- Check firewall rules for port `3217`
- Verify `AGENTCHAT_API_URL`

### "Invalid token" error

- Re-run `agentchat auth login`
- Check the token matches on CLI and hub
- Verify `~/.agentchat/settings.json`

### Runner won't start

```bash
agentchat runner status
rm ~/.agentchat/runner.state.json.lock
agentchat runner logs
```

### Claude Code not found

Install Claude Code or set a custom path:

```bash
npm install -g @anthropic-ai/claude-code
export AGENTCHAT_CLAUDE_PATH=/path/to/claude
```

### Cursor Agent not found

Install Cursor Agent CLI:

```bash
curl https://cursor.com/install -fsS | bash
```

On Windows:

```powershell
irm 'https://cursor.com/install?win32=true' | iex
```

### How do I run diagnostics?

```bash
agentchat doctor
```

## Comparison

### AgentChat vs Happy

| Aspect | Happy | AgentChat |
|--------|-------|-----------|
| Design | Cloud-first | Local-first |
| Users | Multi-user | Single user |
| Deployment | Multiple services | Single binary |
| Data | Encrypted on server | Never leaves your machine |

See [Why AgentChat](./why-agentchat.md) for the deeper comparison.

### AgentChat vs running Claude Code directly

| Feature | Claude Code | AgentChat + Claude Code |
|---------|-------------|-------------------------|
| Remote access | No | Yes |
| Mobile control | No | Yes |
| Permission approval | Terminal only | Phone/web |
| Session persistence | No | Yes |
| Multi-machine | Manual | Built-in |
