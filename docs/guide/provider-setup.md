# Provider Setup

AgentChat 0.0.1 uses a machine-scoped runner environment file.

## Source of truth

Each runner reads:

- `~/.agentchat/runner.env`

before starting a new agent session.

If a managed variable is present in this file, AgentChat uses it. If it is absent, AgentChat falls back to the default behavior for that provider.

## Managed keys

```env
ANTHROPIC_BASE_URL=
ANTHROPIC_AUTH_TOKEN=
ANTHROPIC_DEFAULT_OPUS_MODEL=
ANTHROPIC_DEFAULT_SONNET_MODEL=
ANTHROPIC_DEFAULT_HAIKU_MODEL=
GOOGLE_GEMINI_BASE_URL=
GEMINI_API_KEY=
```

## Editing options

### Local filesystem

Edit `~/.agentchat/runner.env` directly with any editor.

### Web UI

Open **Settings → Machines & providers**, then edit the **Runner environment** box for a machine and save it.

## Important behavior

Changes only affect **newly started agent sessions**.

Existing sessions keep their current environment until you create a new session or respawn the agent through a fresh session.

## Troubleshooting

### Terminal Claude works, AgentChat Claude does not

Usually means:

- your shell has the right provider variables
- but `runner.env` does not

Fix: update `runner.env`, then create a new session.

### Machines page shows provider not configured

Check:

- key names exactly match the managed list
- no old token/base URL left in the file
- save completed successfully
- you started a brand-new session after the change
