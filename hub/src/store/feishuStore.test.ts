import { describe, expect, it } from 'bun:test'
import { Store } from './index'

describe('FeishuStore', () => {
    it('allows explicit null to clear active target fields', () => {
        const store = new Store(':memory:')

        store.feishu.upsertSessionState({
            openId: 'ou_1',
            namespace: 'default',
            activeSessionId: 'session-1',
            activeRoomId: 'room-1',
            activeTargetType: 'room',
            activeMachineId: 'machine-1',
            lastInboundMessageId: 'msg-1',
            lastInboundAt: 123,
            lastOutboundAt: 456,
        })

        store.feishu.upsertSessionState({
            openId: 'ou_1',
            namespace: 'default',
            activeSessionId: null,
            activeRoomId: null,
            activeTargetType: null,
        })

        expect(store.feishu.getSessionState('ou_1')).toMatchObject({
            activeSessionId: null,
            activeRoomId: null,
            activeTargetType: null,
            activeMachineId: 'machine-1',
            lastInboundMessageId: 'msg-1',
            lastInboundAt: 123,
            lastOutboundAt: 456,
        })
    })
})
