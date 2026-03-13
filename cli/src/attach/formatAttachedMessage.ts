import type { AttachMessageRecord } from './AttachedSessionClient'
import type { SDKMessage } from '@/claude/sdk'
import type { MessageBuffer } from '@/ui/ink/messageBuffer'
import { formatClaudeMessageForInk } from '@/ui/messageFormatterInk'

export function formatAttachedMessage(message: AttachMessageRecord, messageBuffer: MessageBuffer): void {
    const content = asRecord(message.content)
    if (!content) {
        if (typeof message.content === 'string') {
            messageBuffer.addMessage(message.content, 'assistant')
        }
        return
    }

    const role = asString(content.role)
    const body = asRecord(content.content)

    if (role === 'user') {
        formatUserContent(body, messageBuffer)
        return
    }

    if (role === 'agent') {
        formatAgentContent(body, messageBuffer)
        return
    }

    if (role === 'event') {
        formatEventContent(body, messageBuffer)
    }
}

function formatUserContent(content: Record<string, unknown> | null, messageBuffer: MessageBuffer): void {
    if (!content) {
        return
    }

    if (content.type === 'text' && typeof content.text === 'string') {
        messageBuffer.addMessage(`👤 User: ${content.text}`, 'user')
        return
    }

    messageBuffer.addMessage(`👤 User: ${JSON.stringify(content)}`, 'user')
}

function formatAgentContent(content: Record<string, unknown> | null, messageBuffer: MessageBuffer): void {
    if (!content) {
        return
    }

    if (content.type === 'output') {
        const data = asRecord(content.data)
        if (data && typeof data.type === 'string') {
            formatClaudeMessageForInk(data as SDKMessage, messageBuffer)
        }
        return
    }

    if (content.type === 'codex') {
        formatCodexContent(asRecord(content.data), messageBuffer)
        return
    }

    if (content.type === 'event') {
        formatEventContent(asRecord(content.data), messageBuffer)
    }
}

function formatCodexContent(content: Record<string, unknown> | null, messageBuffer: MessageBuffer): void {
    if (!content || typeof content.type !== 'string') {
        return
    }

    switch (content.type) {
        case 'message': {
            const text = asString(content.message)
            if (text) {
                messageBuffer.addMessage(text, 'assistant')
            }
            return
        }

        case 'reasoning': {
            const text = asString(content.message)
            if (text) {
                messageBuffer.addMessage(`[Reasoning] ${text}`, 'system')
            }
            return
        }

        case 'tool-call': {
            const name = asString(content.name) ?? 'Tool'
            messageBuffer.addMessage(`🔧 Tool: ${name}`, 'tool')
            if ('input' in content) {
                messageBuffer.addMessage(`Input: ${truncateForDisplay(stringifyForDisplay(content.input), 500)}`, 'tool')
            }
            return
        }

        case 'tool-call-result': {
            const callId = asString(content.callId)
            messageBuffer.addMessage(callId ? `✅ Tool Result (${callId})` : '✅ Tool Result', 'result')
            if ('output' in content) {
                messageBuffer.addMessage(truncateForDisplay(stringifyForDisplay(content.output), 500), 'result')
            }
            return
        }

        case 'token_count': {
            return
        }

        default: {
            if (process.env.DEBUG) {
                messageBuffer.addMessage(`[Unknown codex content: ${content.type}]`, 'status')
            }
        }
    }
}

function formatEventContent(content: Record<string, unknown> | null, messageBuffer: MessageBuffer): void {
    if (!content || typeof content.type !== 'string') {
        return
    }

    switch (content.type) {
        case 'switch': {
            const mode = asString(content.mode) ?? 'unknown'
            messageBuffer.addMessage(`🔁 Session switched to ${mode} mode`, 'status')
            return
        }

        case 'message': {
            const message = asString(content.message)
            if (message) {
                messageBuffer.addMessage(message, 'status')
            }
            return
        }

        case 'permission-mode-changed': {
            const mode = asString(content.mode) ?? 'unknown'
            messageBuffer.addMessage(`🔐 Permission mode: ${mode}`, 'system')
            return
        }

        case 'ready': {
            messageBuffer.addMessage('✅ Ready for next message', 'status')
            return
        }

        default: {
            if (process.env.DEBUG) {
                messageBuffer.addMessage(`[Unknown session event: ${content.type}]`, 'status')
            }
        }
    }
}

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object') {
        return null
    }
    return value as Record<string, unknown>
}

function asString(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null
}

function stringifyForDisplay(value: unknown): string {
    if (typeof value === 'string') {
        return value
    }

    try {
        return JSON.stringify(value, null, 2)
    } catch {
        return String(value)
    }
}

function truncateForDisplay(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
        return value
    }
    return `${value.slice(0, maxLength)}... (truncated)`
}
