import type { SyncEngine } from '../../sync/syncEngine'

export async function writeSessionFileCommand(engine: SyncEngine, sessionId: string, path: string, content: string, expectedHash?: string | null) {
    return await engine.writeSessionFile(sessionId, path, content, expectedHash)
}

export async function createDirectoryCommand(engine: SyncEngine, sessionId: string, path: string) {
    return await engine.createDirectory(sessionId, path)
}

export async function renameSessionPathCommand(engine: SyncEngine, sessionId: string, path: string, nextPath: string) {
    return await engine.renameSessionPath(sessionId, path, nextPath)
}

export async function deleteSessionPathCommand(engine: SyncEngine, sessionId: string, path: string, recursive: boolean) {
    return await engine.deleteSessionPath(sessionId, path, recursive)
}

export async function uploadFileCommand(engine: SyncEngine, sessionId: string, filename: string, content: string, mimeType: string) {
    return await engine.uploadFile(sessionId, filename, content, mimeType)
}

export async function deleteUploadFileCommand(engine: SyncEngine, sessionId: string, path: string) {
    return await engine.deleteUploadFile(sessionId, path)
}
