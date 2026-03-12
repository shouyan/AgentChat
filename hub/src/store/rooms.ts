import type { Database } from 'bun:sqlite'
import { randomUUID } from 'node:crypto'

import type { StoredRoom, StoredRoomMessage, StoredRoomRole, StoredRoomTask } from './types'
import { safeJsonParse } from './json'

type DbRoomRow = {
    id: string
    namespace: string
    created_at: number
    updated_at: number
    metadata: string | null
}

type DbRoomRoleRow = {
    id: string
    room_id: string
    namespace: string
    key: string
    label: string
    description: string | null
    required: number
    preferred_flavor: string | null
    preferred_model: string | null
    permission_mode: string | null
    assignment_mode: 'existing_session' | 'spawn_new' | 'unassigned'
    assigned_session_id: string | null
    spawn_config: string | null
    sort_order: number
    created_at: number
    updated_at: number
}

type DbRoomTaskRow = {
    id: string
    room_id: string
    namespace: string
    title: string
    description: string | null
    status: 'pending' | 'in_progress' | 'blocked' | 'completed'
    assignee_role_key: string | null
    assignee_session_id: string | null
    created_at: number
    updated_at: number
}

type DbRoomMessageRow = {
    id: string
    room_id: string
    namespace: string
    sender_type: 'user' | 'session' | 'system'
    sender_id: string
    role_key: string | null
    content: string
    created_at: number
    seq: number
}

function toStoredRoom(row: DbRoomRow): StoredRoom {
    return {
        id: row.id,
        namespace: row.namespace,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        metadata: safeJsonParse(row.metadata)
    }
}

function toStoredRoomRole(row: DbRoomRoleRow): StoredRoomRole {
    return {
        id: row.id,
        roomId: row.room_id,
        namespace: row.namespace,
        key: row.key,
        label: row.label,
        description: row.description,
        required: row.required === 1,
        preferredFlavor: row.preferred_flavor,
        preferredModel: row.preferred_model,
        permissionMode: row.permission_mode,
        assignmentMode: row.assignment_mode,
        assignedSessionId: row.assigned_session_id,
        spawnConfig: safeJsonParse(row.spawn_config),
        sortOrder: row.sort_order,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    }
}

function toStoredRoomTask(row: DbRoomTaskRow): StoredRoomTask {
    return {
        id: row.id,
        roomId: row.room_id,
        namespace: row.namespace,
        title: row.title,
        description: row.description,
        status: row.status,
        assigneeRoleKey: row.assignee_role_key,
        assigneeSessionId: row.assignee_session_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    }
}

function toStoredRoomMessage(row: DbRoomMessageRow): StoredRoomMessage {
    return {
        id: row.id,
        roomId: row.room_id,
        namespace: row.namespace,
        senderType: row.sender_type,
        senderId: row.sender_id,
        roleKey: row.role_key,
        content: safeJsonParse(row.content),
        createdAt: row.created_at,
        seq: row.seq
    }
}

export function createRoom(db: Database, metadata: unknown, namespace: string): StoredRoom {
    const now = Date.now()
    const id = randomUUID()
    db.prepare(`
        INSERT INTO rooms (id, namespace, created_at, updated_at, metadata)
        VALUES (@id, @namespace, @created_at, @updated_at, @metadata)
    `).run({
        id,
        namespace,
        created_at: now,
        updated_at: now,
        metadata: JSON.stringify(metadata)
    })

    const room = getRoomByNamespace(db, id, namespace)
    if (!room) {
        throw new Error('Failed to create room')
    }
    return room
}

export function updateRoomMetadata(db: Database, id: string, metadata: unknown, namespace: string): StoredRoom | null {
    const now = Date.now()
    const result = db.prepare(`
        UPDATE rooms
        SET metadata = @metadata,
            updated_at = @updated_at
        WHERE id = @id AND namespace = @namespace
    `).run({
        id,
        namespace,
        metadata: JSON.stringify(metadata),
        updated_at: now
    })

    if (result.changes < 1) {
        return null
    }

    return getRoomByNamespace(db, id, namespace)
}

export function getRoom(db: Database, id: string): StoredRoom | null {
    const row = db.prepare('SELECT * FROM rooms WHERE id = ?').get(id) as DbRoomRow | undefined
    return row ? toStoredRoom(row) : null
}

export function getRoomByNamespace(db: Database, id: string, namespace: string): StoredRoom | null {
    const row = db.prepare('SELECT * FROM rooms WHERE id = ? AND namespace = ?').get(id, namespace) as DbRoomRow | undefined
    return row ? toStoredRoom(row) : null
}

export function getRooms(db: Database): StoredRoom[] {
    const rows = db.prepare('SELECT * FROM rooms ORDER BY updated_at DESC').all() as DbRoomRow[]
    return rows.map(toStoredRoom)
}

export function getRoomsByNamespace(db: Database, namespace: string): StoredRoom[] {
    const rows = db.prepare('SELECT * FROM rooms WHERE namespace = ? ORDER BY updated_at DESC').all(namespace) as DbRoomRow[]
    return rows.map(toStoredRoom)
}

export function deleteRoom(db: Database, id: string, namespace: string): boolean {
    const result = db.prepare('DELETE FROM rooms WHERE id = ? AND namespace = ?').run(id, namespace)
    return result.changes > 0
}

export function createRoomRole(
    db: Database,
    roomId: string,
    namespace: string,
    role: {
        key: string
        label: string
        description?: string
        required?: boolean
        preferredFlavor?: string
        preferredModel?: string
        permissionMode?: string
        assignmentMode?: 'existing_session' | 'spawn_new' | 'unassigned'
        assignedSessionId?: string | null
        spawnConfig?: unknown
        sortOrder?: number
    }
): StoredRoomRole {
    const now = Date.now()
    const id = randomUUID()
    db.prepare(`
        INSERT INTO room_roles (
            id, room_id, namespace, key, label, description, required,
            preferred_flavor, preferred_model, permission_mode,
            assignment_mode, assigned_session_id, spawn_config,
            sort_order, created_at, updated_at
        ) VALUES (
            @id, @room_id, @namespace, @key, @label, @description, @required,
            @preferred_flavor, @preferred_model, @permission_mode,
            @assignment_mode, @assigned_session_id, @spawn_config,
            @sort_order, @created_at, @updated_at
        )
    `).run({
        id,
        room_id: roomId,
        namespace,
        key: role.key,
        label: role.label,
        description: role.description ?? null,
        required: role.required ? 1 : 0,
        preferred_flavor: role.preferredFlavor ?? null,
        preferred_model: role.preferredModel ?? null,
        permission_mode: role.permissionMode ?? null,
        assignment_mode: role.assignmentMode ?? 'unassigned',
        assigned_session_id: role.assignedSessionId ?? null,
        spawn_config: role.spawnConfig === undefined ? null : JSON.stringify(role.spawnConfig),
        sort_order: role.sortOrder ?? 0,
        created_at: now,
        updated_at: now
    })

    const created = getRoomRoleByNamespace(db, id, namespace)
    if (!created) {
        throw new Error('Failed to create room role')
    }
    touchRoom(db, roomId, namespace, now)
    return created
}

export function updateRoomRole(
    db: Database,
    roleId: string,
    roomId: string,
    namespace: string,
    patch: {
        label?: string
        description?: string | null
        required?: boolean
        preferredFlavor?: string | null
        preferredModel?: string | null
        permissionMode?: string | null
        assignmentMode?: 'existing_session' | 'spawn_new' | 'unassigned'
        assignedSessionId?: string | null
        spawnConfig?: unknown
        sortOrder?: number
    }
): StoredRoomRole | null {
    const existing = getRoomRoleByNamespace(db, roleId, namespace)
    if (!existing || existing.roomId !== roomId) {
        return null
    }
    const now = Date.now()
    db.prepare(`
        UPDATE room_roles
        SET label = @label,
            description = @description,
            required = @required,
            preferred_flavor = @preferred_flavor,
            preferred_model = @preferred_model,
            permission_mode = @permission_mode,
            assignment_mode = @assignment_mode,
            assigned_session_id = @assigned_session_id,
            spawn_config = @spawn_config,
            sort_order = @sort_order,
            updated_at = @updated_at
        WHERE id = @id AND namespace = @namespace
    `).run({
        id: roleId,
        namespace,
        label: patch.label ?? existing.label,
        description: patch.description !== undefined ? patch.description : existing.description,
        required: patch.required !== undefined ? (patch.required ? 1 : 0) : (existing.required ? 1 : 0),
        preferred_flavor: patch.preferredFlavor !== undefined ? patch.preferredFlavor : existing.preferredFlavor,
        preferred_model: patch.preferredModel !== undefined ? patch.preferredModel : existing.preferredModel,
        permission_mode: patch.permissionMode !== undefined ? patch.permissionMode : existing.permissionMode,
        assignment_mode: patch.assignmentMode ?? existing.assignmentMode,
        assigned_session_id: patch.assignedSessionId !== undefined ? patch.assignedSessionId : existing.assignedSessionId,
        spawn_config: patch.spawnConfig !== undefined
            ? (patch.spawnConfig === null ? null : JSON.stringify(patch.spawnConfig))
            : (existing.spawnConfig === null || existing.spawnConfig === undefined ? null : JSON.stringify(existing.spawnConfig)),
        sort_order: patch.sortOrder ?? existing.sortOrder,
        updated_at: now
    })
    touchRoom(db, roomId, namespace, now)
    return getRoomRoleByNamespace(db, roleId, namespace)
}

export function getRoomRoles(db: Database, roomId: string, namespace: string): StoredRoomRole[] {
    const rows = db.prepare(`
        SELECT * FROM room_roles
        WHERE room_id = ? AND namespace = ?
        ORDER BY sort_order ASC, created_at ASC
    `).all(roomId, namespace) as DbRoomRoleRow[]
    return rows.map(toStoredRoomRole)
}

export function getRoomRoleByNamespace(db: Database, id: string, namespace: string): StoredRoomRole | null {
    const row = db.prepare('SELECT * FROM room_roles WHERE id = ? AND namespace = ?').get(id, namespace) as DbRoomRoleRow | undefined
    return row ? toStoredRoomRole(row) : null
}

export function findRoomRoleByKey(db: Database, roomId: string, key: string, namespace: string): StoredRoomRole | null {
    const row = db.prepare('SELECT * FROM room_roles WHERE room_id = ? AND key = ? AND namespace = ? LIMIT 1').get(roomId, key, namespace) as DbRoomRoleRow | undefined
    return row ? toStoredRoomRole(row) : null
}

export function replaceRoomSessionReferences(
    db: Database,
    oldSessionId: string,
    newSessionId: string,
    namespace: string
): void {
    if (!oldSessionId || !newSessionId || oldSessionId === newSessionId) {
        return
    }

    const affectedRoomIds = new Set<string>()

    const roleRows = db.prepare(
        'SELECT DISTINCT room_id FROM room_roles WHERE assigned_session_id = ? AND namespace = ?'
    ).all(oldSessionId, namespace) as Array<{ room_id: string }>
    for (const row of roleRows) {
        affectedRoomIds.add(row.room_id)
    }

    const taskRows = db.prepare(
        'SELECT DISTINCT room_id FROM room_tasks WHERE assignee_session_id = ? AND namespace = ?'
    ).all(oldSessionId, namespace) as Array<{ room_id: string }>
    for (const row of taskRows) {
        affectedRoomIds.add(row.room_id)
    }

    db.prepare(
        'UPDATE room_roles SET assigned_session_id = ?, updated_at = ? WHERE assigned_session_id = ? AND namespace = ?'
    ).run(newSessionId, Date.now(), oldSessionId, namespace)

    db.prepare(
        'UPDATE room_tasks SET assignee_session_id = ?, updated_at = ? WHERE assignee_session_id = ? AND namespace = ?'
    ).run(newSessionId, Date.now(), oldSessionId, namespace)

    const touchedAt = Date.now()
    for (const roomId of affectedRoomIds) {
        touchRoom(db, roomId, namespace, touchedAt)
    }
}

export function clearRoomSessionReferences(
    db: Database,
    sessionId: string,
    namespace: string
): void {
    if (!sessionId) {
        return
    }

    const affectedRoomIds = new Set<string>()

    const roleRows = db.prepare(
        'SELECT DISTINCT room_id FROM room_roles WHERE assigned_session_id = ? AND namespace = ?'
    ).all(sessionId, namespace) as Array<{ room_id: string }>
    for (const row of roleRows) {
        affectedRoomIds.add(row.room_id)
    }

    const taskRows = db.prepare(
        'SELECT DISTINCT room_id FROM room_tasks WHERE assignee_session_id = ? AND namespace = ?'
    ).all(sessionId, namespace) as Array<{ room_id: string }>
    for (const row of taskRows) {
        affectedRoomIds.add(row.room_id)
    }

    const now = Date.now()
    db.prepare(
        'UPDATE room_roles SET assigned_session_id = NULL, updated_at = ? WHERE assigned_session_id = ? AND namespace = ?'
    ).run(now, sessionId, namespace)

    db.prepare(
        'UPDATE room_tasks SET assignee_session_id = NULL, updated_at = ? WHERE assignee_session_id = ? AND namespace = ?'
    ).run(now, sessionId, namespace)

    for (const roomId of affectedRoomIds) {
        touchRoom(db, roomId, namespace, now)
    }
}

export function createRoomTask(
    db: Database,
    roomId: string,
    namespace: string,
    task: {
        title: string
        description?: string
        status?: 'pending' | 'in_progress' | 'blocked' | 'completed'
        assigneeRoleKey?: string | null
        assigneeSessionId?: string | null
    }
): StoredRoomTask {
    const now = Date.now()
    const id = randomUUID()
    db.prepare(`
        INSERT INTO room_tasks (
            id, room_id, namespace, title, description, status,
            assignee_role_key, assignee_session_id, created_at, updated_at
        ) VALUES (
            @id, @room_id, @namespace, @title, @description, @status,
            @assignee_role_key, @assignee_session_id, @created_at, @updated_at
        )
    `).run({
        id,
        room_id: roomId,
        namespace,
        title: task.title,
        description: task.description ?? null,
        status: task.status ?? 'pending',
        assignee_role_key: task.assigneeRoleKey ?? null,
        assignee_session_id: task.assigneeSessionId ?? null,
        created_at: now,
        updated_at: now
    })
    touchRoom(db, roomId, namespace, now)
    const created = getRoomTask(db, roomId, id, namespace)
    if (!created) {
        throw new Error('Failed to create room task')
    }
    return created
}

export function updateRoomTask(
    db: Database,
    roomId: string,
    taskId: string,
    namespace: string,
    patch: {
        title?: string
        description?: string | null
        status?: 'pending' | 'in_progress' | 'blocked' | 'completed'
        assigneeRoleKey?: string | null
        assigneeSessionId?: string | null
    }
): StoredRoomTask | null {
    const existing = getRoomTask(db, roomId, taskId, namespace)
    if (!existing) {
        return null
    }
    const now = Date.now()
    db.prepare(`
        UPDATE room_tasks
        SET title = @title,
            description = @description,
            status = @status,
            assignee_role_key = @assignee_role_key,
            assignee_session_id = @assignee_session_id,
            updated_at = @updated_at
        WHERE id = @id AND room_id = @room_id AND namespace = @namespace
    `).run({
        id: taskId,
        room_id: roomId,
        namespace,
        title: patch.title ?? existing.title,
        description: patch.description !== undefined ? patch.description : existing.description,
        status: patch.status ?? existing.status,
        assignee_role_key: patch.assigneeRoleKey !== undefined ? patch.assigneeRoleKey : existing.assigneeRoleKey,
        assignee_session_id: patch.assigneeSessionId !== undefined ? patch.assigneeSessionId : existing.assigneeSessionId,
        updated_at: now
    })
    touchRoom(db, roomId, namespace, now)
    return getRoomTask(db, roomId, taskId, namespace)
}

export function getRoomTasks(db: Database, roomId: string, namespace: string): StoredRoomTask[] {
    const rows = db.prepare(`
        SELECT * FROM room_tasks
        WHERE room_id = ? AND namespace = ?
        ORDER BY created_at ASC
    `).all(roomId, namespace) as DbRoomTaskRow[]
    return rows.map(toStoredRoomTask)
}

export function getRoomTask(db: Database, roomId: string, taskId: string, namespace: string): StoredRoomTask | null {
    const row = db.prepare(`
        SELECT * FROM room_tasks WHERE room_id = ? AND id = ? AND namespace = ? LIMIT 1
    `).get(roomId, taskId, namespace) as DbRoomTaskRow | undefined
    return row ? toStoredRoomTask(row) : null
}

export function addRoomMessage(
    db: Database,
    roomId: string,
    namespace: string,
    payload: {
        senderType: 'user' | 'session' | 'system'
        senderId: string
        roleKey?: string | null
        content: unknown
    }
): StoredRoomMessage {
    const now = Date.now()
    const id = randomUUID()
    const row = db.prepare(
        'SELECT COALESCE(MAX(seq), 0) + 1 AS nextSeq FROM room_messages WHERE room_id = ?'
    ).get(roomId) as { nextSeq: number }
    const seq = row.nextSeq
    db.prepare(`
        INSERT INTO room_messages (
            id, room_id, namespace, sender_type, sender_id, role_key, content, created_at, seq
        ) VALUES (
            @id, @room_id, @namespace, @sender_type, @sender_id, @role_key, @content, @created_at, @seq
        )
    `).run({
        id,
        room_id: roomId,
        namespace,
        sender_type: payload.senderType,
        sender_id: payload.senderId,
        role_key: payload.roleKey ?? null,
        content: JSON.stringify(payload.content),
        created_at: now,
        seq
    })
    touchRoom(db, roomId, namespace, now)
    const created = db.prepare('SELECT * FROM room_messages WHERE id = ?').get(id) as DbRoomMessageRow | undefined
    if (!created) {
        throw new Error('Failed to create room message')
    }
    return toStoredRoomMessage(created)
}

export function getRoomMessages(
    db: Database,
    roomId: string,
    namespace: string,
    limit: number = 200,
    beforeSeq?: number
): StoredRoomMessage[] {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(200, limit)) : 200
    const rows = (beforeSeq !== undefined && beforeSeq !== null)
        ? db.prepare(`
            SELECT * FROM room_messages
            WHERE room_id = ? AND namespace = ? AND seq < ?
            ORDER BY seq DESC LIMIT ?
        `).all(roomId, namespace, beforeSeq, safeLimit) as DbRoomMessageRow[]
        : db.prepare(`
            SELECT * FROM room_messages
            WHERE room_id = ? AND namespace = ?
            ORDER BY seq DESC LIMIT ?
        `).all(roomId, namespace, safeLimit) as DbRoomMessageRow[]

    return rows.reverse().map(toStoredRoomMessage)
}

export function touchRoom(db: Database, roomId: string, namespace: string, updatedAt: number = Date.now()): void {
    db.prepare(`
        UPDATE rooms SET updated_at = CASE WHEN updated_at > @updated_at THEN updated_at ELSE @updated_at END
        WHERE id = @id AND namespace = @namespace
    `).run({ id: roomId, namespace, updated_at: updatedAt })
}
