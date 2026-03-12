import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { MachineDirectoryEntry } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

export function useMachineDirectory(
    api: ApiClient | null,
    machineId: string | null,
    path: string,
    enabled: boolean
): {
    path: string | null
    parentPath: string | null
    entries: MachineDirectoryEntry[]
    error: string | null
    isLoading: boolean
    refetch: () => Promise<unknown>
} {
    const resolvedMachineId = machineId ?? 'unknown'

    const query = useQuery({
        queryKey: queryKeys.machineDirectory(resolvedMachineId, path),
        queryFn: async () => {
            if (!api || !machineId) {
                throw new Error('Machine unavailable')
            }

            const response = await api.listMachineDirectory(machineId, path)
            if (!response.success) {
                return {
                    path: null,
                    parentPath: null,
                    entries: [],
                    error: response.error ?? 'Failed to list machine directory'
                }
            }

            return {
                path: response.path ?? null,
                parentPath: response.parentPath ?? null,
                entries: response.entries ?? [],
                error: null
            }
        },
        enabled: Boolean(api && machineId && enabled)
    })

    const queryError = query.error instanceof Error
        ? query.error.message
        : query.error
            ? 'Failed to list machine directory'
            : null

    return {
        path: query.data?.path ?? null,
        parentPath: query.data?.parentPath ?? null,
        entries: query.data?.entries ?? [],
        error: queryError ?? query.data?.error ?? null,
        isLoading: query.isLoading,
        refetch: query.refetch
    }
}
