import type { SSESubscription, VisibilityState } from './types'

export const HEARTBEAT_STALE_MS = 90_000
export const HEARTBEAT_WATCHDOG_INTERVAL_MS = 10_000
export const RECONNECT_BASE_DELAY_MS = 1_000
export const RECONNECT_MAX_DELAY_MS = 30_000
export const RECONNECT_JITTER_MS = 500

export function getVisibilityState(): VisibilityState {
    if (typeof document === 'undefined') {
        return 'hidden'
    }
    return document.visibilityState === 'visible' ? 'visible' : 'hidden'
}

export function buildEventsUrl(
    baseUrl: string,
    token: string,
    subscription: SSESubscription,
    visibility: VisibilityState
): string {
    const params = new URLSearchParams()
    params.set('token', token)
    params.set('visibility', visibility)
    if (subscription.all) {
        params.set('all', 'true')
    }
    if (subscription.sessionId) {
        params.set('sessionId', subscription.sessionId)
    }
    if (subscription.machineId) {
        params.set('machineId', subscription.machineId)
    }
    if (subscription.roomId) {
        params.set('roomId', subscription.roomId)
    }

    const path = `/api/events?${params.toString()}`
    try {
        return new URL(path, baseUrl).toString()
    } catch {
        return path
    }
}
