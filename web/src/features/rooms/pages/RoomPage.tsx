import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'
import { RoomDetail } from '@/features/rooms/components/RoomDetail'
import { LoadingState } from '@/components/LoadingState'
import { useAppContext } from '@/lib/app-context'
import { queryKeys } from '@/lib/query-keys'
import { useRoom } from '@/features/rooms/hooks/useRoom'
import { useRoomMessages } from '@/features/rooms/hooks/useRoomMessages'
import { useRooms } from '@/features/rooms/hooks/useRooms'
import { useMachines } from '@/features/machines/hooks/useMachines'
import { useSessions } from '@/hooks/queries/useSessions'

export default function RoomPage() {
    const { api } = useAppContext()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const { roomId } = useParams({ from: '/rooms/$roomId' })
    const { room } = useRoom(api, roomId)
    const { messages } = useRoomMessages(api, roomId)
    const { sessions } = useSessions(api)
    const { machines } = useMachines(api, true)
    const { refetch: refetchRooms } = useRooms(api)

    if (!api || !room) {
        return <div className="flex h-full items-center justify-center"><LoadingState label="Loading room…" className="text-sm" /></div>
    }

    return (
        <RoomDetail
            api={api}
            room={room}
            messages={messages}
            sessions={sessions}
            machines={machines}
            onOpenSession={(sessionId) => navigate({ to: '/sessions/$sessionId', params: { sessionId }, search: { fromRoom: room.id } })}
            onOpenSessionFiles={(sessionId) => navigate({ to: '/sessions/$sessionId/files', params: { sessionId }, search: { tab: 'directories', fromRoom: room.id } })}
            onOpenSessionTerminal={(sessionId) => navigate({ to: '/sessions/$sessionId/terminal', params: { sessionId }, search: { fromRoom: room.id } })}
            onDeleted={() => {
                void queryClient.invalidateQueries({ queryKey: queryKeys.rooms })
                void queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
                void refetchRooms()
                navigate({ to: '/rooms' })
            }}
        />
    )
}
