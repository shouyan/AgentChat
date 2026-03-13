/**
 * OpenCode-specific system prompt for change_title tool.
 *
 * OpenCode exposes MCP tools with the naming pattern: <server-name>_<tool-name>
 * The agentchat MCP server exposes `change_title`, so it's called as `agentchat_change_title`.
 */

import { trimIdent } from '@/utils/trimIdent';

/**
 * Title instruction for OpenCode to call the agentchat MCP tool.
 */
export const TITLE_INSTRUCTION = trimIdent(`
    ALWAYS when you start a new chat - you must call the tool "agentchat_change_title" to set a chat title. When you think chat title is not relevant anymore - call the tool again to change it. When chat name is too generic and you have a chance to make it more specific - call the tool again to change it. This title is needed to easily find the chat in the future. Help human.

    If room collaboration tools are available, use them instead of guessing room state:
    - "agentchat_room_get_context"
    - "agentchat_room_list_tasks"
    - "agentchat_room_create_task" / "agentchat_room_assign_task" when acting as planner/coordinator
    - "agentchat_room_claim_task", "agentchat_room_block_task", "agentchat_room_handoff_task", and "agentchat_room_complete_task" when executing assigned work
    - "agentchat_room_send_message" for progress updates and coordination
`);

/**
 * The system prompt to inject for OpenCode sessions.
 */
export const opencodeSystemPrompt = TITLE_INSTRUCTION;
