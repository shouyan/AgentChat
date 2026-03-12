import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { RoomMessage } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

export function useRoomMessages(api: ApiClient | null, roomId: string | null): {
  messages: RoomMessage[]
  isLoading: boolean
  error: string | null
  refetch: () => Promise<unknown>
} {
  const query = useQuery({
    queryKey: roomId ? queryKeys.roomMessages(roomId) : ['room-messages', 'missing'],
    queryFn: async () => {
      if (!api || !roomId) throw new Error('API unavailable')
      return await api.getRoomMessages(roomId, { limit: 200 })
    },
    enabled: Boolean(api && roomId),
  })

  return {
    messages: query.data?.messages ?? [],
    isLoading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load room messages' : null,
    refetch: query.refetch,
  }
}
