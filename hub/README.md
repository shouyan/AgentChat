# AgentChat Hub

HTTP API + realtime sync service for AgentChat.

## What it does

- Serves the AgentChat web app
- Accepts CLI connections over Socket.IO
- Stores sessions, messages, and machines in SQLite
- Streams live updates to browsers via SSE
- Delivers web push notifications
- Exposes REST endpoints for session, file, machine, and terminal actions

## Configuration

### Required

- `CLI_API_TOKEN` - Shared secret used by CLI and web login. Namespaces are appended client-side as `:<namespace>`.

### Optional

- `AGENTCHAT_LISTEN_HOST` - HTTP bind address. Default: `127.0.0.1`
- `AGENTCHAT_LISTEN_PORT` - HTTP port. Default: `3217`
- `AGENTCHAT_PUBLIC_URL` - Public URL for browser or PWA access. Also used as the default CORS origin.
- `CORS_ORIGINS` - Comma-separated allowed origins, or `*`
- `AGENTCHAT_HOME` - Data directory. Default: `~/.agentchat`
- `DB_PATH` - SQLite database path. Default: `AGENTCHAT_HOME/agentchat.db`
- `VAPID_SUBJECT` - Contact URL or email for Web Push
- `ELEVENLABS_API_KEY` - ElevenLabs key for voice assistant
- `ELEVENLABS_AGENT_ID` - Custom ElevenLabs agent ID
- `AGENTCHAT_RELAY_API` - Relay API domain
- `AGENTCHAT_RELAY_AUTH` - Relay auth key
- `AGENTCHAT_RELAY_FORCE_TCP` - Force TCP relay mode

## Running

Binary:

```bash
export CLI_API_TOKEN="shared-secret"
export AGENTCHAT_PUBLIC_URL="https://agentchat.example.com"

agentchat hub
```

From source:

```bash
bun install
bun run dev:hub
```

`agentchat server` remains available as an alias.

## Authentication

`POST /api/auth` exchanges `CLI_API_TOKEN[:namespace]` for a short-lived JWT used by the web app.

## Main HTTP Areas

- `/api/sessions` - session list, metadata, lifecycle, uploads
- `/api/messages` - message history and send actions
- `/api/permissions` - approve or deny pending requests
- `/api/machines` - machine inventory, remote spawn, directory helpers
- `/api/events` - SSE stream for live updates
- `/api/push` - Web Push subscription management
- `/api/voice` - ElevenLabs conversation token
- `/cli/*` - CLI bootstrap and machine registration routes

See `src/web/routes/` for the authoritative route definitions.

## Socket.IO

Namespace: `/cli`

CLI clients use Socket.IO to:

- publish messages
- update session metadata and agent state
- keep sessions and machines alive
- register RPC handlers for runner operations

Web terminal clients use Socket.IO to:

- create terminal sessions
- write input
- resize terminals
- close terminals

## Core Modules

- `src/web/` - HTTP service and route registration
- `src/socket/` - Socket.IO server and handlers
- `src/sync/` - session, machine, room, and message coordination
- `src/store/` - SQLite persistence
- `src/sse/` - SSE fanout
- `src/notifications/` - Web Push delivery
- `src/config/` - settings loading and defaults

## Security Model

- CLI and browser access are gated by `CLI_API_TOKEN`
- Browsers receive short-lived JWTs after authenticating
- Transport security depends on HTTPS in front of the hub for non-local use

## Deployment Notes

- Use port `3217` by default
- Put the hub behind HTTPS for any external access
- If the web app is served from another origin, set `CORS_ORIGINS`
- If you expose the hub publicly, set `AGENTCHAT_PUBLIC_URL` to the externally reachable HTTPS origin
