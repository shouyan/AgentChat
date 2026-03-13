import { useCallback, useMemo, useState } from 'react'

const STORAGE_KEY = 'agentchat:recentPaths'
const LEGACY_STORAGE_KEY = 'agentchat:recentPaths'
const MAX_PATHS_PER_MACHINE = 5

type RecentPathsData = Record<string, string[]>

function loadRecentPaths(): RecentPathsData {
    try {
        const stored = localStorage.getItem(STORAGE_KEY)
        const legacy = stored ? null : localStorage.getItem(LEGACY_STORAGE_KEY)
        return stored ? JSON.parse(stored) : legacy ? JSON.parse(legacy) : {}
    } catch {
        return {}
    }
}

function saveRecentPaths(data: RecentPathsData): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
        // Ignore storage errors
    }
}

export function useRecentPaths() {
    const [data, setData] = useState<RecentPathsData>(loadRecentPaths)

    const getRecentPaths = useCallback((machineId: string | null): string[] => {
        if (!machineId) return []
        return data[machineId] ?? []
    }, [data])

    const addRecentPath = useCallback((machineId: string, path: string): void => {
        const trimmed = path.trim()
        if (!trimmed) return

        setData((prev) => {
            const existing = prev[machineId] ?? []
            // Remove if already exists, then add to front
            const filtered = existing.filter((p) => p !== trimmed)
            const updated = [trimmed, ...filtered].slice(0, MAX_PATHS_PER_MACHINE)

            const newData = { ...prev, [machineId]: updated }
            saveRecentPaths(newData)
            return newData
        })
    }, [])

    const getLastUsedMachineId = useCallback((): string | null => {
        try {
            return localStorage.getItem('agentchat:lastMachineId') ?? localStorage.getItem('agentchat:lastMachineId')
        } catch {
            return null
        }
    }, [])

    const setLastUsedMachineId = useCallback((machineId: string): void => {
        try {
            localStorage.setItem('agentchat:lastMachineId', machineId)
            localStorage.setItem('agentchat:lastMachineId', machineId)
        } catch {
            // Ignore storage errors
        }
    }, [])

    return useMemo(() => ({
        getRecentPaths,
        addRecentPath,
        getLastUsedMachineId,
        setLastUsedMachineId,
    }), [getRecentPaths, addRecentPath, getLastUsedMachineId, setLastUsedMachineId])
}
