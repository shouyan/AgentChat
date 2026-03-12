import type { Hono } from 'hono'
import {
    DeletePathBodySchema,
    DeleteUploadBodySchema,
    DirectoryQuerySchema,
    FilePathSchema,
    FileSearchQuerySchema,
    RenamePathBodySchema,
    UploadFileBodySchema,
    WriteFileBodySchema,
} from '@hapi/protocol/files'
import {
    DeleteUploadResponseSchema,
    FileReadResponseSchema,
    FileSearchResponseSchema,
    FileWriteResponseSchema,
    ListDirectoryResponseSchema,
    PathMutationResponseSchema,
    UploadFileResponseSchema,
} from '@hapi/protocol/contracts/files'
import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../../web/middleware/auth'
import { requireSessionFromParam, requireSyncEngine } from '../../web/routes/guards'

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

function parseBooleanParam(value: string | undefined): boolean | undefined {
    if (value === 'true') return true
    if (value === 'false') return false
    return undefined
}

async function runRpc<T>(fn: () => Promise<T>): Promise<T | { success: false; error: string }> {
    try {
        return await fn()
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
}

function estimateBase64Bytes(base64: string): number {
    const len = base64.length
    if (len === 0) return 0
    const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
    return Math.floor((len * 3) / 4) - padding
}

export function registerFileRoutes(app: Hono<WebAppEnv>, getSyncEngine: () => SyncEngine | null): void {
    app.get('/sessions/:id/git-status', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine
        const sessionResult = requireSessionFromParam(c, engine)
        if (sessionResult instanceof Response) return sessionResult
        const sessionPath = sessionResult.session.metadata?.path
        if (!sessionPath) return c.json({ success: false, error: 'Session path not available' })
        const result = await runRpc(() => engine.getGitStatus(sessionResult.sessionId, sessionPath))
        return c.json(result)
    })

    app.get('/sessions/:id/git-diff-numstat', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine
        const sessionResult = requireSessionFromParam(c, engine)
        if (sessionResult instanceof Response) return sessionResult
        const sessionPath = sessionResult.session.metadata?.path
        if (!sessionPath) return c.json({ success: false, error: 'Session path not available' })
        const staged = parseBooleanParam(c.req.query('staged'))
        const result = await runRpc(() => engine.getGitDiffNumstat(sessionResult.sessionId, { cwd: sessionPath, staged }))
        return c.json(result)
    })

    app.get('/sessions/:id/git-diff-file', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine
        const sessionResult = requireSessionFromParam(c, engine)
        if (sessionResult instanceof Response) return sessionResult
        const sessionPath = sessionResult.session.metadata?.path
        if (!sessionPath) return c.json({ success: false, error: 'Session path not available' })
        const parsed = FilePathSchema.safeParse(c.req.query())
        if (!parsed.success) return c.json({ error: 'Invalid file path' }, 400)
        const staged = parseBooleanParam(c.req.query('staged'))
        const result = await runRpc(() => engine.getGitDiffFile(sessionResult.sessionId, { cwd: sessionPath, filePath: parsed.data.path, staged }))
        return c.json(result)
    })

    app.get('/sessions/:id/file', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine
        const sessionResult = requireSessionFromParam(c, engine)
        if (sessionResult instanceof Response) return sessionResult
        const sessionPath = sessionResult.session.metadata?.path
        if (!sessionPath) return c.json({ success: false, error: 'Session path not available' })
        const parsed = FilePathSchema.safeParse(c.req.query())
        if (!parsed.success) return c.json({ error: 'Invalid file path' }, 400)
        const result = await runRpc(() => engine.readSessionFile(sessionResult.sessionId, parsed.data.path))
        return c.json(FileReadResponseSchema.parse(result))
    })

    app.post('/sessions/:id/file/write', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine
        const sessionResult = requireSessionFromParam(c, engine, { requireActive: true })
        if (sessionResult instanceof Response) return sessionResult
        const body = await c.req.json().catch(() => null)
        const parsed = WriteFileBodySchema.safeParse(body)
        if (!parsed.success) return c.json({ error: 'Invalid body' }, 400)
        try {
            const result = await engine.writeSessionFile(sessionResult.sessionId, parsed.data.path, parsed.data.content, parsed.data.expectedHash)
            return c.json(FileWriteResponseSchema.parse(result))
        } catch (error) {
            return c.json(FileWriteResponseSchema.parse({ success: false, error: error instanceof Error ? error.message : 'Failed to write file' }), 500)
        }
    })

    app.get('/sessions/:id/files', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine
        const sessionResult = requireSessionFromParam(c, engine)
        if (sessionResult instanceof Response) return sessionResult
        const sessionPath = sessionResult.session.metadata?.path
        if (!sessionPath) return c.json({ success: false, error: 'Session path not available' })
        const parsed = FileSearchQuerySchema.safeParse(c.req.query())
        if (!parsed.success) return c.json({ error: 'Invalid query' }, 400)
        const query = parsed.data.query?.trim() ?? ''
        const limit = parsed.data.limit ?? 200
        const args = ['--files']
        if (query) {
            args.push('--iglob', `*${query}*`)
        }
        const result = await runRpc(() => engine.runRipgrep(sessionResult.sessionId, args, sessionPath))
        if (!result.success) return c.json({ success: false, error: result.error ?? 'Failed to list files' })
        const stdout = result.stdout ?? ''
        const files = stdout.split('\n').map((line) => line.trim()).filter((line) => line.length > 0).slice(0, limit).map((fullPath) => {
            const parts = fullPath.split('/')
            const fileName = parts[parts.length - 1] || fullPath
            const filePath = parts.slice(0, -1).join('/')
            return { fileName, filePath, fullPath, fileType: 'file' as const }
        })
        return c.json(FileSearchResponseSchema.parse({ success: true, files }))
    })

    app.get('/sessions/:id/directory', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine
        const sessionResult = requireSessionFromParam(c, engine)
        if (sessionResult instanceof Response) return sessionResult
        const sessionPath = sessionResult.session.metadata?.path
        if (!sessionPath) return c.json({ success: false, error: 'Session path not available' })
        const parsed = DirectoryQuerySchema.safeParse(c.req.query())
        if (!parsed.success) return c.json({ error: 'Invalid query' }, 400)
        const path = parsed.data.path ?? ''
        const result = await runRpc(() => engine.listDirectory(sessionResult.sessionId, path))
        return c.json(ListDirectoryResponseSchema.parse(result))
    })

    app.post('/sessions/:id/directory/create', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine
        const sessionResult = requireSessionFromParam(c, engine, { requireActive: true })
        if (sessionResult instanceof Response) return sessionResult
        const body = await c.req.json().catch(() => null)
        const parsed = FilePathSchema.safeParse(body)
        if (!parsed.success) return c.json({ error: 'Invalid body' }, 400)
        try {
            const result = await engine.createDirectory(sessionResult.sessionId, parsed.data.path)
            return c.json(PathMutationResponseSchema.parse(result))
        } catch (error) {
            return c.json(PathMutationResponseSchema.parse({ success: false, error: error instanceof Error ? error.message : 'Failed to create directory' }), 500)
        }
    })

    app.post('/sessions/:id/path/rename', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine
        const sessionResult = requireSessionFromParam(c, engine, { requireActive: true })
        if (sessionResult instanceof Response) return sessionResult
        const body = await c.req.json().catch(() => null)
        const parsed = RenamePathBodySchema.safeParse(body)
        if (!parsed.success) return c.json({ error: 'Invalid body' }, 400)
        try {
            const result = await engine.renameSessionPath(sessionResult.sessionId, parsed.data.path, parsed.data.nextPath)
            return c.json(PathMutationResponseSchema.parse(result))
        } catch (error) {
            return c.json(PathMutationResponseSchema.parse({ success: false, error: error instanceof Error ? error.message : 'Failed to rename path' }), 500)
        }
    })

    app.post('/sessions/:id/path/delete', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine
        const sessionResult = requireSessionFromParam(c, engine, { requireActive: true })
        if (sessionResult instanceof Response) return sessionResult
        const body = await c.req.json().catch(() => null)
        const parsed = DeletePathBodySchema.safeParse(body)
        if (!parsed.success) return c.json({ error: 'Invalid body' }, 400)
        try {
            const result = await engine.deleteSessionPath(sessionResult.sessionId, parsed.data.path, parsed.data.recursive ?? true)
            return c.json(PathMutationResponseSchema.parse(result))
        } catch (error) {
            return c.json(PathMutationResponseSchema.parse({ success: false, error: error instanceof Error ? error.message : 'Failed to delete path' }), 500)
        }
    })
}

export function registerUploadRoutes(app: Hono<WebAppEnv>, getSyncEngine: () => SyncEngine | null): void {
    app.post('/sessions/:id/upload', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine
        const sessionResult = requireSessionFromParam(c, engine, { requireActive: true })
        if (sessionResult instanceof Response) return sessionResult
        const body = await c.req.json().catch(() => null)
        const parsed = UploadFileBodySchema.safeParse(body)
        if (!parsed.success) return c.json({ error: 'Invalid body' }, 400)
        const estimatedBytes = estimateBase64Bytes(parsed.data.content)
        if (estimatedBytes > MAX_UPLOAD_BYTES) {
            return c.json(UploadFileResponseSchema.parse({ success: false, error: 'File too large (max 50MB)' }), 413)
        }
        try {
            const result = await engine.uploadFile(sessionResult.sessionId, parsed.data.filename, parsed.data.content, parsed.data.mimeType)
            return c.json(UploadFileResponseSchema.parse(result))
        } catch (error) {
            return c.json(UploadFileResponseSchema.parse({ success: false, error: error instanceof Error ? error.message : 'Failed to upload file' }), 500)
        }
    })

    app.post('/sessions/:id/upload/delete', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine
        const sessionResult = requireSessionFromParam(c, engine, { requireActive: true })
        if (sessionResult instanceof Response) return sessionResult
        const body = await c.req.json().catch(() => null)
        const parsed = DeleteUploadBodySchema.safeParse(body)
        if (!parsed.success) return c.json({ error: 'Invalid body' }, 400)
        try {
            const result = await engine.deleteUploadFile(sessionResult.sessionId, parsed.data.path)
            return c.json(DeleteUploadResponseSchema.parse(result))
        } catch (error) {
            return c.json(DeleteUploadResponseSchema.parse({ success: false, error: error instanceof Error ? error.message : 'Failed to delete upload' }), 500)
        }
    })
}
