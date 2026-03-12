import { Hono } from 'hono'
import { registerMachineRoutes } from '../../domains/machines/httpRoutes'
import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'

export function createMachinesRoutes(getSyncEngine: () => SyncEngine | null): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()
    registerMachineRoutes(app, getSyncEngine)
    return app
}
