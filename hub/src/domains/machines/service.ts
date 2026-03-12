import type { SyncEngine } from '../../sync/syncEngine'

export function uniqueNonEmptyPaths(paths: string[]) {
    return Array.from(new Set(paths.map((path) => path.trim()).filter(Boolean)))
}

export function listOnlineMachines(engine: SyncEngine, namespace: string) {
    return engine.getOnlineMachinesByNamespace(namespace)
}

export async function spawnMachineSession(
    engine: SyncEngine,
    machineId: string,
    input: {
        directory: string
        agent?: 'claude' | 'codex' | 'cursor' | 'gemini' | 'opencode'
        model?: string
        yolo?: boolean
        sessionType?: 'simple' | 'worktree'
        worktreeName?: string
    },
) {
    return await engine.spawnSession(
        machineId,
        input.directory,
        input.agent,
        input.model,
        input.yolo,
        input.sessionType,
        input.worktreeName,
    )
}

export async function checkMachinePaths(engine: SyncEngine, machineId: string, paths: string[]) {
    return await engine.checkPathsExist(machineId, uniqueNonEmptyPaths(paths))
}

export async function listMachineDirectory(engine: SyncEngine, machineId: string, path?: string) {
    return await engine.listMachineDirectory(machineId, path)
}

export async function restartMachineRunner(engine: SyncEngine, machineId: string, namespace: string) {
    return await engine.restartRunner(machineId, namespace)
}

export async function cleanupMachineSessions(engine: SyncEngine, machineId: string, namespace: string) {
    return await engine.cleanupDeadSessions(machineId, namespace)
}

export async function checkMachineProviderHealth(engine: SyncEngine, machineId: string, namespace: string) {
    return await engine.checkProviderHealth(machineId, namespace)
}
