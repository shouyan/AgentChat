import { describe, expect, it, vi } from 'vitest'
import type { Session } from '@/api/types'
import { AttachedSessionClient, type AttachMessageRecord } from './AttachedSessionClient'

type Listener = (...args: any[]) => void

class FakeSocket {
    readonly outbound: Array<{ event: string; args: unknown[] }> = []
    private readonly listeners = new Map<string, Set<Listener>>()

    on(event: string, listener: Listener): this {
        const bucket = this.listeners.get(event) ?? new Set<Listener>()
        bucket.add(listener)
        this.listeners.set(event, bucket)
        return this
    }

    off(event: string, listener: Listener): this {
        this.listeners.get(event)?.delete(listener)
        return this
    }

    connect(): void {
        this.trigger('connect')
    }

    disconnect(): void {
        this.trigger('disconnect')
    }

    emit(event: string, ...args: unknown[]): boolean {
        this.outbound.push({ event, args })
        return true
    }

    trigger(event: string, ...args: unknown[]): void {
        for (const listener of this.listeners.get(event) ?? []) {
            listener(...args)
        }
    }
}

describe('AttachedSessionClient', () => {
    it('backfills history and ignores duplicate live updates', async () => {
        const socket = new FakeSocket()
        const session = createSession('session-1')
        const fetchSession = vi.fn(async () => session)
        const fetchMessages = vi.fn(async (_sessionId: string, afterSeq: number) => {
            if (afterSeq === 0) {
                return [
                    createMessage(1, 'first'),
                    createMessage(2, 'second'),
                ]
            }
            return []
        })

        const client = new AttachedSessionClient('token', session, {
            createSocket: () => socket as never,
            fetchSession,
            fetchMessages,
        })

        const seenSeqs: number[] = []
        client.on('message', (message: AttachMessageRecord) => {
            seenSeqs.push(message.seq)
        })

        await client.start()

        socket.trigger('update', createNewMessageUpdate(createMessage(2, 'second duplicate')))
        socket.trigger('update', createNewMessageUpdate(createMessage(3, 'third')))

        expect(seenSeqs).toEqual([1, 2, 3])
        expect(fetchSession).toHaveBeenCalledTimes(1)
        expect(fetchMessages).toHaveBeenCalledTimes(1)
        expect(socket.outbound).toEqual([])
    })

    it('refreshes snapshot and backfills after reconnect without registering rpc handlers', async () => {
        const socket = new FakeSocket()
        const session = createSession('session-2')
        const fetchSession = vi.fn(async () => session)
        const fetchMessages = vi.fn(async (_sessionId: string, afterSeq: number) => {
            if (afterSeq === 0) {
                return [createMessage(1, 'first')]
            }
            if (afterSeq === 1) {
                return [createMessage(2, 'second')]
            }
            return []
        })

        const client = new AttachedSessionClient('token', session, {
            createSocket: () => socket as never,
            fetchSession,
            fetchMessages,
        })

        const seenSeqs: number[] = []
        const states: string[] = []
        client.on('message', (message: AttachMessageRecord) => {
            seenSeqs.push(message.seq)
        })
        client.on('connection-state', (state: string) => {
            states.push(state)
        })

        await client.start()
        socket.trigger('disconnect')
        socket.trigger('connect')
        await flushAsync()

        expect(seenSeqs).toEqual([1, 2])
        expect(fetchSession).toHaveBeenCalledTimes(2)
        expect(fetchMessages).toHaveBeenCalledTimes(2)
        expect(states).toEqual(['connecting', 'connected', 'disconnected', 'connected'])
        expect(socket.outbound).toEqual([])
    })

    it('sends terminal-composed messages through the CLI attach endpoint helper', async () => {
        const socket = new FakeSocket()
        const session = createSession('session-3')
        const sendMessage = vi.fn(async (_sessionId: string, _text: string, _localId: string) => {})

        const client = new AttachedSessionClient('token', session, {
            createSocket: () => socket as never,
            fetchSession: async () => session,
            fetchMessages: async () => [],
            sendMessage,
        })

        await client.start()
        await client.sendUserMessage('  hello from terminal  ')

        const [calledSessionId, calledText, calledLocalId] = sendMessage.mock.calls[0] ?? []
        expect(sendMessage).toHaveBeenCalledTimes(1)
        expect(calledSessionId).toBe('session-3')
        expect(calledText).toBe('hello from terminal')
        expect(typeof calledLocalId).toBe('string')
        expect(socket.outbound).toEqual([])
    })
})

function createSession(id: string): Session {
    return {
        id,
        namespace: 'default',
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: true,
        activeAt: 1,
        metadata: {
            path: '/tmp/project',
            host: 'localhost',
            flavor: 'claude',
        },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 1,
        thinking: false,
        thinkingAt: 1,
    }
}

function createMessage(seq: number, text: string): AttachMessageRecord {
    return {
        id: `msg-${seq}`,
        seq,
        createdAt: seq,
        localId: null,
        content: {
            role: 'user',
            content: {
                type: 'text',
                text,
            },
        },
    }
}

function createNewMessageUpdate(message: AttachMessageRecord) {
    return {
        id: `update-${message.seq}`,
        seq: message.seq,
        createdAt: message.createdAt,
        body: {
            t: 'new-message' as const,
            sid: 'session-1',
            message,
        },
    }
}

async function flushAsync(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0))
}
