# Quick Start

This guide covers the smallest useful local setup for AgentChat 0.0.1.

## 1. Install dependencies

From source:

```bash
bun install
```

## 2. Start the hub

```bash
bun run dev:hub
```

Default local URL:

- `http://127.0.0.1:3217`

## 3. Start the web app

```bash
bun run dev:web -- --host 0.0.0.0 --port 4173
```

Open:

- `http://127.0.0.1:4173/`

## 4. Start a runner

```bash
CLI_API_TOKEN=test-token AGENTCHAT_API_URL=http://127.0.0.1:3217 bun run --cwd cli dev -- runner start-sync
```

If you want remote spawning from the web UI, the runner must be online.

## 5. Configure providers

Edit:

- `~/.agentchat/runner.env`

or open **Machines & providers** in the web UI and edit the same file there.

Minimal Claude example:

```env
ANTHROPIC_BASE_URL=https://your-claude-gateway.example.com
ANTHROPIC_AUTH_TOKEN=your-token
```

Minimal Gemini example:

```env
GOOGLE_GEMINI_BASE_URL=https://generativelanguage.googleapis.com
GEMINI_API_KEY=your-key
```

## 6. Sign in to the web UI

Use the same `CLI_API_TOKEN` value you configured for the hub and runner.

## 7. Verify the basics

- **Machines & providers** shows one online machine
- create a session
- send a message
- open files
- create a room

## Common first-run issues

### No machines online

- runner not started
- runner connected to the wrong hub URL
- token mismatch between hub and runner

### Provider misconfigured

- `runner.env` missing required keys
- changes saved, but only new sessions pick them up
- old sessions still using old environment

## Next

- [Installation](./installation.md)
- [Provider Setup](./provider-setup.md)
- [Support Matrix](./support-matrix.md)
- [Feishu](./feishu.md)
