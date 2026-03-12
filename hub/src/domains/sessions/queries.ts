import { toSessionSummary } from '@hapi/protocol'
import type { SyncEngine, Session } from '../../sync/syncEngine'

function getPendingCount(session: Session) {
    return session.agentState?.requests ? Object.keys(session.agentState.requests).length : 0
}

export function listSortedSessions(engine: SyncEngine, namespace: string) {
    return engine.getSessionsByNamespace(namespace)
        .sort((a, b) => {
            if (a.active !== b.active) {
                return a.active ? -1 : 1
            }
            const aPending = getPendingCount(a)
            const bPending = getPendingCount(b)
            if (a.active && aPending !== bPending) {
                return bPending - aPending
            }
            return b.updatedAt - a.updatedAt
        })
        .map(toSessionSummary)
}
