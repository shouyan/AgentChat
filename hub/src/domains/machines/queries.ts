import type { SyncEngine } from '../../sync/syncEngine'

export function listOnlineMachines(engine: SyncEngine, namespace: string) {
    return engine.getOnlineMachinesByNamespace(namespace)
}

export async function checkMachinePaths(engine: SyncEngine, machineId: string, paths: string[]) {
    return await engine.checkPathsExist(machineId, paths)
}

export async function listMachineDirectory(engine: SyncEngine, machineId: string, path?: string) {
    return await engine.listMachineDirectory(machineId, path)
}

export async function checkMachineProviderHealth(engine: SyncEngine, machineId: string, namespace: string) {
    return await engine.checkProviderHealth(machineId, namespace)
}
