# Cursor Agent

AgentChat supports [Cursor Agent CLI](https://cursor.com/docs/cli/using) for running Cursor's coding agent with remote control via web and phone.

## Prerequisites

Install Cursor Agent CLI:

- **macOS/Linux:** `curl https://cursor.com/install -fsS | bash`
- **Windows:** `irm 'https://cursor.com/install?win32=true' | iex`

Verify installation:

```bash
agent --version
```

## Usage

```bash
agentchat cursor
agentchat cursor resume <chatId>
agentchat cursor --continue
agentchat cursor --mode plan
agentchat cursor --mode ask
agentchat cursor --yolo
agentchat cursor --model <model>
```

## Modes

- **Local mode**: run from terminal for the full interactive experience
- **Remote mode**: spawn from the web app or PWA when no terminal is attached

## Integration

Once running, your Cursor session appears in the AgentChat web app and installed PWA. You can:

- Monitor activity
- Approve permissions from your phone
- Send messages when the session is in remote mode

## Related

- [Cursor CLI Documentation](https://cursor.com/docs/cli/using)
- [How it Works](./how-it-works.md)
