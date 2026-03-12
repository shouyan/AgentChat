import { Hono } from 'hono'
import { registerRoomRoutes } from '../../domains/rooms/httpRoutes'
import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'

export function createRoomsRoutes(getSyncEngine: () => SyncEngine | null): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()
    registerRoomRoutes(app, getSyncEngine)
    return app
}
