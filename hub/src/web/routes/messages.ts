import { Hono } from 'hono'
import {
    MessagesQuerySchema,
    MessagesResponseSchema,
    SendSessionMessageBodySchema,
} from '@agentchat/protocol/contracts/sessions'
import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { requireSessionFromParam, requireSyncEngine } from './guards'

export function createMessagesRoutes(getSyncEngine: () => SyncEngine | null): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.get('/sessions/:id/messages', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }

        const sessionResult = requireSessionFromParam(c, engine)
        if (sessionResult instanceof Response) {
            return sessionResult
        }
        const sessionId = sessionResult.sessionId

        const parsed = MessagesQuerySchema.safeParse(c.req.query())
        const limit = parsed.success ? (parsed.data.limit ?? 50) : 50
        const beforeSeq = parsed.success ? (parsed.data.beforeSeq ?? null) : null
        return c.json(MessagesResponseSchema.parse(engine.getMessagesPage(sessionId, { limit, beforeSeq })))
    })

    app.post('/sessions/:id/messages', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }

        const sessionResult = requireSessionFromParam(c, engine, { requireActive: true })
        if (sessionResult instanceof Response) {
            return sessionResult
        }
        const sessionId = sessionResult.sessionId

        const body = await c.req.json().catch(() => null)
        const parsed = SendSessionMessageBodySchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        // Require text or attachments
        if (!parsed.data.text && (!parsed.data.attachments || parsed.data.attachments.length === 0)) {
            return c.json({ error: 'Message requires text or attachments' }, 400)
        }

        await engine.sendMessage(sessionId, {
            text: parsed.data.text,
            localId: parsed.data.localId,
            attachments: parsed.data.attachments,
            sentFrom: 'webapp'
        })
        return c.json({ ok: true })
    })

    return app
}
