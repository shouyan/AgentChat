import type { SyncEngine } from '../../sync/syncEngine'

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

export async function restartMachineRunner(engine: SyncEngine, machineId: string, namespace: string) {
    return await engine.restartRunner(machineId, namespace)
}

export async function cleanupMachineSessions(engine: SyncEngine, machineId: string, namespace: string) {
    return await engine.cleanupDeadSessions(machineId, namespace)
}
