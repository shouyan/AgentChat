import type { Session } from '@agentchat/protocol/types'

export function planMachineSessionCleanup(
    sessions: Session[],
    aliveByPid: Map<number, boolean>
): {
    deletedSessionIds: string[]
    keptSessionIds: string[]
    preservedInactiveSessionIds: string[]
    deadProcessSessionIds: string[]
} {
    const deletedSessionIds: string[] = []
    const keptSessionIds: string[] = []
    const preservedInactiveSessionIds: string[] = []
    const deadProcessSessionIds: string[] = []

    for (const session of sessions) {
        if (!session.active) {
            keptSessionIds.push(session.id)
            preservedInactiveSessionIds.push(session.id)
            continue
        }

        const hostPid = typeof session.metadata?.hostPid === 'number' ? session.metadata.hostPid : null
        if (hostPid !== null && aliveByPid.get(hostPid) === false) {
            deletedSessionIds.push(session.id)
            deadProcessSessionIds.push(session.id)
            continue
        }

        keptSessionIds.push(session.id)
    }

    return {
        deletedSessionIds,
        keptSessionIds,
        preservedInactiveSessionIds,
        deadProcessSessionIds,
    }
}
