import { Hono, type Context } from 'hono'
import { z } from 'zod'
import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { requireSyncEngine } from './guards'

const roomRoleSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  required: z.boolean().optional(),
  preferredFlavor: z.enum(['claude', 'codex', 'cursor', 'gemini', 'opencode']).optional(),
  preferredModel: z.string().optional(),
  permissionMode: z.string().optional(),
  assignmentMode: z.enum(['existing_session', 'spawn_new', 'unassigned']).optional(),
  assignedSessionId: z.string().nullable().optional(),
  spawnConfig: z.object({
    machineId: z.string().optional(),
    flavor: z.enum(['claude', 'codex', 'cursor', 'gemini', 'opencode']).optional(),
    model: z.string().optional(),
    path: z.string().optional(),
    permissionMode: z.string().optional(),
    yolo: z.boolean().optional(),
    sessionType: z.enum(['simple', 'worktree']).optional(),
    worktreeName: z.string().optional(),
  }).optional(),
  sortOrder: z.number().int().optional(),
})

const createRoomSchema = z.object({
  name: z.string().min(1).max(255),
  goal: z.string().optional(),
  templateKey: z.string().optional(),
  autoDispatch: z.boolean().optional(),
  coordinatorRoleKey: z.string().optional(),
  roles: z.array(roomRoleSchema).default([]),
})

const updateRoomSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  goal: z.string().optional(),
  templateKey: z.string().optional(),
  autoDispatch: z.boolean().optional(),
  coordinatorRoleKey: z.string().optional(),
  roleTemplates: z.array(z.object({
    key: z.string().min(1),
    label: z.string().min(1),
    description: z.string().optional(),
    roles: z.array(z.object({
      key: z.string().min(1),
      label: z.string().min(1),
      description: z.string().optional(),
      required: z.boolean().optional(),
      preferredFlavor: z.enum(['claude', 'codex', 'cursor', 'gemini', 'opencode']).optional(),
      preferredModel: z.string().optional(),
      permissionMode: z.string().optional(),
      sortOrder: z.number().int().optional(),
    })).default([]),
  })).optional(),
  status: z.enum(['active', 'archived']).optional(),
})

const roomMessageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  beforeSeq: z.coerce.number().int().min(1).optional(),
})

const roomMessageSchema = z.object({
  text: z.string().min(1),
  targetRoleKey: z.string().optional(),
  targetSessionId: z.string().optional(),
  forwardToAgent: z.boolean().optional(),
})

const assignRoleSchema = z.object({
  sessionId: z.string().min(1),
})

const spawnRoleSchema = z.object({
  machineId: z.string().min(1),
  directory: z.string().min(1),
  agent: z.enum(['claude', 'codex', 'cursor', 'gemini', 'opencode']).optional(),
  model: z.string().optional(),
  yolo: z.boolean().optional(),
  sessionType: z.enum(['simple', 'worktree']).optional(),
  worktreeName: z.string().optional(),
})

const createTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(['pending', 'in_progress', 'blocked', 'completed']).optional(),
  assigneeRoleKey: z.string().optional(),
  assigneeSessionId: z.string().nullable().optional(),
})

const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(['pending', 'in_progress', 'blocked', 'completed']).optional(),
  assigneeRoleKey: z.string().nullable().optional(),
  assigneeSessionId: z.string().nullable().optional(),
})

const assignTaskSchema = z.object({
  assigneeRoleKey: z.string().nullable(),
  note: z.string().optional(),
  actorRoleKey: z.string().optional(),
})

const claimTaskSchema = z.object({
  roleKey: z.string().optional(),
  note: z.string().optional(),
})

const blockTaskSchema = z.object({
  roleKey: z.string().optional(),
  reason: z.string().min(1),
})

const handoffTaskSchema = z.object({
  fromRoleKey: z.string().optional(),
  toRoleKey: z.string().min(1),
  note: z.string().optional(),
})

const completeTaskSchema = z.object({
  roleKey: z.string().optional(),
  summary: z.string().optional(),
})

function requireRoom(engine: SyncEngine, roomId: string, namespace: string, c: Context<WebAppEnv>) {
  const room = engine.getRoomByNamespace(roomId, namespace)
  if (!room) {
    return c.json({ error: 'Room not found' }, 404)
  }
  return room
}

export function createRoomsRoutes(getSyncEngine: () => SyncEngine | null): Hono<WebAppEnv> {
  const app = new Hono<WebAppEnv>()

  app.get('/rooms', (c) => {
    const engine = requireSyncEngine(c, getSyncEngine)
    if (engine instanceof Response) {
      return engine
    }
    const namespace = c.get('namespace')
    return c.json({ rooms: engine.getRoomsByNamespace(namespace) })
  })

  app.post('/rooms', async (c) => {
    const engine = requireSyncEngine(c, getSyncEngine)
    if (engine instanceof Response) {
      return engine
    }
    const namespace = c.get('namespace')
    const body = await c.req.json().catch(() => null)
    const parsed = createRoomSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Invalid body' }, 400)
    }

    const room = engine.createRoom(namespace, {
      metadata: {
        name: parsed.data.name,
        goal: parsed.data.goal,
        templateKey: parsed.data.templateKey,
        autoDispatch: parsed.data.autoDispatch,
        coordinatorRoleKey: parsed.data.coordinatorRoleKey,
        status: 'active',
      },
      roles: parsed.data.roles.map((role, index) => ({
        ...role,
        assignmentMode: role.assignmentMode ?? 'unassigned',
        sortOrder: role.sortOrder ?? index,
      })),
    })

    const spawnedSessionIds: string[] = []
    let currentRoom = room

    for (const role of currentRoom.state.roles) {
      const source = parsed.data.roles.find((item) => item.key === role.key)
      if (!source) continue

      if (source.assignedSessionId) {
        currentRoom = await engine.assignRoomRoleToSession(currentRoom.id, role.id, source.assignedSessionId, namespace)
        continue
      }

      if (source.assignmentMode === 'spawn_new' && source.spawnConfig?.machineId && source.spawnConfig?.path) {
        const spawn = await engine.spawnSession(
          source.spawnConfig.machineId,
          source.spawnConfig.path,
          source.spawnConfig.flavor,
          source.spawnConfig.model,
          source.spawnConfig.yolo,
          source.spawnConfig.sessionType,
          source.spawnConfig.worktreeName,
        )
        if (spawn.type !== 'success') {
          return c.json({ error: `Failed to spawn role ${role.label}: ${spawn.message}` }, 409)
        }
        await engine.markSessionAsRoomSpawned(spawn.sessionId, currentRoom.id, namespace)
        spawnedSessionIds.push(spawn.sessionId)
        currentRoom = engine.updateRoomRole(currentRoom.id, role.id, namespace, {
          assignedSessionId: spawn.sessionId,
        })
      }
    }

    return c.json({ room: currentRoom, spawnedSessionIds })
  })

  app.get('/rooms/:id', (c) => {
    const engine = requireSyncEngine(c, getSyncEngine)
    if (engine instanceof Response) {
      return engine
    }
    const namespace = c.get('namespace')
    const room = requireRoom(engine, c.req.param('id'), namespace, c)
    if (room instanceof Response) {
      return room
    }
    return c.json({ room })
  })

  app.delete('/rooms/:id', async (c) => {
    const engine = requireSyncEngine(c, getSyncEngine)
    if (engine instanceof Response) {
      return engine
    }
    const namespace = c.get('namespace')
    const roomId = c.req.param('id')
    const room = requireRoom(engine, roomId, namespace, c)
    if (room instanceof Response) {
      return room
    }

    try {
      const result = await engine.deleteRoom(roomId, namespace)
      return c.json({ ok: true, deletedSessionIds: result.deletedSessionIds })
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
    const room = requireRoom(engine, roomId, namespace, c)
    if (room instanceof Response) {
      return room
    }
    const body = await c.req.json().catch(() => null)
    const parsed = updateRoomSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Invalid body' }, 400)
    }
    return c.json({
      room: engine.updateRoomMetadata(roomId, namespace, {
        ...room.metadata,
        ...parsed.data,
      })
    })
  })

  app.get('/rooms/:id/messages', (c) => {
    const engine = requireSyncEngine(c, getSyncEngine)
    if (engine instanceof Response) {
      return engine
    }
    const namespace = c.get('namespace')
    const roomId = c.req.param('id')
    const room = requireRoom(engine, roomId, namespace, c)
    if (room instanceof Response) {
      return room
    }
    const parsed = roomMessageQuerySchema.safeParse(c.req.query())
    const limit = parsed.success ? (parsed.data.limit ?? 50) : 50
    const beforeSeq = parsed.success ? (parsed.data.beforeSeq ?? null) : null
    return c.json(engine.getRoomMessagesPage(roomId, namespace, { limit, beforeSeq }))
  })

  app.post('/rooms/:id/messages', async (c) => {
    const engine = requireSyncEngine(c, getSyncEngine)
    if (engine instanceof Response) {
      return engine
    }
    const namespace = c.get('namespace')
    const roomId = c.req.param('id')
    const room = requireRoom(engine, roomId, namespace, c)
    if (room instanceof Response) {
      return room
    }
    const body = await c.req.json().catch(() => null)
    const parsed = roomMessageSchema.safeParse(body)
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
    const room = requireRoom(engine, roomId, namespace, c)
    if (room instanceof Response) {
      return room
    }
    const body = await c.req.json().catch(() => null)
    const parsed = roomRoleSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Invalid body' }, 400)
    }
    return c.json({ room: engine.addRoomRole(roomId, namespace, parsed.data) })
  })

  app.patch('/rooms/:id/roles/:roleId', async (c) => {
    const engine = requireSyncEngine(c, getSyncEngine)
    if (engine instanceof Response) {
      return engine
    }
    const namespace = c.get('namespace')
    const roomId = c.req.param('id')
    const room = requireRoom(engine, roomId, namespace, c)
    if (room instanceof Response) {
      return room
    }
    const role = room.state.roles.find((item) => item.id === c.req.param('roleId'))
    if (!role) {
      return c.json({ error: 'Role not found' }, 404)
    }
    const body = await c.req.json().catch(() => null)
    const parsed = roomRoleSchema.partial().safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Invalid body' }, 400)
    }
    return c.json({ room: engine.updateRoomRole(roomId, role.id, namespace, parsed.data) })
  })

  app.post('/rooms/:id/roles/:roleId/assign-session', async (c) => {
    const engine = requireSyncEngine(c, getSyncEngine)
    if (engine instanceof Response) {
      return engine
    }
    const namespace = c.get('namespace')
    const roomId = c.req.param('id')
    const room = requireRoom(engine, roomId, namespace, c)
    if (room instanceof Response) {
      return room
    }
    const role = room.state.roles.find((item) => item.id === c.req.param('roleId'))
    if (!role) {
      return c.json({ error: 'Role not found' }, 404)
    }
    const body = await c.req.json().catch(() => null)
    const parsed = assignRoleSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Invalid body' }, 400)
    }
    return c.json({ room: await engine.assignRoomRoleToSession(roomId, role.id, parsed.data.sessionId, namespace) })
  })

  app.post('/rooms/:id/roles/:roleId/spawn', async (c) => {
    const engine = requireSyncEngine(c, getSyncEngine)
    if (engine instanceof Response) {
      return engine
    }
    const namespace = c.get('namespace')
    const roomId = c.req.param('id')
    const room = requireRoom(engine, roomId, namespace, c)
    if (room instanceof Response) {
      return room
    }
    const role = room.state.roles.find((item) => item.id === c.req.param('roleId'))
    if (!role) {
      return c.json({ error: 'Role not found' }, 404)
    }
    const body = await c.req.json().catch(() => null)
    const parsed = spawnRoleSchema.safeParse(body)
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
      return c.json(spawn, 409)
    }
    await engine.markSessionAsRoomSpawned(spawn.sessionId, roomId, namespace)
    const updatedRoom = engine.updateRoomRole(roomId, role.id, namespace, {
      assignmentMode: 'spawn_new',
      assignedSessionId: spawn.sessionId,
      spawnConfig: {
        machineId: parsed.data.machineId,
        flavor: parsed.data.agent,
        model: parsed.data.model,
        path: parsed.data.directory,
        yolo: parsed.data.yolo,
        sessionType: parsed.data.sessionType,
        worktreeName: parsed.data.worktreeName,
      }
    })
    return c.json({ type: 'success', sessionId: spawn.sessionId, room: updatedRoom })
  })

  app.delete('/rooms/:id/roles/:roleId/assignment', async (c) => {
    const engine = requireSyncEngine(c, getSyncEngine)
    if (engine instanceof Response) {
      return engine
    }
    const namespace = c.get('namespace')
    const roomId = c.req.param('id')
    const room = requireRoom(engine, roomId, namespace, c)
    if (room instanceof Response) {
      return room
    }
    const role = room.state.roles.find((item) => item.id === c.req.param('roleId'))
    if (!role) {
      return c.json({ error: 'Role not found' }, 404)
    }
    return c.json({ room: await engine.clearRoomRoleAssignment(roomId, role.id, namespace) })
  })

  app.post('/rooms/:id/tasks', async (c) => {
    const engine = requireSyncEngine(c, getSyncEngine)
    if (engine instanceof Response) {
      return engine
    }
    const namespace = c.get('namespace')
    const roomId = c.req.param('id')
    const room = requireRoom(engine, roomId, namespace, c)
    if (room instanceof Response) {
      return room
    }
    const body = await c.req.json().catch(() => null)
    const parsed = createTaskSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Invalid body' }, 400)
    }
    return c.json({ room: engine.createRoomTask(roomId, namespace, parsed.data) })
  })

  app.patch('/rooms/:id/tasks/:taskId', async (c) => {
    const engine = requireSyncEngine(c, getSyncEngine)
    if (engine instanceof Response) {
      return engine
    }
    const namespace = c.get('namespace')
    const roomId = c.req.param('id')
    const room = requireRoom(engine, roomId, namespace, c)
    if (room instanceof Response) {
      return room
    }
    const body = await c.req.json().catch(() => null)
    const parsed = updateTaskSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Invalid body' }, 400)
    }
    return c.json({ room: engine.updateRoomTask(roomId, c.req.param('taskId'), namespace, parsed.data) })
  })

  app.post('/rooms/:id/tasks/:taskId/assign', async (c) => {
    const engine = requireSyncEngine(c, getSyncEngine)
    if (engine instanceof Response) {
      return engine
    }
    const namespace = c.get('namespace')
    const roomId = c.req.param('id')
    const room = requireRoom(engine, roomId, namespace, c)
    if (room instanceof Response) {
      return room
    }
    const task = room.state.tasks.find((item) => item.id === c.req.param('taskId'))
    if (!task) {
      return c.json({ error: 'Task not found' }, 404)
    }
    const body = await c.req.json().catch(() => null)
    const parsed = assignTaskSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Invalid body' }, 400)
    }
    return c.json({ room: await engine.assignRoomTask(roomId, task.id, namespace, parsed.data) })
  })

  app.post('/rooms/:id/tasks/:taskId/claim', async (c) => {
    const engine = requireSyncEngine(c, getSyncEngine)
    if (engine instanceof Response) {
      return engine
    }
    const namespace = c.get('namespace')
    const roomId = c.req.param('id')
    const room = requireRoom(engine, roomId, namespace, c)
    if (room instanceof Response) {
      return room
    }
    const task = room.state.tasks.find((item) => item.id === c.req.param('taskId'))
    if (!task) {
      return c.json({ error: 'Task not found' }, 404)
    }
    const body = await c.req.json().catch(() => null)
    const parsed = claimTaskSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Invalid body' }, 400)
    }
    return c.json({ room: await engine.claimRoomTask(roomId, task.id, namespace, parsed.data) })
  })

  app.post('/rooms/:id/tasks/:taskId/block', async (c) => {
    const engine = requireSyncEngine(c, getSyncEngine)
    if (engine instanceof Response) {
      return engine
    }
    const namespace = c.get('namespace')
    const roomId = c.req.param('id')
    const room = requireRoom(engine, roomId, namespace, c)
    if (room instanceof Response) {
      return room
    }
    const task = room.state.tasks.find((item) => item.id === c.req.param('taskId'))
    if (!task) {
      return c.json({ error: 'Task not found' }, 404)
    }
    const body = await c.req.json().catch(() => null)
    const parsed = blockTaskSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Invalid body' }, 400)
    }
    return c.json({ room: await engine.blockRoomTask(roomId, task.id, namespace, parsed.data) })
  })

  app.post('/rooms/:id/tasks/:taskId/handoff', async (c) => {
    const engine = requireSyncEngine(c, getSyncEngine)
    if (engine instanceof Response) {
      return engine
    }
    const namespace = c.get('namespace')
    const roomId = c.req.param('id')
    const room = requireRoom(engine, roomId, namespace, c)
    if (room instanceof Response) {
      return room
    }
    const task = room.state.tasks.find((item) => item.id === c.req.param('taskId'))
    if (!task) {
      return c.json({ error: 'Task not found' }, 404)
    }
    const body = await c.req.json().catch(() => null)
    const parsed = handoffTaskSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Invalid body' }, 400)
    }
    return c.json({ room: await engine.handoffRoomTask(roomId, task.id, namespace, parsed.data) })
  })

  app.post('/rooms/:id/tasks/:taskId/complete', async (c) => {
    const engine = requireSyncEngine(c, getSyncEngine)
    if (engine instanceof Response) {
      return engine
    }
    const namespace = c.get('namespace')
    const roomId = c.req.param('id')
    const room = requireRoom(engine, roomId, namespace, c)
    if (room instanceof Response) {
      return room
    }
    const task = room.state.tasks.find((item) => item.id === c.req.param('taskId'))
    if (!task) {
      return c.json({ error: 'Task not found' }, 404)
    }
    const body = await c.req.json().catch(() => null)
    const parsed = completeTaskSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Invalid body' }, 400)
    }
    return c.json({ room: await engine.completeRoomTask(roomId, task.id, namespace, parsed.data) })
  })

  return app
}
