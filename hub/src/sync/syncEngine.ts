/**
 * Sync Engine for AgentChat (Direct Connect)
 *
 * In the direct-connect architecture:
 * - agentchat-hub is the hub (Socket.IO + REST)
 * - agentchat CLI connects directly to the hub (no relay)
 * - No E2E encryption; data is stored as JSON in SQLite
 */

import type { DecryptedMessage, ModelMode, PermissionMode, Room, RoomMessage, RoomMetadata, Session, SyncEvent } from '@agentchat/protocol/types'
import type { Server } from 'socket.io'
import type { Store } from '../store'
import type { RpcRegistry } from '../socket/rpcRegistry'
import type { SSEManager } from '../sse/sseManager'
import { EventPublisher, type SyncEventListener } from './eventPublisher'
import { MachineAdminService } from './machineAdminService'
import { MachineCache, type Machine } from './machineCache'
import { MessageService } from './messageService'
import { RoomService, type CreateRoomInput } from './roomService'
import {
    RpcGateway,
    type RpcCommandResponse,
    type RpcDeleteUploadResponse,
    type RpcListDirectoryResponse,
    type RpcListMachineSessionsResponse,
    type RpcPathMutationResponse,
    type RpcProviderHealthResponse,
    type RpcRunnerEnvResponse,
    type RpcPathExistsResponse,
    type RpcReadFileResponse,
    type RpcWriteFileResponse,
    type RpcUploadFileResponse
} from './rpcGateway'
import { SessionCache } from './sessionCache'
import { SessionWorkspaceService } from './sessionWorkspaceService'

export type { Session, SyncEvent } from '@agentchat/protocol/types'
export type { Room, RoomMessage } from '@agentchat/protocol/types'
export type { Machine } from './machineCache'
export type { SyncEventListener } from './eventPublisher'
export type {
    RpcCommandResponse,
    RpcDeleteUploadResponse,
    RpcListDirectoryResponse,
    RpcListMachineSessionsResponse,
    RpcPathMutationResponse,
    RpcProviderHealthResponse,
    RpcPathExistsResponse,
    RpcReadFileResponse,
    RpcWriteFileResponse,
    RpcUploadFileResponse
} from './rpcGateway'

export type ResumeSessionResult =
    | { type: 'success'; sessionId: string }
    | { type: 'error'; message: string; code: 'session_not_found' | 'access_denied' | 'no_machine_online' | 'resume_unavailable' | 'resume_failed' }

export class SyncEngine {
    private readonly store: Store
    private readonly eventPublisher: EventPublisher
    private readonly sessionCache: SessionCache
    private readonly machineCache: MachineCache
    private readonly messageService: MessageService
    private readonly rpcGateway: RpcGateway
    private readonly roomService: RoomService
    private readonly machineAdminService: MachineAdminService
    private readonly sessionWorkspaceService: SessionWorkspaceService
    private inactivityTimer: NodeJS.Timeout | null = null

    constructor(
        store: Store,
        io: Server,
        rpcRegistry: RpcRegistry,
        sseManager: SSEManager
    ) {
        this.store = store
        this.eventPublisher = new EventPublisher(sseManager, (event) => this.resolveNamespace(event))
        this.sessionCache = new SessionCache(store, this.eventPublisher)
        this.machineCache = new MachineCache(store, this.eventPublisher)
        this.messageService = new MessageService(store, io, this.eventPublisher)
        this.rpcGateway = new RpcGateway(io, rpcRegistry)
        this.roomService = new RoomService(
            store,
            this.eventPublisher,
            this.messageService,
            (sessionId, namespace) => this.getSessionByNamespace(sessionId, namespace),
            (sessionId, namespace, roomId) => this.clearSessionRoomLink(sessionId, namespace, roomId)
        )
        this.machineAdminService = new MachineAdminService({
            rpcGateway: this.rpcGateway,
            getMachineByNamespace: (machineId, namespace) => this.getMachineByNamespace(machineId, namespace),
            getSessionsByNamespace: (namespace) => this.getSessionsByNamespace(namespace),
            getSessionByNamespace: (sessionId, namespace) => this.getSessionByNamespace(sessionId, namespace),
            endSession: (sessionId) => this.handleSessionEnd({ sid: sessionId, time: Date.now() }),
            deleteSession: async (sessionId, namespace) => {
                await this.sessionCache.deleteSession(sessionId, { namespace, allowActive: true })
            },
        })
        this.sessionWorkspaceService = new SessionWorkspaceService(this.rpcGateway)
        this.reloadAll()
        void this.backfillRoomSpawnedSessionMetadata()
        this.inactivityTimer = setInterval(() => this.expireInactive(), 5_000)
    }

    stop(): void {
        if (this.inactivityTimer) {
            clearInterval(this.inactivityTimer)
            this.inactivityTimer = null
        }
    }

    subscribe(listener: SyncEventListener): () => void {
        return this.eventPublisher.subscribe(listener)
    }

    private resolveNamespace(event: SyncEvent): string | undefined {
        if (event.namespace) {
            return event.namespace
        }
        if ('sessionId' in event) {
            return this.getSession(event.sessionId)?.namespace
        }
        if ('machineId' in event) {
            return this.machineCache.getMachine(event.machineId)?.namespace
        }
        return undefined
    }

    getSessions(): Session[] {
        return this.sessionCache.getSessions()
    }

    getSessionsByNamespace(namespace: string): Session[] {
        return this.sessionCache.getSessionsByNamespace(namespace)
    }

    getSession(sessionId: string): Session | undefined {
        return this.sessionCache.getSession(sessionId) ?? this.sessionCache.refreshSession(sessionId) ?? undefined
    }

    getSessionByNamespace(sessionId: string, namespace: string): Session | undefined {
        const session = this.sessionCache.getSessionByNamespace(sessionId, namespace)
            ?? this.sessionCache.refreshSession(sessionId)
        if (!session || session.namespace !== namespace) {
            return undefined
        }
        return session
    }

    resolveSessionAccess(
        sessionId: string,
        namespace: string
    ): { ok: true; sessionId: string; session: Session } | { ok: false; reason: 'not-found' | 'access-denied' } {
        return this.sessionCache.resolveSessionAccess(sessionId, namespace)
    }

    getActiveSessions(): Session[] {
        return this.sessionCache.getActiveSessions()
    }

    getMachines(): Machine[] {
        return this.machineCache.getMachines()
    }

    getMachinesByNamespace(namespace: string): Machine[] {
        return this.machineCache.getMachinesByNamespace(namespace)
    }

    getMachine(machineId: string): Machine | undefined {
        return this.machineCache.getMachine(machineId)
    }

    getMachineByNamespace(machineId: string, namespace: string): Machine | undefined {
        return this.machineCache.getMachineByNamespace(machineId, namespace)
    }

    getOnlineMachines(): Machine[] {
        return this.machineCache.getOnlineMachines()
    }

    getOnlineMachinesByNamespace(namespace: string): Machine[] {
        return this.machineCache.getOnlineMachinesByNamespace(namespace)
    }

    getMessagesPage(sessionId: string, options: { limit: number; beforeSeq: number | null }): {
        messages: DecryptedMessage[]
        page: {
            limit: number
            beforeSeq: number | null
            nextBeforeSeq: number | null
            hasMore: boolean
        }
    } {
        return this.messageService.getMessagesPage(sessionId, options)
    }

    getRoomsByNamespace(namespace: string): Room[] {
        return this.roomService.getRoomsByNamespace(namespace)
    }

    getRoomByNamespace(roomId: string, namespace: string): Room | undefined {
        return this.roomService.getRoomByNamespace(roomId, namespace)
    }

    getSessionRoomContext(sessionId: string, namespace: string, options?: { recentLimit?: number }) {
        return this.roomService.getSessionRoomContext(sessionId, namespace, options)
    }

    listSessionRoomTasks(
        sessionId: string,
        namespace: string,
        options?: {
            status?: 'pending' | 'in_progress' | 'blocked' | 'completed'
            assigned?: 'mine' | 'all' | 'unassigned'
        }
    ) {
        return this.roomService.listSessionRoomTasks(sessionId, namespace, options)
    }

    getRoomMessagesPage(roomId: string, namespace: string, options: { limit: number; beforeSeq: number | null }) {
        return this.roomService.getRoomMessagesPage(roomId, namespace, options)
    }

    getMessagesAfter(sessionId: string, options: { afterSeq: number; limit: number }): DecryptedMessage[] {
        return this.messageService.getMessagesAfter(sessionId, options)
    }

    handleRealtimeEvent(event: SyncEvent): void {
        if (event.type === 'session-updated' && event.sessionId) {
            this.sessionCache.refreshSession(event.sessionId)
            return
        }

        if (event.type === 'machine-updated' && event.machineId) {
            this.machineCache.refreshMachine(event.machineId)
            return
        }

        if (event.type === 'message-received' && event.sessionId) {
            if (!this.getSession(event.sessionId)) {
                this.sessionCache.refreshSession(event.sessionId)
            }
        }

        this.eventPublisher.emit(event)
    }

    handleSessionAlive(payload: {
        sid: string
        time: number
        thinking?: boolean
        mode?: 'local' | 'remote'
        permissionMode?: PermissionMode
        modelMode?: ModelMode
    }): void {
        this.sessionCache.handleSessionAlive(payload)
    }

    handleSessionEnd(payload: { sid: string; time: number }): void {
        this.sessionCache.handleSessionEnd(payload)
    }

    handleMachineAlive(payload: { machineId: string; time: number }): void {
        this.machineCache.handleMachineAlive(payload)
    }

    private expireInactive(): void {
        this.sessionCache.expireInactive()
        this.machineCache.expireInactive()
    }

    private reloadAll(): void {
        this.sessionCache.reloadAll()
        this.machineCache.reloadAll()
    }

    private async backfillRoomSpawnedSessionMetadata(): Promise<void> {
        const rooms = this.store.rooms.getRooms()
        for (const room of rooms) {
            const roles = this.store.rooms.getRoomRoles(room.id, room.namespace)
            for (const role of roles) {
                if (!role.assignedSessionId) {
                    continue
                }
                if (role.assignmentMode !== 'spawn_new') {
                    continue
                }

                const session = this.getSessionByNamespace(role.assignedSessionId, room.namespace)
                if (!session?.metadata) {
                    continue
                }
                if (session.metadata.roomSpawned === true && session.metadata.roomId === room.id) {
                    continue
                }

                try {
                    await this.markSessionAsRoomSpawned(role.assignedSessionId, room.id, room.namespace)
                } catch {
                    // Best-effort legacy repair. Live session updates can retry later.
                }
            }
        }
    }

    getOrCreateSession(tag: string, metadata: unknown, agentState: unknown, namespace: string): Session {
        return this.sessionCache.getOrCreateSession(tag, metadata, agentState, namespace)
    }

    getOrCreateMachine(id: string, metadata: unknown, runnerState: unknown, namespace: string): Machine {
        return this.machineCache.getOrCreateMachine(id, metadata, runnerState, namespace)
    }

    async sendMessage(
        sessionId: string,
        payload: {
            text: string
            localId?: string | null
            attachments?: Array<{
                id: string
                filename: string
                mimeType: string
                size: number
                path: string
                previewUrl?: string
            }>
            sentFrom?: 'webapp' | 'feishu-bot'
            meta?: Record<string, unknown>
        }
    ): Promise<DecryptedMessage> {
        return await this.messageService.sendMessage(sessionId, payload)
    }

    createRoom(namespace: string, input: CreateRoomInput): Room {
        return this.roomService.createRoom(namespace, input)
    }

    updateRoomMetadata(roomId: string, namespace: string, metadata: RoomMetadata): Room {
        return this.roomService.updateRoomMetadata(roomId, namespace, metadata)
    }

    addRoomRole(roomId: string, namespace: string, role: NonNullable<CreateRoomInput['roles']>[number]): Room {
        return this.roomService.addRole(roomId, namespace, role)
    }

    updateRoomRole(
        roomId: string,
        roleId: string,
        namespace: string,
        patch: {
            label?: string
            description?: string | null
            required?: boolean
            preferredFlavor?: string | null
            preferredModel?: string | null
            permissionMode?: string | null
            assignmentMode?: 'existing_session' | 'spawn_new' | 'unassigned'
            assignedSessionId?: string | null
            spawnConfig?: unknown
            sortOrder?: number
        }
    ): Room {
        return this.roomService.updateRole(roomId, roleId, namespace, patch)
    }

    async assignRoomRoleToSession(roomId: string, roleId: string, sessionId: string, namespace: string): Promise<Room> {
        return await this.roomService.assignRoleToSession(roomId, roleId, sessionId, namespace)
    }

    async clearRoomRoleAssignment(roomId: string, roleId: string, namespace: string): Promise<Room> {
        return await this.roomService.clearRoleAssignment(roomId, roleId, namespace)
    }

    createRoomTask(
        roomId: string,
        namespace: string,
        task: {
            title: string
            description?: string
            status?: 'pending' | 'in_progress' | 'blocked' | 'completed'
            assigneeRoleKey?: string
            assigneeSessionId?: string | null
        }
    ): Room {
        return this.roomService.createTask(roomId, namespace, task)
    }

    updateRoomTask(
        roomId: string,
        taskId: string,
        namespace: string,
        patch: {
            title?: string
            description?: string | null
            status?: 'pending' | 'in_progress' | 'blocked' | 'completed'
            assigneeRoleKey?: string | null
            assigneeSessionId?: string | null
        }
    ): Room {
        return this.roomService.updateTask(roomId, taskId, namespace, patch)
    }

    async assignRoomTask(
        roomId: string,
        taskId: string,
        namespace: string,
        payload: {
            assigneeRoleKey: string | null
            note?: string
            actorRoleKey?: string
        }
    ): Promise<Room> {
        return await this.roomService.assignTask(roomId, taskId, namespace, payload)
    }

    async claimRoomTask(
        roomId: string,
        taskId: string,
        namespace: string,
        payload: {
            roleKey?: string
            note?: string
        }
    ): Promise<Room> {
        return await this.roomService.claimTask(roomId, taskId, namespace, payload)
    }

    async blockRoomTask(
        roomId: string,
        taskId: string,
        namespace: string,
        payload: {
            roleKey?: string
            reason: string
        }
    ): Promise<Room> {
        return await this.roomService.blockTask(roomId, taskId, namespace, payload)
    }

    async handoffRoomTask(
        roomId: string,
        taskId: string,
        namespace: string,
        payload: {
            fromRoleKey?: string
            toRoleKey: string
            note?: string
        }
    ): Promise<Room> {
        return await this.roomService.handoffTask(roomId, taskId, namespace, payload)
    }

    async completeRoomTask(
        roomId: string,
        taskId: string,
        namespace: string,
        payload: {
            roleKey?: string
            summary?: string
        }
    ): Promise<Room> {
        return await this.roomService.completeTask(roomId, taskId, namespace, payload)
    }

    async sendRoomMessageFromSession(
        sessionId: string,
        namespace: string,
        payload: {
            text: string
        }
    ): Promise<RoomMessage> {
        return await this.roomService.sendRoomMessageFromSession(sessionId, namespace, payload)
    }

    async createRoomTaskFromSession(
        sessionId: string,
        namespace: string,
        payload: {
            title: string
            description?: string
            assigneeRoleKey?: string
        }
    ): Promise<Room> {
        return await this.roomService.createTaskFromSession(sessionId, namespace, payload)
    }

    async assignRoomTaskFromSession(
        sessionId: string,
        namespace: string,
        taskId: string,
        payload: {
            assigneeRoleKey: string | null
            note?: string
        }
    ): Promise<Room> {
        return await this.roomService.assignTaskFromSession(sessionId, namespace, taskId, payload)
    }

    async claimRoomTaskFromSession(
        sessionId: string,
        namespace: string,
        taskId: string,
        payload: {
            note?: string
        }
    ): Promise<Room> {
        return await this.roomService.claimTaskFromSession(sessionId, namespace, taskId, payload)
    }

    async blockRoomTaskFromSession(
        sessionId: string,
        namespace: string,
        taskId: string,
        payload: {
            reason: string
        }
    ): Promise<Room> {
        return await this.roomService.blockTaskFromSession(sessionId, namespace, taskId, payload)
    }

    async handoffRoomTaskFromSession(
        sessionId: string,
        namespace: string,
        taskId: string,
        payload: {
            toRoleKey: string
            note?: string
        }
    ): Promise<Room> {
        return await this.roomService.handoffTaskFromSession(sessionId, namespace, taskId, payload)
    }

    async completeRoomTaskFromSession(
        sessionId: string,
        namespace: string,
        taskId: string,
        payload: {
            summary?: string
        }
    ): Promise<Room> {
        return await this.roomService.completeTaskFromSession(sessionId, namespace, taskId, payload)
    }

    async sendRoomMessage(
        roomId: string,
        namespace: string,
        payload: {
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
        }
    ): Promise<RoomMessage> {
        return await this.roomService.sendRoomMessage(roomId, namespace, payload)
    }

    async approvePermission(
        sessionId: string,
        requestId: string,
        mode?: PermissionMode,
        allowTools?: string[],
        decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort',
        answers?: Record<string, string[]> | Record<string, { answers: string[] }>
    ): Promise<void> {
        await this.rpcGateway.approvePermission(sessionId, requestId, mode, allowTools, decision, answers)
    }

    async denyPermission(
        sessionId: string,
        requestId: string,
        decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort'
    ): Promise<void> {
        await this.rpcGateway.denyPermission(sessionId, requestId, decision)
    }

    async abortSession(sessionId: string): Promise<void> {
        await this.rpcGateway.abortSession(sessionId)
    }

    async archiveSession(sessionId: string): Promise<void> {
        await this.rpcGateway.killSession(sessionId)
        this.handleSessionEnd({ sid: sessionId, time: Date.now() })
    }

    async switchSession(sessionId: string, to: 'remote' | 'local'): Promise<void> {
        await this.rpcGateway.switchSession(sessionId, to)
    }

    async renameSession(sessionId: string, name: string): Promise<void> {
        await this.sessionCache.renameSession(sessionId, name)
    }

    async markSessionAsRoomSpawned(sessionId: string, roomId: string, namespace: string): Promise<void> {
        await this.sessionCache.updateSessionMetadataFields(sessionId, namespace, (metadata) => ({
            ...metadata,
            roomSpawned: true,
            roomId,
        }))
    }

    async clearSessionRoomLink(sessionId: string, namespace: string, roomId: string): Promise<void> {
        const session = this.getSessionByNamespace(sessionId, namespace)
        if (!session?.metadata) {
            return
        }

        const hasMatchingRoomLink = session.metadata.roomId === roomId
            || (session.metadata.roomId === undefined && session.metadata.roomSpawned === true)
        if (!hasMatchingRoomLink) {
            return
        }

        await this.sessionCache.updateSessionMetadataFields(sessionId, namespace, (metadata) => {
            const next = { ...metadata } as Record<string, unknown>
            if (next.roomId === roomId) {
                delete next.roomId
            }
            delete next.roomSpawned
            return next as NonNullable<Session['metadata']>
        })
    }

    async deleteSession(sessionId: string, namespace: string): Promise<void> {
        const session = this.getSessionByNamespace(sessionId, namespace)
        if (!session) {
            throw new Error('Session not found')
        }

        if (session.active) {
            try {
                await this.rpcGateway.killSession(sessionId)
            } catch {
                // Continue with hard delete even if the live process is already gone or unreachable.
            }
            this.handleSessionEnd({ sid: sessionId, time: Date.now() })
        }

        await this.sessionCache.deleteSession(sessionId, { namespace, allowActive: true })
    }

    async deleteRoom(roomId: string, namespace: string): Promise<{ deletedSessionIds: string[] }> {
        const room = this.roomService.getRoomByNamespace(roomId, namespace)
        if (!room) {
            throw new Error('Room not found')
        }

        const deletedSessionIds = Array.from(
            new Set(
                room.state.roles
                    .map((role) => role.assignedSessionId)
                    .filter((sessionId): sessionId is string => typeof sessionId === 'string' && sessionId.length > 0)
            )
        )

        for (const sessionId of deletedSessionIds) {
            try {
                await this.deleteSession(sessionId, namespace)
            } catch {
                // Continue deleting the room even if a stale assigned session cannot be fully purged.
            }
        }

        this.roomService.deleteRoom(roomId, namespace)
        return { deletedSessionIds }
    }

    async applySessionConfig(
        sessionId: string,
        config: {
            permissionMode?: PermissionMode
            modelMode?: ModelMode
            model?: string
        }
    ): Promise<void> {
        const result = await this.rpcGateway.requestSessionConfig(sessionId, config)
        if (!result || typeof result !== 'object') {
            throw new Error('Invalid response from session config RPC')
        }
        const obj = result as { applied?: { permissionMode?: Session['permissionMode']; modelMode?: Session['modelMode']; model?: string } }
        const applied = obj.applied
        if (!applied || typeof applied !== 'object') {
            throw new Error('Missing applied session config')
        }

        this.sessionCache.applySessionConfig(sessionId, applied)
    }

    async spawnSession(
        machineId: string,
        directory: string,
        agent: 'claude' | 'codex' | 'cursor' | 'gemini' | 'opencode' = 'claude',
        model?: string,
        yolo?: boolean,
        sessionType?: 'simple' | 'worktree',
        worktreeName?: string,
        resumeSessionId?: string
    ): Promise<{ type: 'success'; sessionId: string } | { type: 'error'; message: string }> {
        return await this.rpcGateway.spawnSession(machineId, directory, agent, model, yolo, sessionType, worktreeName, resumeSessionId)
    }

    async resumeSession(sessionId: string, namespace: string): Promise<ResumeSessionResult> {
        const access = this.sessionCache.resolveSessionAccess(sessionId, namespace)
        if (!access.ok) {
            return {
                type: 'error',
                message: access.reason === 'access-denied' ? 'Session access denied' : 'Session not found',
                code: access.reason === 'access-denied' ? 'access_denied' : 'session_not_found'
            }
        }

        const session = access.session
        if (session.active) {
            return { type: 'success', sessionId: access.sessionId }
        }

        const metadata = session.metadata
        if (!metadata || typeof metadata.path !== 'string') {
            return { type: 'error', message: 'Session metadata missing path', code: 'resume_unavailable' }
        }

        const flavor = metadata.flavor === 'codex' || metadata.flavor === 'gemini' || metadata.flavor === 'opencode' || metadata.flavor === 'cursor'
            ? metadata.flavor
            : 'claude'
        const resumeToken = flavor === 'codex'
            ? metadata.codexSessionId
            : flavor === 'gemini'
                ? metadata.geminiSessionId
                : flavor === 'opencode'
                    ? metadata.opencodeSessionId
                    : flavor === 'cursor'
                        ? metadata.cursorSessionId
                        : metadata.claudeSessionId

        if (!resumeToken) {
            return { type: 'error', message: 'Resume session ID unavailable', code: 'resume_unavailable' }
        }

        const onlineMachines = this.machineCache.getOnlineMachinesByNamespace(namespace)
        if (onlineMachines.length === 0) {
            return { type: 'error', message: 'No machine online', code: 'no_machine_online' }
        }

        const targetMachine = (() => {
            if (metadata.machineId) {
                const exact = onlineMachines.find((machine) => machine.id === metadata.machineId)
                if (exact) return exact
            }
            if (metadata.host) {
                const hostMatch = onlineMachines.find((machine) => machine.metadata?.host === metadata.host)
                if (hostMatch) return hostMatch
            }
            return null
        })()

        if (!targetMachine) {
            return { type: 'error', message: 'No machine online', code: 'no_machine_online' }
        }

        const spawnResult = await this.rpcGateway.spawnSession(
            targetMachine.id,
            metadata.path,
            flavor,
            undefined,
            undefined,
            undefined,
            undefined,
            resumeToken
        )

        if (spawnResult.type !== 'success') {
            return { type: 'error', message: spawnResult.message, code: 'resume_failed' }
        }

        const becameActive = await this.waitForSessionActive(spawnResult.sessionId)
        if (!becameActive) {
            return { type: 'error', message: 'Session failed to become active', code: 'resume_failed' }
        }

        if (spawnResult.sessionId !== access.sessionId) {
            try {
                await this.sessionCache.mergeSessions(access.sessionId, spawnResult.sessionId, namespace)
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Failed to merge resumed session'
                return { type: 'error', message, code: 'resume_failed' }
            }
        }

        return { type: 'success', sessionId: spawnResult.sessionId }
    }

    async waitForSessionActive(sessionId: string, timeoutMs: number = 15_000): Promise<boolean> {
        const start = Date.now()
        while (Date.now() - start < timeoutMs) {
            const session = this.getSession(sessionId)
            if (session?.active) {
                return true
            }
            await new Promise((resolve) => setTimeout(resolve, 250))
        }
        return false
    }

    async checkPathsExist(machineId: string, paths: string[]): Promise<Record<string, boolean>> {
        return await this.machineAdminService.checkPathsExist(machineId, paths)
    }

    async listMachineDirectory(
        machineId: string,
        path?: string
    ): Promise<import('./rpcGateway').RpcListMachineDirectoryResponse> {
        return await this.machineAdminService.listMachineDirectory(machineId, path)
    }

    async restartRunner(machineId: string, namespace: string): Promise<{ ok: true; message: string }> {
        return await this.machineAdminService.restartRunner(machineId, namespace)
    }

    async cleanupDeadSessions(machineId: string, namespace: string): Promise<{
        deletedSessionIds: string[]
        keptSessionIds: string[]
        preservedInactiveSessionIds: string[]
        deadProcessSessionIds: string[]
        aliveProcessSessionIds: string[]
    }> {
        return await this.machineAdminService.cleanupDeadSessions(machineId, namespace)
    }

    async checkProviderHealth(machineId: string, namespace: string): Promise<RpcProviderHealthResponse> {
        return await this.machineAdminService.checkProviderHealth(machineId, namespace)
    }

    async getRunnerEnv(machineId: string, namespace: string): Promise<RpcRunnerEnvResponse> {
        return await this.machineAdminService.getRunnerEnv(machineId, namespace)
    }

    async setRunnerEnv(machineId: string, namespace: string, content: string): Promise<RpcRunnerEnvResponse> {
        return await this.machineAdminService.setRunnerEnv(machineId, namespace, content)
    }

    async getGitStatus(sessionId: string, cwd?: string): Promise<RpcCommandResponse> {
        return await this.sessionWorkspaceService.getGitStatus(sessionId, cwd)
    }

    async getGitDiffNumstat(sessionId: string, options: { cwd?: string; staged?: boolean }): Promise<RpcCommandResponse> {
        return await this.sessionWorkspaceService.getGitDiffNumstat(sessionId, options)
    }

    async getGitDiffFile(sessionId: string, options: { cwd?: string; filePath: string; staged?: boolean }): Promise<RpcCommandResponse> {
        return await this.sessionWorkspaceService.getGitDiffFile(sessionId, options)
    }

    async readSessionFile(sessionId: string, path: string): Promise<RpcReadFileResponse> {
        return await this.sessionWorkspaceService.readSessionFile(sessionId, path)
    }

    async writeSessionFile(sessionId: string, path: string, content: string, expectedHash?: string | null): Promise<RpcWriteFileResponse> {
        return await this.sessionWorkspaceService.writeSessionFile(sessionId, path, content, expectedHash)
    }

    async listDirectory(sessionId: string, path: string): Promise<RpcListDirectoryResponse> {
        return await this.sessionWorkspaceService.listDirectory(sessionId, path)
    }

    async createDirectory(sessionId: string, path: string): Promise<RpcPathMutationResponse> {
        return await this.sessionWorkspaceService.createDirectory(sessionId, path)
    }

    async renameSessionPath(sessionId: string, path: string, nextPath: string): Promise<RpcPathMutationResponse> {
        return await this.sessionWorkspaceService.renameSessionPath(sessionId, path, nextPath)
    }

    async deleteSessionPath(sessionId: string, path: string, recursive?: boolean): Promise<RpcPathMutationResponse> {
        return await this.sessionWorkspaceService.deleteSessionPath(sessionId, path, recursive)
    }

    async uploadFile(sessionId: string, filename: string, content: string, mimeType: string): Promise<RpcUploadFileResponse> {
        return await this.sessionWorkspaceService.uploadFile(sessionId, filename, content, mimeType)
    }

    async deleteUploadFile(sessionId: string, path: string): Promise<RpcDeleteUploadResponse> {
        return await this.sessionWorkspaceService.deleteUploadFile(sessionId, path)
    }

    async runRipgrep(sessionId: string, args: string[], cwd?: string): Promise<RpcCommandResponse> {
        return await this.sessionWorkspaceService.runRipgrep(sessionId, args, cwd)
    }

    async listSlashCommands(sessionId: string, agent: string): Promise<{
        success: boolean
        commands?: Array<{ name: string; description?: string; source: 'builtin' | 'user' | 'plugin' | 'project' }>
        error?: string
    }> {
        return await this.sessionWorkspaceService.listSlashCommands(sessionId, agent)
    }

    async listSkills(sessionId: string): Promise<{
        success: boolean
        skills?: Array<{ name: string; description?: string }>
        error?: string
    }> {
        return await this.sessionWorkspaceService.listSkills(sessionId)
    }
}
