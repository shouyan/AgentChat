import type { Store } from '../../store'
import type { FeishuRepositoryLike } from './types'

export class FeishuRepository implements FeishuRepositoryLike {
    constructor(
        private readonly store: Store,
        private readonly options: {
            allowOpenIds: string[]
            envBindings: Record<string, string>
            defaultNamespace: string
        }
    ) {
    }

    isOpenIdAllowed(openId: string): boolean {
        if (this.options.allowOpenIds.length === 0) {
            return true
        }
        return this.options.allowOpenIds.includes(openId)
    }

    resolveNamespaceForOpenId(openId: string): string | null {
        const fromEnv = this.options.envBindings[openId]
        if (fromEnv) {
            return fromEnv
        }
        const fromStore = this.store.users.getUser('feishu', openId)
        return fromStore?.namespace ?? this.options.defaultNamespace
    }

    hasInboundMessage(messageId: string): boolean {
        return this.store.feishu.hasMessageLink(messageId)
    }

    recordInboundMessage(input: {
        messageId: string
        openId: string
        namespace: string
        sessionId?: string | null
        roomId?: string | null
    }): void {
        this.store.feishu.addMessageLink({
            feishuMessageId: input.messageId,
            openId: input.openId,
            namespace: input.namespace,
            sessionId: input.sessionId ?? null,
            roomId: input.roomId ?? null,
            direction: 'inbound'
        })
    }


    hasMenuEvent(eventId: string): boolean {
        return this.store.feishu.hasEventReceipt(eventId)
    }

    recordMenuEvent(input: {
        eventId: string
        openId: string
        namespace: string
    }): void {
        this.store.feishu.addEventReceipt({
            eventId: input.eventId,
            openId: input.openId,
            namespace: input.namespace,
            kind: 'menu'
        })
    }

    getSessionState(openId: string) {
        return this.store.feishu.getSessionState(openId)
    }

    setSessionState(input: {
        openId: string
        namespace: string
        activeSessionId?: string | null
        activeRoomId?: string | null
        activeTargetType?: 'session' | 'room' | null
        activeMachineId?: string | null
        lastInboundMessageId?: string | null
        lastInboundAt?: number | null
        lastOutboundAt?: number | null
    }): void {
        this.store.feishu.upsertSessionState(input)
    }
}
