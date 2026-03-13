import { describe, expect, it } from 'vitest'
import { MessageBuffer } from '@/ui/ink/messageBuffer'
import { formatAttachedMessage } from './formatAttachedMessage'

describe('formatAttachedMessage', () => {
    it('formats plain user text messages', () => {
        const buffer = new MessageBuffer()

        formatAttachedMessage({
            id: '1',
            seq: 1,
            createdAt: 1,
            localId: null,
            content: {
                role: 'user',
                content: {
                    type: 'text',
                    text: 'hello from web',
                },
            },
        }, buffer)

        expect(buffer.getMessages().map((message) => message.content)).toEqual(['👤 User: hello from web'])
    })

    it('formats Claude output payloads through the Ink formatter', () => {
        const buffer = new MessageBuffer()

        formatAttachedMessage({
            id: '2',
            seq: 2,
            createdAt: 2,
            localId: null,
            content: {
                role: 'agent',
                content: {
                    type: 'output',
                    data: {
                        type: 'assistant',
                        message: {
                            role: 'assistant',
                            content: [
                                { type: 'text', text: 'attached claude reply' },
                            ],
                        },
                    },
                },
            },
        }, buffer)

        expect(buffer.getMessages().map((message) => message.content)).toEqual([
            '🤖 Assistant:',
            'attached claude reply',
        ])
    })

    it('formats codex tool calls and results', () => {
        const buffer = new MessageBuffer()

        formatAttachedMessage({
            id: '3',
            seq: 3,
            createdAt: 3,
            localId: null,
            content: {
                role: 'agent',
                content: {
                    type: 'codex',
                    data: {
                        type: 'tool-call',
                        name: 'Bash',
                        callId: 'call-1',
                        input: { command: 'pwd' },
                    },
                },
            },
        }, buffer)
        formatAttachedMessage({
            id: '4',
            seq: 4,
            createdAt: 4,
            localId: null,
            content: {
                role: 'agent',
                content: {
                    type: 'codex',
                    data: {
                        type: 'tool-call-result',
                        callId: 'call-1',
                        output: '/tmp/project',
                    },
                },
            },
        }, buffer)

        expect(buffer.getMessages().map((message) => message.content)).toEqual([
            '🔧 Tool: Bash',
            'Input: {\n  "command": "pwd"\n}',
            '✅ Tool Result (call-1)',
            '/tmp/project',
        ])
    })

    it('formats session events', () => {
        const buffer = new MessageBuffer()

        formatAttachedMessage({
            id: '5',
            seq: 5,
            createdAt: 5,
            localId: null,
            content: {
                role: 'agent',
                content: {
                    type: 'event',
                    data: {
                        type: 'ready',
                    },
                },
            },
        }, buffer)

        expect(buffer.getMessages().map((message) => message.content)).toEqual(['✅ Ready for next message'])
    })
})
