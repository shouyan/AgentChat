# AgentChat Web

React web app and PWA for monitoring and controlling AgentChat sessions.

## What it does

- Shows active and archived sessions
- Streams messages and status changes live
- Lets users send messages and approve permissions
- Exposes file browser, diffs, and remote terminal
- Supports machine selection and remote session spawn
- Supports installation as a PWA with web push notifications

## Authentication

- Browser and PWA login use `CLI_API_TOKEN[:namespace]`
- The hub exchanges that token for a short-lived JWT
- The login screen also supports picking a custom hub origin

## Realtime

- SSE drives session, message, and machine updates
- Socket.IO powers the remote terminal

## Development

From the repo root:

```bash
bun install
bun run dev:web
```

If you want to test from another device, expose the dev server over HTTPS and set:

- `AGENTCHAT_PUBLIC_URL`
- `CORS_ORIGINS`

## Build

```bash
bun run build:web
```

The built files land in `web/dist`. The hub can serve them directly, and the single executable can embed them.

## Structure

- `src/components/` - reusable UI
- `src/routes/` - app pages
- `src/hooks/` - auth, SSE, queries, mutations
- `src/api/` - hub API client
- `src/chat/` - message normalization and tool rendering

## Standalone Hosting

You can host `web/dist` on a static host and point it at any AgentChat hub:

1. Build the app
2. Deploy `web/dist`
3. Allow the static origin in `CORS_ORIGINS`
4. Set the hub URL from the login screen
