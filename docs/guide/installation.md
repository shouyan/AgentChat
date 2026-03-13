# Installation

## Supported platforms

AgentChat 0.0.1 targets:

- macOS `arm64`, `x64`
- Linux `arm64`, `x64`
- Windows `x64`

Known limitation:

- web terminal is not supported on Windows

## Requirements

- Bun 1.3+
- Node.js 20+
- at least one supported local agent CLI installed

## Components

| Component | Purpose | Required |
| --- | --- | --- |
| Hub | HTTP API, persistence, SSE, web backend | yes |
| Web | browser UI / PWA | yes |
| Runner | remote spawn, machine metadata, provider env | yes for web-driven session creation |
| Agent CLI | Claude / Codex / Gemini / Cursor / OpenCode | yes |

## Local source install

```bash
git clone <your-repo-url>
cd agentchat-source
bun install
```

## Start order

### Hub

```bash
bun run dev:hub
```

### Web

```bash
bun run dev:web -- --host 0.0.0.0 --port 4173
```

### Runner

```bash
CLI_API_TOKEN=test-token AGENTCHAT_API_URL=http://127.0.0.1:3217 bun run --cwd cli dev -- runner start-sync
```

## Configuration notes

- use the same `CLI_API_TOKEN` for hub, runner, and web login
- runner provider variables live in `~/.agentchat/runner.env`
- web edits to runner env only affect future agent sessions

## Recommended smoke checks

```bash
bun run typecheck
bun run test
bun run smoke:web
```

`bun run smoke:web` launches a temporary hub + web dev server + runner, signs in through the browser, creates a session, writes logs and a screenshot under `output/playwright/`, then tears the stack back down. If your local machine needs a specific browser or provider, set overrides such as `SMOKE_AGENT`, `SMOKE_DIRECTORY`, `SMOKE_BROWSER_CHANNEL`, `SMOKE_BROWSER_EXECUTABLE_PATH`, or `SMOKE_HEADED=1`.

Then verify in the UI:

- login works
- one machine online
- provider health check works
- create session works
- files page loads
- room creation works

## Production-ish notes

Before wider rollout, document these locally for your team:

- where hub runs
- what token distribution flow you use
- which namespaces are used
- how `runner.env` is managed per machine
- which providers/models are officially supported
