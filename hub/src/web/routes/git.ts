import { Hono } from 'hono'
import { registerFileRoutes } from '../../domains/files/httpRoutes'
import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'

export function createGitRoutes(getSyncEngine: () => SyncEngine | null): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()
    registerFileRoutes(app, getSyncEngine)
    return app
}
