import type { ModelMode, PermissionMode } from '@agentchat/protocol'
import type { SyncEngine } from '../../sync/syncEngine'

export async function abortSessionCommand(engine: SyncEngine, sessionId: string) {
    await engine.abortSession(sessionId)
}

export async function archiveSessionCommand(engine: SyncEngine, sessionId: string) {
    await engine.archiveSession(sessionId)
}

export async function switchSessionToRemoteCommand(engine: SyncEngine, sessionId: string) {
    await engine.switchSession(sessionId, 'remote')
}

export async function applySessionPermissionModeCommand(engine: SyncEngine, sessionId: string, mode: PermissionMode) {
    await engine.applySessionConfig(sessionId, { permissionMode: mode })
}

export async function applySessionModelModeCommand(engine: SyncEngine, sessionId: string, model: ModelMode) {
    await engine.applySessionConfig(sessionId, { modelMode: model })
}

export async function applySessionModelCommand(engine: SyncEngine, sessionId: string, model: string) {
    await engine.applySessionConfig(sessionId, { model })
}

export async function renameSessionCommand(engine: SyncEngine, sessionId: string, name: string) {
    await engine.renameSession(sessionId, name)
}

export async function deleteSessionCommand(engine: SyncEngine, sessionId: string, namespace: string) {
    await engine.deleteSession(sessionId, namespace)
}
