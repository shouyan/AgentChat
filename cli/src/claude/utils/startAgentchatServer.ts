/**
 * AgentChat MCP server
 * Provides AgentChat CLI specific tools including chat session title management
 * and room collaboration tools for agent sessions.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createServer } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { AddressInfo } from "node:net";
import { logger } from "@/ui/logger";
import { ApiSessionClient } from "@/api/apiSession";
import { randomUUID } from "node:crypto";
import { configuration } from "@/configuration";
import { agentchatMcpToolDefinitions } from "@/mcp/toolDefinitions";

function successText(text: string) {
    return {
        content: [
            {
                type: 'text' as const,
                text,
            },
        ],
        isError: false,
    };
}

function errorText(text: string) {
    return {
        content: [
            {
                type: 'text' as const,
                text,
            },
        ],
        isError: true,
    };
}

async function requestCli<T>(
    client: ApiSessionClient,
    path: string,
    init?: RequestInit
): Promise<T> {
    const res = await fetch(`${configuration.apiUrl}${path}`, {
        ...init,
        headers: {
            authorization: `Bearer ${client.accessToken}`,
            'content-type': 'application/json',
            ...(init?.headers ?? {})
        }
    });

    const text = await res.text().catch(() => '');
    const data = text ? JSON.parse(text) as T & { error?: string } : {} as T & { error?: string };
    if (!res.ok) {
        throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
    }
    return data as T;
}

function pretty(value: unknown): string {
    return JSON.stringify(value, null, 2);
}

export async function startAgentchatServer(client: ApiSessionClient) {
    const changeTitleHandler = async (title: string) => {
        logger.debug('[agentchatMCP] Changing title to:', title);
        try {
            client.sendClaudeSessionMessage({
                type: 'summary',
                summary: title,
                leafUuid: randomUUID()
            });

            return { success: true };
        } catch (error) {
            return { success: false, error: String(error) };
        }
    };

    const mcp = new McpServer({
        name: "AgentChat MCP",
        version: "1.0.0",
    });

    const registerToolHandlers: Record<string, (args: Record<string, unknown>) => Promise<{ content: { type: 'text'; text: string }[]; isError: boolean }>> = {
        async change_title(args) {
            const response = await changeTitleHandler(String(args.title ?? ''));
            logger.debug('[agentchatMCP] change_title response:', response);
            if (response.success) {
                return successText(`Successfully changed chat title to: "${String(args.title ?? '')}"`);
            }
            return errorText(`Failed to change chat title: ${response.error || 'Unknown error'}`);
        },
        async room_get_context() {
            const result = await requestCli<{
                room: unknown
                role: unknown
                recentMessages: unknown[]
                availableMentions: string[]
            }>(client, `/cli/sessions/${encodeURIComponent(client.sessionId)}/room-context`);
            return successText(pretty(result));
        },
        async room_list_tasks(args) {
            const params = new URLSearchParams();
            if (typeof args.status === 'string') params.set('status', args.status);
            if (typeof args.assigned === 'string') params.set('assigned', args.assigned);
            const qs = params.toString();
            const result = await requestCli<{
                room: unknown
                role: unknown
                tasks: unknown[]
            }>(client, `/cli/sessions/${encodeURIComponent(client.sessionId)}/room-tasks${qs ? `?${qs}` : ''}`);
            return successText(pretty(result));
        },
        async room_create_task(args) {
            const result = await requestCli<{ room: unknown }>(
                client,
                `/cli/sessions/${encodeURIComponent(client.sessionId)}/room-tasks`,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        title: args.title,
                        description: args.description,
                        assigneeRoleKey: args.assigneeRoleKey,
                    })
                }
            );
            return successText(pretty(result));
        },
        async room_send_message(args) {
            const result = await requestCli<{ message: unknown }>(
                client,
                `/cli/sessions/${encodeURIComponent(client.sessionId)}/room-messages`,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        text: args.text,
                    })
                }
            );
            return successText(pretty(result));
        },
        async room_assign_task(args) {
            const result = await requestCli<{ room: unknown }>(
                client,
                `/cli/sessions/${encodeURIComponent(client.sessionId)}/room-tasks/${encodeURIComponent(String(args.taskId ?? ''))}/assign`,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        assigneeRoleKey: args.assigneeRoleKey ?? null,
                        note: args.note,
                    })
                }
            );
            return successText(pretty(result));
        },
        async room_claim_task(args) {
            const result = await requestCli<{ room: unknown }>(
                client,
                `/cli/sessions/${encodeURIComponent(client.sessionId)}/room-tasks/${encodeURIComponent(String(args.taskId ?? ''))}/claim`,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        note: args.note,
                    })
                }
            );
            return successText(pretty(result));
        },
        async room_block_task(args) {
            const result = await requestCli<{ room: unknown }>(
                client,
                `/cli/sessions/${encodeURIComponent(client.sessionId)}/room-tasks/${encodeURIComponent(String(args.taskId ?? ''))}/block`,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        reason: args.reason,
                    })
                }
            );
            return successText(pretty(result));
        },
        async room_handoff_task(args) {
            const result = await requestCli<{ room: unknown }>(
                client,
                `/cli/sessions/${encodeURIComponent(client.sessionId)}/room-tasks/${encodeURIComponent(String(args.taskId ?? ''))}/handoff`,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        toRoleKey: args.toRoleKey,
                        note: args.note,
                    })
                }
            );
            return successText(pretty(result));
        },
        async room_complete_task(args) {
            const result = await requestCli<{ room: unknown }>(
                client,
                `/cli/sessions/${encodeURIComponent(client.sessionId)}/room-tasks/${encodeURIComponent(String(args.taskId ?? ''))}/complete`,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        summary: args.summary,
                    })
                }
            );
            return successText(pretty(result));
        },
    };

    for (const tool of agentchatMcpToolDefinitions) {
        mcp.registerTool<any, any>(tool.name, {
            description: tool.description,
            title: tool.title,
            inputSchema: tool.inputSchema,
        }, async (args: Record<string, unknown>) => {
            try {
                return await registerToolHandlers[tool.name](args);
            } catch (error) {
                logger.debug(`[agentchatMCP] ${tool.name} failed:`, error);
                return errorText(`${tool.name} failed: ${error instanceof Error ? error.message : String(error)}`);
            }
        });
    }

    const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined
    });
    await mcp.connect(transport);

    const server = createServer(async (req, res) => {
        try {
            await transport.handleRequest(req, res);
        } catch (error) {
            logger.debug("Error handling request:", error);
            if (!res.headersSent) {
                res.writeHead(500).end();
            }
        }
    });

    const baseUrl = await new Promise<URL>((resolve) => {
        server.listen(0, "127.0.0.1", () => {
            const addr = server.address() as AddressInfo;
            resolve(new URL(`http://127.0.0.1:${addr.port}`));
        });
    });

    return {
        url: baseUrl.toString(),
        toolNames: agentchatMcpToolDefinitions.map((tool) => tool.name),
        stop: () => {
            logger.debug('[agentchatMCP] Stopping server');
            mcp.close();
            server.close();
        }
    }
}
