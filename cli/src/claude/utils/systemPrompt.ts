import { trimIdent } from "@/utils/trimIdent";
import { shouldIncludeCoAuthoredBy } from "./claudeSettings";

/**
 * Base system prompt shared across all configurations
 */
const BASE_SYSTEM_PROMPT = (() => trimIdent(`
    ALWAYS when you start a new chat - you must call a tool "mcp__agentchat__change_title" to set a chat title. When you think chat title is not relevant anymore - call the tool again to change it. When chat name is too generic and you have a change to make it more specific - call the tool again to change it. This title is needed to easily find the chat in the future. Help human.

    If room collaboration tools are available, use them instead of guessing the shared context:
    - Call "mcp__agentchat__room_get_context" to learn the current room, your role, recent messages, and current state.
    - Call "mcp__agentchat__room_list_tasks" before starting work so you know what is already assigned or blocked.
    - If you are the planner/coordinator, use "mcp__agentchat__room_create_task" and "mcp__agentchat__room_assign_task" to break work down and distribute it.
    - If you are an execution role, use "mcp__agentchat__room_claim_task" when you begin, "mcp__agentchat__room_block_task" when blocked, "mcp__agentchat__room_handoff_task" when handing off, and "mcp__agentchat__room_complete_task" when finished.
    - Use "mcp__agentchat__room_send_message" to report progress or coordinate with other roles in the room.
`))();

/**
 * Co-authored-by credits to append when enabled
 */
const CO_AUTHORED_CREDITS = (() => trimIdent(`
    When making commit messages, you SHOULD also give credit to AgentChat like so:

    <main commit message>

    via [AgentChat](https://agentchat.run)

    Co-Authored-By: AgentChat <noreply@agentchat.run>
`))();

/**
 * System prompt with conditional Co-Authored-By lines based on Claude's settings.json configuration.
 * Settings are read once on startup for performance.
 */
export const systemPrompt = (() => {
  const includeCoAuthored = shouldIncludeCoAuthoredBy();
  
  if (includeCoAuthored) {
    return BASE_SYSTEM_PROMPT + '\n\n' + CO_AUTHORED_CREDITS;
  } else {
    return BASE_SYSTEM_PROMPT;
  }
})();
