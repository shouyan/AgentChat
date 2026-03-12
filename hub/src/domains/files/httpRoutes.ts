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

import { createDirectoryCommand, deleteSessionPathCommand, deleteUploadFileCommand, renameSessionPathCommand, uploadFileCommand, writeSessionFileCommand } from './commands'
import { estimateBase64Bytes, getSessionWorkspacePath, MAX_UPLOAD_BYTES, parseBooleanParam, runRpc } from './helpers'
import { searchSessionFiles } from './queries'

export function registerFileRoutes(app: Hono<WebAppEnv>, getSyncEngine: () => SyncEngine | null): void {
    app.get('/sessions/:id/git-status', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine
        const sessionResult = requireSessionFromParam(c, engine)
        if (sessionResult instanceof Response) return sessionResult
        const sessionPath = getSessionWorkspacePath(sessionResult.session)
        if (!sessionPath) return c.json({ success: false, error: 'Session path not available' })
        const result = await runRpc(() => engine.getGitStatus(sessionResult.sessionId, sessionPath))
        return c.json(result)
    })

    app.get('/sessions/:id/git-diff-numstat', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine
        const sessionResult = requireSessionFromParam(c, engine)
        if (sessionResult instanceof Response) return sessionResult
        const sessionPath = getSessionWorkspacePath(sessionResult.session)
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
        const sessionPath = getSessionWorkspacePath(sessionResult.session)
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
        const sessionPath = getSessionWorkspacePath(sessionResult.session)
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
            const result = await writeSessionFileCommand(engine, sessionResult.sessionId, parsed.data.path, parsed.data.content, parsed.data.expectedHash)
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
        const sessionPath = getSessionWorkspacePath(sessionResult.session)
        if (!sessionPath) return c.json({ success: false, error: 'Session path not available' })
        const parsed = FileSearchQuerySchema.safeParse(c.req.query())
        if (!parsed.success) return c.json({ error: 'Invalid query' }, 400)
        const query = parsed.data.query?.trim() ?? ''
        const limit = parsed.data.limit ?? 200
        const result = await searchSessionFiles(engine, sessionResult.sessionId, sessionPath, query, limit)
        if (!result.success) return c.json({ success: false, error: result.error ?? 'Failed to list files' })
        return c.json(FileSearchResponseSchema.parse({ success: true, files: result.files }))
    })

    app.get('/sessions/:id/directory', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine
        const sessionResult = requireSessionFromParam(c, engine)
        if (sessionResult instanceof Response) return sessionResult
        const sessionPath = getSessionWorkspacePath(sessionResult.session)
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
            const result = await createDirectoryCommand(engine, sessionResult.sessionId, parsed.data.path)
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
            const result = await renameSessionPathCommand(engine, sessionResult.sessionId, parsed.data.path, parsed.data.nextPath)
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
            const result = await deleteSessionPathCommand(engine, sessionResult.sessionId, parsed.data.path, parsed.data.recursive ?? true)
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
            const result = await uploadFileCommand(engine, sessionResult.sessionId, parsed.data.filename, parsed.data.content, parsed.data.mimeType ?? 'application/octet-stream')
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
            const result = await deleteUploadFileCommand(engine, sessionResult.sessionId, parsed.data.path)
            return c.json(DeleteUploadResponseSchema.parse(result))
        } catch (error) {
            return c.json(DeleteUploadResponseSchema.parse({ success: false, error: error instanceof Error ? error.message : 'Failed to delete upload' }), 500)
        }
    })
}
