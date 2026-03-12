# AgentChat

AgentChat is a local-first multi-agent coding workspace.

It lets you run coding agents such as Claude Code, Codex, Gemini, Cursor Agent, and OpenCode on your own machine, then coordinate them through a web inbox and room-based group chat UI.

## What this repository contains

This repository includes:

- `cli/` — the AgentChat CLI and agent launchers
- `hub/` — the API server, room/session orchestration, and embedded web assets
- `web/` — the web UI / PWA
- `shared/` — shared protocol and types
- `docs/` / `website/` — documentation site assets

## Main capabilities

- Start and manage local agent sessions
- Open direct 1:1 sessions or room-based multi-agent collaboration
- Spawn multiple agents with different roles, models, and mention keys
- Coordinate agents through a group-chat style room UI
- Wake / offline rooms, invite / remove agents, and inspect child sessions from the room
- Access sessions remotely through the web interface
- Package the project as a portable build

## Supported agent backends

AgentChat currently includes integrations for:

- Claude Code
- Codex
- Gemini
- Cursor Agent
- OpenCode

## Quick start

### Requirements

- Bun 1.3+
- Node.js 20+

### Install dependencies

```bash
bun install
```

### Start the hub

```bash
./agentchat hub
```

### Start an agent session

Default launcher:

```bash
./agentchat
```

Other backends:

```bash
./agentchat codex
./agentchat gemini
./agentchat cursor
./agentchat opencode
```

### Common commands

```bash
./agentchat --help
./agentchat auth login
./agentchat doctor
```

## Development

Run hub + web together:

```bash
bun run dev
```

Or separately:

```bash
bun run dev:hub
bun run dev:web
```

Useful scripts:

```bash
bun run typecheck
bun run test
bun run build
```

## Packaging

Build a portable package:

```bash
bun run package:portable
```

Build a single executable bundle:

```bash
bun run build:single-exe
```

## Project notes

- The command name is `agentchat`
- The web UI branding is `AgentChat`
- Room-spawned child sessions are intended to be accessed from their room context
- Top-level inbox is meant for rooms and user-created direct sessions

## Source archive

If you are receiving this repository as a source package, it should be enough to:

1. extract the archive
2. run `bun install`
3. start with `./agentchat hub`

## License

AGPL-3.0-only
