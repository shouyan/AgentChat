/**
 * Unified MCP bridge setup for Codex local and remote modes.
 *
 * This module provides a single source of truth for starting the agentchat MCP
 * bridge server and generating the MCP server configuration that Codex needs.
 */

import { configuration } from '@/configuration';
import { getAgentchatCliCommand } from '@/utils/spawnAgentchatCLI';
import type { ApiSessionClient } from '@/api/apiSession';

/**
 * MCP server entry configuration.
 */
export interface McpServerEntry {
    command: string;
    args: string[];
}

/**
 * Map of MCP server names to their configurations.
 */
export type McpServersConfig = Record<string, McpServerEntry>;

/**
 * Result of starting the agentchat MCP bridge.
 */
export interface AgentChatMcpBridge {
    /** The running server instance */
    server: {
        url: string;
        stop: () => void;
    };
    /** MCP server config to pass to Codex (works for both CLI and SDK) */
    mcpServers: McpServersConfig;
}

/**
 * Start the agentchat MCP bridge server and return the configuration
 * needed to connect Codex to it.
 *
 * This is the single source of truth for MCP bridge setup,
 * used by both local and remote launchers.
 */
export async function buildAgentchatMcpBridge(client: ApiSessionClient): Promise<AgentChatMcpBridge> {
    const bridgeCommand = getAgentchatCliCommand([
        'mcp',
        '--session-id', client.sessionId,
        '--access-token', client.accessToken,
        '--api-url', configuration.apiUrl
    ]);

    return {
        server: {
            url: configuration.apiUrl,
            stop: () => {}
        },
        mcpServers: {
            agentchat: {
                command: bridgeCommand.command,
                args: bridgeCommand.args
            }
        }
    };
}
