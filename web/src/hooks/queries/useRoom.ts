import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { Room } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

export function useRoom(api: ApiClient | null, roomId: string | null): {
  room: Room | null
  isLoading: boolean
  error: string | null
  refetch: () => Promise<unknown>
} {
  const query = useQuery({
    queryKey: roomId ? queryKeys.room(roomId) : ['room', 'missing'],
    queryFn: async () => {
      if (!api || !roomId) throw new Error('API unavailable')
      return await api.getRoom(roomId)
    },
    enabled: Boolean(api && roomId),
  })

  return {
    room: query.data?.room ?? null,
    isLoading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load room' : null,
    refetch: query.refetch,
  }
}
