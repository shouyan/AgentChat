import React, { useEffect, useMemo, useState } from 'react'
import { Box, Text, useInput, useStdout } from 'ink'
import type { Session } from '@/api/types'
import type { MessageBuffer, BufferedMessage } from '@/ui/ink/messageBuffer'
import type { AttachConnectionState, AttachedSessionClient } from './AttachedSessionClient'
import { parseAttachInput } from './commands'

interface AttachSessionDisplayProps {
    client: AttachedSessionClient
    messageBuffer: MessageBuffer
    logPath?: string
    onExit: () => void | Promise<void>
    onSubmitInput: (text: string) => Promise<void>
}

type ActionState = 'refreshing' | 'exiting' | 'sending' | null

export const AttachSessionDisplay: React.FC<AttachSessionDisplayProps> = ({
    client,
    messageBuffer,
    logPath,
    onExit,
    onSubmitInput,
}) => {
    const [messages, setMessages] = useState<BufferedMessage[]>(() => messageBuffer.getMessages())
    const [session, setSession] = useState<Session>(() => client.getSession())
    const [connectionState, setConnectionState] = useState<AttachConnectionState>(() => client.getConnectionState())
    const [actionState, setActionState] = useState<ActionState>(null)
    const [composer, setComposer] = useState('')
    const [lastActionError, setLastActionError] = useState<string | null>(null)
    const { stdout } = useStdout()
    const terminalWidth = stdout.columns || 80
    const terminalHeight = stdout.rows || 24

    useEffect(() => {
        const unsubscribe = messageBuffer.onUpdate((next) => {
            setMessages(next)
        })
        return unsubscribe
    }, [messageBuffer])

    useEffect(() => {
        const handleSession = (next: Session) => {
            setSession(next)
        }
        const handleConnection = (next: AttachConnectionState) => {
            setConnectionState(next)
        }

        client.on('session', handleSession)
        client.on('connection-state', handleConnection)

        return () => {
            client.off('session', handleSession)
            client.off('connection-state', handleConnection)
        }
    }, [client])

    useInput(async (input, key) => {
        if (actionState) {
            return
        }

        if (key.ctrl && input === 'c') {
            setActionState('exiting')
            await Promise.resolve(onExit())
            return
        }

        if (key.return) {
            const parsed = parseAttachInput(composer)
            if (!parsed) {
                return
            }

            const nextActionState: ActionState = parsed.type === 'detach'
                ? 'exiting'
                : parsed.type === 'refresh'
                    ? 'refreshing'
                    : parsed.type === 'message'
                        ? 'sending'
                        : null

            if (nextActionState) {
                setActionState(nextActionState)
            }
            setLastActionError(null)

            try {
                await Promise.resolve(onSubmitInput(composer))
                if (parsed.type !== 'detach') {
                    setComposer('')
                }
            } catch (error) {
                setLastActionError(formatActionError(error))
            } finally {
                if (parsed.type !== 'detach' && nextActionState) {
                    setActionState(null)
                }
            }
            return
        }

        if (key.backspace || key.delete) {
            setLastActionError(null)
            setComposer((current) => current.slice(0, -1))
            return
        }

        if (key.ctrl && input === 'u') {
            setLastActionError(null)
            setComposer('')
            return
        }

        if (!key.ctrl && !key.meta && input.length > 0) {
            setLastActionError(null)
            setComposer((current) => current + input)
        }
    }, { isActive: true })

    const header = useMemo(() => buildHeaderLines(session, connectionState), [session, connectionState])

    return (
        <Box flexDirection="column" width={terminalWidth} height={terminalHeight}>
            <Box
                flexDirection="column"
                width={terminalWidth}
                height={terminalHeight - 6}
                borderStyle="round"
                borderColor="gray"
                paddingX={1}
                overflow="hidden"
            >
                <Box flexDirection="column" marginBottom={1}>
                    <Text color="gray" bold>{header.title}</Text>
                    <Text color="gray" dimColor>{'─'.repeat(Math.min(terminalWidth - 4, 60))}</Text>
                    {header.lines.map((line) => (
                        <Text key={line} color="gray">{line}</Text>
                    ))}
                </Box>

                <Box flexDirection="column" height={Math.max(1, terminalHeight - 14)} overflow="hidden">
                    {messages.length === 0 ? (
                        <Text color="gray" dimColor>Waiting for session history...</Text>
                    ) : (
                        messages.slice(-Math.max(1, terminalHeight - 14)).map((msg) => (
                            <Box key={msg.id} flexDirection="column" marginBottom={1}>
                                <Text color={getMessageColor(msg.type)} dimColor>{formatMessage(msg.content, terminalWidth)}</Text>
                            </Box>
                        ))
                    )}
                </Box>
            </Box>

            <Box
                width={terminalWidth}
                borderStyle="round"
                borderColor={actionState ? 'yellow' : lastActionError ? 'red' : 'green'}
                paddingX={2}
                justifyContent="center"
                alignItems="center"
                flexDirection="column"
            >
                {actionState === 'refreshing' ? (
                    <Text color="yellow" bold>Refreshing session snapshot...</Text>
                ) : actionState === 'sending' ? (
                    <Text color="yellow" bold>Sending message to session...</Text>
                ) : actionState === 'exiting' ? (
                    <Text color="yellow" bold>Detaching from session...</Text>
                ) : lastActionError ? (
                    <Text color="red" bold>Last action failed. Enter retry • Ctrl-U clear • /detach exit</Text>
                ) : (
                    <Text color="green" bold>💬 Interactive attach • Enter send • /refresh • /detach • Ctrl-C exit</Text>
                )}
                {lastActionError ? (
                    <Text color="red">{formatFooterLine(lastActionError, terminalWidth)}</Text>
                ) : null}
                <Text color="white">{formatComposer(composer, terminalWidth)}</Text>
                {process.env.DEBUG && logPath ? (
                    <Text color="gray" dimColor>Debug logs: {logPath}</Text>
                ) : null}
            </Box>
        </Box>
    )
}

function buildHeaderLines(session: Session, connectionState: AttachConnectionState): { title: string; lines: string[] } {
    const metadata = session.metadata
    const flavor = metadata?.flavor ?? 'session'
    const lifecycle = metadata?.lifecycleState ?? (session.active ? 'running' : 'inactive')
    const lines = [
        `Session: ${session.id}`,
        `Flavor: ${flavor} • Live: ${connectionState} • Lifecycle: ${lifecycle}`,
    ]

    if (metadata?.path) {
        lines.push(`Path: ${metadata.path}`)
    }
    if (metadata?.model ?? session.modelMode ?? session.permissionMode) {
        const parts = [
            metadata?.model ? `Model: ${metadata.model}` : null,
            session.modelMode ? `Model mode: ${session.modelMode}` : null,
            session.permissionMode ? `Permission: ${session.permissionMode}` : null,
        ].filter((value): value is string => Boolean(value))
        if (parts.length > 0) {
            lines.push(parts.join(' • '))
        }
    }
    if (metadata?.startedBy) {
        lines.push(`Started by: ${metadata.startedBy}`)
    }

    return {
        title: 'Attached Session View',
        lines,
    }
}

function getMessageColor(type: BufferedMessage['type']): string {
    switch (type) {
        case 'user': return 'magenta'
        case 'assistant': return 'cyan'
        case 'system': return 'blue'
        case 'tool': return 'yellow'
        case 'result': return 'green'
        case 'status': return 'gray'
        default: return 'white'
    }
}

function formatMessage(content: string, terminalWidth: number): string {
    const lines = content.split('\n')
    const maxLineLength = Math.max(10, terminalWidth - 10)
    return lines.map((line) => {
        if (line.length <= maxLineLength) {
            return line
        }
        const chunks: string[] = []
        for (let index = 0; index < line.length; index += maxLineLength) {
            chunks.push(line.slice(index, index + maxLineLength))
        }
        return chunks.join('\n')
    }).join('\n')
}

function formatComposer(composer: string, terminalWidth: number): string {
    const label = '> '
    const placeholder = 'Type a message or /help'
    const maxLength = Math.max(10, terminalWidth - 8)
    const content = composer.length > 0 ? composer : placeholder
    const line = `${label}${content}`
    if (line.length <= maxLength) {
        return line
    }
    return `${line.slice(-maxLength)}`
}

function formatActionError(error: unknown): string {
    if (error instanceof Error && error.message) {
        return error.message
    }
    return String(error)
}

function formatFooterLine(content: string, terminalWidth: number): string {
    const maxLength = Math.max(10, terminalWidth - 8)
    if (content.length <= maxLength) {
        return content
    }
    return `${content.slice(0, maxLength - 1)}…`
}
