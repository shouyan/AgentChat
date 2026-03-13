import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DecryptedMessage, Session } from '@agentchat/protocol/types'
import type { SyncEngine } from '../../sync/syncEngine'
import { createConfiguration, getConfiguration } from '../../configuration'
import { createCliRoutes } from './cli'

let tempHomeDir: string | null = null
let authToken = 'testtoken'

beforeAll(async () => {
    try {
        authToken = getConfiguration().cliApiToken
        return
    } catch {
        tempHomeDir = mkdtempSync(join(tmpdir(), 'agentchat-cli-routes-'))
        process.env.AGENTCHAT_HOME = tempHomeDir
        process.env.CLI_API_TOKEN = authToken
        authToken = (await createConfiguration()).cliApiToken
    }
})

afterAll(() => {
    if (tempHomeDir) {
        rmSync(tempHomeDir, { recursive: true, force: true })
    }
})

describe('createCliRoutes user-message endpoint', () => {
    it('sends a trimmed terminal message for an active session', async () => {
        const sendMessage = mock(async () => createStoredMessage())
        const app = createCliRoutes(() => createEngine({
            sendMessage,
            resolveSessionAccess: () => ({
                ok: true,
                sessionId: 'canonical-session',
                session: createSession('canonical-session', { active: true }),
            }),
        }))

        const response = await app.request(new Request('http://localhost/sessions/session-alias/user-message', {
            method: 'POST',
            headers: {
                authorization: `Bearer ${authToken}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                text: '  hello from terminal  ',
                localId: 'local-1',
            }),
        }))

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ ok: true })
        expect(sendMessage).toHaveBeenCalledTimes(1)
        expect(sendMessage).toHaveBeenCalledWith('canonical-session', {
            text: 'hello from terminal',
            localId: 'local-1',
            sentFrom: 'cli-attach',
        })
    })

    it('rejects sending to an inactive session', async () => {
        const sendMessage = mock(async () => createStoredMessage())
        const app = createCliRoutes(() => createEngine({
            sendMessage,
            resolveSessionAccess: () => ({
                ok: true,
                sessionId: 'session-1',
                session: createSession('session-1', { active: false }),
            }),
        }))

        const response = await app.request(new Request('http://localhost/sessions/session-1/user-message', {
            method: 'POST',
            headers: {
                authorization: `Bearer ${authToken}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify({ text: 'hello' }),
        }))

        expect(response.status).toBe(409)
        expect(await response.json()).toEqual({ error: 'Session is inactive' })
        expect(sendMessage).not.toHaveBeenCalled()
    })

    it('rejects invalid message bodies', async () => {
        const sendMessage = mock(async () => createStoredMessage())
        const app = createCliRoutes(() => createEngine({
            sendMessage,
            resolveSessionAccess: () => ({
                ok: true,
                sessionId: 'session-1',
                session: createSession('session-1', { active: true }),
            }),
        }))

        const response = await app.request(new Request('http://localhost/sessions/session-1/user-message', {
            method: 'POST',
            headers: {
                authorization: `Bearer ${authToken}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify({ text: '   ' }),
        }))

        expect(response.status).toBe(400)
        expect(await response.json()).toEqual({ error: 'Invalid body' })
        expect(sendMessage).not.toHaveBeenCalled()
    })
})

function createEngine(overrides: {
    sendMessage: (sessionId: string, payload: {
        text: string
        localId?: string | null
        sentFrom?: 'webapp' | 'feishu-bot' | 'cli-attach'
    }) => Promise<DecryptedMessage>
    resolveSessionAccess: SyncEngine['resolveSessionAccess']
}): SyncEngine {
    return {
        sendMessage: overrides.sendMessage,
        resolveSessionAccess: overrides.resolveSessionAccess,
    } as unknown as SyncEngine
}

function createSession(id: string, overrides: Partial<Session> = {}): Session {
    return {
        id,
        namespace: 'default',
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: true,
        activeAt: 1,
        metadata: null,
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 1,
        thinking: false,
        thinkingAt: 0,
        ...overrides,
    }
}

function createStoredMessage(): DecryptedMessage {
    return {
        id: 'message-1',
        seq: 1,
        localId: null,
        createdAt: 1,
        content: {
            role: 'user',
            content: {
                type: 'text',
                text: 'hello',
            },
        },
    }
}
