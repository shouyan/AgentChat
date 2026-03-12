import type { Hono } from 'hono'
import {
    AssignRoomRoleBodySchema,
    AssignRoomTaskBodySchema,
    BlockRoomTaskBodySchema,
    ClaimRoomTaskBodySchema,
    CompleteRoomTaskBodySchema,
    CreateRoomBodySchema,
    CreateRoomResponseSchema,
    CreateRoomRoleInputSchema,
    CreateRoomTaskBodySchema,
    DeleteRoomResponseSchema,
    HandoffRoomTaskBodySchema,
    RoomMessagesResponseSchema,
    RoomMessageQuerySchema,
    RoomResponseSchema,
    RoomsResponseSchema,
    SendRoomMessageBodySchema,
    SpawnRoomRoleBodySchema,
    SpawnRoomRoleResponseSchema,
    UpdateRoomBodySchema,
    UpdateRoomTaskBodySchema,
} from '@hapi/protocol/contracts/rooms'
import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../../web/middleware/auth'
import { requireSyncEngine } from '../../web/routes/guards'
import { createRoomWithAssignments } from './commands'
import { getRoom } from './queries'

export function registerRoomRoutes(app: Hono<WebAppEnv>, getSyncEngine: () => SyncEngine | null): void {
    app.get('/rooms', (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }
        const namespace = c.get('namespace')
        return c.json(RoomsResponseSchema.parse({ rooms: engine.getRoomsByNamespace(namespace) }))
    })

    app.post('/rooms', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }
        const namespace = c.get('namespace')
        const body = await c.req.json().catch(() => null)
        const parsed = CreateRoomBodySchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        try {
            const result = await createRoomWithAssignments(engine, namespace, parsed.data)
            return c.json(CreateRoomResponseSchema.parse(result))
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to create room'
            const status = message.startsWith('Failed to spawn role ') ? 409 : 500
            return c.json({ error: message }, status)
        }
    })

    app.get('/rooms/:id', (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }
        const namespace = c.get('namespace')
        const room = getRoom(engine, c.req.param('id'), namespace)
        if (!room) {
            return c.json({ error: 'Room not found' }, 404)
        }
        return c.json(RoomResponseSchema.parse({ room }))
    })

    app.delete('/rooms/:id', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }
        const namespace = c.get('namespace')
        const roomId = c.req.param('id')
        const room = getRoom(engine, roomId, namespace)
        if (!room) {
            return c.json({ error: 'Room not found' }, 404)
        }

        try {
            const result = await engine.deleteRoom(roomId, namespace)
            return c.json(DeleteRoomResponseSchema.parse({ ok: true, deletedSessionIds: result.deletedSessionIds }))
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to delete room'
            return c.json({ error: message }, 500)
        }
    })

    app.patch('/rooms/:id', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }
        const namespace = c.get('namespace')
        const roomId = c.req.param('id')
        const room = getRoom(engine, roomId, namespace)
        if (!room) {
            return c.json({ error: 'Room not found' }, 404)
        }
        const body = await c.req.json().catch(() => null)
        const parsed = UpdateRoomBodySchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }
        return c.json(RoomResponseSchema.parse({ room: engine.updateRoomMetadata(roomId, namespace, { ...room.metadata, ...parsed.data }) }))
    })

    app.get('/rooms/:id/messages', (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }
        const namespace = c.get('namespace')
        const roomId = c.req.param('id')
        const room = getRoom(engine, roomId, namespace)
        if (!room) {
            return c.json({ error: 'Room not found' }, 404)
        }
        const parsed = RoomMessageQuerySchema.safeParse(c.req.query())
        const limit = parsed.success ? (parsed.data.limit ?? 50) : 50
        const beforeSeq = parsed.success ? (parsed.data.beforeSeq ?? null) : null
        return c.json(RoomMessagesResponseSchema.parse(engine.getRoomMessagesPage(roomId, namespace, { limit, beforeSeq })))
    })

    app.post('/rooms/:id/messages', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }
        const namespace = c.get('namespace')
        const roomId = c.req.param('id')
        const room = getRoom(engine, roomId, namespace)
        if (!room) {
            return c.json({ error: 'Room not found' }, 404)
        }
        const body = await c.req.json().catch(() => null)
        const parsed = SendRoomMessageBodySchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }
        const message = await engine.sendRoomMessage(roomId, namespace, {
            senderType: 'user',
            senderId: 'web-user',
            content: {
                type: 'text',
                text: parsed.data.text,
                targetRoleKey: parsed.data.targetRoleKey,
                targetSessionId: parsed.data.targetSessionId,
            },
            forwardToAgent: parsed.data.forwardToAgent,
        })
        return c.json({ ok: true, message })
    })

    app.post('/rooms/:id/roles', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }
        const namespace = c.get('namespace')
        const roomId = c.req.param('id')
        const room = getRoom(engine, roomId, namespace)
        if (!room) {
            return c.json({ error: 'Room not found' }, 404)
        }
        const body = await c.req.json().catch(() => null)
        const parsed = CreateRoomRoleInputSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }
        return c.json(RoomResponseSchema.parse({ room: engine.addRoomRole(roomId, namespace, parsed.data) }))
    })

    app.patch('/rooms/:id/roles/:roleId', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }
        const namespace = c.get('namespace')
        const roomId = c.req.param('id')
        const room = getRoom(engine, roomId, namespace)
        if (!room) {
            return c.json({ error: 'Room not found' }, 404)
        }
        const role = room.state.roles.find((item) => item.id === c.req.param('roleId'))
        if (!role) {
            return c.json({ error: 'Role not found' }, 404)
        }
        const body = await c.req.json().catch(() => null)
        const parsed = CreateRoomRoleInputSchema.partial().safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }
        return c.json(RoomResponseSchema.parse({ room: engine.updateRoomRole(roomId, role.id, namespace, parsed.data) }))
    })

    app.post('/rooms/:id/roles/:roleId/assign-session', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }
        const namespace = c.get('namespace')
        const roomId = c.req.param('id')
        const room = getRoom(engine, roomId, namespace)
        if (!room) {
            return c.json({ error: 'Room not found' }, 404)
        }
        const role = room.state.roles.find((item) => item.id === c.req.param('roleId'))
        if (!role) {
            return c.json({ error: 'Role not found' }, 404)
        }
        const body = await c.req.json().catch(() => null)
        const parsed = AssignRoomRoleBodySchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }
        return c.json(RoomResponseSchema.parse({ room: await engine.assignRoomRoleToSession(roomId, role.id, parsed.data.sessionId, namespace) }))
    })

    app.post('/rooms/:id/roles/:roleId/spawn', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }
        const namespace = c.get('namespace')
        const roomId = c.req.param('id')
        const room = getRoom(engine, roomId, namespace)
        if (!room) {
            return c.json({ error: 'Room not found' }, 404)
        }
        const role = room.state.roles.find((item) => item.id === c.req.param('roleId'))
        if (!role) {
            return c.json({ error: 'Role not found' }, 404)
        }
        const body = await c.req.json().catch(() => null)
        const parsed = SpawnRoomRoleBodySchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        const spawn = await engine.spawnSession(
            parsed.data.machineId,
            parsed.data.directory,
            parsed.data.agent,
            parsed.data.model,
            parsed.data.yolo,
            parsed.data.sessionType,
            parsed.data.worktreeName,
        )
        if (spawn.type !== 'success') {
            return c.json({ error: spawn.message }, 409)
        }

        await engine.markSessionAsRoomSpawned(spawn.sessionId, roomId, namespace)
        const updatedRoom = await engine.assignRoomRoleToSession(roomId, role.id, spawn.sessionId, namespace)
        return c.json(SpawnRoomRoleResponseSchema.parse({ type: 'success', sessionId: spawn.sessionId, room: updatedRoom }))
    })

    app.delete('/rooms/:id/roles/:roleId/assignment', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }
        const namespace = c.get('namespace')
        const roomId = c.req.param('id')
        const room = getRoom(engine, roomId, namespace)
        if (!room) {
            return c.json({ error: 'Room not found' }, 404)
        }
        const role = room.state.roles.find((item) => item.id === c.req.param('roleId'))
        if (!role) {
            return c.json({ error: 'Role not found' }, 404)
        }
        return c.json(RoomResponseSchema.parse({ room: await engine.clearRoomRoleAssignment(roomId, role.id, namespace) }))
    })

    app.post('/rooms/:id/tasks', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }
        const namespace = c.get('namespace')
        const roomId = c.req.param('id')
        const room = getRoom(engine, roomId, namespace)
        if (!room) {
            return c.json({ error: 'Room not found' }, 404)
        }
        const body = await c.req.json().catch(() => null)
        const parsed = CreateRoomTaskBodySchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }
        return c.json(RoomResponseSchema.parse({ room: engine.createRoomTask(roomId, namespace, parsed.data) }))
    })

    app.patch('/rooms/:id/tasks/:taskId', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }
        const namespace = c.get('namespace')
        const roomId = c.req.param('id')
        const room = getRoom(engine, roomId, namespace)
        if (!room) {
            return c.json({ error: 'Room not found' }, 404)
        }
        const task = room.state.tasks.find((item) => item.id === c.req.param('taskId'))
        if (!task) {
            return c.json({ error: 'Task not found' }, 404)
        }
        const body = await c.req.json().catch(() => null)
        const parsed = UpdateRoomTaskBodySchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }
        return c.json(RoomResponseSchema.parse({ room: engine.updateRoomTask(roomId, task.id, namespace, parsed.data) }))
    })

    app.post('/rooms/:id/tasks/:taskId/assign', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }
        const namespace = c.get('namespace')
        const roomId = c.req.param('id')
        const room = getRoom(engine, roomId, namespace)
        if (!room) {
            return c.json({ error: 'Room not found' }, 404)
        }
        const task = room.state.tasks.find((item) => item.id === c.req.param('taskId'))
        if (!task) {
            return c.json({ error: 'Task not found' }, 404)
        }
        const body = await c.req.json().catch(() => null)
        const parsed = AssignRoomTaskBodySchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }
        return c.json(RoomResponseSchema.parse({ room: await engine.assignRoomTask(roomId, task.id, namespace, parsed.data) }))
    })

    app.post('/rooms/:id/tasks/:taskId/claim', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }
        const namespace = c.get('namespace')
        const roomId = c.req.param('id')
        const room = getRoom(engine, roomId, namespace)
        if (!room) {
            return c.json({ error: 'Room not found' }, 404)
        }
        const task = room.state.tasks.find((item) => item.id === c.req.param('taskId'))
        if (!task) {
            return c.json({ error: 'Task not found' }, 404)
        }
        const body = await c.req.json().catch(() => null)
        const parsed = ClaimRoomTaskBodySchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }
        return c.json(RoomResponseSchema.parse({ room: await engine.claimRoomTask(roomId, task.id, namespace, parsed.data) }))
    })

    app.post('/rooms/:id/tasks/:taskId/block', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }
        const namespace = c.get('namespace')
        const roomId = c.req.param('id')
        const room = getRoom(engine, roomId, namespace)
        if (!room) {
            return c.json({ error: 'Room not found' }, 404)
        }
        const task = room.state.tasks.find((item) => item.id === c.req.param('taskId'))
        if (!task) {
            return c.json({ error: 'Task not found' }, 404)
        }
        const body = await c.req.json().catch(() => null)
        const parsed = BlockRoomTaskBodySchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }
        return c.json(RoomResponseSchema.parse({ room: await engine.blockRoomTask(roomId, task.id, namespace, parsed.data) }))
    })

    app.post('/rooms/:id/tasks/:taskId/handoff', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }
        const namespace = c.get('namespace')
        const roomId = c.req.param('id')
        const room = getRoom(engine, roomId, namespace)
        if (!room) {
            return c.json({ error: 'Room not found' }, 404)
        }
        const task = room.state.tasks.find((item) => item.id === c.req.param('taskId'))
        if (!task) {
            return c.json({ error: 'Task not found' }, 404)
        }
        const body = await c.req.json().catch(() => null)
        const parsed = HandoffRoomTaskBodySchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }
        return c.json(RoomResponseSchema.parse({ room: await engine.handoffRoomTask(roomId, task.id, namespace, parsed.data) }))
    })

    app.post('/rooms/:id/tasks/:taskId/complete', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }
        const namespace = c.get('namespace')
        const roomId = c.req.param('id')
        const room = getRoom(engine, roomId, namespace)
        if (!room) {
            return c.json({ error: 'Room not found' }, 404)
        }
        const task = room.state.tasks.find((item) => item.id === c.req.param('taskId'))
        if (!task) {
            return c.json({ error: 'Task not found' }, 404)
        }
        const body = await c.req.json().catch(() => null)
        const parsed = CompleteRoomTaskBodySchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }
        return c.json(RoomResponseSchema.parse({ room: await engine.completeRoomTask(roomId, task.id, namespace, parsed.data) }))
    })
}
