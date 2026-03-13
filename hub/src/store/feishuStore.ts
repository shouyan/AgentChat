import type { Database } from 'bun:sqlite'
import type { StoredFeishuEventReceipt, StoredFeishuMessageLink, StoredFeishuSessionState } from './types'
import {
    addFeishuEventReceipt,
    addFeishuMessageLink,
    getFeishuSessionState,
    hasFeishuEventReceipt,
    hasFeishuMessageLink,
    upsertFeishuSessionState,
} from './feishu'

export class FeishuStore {
    private readonly db: Database

    constructor(db: Database) {
        this.db = db
    }

    getSessionState(openId: string): StoredFeishuSessionState | null {
        return getFeishuSessionState(this.db, openId)
    }

    upsertSessionState(input: {
        openId: string
        namespace: string
        activeSessionId?: string | null
        activeRoomId?: string | null
        activeTargetType?: 'session' | 'room' | null
        activeMachineId?: string | null
        lastInboundMessageId?: string | null
        lastInboundAt?: number | null
        lastOutboundAt?: number | null
    }): StoredFeishuSessionState {
        return upsertFeishuSessionState(this.db, input)
    }

    hasMessageLink(feishuMessageId: string): boolean {
        return hasFeishuMessageLink(this.db, feishuMessageId)
    }

    addMessageLink(input: {
        feishuMessageId: string
        openId: string
        namespace: string
        sessionId?: string | null
        roomId?: string | null
        agentchatMessageId?: string | null
        direction: 'inbound' | 'outbound'
    }): StoredFeishuMessageLink {
        return addFeishuMessageLink(this.db, input)
    }

    hasEventReceipt(eventId: string): boolean {
        return hasFeishuEventReceipt(this.db, eventId)
    }

    addEventReceipt(input: {
        eventId: string
        openId: string
        namespace: string
        kind: 'menu'
    }): StoredFeishuEventReceipt {
        return addFeishuEventReceipt(this.db, input)
    }

}
