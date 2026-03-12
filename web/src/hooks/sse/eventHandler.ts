import type { QueryClient } from '@tanstack/react-query'
import type { SyncEvent } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'
import { ingestIncomingMessages } from '@/lib/message-window-store'
import {
    createSSECacheOps,
    getSessionPatch,
    hasRecordShape,
    hasUnknownSessionPatchKeys,
    isInactiveMachinePatch,
    isMachineRecord,
    isRoomRecord,
    isSessionRecord,
    type SSECacheOps,
} from './cacheOps'
import type { ToastEvent } from './types'
import type { SSEInvalidationQueue } from './invalidationQueue'

type SyncEventHandlerOptions = {
    queryClient: QueryClient
    invalidationQueue: SSEInvalidationQueue
    onEvent: (event: SyncEvent) => void
    onToast?: (event: ToastEvent) => void
    setSubscriptionId: (value: string | null) => void
    markActivity: () => void
}

function createHandlerCache(options: SyncEventHandlerOptions): SSECacheOps {
    return createSSECacheOps(options.queryClient)
}

export function createSyncEventHandler(options: SyncEventHandlerOptions): (event: SyncEvent) => void {
    const cache = createHandlerCache(options)

    return (event: SyncEvent) => {
        options.markActivity()

        if (event.type === 'heartbeat') {
            return
        }

        if (event.type === 'connection-changed') {
            const data = event.data
            if (data && typeof data === 'object' && 'subscriptionId' in data) {
                const nextId = (data as { subscriptionId?: unknown }).subscriptionId
                if (typeof nextId === 'string' && nextId.length > 0) {
                    options.setSubscriptionId(nextId)
                }
            }
        }

        if (event.type === 'toast') {
            options.onToast?.(event)
            return
        }

        if (event.type === 'templates-updated') {
            void options.queryClient.invalidateQueries({ queryKey: queryKeys.templates })
        }

        if (event.type === 'message-received') {
            ingestIncomingMessages(event.sessionId, [event.message])
        }

        if (event.type === 'room-message-received') {
            cache.appendRoomMessage(event.roomId, event.message)
            options.invalidationQueue.queueRoomDetail(event.roomId)
            options.invalidationQueue.queueRoomList()
        }

        if (event.type === 'session-added' || event.type === 'session-updated' || event.type === 'session-removed') {
            if (event.type === 'session-removed') {
                cache.removeSession(event.sessionId)
            } else if (isSessionRecord(event.data) && event.data.id === event.sessionId) {
                cache.setSession(event.sessionId, event.data)
            } else {
                const patch = getSessionPatch(event.data)
                if (patch) {
                    const detailPatched = cache.patchSessionDetail(event.sessionId, patch)
                    const summaryPatched = cache.patchSessionSummary(event.sessionId, patch)

                    if (!detailPatched) {
                        options.invalidationQueue.queueSessionDetail(event.sessionId)
                    }
                    if (!summaryPatched) {
                        options.invalidationQueue.queueSessionList()
                    }
                    if (hasUnknownSessionPatchKeys(event.data)) {
                        options.invalidationQueue.queueSessionDetail(event.sessionId)
                        options.invalidationQueue.queueSessionList()
                    }
                } else {
                    options.invalidationQueue.queueSessionDetail(event.sessionId)
                    options.invalidationQueue.queueSessionList()
                }
            }
        }

        if (event.type === 'room-added' || event.type === 'room-updated' || event.type === 'room-removed') {
            if (event.type === 'room-removed') {
                cache.removeRoom(event.roomId)
            } else if (isRoomRecord(event.data)) {
                cache.upsertRoom(event.data)
            } else {
                options.invalidationQueue.queueRoomDetail(event.roomId)
                options.invalidationQueue.queueRoomList()
            }
        }

        if (event.type === 'machine-updated') {
            if (isMachineRecord(event.data)) {
                cache.upsertMachine(event.data)
            } else if (event.data === null || isInactiveMachinePatch(event.data)) {
                cache.removeMachine(event.machineId)
            } else if (!hasRecordShape(event.data) || typeof event.data.activeAt !== 'number') {
                options.invalidationQueue.queueMachines()
            }
        }

        options.onEvent(event)
    }
}
