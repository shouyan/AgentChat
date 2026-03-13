import type { DecryptedMessage, SessionSummary } from '@agentchat/protocol/types'
import type { Machine, Session, SyncEngine } from '../../sync/syncEngine'

export type FeishuStatus = {
    enabled: boolean
    mode: 'disabled' | 'long-connection'
    connected: boolean
    lastError?: string
    lastEventAt?: number
}

export type FeishuIncomingTextMessage = {
    openId: string
    messageId: string
    chatType: string
    text: string
}

export type FeishuMenuEvent = {
    openId: string
    eventKey: string
    eventId: string | null
}

export type FeishuApiMessageClient = {
    sendText: (openId: string, text: string) => Promise<string | undefined>
}

export type FeishuRepositoryLike = {
    isOpenIdAllowed: (openId: string) => boolean
    resolveNamespaceForOpenId: (openId: string) => string | null
    hasInboundMessage: (messageId: string) => boolean
    recordInboundMessage: (input: {
        messageId: string
        openId: string
        namespace: string
        sessionId?: string | null
        roomId?: string | null
    }) => void
    hasMenuEvent: (eventId: string) => boolean
    recordMenuEvent: (input: { eventId: string; openId: string; namespace: string }) => void
    getSessionState: (openId: string) => {
        openId: string
        namespace: string
        activeSessionId: string | null
        activeRoomId: string | null
        activeTargetType: 'session' | 'room' | null
        activeMachineId: string | null
    } | null
    setSessionState: (input: {
        openId: string
        namespace: string
        activeSessionId?: string | null
        activeRoomId?: string | null
        activeTargetType?: 'session' | 'room' | null
        activeMachineId?: string | null
        lastInboundMessageId?: string | null
        lastInboundAt?: number | null
        lastOutboundAt?: number | null
    }) => void
}

export type FeishuCommandContext = {
    openId: string
    namespace: string
}

export type FeishuAgentFlavor = 'claude' | 'codex' | 'cursor' | 'gemini' | 'opencode'

export type FeishuSessionCreateInput = {
    namespace: string
    preferredMachineId: string | null
    agent?: FeishuAgentFlavor
    directory?: string
}

export type FeishuCommandDependencies = {
    engine: SyncEngine
    repository: FeishuRepositoryLike
    publicUrl: string
    accessToken: string
    autoCreateSession: boolean
    defaultMachineId: string | null
}

export type FeishuCommandResult =
    | { handled: true; response: string; sessionId?: string; roomId?: string }
    | { handled: false }

export type SessionSpawnStrategy = {
    autoCreateSession: boolean
    defaultMachineId: string | null
}

export type FeishuReplyWaitResult =
    | { type: 'assistant'; text: string }
    | { type: 'error'; text: string }
    | { type: 'timeout'; text: string | null }

export type FeishuBridgeDependencies = {
    engine: SyncEngine
    repository: FeishuRepositoryLike
    apiClient: FeishuApiMessageClient
    publicUrl: string
    accessToken: string
    replyTimeoutMs: number
    spawnStrategy: SessionSpawnStrategy
}

export type FeishuSessionResolver = {
    session: Session
    machine: Machine | null
}

export type FeishuSessionListEntry = SessionSummary

export type FeishuMessageSubscriber = (
    event: { sessionId: string; message: DecryptedMessage }
) => void
