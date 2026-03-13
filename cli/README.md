# AgentChat CLI

Run Claude Code, Codex, Cursor Agent, Gemini, or OpenCode from your terminal and control sessions remotely through the AgentChat hub.

## Typical Flow

1. Start the hub
2. Configure the same `CLI_API_TOKEN` on hub and CLI
3. Run `agentchat` to start a session
4. Use the web app or installed PWA to monitor and control it

## Commands

### Session commands

- `agentchat` - start Claude Code
- `agentchat codex` - start Codex mode
- `agentchat codex resume <sessionId>` - resume Codex
- `agentchat cursor` - start Cursor Agent mode
- `agentchat gemini` - start Gemini via ACP
- `agentchat opencode` - start OpenCode via ACP

### Authentication

- `agentchat auth status`
- `agentchat auth login`
- `agentchat auth logout`

### Runner

- `agentchat runner start`
- `agentchat runner stop`
- `agentchat runner status`
- `agentchat runner list`
- `agentchat runner stop-session <sessionId>`
- `agentchat runner logs`

### Other

- `agentchat mcp` - start the MCP stdio bridge
- `agentchat hub` - start the bundled hub
- `agentchat server` - alias for `agentchat hub`
- `agentchat doctor` - diagnostics and cleanup

## Configuration

### Required

- `CLI_API_TOKEN` - shared secret used by CLI and hub
- `AGENTCHAT_API_URL` - hub base URL. Default: `http://localhost:3217`

### Optional

- `AGENTCHAT_HOME` - data directory. Default: `~/.agentchat`
- `AGENTCHAT_EXPERIMENTAL` - enable experimental features
- `AGENTCHAT_CLAUDE_PATH` - custom Claude executable path
- `AGENTCHAT_HTTP_MCP_URL` - default MCP bridge target

### Worktree env set by the runner

- `AGENTCHAT_WORKTREE_BASE_PATH`
- `AGENTCHAT_WORKTREE_BRANCH`
- `AGENTCHAT_WORKTREE_NAME`
- `AGENTCHAT_WORKTREE_PATH`
- `AGENTCHAT_WORKTREE_CREATED_AT`

## Storage

Files are stored under `~/.agentchat` unless `AGENTCHAT_HOME` is set:

- `settings.json`
- `runner.state.json`
- `logs/`

## Build

From the repo root:

```bash
bun install
bun run build:cli
bun run build:cli:exe
```

For a single binary that also embeds the web app:

```bash
bun run build:single-exe
```

## Structure

- `src/api/` - hub communication
- `src/claude/` - Claude Code integration
- `src/codex/` - Codex mode integration
- `src/cursor/` - Cursor Agent integration
- `src/agent/` - ACP-based backends such as Gemini
- `src/opencode/` - OpenCode integration
- `src/runner/` - background runner
- `src/commands/` - CLI commands
- `src/ui/` - diagnostics and terminal UI helpers
