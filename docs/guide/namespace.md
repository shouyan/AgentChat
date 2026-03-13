# Namespace (Advanced)

Namespaces let a small team share one public AgentChat hub while isolating sessions and machines per user.

## How it works

- The hub stores one base `CLI_API_TOKEN`
- Clients append `:<namespace>` to isolate access

## Setup

1. Configure the base token on the hub:

```bash
CLI_API_TOKEN="your-base-token"
```

2. Append a namespace on each client:

```bash
CLI_API_TOKEN="your-base-token:alice"
```

3. Use the same `base:namespace` token in the web app, PWA, and CLI for that namespace.

## Limitations

- Hub-side `CLI_API_TOKEN` must not include `:<namespace>`
- Sessions, machines, and users are isolated per namespace
- One machine ID cannot be reused across namespaces
- For multiple namespaces on one machine, use separate `AGENTCHAT_HOME` directories
