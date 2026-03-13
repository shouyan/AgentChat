import { describe, expect, it } from 'bun:test'
import type { Session } from '@agentchat/protocol/types'
import { Store } from '../store'
import type { EventPublisher } from './eventPublisher'
import type { MessageService } from './messageService'
import { RoomService } from './roomService'

function createPublisher(): EventPublisher {
    return {
        emit: () => {},
    } as unknown as EventPublisher
}

function createMessageService(): MessageService {
    return {
        sendMessage: async () => {},
    } as unknown as MessageService
}

function createSessionResolver(store: Store) {
    return (sessionId: string, namespace: string): Session | undefined => {
        const stored = store.sessions.getSessionByNamespace(sessionId, namespace)
        if (!stored) {
            return undefined
        }

        return {
            id: stored.id,
            namespace: stored.namespace,
            seq: stored.seq,
            createdAt: stored.createdAt,
            updatedAt: stored.updatedAt,
            active: stored.active,
            activeAt: stored.activeAt ?? stored.createdAt,
            metadata: (stored.metadata ?? null) as Session['metadata'],
            metadataVersion: stored.metadataVersion,
            agentState: null,
            agentStateVersion: stored.agentStateVersion,
            thinking: false,
            thinkingAt: 0,
        }
    }
}

describe('RoomService role assignment lifecycle', () => {
    it('clears stale spawn config and detaches the previous room child when rebinding a role', async () => {
        const store = new Store(':memory:')
        const cleaned: Array<{ sessionId: string; roomId: string }> = []
        const roomService = new RoomService(
            store,
            createPublisher(),
            createMessageService(),
            createSessionResolver(store),
            async (sessionId, _namespace, roomId) => {
                cleaned.push({ sessionId, roomId })
            }
        )

        const previousSession = store.sessions.getOrCreateSession('room-child', { path: '/child', host: 'localhost' }, null, 'default')
        const existingSession = store.sessions.getOrCreateSession('direct-session', { path: '/direct', host: 'localhost' }, null, 'default')
        const room = roomService.createRoom('default', {
            metadata: { name: 'Test room', status: 'active' },
            roles: [{
                key: 'dev',
                label: 'Developer',
                assignmentMode: 'spawn_new',
                assignedSessionId: previousSession.id,
                spawnConfig: {
                    machineId: 'machine-1',
                    path: '/repo',
                },
            }],
        })

        const role = room.state.roles[0]
        const updatedRoom = await roomService.assignRoleToSession(room.id, role.id, existingSession.id, 'default')
        const updatedRole = updatedRoom.state.roles[0]

        expect(updatedRole.assignmentMode).toBe('existing_session')
        expect(updatedRole.assignedSessionId).toBe(existingSession.id)
        expect(updatedRole.spawnConfig).toBeUndefined()
        expect(cleaned).toEqual([{ sessionId: previousSession.id, roomId: room.id }])
    })

    it('detaches room-linked metadata when clearing a spawned role assignment', async () => {
        const store = new Store(':memory:')
        const cleaned: Array<{ sessionId: string; roomId: string }> = []
        const roomService = new RoomService(
            store,
            createPublisher(),
            createMessageService(),
            createSessionResolver(store),
            async (sessionId, _namespace, roomId) => {
                cleaned.push({ sessionId, roomId })
            }
        )

        const childSession = store.sessions.getOrCreateSession(
            'room-child',
            { path: '/child', host: 'localhost', roomSpawned: true },
            null,
            'default'
        )
        const room = roomService.createRoom('default', {
            metadata: { name: 'Test room', status: 'active' },
            roles: [{
                key: 'dev',
                label: 'Developer',
                assignmentMode: 'spawn_new',
                assignedSessionId: childSession.id,
                spawnConfig: {
                    machineId: 'machine-1',
                    path: '/repo',
                },
            }],
        })

        const role = room.state.roles[0]
        const updatedRoom = await roomService.clearRoleAssignment(room.id, role.id, 'default')
        const updatedRole = updatedRoom.state.roles[0]

        expect(updatedRole.assignmentMode).toBe('unassigned')
        expect(updatedRole.assignedSessionId).toBeNull()
        expect(cleaned).toEqual([{ sessionId: childSession.id, roomId: room.id }])
    })
})
