import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { Room } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

export function useRooms(api: ApiClient | null): {
  rooms: Room[]
  isLoading: boolean
  error: string | null
  refetch: () => Promise<unknown>
} {
  const query = useQuery({
    queryKey: queryKeys.rooms,
    queryFn: async () => {
      if (!api) throw new Error('API unavailable')
      return await api.getRooms()
    },
    enabled: Boolean(api),
  })

  return {
    rooms: query.data?.rooms ?? [],
    isLoading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load rooms' : null,
    refetch: query.refetch,
  }
}
