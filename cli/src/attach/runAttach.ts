import React from 'react'
import { render } from 'ink'
import { getAuthToken } from '@/api/auth'
import { logger } from '@/ui/logger'
import { MessageBuffer } from '@/ui/ink/messageBuffer'
import { AttachedSessionClient, fetchAttachedSessionSnapshot } from './AttachedSessionClient'
import { AttachSessionDisplay } from './AttachSessionDisplay'
import { formatAttachedMessage } from './formatAttachedMessage'

export async function runAttach(opts: { sessionId: string }): Promise<void> {
    if (!process.stdout.isTTY || !process.stdin.isTTY) {
        throw new Error('agentchat attach requires an interactive terminal')
    }

    const token = getAuthToken()
    const session = await fetchAttachedSessionSnapshot(token, opts.sessionId)
    const client = new AttachedSessionClient(token, session)
    const messageBuffer = new MessageBuffer()
    const logPath = logger.getLogPath()

    messageBuffer.addMessage(`Attached to session ${session.id}`, 'status')
    messageBuffer.addMessage('Read-only mode; detaching will not stop the underlying agent session.', 'status')

    let sawConnectedState = false
    const handleMessage = (message: Parameters<typeof formatAttachedMessage>[0]) => {
        formatAttachedMessage(message, messageBuffer)
    }
    const handleError = (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        messageBuffer.addMessage(`Attach error: ${message}`, 'status')
    }
    const handleConnectionState = (state: string) => {
        if (state === 'connected') {
            if (sawConnectedState) {
                messageBuffer.addMessage('Live updates reconnected.', 'status')
            }
            sawConnectedState = true
            return
        }

        if (state === 'disconnected' && sawConnectedState) {
            messageBuffer.addMessage('Live updates disconnected; waiting to reconnect...', 'status')
        }
    }

    client.on('message', handleMessage)
    client.on('error', handleError)
    client.on('connection-state', handleConnectionState)

    let resolved = false
    let resolveExit: (() => void) | null = null
    const waitForExit = new Promise<void>((resolve) => {
        resolveExit = resolve
    })

    const finish = async () => {
        if (resolved) {
            return
        }
        resolved = true
        try {
            await client.close()
        } finally {
            ink.unmount()
            resolveExit?.()
        }
    }

    const ink = render(
        React.createElement(AttachSessionDisplay, {
            client,
            messageBuffer,
            logPath: process.env.DEBUG ? logPath : undefined,
            onExit: finish,
            onRefresh: async () => {
                await client.refreshAll()
                messageBuffer.addMessage('Session snapshot refreshed.', 'status')
            },
        }),
        {
            exitOnCtrlC: false,
            patchConsole: false,
        }
    )

    try {
        await client.start()
        await waitForExit
    } catch (error) {
        await client.close().catch(() => {})
        ink.unmount()
        throw error
    }
}
