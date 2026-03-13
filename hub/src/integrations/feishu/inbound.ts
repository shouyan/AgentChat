import { formatFeishuErrorText, formatUnboundUserText, formatUnsupportedMessageText } from './formatter'
import { routeFeishuCommand } from './commandRouter'
import type { FeishuApiMessageClient, FeishuIncomingTextMessage, FeishuMenuEvent, FeishuRepositoryLike } from './types'
import type { FeishuSessionBridge } from './sessionBridge'

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null
}

function extractString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function parseFeishuIncomingTextMessage(event: Record<string, unknown>): FeishuIncomingTextMessage | { ignored: true; reason: string; openId?: string; messageId?: string } {
    const message = asRecord(event.message)
    const sender = asRecord(event.sender)
    const senderId = asRecord(sender?.sender_id)
    const openId = extractString(senderId?.open_id)
    const messageId = extractString(message?.message_id)
    const chatType = extractString(message?.chat_type) ?? ''
    const messageType = extractString(message?.message_type) ?? ''
    const rawContent = extractString(message?.content)

    if (!openId || !messageId) {
        return { ignored: true, reason: 'missing ids' }
    }
    if (chatType !== 'p2p') {
        return { ignored: true, reason: 'non-p2p', openId, messageId }
    }
    if (messageType !== 'text') {
        return { ignored: true, reason: `unsupported:${messageType}`, openId, messageId }
    }
    if (!rawContent) {
        return { ignored: true, reason: 'missing content', openId, messageId }
    }
    let parsedBody: unknown = null
    try {
        parsedBody = JSON.parse(rawContent)
    } catch {
        return { ignored: true, reason: 'invalid json', openId, messageId }
    }
    const parsedContent = asRecord(parsedBody)
    const text = extractString(parsedContent?.text)
    if (!text) {
        return { ignored: true, reason: 'empty text', openId, messageId }
    }
    return {
        openId,
        messageId,
        chatType,
        text,
    }
}

export function parseFeishuMenuEvent(event: Record<string, unknown>): FeishuMenuEvent | { ignored: true; reason: string; openId?: string } {
    const operator = asRecord(event.operator)
    const operatorId = asRecord(operator?.operator_id)
    const openId = extractString(operatorId?.open_id) ?? extractString(operator?.open_id)
    const eventKey = extractString(event.event_key)
    const eventId = extractString(event.event_id)
    if (!openId || !eventKey) {
        return { ignored: true, reason: 'missing menu event fields', openId: openId ?? undefined }
    }
    return { openId, eventKey, eventId: eventId ?? null }
}

function mapMenuEventKeyToCommand(eventKey: string): string {
    const normalized = eventKey.trim().toLowerCase()
    if (normalized === 'help' || normalized === 'agentchat_help') {
        return '/help'
    }
    if (normalized === 'new' || normalized === 'session_new' || normalized === 'agentchat_new_session') {
        return '/help'
    }
    if (
        normalized === 'progress'
        || normalized === 'recent_reply'
        || normalized === 'current_progress'
        || normalized === 'agentchat_progress'
    ) {
        return '/progress'
    }
    if (normalized === 'sessions' || normalized === 'session_list' || normalized === 'agentchat_sessions') {
        return '/sessions'
    }
    if (normalized === 'groups' || normalized === 'room_list' || normalized === 'agentchat_groups') {
        return '/sessions'
    }
    return '/help'
}

export class FeishuInboundHandler {
    private readonly queue: Map<string, Promise<void>> = new Map()

    constructor(
        private readonly deps: {
            repository: FeishuRepositoryLike
            apiClient: FeishuApiMessageClient
            bridge: FeishuSessionBridge
            commandDeps: {
                engine: Parameters<typeof routeFeishuCommand>[0]['engine']
                repository: FeishuRepositoryLike
                publicUrl: string
                accessToken: string
                autoCreateSession: boolean
                defaultMachineId: string | null
            }
        }
    ) {
    }

    async handleEvent(event: Record<string, unknown>): Promise<void> {
        const parsed = parseFeishuIncomingTextMessage(event)
        if ('ignored' in parsed) {
            if (parsed.openId && parsed.reason.startsWith('unsupported:') && this.deps.repository.isOpenIdAllowed(parsed.openId)) {
                const namespace = this.deps.repository.resolveNamespaceForOpenId(parsed.openId)
                if (namespace) {
                    await this.deps.apiClient.sendText(parsed.openId, formatUnsupportedMessageText(parsed.reason.slice('unsupported:'.length)))
                }
            }
            return
        }

        const previous = this.queue.get(parsed.openId) ?? Promise.resolve()
        const next = previous
            .catch(() => undefined)
            .then(async () => {
                await this.processMessage(parsed)
            })
            .finally(() => {
                if (this.queue.get(parsed.openId) === next) {
                    this.queue.delete(parsed.openId)
                }
            })
        this.queue.set(parsed.openId, next)
        await next
    }

    async handleMenuEvent(event: Record<string, unknown>): Promise<void> {
        const parsed = parseFeishuMenuEvent(event)
        if ('ignored' in parsed) {
            return
        }
        if (parsed.eventId && this.deps.repository.hasMenuEvent(parsed.eventId)) {
            return
        }

        const previous = this.queue.get(parsed.openId) ?? Promise.resolve()
        const next = previous
            .catch(() => undefined)
            .then(async () => {
                await this.processMenuEvent(parsed)
            })
            .finally(() => {
                if (this.queue.get(parsed.openId) === next) {
                    this.queue.delete(parsed.openId)
                }
            })
        this.queue.set(parsed.openId, next)
        await next
    }

    private async processMessage(message: FeishuIncomingTextMessage): Promise<void> {
        if (!this.deps.repository.isOpenIdAllowed(message.openId)) {
            console.warn('[FeishuInbound] open_id not allowed', { openId: message.openId })
            return
        }
        if (this.deps.repository.hasInboundMessage(message.messageId)) {
            return
        }
        const namespace = this.deps.repository.resolveNamespaceForOpenId(message.openId)
        if (!namespace) {
            await this.deps.apiClient.sendText(message.openId, formatUnboundUserText())
            return
        }

        try {
            const commandResult = await routeFeishuCommand(
                this.deps.commandDeps,
                { openId: message.openId, namespace },
                message.text,
                {
                    createSession: async ({ namespace: targetNamespace, preferredMachineId, agent, directory }) => {
                        return await this.deps.bridge.createSessionForUser({
                            openId: message.openId,
                            namespace: targetNamespace,
                            preferredMachineId,
                            agent,
                            directory,
                        })
                    }
                }
            )
            if (commandResult.handled) {
                this.deps.repository.recordInboundMessage({
                    messageId: message.messageId,
                    openId: message.openId,
                    namespace,
                    sessionId: commandResult.sessionId ?? null,
                    roomId: commandResult.roomId ?? null,
                })
                this.deps.repository.setSessionState({
                    openId: message.openId,
                    namespace,
                    activeSessionId: commandResult.sessionId ?? undefined,
                    lastInboundMessageId: message.messageId,
                    lastInboundAt: Date.now(),
                    lastOutboundAt: Date.now(),
                })
                await this.deps.apiClient.sendText(message.openId, commandResult.response)
                return
            }

            await this.deps.bridge.handleChatMessage({
                openId: message.openId,
                namespace,
                text: message.text,
                sourceMessageId: message.messageId,
            })
        } catch (error) {
            await this.deps.apiClient.sendText(message.openId, formatFeishuErrorText(error))
        }
    }

    private async processMenuEvent(event: FeishuMenuEvent): Promise<void> {
        if (!this.deps.repository.isOpenIdAllowed(event.openId)) {
            return
        }
        const namespace = this.deps.repository.resolveNamespaceForOpenId(event.openId)
        if (!namespace) {
            await this.deps.apiClient.sendText(event.openId, formatUnboundUserText())
            return
        }
        if (event.eventId) {
            this.deps.repository.recordMenuEvent({
                eventId: event.eventId,
                openId: event.openId,
                namespace,
            })
        }

        try {
            const commandResult = await routeFeishuCommand(
                this.deps.commandDeps,
                { openId: event.openId, namespace },
                mapMenuEventKeyToCommand(event.eventKey),
                {
                    createSession: async ({ namespace: targetNamespace, preferredMachineId, agent, directory }) => {
                        return await this.deps.bridge.createSessionForUser({
                            openId: event.openId,
                            namespace: targetNamespace,
                            preferredMachineId,
                            agent,
                            directory,
                        })
                    }
                }
            )
            if (commandResult.handled) {
                this.deps.repository.setSessionState({
                    openId: event.openId,
                    namespace,
                    activeSessionId: commandResult.sessionId ?? undefined,
                    lastOutboundAt: Date.now(),
                })
                await this.deps.apiClient.sendText(event.openId, commandResult.response)
            }
        } catch (error) {
            await this.deps.apiClient.sendText(event.openId, formatFeishuErrorText(error))
        }
    }
}
