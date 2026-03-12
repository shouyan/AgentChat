import { Hono } from 'hono'
import { registerSessionRoutes } from '../../domains/sessions/httpRoutes'
import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'

export function createSessionsRoutes(getSyncEngine: () => SyncEngine | null): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()
    registerSessionRoutes(app, getSyncEngine)
    return app
}
