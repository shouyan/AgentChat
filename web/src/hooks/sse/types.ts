import type { Session, SyncEvent } from '@/types/api'

export type SSESubscription = {
    all?: boolean
    sessionId?: string
    machineId?: string
    roomId?: string
}

export type VisibilityState = 'visible' | 'hidden'

export type ToastEvent = Extract<SyncEvent, { type: 'toast' }>

export type SessionPatch = Partial<Pick<Session, 'active' | 'thinking' | 'activeAt' | 'updatedAt' | 'permissionMode' | 'modelMode'>>
