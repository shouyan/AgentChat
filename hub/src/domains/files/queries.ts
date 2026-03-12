import type { SyncEngine } from '../../sync/syncEngine'
import { buildFileSearchItems, runRpc } from './helpers'

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
