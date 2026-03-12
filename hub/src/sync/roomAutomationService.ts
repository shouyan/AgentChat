import type { Room, RoomRole } from '@hapi/protocol/types'
import { buildRoomMessageMeta, formatTaskBriefing, roomHasGoal, suggestFollowUpRole } from './roomFormatting'

type SendRoomMessage = (roomId: string, namespace: string, payload: {
    senderType: 'user' | 'session' | 'system'
    senderId: string
    roleKey?: string
    content: {
        type: 'text' | 'system'
        text: string
        targetRoleKey?: string
        targetSessionId?: string
        mentions?: string[]
        mentionAll?: boolean
        deliveryMode?: 'broadcast' | 'coordinator' | 'mention' | 'explicit_role' | 'explicit_session'
        meta?: Record<string, unknown>
    }
    forwardToAgent?: boolean
}) => Promise<unknown>

type RoomAutomationDependencies = {
    sendRoomMessage: SendRoomMessage
    sendRoomAwareDirectMessage: (sessionId: string, roomId: string, namespace: string, text: string, extraMeta?: Record<string, unknown>) => Promise<void>
    hasRecentProtocolEvent: (roomId: string, namespace: string, eventType: string, options?: { taskId?: string; limit?: number }) => boolean
    getRoom: (roomId: string, namespace: string) => Room | null
    findCoordinatorRoleKey: (roomId: string, namespace: string) => string | null
    findCoordinatorSessionId: (roomId: string, namespace: string) => string | null
    uniqueStrings: (values: Array<string | null | undefined>) => string[]
}

export class RoomAutomationService {
    private readonly sendRoomMessage: RoomAutomationDependencies['sendRoomMessage']
    private readonly sendRoomAwareDirectMessage: RoomAutomationDependencies['sendRoomAwareDirectMessage']
    private readonly hasRecentProtocolEvent: RoomAutomationDependencies['hasRecentProtocolEvent']
    private readonly getRoom: RoomAutomationDependencies['getRoom']
    private readonly findCoordinatorRoleKey: RoomAutomationDependencies['findCoordinatorRoleKey']
    private readonly findCoordinatorSessionId: RoomAutomationDependencies['findCoordinatorSessionId']
    private readonly uniqueStrings: RoomAutomationDependencies['uniqueStrings']

    constructor(deps: RoomAutomationDependencies) {
        this.sendRoomMessage = deps.sendRoomMessage
        this.sendRoomAwareDirectMessage = deps.sendRoomAwareDirectMessage
        this.hasRecentProtocolEvent = deps.hasRecentProtocolEvent
        this.getRoom = deps.getRoom
        this.findCoordinatorRoleKey = deps.findCoordinatorRoleKey
        this.findCoordinatorSessionId = deps.findCoordinatorSessionId
        this.uniqueStrings = deps.uniqueStrings
    }

    async maybeSendPlannerBootstrap(
        room: Room,
        namespace: string,
        role: Pick<RoomRole, 'id' | 'key' | 'label' | 'assignedSessionId'>
    ): Promise<void> {
        if (!role.assignedSessionId) {
            return
        }
        if (!roomHasGoal(room)) {
            return
        }
        if (room.state.tasks.length > 0) {
            return
        }
        if (this.hasRecentProtocolEvent(room.id, namespace, 'planner_bootstrap')) {
            return
        }

        const bootstrapText = [
            `[Room Planner Bootstrap: ${room.metadata.name}]`,
            `You are the coordinator for this room.${room.metadata.goal ? ` Goal: ${room.metadata.goal}` : ''}`,
            'Please turn the room goal into an initial task board now.',
            'Suggested flow:',
            '1. Call room_get_context.',
            '2. Break the goal into concrete tasks.',
            '3. Create tasks with room_create_task.',
            '4. Assign each task with room_assign_task.',
            '5. Announce the initial plan in the room and use @mentions for the roles that should act next.',
        ].join('\n')

        await this.sendRoomAwareDirectMessage(role.assignedSessionId, room.id, namespace, bootstrapText)
        await this.sendRoomMessage(room.id, namespace, {
            senderType: 'system',
            senderId: 'system',
            roleKey: role.key,
            content: {
                type: 'system',
                text: `Planner bootstrap sent to @${role.key}. The coordinator should create the initial task board for this room.`,
                mentions: [role.key],
                deliveryMode: 'explicit_role',
                meta: {
                    protocol: 'room-automation',
                    eventType: 'planner_bootstrap',
                },
            },
            forwardToAgent: false,
        })
    }

    async sendBlockedTaskPlannerNudge(
        roomId: string,
        namespace: string,
        task: { id: string; title: string; assigneeRoleKey?: string | null },
        payload: { roleKey?: string; reason: string }
    ): Promise<void> {
        if (this.hasRecentProtocolEvent(roomId, namespace, 'task_blocked_followup', { taskId: task.id })) {
            return
        }
        const room = this.getRoom(roomId, namespace)
        const coordinatorKey = this.findCoordinatorRoleKey(roomId, namespace)
        const coordinatorSessionId = this.findCoordinatorSessionId(roomId, namespace)
        if (room && coordinatorKey) {
            await this.sendRoomMessage(roomId, namespace, {
                senderType: 'system',
                senderId: 'system',
                roleKey: coordinatorKey,
                content: {
                    type: 'system',
                    text: `Planner follow-up: @${coordinatorKey} should resolve blocker for "${task.title}" by replying in the room or reassigning the task.`,
                    mentions: this.uniqueStrings([coordinatorKey, payload.roleKey]),
                    deliveryMode: 'explicit_role',
                    targetRoleKey: coordinatorKey,
                    meta: {
                        protocol: 'room-automation',
                        eventType: 'task_blocked_followup',
                        taskId: task.id,
                    },
                },
                forwardToAgent: false,
            })
        }
        if (!coordinatorSessionId) {
            return
        }
        await this.sendRoomAwareDirectMessage(coordinatorSessionId, roomId, namespace, [
            `[Planner Follow-up: ${room?.metadata.name ?? roomId}]`,
            `Blocked task: ${task.title}`,
            task.assigneeRoleKey ? `Current owner: @${task.assigneeRoleKey}` : null,
            payload.roleKey ? `Reported by: @${payload.roleKey}` : null,
            `Reason: ${payload.reason}`,
            '',
            'Please inspect room_get_context / room_list_tasks, then either unblock the task, reassign it, or post new instructions in the room.',
        ].filter(Boolean).join('\n'))
    }

    async sendCompletionPlannerNudge(
        roomId: string,
        namespace: string,
        task: { id: string; title: string; assigneeRoleKey?: string | null },
        payload: { roleKey?: string; summary?: string }
    ): Promise<void> {
        if (this.hasRecentProtocolEvent(roomId, namespace, 'task_followup_suggested', { taskId: task.id })) {
            return
        }
        const room = this.getRoom(roomId, namespace)
        if (!room) {
            return
        }
        const coordinatorKey = this.findCoordinatorRoleKey(roomId, namespace)
        const coordinatorSessionId = this.findCoordinatorSessionId(roomId, namespace)
        const suggestedRole = suggestFollowUpRole(room, payload.roleKey)
        const suggestionText = suggestedRole
            ? `Suggested next step: @${coordinatorKey ?? suggestedRole.key} should consider routing "${task.title}" to @${suggestedRole.key} next.`
            : `Suggested next step: @${coordinatorKey ?? payload.roleKey ?? 'coordinator'} should review the completed task and decide what happens next.`

        await this.sendRoomMessage(roomId, namespace, {
            senderType: 'system',
            senderId: 'system',
            roleKey: coordinatorKey ?? payload.roleKey,
            content: {
                type: 'system',
                text: suggestionText,
                mentions: this.uniqueStrings([coordinatorKey, suggestedRole?.key, payload.roleKey]),
                deliveryMode: coordinatorKey ? 'explicit_role' : 'broadcast',
                targetRoleKey: coordinatorKey ?? undefined,
                meta: {
                    protocol: 'room-automation',
                    eventType: 'task_followup_suggested',
                    taskId: task.id,
                    suggestedRoleKey: suggestedRole?.key ?? null,
                },
            },
            forwardToAgent: false,
        })

        if (!coordinatorSessionId) {
            return
        }

        await this.sendRoomAwareDirectMessage(coordinatorSessionId, roomId, namespace, [
            `[Planner Follow-up: ${room.metadata.name}]`,
            `Completed task: ${task.title}`,
            payload.roleKey ? `Completed by: @${payload.roleKey}` : null,
            payload.summary ? `Summary: ${payload.summary}` : null,
            suggestedRole ? `Recommended next role: @${suggestedRole.key} (${suggestedRole.label})` : null,
            '',
            'Review the room state, then decide whether to assign a follow-up task, request review/testing, or close out the work.',
        ].filter(Boolean).join('\n'))
    }

    async sendTaskProtocolMessage(
        roomId: string,
        namespace: string,
        payload: {
            text: string
            eventType: 'task_assigned' | 'task_claimed' | 'task_blocked' | 'task_handoff' | 'task_completed'
            task: {
                id: string
                title: string
                status: 'pending' | 'in_progress' | 'blocked' | 'completed'
                assigneeRoleKey?: string | null
                assigneeSessionId?: string | null
            }
            actorRoleKey?: string
            targetRoleKey?: string
            note?: string
            mentions?: string[]
        }
    ): Promise<void> {
        await this.sendRoomMessage(roomId, namespace, {
            senderType: 'system',
            senderId: 'system',
            roleKey: payload.actorRoleKey,
            content: {
                type: 'system',
                text: payload.text,
                targetRoleKey: payload.targetRoleKey,
                mentions: payload.mentions,
                deliveryMode: payload.targetRoleKey ? 'explicit_role' : 'broadcast',
                meta: {
                    protocol: 'task-lifecycle',
                    eventType: payload.eventType,
                    taskId: payload.task.id,
                    taskTitle: payload.task.title,
                    taskStatus: payload.task.status,
                    assigneeRoleKey: payload.task.assigneeRoleKey ?? null,
                    assigneeSessionId: payload.task.assigneeSessionId ?? null,
                    actorRoleKey: payload.actorRoleKey ?? null,
                    note: payload.note ?? null,
                },
            },
            forwardToAgent: false,
        })
    }

    async notifyTaskAssignee(
        roomId: string,
        namespace: string,
        task: {
            id: string
            title: string
            description?: string | null
            status: 'pending' | 'in_progress' | 'blocked' | 'completed'
            assigneeRoleKey?: string | null
            assigneeSessionId?: string | null
        },
        eventType: 'task_assigned' | 'task_handoff',
        note?: string,
        fromRoleKey?: string
    ): Promise<void> {
        if (!task.assigneeSessionId) {
            return
        }
        const room = this.getRoom(roomId, namespace)
        const lines = [
            formatTaskBriefing(room?.metadata.name ?? roomId, task),
            eventType === 'task_handoff' ? 'You have received a task handoff.' : 'A task has been assigned to you.',
            task.assigneeRoleKey ? `Your role: @${task.assigneeRoleKey}` : null,
            fromRoleKey ? `Handoff from: @${fromRoleKey}` : null,
            note ? `Context: ${note}` : null,
            '',
            'Please acknowledge in the room, then either start work, report blockers, or hand off when finished.',
        ].filter(Boolean)

        await this.sendRoomAwareDirectMessage(task.assigneeSessionId, roomId, namespace, lines.join('\n'))
    }

    buildRoomMessageMeta(room: Room, role: Pick<RoomRole, 'key' | 'label' | 'description'> | undefined, isCoordinatorRole: boolean): Record<string, unknown> | undefined {
        return buildRoomMessageMeta(room, role, isCoordinatorRole)
    }
}
