import { z } from 'zod'

export type AgentChatMcpToolDefinition = {
    name:
        | 'change_title'
        | 'room_get_context'
        | 'room_list_tasks'
        | 'room_create_task'
        | 'room_send_message'
        | 'room_assign_task'
        | 'room_claim_task'
        | 'room_block_task'
        | 'room_handoff_task'
        | 'room_complete_task'
    title: string
    description: string
    inputSchema: z.ZodTypeAny
}

export const agentchatMcpToolDefinitions: AgentChatMcpToolDefinition[] = [
    {
        name: 'change_title',
        title: 'Change Chat Title',
        description: 'Change the title of the current chat session',
        inputSchema: z.object({
            title: z.string().describe('The new title for the chat session'),
        }),
    },
    {
        name: 'room_get_context',
        title: 'Get Room Context',
        description: 'Get the current room, your assigned role, recent messages, and the latest task overview for this agent session',
        inputSchema: z.object({}),
    },
    {
        name: 'room_list_tasks',
        title: 'List Room Tasks',
        description: 'List tasks in the current room for this agent session',
        inputSchema: z.object({
            status: z.enum(['pending', 'in_progress', 'blocked', 'completed']).optional(),
            assigned: z.enum(['mine', 'all', 'unassigned']).optional(),
        }),
    },
    {
        name: 'room_create_task',
        title: 'Create Room Task',
        description: 'Create a new task in the current room. Intended for the planner/coordinator role.',
        inputSchema: z.object({
            title: z.string().min(1),
            description: z.string().optional(),
            assigneeRoleKey: z.string().optional(),
        }),
    },
    {
        name: 'room_send_message',
        title: 'Send Room Message',
        description: 'Send a message to the current room. Use @role or @all in the text when needed.',
        inputSchema: z.object({
            text: z.string().min(1),
        }),
    },
    {
        name: 'room_assign_task',
        title: 'Assign Room Task',
        description: 'Assign a room task to a role. Intended for the planner/coordinator role.',
        inputSchema: z.object({
            taskId: z.string().min(1),
            assigneeRoleKey: z.string().nullable(),
            note: z.string().optional(),
        }),
    },
    {
        name: 'room_claim_task',
        title: 'Claim Room Task',
        description: 'Claim a task in the current room as your role and mark it in progress',
        inputSchema: z.object({
            taskId: z.string().min(1),
            note: z.string().optional(),
        }),
    },
    {
        name: 'room_block_task',
        title: 'Block Room Task',
        description: 'Mark a task as blocked and report the blocker to the room coordinator',
        inputSchema: z.object({
            taskId: z.string().min(1),
            reason: z.string().min(1),
        }),
    },
    {
        name: 'room_handoff_task',
        title: 'Handoff Room Task',
        description: 'Hand off a task from your role to another role in the room',
        inputSchema: z.object({
            taskId: z.string().min(1),
            toRoleKey: z.string().min(1),
            note: z.string().optional(),
        }),
    },
    {
        name: 'room_complete_task',
        title: 'Complete Room Task',
        description: 'Mark a task as completed and provide a completion summary',
        inputSchema: z.object({
            taskId: z.string().min(1),
            summary: z.string().optional(),
        }),
    },
]
