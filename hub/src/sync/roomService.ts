import type { Room, RoomMessage, RoomMetadata, RoomRole, RoomTask } from '@hapi/protocol/types'
import {
  getRoomCoordinatorRoleKey,
  resolveRoomMentionTargets,
  uniqueRoomStrings,
} from '@hapi/protocol/roomRouting'
import type { Store } from '../store'
import { RoomAutomationService } from './roomAutomationService'
import type { EventPublisher } from './eventPublisher'
import type { MessageService } from './messageService'
import {
  buildRoomAppendSystemPrompt,
  buildRoomMessageMeta,
  describeRoomSender,
  formatForwardedRoomMessage,
  formatRoleBriefing,
  formatTaskBriefing,
  roomHasGoal,
} from './roomFormatting'
import type { Session } from './syncEngine'

type RoomDeliveryMode = 'broadcast' | 'coordinator' | 'mention' | 'explicit_role' | 'explicit_session'

export type CreateRoomInput = {
  metadata: RoomMetadata
  roles?: Array<{
    key: string
    label: string
    description?: string
    required?: boolean
    preferredFlavor?: 'claude' | 'codex' | 'cursor' | 'gemini' | 'opencode'
    preferredModel?: string
    permissionMode?: string
    assignmentMode?: 'existing_session' | 'spawn_new' | 'unassigned'
    assignedSessionId?: string | null
    spawnConfig?: {
      machineId?: string
      flavor?: 'claude' | 'codex' | 'cursor' | 'gemini' | 'opencode'
      model?: string
      path?: string
      permissionMode?: string
      yolo?: boolean
      sessionType?: 'simple' | 'worktree'
      worktreeName?: string
    }
    sortOrder?: number
  }>
}

type SendRoomMessageInput = {
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
    deliveryMode?: RoomDeliveryMode
    meta?: Record<string, unknown>
  }
  forwardToAgent?: boolean
}

type ResolvedRoomRouting = {
  deliveryMode: RoomDeliveryMode
  targetRoleKey?: string
  targetSessionId?: string
  mentions: string[]
  mentionAll: boolean
  targetRoleKeys: string[]
  targetSessionIds: string[]
}

type SessionRoomAssignment = {
  room: Room
  role: RoomRole
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return uniqueRoomStrings(values)
}

export class RoomService {
  private readonly automationService: RoomAutomationService

  constructor(
    private readonly store: Store,
    private readonly publisher: EventPublisher,
    private readonly messageService: MessageService,
    private readonly resolveSession: (sessionId: string, namespace: string) => Session | undefined,
    private readonly clearSessionRoomLink: (sessionId: string, namespace: string, roomId: string) => Promise<void>
  ) {
    this.automationService = new RoomAutomationService({
      sendRoomMessage: (roomId, namespace, payload) => this.sendRoomMessage(roomId, namespace, payload),
      sendRoomAwareDirectMessage: (sessionId, roomId, namespace, text, extraMeta) => this.sendRoomAwareDirectMessage(sessionId, roomId, namespace, text, extraMeta),
      hasRecentProtocolEvent: (roomId, namespace, eventType, options) => this.hasRecentProtocolEvent(roomId, namespace, eventType, options),
      getRoom: (roomId, namespace) => this.toProtocolRoom(roomId, namespace),
      findCoordinatorRoleKey: (roomId, namespace) => this.findCoordinatorRoleKey(roomId, namespace),
      findCoordinatorSessionId: (roomId, namespace) => this.findCoordinatorSessionId(roomId, namespace),
      uniqueStrings,
    })
  }

  getRoomsByNamespace(namespace: string): Room[] {
    return this.store.rooms.getRoomsByNamespace(namespace).map((room) => this.toProtocolRoom(room.id, namespace)).filter(Boolean) as Room[]
  }

  getRoomByNamespace(roomId: string, namespace: string): Room | undefined {
    return this.toProtocolRoom(roomId, namespace) ?? undefined
  }

  getSessionRoomContext(
    sessionId: string,
    namespace: string,
    options?: { recentLimit?: number }
  ): {
    room: Room
    role: RoomRole
    recentMessages: RoomMessage[]
    availableMentions: string[]
  } | null {
    const assignment = this.findSessionRoomAssignment(sessionId, namespace)
    if (!assignment) {
      return null
    }
    const recentLimit = Math.max(1, Math.min(50, options?.recentLimit ?? 12))
    const recentMessages = this.getRoomMessagesPage(assignment.room.id, namespace, { limit: recentLimit, beforeSeq: null }).messages
    return {
      room: assignment.room,
      role: assignment.role,
      recentMessages,
      availableMentions: assignment.room.state.roles.map((role) => role.key),
    }
  }

  listSessionRoomTasks(
    sessionId: string,
    namespace: string,
    options?: {
      status?: 'pending' | 'in_progress' | 'blocked' | 'completed'
      assigned?: 'mine' | 'all' | 'unassigned'
    }
  ): {
    room: Room
    role: RoomRole
    tasks: RoomTask[]
  } | null {
    const assignment = this.findSessionRoomAssignment(sessionId, namespace)
    if (!assignment) {
      return null
    }
    let tasks = assignment.room.state.tasks.slice()
    if (options?.status) {
      tasks = tasks.filter((task) => task.status === options.status)
    }
    if (options?.assigned === 'mine') {
      tasks = tasks.filter((task) =>
        task.assigneeSessionId === sessionId
        || task.assigneeRoleKey === assignment.role.key
      )
    } else if (options?.assigned === 'unassigned') {
      tasks = tasks.filter((task) => !task.assigneeRoleKey && !task.assigneeSessionId)
    }
    return {
      room: assignment.room,
      role: assignment.role,
      tasks,
    }
  }

  createRoom(namespace: string, input: CreateRoomInput): Room {
    const room = this.store.rooms.createRoom(input.metadata, namespace)
    const roles = input.roles ?? []
    for (const role of roles) {
      this.store.rooms.createRoomRole(room.id, namespace, role)
    }
    const result = this.toProtocolRoom(room.id, namespace)
    if (!result) {
      throw new Error('Failed to load created room')
    }
    this.publisher.emit({ type: 'room-added', roomId: result.id, data: result, namespace })
    return result
  }

  updateRoomMetadata(roomId: string, namespace: string, metadata: RoomMetadata): Room {
    const updated = this.store.rooms.updateRoomMetadata(roomId, metadata, namespace)
    if (!updated) {
      throw new Error('Room not found')
    }
    const room = this.toProtocolRoom(roomId, namespace)
    if (!room) {
      throw new Error('Room not found')
    }
    this.publisher.emit({ type: 'room-updated', roomId: room.id, data: room, namespace })
    return room
  }

  deleteRoom(roomId: string, namespace: string): void {
    const deleted = this.store.rooms.deleteRoom(roomId, namespace)
    if (!deleted) {
      throw new Error('Room not found')
    }
    this.publisher.emit({ type: 'room-removed', roomId, namespace })
  }

  addRole(roomId: string, namespace: string, role: NonNullable<CreateRoomInput['roles']>[number]): Room {
    const room = this.store.rooms.getRoomByNamespace(roomId, namespace)
    if (!room) {
      throw new Error('Room not found')
    }
    this.store.rooms.createRoomRole(roomId, namespace, role)
    return this.emitRoomUpdated(roomId, namespace)
  }

  updateRole(roomId: string, roleId: string, namespace: string, patch: Parameters<Store['rooms']['updateRoomRole']>[3]): Room {
    const updated = this.store.rooms.updateRoomRole(roomId, roleId, namespace, patch)
    if (!updated) {
      throw new Error('Role not found')
    }
    if (updated.assignedSessionId) {
      void this.sendRoleBriefing(roomId, namespace, updated.id)
    }
    return this.emitRoomUpdated(roomId, namespace)
  }

  async assignRoleToSession(roomId: string, roleId: string, sessionId: string, namespace: string): Promise<Room> {
    const session = this.resolveSession(sessionId, namespace)
    if (!session) {
      throw new Error('Session not found')
    }
    const previousRole = this.store.rooms.getRoomRoleByNamespace(roleId, namespace)
    if (!previousRole || previousRole.roomId !== roomId) {
      throw new Error('Role not found')
    }
    const updated = this.store.rooms.updateRoomRole(roomId, roleId, namespace, {
      assignmentMode: 'existing_session',
      assignedSessionId: sessionId,
      spawnConfig: null,
    })
    if (!updated) {
      throw new Error('Role not found')
    }
    if (previousRole.assignedSessionId && previousRole.assignedSessionId !== sessionId) {
      await this.detachRoomLinkedSessionIfNeeded(previousRole, namespace)
    }
    void this.sendRoleBriefing(roomId, namespace, roleId)
    return this.emitRoomUpdated(roomId, namespace)
  }

  async clearRoleAssignment(roomId: string, roleId: string, namespace: string): Promise<Room> {
    const previousRole = this.store.rooms.getRoomRoleByNamespace(roleId, namespace)
    if (!previousRole || previousRole.roomId !== roomId) {
      throw new Error('Role not found')
    }
    const updated = this.store.rooms.updateRoomRole(roomId, roleId, namespace, {
      assignmentMode: 'unassigned',
      assignedSessionId: null,
    })
    if (!updated) {
      throw new Error('Role not found')
    }
    await this.detachRoomLinkedSessionIfNeeded(previousRole, namespace)
    return this.emitRoomUpdated(roomId, namespace)
  }

  createTask(roomId: string, namespace: string, task: {
    title: string
    description?: string
    status?: 'pending' | 'in_progress' | 'blocked' | 'completed'
    assigneeRoleKey?: string
    assigneeSessionId?: string | null
  }): Room {
    const created = this.store.rooms.createRoomTask(roomId, namespace, task)
    void this.automationService.sendTaskProtocolMessage(roomId, namespace, {
      text: `New task created: "${created.title}".${created.assigneeRoleKey ? ` Assigned to @${created.assigneeRoleKey}.` : ''}`,
      eventType: 'task_assigned',
      task: created,
      targetRoleKey: created.assigneeRoleKey ?? undefined,
      mentions: created.assigneeRoleKey ? [created.assigneeRoleKey] : undefined,
    })
    const targetSessionId = created.assigneeSessionId ?? (created.assigneeRoleKey ? this.findAssignedSessionIdForRole(roomId, created.assigneeRoleKey, namespace) : null)
    if (targetSessionId) {
      const roomName = this.toProtocolRoom(roomId, namespace)?.metadata.name ?? roomId
      void this.sendRoomAwareDirectMessage(targetSessionId, roomId, namespace, formatTaskBriefing(roomName, created))
    }
    return this.emitRoomUpdated(roomId, namespace)
  }

  updateTask(roomId: string, taskId: string, namespace: string, patch: {
    title?: string
    description?: string | null
    status?: 'pending' | 'in_progress' | 'blocked' | 'completed'
    assigneeRoleKey?: string | null
    assigneeSessionId?: string | null
  }): Room {
    const updated = this.store.rooms.updateRoomTask(roomId, taskId, namespace, patch)
    if (!updated) {
      throw new Error('Task not found')
    }
    return this.emitRoomUpdated(roomId, namespace)
  }

  async assignTask(
    roomId: string,
    taskId: string,
    namespace: string,
    payload: {
      assigneeRoleKey: string | null
      note?: string
      actorRoleKey?: string
    }
  ): Promise<Room> {
    const existing = this.store.rooms.getRoomTask(roomId, taskId, namespace)
    if (!existing) {
      throw new Error('Task not found')
    }

    const nextAssigneeSessionId = payload.assigneeRoleKey
      ? this.findAssignedSessionIdForRole(roomId, payload.assigneeRoleKey, namespace)
      : null

    const nextStatus = existing.status === 'completed' ? 'pending' : existing.status
    const updated = this.store.rooms.updateRoomTask(roomId, taskId, namespace, {
      assigneeRoleKey: payload.assigneeRoleKey,
      assigneeSessionId: nextAssigneeSessionId,
      status: nextStatus,
    })
    if (!updated) {
      throw new Error('Task not found')
    }

    await this.automationService.sendTaskProtocolMessage(roomId, namespace, {
      text: payload.assigneeRoleKey
        ? `Task "${updated.title}" assigned to @${payload.assigneeRoleKey}.${payload.note ? `\n\nNote: ${payload.note}` : ''}`
        : `Task "${updated.title}" was moved back to the unassigned queue.${payload.note ? `\n\nNote: ${payload.note}` : ''}`,
      eventType: 'task_assigned',
      task: updated,
      actorRoleKey: payload.actorRoleKey,
      targetRoleKey: payload.assigneeRoleKey ?? undefined,
      note: payload.note,
      mentions: payload.assigneeRoleKey ? [payload.assigneeRoleKey] : undefined,
    })

    if (updated.assigneeSessionId) {
      await this.automationService.notifyTaskAssignee(roomId, namespace, updated, 'task_assigned', payload.note)
    }

    return this.emitRoomUpdated(roomId, namespace)
  }

  async claimTask(
    roomId: string,
    taskId: string,
    namespace: string,
    payload: {
      roleKey?: string
      note?: string
    }
  ): Promise<Room> {
    const existing = this.store.rooms.getRoomTask(roomId, taskId, namespace)
    if (!existing) {
      throw new Error('Task not found')
    }

    const nextRoleKey = payload.roleKey ?? existing.assigneeRoleKey ?? undefined
    const nextAssigneeSessionId = nextRoleKey
      ? this.findAssignedSessionIdForRole(roomId, nextRoleKey, namespace)
      : existing.assigneeSessionId

    const updated = this.store.rooms.updateRoomTask(roomId, taskId, namespace, {
      assigneeRoleKey: nextRoleKey ?? null,
      assigneeSessionId: nextAssigneeSessionId ?? null,
      status: 'in_progress',
    })
    if (!updated) {
      throw new Error('Task not found')
    }

    await this.automationService.sendTaskProtocolMessage(roomId, namespace, {
      text: `${nextRoleKey ? `@${nextRoleKey}` : 'An assignee'} claimed task "${updated.title}" and started working on it.${payload.note ? `\n\nUpdate: ${payload.note}` : ''}`,
      eventType: 'task_claimed',
      task: updated,
      actorRoleKey: nextRoleKey,
      targetRoleKey: nextRoleKey,
      note: payload.note,
      mentions: nextRoleKey ? [nextRoleKey] : undefined,
    })

    return this.emitRoomUpdated(roomId, namespace)
  }

  async blockTask(
    roomId: string,
    taskId: string,
    namespace: string,
    payload: {
      roleKey?: string
      reason: string
    }
  ): Promise<Room> {
    const existing = this.store.rooms.getRoomTask(roomId, taskId, namespace)
    if (!existing) {
      throw new Error('Task not found')
    }

    const updated = this.store.rooms.updateRoomTask(roomId, taskId, namespace, {
      status: 'blocked',
    })
    if (!updated) {
      throw new Error('Task not found')
    }

    const coordinatorKey = this.findCoordinatorRoleKey(roomId, namespace)
    await this.automationService.sendTaskProtocolMessage(roomId, namespace, {
      text: `${payload.roleKey ? `@${payload.roleKey}` : 'The assignee'} marked task "${updated.title}" as blocked.\n\nBlocker: ${payload.reason}`,
      eventType: 'task_blocked',
      task: updated,
      actorRoleKey: payload.roleKey,
      targetRoleKey: coordinatorKey ?? undefined,
      note: payload.reason,
      mentions: uniqueStrings([payload.roleKey, coordinatorKey]),
    })

    const coordinatorSessionId = this.findCoordinatorSessionId(roomId, namespace)
    if (coordinatorSessionId) {
      const room = this.toProtocolRoom(roomId, namespace)
      await this.sendRoomAwareDirectMessage(coordinatorSessionId, roomId, namespace, [
        `[Room Blocked: ${room?.metadata.name ?? roomId}]`,
        `Task: ${updated.title}`,
        payload.roleKey ? `Reported by: @${payload.roleKey}` : null,
        `Blocker: ${payload.reason}`,
      ].filter(Boolean).join('\n'))
    }

    if (this.isAutoDispatchEnabled(roomId, namespace)) {
      await this.automationService.sendBlockedTaskPlannerNudge(roomId, namespace, updated, payload)
    }

    return this.emitRoomUpdated(roomId, namespace)
  }

  async handoffTask(
    roomId: string,
    taskId: string,
    namespace: string,
    payload: {
      fromRoleKey?: string
      toRoleKey: string
      note?: string
    }
  ): Promise<Room> {
    const existing = this.store.rooms.getRoomTask(roomId, taskId, namespace)
    if (!existing) {
      throw new Error('Task not found')
    }

    const nextAssigneeSessionId = this.findAssignedSessionIdForRole(roomId, payload.toRoleKey, namespace)
    const updated = this.store.rooms.updateRoomTask(roomId, taskId, namespace, {
      assigneeRoleKey: payload.toRoleKey,
      assigneeSessionId: nextAssigneeSessionId,
      status: 'pending',
    })
    if (!updated) {
      throw new Error('Task not found')
    }

    await this.automationService.sendTaskProtocolMessage(roomId, namespace, {
      text: `Task "${updated.title}" was handed off${payload.fromRoleKey ? ` from @${payload.fromRoleKey}` : ''} to @${payload.toRoleKey}.${payload.note ? `\n\nHandoff note: ${payload.note}` : ''}`,
      eventType: 'task_handoff',
      task: updated,
      actorRoleKey: payload.fromRoleKey,
      targetRoleKey: payload.toRoleKey,
      note: payload.note,
      mentions: uniqueStrings([payload.fromRoleKey, payload.toRoleKey]),
    })

    if (updated.assigneeSessionId) {
      await this.automationService.notifyTaskAssignee(roomId, namespace, updated, 'task_handoff', payload.note, payload.fromRoleKey)
    }

    return this.emitRoomUpdated(roomId, namespace)
  }

  async completeTask(
    roomId: string,
    taskId: string,
    namespace: string,
    payload: {
      roleKey?: string
      summary?: string
    }
  ): Promise<Room> {
    const existing = this.store.rooms.getRoomTask(roomId, taskId, namespace)
    if (!existing) {
      throw new Error('Task not found')
    }

    const updated = this.store.rooms.updateRoomTask(roomId, taskId, namespace, {
      status: 'completed',
    })
    if (!updated) {
      throw new Error('Task not found')
    }

    const coordinatorKey = this.findCoordinatorRoleKey(roomId, namespace)
    await this.automationService.sendTaskProtocolMessage(roomId, namespace, {
      text: `${payload.roleKey ? `@${payload.roleKey}` : 'The assignee'} completed task "${updated.title}".${payload.summary ? `\n\nSummary: ${payload.summary}` : ''}`,
      eventType: 'task_completed',
      task: updated,
      actorRoleKey: payload.roleKey,
      targetRoleKey: coordinatorKey ?? undefined,
      note: payload.summary,
      mentions: uniqueStrings([payload.roleKey, coordinatorKey]),
    })

    const coordinatorSessionId = this.findCoordinatorSessionId(roomId, namespace)
    if (coordinatorSessionId) {
      const room = this.toProtocolRoom(roomId, namespace)
      await this.sendRoomAwareDirectMessage(coordinatorSessionId, roomId, namespace, [
        `[Room Completed: ${room?.metadata.name ?? roomId}]`,
        `Task: ${updated.title}`,
        payload.roleKey ? `Completed by: @${payload.roleKey}` : null,
        payload.summary ? `Summary: ${payload.summary}` : null,
      ].filter(Boolean).join('\n'))
    }

    if (this.isAutoDispatchEnabled(roomId, namespace)) {
      await this.automationService.sendCompletionPlannerNudge(roomId, namespace, updated, payload)
    }

    return this.emitRoomUpdated(roomId, namespace)
  }

  async sendRoomMessageFromSession(
    sessionId: string,
    namespace: string,
    payload: { text: string }
  ): Promise<RoomMessage> {
    const assignment = this.findSessionRoomAssignment(sessionId, namespace)
    if (!assignment) {
      throw new Error('This session is not assigned to any room role')
    }
    return await this.sendRoomMessage(assignment.room.id, namespace, {
      senderType: 'session',
      senderId: sessionId,
      roleKey: assignment.role.key,
      content: {
        type: 'text',
        text: payload.text,
      },
      forwardToAgent: true,
    })
  }

  async createTaskFromSession(
    sessionId: string,
    namespace: string,
    payload: {
      title: string
      description?: string
      assigneeRoleKey?: string
    }
  ): Promise<Room> {
    const assignment = this.requireCoordinatorAssignment(sessionId, namespace)
    return this.createTask(assignment.room.id, namespace, {
      title: payload.title,
      description: payload.description,
      assigneeRoleKey: payload.assigneeRoleKey,
    })
  }

  async assignTaskFromSession(
    sessionId: string,
    namespace: string,
    taskId: string,
    payload: {
      assigneeRoleKey: string | null
      note?: string
    }
  ): Promise<Room> {
    const assignment = this.requireCoordinatorAssignment(sessionId, namespace)
    this.requireTaskInRoom(assignment.room, taskId)
    return await this.assignTask(assignment.room.id, taskId, namespace, {
      assigneeRoleKey: payload.assigneeRoleKey,
      note: payload.note,
      actorRoleKey: assignment.role.key,
    })
  }

  async claimTaskFromSession(
    sessionId: string,
    namespace: string,
    taskId: string,
    payload: {
      note?: string
    }
  ): Promise<Room> {
    const assignment = this.requireSessionRoomAssignment(sessionId, namespace)
    const task = this.requireTaskInRoom(assignment.room, taskId)
    const isCoordinator = this.isCoordinatorRole(assignment.room, assignment.role.key)
    if (task.assigneeRoleKey && task.assigneeRoleKey !== assignment.role.key && !isCoordinator) {
      throw new Error(`Task is assigned to @${task.assigneeRoleKey}, not @${assignment.role.key}`)
    }
    return await this.claimTask(assignment.room.id, taskId, namespace, {
      roleKey: assignment.role.key,
      note: payload.note,
    })
  }

  async blockTaskFromSession(
    sessionId: string,
    namespace: string,
    taskId: string,
    payload: {
      reason: string
    }
  ): Promise<Room> {
    const assignment = this.requireSessionRoomAssignment(sessionId, namespace)
    const task = this.requireTaskInRoom(assignment.room, taskId)
    const isCoordinator = this.isCoordinatorRole(assignment.room, assignment.role.key)
    if (task.assigneeRoleKey && task.assigneeRoleKey !== assignment.role.key && !isCoordinator) {
      throw new Error(`Task is assigned to @${task.assigneeRoleKey}, not @${assignment.role.key}`)
    }
    return await this.blockTask(assignment.room.id, taskId, namespace, {
      roleKey: assignment.role.key,
      reason: payload.reason,
    })
  }

  async handoffTaskFromSession(
    sessionId: string,
    namespace: string,
    taskId: string,
    payload: {
      toRoleKey: string
      note?: string
    }
  ): Promise<Room> {
    const assignment = this.requireSessionRoomAssignment(sessionId, namespace)
    const task = this.requireTaskInRoom(assignment.room, taskId)
    const isCoordinator = this.isCoordinatorRole(assignment.room, assignment.role.key)
    if (task.assigneeRoleKey && task.assigneeRoleKey !== assignment.role.key && !isCoordinator) {
      throw new Error(`Task is assigned to @${task.assigneeRoleKey}, not @${assignment.role.key}`)
    }
    return await this.handoffTask(assignment.room.id, taskId, namespace, {
      fromRoleKey: assignment.role.key,
      toRoleKey: payload.toRoleKey,
      note: payload.note,
    })
  }

  async completeTaskFromSession(
    sessionId: string,
    namespace: string,
    taskId: string,
    payload: {
      summary?: string
    }
  ): Promise<Room> {
    const assignment = this.requireSessionRoomAssignment(sessionId, namespace)
    const task = this.requireTaskInRoom(assignment.room, taskId)
    const isCoordinator = this.isCoordinatorRole(assignment.room, assignment.role.key)
    if (task.assigneeRoleKey && task.assigneeRoleKey !== assignment.role.key && !isCoordinator) {
      throw new Error(`Task is assigned to @${task.assigneeRoleKey}, not @${assignment.role.key}`)
    }
    return await this.completeTask(assignment.room.id, taskId, namespace, {
      roleKey: assignment.role.key,
      summary: payload.summary,
    })
  }

  getRoomMessagesPage(roomId: string, namespace: string, options: { limit: number; beforeSeq: number | null }) {
    const messages = this.store.rooms.getRoomMessages(roomId, namespace, options.limit, options.beforeSeq ?? undefined)
      .map((message) => this.toProtocolRoomMessage(message))

    let oldestSeq: number | null = null
    for (const message of messages) {
      if (typeof message.seq !== 'number') continue
      if (oldestSeq === null || message.seq < oldestSeq) {
        oldestSeq = message.seq
      }
    }

    const nextBeforeSeq = oldestSeq
    const hasMore = nextBeforeSeq !== null
      && this.store.rooms.getRoomMessages(roomId, namespace, 1, nextBeforeSeq).length > 0

    return {
      messages,
      page: {
        limit: options.limit,
        beforeSeq: options.beforeSeq,
        nextBeforeSeq,
        hasMore,
      }
    }
  }

  async sendRoomMessage(roomId: string, namespace: string, payload: SendRoomMessageInput): Promise<RoomMessage> {
    const existingRoom = this.toProtocolRoom(roomId, namespace)
    if (!existingRoom) {
      throw new Error('Room not found')
    }
    const routing = payload.content.type === 'text'
      ? this.resolveRoomRouting(existingRoom, roomId, namespace, payload.content)
      : {
          deliveryMode: payload.content.deliveryMode ?? 'broadcast',
          targetRoleKey: payload.content.targetRoleKey,
          targetSessionId: payload.content.targetSessionId,
          mentions: payload.content.mentions ?? [],
          mentionAll: payload.content.mentionAll ?? false,
          targetRoleKeys: payload.content.targetRoleKey ? [payload.content.targetRoleKey] : [],
          targetSessionIds: payload.content.targetSessionId ? [payload.content.targetSessionId] : [],
        } satisfies ResolvedRoomRouting

    const stored = this.store.rooms.addRoomMessage(roomId, namespace, {
      ...payload,
      content: {
        ...payload.content,
        targetRoleKey: routing.targetRoleKey,
        targetSessionId: routing.targetSessionId,
        mentions: routing.mentions,
        mentionAll: routing.mentionAll,
        deliveryMode: routing.deliveryMode,
      }
    })
    const message = this.toProtocolRoomMessage(stored)
    const room = this.toProtocolRoom(roomId, namespace) ?? existingRoom
    this.publisher.emit({ type: 'room-message-received', roomId, message, namespace })
    this.publisher.emit({ type: 'room-updated', roomId, data: room, namespace })

    if (payload.forwardToAgent !== false && payload.content.type === 'text') {
      const forwardedTargetSessionIds = routing.targetSessionIds.filter((targetSessionId) =>
        !(payload.senderType === 'session' && payload.senderId === targetSessionId)
      )
      for (const targetSessionId of forwardedTargetSessionIds) {
        const targetRole = this.findRoleByAssignedSession(room, targetSessionId)
        await this.messageService.sendMessage(
          targetSessionId,
          {
            text: formatForwardedRoomMessage(
              room,
              payload.content.text,
              routing,
              describeRoomSender(payload),
              targetRole?.key
            ),
            meta: this.automationService.buildRoomMessageMeta(
              room,
              targetRole,
              targetRole ? this.isCoordinatorRole(room, targetRole.key) : false
            ),
          }
        )
      }
    }

    return message
  }

  async sendRoleBriefing(roomId: string, namespace: string, roleId: string): Promise<void> {
    const room = this.toProtocolRoom(roomId, namespace)
    const role = this.store.rooms.getRoomRoleByNamespace(roleId, namespace)
    if (!room || !role || !role.assignedSessionId) {
      return
    }
    await this.sendRoomAwareDirectMessage(role.assignedSessionId, roomId, namespace, formatRoleBriefing(room, role))
    await this.sendRoomMessage(roomId, namespace, {
      senderType: 'system',
      senderId: 'system',
      roleKey: role.key,
      content: {
        type: 'system',
        text: `Role ${role.label} is now assigned to session ${role.assignedSessionId}`,
        mentions: [role.key],
        deliveryMode: 'explicit_role',
      },
      forwardToAgent: false,
    })
    if (this.isCoordinatorRole(room, role.key)) {
      await this.automationService.maybeSendPlannerBootstrap(room, namespace, role)
    }
  }

  private emitRoomUpdated(roomId: string, namespace: string): Room {
    const room = this.toProtocolRoom(roomId, namespace)
    if (!room) {
      throw new Error('Room not found')
    }
    this.publisher.emit({ type: 'room-updated', roomId, data: room, namespace })
    return room
  }

  private async detachRoomLinkedSessionIfNeeded(
    role: Pick<RoomRole, 'roomId' | 'assignmentMode' | 'assignedSessionId'>,
    namespace: string
  ): Promise<void> {
    const sessionId = role.assignedSessionId
    if (!sessionId) {
      return
    }

    const session = this.resolveSession(sessionId, namespace)
    const isRoomLinked = role.assignmentMode === 'spawn_new'
      || session?.metadata?.roomSpawned === true
      || session?.metadata?.roomId === role.roomId

    if (!isRoomLinked) {
      return
    }

    await this.clearSessionRoomLink(sessionId, namespace, role.roomId)
  }

  private toProtocolRoom(roomId: string, namespace: string): Room | null {
    const room = this.store.rooms.getRoomByNamespace(roomId, namespace)
    if (!room) {
      return null
    }
    const roles = this.store.rooms.getRoomRoles(roomId, namespace).map((role): RoomRole => ({
      id: role.id,
      roomId: role.roomId,
      key: role.key,
      label: role.label,
      description: role.description ?? undefined,
      required: role.required,
      preferredFlavor: (role.preferredFlavor as RoomRole['preferredFlavor']) ?? undefined,
      preferredModel: role.preferredModel ?? undefined,
      permissionMode: role.permissionMode ?? undefined,
      assignmentMode: role.assignmentMode,
      assignedSessionId: role.assignedSessionId ?? null,
      spawnConfig: (role.spawnConfig as RoomRole['spawnConfig']) ?? undefined,
      sortOrder: role.sortOrder,
    }))
    const tasks = this.store.rooms.getRoomTasks(roomId, namespace).map((task): RoomTask => ({
      id: task.id,
      roomId: task.roomId,
      title: task.title,
      description: task.description ?? undefined,
      status: task.status,
      assigneeRoleKey: task.assigneeRoleKey ?? undefined,
      assigneeSessionId: task.assigneeSessionId ?? null,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    }))
    const metadata = (room.metadata ?? {}) as RoomMetadata
    return {
      id: room.id,
      namespace: room.namespace,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
      metadata: {
        name: metadata.name ?? 'Untitled Room',
        goal: metadata.goal,
        templateKey: metadata.templateKey,
        status: metadata.status ?? 'active',
        autoDispatch: metadata.autoDispatch,
        coordinatorRoleKey: metadata.coordinatorRoleKey,
        roleTemplates: Array.isArray(metadata.roleTemplates) ? metadata.roleTemplates : undefined,
      },
      state: {
        roles,
        tasks,
        summary: this.buildRoomSummary(roles, tasks),
      }
    }
  }

  private toProtocolRoomMessage(message: ReturnType<Store['rooms']['getRoomMessages']>[number]): RoomMessage {
    const content = (message.content ?? {}) as RoomMessage['content']
    return {
      id: message.id,
      roomId: message.roomId,
      seq: message.seq,
      senderType: message.senderType,
      senderId: message.senderId,
      roleKey: message.roleKey ?? undefined,
      content: {
        type: content.type === 'system' ? 'system' : 'text',
        text: typeof content.text === 'string' ? content.text : '',
        targetRoleKey: typeof content.targetRoleKey === 'string' ? content.targetRoleKey : undefined,
        targetSessionId: typeof content.targetSessionId === 'string' ? content.targetSessionId : undefined,
        mentions: Array.isArray(content.mentions)
          ? content.mentions.filter((item): item is string => typeof item === 'string')
          : undefined,
        mentionAll: typeof content.mentionAll === 'boolean' ? content.mentionAll : undefined,
        deliveryMode: typeof content.deliveryMode === 'string'
          ? (content.deliveryMode as RoomDeliveryMode)
          : undefined,
        meta: content.meta && typeof content.meta === 'object' ? content.meta : undefined,
      },
      createdAt: message.createdAt,
    }
  }

  private buildRoomSummary(roles: RoomRole[], tasks: RoomTask[]): string {
    const assigned = roles.filter((role) => role.assignedSessionId).length
    const completed = tasks.filter((task) => task.status === 'completed').length
    return `${assigned}/${roles.length} roles assigned · ${completed}/${tasks.length} tasks completed`
  }

  private findCoordinatorSessionId(roomId: string, namespace: string): string | null {
    const room = this.toProtocolRoom(roomId, namespace)
    if (!room) {
      return null
    }
    const coordinatorKey = room.metadata.coordinatorRoleKey ?? (room.state.roles.find((role) => role.key === 'coordinator')?.key ?? room.state.roles[0]?.key)
    if (!coordinatorKey) {
      return null
    }
    return this.findAssignedSessionIdForRole(roomId, coordinatorKey, namespace)
  }

  private findCoordinatorRoleKey(roomId: string, namespace: string): string | null {
    const room = this.toProtocolRoom(roomId, namespace)
    if (!room) {
      return null
    }
    return room.metadata.coordinatorRoleKey
      ?? room.state.roles.find((role) => role.key === 'coordinator')?.key
      ?? room.state.roles[0]?.key
      ?? null
  }

  private findSessionRoomAssignment(sessionId: string, namespace: string): SessionRoomAssignment | null {
    const rooms = this.getRoomsByNamespace(namespace)
    for (const room of rooms) {
      const role = room.state.roles.find((item) => item.assignedSessionId === sessionId)
      if (role) {
        return { room, role }
      }
    }
    return null
  }

  private requireSessionRoomAssignment(sessionId: string, namespace: string): SessionRoomAssignment {
    const assignment = this.findSessionRoomAssignment(sessionId, namespace)
    if (!assignment) {
      throw new Error('This session is not assigned to any room role')
    }
    return assignment
  }

  private requireCoordinatorAssignment(sessionId: string, namespace: string): SessionRoomAssignment {
    const assignment = this.requireSessionRoomAssignment(sessionId, namespace)
    if (!this.isCoordinatorRole(assignment.room, assignment.role.key)) {
      throw new Error('Only the room coordinator/planner can perform this action')
    }
    return assignment
  }

  private isCoordinatorRole(room: Room, roleKey: string): boolean {
    return roleKey === (
      room.metadata.coordinatorRoleKey
      ?? room.state.roles.find((role) => role.key === 'coordinator')?.key
      ?? room.state.roles[0]?.key
    )
  }

  private requireTaskInRoom(room: Room, taskId: string): RoomTask {
    const task = room.state.tasks.find((item) => item.id === taskId)
    if (!task) {
      throw new Error('Task does not belong to the current room')
    }
    return task
  }

  private findAssignedSessionIdForRole(roomId: string, roleKey: string, namespace: string): string | null {
    const role = this.store.rooms.findRoomRoleByKey(roomId, roleKey, namespace)
    return role?.assignedSessionId ?? null
  }

  private findRoleByAssignedSession(room: Room, sessionId: string): RoomRole | undefined {
    return room.state.roles.find((role) => role.assignedSessionId === sessionId)
  }

  private findRoleKeyByAssignedSession(room: Room, sessionId: string): string | undefined {
    return this.findRoleByAssignedSession(room, sessionId)?.key
  }

  private isAutoDispatchEnabled(roomId: string, namespace: string): boolean {
    const room = this.toProtocolRoom(roomId, namespace)
    return room?.metadata.autoDispatch === true
  }

  private hasRecentProtocolEvent(
    roomId: string,
    namespace: string,
    eventType: string,
    options?: { taskId?: string; limit?: number }
  ): boolean {
    const messages = this.store.rooms.getRoomMessages(roomId, namespace, Math.max(10, Math.min(200, options?.limit ?? 80)))
    return messages.some((message) => {
      const content = (message.content ?? {}) as { meta?: Record<string, unknown> }
      if (!content.meta || typeof content.meta !== 'object') {
        return false
      }
      if (content.meta.eventType !== eventType) {
        return false
      }
      if (options?.taskId && content.meta.taskId !== options.taskId) {
        return false
      }
      return true
    })
  }

  private resolveRoomRouting(
    room: Room,
    roomId: string,
    namespace: string,
    content: SendRoomMessageInput['content']
  ): ResolvedRoomRouting {
    const { mentionAll, mentionedRoleKeys } = resolveRoomMentionTargets(content.text, room.state.roles)

    if (content.targetSessionId) {
      return {
        deliveryMode: 'explicit_session',
        targetRoleKey: content.targetRoleKey,
        targetSessionId: content.targetSessionId,
        mentions: uniqueStrings([...(content.mentions ?? []), ...mentionedRoleKeys]),
        mentionAll: false,
        targetRoleKeys: uniqueStrings([content.targetRoleKey]),
        targetSessionIds: [content.targetSessionId],
      }
    }

    if (content.targetRoleKey) {
      return {
        deliveryMode: 'explicit_role',
        targetRoleKey: content.targetRoleKey,
        mentions: uniqueStrings([...(content.mentions ?? []), ...mentionedRoleKeys]),
        mentionAll: false,
        targetRoleKeys: [content.targetRoleKey],
        targetSessionIds: uniqueStrings([this.findAssignedSessionIdForRole(roomId, content.targetRoleKey, namespace)]),
      }
    }

    if (mentionAll) {
      const roleKeys = room.state.roles.map((role) => role.key)
      return {
        deliveryMode: 'broadcast',
        mentions: mentionedRoleKeys,
        mentionAll: true,
        targetRoleKeys: roleKeys,
        targetSessionIds: uniqueStrings(roleKeys.map((roleKey) => this.findAssignedSessionIdForRole(roomId, roleKey, namespace))),
      }
    }

    if (mentionedRoleKeys.length > 0) {
      return {
        deliveryMode: 'mention',
        targetRoleKey: mentionedRoleKeys[0],
        mentions: mentionedRoleKeys,
        mentionAll: false,
        targetRoleKeys: mentionedRoleKeys,
        targetSessionIds: uniqueStrings(mentionedRoleKeys.map((roleKey) => this.findAssignedSessionIdForRole(roomId, roleKey, namespace))),
      }
    }

    const coordinatorKey = getRoomCoordinatorRoleKey(room)

    return {
      deliveryMode: 'coordinator',
      targetRoleKey: coordinatorKey,
      mentions: [],
      mentionAll: false,
      targetRoleKeys: coordinatorKey ? [coordinatorKey] : [],
      targetSessionIds: uniqueStrings([
        coordinatorKey ? this.findAssignedSessionIdForRole(roomId, coordinatorKey, namespace) : null
      ]),
    }
  }

  private async sendRoomAwareDirectMessage(
    sessionId: string,
    roomId: string,
    namespace: string,
    text: string,
    extraMeta?: Record<string, unknown>
  ): Promise<void> {
    const room = this.toProtocolRoom(roomId, namespace)
    const role = room ? this.findRoleByAssignedSession(room, sessionId) : undefined
    const baseMeta = room
      ? this.automationService.buildRoomMessageMeta(room, role, role ? this.isCoordinatorRole(room, role.key) : false)
      : undefined
    await this.messageService.sendMessage(sessionId, {
      text,
      meta: {
        ...(baseMeta ?? {}),
        ...(extraMeta ?? {}),
      },
    })
  }
}
