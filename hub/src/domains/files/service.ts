import type { SyncEngine, Session } from '../../sync/syncEngine'

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

export function parseBooleanParam(value: string | undefined): boolean | undefined {
    if (value === 'true') return true
    if (value === 'false') return false
    return undefined
}

export async function runRpc<T>(fn: () => Promise<T>): Promise<T | { success: false; error: string }> {
    try {
        return await fn()
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
}

export function estimateBase64Bytes(base64: string): number {
    const len = base64.length
    if (len === 0) return 0
    const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
    return Math.floor((len * 3) / 4) - padding
}

export function getSessionWorkspacePath(session: Session) {
    return session.metadata?.path ?? null
}

export function buildFileSearchItems(stdout: string, limit: number) {
    return stdout
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .slice(0, limit)
        .map((fullPath) => {
            const parts = fullPath.split('/')
            const fileName = parts[parts.length - 1] || fullPath
            const filePath = parts.slice(0, -1).join('/')
            return { fileName, filePath, fullPath, fileType: 'file' as const }
        })
}

export async function searchSessionFiles(engine: SyncEngine, sessionId: string, sessionPath: string, query: string, limit: number) {
    const args = ['--files']
    if (query) {
        args.push('--iglob', `*${query}*`)
    }
    const result = await runRpc(() => engine.runRipgrep(sessionId, args, sessionPath))
    if (!result.success) {
        return { success: false as const, error: result.error ?? 'Failed to list files' }
    }
    return { success: true as const, files: buildFileSearchItems(result.stdout ?? '', limit) }
}
