import { useMemo } from 'react'
import type { ApiClient } from '@/api/client'
import { useRooms } from '@/features/rooms/hooks/useRooms'
import { useSessions } from '@/hooks/queries/useSessions'

export function useInboxSidebarData(api: ApiClient | null) {
    const { rooms, isLoading: roomsLoading, error: roomsError, refetch: refetchRooms } = useRooms(api)
    const { sessions, isLoading: sessionsLoading, error: sessionsError, refetch: refetchSessions } = useSessions(api)

    const topLevelSessions = useMemo(() => {
        const roomSpawnedSessionIds = new Set<string>()
        const knownRoomIds = new Set(rooms.map((room) => room.id))
        for (const room of rooms) {
            for (const role of room.state.roles) {
                if (!role.assignedSessionId) continue
                if (role.assignmentMode === 'spawn_new') roomSpawnedSessionIds.add(role.assignedSessionId)
            }
        }
        return sessions.filter((session) => {
            if (session.metadata?.roomSpawned) return false
            if (session.metadata?.roomId && knownRoomIds.has(session.metadata.roomId)) return false
            if (roomSpawnedSessionIds.has(session.id)) return false
            return true
        })
    }, [rooms, sessions])

    return { rooms, roomsLoading, roomsError, refetchRooms, sessions, sessionsLoading, sessionsError, refetchSessions, topLevelSessions }
}
