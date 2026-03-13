# How it Works

AgentChat has three core pieces working together:

- **CLI** runs the coding agent on your machine
- **Hub** stores state and exposes APIs
- **Web/PWA** gives you remote control from another device

## Architecture Overview

```text
┌──────────────┐   Socket.IO   ┌──────────────┐   REST + SSE   ┌──────────────┐
│ AgentChat CLI│◄────────────►│ AgentChat Hub│◄──────────────►│  Web / PWA   │
│ + AI Agent   │              │ + SQLite     │                │  on phone     │
└──────────────┘              └──────────────┘                └──────────────┘
        │                             │
        │ local process               │ http://localhost:3217
        ▼                             ▼
   project files               optional HTTPS / tunnel
```

## Components

### AgentChat CLI

The CLI wraps Claude Code, Codex, Cursor Agent, Gemini, and OpenCode. It:

- Starts and manages sessions
- Registers them with the hub
- Streams messages and permission requests
- Exposes AgentChat MCP tools to supported agents

### AgentChat Hub

The hub is the central coordination service. It provides:

- REST endpoints for session actions
- Socket.IO for CLI connectivity and RPC
- SSE for live browser updates
- SQLite persistence for sessions, messages, and machines
- Web Push notifications for permission and ready events

### Web App / PWA

The web app is the remote control surface. It lets you:

- Browse current and past sessions
- Read and send messages
- Approve or deny permissions
- Inspect files, diffs, and terminal output
- Spawn sessions on runner-connected machines

## Data Flow

### Starting a Session

```text
1. User runs `agentchat`
2. CLI starts the selected agent
3. CLI connects to the hub over Socket.IO
4. Hub stores the session and metadata
5. Web clients receive the update over SSE
6. The session appears on phone or desktop web
```

### Permission Requests

```text
1. Agent requests a permission
2. CLI sends the request to the hub
3. Hub stores it and publishes SSE / push events
4. User opens the web app or PWA
5. User approves or denies
6. Hub relays the decision back to the CLI
```

### Message Flow

```text
Phone / Browser        Hub                CLI
     │                  │                  │
     │ send message     │                  │
     ├─────────────────►│                  │
     │                  ├─────────────────►│
     │                  │   Socket.IO      │
     │                  │                  ├─ agent runs
     │                  │◄─────────────────┤
     │     SSE update   │                  │
     ◄──────────────────┤                  │
```

## Communication Protocols

### CLI ↔ Hub

Socket.IO handles:

- Session registration
- Keepalive and status updates
- Permission requests
- RPC calls for runner and machine operations

### Hub ↔ Web

REST handles actions such as:

- Send message
- Approve permission
- Spawn session

SSE handles live updates such as:

- New messages
- Session state changes
- Machine updates

## Local and Remote Modes

### Local Mode

Best for focused work at your terminal:

- Native agent interface
- Fastest feedback loop
- Full keyboard-driven flow

### Remote Mode

Best when you step away from the terminal:

- Web/PWA access from any device
- Remote approvals and messages
- Session keeps running on your machine

### Switching

- **Local → Remote** happens when remote input arrives
- **Remote → Local** happens when you take control back from the terminal

The same session keeps running either way. AgentChat changes the control surface, not the session identity.
