import { describe, expect, it } from 'bun:test'
import type { Session } from '@agentchat/protocol/types'
import { planMachineSessionCleanup } from './machineMaintenance'
import { testProjectPath } from '@agentchat/protocol/testPaths'

function makeSession(overrides: Partial<Session> & { id: string }): Session {
    const { id, metadata, ...rest } = overrides
    return {
        id,
        namespace: 'default',
        seq: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        active: false,
        activeAt: Date.now(),
        metadata: {
            path: testProjectPath('project'),
            host: 'devbox',
            machineId: 'machine-1',
            ...metadata,
        },
        metadataVersion: 1,
        agentState: {},
        agentStateVersion: 1,
        thinking: false,
        thinkingAt: 0,
        ...rest
    }
}

describe('planMachineSessionCleanup', () => {
    it('keeps inactive session history instead of deleting it', () => {
        const sessions = [
            makeSession({ id: 'inactive-1', active: false }),
            makeSession({ id: 'inactive-2', active: false }),
        ]

        const result = planMachineSessionCleanup(sessions, new Map())

        expect(result.deletedSessionIds).toEqual([])
        expect(result.keptSessionIds).toEqual(['inactive-1', 'inactive-2'])
        expect(result.preservedInactiveSessionIds).toEqual(['inactive-1', 'inactive-2'])
    })

    it('keeps active sessions whose host process is alive', () => {
        const sessions = [
            makeSession({ id: 'live-runner', active: true, metadata: { path: testProjectPath('project'), host: 'devbox', machineId: 'machine-1', hostPid: 1234 } }),
        ]

        const result = planMachineSessionCleanup(sessions, new Map([[1234, true]]))

        expect(result.deletedSessionIds).toEqual([])
        expect(result.keptSessionIds).toEqual(['live-runner'])
    })

    it('deletes active sessions whose host process is gone but keeps unknown-pid sessions', () => {
        const sessions = [
            makeSession({ id: 'dead-process', active: true, metadata: { path: testProjectPath('project'), host: 'devbox', machineId: 'machine-1', hostPid: 4321 } }),
            makeSession({ id: 'unknown-pid', active: true, metadata: { path: testProjectPath('project'), host: 'devbox', machineId: 'machine-1' } }),
        ]

        const result = planMachineSessionCleanup(sessions, new Map([[4321, false]]))

        expect(result.deletedSessionIds).toEqual(['dead-process'])
        expect(result.deadProcessSessionIds).toEqual(['dead-process'])
        expect(result.keptSessionIds).toEqual(['unknown-pid'])
    })
})
