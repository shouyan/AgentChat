import { EventEmitter } from 'node:events'
import axios from 'axios'
import { io, type Socket } from 'socket.io-client'
import type { CliMessagesResponse, Session } from '@/api/types'
import {
    AgentStateSchema,
    CliMessagesResponseSchema,
    CreateSessionResponseSchema,
    MetadataSchema,
    type AgentState,
    type Metadata,
} from '@/api/types'
import { configuration } from '@/configuration'
import type { ClientToServerEvents, ServerToClientEvents, Update } from '@agentchat/protocol'
import { logger } from '@/ui/logger'
import { apiValidationError } from '@/utils/errorUtils'

export type AttachConnectionState = 'connecting' | 'connected' | 'disconnected'
export type AttachMessageRecord = CliMessagesResponse['messages'][number]

type AttachSocketLike = Pick<Socket<ServerToClientEvents, ClientToServerEvents>, 'on' | 'off' | 'connect' | 'disconnect'>

type AttachedSessionClientDeps = {
    createSocket?: () => AttachSocketLike
    fetchSession?: (sessionId: string) => Promise<Session>
    fetchMessages?: (sessionId: string, afterSeq: number, limit: number) => Promise<AttachMessageRecord[]>
}

export class AttachedSessionClient extends EventEmitter {
    private readonly socket: AttachSocketLike
    private readonly fetchSessionImpl: (sessionId: string) => Promise<Session>
    private readonly fetchMessagesImpl: (sessionId: string, afterSeq: number, limit: number) => Promise<AttachMessageRecord[]>

    private session: Session
    private connectionState: AttachConnectionState = 'disconnected'
    private lastSeenMessageSeq: number | null = null
    private backfillInFlight: Promise<void> | null = null
    private refreshInFlight: Promise<void> | null = null
    private needsBackfill = false
    private needsRefresh = false
    private hasConnectedOnce = false
    private started = false

    constructor(
        private readonly accessToken: string,
        session: Session,
        deps: AttachedSessionClientDeps = {}
    ) {
        super()
        this.session = session
        this.socket = deps.createSocket?.() ?? createAttachSocket(accessToken, session.id)
        this.fetchSessionImpl = deps.fetchSession ?? ((sessionId) => fetchAttachedSessionSnapshot(accessToken, sessionId))
        this.fetchMessagesImpl = deps.fetchMessages ?? ((sessionId, afterSeq, limit) => fetchAttachedSessionMessages(accessToken, sessionId, afterSeq, limit))
    }

    getSession(): Session {
        return this.session
    }

    getConnectionState(): AttachConnectionState {
        return this.connectionState
    }

    async start(): Promise<void> {
        if (this.started) {
            return
        }
        this.started = true

        this.registerListeners()
        this.setConnectionState('connecting')
        this.socket.connect()

        await Promise.all([
            this.refreshSession(),
            this.backfillMessages()
        ])
    }

    async close(): Promise<void> {
        this.socket.disconnect()
        this.removeAllListeners()
    }

    async refreshSession(): Promise<Session> {
        const current = this.refreshInFlight
        if (current) {
            await current
            return this.session
        }

        const run = (async () => {
            const next = await this.fetchSessionImpl(this.session.id)
            this.session = next
            this.emit('session', this.session)
        })()

        this.refreshInFlight = run.finally(() => {
            this.refreshInFlight = null
        })

        await this.refreshInFlight
        return this.session
    }

    async refreshAll(): Promise<void> {
        await this.refreshSession()
        await this.backfillMessages()
    }

    private registerListeners(): void {
        this.socket.on('connect', () => {
            this.setConnectionState('connected')
            if (this.hasConnectedOnce) {
                this.needsBackfill = true
                this.needsRefresh = true
                void this.backfillIfNeeded()
                void this.refreshIfNeeded()
            }
            this.hasConnectedOnce = true
        })

        this.socket.on('disconnect', () => {
            this.setConnectionState('disconnected')
            if (this.hasConnectedOnce) {
                this.needsBackfill = true
                this.needsRefresh = true
            }
        })

        this.socket.on('connect_error', (error: unknown) => {
            this.setConnectionState('disconnected')
            this.emit('error', normalizeError(error, 'Attach socket connection failed'))
        })

        this.socket.on('error', (payload: unknown) => {
            if (!payload || typeof payload !== 'object' || typeof (payload as { message?: unknown }).message !== 'string') {
                return
            }
            this.emit('error', new Error((payload as { message: string }).message))
        })

        this.socket.on('update', (data: Update) => {
            try {
                if (!data.body) {
                    return
                }

                if (data.body.t === 'new-message') {
                    this.handleIncomingMessage(data.body.message)
                    return
                }

                if (data.body.t === 'update-session') {
                    this.handleSessionUpdate(data.body)
                }
            } catch (error) {
                logger.debug('[attach] Failed to process update', error)
                this.emit('error', normalizeError(error, 'Failed to process session update'))
            }
        })
    }

    private handleSessionUpdate(body: Extract<Update['body'], { t: 'update-session' }>): void {
        let nextSession = this.session

        if (body.metadata && body.metadata.version > this.session.metadataVersion) {
            const parsed = MetadataSchema.safeParse(body.metadata.value)
            if (parsed.success) {
                nextSession = {
                    ...nextSession,
                    metadata: parsed.data,
                    metadataVersion: body.metadata.version,
                }
            }
        }

        if (body.agentState && body.agentState.version > this.session.agentStateVersion) {
            let nextAgentState: AgentState | null = null
            if (body.agentState.value != null) {
                const parsed = AgentStateSchema.safeParse(body.agentState.value)
                if (parsed.success) {
                    nextAgentState = parsed.data
                }
            }

            nextSession = {
                ...nextSession,
                agentState: nextAgentState,
                agentStateVersion: body.agentState.version,
            }
        }

        if (nextSession !== this.session) {
            this.session = nextSession
            this.emit('session', this.session)
        }
    }

    private setConnectionState(next: AttachConnectionState): void {
        if (this.connectionState === next) {
            return
        }
        this.connectionState = next
        this.emit('connection-state', this.connectionState)
    }

    private async refreshIfNeeded(): Promise<void> {
        if (!this.needsRefresh) {
            return
        }
        try {
            await this.refreshSession()
            this.needsRefresh = false
        } catch (error) {
            logger.debug('[attach] Refresh failed', error)
            this.emit('error', normalizeError(error, 'Failed to refresh session snapshot'))
            this.needsRefresh = true
        }
    }

    private async backfillIfNeeded(): Promise<void> {
        if (!this.needsBackfill) {
            return
        }
        try {
            await this.backfillMessages()
            this.needsBackfill = false
        } catch (error) {
            logger.debug('[attach] Backfill failed', error)
            this.emit('error', normalizeError(error, 'Failed to backfill attached session messages'))
            this.needsBackfill = true
        }
    }

    private async backfillMessages(): Promise<void> {
        if (this.backfillInFlight) {
            await this.backfillInFlight
            return
        }

        const run = async () => {
            const limit = 200
            let cursor = this.lastSeenMessageSeq ?? 0

            while (true) {
                const messages = await this.fetchMessagesImpl(this.session.id, cursor, limit)
                if (messages.length === 0) {
                    break
                }

                let maxSeq = cursor
                for (const message of messages) {
                    if (typeof message.seq === 'number') {
                        maxSeq = Math.max(maxSeq, message.seq)
                    }
                    this.handleIncomingMessage(message)
                }

                const observedSeq = this.lastSeenMessageSeq ?? maxSeq
                const nextCursor = Math.max(maxSeq, observedSeq)
                if (nextCursor <= cursor) {
                    logger.debug('[attach] Backfill stopped due to non-advancing cursor', {
                        cursor,
                        maxSeq,
                        observedSeq,
                    })
                    break
                }

                cursor = nextCursor
                if (messages.length < limit) {
                    break
                }
            }
        }

        this.backfillInFlight = run().finally(() => {
            this.backfillInFlight = null
        })

        await this.backfillInFlight
    }

    private handleIncomingMessage(message: { seq?: number; content: unknown; id: string; createdAt: number; localId?: string | null }): void {
        const seq = typeof message.seq === 'number' ? message.seq : null
        if (seq !== null) {
            if (this.lastSeenMessageSeq !== null && seq <= this.lastSeenMessageSeq) {
                return
            }
            this.lastSeenMessageSeq = seq
        }

        this.emit('message', message)
    }
}

function createAttachSocket(accessToken: string, sessionId: string): AttachSocketLike {
    return io(`${configuration.apiUrl}/cli`, {
        auth: {
            token: accessToken,
            clientType: 'session-attach' as const,
            sessionId,
        },
        path: '/socket.io/',
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        transports: ['websocket'],
        autoConnect: false,
    })
}

export async function fetchAttachedSessionSnapshot(accessToken: string, sessionId: string): Promise<Session> {
    const response = await axios.get(`${configuration.apiUrl}/cli/sessions/${encodeURIComponent(sessionId)}`, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        timeout: 60_000,
    })

    const parsed = CreateSessionResponseSchema.safeParse(response.data)
    if (!parsed.success) {
        throw apiValidationError('Invalid /cli/sessions/:id response', response)
    }

    return hydrateSession(parsed.data.session)
}

async function fetchAttachedSessionMessages(
    accessToken: string,
    sessionId: string,
    afterSeq: number,
    limit: number
): Promise<AttachMessageRecord[]> {
    const response = await axios.get(`${configuration.apiUrl}/cli/sessions/${encodeURIComponent(sessionId)}/messages`, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        params: {
            afterSeq,
            limit,
        },
        timeout: 60_000,
    })

    const parsed = CliMessagesResponseSchema.safeParse(response.data)
    if (!parsed.success) {
        throw apiValidationError('Invalid /cli/sessions/:id/messages response', response)
    }

    return parsed.data.messages
}

function hydrateSession(raw: {
    id: string
    namespace: string
    seq: number
    createdAt: number
    updatedAt: number
    active: boolean
    activeAt: number
    metadata: unknown
    metadataVersion: number
    agentState: unknown
    agentStateVersion: number
    thinking: boolean
    thinkingAt: number
    todos?: Session['todos']
    permissionMode?: Session['permissionMode']
    modelMode?: Session['modelMode']
}): Session {
    const metadata = parseMetadata(raw.metadata)
    const agentState = parseAgentState(raw.agentState)

    return {
        id: raw.id,
        namespace: raw.namespace,
        seq: raw.seq,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
        active: raw.active,
        activeAt: raw.activeAt,
        metadata,
        metadataVersion: raw.metadataVersion,
        agentState,
        agentStateVersion: raw.agentStateVersion,
        thinking: raw.thinking,
        thinkingAt: raw.thinkingAt,
        todos: raw.todos,
        permissionMode: raw.permissionMode,
        modelMode: raw.modelMode,
    }
}

function parseMetadata(raw: unknown): Metadata | null {
    if (raw == null) {
        return null
    }
    const parsed = MetadataSchema.safeParse(raw)
    return parsed.success ? parsed.data : null
}

function parseAgentState(raw: unknown): AgentState | null {
    if (raw == null) {
        return null
    }
    const parsed = AgentStateSchema.safeParse(raw)
    return parsed.success ? parsed.data : null
}

function normalizeError(error: unknown, fallbackMessage: string): Error {
    if (error instanceof Error) {
        return error
    }
    return new Error(fallbackMessage)
}
