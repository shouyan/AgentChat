import type { DecryptedMessage } from '@agentchat/protocol/types'
import type { Machine, SyncEngine } from '../../sync/syncEngine'
import { extractAssistantTextFromMessage, extractErrorTextFromMessage, formatBusyFallbackText, formatFeishuErrorText, isReadyEventMessage } from './formatter'
import type { FeishuBridgeDependencies, FeishuReplyWaitResult, FeishuSessionCreateInput } from './types'

type SessionReplyWatcher = {
    on: (listener: (message: DecryptedMessage) => void) => () => void
    complete: () => void
}

type RoomReplyWatcher = {
    on: (listener: (message: { text: string; createdAt: number }) => void) => () => void
    complete: () => void
}

function pickMachine(engine: SyncEngine, namespace: string, preferredMachineId: string | null): Machine | null {
    const online = engine.getOnlineMachinesByNamespace(namespace)
    if (online.length === 0) {
        return null
    }
    if (preferredMachineId) {
        const exact = online.find((machine) => machine.id === preferredMachineId)
        if (exact) {
            return exact
        }
    }
    return online[0] ?? null
}

export class FeishuSessionBridge {
    constructor(private readonly deps: FeishuBridgeDependencies) {
    }

    async handleChatMessage(input: {
        openId: string
        namespace: string
        text: string
        sourceMessageId: string
    }): Promise<void> {
        try {
            const state = this.deps.repository.getSessionState(input.openId)
            if (state?.activeTargetType === 'room' && state.activeRoomId) {
                await this.handleRoomChatMessage(input, state.activeRoomId)
                return
            }
            const { session, machine } = await this.resolveOrCreateActiveSession(input.openId, input.namespace)
            const localId = `feishu:${input.sourceMessageId}`
            const watcher = this.createReplyWatcher(session.id, localId)
            const sent = await this.deps.engine.sendMessage(session.id, {
                text: input.text,
                localId,
                sentFrom: 'feishu-bot',
                meta: {
                    channel: 'feishu',
                    openId: input.openId,
                    sourceMessageId: input.sourceMessageId,
                }
            })

            this.deps.repository.recordInboundMessage({
                messageId: input.sourceMessageId,
                openId: input.openId,
                namespace: input.namespace,
                sessionId: session.id,
            })
            this.deps.repository.setSessionState({
                openId: input.openId,
                namespace: input.namespace,
                activeSessionId: session.id,
                activeMachineId: machine?.id ?? session.metadata?.machineId ?? null,
                lastInboundMessageId: input.sourceMessageId,
                lastInboundAt: Date.now(),
            })

            try {
                const result = await this.waitForAssistantReply(watcher, sent.seq)
                const replyText = result.type === 'assistant' && result.text.trim()
                    ? result.text.trim()
                    : result.type === 'error' && result.text.trim()
                        ? formatFeishuErrorText(result.text)
                        : formatBusyFallbackText(
                            session.id,
                            this.deps.publicUrl,
                            this.deps.accessToken,
                            input.namespace
                        )
                await this.deps.apiClient.sendText(input.openId, replyText)
                this.deps.repository.setSessionState({
                    openId: input.openId,
                    namespace: input.namespace,
                    activeSessionId: session.id,
                    activeMachineId: machine?.id ?? session.metadata?.machineId ?? null,
                    lastOutboundAt: Date.now(),
                })
            } finally {
                watcher.complete()
            }
        } catch (error) {
            await this.deps.apiClient.sendText(input.openId, formatFeishuErrorText(error))
        }
    }

    private async handleRoomChatMessage(
        input: {
            openId: string
            namespace: string
            text: string
            sourceMessageId: string
        },
        roomId: string
    ): Promise<void> {
        const room = this.deps.engine.getRoomByNamespace(roomId, input.namespace)
        if (!room) {
            throw new Error('Active room not found')
        }
        const watcher = this.createRoomReplyWatcher(roomId, input.sourceMessageId)
        const sent = await this.deps.engine.sendRoomMessage(roomId, input.namespace, {
            senderType: 'user',
            senderId: `feishu:${input.openId}`,
            content: {
                type: 'text',
                text: input.text,
                meta: {
                    channel: 'feishu',
                    openId: input.openId,
                    sourceMessageId: input.sourceMessageId,
                }
            }
        })

        this.deps.repository.recordInboundMessage({
            messageId: input.sourceMessageId,
            openId: input.openId,
            namespace: input.namespace,
            roomId: room.id,
        })
        this.deps.repository.setSessionState({
            openId: input.openId,
            namespace: input.namespace,
            activeRoomId: room.id,
            activeTargetType: 'room',
            lastInboundMessageId: input.sourceMessageId,
            lastInboundAt: Date.now(),
        })

        try {
            const result = await this.waitForRoomReply(watcher, sent.seq ?? null)
            const replyText = result.type === 'assistant' && result.text.trim()
                ? result.text.trim()
                : result.type === 'timeout' && result.text?.trim()
                    ? result.text.trim()
                    : `消息已发送到群组 ${room.metadata.name ?? room.id}，等待新的协作回复。`
            await this.deps.apiClient.sendText(input.openId, replyText)
            this.deps.repository.setSessionState({
                openId: input.openId,
                namespace: input.namespace,
                activeRoomId: room.id,
                activeTargetType: 'room',
                lastOutboundAt: Date.now(),
            })
        } finally {
            watcher.complete()
        }
    }

    async createSessionForUser(input: {
        openId: string
        namespace: string
        preferredMachineId: string | null
        agent?: FeishuSessionCreateInput['agent']
        directory?: string
    }): Promise<{ sessionId: string; machineId: string | null }> {
        const machine = pickMachine(this.deps.engine, input.namespace, input.preferredMachineId)
        if (!machine) {
            throw new Error('No machine online for namespace')
        }
        const directory = input.directory?.trim() || machine.metadata?.homeDir
        if (!directory) {
            throw new Error('Machine metadata missing homeDir')
        }
        const spawn = await this.deps.engine.spawnSession(machine.id, directory, input.agent ?? 'claude')
        if (spawn.type !== 'success') {
            throw new Error(spawn.message)
        }
        const active = await this.deps.engine.waitForSessionActive(spawn.sessionId, 15_000)
        if (!active) {
            throw new Error('Session did not become active in time')
        }
        this.deps.repository.setSessionState({
            openId: input.openId,
            namespace: input.namespace,
            activeSessionId: spawn.sessionId,
            activeTargetType: 'session',
            activeMachineId: machine.id,
        })
        return { sessionId: spawn.sessionId, machineId: machine.id }
    }

    private async resolveOrCreateActiveSession(openId: string, namespace: string) {
        const state = this.deps.repository.getSessionState(openId)
        if (state?.activeSessionId) {
            const existing = this.deps.engine.getSessionByNamespace(state.activeSessionId, namespace)
            if (existing?.active) {
                const machine = existing.metadata?.machineId
                    ? this.deps.engine.getMachineByNamespace(existing.metadata.machineId, namespace) ?? null
                    : null
                return { session: existing, machine }
            }
        }
        if (!this.deps.spawnStrategy.autoCreateSession) {
            throw new Error('No active session bound to this Feishu user')
        }
        const created = await this.createSessionForUser({
            openId,
            namespace,
            preferredMachineId: state?.activeMachineId ?? this.deps.spawnStrategy.defaultMachineId,
        })
        const session = this.deps.engine.getSessionByNamespace(created.sessionId, namespace)
        if (!session) {
            throw new Error('Created session not found after spawn')
        }
        const machine = created.machineId ? this.deps.engine.getMachineByNamespace(created.machineId, namespace) ?? null : null
        return { session, machine }
    }

    private createReplyWatcher(sessionId: string, localId: string): SessionReplyWatcher {
        let closed = false
        const listeners = new Set<(message: DecryptedMessage) => void>()
        const unsubscribeEngine = this.deps.engine.subscribe((event) => {
            if (closed) {
                return
            }
            if (event.type !== 'message-received' || event.sessionId !== sessionId || !event.message) {
                return
            }
            if (event.message.localId === localId) {
                return
            }
            for (const listener of listeners) {
                listener(event.message)
            }
        })

        return {
            on: (listener) => {
                listeners.add(listener)
                return () => listeners.delete(listener)
            },
            complete: () => {
                if (closed) {
                    return
                }
                closed = true
                unsubscribeEngine()
            },
        }
    }

    private createRoomReplyWatcher(roomId: string, sourceMessageId: string): RoomReplyWatcher {
        let closed = false
        const listeners = new Set<(message: { text: string; createdAt: number }) => void>()
        const unsubscribeEngine = this.deps.engine.subscribe((event) => {
            if (closed) {
                return
            }
            if (event.type !== 'room-message-received' || event.roomId !== roomId || !event.message) {
                return
            }
            const message = event.message
            if (message.senderType !== 'session') {
                return
            }
            const metaSourceMessageId = message.content.meta && typeof message.content.meta === 'object'
                ? (message.content.meta as Record<string, unknown>).sourceMessageId
                : null
            if (metaSourceMessageId === sourceMessageId) {
                return
            }
            if (typeof message.content.text !== 'string' || !message.content.text.trim()) {
                return
            }
            for (const listener of listeners) {
                listener({ text: message.content.text.trim(), createdAt: message.createdAt })
            }
        })

        return {
            on: (listener) => {
                listeners.add(listener)
                return () => listeners.delete(listener)
            },
            complete: () => {
                if (closed) {
                    return
                }
                closed = true
                unsubscribeEngine()
            },
        }
    }

    private async waitForAssistantReply(
        watcher: SessionReplyWatcher,
        sentSeq: number | null
    ): Promise<FeishuReplyWaitResult> {
        return await new Promise<FeishuReplyWaitResult>((resolve) => {
            const collected: string[] = []
            let sawAssistant = false
            let settled = false
            const finish = (result: FeishuReplyWaitResult) => {
                if (settled) {
                    return
                }
                settled = true
                clearTimeout(timeout)
                unsubscribe()
                resolve(result)
            }
            const unsubscribe = watcher.on((message) => {
                if (sentSeq !== null && typeof message.seq === 'number' && message.seq <= sentSeq) {
                    return
                }
                const assistantText = extractAssistantTextFromMessage(message)
                if (assistantText) {
                    sawAssistant = true
                    collected.push(assistantText)
                    return
                }
                const errorText = extractErrorTextFromMessage(message)
                if (errorText) {
                    finish({ type: 'error', text: errorText })
                    return
                }
                if (isReadyEventMessage(message) && sawAssistant) {
                    finish({ type: 'assistant', text: collected.join('\n\n').trim() })
                }
            })
            const timeout = setTimeout(() => {
                finish({
                    type: 'timeout',
                    text: collected.length > 0 ? collected.join('\n\n').trim() : null,
                })
            }, this.deps.replyTimeoutMs)
            timeout.unref?.()
        })
    }

    private async waitForRoomReply(
        watcher: RoomReplyWatcher,
        _sentSeq: number | null
    ): Promise<FeishuReplyWaitResult> {
        return await new Promise<FeishuReplyWaitResult>((resolve) => {
            let settled = false
            let latestText: string | null = null
            const finish = (result: FeishuReplyWaitResult) => {
                if (settled) {
                    return
                }
                settled = true
                clearTimeout(timeout)
                unsubscribe()
                resolve(result)
            }
            const unsubscribe = watcher.on((message) => {
                latestText = message.text
                finish({ type: 'assistant', text: latestText })
            })
            const timeout = setTimeout(() => {
                finish({ type: 'timeout', text: latestText })
            }, this.deps.replyTimeoutMs)
            timeout.unref?.()
        })
    }
}
