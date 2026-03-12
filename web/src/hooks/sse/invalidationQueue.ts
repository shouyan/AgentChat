import type { QueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'

const INVALIDATION_BATCH_MS = 16

type PendingInvalidations = {
    sessions: boolean
    rooms: boolean
    machines: boolean
    sessionIds: Set<string>
    roomIds: Set<string>
}

export class SSEInvalidationQueue {
    private readonly queryClient: QueryClient
    private timer: ReturnType<typeof setTimeout> | null = null
    private readonly pending: PendingInvalidations = {
        sessions: false,
        rooms: false,
        machines: false,
        sessionIds: new Set(),
        roomIds: new Set(),
    }

    constructor(queryClient: QueryClient) {
        this.queryClient = queryClient
    }

    queueSessionList(): void {
        this.pending.sessions = true
        this.scheduleFlush()
    }

    queueRoomList(): void {
        this.pending.rooms = true
        this.scheduleFlush()
    }

    queueSessionDetail(sessionId: string): void {
        this.pending.sessionIds.add(sessionId)
        this.scheduleFlush()
    }

    queueRoomDetail(roomId: string): void {
        this.pending.roomIds.add(roomId)
        this.scheduleFlush()
    }

    queueMachines(): void {
        this.pending.machines = true
        this.scheduleFlush()
    }

    dispose(): void {
        if (this.timer) {
            clearTimeout(this.timer)
            this.timer = null
        }
        this.pending.sessions = false
        this.pending.rooms = false
        this.pending.machines = false
        this.pending.sessionIds.clear()
        this.pending.roomIds.clear()
    }

    private scheduleFlush(): void {
        if (this.timer) {
            return
        }
        this.timer = setTimeout(() => {
            this.timer = null
            this.flush()
        }, INVALIDATION_BATCH_MS)
    }

    private flush(): void {
        if (!this.pending.sessions && !this.pending.rooms && !this.pending.machines && this.pending.sessionIds.size === 0 && this.pending.roomIds.size === 0) {
            return
        }

        const shouldInvalidateSessions = this.pending.sessions
        const shouldInvalidateRooms = this.pending.rooms
        const shouldInvalidateMachines = this.pending.machines
        const sessionIds = Array.from(this.pending.sessionIds)
        const roomIds = Array.from(this.pending.roomIds)

        this.pending.sessions = false
        this.pending.rooms = false
        this.pending.machines = false
        this.pending.sessionIds.clear()
        this.pending.roomIds.clear()

        const tasks: Array<Promise<unknown>> = []
        if (shouldInvalidateSessions) {
            tasks.push(this.queryClient.invalidateQueries({ queryKey: queryKeys.sessions }))
        }
        if (shouldInvalidateRooms) {
            tasks.push(this.queryClient.invalidateQueries({ queryKey: queryKeys.rooms }))
        }
        for (const sessionId of sessionIds) {
            tasks.push(this.queryClient.invalidateQueries({ queryKey: queryKeys.session(sessionId) }))
        }
        for (const roomId of roomIds) {
            tasks.push(this.queryClient.invalidateQueries({ queryKey: queryKeys.room(roomId) }))
        }
        if (shouldInvalidateMachines) {
            tasks.push(this.queryClient.invalidateQueries({ queryKey: queryKeys.machines }))
        }

        if (tasks.length === 0) {
            return
        }
        void Promise.all(tasks).catch(() => {})
    }
}
