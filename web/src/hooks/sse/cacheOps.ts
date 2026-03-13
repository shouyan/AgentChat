import type { QueryClient } from '@tanstack/react-query'
import { isObject, toSessionSummary } from '@agentchat/protocol'
import type {
    Machine,
    MachinesResponse,
    Room,
    RoomMessage,
    Session,
    SessionResponse,
    SessionsResponse,
    SessionSummary,
} from '@/types/api'
import { queryKeys } from '@/lib/query-keys'
import { clearMessageWindow } from '@/lib/message-window-store'
import type { SessionPatch } from './types'

function sortSessionSummaries(left: SessionSummary, right: SessionSummary): number {
    if (left.active !== right.active) {
        return left.active ? -1 : 1
    }
    if (left.active && left.pendingRequestsCount !== right.pendingRequestsCount) {
        return right.pendingRequestsCount - left.pendingRequestsCount
    }
    return right.updatedAt - left.updatedAt
}

export function hasRecordShape(value: unknown): value is Record<string, unknown> {
    return isObject(value)
}

export function isSessionRecord(value: unknown): value is Session {
    if (!hasRecordShape(value)) {
        return false
    }
    return typeof value.id === 'string'
        && typeof value.active === 'boolean'
        && typeof value.activeAt === 'number'
        && typeof value.updatedAt === 'number'
        && typeof value.thinking === 'boolean'
}

export function getSessionPatch(value: unknown): SessionPatch | null {
    if (!hasRecordShape(value)) {
        return null
    }

    const patch: SessionPatch = {}
    let hasKnownPatch = false

    if (typeof value.active === 'boolean') {
        patch.active = value.active
        hasKnownPatch = true
    }
    if (typeof value.thinking === 'boolean') {
        patch.thinking = value.thinking
        hasKnownPatch = true
    }
    if (typeof value.activeAt === 'number') {
        patch.activeAt = value.activeAt
        hasKnownPatch = true
    }
    if (typeof value.updatedAt === 'number') {
        patch.updatedAt = value.updatedAt
        hasKnownPatch = true
    }
    if (typeof value.permissionMode === 'string') {
        patch.permissionMode = value.permissionMode as Session['permissionMode']
        hasKnownPatch = true
    }
    if (typeof value.modelMode === 'string') {
        patch.modelMode = value.modelMode as Session['modelMode']
        hasKnownPatch = true
    }

    return hasKnownPatch ? patch : null
}

export function hasUnknownSessionPatchKeys(value: unknown): boolean {
    if (!hasRecordShape(value)) {
        return false
    }
    const knownKeys = new Set(['active', 'thinking', 'activeAt', 'updatedAt', 'permissionMode', 'modelMode'])
    return Object.keys(value).some((key) => !knownKeys.has(key))
}

function isMachineMetadata(value: unknown): value is Machine['metadata'] {
    if (value === null) {
        return true
    }
    if (!hasRecordShape(value)) {
        return false
    }
    return typeof value.host === 'string'
        && typeof value.platform === 'string'
        && typeof value.agentchatCliVersion === 'string'
}

export function isMachineRecord(value: unknown): value is Machine {
    if (!hasRecordShape(value)) {
        return false
    }
    return typeof value.id === 'string'
        && typeof value.active === 'boolean'
        && isMachineMetadata(value.metadata)
}

export function isRoomRecord(value: unknown): value is Room {
    if (!hasRecordShape(value)) {
        return false
    }
    return typeof value.id === 'string'
        && typeof value.namespace === 'string'
        && typeof value.createdAt === 'number'
        && typeof value.updatedAt === 'number'
        && hasRecordShape(value.metadata)
        && hasRecordShape(value.state)
}

export function isInactiveMachinePatch(value: unknown): boolean {
    return hasRecordShape(value) && value.active === false
}

export function createSSECacheOps(queryClient: QueryClient) {
    return {
        upsertSessionSummary(session: Session): void {
            queryClient.setQueryData<SessionsResponse | undefined>(queryKeys.sessions, (previous) => {
                if (!previous) {
                    return previous
                }

                const summary = toSessionSummary(session)
                const nextSessions = previous.sessions.slice()
                const existingIndex = nextSessions.findIndex((item) => item.id === session.id)
                if (existingIndex >= 0) {
                    nextSessions[existingIndex] = summary
                } else {
                    nextSessions.push(summary)
                }
                nextSessions.sort(sortSessionSummaries)
                return { ...previous, sessions: nextSessions }
            })
        },

        patchSessionSummary(sessionId: string, patch: SessionPatch): boolean {
            let patched = false
            queryClient.setQueryData<SessionsResponse | undefined>(queryKeys.sessions, (previous) => {
                if (!previous) {
                    return previous
                }

                const nextSessions = previous.sessions.slice()
                const index = nextSessions.findIndex((item) => item.id === sessionId)
                if (index < 0) {
                    return previous
                }

                const current = nextSessions[index]
                if (!current) {
                    return previous
                }

                const nextSummary: SessionSummary = {
                    ...current,
                    active: patch.active ?? current.active,
                    thinking: patch.thinking ?? current.thinking,
                    activeAt: patch.activeAt ?? current.activeAt,
                    updatedAt: patch.updatedAt ?? current.updatedAt,
                    modelMode: patch.modelMode ?? current.modelMode,
                }

                patched = true
                nextSessions[index] = nextSummary
                nextSessions.sort(sortSessionSummaries)
                return { ...previous, sessions: nextSessions }
            })
            return patched
        },

        patchSessionDetail(sessionId: string, patch: SessionPatch): boolean {
            let patched = false
            queryClient.setQueryData<SessionResponse | undefined>(queryKeys.session(sessionId), (previous) => {
                if (!previous?.session) {
                    return previous
                }
                patched = true
                return {
                    ...previous,
                    session: {
                        ...previous.session,
                        ...patch,
                    },
                }
            })
            return patched
        },

        removeSessionSummary(sessionId: string): void {
            queryClient.setQueryData<SessionsResponse | undefined>(queryKeys.sessions, (previous) => {
                if (!previous) {
                    return previous
                }
                const nextSessions = previous.sessions.filter((item) => item.id !== sessionId)
                if (nextSessions.length === previous.sessions.length) {
                    return previous
                }
                return { ...previous, sessions: nextSessions }
            })
        },

        removeSession(sessionId: string): void {
            this.removeSessionSummary(sessionId)
            void queryClient.removeQueries({ queryKey: queryKeys.session(sessionId) })
            clearMessageWindow(sessionId)
        },

        setSession(sessionId: string, session: Session): void {
            queryClient.setQueryData<SessionResponse>(queryKeys.session(sessionId), { session })
            this.upsertSessionSummary(session)
        },

        upsertRoom(room: Room): void {
            queryClient.setQueryData<{ rooms: Room[] } | undefined>(queryKeys.rooms, (previous) => {
                if (!previous) {
                    return previous
                }
                const nextRooms = previous.rooms.slice()
                const existingIndex = nextRooms.findIndex((item) => item.id === room.id)
                if (existingIndex >= 0) {
                    nextRooms[existingIndex] = room
                } else {
                    nextRooms.unshift(room)
                }
                return { rooms: nextRooms }
            })
            queryClient.setQueryData(queryKeys.room(room.id), { room })
        },

        appendRoomMessage(roomId: string, message: RoomMessage): void {
            queryClient.setQueryData<{
                messages: RoomMessage[]
                page: { limit: number; beforeSeq: number | null; nextBeforeSeq: number | null; hasMore: boolean }
            } | undefined>(queryKeys.roomMessages(roomId), (previous) => {
                if (!previous) {
                    return previous
                }
                return {
                    ...previous,
                    messages: [...previous.messages, message],
                }
            })
        },

        removeRoom(roomId: string): void {
            queryClient.setQueryData<{ rooms: Room[] } | undefined>(queryKeys.rooms, (previous) => {
                if (!previous) {
                    return previous
                }
                return { rooms: previous.rooms.filter((item) => item.id !== roomId) }
            })
            void queryClient.removeQueries({ queryKey: queryKeys.room(roomId) })
            void queryClient.removeQueries({ queryKey: queryKeys.roomMessages(roomId) })
        },

        upsertMachine(machine: Machine): void {
            queryClient.setQueryData<MachinesResponse | undefined>(queryKeys.machines, (previous) => {
                if (!previous) {
                    return previous
                }

                const nextMachines = previous.machines.slice()
                const index = nextMachines.findIndex((item) => item.id === machine.id)
                if (!machine.active) {
                    if (index >= 0) {
                        nextMachines.splice(index, 1)
                        return { ...previous, machines: nextMachines }
                    }
                    return previous
                }

                if (index >= 0) {
                    nextMachines[index] = machine
                } else {
                    nextMachines.push(machine)
                }
                return { ...previous, machines: nextMachines }
            })
        },

        removeMachine(machineId: string): void {
            queryClient.setQueryData<MachinesResponse | undefined>(queryKeys.machines, (previous) => {
                if (!previous) {
                    return previous
                }
                const nextMachines = previous.machines.filter((item) => item.id !== machineId)
                if (nextMachines.length === previous.machines.length) {
                    return previous
                }
                return { ...previous, machines: nextMachines }
            })
        },
    }
}

export type SSECacheOps = ReturnType<typeof createSSECacheOps>
