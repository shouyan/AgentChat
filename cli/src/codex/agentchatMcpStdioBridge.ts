/**
 * AgentChat MCP STDIO Bridge
 *
 * Minimal STDIO MCP server exposing AgentChat MCP tools.
 * On invocation it forwards tool calls to an existing AgentChat HTTP MCP server
 * using the StreamableHTTPClientTransport.
 *
 * Configure the target HTTP MCP URL via env var `AGENTCHAT_HTTP_MCP_URL` or
 * via CLI flag `--url <http://127.0.0.1:PORT>`.
 *
 * Note: This process must not print to stdout as it would break MCP STDIO.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { agentchatMcpToolDefinitions } from '@/mcp/toolDefinitions';

function parseArgs(argv: string[]): {
  url: string | null;
  sessionId: string | null;
  accessToken: string | null;
  apiUrl: string | null;
} {
  let url: string | null = null;
  let sessionId: string | null = null;
  let accessToken: string | null = null;
  let apiUrl: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url' && i + 1 < argv.length) {
      url = argv[i + 1];
      i++;
    } else if (a === '--session-id' && i + 1 < argv.length) {
      sessionId = argv[i + 1];
      i++;
    } else if (a === '--access-token' && i + 1 < argv.length) {
      accessToken = argv[i + 1];
      i++;
    } else if (a === '--api-url' && i + 1 < argv.length) {
      apiUrl = argv[i + 1];
      i++;
    }
  }
  return { url, sessionId, accessToken, apiUrl };
}

async function requestCli<T>(apiUrl: string, accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
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

export async function runHappyMcpStdioBridge(argv: string[]): Promise<void> {
  try {
    // Resolve target HTTP MCP URL
    const { url: urlFromArgs, sessionId, accessToken, apiUrl } = parseArgs(argv);
    const baseUrl = urlFromArgs || process.env.AGENTCHAT_HTTP_MCP_URL || '';
    const directSessionId = sessionId || process.env.AGENTCHAT_MCP_SESSION_ID || '';
    const directAccessToken = accessToken || process.env.AGENTCHAT_MCP_ACCESS_TOKEN || '';
    const directApiUrl = apiUrl || process.env.AGENTCHAT_MCP_API_URL || '';

    if (!baseUrl && !(directSessionId && directAccessToken && directApiUrl)) {
      // Write to stderr; never stdout.
      process.stderr.write(
        '[agentchat-mcp] Missing target URL or direct session credentials. Pass --url <http://127.0.0.1:PORT> or --session-id/--access-token/--api-url.\n'
      );
      process.exit(2);
    }

    let httpClient: Client | null = null;

    async function ensureHttpClient(): Promise<Client> {
      if (httpClient) return httpClient;
      const client = new Client(
        { name: 'agentchat-stdio-bridge', version: '1.0.0' },
        { capabilities: {} }
      );

      const transport = new StreamableHTTPClientTransport(new URL(baseUrl));
      await client.connect(transport);
      httpClient = client;
      return client;
    }

    // Create STDIO MCP server
    const server = new McpServer({
      name: 'AgentChat MCP Bridge',
      version: '1.0.0',
    });

    for (const tool of agentchatMcpToolDefinitions) {
      server.registerTool<any, any>(
        tool.name,
        {
          description: tool.description,
          title: tool.title,
          inputSchema: tool.inputSchema,
        },
        async (args: Record<string, unknown>) => {
          try {
            if (directSessionId && directAccessToken && directApiUrl) {
              const taskId = String(args.taskId ?? '');
              switch (tool.name) {
                case 'change_title':
                  return {
                    content: [{ type: 'text' as const, text: `Successfully changed chat title to: "${String(args.title ?? '')}"` }],
                    isError: false,
                  };
                case 'room_get_context': {
                  const result = await requestCli(directApiUrl, directAccessToken,
                    `/cli/sessions/${encodeURIComponent(directSessionId)}/room-context`);
                  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], isError: false };
                }
                case 'room_list_tasks': {
                  const params = new URLSearchParams();
                  if (typeof args.status === 'string') params.set('status', args.status);
                  if (typeof args.assigned === 'string') params.set('assigned', args.assigned);
                  const qs = params.toString();
                  const result = await requestCli(directApiUrl, directAccessToken,
                    `/cli/sessions/${encodeURIComponent(directSessionId)}/room-tasks${qs ? `?${qs}` : ''}`);
                  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], isError: false };
                }
                case 'room_create_task': {
                  const result = await requestCli(directApiUrl, directAccessToken,
                    `/cli/sessions/${encodeURIComponent(directSessionId)}/room-tasks`,
                    { method: 'POST', body: JSON.stringify({
                      title: args.title,
                      description: args.description,
                      assigneeRoleKey: args.assigneeRoleKey,
                    }) });
                  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], isError: false };
                }
                case 'room_send_message': {
                  const result = await requestCli(directApiUrl, directAccessToken,
                    `/cli/sessions/${encodeURIComponent(directSessionId)}/room-messages`,
                    { method: 'POST', body: JSON.stringify({ text: args.text }) });
                  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], isError: false };
                }
                case 'room_assign_task': {
                  const result = await requestCli(directApiUrl, directAccessToken,
                    `/cli/sessions/${encodeURIComponent(directSessionId)}/room-tasks/${encodeURIComponent(taskId)}/assign`,
                    { method: 'POST', body: JSON.stringify({
                      assigneeRoleKey: args.assigneeRoleKey ?? null,
                      note: args.note,
                    }) });
                  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], isError: false };
                }
                case 'room_claim_task': {
                  const result = await requestCli(directApiUrl, directAccessToken,
                    `/cli/sessions/${encodeURIComponent(directSessionId)}/room-tasks/${encodeURIComponent(taskId)}/claim`,
                    { method: 'POST', body: JSON.stringify({ note: args.note }) });
                  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], isError: false };
                }
                case 'room_block_task': {
                  const result = await requestCli(directApiUrl, directAccessToken,
                    `/cli/sessions/${encodeURIComponent(directSessionId)}/room-tasks/${encodeURIComponent(taskId)}/block`,
                    { method: 'POST', body: JSON.stringify({ reason: args.reason }) });
                  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], isError: false };
                }
                case 'room_handoff_task': {
                  const result = await requestCli(directApiUrl, directAccessToken,
                    `/cli/sessions/${encodeURIComponent(directSessionId)}/room-tasks/${encodeURIComponent(taskId)}/handoff`,
                    { method: 'POST', body: JSON.stringify({
                      toRoleKey: args.toRoleKey,
                      note: args.note,
                    }) });
                  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], isError: false };
                }
                case 'room_complete_task': {
                  const result = await requestCli(directApiUrl, directAccessToken,
                    `/cli/sessions/${encodeURIComponent(directSessionId)}/room-tasks/${encodeURIComponent(taskId)}/complete`,
                    { method: 'POST', body: JSON.stringify({ summary: args.summary }) });
                  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], isError: false };
                }
              }
            }

            const client = await ensureHttpClient();
            const response = await client.callTool({ name: tool.name, arguments: args });
            return response as any;
          } catch (error) {
            return {
              content: [
                { type: 'text' as const, text: `Failed to call ${tool.name}: ${error instanceof Error ? error.message : String(error)}` },
              ],
              isError: true,
            };
          }
        }
      );
    }

    // Start STDIO transport
    const stdio = new StdioServerTransport();
    await server.connect(stdio);
  } catch (err) {
    try {
      process.stderr.write(`[agentchat-mcp] Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
    } finally {
      process.exit(1);
    }
  }
}
