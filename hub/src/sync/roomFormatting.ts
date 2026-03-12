import type { Room, RoomRole } from '@hapi/protocol/types'

export const ROOM_EXECUTION_TOOL_NAMES = [
    'room_get_context',
    'room_list_tasks',
    'room_send_message',
    'room_claim_task',
    'room_block_task',
    'room_handoff_task',
    'room_complete_task',
] as const

export const ROOM_COORDINATOR_TOOL_NAMES = [
    ...ROOM_EXECUTION_TOOL_NAMES,
    'room_create_task',
    'room_assign_task',
] as const

export function roleMatchesHints(role: Pick<RoomRole, 'key' | 'label'>, hints: string[]): boolean {
    const haystack = `${role.key} ${role.label}`.toLowerCase()
    return hints.some((hint) => haystack.includes(hint.toLowerCase()))
}

export function roomHasGoal(room: Pick<Room, 'metadata'>): boolean {
    return typeof room.metadata.goal === 'string' && room.metadata.goal.trim().length > 0
}

export function describeRoomSender(payload: { senderType: 'user' | 'session' | 'system'; senderId: string; roleKey?: string }): string {
    if (payload.senderType === 'user') {
        return 'User'
    }
    if (payload.senderType === 'system') {
        return 'System'
    }
    return payload.roleKey ? `@${payload.roleKey}` : `Session ${payload.senderId}`
}

export function formatForwardedRoomMessage(
    room: Room,
    text: string,
    routing: {
        deliveryMode: 'broadcast' | 'coordinator' | 'mention' | 'explicit_role' | 'explicit_session'
        mentions: string[]
        mentionAll: boolean
    },
    senderLabel: string,
    receivingRoleKey?: string
): string {
    const receivingRoleLabel = receivingRoleKey
        ? room.state.roles.find((role) => role.key === receivingRoleKey)?.label ?? receivingRoleKey
        : null
    const mentionSummary = routing.mentionAll
        ? '@all'
        : routing.mentions.length > 0
            ? routing.mentions.map((item) => `@${item}`).join(', ')
            : null

    const deliveryLine =
        routing.deliveryMode === 'coordinator'
            ? 'Routing: no @mention found, so this was sent to the room coordinator.'
            : routing.deliveryMode === 'broadcast'
                ? 'Routing: broadcast to everyone in the room.'
                : routing.deliveryMode === 'mention'
                    ? 'Routing: delivered because your role was mentioned in the room chat.'
                    : routing.deliveryMode === 'explicit_role'
                        ? 'Routing: delivered to a specific room role.'
                        : 'Routing: delivered to a specific session.'

    return [
        `[Room: ${room.metadata.name}]`,
        room.metadata.goal ? `Goal: ${room.metadata.goal}` : null,
        `Sender: ${senderLabel}`,
        deliveryLine,
        mentionSummary ? `Mentions: ${mentionSummary}` : null,
        receivingRoleLabel ? `You are receiving this as: ${receivingRoleLabel}` : null,
        '',
        text,
        '',
        'If you need another role to act, reply with room_send_message and use @mentions.',
    ].filter(Boolean).join('\n')
}

export function formatRoleBriefing(room: Room, role: { label: string; key: string; description?: string | null; assignedSessionId?: string | null }): string {
    const roleLines = room.state.roles.map((item) => {
        const assigned = item.assignedSessionId ? `session ${item.assignedSessionId}` : 'unassigned'
        return `- ${item.label} (${item.key}): ${assigned}`
    })
    const hasGoal = roomHasGoal(room)
    return [
        `You are joining room: ${room.metadata.name}`,
        hasGoal ? `Room goal: ${room.metadata.goal}` : null,
        `Your role: ${role.label}`,
        role.description ? `Responsibilities: ${role.description}` : null,
        !hasGoal ? 'Quiet startup mode is active because the room has no goal yet.' : null,
        !hasGoal ? 'This join notice is informational only. Do not reply in the room or announce that you are online.' : null,
        !hasGoal ? 'Stay idle until the user sends the first room message, you are explicitly @mentioned, or a task is assigned to you.' : null,
        '',
        'Current roles:',
        ...roleLines,
        '',
        'Room collaboration protocol:',
        '1. Everyone can read room chat, but only act immediately when you are @mentioned or assigned a task.',
        '2. If a room message has no @mention, the coordinator/planner is expected to react first.',
        '3. When you start work, report progress; if blocked, explain the blocker; when done, hand off clearly to the next role.',
        '4. Use room_get_context first when you need the latest room state, then coordinate through room_send_message.',
        '',
        hasGoal
            ? 'Work within your assigned role unless explicitly reassigned.'
            : 'Until the room gets its first real instruction, do not send any message just to acknowledge this briefing.',
    ].filter(Boolean).join('\n')
}

export function formatTaskBriefing(roomName: string, task: { title: string; description?: string | null; assigneeRoleKey?: string | null }): string {
    return [
        `[Room Task: ${roomName}]`,
        `Task: ${task.title}`,
        task.description ? `Details: ${task.description}` : null,
        task.assigneeRoleKey ? `Assigned role: ${task.assigneeRoleKey}` : null,
    ].filter(Boolean).join('\n')
}

export function buildRoomAppendSystemPrompt(room: Room, role: Pick<RoomRole, 'key' | 'label' | 'description'>, isCoordinatorRole: boolean): string {
    const toolNames = isCoordinatorRole ? ROOM_COORDINATOR_TOOL_NAMES : ROOM_EXECUTION_TOOL_NAMES
    const hasGoal = roomHasGoal(room)
    return [
        `You are participating in room "${room.metadata.name}" as @${role.key} (${role.label}).`,
        hasGoal ? `Shared goal: ${room.metadata.goal}` : null,
        role.description ? `Role responsibilities: ${role.description}` : null,
        'Treat the room as a multi-agent group chat: everyone can read everything, but you should only take the lead when you are @mentioned, directly assigned a task, or you are the coordinator responding to an unmentioned room message.',
        'Before acting on room work, prefer room_get_context and room_list_tasks to confirm the latest shared state.',
        hasGoal
            ? 'Keep the room updated with room_send_message. When work starts, claim it; when blocked, report the blocker; when done, hand off or complete the task explicitly.'
            : 'If the room has no goal yet, do not send any greeting, status update, or acknowledgment after joining. Stay quiet until the user speaks first, you are explicitly @mentioned, or a task is assigned.',
        isCoordinatorRole
            ? hasGoal
                ? 'As coordinator/planner, you are responsible for decomposing goals, creating tasks, and assigning them to the right roles.'
                : 'As coordinator/planner, wait for the first user message when the room has no goal, then coordinate and assign work from that conversation.'
            : 'Do not impersonate the planner or other roles; collaborate through @mentions, task updates, and clear handoffs.',
        `Relevant room tools: ${toolNames.join(', ')}.`,
    ].filter(Boolean).join('\n')
}

export function buildRoomMessageMeta(room: Room, role: Pick<RoomRole, 'key' | 'label' | 'description'> | undefined, isCoordinatorRole: boolean): Record<string, unknown> | undefined {
    if (!role) {
        return undefined
    }
    return {
        appendSystemPrompt: buildRoomAppendSystemPrompt(room, role, isCoordinatorRole),
    }
}

export function suggestFollowUpRole(room: Room, completedByRoleKey?: string): RoomRole | null {
    const candidates = room.state.roles.filter((role) => role.key !== completedByRoleKey)
    if (candidates.length === 0) {
        return null
    }

    const currentRole = room.state.roles.find((role) => role.key === completedByRoleKey)
    const isBuildRole = currentRole ? roleMatchesHints(currentRole, ['coder', 'implementer', 'developer', 'architect', 'researcher', 'writer']) : false
    const isTestRole = currentRole ? roleMatchesHints(currentRole, ['tester', 'test', 'qa', 'verify']) : false

    const priorityGroups = isBuildRole
        ? [
            ['tester', 'test', 'qa', 'verify'],
            ['reviewer', 'review', 'critic'],
            ['planner', 'coordinator', 'lead'],
        ]
        : isTestRole
            ? [
                ['reviewer', 'review', 'critic'],
                ['planner', 'coordinator', 'lead'],
            ]
            : [
                ['reviewer', 'review', 'critic'],
                ['tester', 'test', 'qa', 'verify'],
                ['planner', 'coordinator', 'lead'],
            ]

    for (const group of priorityGroups) {
        const matched = candidates.find((role) => roleMatchesHints(role, group))
        if (matched) {
            return matched
        }
    }

    return candidates[0] ?? null
}
