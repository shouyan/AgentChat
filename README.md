# AgentChat

AgentChat is a local-first coding workspace for running AI agents on your own machine and controlling them from the web, your phone, or Feishu private chat.

Current release: **0.0.1**

## What you get

- direct agent sessions for Claude, Codex, Gemini, Cursor Agent, and OpenCode
- room-based multi-agent collaboration
- web inbox, files, terminal, runner, and provider controls
- machine-scoped runner environment editing
- Feishu private-chat control and progress updates

## Supported platforms

Officially targeted in 0.0.1:

- macOS `arm64`, `x64`
- Linux `arm64`, `x64`
- Windows `x64`

Known limitation:

- web terminal is not supported on Windows

## Repo layout

- `cli/` — AgentChat CLI, runner, agent launchers
- `hub/` — API server, persistence, SSE, Socket.IO, Feishu integration
- `web/` — React PWA
- `shared/` — protocol, contracts, shared utilities
- `docs/` / `website/` — documentation assets

## Quick start from source

### Requirements

- Bun 1.3+
- Node.js 20+
- at least one supported local agent CLI installed

### Install

```bash
bun install
```

### Start the hub

```bash
bun run dev:hub
```

### Start the web app

```bash
bun run dev:web -- --host 0.0.0.0 --port 4173
```

### Start a runner on the same machine

```bash
CLI_API_TOKEN=test-token AGENTCHAT_API_URL=http://127.0.0.1:3217 bun run --cwd cli dev -- runner start-sync
```

### Open the UI

- web: `http://127.0.0.1:4173/`
- login token: the same `CLI_API_TOKEN` you used for the hub/runner

## Provider setup

AgentChat reads machine-scoped provider variables from:

- `~/.agentchat/runner.env`

Managed keys in 0.0.1:

- `ANTHROPIC_BASE_URL`
- `ANTHROPIC_AUTH_TOKEN`
- `ANTHROPIC_DEFAULT_OPUS_MODEL`
- `ANTHROPIC_DEFAULT_SONNET_MODEL`
- `ANTHROPIC_DEFAULT_HAIKU_MODEL`
- `GOOGLE_GEMINI_BASE_URL`
- `GEMINI_API_KEY`

You can edit this file either:

- locally, with any editor
- from **Machines & providers** in the web UI

Changes only affect **newly started agent sessions**. Existing sessions keep their current environment.

## Feishu support

0.0.1 includes:

- Feishu private-chat bot control
- help, session switching, current progress
- current target can be either a direct session or a room

Not in scope for 0.0.1:

- Feishu group binding
- Feishu OAuth workflows
- file/image handling from Feishu

## Before you ship

Recommended checks:

```bash
bun run typecheck
bun run test
```

Then manually verify:

- web login
- machine online
- create session
- send message
- files page
- room creation and reply flow
- runner restart
- Feishu private-chat flow

## More docs

- `docs/guide/quick-start.md`
- `docs/guide/installation.md`
- `docs/guide/provider-setup.md`
- `docs/guide/feishu.md`
- `CHANGELOG.md`

## License

AGPL-3.0-only
