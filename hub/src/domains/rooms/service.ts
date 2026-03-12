import type { z } from 'zod'
import type { SyncEngine } from '../../sync/syncEngine'
import type { CreateRoomBodySchema } from '@hapi/protocol/contracts/rooms'

export function getRoom(engine: SyncEngine, roomId: string, namespace: string) {
    return engine.getRoomByNamespace(roomId, namespace) ?? null
}

export async function createRoomWithAssignments(
    engine: SyncEngine,
    namespace: string,
    input: z.infer<typeof CreateRoomBodySchema>,
) {
    const room = engine.createRoom(namespace, {
        metadata: {
            name: input.name,
            goal: input.goal,
            templateKey: input.templateKey,
            autoDispatch: input.autoDispatch,
            coordinatorRoleKey: input.coordinatorRoleKey,
            status: 'active',
        },
        roles: input.roles.map((role, index) => ({
            ...role,
            assignmentMode: role.assignmentMode ?? 'unassigned',
            sortOrder: role.sortOrder ?? index,
        })),
    })

    const spawnedSessionIds: string[] = []
    let currentRoom = room

    for (const role of currentRoom.state.roles) {
        const source = input.roles.find((item) => item.key === role.key)
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
                throw new Error(`Failed to spawn role ${role.label}: ${spawn.message}`)
            }
            await engine.markSessionAsRoomSpawned(spawn.sessionId, currentRoom.id, namespace)
            spawnedSessionIds.push(spawn.sessionId)
            currentRoom = engine.updateRoomRole(currentRoom.id, role.id, namespace, {
                assignedSessionId: spawn.sessionId,
            })
        }
    }

    return { room: currentRoom, spawnedSessionIds }
}
