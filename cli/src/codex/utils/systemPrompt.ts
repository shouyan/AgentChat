/**
 * Codex-specific system prompt for local mode.
 *
 * This prompt instructs Codex to call the hapi__change_title function
 * to set appropriate chat session titles.
 */

import { trimIdent } from '@/utils/trimIdent';

/**
 * Title instruction for Codex to call the hapi MCP tool.
 * Note: Codex exposes MCP tools under the `functions.` namespace,
 * so the tool is called as `functions.hapi__change_title`.
 */
export const TITLE_INSTRUCTION = trimIdent(`
    ALWAYS when you start a new chat, call the title tool to set a concise task title.
    Prefer calling functions.hapi__change_title.
    If that exact tool name is unavailable, call an equivalent alias such as hapi__change_title, mcp__hapi__change_title, or hapi_change_title.
    If the task focus changes significantly later, call the title tool again with a better title.

    If room collaboration tools are available, use them instead of guessing shared context:
    - functions.hapi__room_get_context
    - functions.hapi__room_list_tasks
    - functions.hapi__room_create_task / functions.hapi__room_assign_task when acting as planner/coordinator
    - functions.hapi__room_claim_task / functions.hapi__room_block_task / functions.hapi__room_handoff_task / functions.hapi__room_complete_task when executing assigned work
    - functions.hapi__room_send_message for progress updates and coordination
`);

/**
 * The system prompt to inject via developer_instructions in local mode.
 */
export const codexSystemPrompt = TITLE_INSTRUCTION;
