import type { Database } from 'bun:sqlite'
import type { StoredFeishuEventReceipt, StoredFeishuMessageLink, StoredFeishuSessionState } from './types'

type DbFeishuSessionStateRow = {
    open_id: string
    namespace: string
    active_session_id: string | null
    active_room_id: string | null
    active_target_type: 'session' | 'room' | null
    active_machine_id: string | null
    last_inbound_message_id: string | null
    last_inbound_at: number | null
    last_outbound_at: number | null
    created_at: number
    updated_at: number
}

type DbFeishuMessageLinkRow = {
    feishu_message_id: string
    open_id: string
    namespace: string
    session_id: string | null
    room_id: string | null
    agentchat_message_id: string | null
    direction: 'inbound' | 'outbound'
    created_at: number
}

type DbFeishuEventReceiptRow = {
    event_id: string
    open_id: string
    namespace: string
    kind: 'menu'
    created_at: number
}

function toStoredFeishuSessionState(row: DbFeishuSessionStateRow): StoredFeishuSessionState {
    return {
        openId: row.open_id,
        namespace: row.namespace,
        activeSessionId: row.active_session_id,
        activeRoomId: row.active_room_id,
        activeTargetType: row.active_target_type,
        activeMachineId: row.active_machine_id,
        lastInboundMessageId: row.last_inbound_message_id,
        lastInboundAt: row.last_inbound_at,
        lastOutboundAt: row.last_outbound_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    }
}

function toStoredFeishuMessageLink(row: DbFeishuMessageLinkRow): StoredFeishuMessageLink {
    return {
        feishuMessageId: row.feishu_message_id,
        openId: row.open_id,
        namespace: row.namespace,
        sessionId: row.session_id,
        roomId: row.room_id,
        agentchatMessageId: row.agentchat_message_id,
        direction: row.direction,
        createdAt: row.created_at
    }
}

function toStoredFeishuEventReceipt(row: DbFeishuEventReceiptRow): StoredFeishuEventReceipt {
    return {
        eventId: row.event_id,
        openId: row.open_id,
        namespace: row.namespace,
        kind: row.kind,
        createdAt: row.created_at,
    }
}

export function getFeishuSessionState(db: Database, openId: string): StoredFeishuSessionState | null {
    const row = db.prepare(
        'SELECT * FROM feishu_session_states WHERE open_id = ? LIMIT 1'
    ).get(openId) as DbFeishuSessionStateRow | undefined
    return row ? toStoredFeishuSessionState(row) : null
}

export function upsertFeishuSessionState(
    db: Database,
    input: {
        openId: string
        namespace: string
        activeSessionId?: string | null
        activeRoomId?: string | null
        activeTargetType?: 'session' | 'room' | null
        activeMachineId?: string | null
        lastInboundMessageId?: string | null
        lastInboundAt?: number | null
        lastOutboundAt?: number | null
    }
): StoredFeishuSessionState {
    const now = Date.now()
    const existing = getFeishuSessionState(db, input.openId)
    db.prepare(`
        INSERT INTO feishu_session_states (
            open_id,
            namespace,
            active_session_id,
            active_room_id,
            active_target_type,
            active_machine_id,
            last_inbound_message_id,
            last_inbound_at,
            last_outbound_at,
            created_at,
            updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(open_id) DO UPDATE SET
            namespace = excluded.namespace,
            active_session_id = excluded.active_session_id,
            active_room_id = excluded.active_room_id,
            active_target_type = excluded.active_target_type,
            active_machine_id = excluded.active_machine_id,
            last_inbound_message_id = excluded.last_inbound_message_id,
            last_inbound_at = excluded.last_inbound_at,
            last_outbound_at = excluded.last_outbound_at,
            updated_at = excluded.updated_at
    `).run(
        input.openId,
        input.namespace,
        input.activeSessionId ?? existing?.activeSessionId ?? null,
        input.activeRoomId ?? existing?.activeRoomId ?? null,
        input.activeTargetType ?? existing?.activeTargetType ?? null,
        input.activeMachineId ?? existing?.activeMachineId ?? null,
        input.lastInboundMessageId ?? existing?.lastInboundMessageId ?? null,
        input.lastInboundAt ?? existing?.lastInboundAt ?? null,
        input.lastOutboundAt ?? existing?.lastOutboundAt ?? null,
        existing?.createdAt ?? now,
        now
    )
    const row = getFeishuSessionState(db, input.openId)
    if (!row) {
        throw new Error('Failed to upsert Feishu session state')
    }
    return row
}

export function hasFeishuMessageLink(db: Database, feishuMessageId: string): boolean {
    const row = db.prepare(
        'SELECT feishu_message_id FROM feishu_message_links WHERE feishu_message_id = ? LIMIT 1'
    ).get(feishuMessageId) as { feishu_message_id?: string } | undefined
    return Boolean(row?.feishu_message_id)
}

export function addFeishuMessageLink(
    db: Database,
    input: {
        feishuMessageId: string
        openId: string
        namespace: string
        sessionId?: string | null
        roomId?: string | null
        agentchatMessageId?: string | null
        direction: 'inbound' | 'outbound'
    }
): StoredFeishuMessageLink {
    const now = Date.now()
    db.prepare(`
        INSERT OR IGNORE INTO feishu_message_links (
            feishu_message_id,
            open_id,
            namespace,
            session_id,
            room_id,
            agentchat_message_id,
            direction,
            created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        input.feishuMessageId,
        input.openId,
        input.namespace,
        input.sessionId ?? null,
        input.roomId ?? null,
        input.agentchatMessageId ?? null,
        input.direction,
        now
    )
    const row = db.prepare(
        'SELECT * FROM feishu_message_links WHERE feishu_message_id = ? LIMIT 1'
    ).get(input.feishuMessageId) as DbFeishuMessageLinkRow | undefined
    if (!row) {
        throw new Error('Failed to add Feishu message link')
    }
    return toStoredFeishuMessageLink(row)
}


export function hasFeishuEventReceipt(db: Database, eventId: string): boolean {
    const row = db.prepare(
        'SELECT event_id FROM feishu_event_receipts WHERE event_id = ? LIMIT 1'
    ).get(eventId) as { event_id?: string } | undefined
    return Boolean(row?.event_id)
}

export function addFeishuEventReceipt(
    db: Database,
    input: {
        eventId: string
        openId: string
        namespace: string
        kind: 'menu'
    }
): StoredFeishuEventReceipt {
    const now = Date.now()
    db.prepare(`
        INSERT OR IGNORE INTO feishu_event_receipts (
            event_id,
            open_id,
            namespace,
            kind,
            created_at
        ) VALUES (?, ?, ?, ?, ?)
    `).run(
        input.eventId,
        input.openId,
        input.namespace,
        input.kind,
        now,
    )
    const row = db.prepare(
        'SELECT * FROM feishu_event_receipts WHERE event_id = ? LIMIT 1'
    ).get(input.eventId) as DbFeishuEventReceiptRow | undefined
    if (!row) {
        throw new Error('Failed to add Feishu event receipt')
    }
    return toStoredFeishuEventReceipt(row)
}
