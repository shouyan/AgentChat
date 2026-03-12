import type { SyncEngine } from '../../sync/syncEngine'

export function getRoom(engine: SyncEngine, roomId: string, namespace: string) {
    return engine.getRoomByNamespace(roomId, namespace) ?? null
}
