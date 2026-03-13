import { describe, expect, it } from 'bun:test'
import type { DecryptedMessage, ModelMode, Session } from '@agentchat/protocol/types'
import { testProjectPath } from '@agentchat/protocol/testPaths'
import { routeFeishuCommand } from './commandRouter'
import { FeishuInboundHandler, parseFeishuIncomingTextMessage, parseFeishuMenuEvent } from './inbound'
import { FeishuSessionBridge } from './sessionBridge'
import type { FeishuApiMessageClient, FeishuRepositoryLike } from './types'

function createSession(id: string, namespace = 'default', overrides: Partial<Session> = {}): Session {
    return {
        id,
        namespace,
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: true,
        activeAt: 1,
        metadata: {
            path: testProjectPath('project'),
            host: 'test-host',
            machineId: 'machine-1',
            flavor: 'claude',
            name: 'Test session',
        },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 1,
        thinking: false,
        thinkingAt: 0,
        ...overrides,
    }
}

function createRoom(id: string, namespace = 'default', name = 'Test room') {
    return {
        id,
        namespace,
        createdAt: 1,
        updatedAt: 1,
        metadata: { name },
        state: {
            roles: [] as unknown[],
            tasks: [] as unknown[],
            summary: '',
        }
    }
}

class MemoryFeishuRepository implements FeishuRepositoryLike {
    readonly inbound = new Set<string>()
    readonly menuEvents = new Set<string>()
    readonly sessionState = new Map<string, {
        openId: string
        namespace: string
        activeSessionId: string | null
        activeRoomId: string | null
        activeTargetType: 'session' | 'room' | null
        activeMachineId: string | null
    }>()

    constructor(
        private readonly bindings: Record<string, string> = {},
        private readonly allowed: string[] = []
    ) {
    }

    isOpenIdAllowed(openId: string): boolean {
        return this.allowed.length === 0 || this.allowed.includes(openId)
    }

    resolveNamespaceForOpenId(openId: string): string | null {
        return this.bindings[openId] ?? null
    }

    hasInboundMessage(messageId: string): boolean {
        return this.inbound.has(messageId)
    }

    recordInboundMessage(input: { messageId: string }): void {
        this.inbound.add(input.messageId)
    }


    hasMenuEvent(eventId: string): boolean {
        return this.menuEvents.has(eventId)
    }

    recordMenuEvent(input: { eventId: string }): void {
        this.menuEvents.add(input.eventId)
    }

    getSessionState(openId: string) {
        return this.sessionState.get(openId) ?? null
    }

    setSessionState(input: {
        openId: string
        namespace: string
        activeSessionId?: string | null
        activeRoomId?: string | null
        activeTargetType?: 'session' | 'room' | null
        activeMachineId?: string | null
    }): void {
        const existing = this.sessionState.get(input.openId)
        this.sessionState.set(input.openId, {
            openId: input.openId,
            namespace: input.namespace,
            activeSessionId: input.activeSessionId ?? existing?.activeSessionId ?? null,
            activeRoomId: input.activeRoomId ?? existing?.activeRoomId ?? null,
            activeTargetType: input.activeTargetType ?? existing?.activeTargetType ?? null,
            activeMachineId: input.activeMachineId ?? existing?.activeMachineId ?? null,
        })
    }
}

class FakeEngine {
    readonly sessions = new Map<string, Session>()
    readonly rooms = new Map<string, {
        id: string
        namespace: string
        createdAt: number
        updatedAt: number
        metadata: { name: string }
        state: { roles: unknown[]; tasks: unknown[]; summary: string }
    }>()
    readonly machines = new Map<string, { id: string; namespace: string; metadata: { host: string; homeDir: string; displayName?: string } | null }>()
    readonly messages = new Map<string, DecryptedMessage[]>()
    readonly roomMessages = new Map<string, Array<{
        id: string
        roomId: string
        seq: number | null
        senderType: 'user' | 'session' | 'system'
        senderId: string
        roleKey?: string
        content: { type: 'text' | 'system'; text: string; meta?: Record<string, unknown> }
        createdAt: number
    }>>()
    readonly sentMessages: Array<{ sessionId: string; text: string; localId?: string | null }> = []
    private readonly listeners = new Set<(event: { type: string; sessionId?: string; message?: DecryptedMessage }) => void>()
    private spawnCount = 0
    spawnError: string | null = null
    lastSpawnRequest: { machineId: string; directory: string; agent?: string; model?: string } | null = null
    lastSessionConfig: { sessionId: string; config: { modelMode?: ModelMode; model?: string } } | null = null

    subscribe(listener: (event: { type: string; sessionId?: string; message?: DecryptedMessage }) => void): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    emitMessage(sessionId: string, message: DecryptedMessage): void {
        for (const listener of this.listeners) {
            listener({ type: 'message-received', sessionId, message })
        }
    }

    emitRoomMessage(roomId: string, message: {
        id: string
        roomId: string
        seq: number | null
        senderType: 'user' | 'session' | 'system'
        senderId: string
        roleKey?: string
        content: { type: 'text' | 'system'; text: string; meta?: Record<string, unknown> }
        createdAt: number
    }): void {
        for (const listener of this.listeners) {
            listener({ type: 'room-message-received', roomId, message, namespace: 'default' } as never)
        }
    }

    getSessionByNamespace(sessionId: string, namespace: string): Session | undefined {
        const session = this.sessions.get(sessionId)
        if (!session || session.namespace !== namespace) {
            return undefined
        }
        return session
    }

    getRoomsByNamespace(namespace: string) {
        return [...this.rooms.values()].filter((room) => room.namespace === namespace)
    }

    getRoomByNamespace(roomId: string, namespace: string) {
        const room = this.rooms.get(roomId)
        if (!room || room.namespace !== namespace) {
            return undefined
        }
        return room
    }

    getOnlineMachinesByNamespace(namespace: string) {
        return [...this.machines.values()].filter((machine) => machine.namespace === namespace)
    }

    getMachineByNamespace(machineId: string, namespace: string) {
        const machine = this.machines.get(machineId)
        if (!machine || machine.namespace !== namespace) {
            return undefined
        }
        return machine
    }

    async sendMessage(sessionId: string, payload: { text: string; localId?: string | null }): Promise<DecryptedMessage> {
        this.sentMessages.push({ sessionId, text: payload.text, localId: payload.localId })
        return {
            id: `user-${this.sentMessages.length}`,
            seq: 1,
            localId: payload.localId ?? null,
            content: {
                role: 'user',
                content: {
                    type: 'text',
                    text: payload.text,
                }
            },
            createdAt: Date.now(),
        }
    }

    async sendRoomMessage(
        roomId: string,
        namespace: string,
        payload: {
            senderType: 'user' | 'session' | 'system'
            senderId: string
            content: { type: 'text' | 'system'; text: string; meta?: Record<string, unknown> }
        }
    ) {
        const room = this.getRoomByNamespace(roomId, namespace)
        if (!room) {
            throw new Error('Room not found')
        }
        const currentMessages = this.roomMessages.get(roomId) ?? []
        const message = {
            id: `room-${currentMessages.length + 1}`,
            roomId,
            seq: currentMessages.length + 1,
            senderType: payload.senderType,
            senderId: payload.senderId,
            content: payload.content,
            createdAt: Date.now(),
        }
        this.roomMessages.set(roomId, [...currentMessages, message])
        room.updatedAt = message.createdAt
        return message
    }

    async spawnSession(machineId: string, directory: string, agent?: string, model?: string) {
        this.lastSpawnRequest = { machineId, directory, agent, model }
        if (this.spawnError) {
            return { type: 'error' as const, message: this.spawnError }
        }
        this.spawnCount += 1
        const sessionId = `spawned-${this.spawnCount}`
        this.sessions.set(sessionId, createSession(sessionId, 'default', {
            metadata: {
                path: directory,
                host: 'test-host',
                machineId,
                flavor: agent ?? 'claude',
                name: `Spawned ${this.spawnCount}`,
            }
        }))
        return { type: 'success' as const, sessionId }
    }

    async waitForSessionActive(): Promise<boolean> {
        return true
    }

    getMessagesPage(sessionId: string) {
        return {
            messages: this.messages.get(sessionId) ?? [],
            page: {
                limit: 40,
                beforeSeq: null,
                nextBeforeSeq: null,
                hasMore: false,
            }
        }
    }

    getRoomMessagesPage(roomId: string) {
        return {
            messages: this.roomMessages.get(roomId) ?? [],
            page: {
                limit: 40,
                beforeSeq: null,
                nextBeforeSeq: null,
                hasMore: false,
            }
        }
    }

    getSessionsByNamespace(namespace: string): Session[] {
        return [...this.sessions.values()].filter((session) => session.namespace === namespace)
    }

    async applySessionConfig(sessionId: string, config: { modelMode?: ModelMode; model?: string }): Promise<void> {
        this.lastSessionConfig = { sessionId, config }
        const session = this.sessions.get(sessionId)
        if (!session) {
            throw new Error('Session not found')
        }
        if (config.modelMode !== undefined) {
            session.modelMode = config.modelMode
        }
        if (config.model !== undefined && session.metadata) {
            session.metadata = {
                ...session.metadata,
                model: config.model,
            }
        }
    }
}

function commandDeps(engine: FakeEngine, repository: MemoryFeishuRepository): Parameters<typeof routeFeishuCommand>[0] {
    return {
        engine: engine as unknown as Parameters<typeof routeFeishuCommand>[0]['engine'],
        repository,
        publicUrl: 'http://localhost:3217',
        accessToken: 'test-token',
        autoCreateSession: true,
        defaultMachineId: null,
    }
}

describe('parseFeishuIncomingTextMessage', () => {
    it('extracts p2p text payload', () => {
        const parsed = parseFeishuIncomingTextMessage({
            sender: { sender_id: { open_id: 'ou_1' } },
            message: {
                message_id: 'om_1',
                message_type: 'text',
                chat_type: 'p2p',
                content: JSON.stringify({ text: 'hello' }),
            }
        })

        expect(parsed).toEqual({
            openId: 'ou_1',
            messageId: 'om_1',
            chatType: 'p2p',
            text: 'hello',
        })
    })
})

describe('parseFeishuMenuEvent', () => {
    it('extracts menu push event payload', () => {
        const parsed = parseFeishuMenuEvent({
            event_id: 'evt_1',
            event_key: 'session_list',
            operator: {
                operator_id: {
                    open_id: 'ou_1'
                }
            }
        })
        expect(parsed).toEqual({
            openId: 'ou_1',
            eventKey: 'session_list',
            eventId: 'evt_1',
        })
    })
})

describe('routeFeishuCommand', () => {
    it('formats recent sessions with title and relative time', async () => {
        const engine = new FakeEngine()
        engine.sessions.set('session-1', createSession('session-1', 'default', {
            updatedAt: Date.now() - 2 * 60_000,
            metadata: {
                path: testProjectPath('project-alpha'),
                host: 'test-host',
                machineId: 'machine-1',
                flavor: 'codex',
                name: 'Fix Feishu menu event routing',
            },
        }))
        const repository = new MemoryFeishuRepository({ ou_1: 'default' })
        repository.setSessionState({
            openId: 'ou_1',
            namespace: 'default',
            activeSessionId: 'session-1',
        })

        const result = await routeFeishuCommand({
            engine: engine as unknown as Parameters<typeof routeFeishuCommand>[0]['engine'],
            repository,
            publicUrl: 'http://localhost:3217',
            accessToken: 'test-token',
            autoCreateSession: true,
            defaultMachineId: null,
        }, {
            openId: 'ou_1',
            namespace: 'default',
        }, '/sessions', {
            createSession: async () => ({ sessionId: 'unused', machineId: null })
        })

        expect(result.handled).toBe(true)
        if (!result.handled) {
            throw new Error('expected handled result')
        }
        expect(result.response).toContain('最近目标：')
        expect(result.response).toContain('[会话] Fix Feishu menu event routi…')
        expect(result.response).toContain('Fix Feishu menu event routi…')
        expect(result.response).toContain('session-')
        expect(result.response).toContain('分钟前')
        expect(result.response).toContain('codex · default')
        expect(result.response).toContain('发送 /use <编号> 切换目标。')
    })


    it('creates a session with requested agent', async () => {
        const engine = new FakeEngine()
        engine.machines.set('machine-1', {
            id: 'machine-1',
            namespace: 'default',
            metadata: {
                host: 'test-host',
                homeDir: '/Users/test',
                displayName: 'Test Machine',
            }
        })
        const repository = new MemoryFeishuRepository({ ou_1: 'default' })
        const result = await routeFeishuCommand({
            engine: engine as unknown as Parameters<typeof routeFeishuCommand>[0]['engine'],
            repository,
            publicUrl: 'http://localhost:3217',
            accessToken: 'test-token',
            autoCreateSession: true,
            defaultMachineId: null,
        }, {
            openId: 'ou_1',
            namespace: 'default',
        }, '/new codex', {
            createSession: async ({ namespace: targetNamespace, preferredMachineId, agent, directory }) => {
                const bridge = new FeishuSessionBridge({
                    engine: engine as unknown as Parameters<typeof routeFeishuCommand>[0]['engine'],
                    repository,
                    apiClient: { async sendText() { return 'om_1' } },
                    publicUrl: 'http://localhost:3217',
                    accessToken: 'test-token',
                    replyTimeoutMs: 200,
                    spawnStrategy: { autoCreateSession: true, defaultMachineId: null }
                })
                return await bridge.createSessionForUser({
                    openId: 'ou_1',
                    namespace: targetNamespace,
                    preferredMachineId,
                    agent,
                    directory,
                })
            }
        })

        expect(result.handled).toBe(true)
        if (!result.handled) throw new Error('expected handled result')
        expect(result.response).toContain('Agent: codex')
        expect(engine.lastSpawnRequest).toEqual({
            machineId: 'machine-1',
            directory: '/Users/test',
            agent: 'codex',
            model: undefined,
        })
    })

    it('creates a session with requested directory', async () => {
        const engine = new FakeEngine()
        engine.machines.set('machine-1', {
            id: 'machine-1',
            namespace: 'default',
            metadata: {
                host: 'test-host',
                homeDir: '/Users/test',
                displayName: 'Test Machine',
            }
        })
        const repository = new MemoryFeishuRepository({ ou_1: 'default' })
        const result = await routeFeishuCommand(commandDeps(engine, repository), {
            openId: 'ou_1',
            namespace: 'default',
        }, '/new codex /Users/test/work/project-a', {
            createSession: async ({ namespace: targetNamespace, preferredMachineId, agent, directory }) => {
                const bridge = new FeishuSessionBridge({
                    engine: engine as unknown as Parameters<typeof routeFeishuCommand>[0]['engine'],
                    repository,
                    apiClient: { async sendText() { return 'om_1' } },
                    publicUrl: 'http://localhost:3217',
                    accessToken: 'test-token',
                    replyTimeoutMs: 200,
                    spawnStrategy: { autoCreateSession: true, defaultMachineId: null }
                })
                return await bridge.createSessionForUser({
                    openId: 'ou_1',
                    namespace: targetNamespace,
                    preferredMachineId,
                    agent,
                    directory,
                })
            }
        })

        expect(result.handled).toBe(true)
        if (!result.handled) throw new Error('expected handled result')
        expect(result.response).toContain('目录：/Users/test/work/project-a')
        expect(engine.lastSpawnRequest).toEqual({
            machineId: 'machine-1',
            directory: '/Users/test/work/project-a',
            agent: 'codex',
            model: undefined,
        })
    })

    it('keeps /new codex model unspecified by default', async () => {
        const engine = new FakeEngine()
        engine.machines.set('machine-1', {
            id: 'machine-1',
            namespace: 'default',
            metadata: {
                host: 'test-host',
                homeDir: '/Users/test',
                displayName: 'Test Machine',
            }
        })
        const repository = new MemoryFeishuRepository({ ou_1: 'default' })
        const result = await routeFeishuCommand({
            engine: engine as unknown as Parameters<typeof routeFeishuCommand>[0]['engine'],
            repository,
            publicUrl: 'http://localhost:3217',
            accessToken: 'test-token',
            autoCreateSession: true,
            defaultMachineId: null,
        }, {
            openId: 'ou_1',
            namespace: 'default',
        }, '/new codex', {
            createSession: async ({ namespace: targetNamespace, preferredMachineId, agent, directory }) => {
                const bridge = new FeishuSessionBridge({
                    engine: engine as unknown as Parameters<typeof routeFeishuCommand>[0]['engine'],
                    repository,
                    apiClient: { async sendText() { return 'om_1' } },
                    publicUrl: 'http://localhost:3217',
                    accessToken: 'test-token',
                    replyTimeoutMs: 200,
                    spawnStrategy: { autoCreateSession: true, defaultMachineId: null }
                })
                return await bridge.createSessionForUser({
                    openId: 'ou_1',
                    namespace: targetNamespace,
                    preferredMachineId,
                    agent,
                    directory,
                })
            }
        })

        expect(result.handled).toBe(true)
        if (!result.handled) throw new Error('expected handled result')
        expect(result.response).toContain('Agent: codex')
        expect(result.response).not.toContain('Model:')
        expect(engine.lastSpawnRequest).toEqual({
            machineId: 'machine-1',
            directory: '/Users/test',
            agent: 'codex',
            model: undefined,
        })
    })

    it('lists sessions and switches active session', async () => {
        const engine = new FakeEngine()
        engine.sessions.set('session-1', createSession('session-1'))
        engine.sessions.set('session-2', createSession('session-2', 'default', {
            metadata: {
                path: testProjectPath('other'),
                host: 'test-host',
                machineId: 'machine-1',
                flavor: 'codex',
                name: 'Other session',
            },
            updatedAt: 2,
        }))
        engine.messages.set('session-1', [{
            id: 'assistant-1',
            seq: 2,
            localId: null,
            createdAt: Date.now(),
            content: {
                role: 'agent',
                content: {
                    type: 'output',
                    data: {
                        type: 'assistant',
                        message: {
                            content: [{ type: 'text', text: '最新进展：飞书菜单事件已接通。' }]
                        }
                    }
                }
            }
        }])
        const repository = new MemoryFeishuRepository({ ou_1: 'default' })
        const result = await routeFeishuCommand({
            engine: engine as unknown as Parameters<typeof routeFeishuCommand>[0]['engine'],
            repository,
            publicUrl: 'http://localhost:3217',
            accessToken: 'test-token',
            autoCreateSession: true,
            defaultMachineId: null,
        }, {
            openId: 'ou_1',
            namespace: 'default',
        }, '/use 2', {
            createSession: async () => ({ sessionId: 'unused', machineId: null })
        })

        expect(result.handled).toBe(true)
        if (!result.handled) {
            throw new Error('expected handled result')
        }
        expect(result.response).toContain('已切换到会话')
        expect(result.response).toContain('最近一条消息：最新进展：飞书菜单事件已接通。')
        expect(repository.getSessionState('ou_1')?.activeSessionId).toBe('session-1')
    })

    it('returns current progress from active session', async () => {
        const engine = new FakeEngine()
        engine.sessions.set('session-1', createSession('session-1', 'default', {
            metadata: {
                path: testProjectPath('project'),
                host: 'test-host',
                machineId: 'machine-1',
                flavor: 'codex',
                name: 'Feishu progress session',
            },
        }))
        engine.messages.set('session-1', [{
            id: 'assistant-1',
            seq: 2,
            localId: null,
            createdAt: Date.now(),
            content: {
                role: 'agent',
                content: {
                    type: 'output',
                    data: {
                        type: 'assistant',
                        message: {
                            content: [{ type: 'text', text: '最新回复：Codex 已完成飞书联调验证。' }]
                        }
                    }
                }
            }
        }])
        const repository = new MemoryFeishuRepository({ ou_1: 'default' })
        repository.setSessionState({
            openId: 'ou_1',
            namespace: 'default',
            activeSessionId: 'session-1',
        })

        const result = await routeFeishuCommand({
            engine: engine as unknown as Parameters<typeof routeFeishuCommand>[0]['engine'],
            repository,
            publicUrl: 'http://localhost:3217',
            accessToken: 'test-token',
            autoCreateSession: true,
            defaultMachineId: null,
        }, {
            openId: 'ou_1',
            namespace: 'default',
        }, '/progress', {
            createSession: async () => ({ sessionId: 'unused', machineId: null })
        })

        expect(result.handled).toBe(true)
        if (!result.handled) {
            throw new Error('expected handled result')
        }
        expect(result.response).toContain('当前会话：Feishu progress session')
        expect(result.response).toContain('最近回复：最新回复：Codex 已完成飞书联调验证。')
    })

    it('shows current model status for codex sessions', async () => {
        const engine = new FakeEngine()
        engine.sessions.set('session-1', createSession('session-1', 'default', {
            metadata: {
                path: testProjectPath('codex'),
                host: 'test-host',
                machineId: 'machine-1',
                flavor: 'codex',
                model: 'gpt-5.4',
                name: 'Codex work',
            }
        }))
        const repository = new MemoryFeishuRepository({ ou_1: 'default' })
        repository.setSessionState({
            openId: 'ou_1',
            namespace: 'default',
            activeSessionId: 'session-1',
            activeTargetType: 'session',
        })

        const result = await routeFeishuCommand(commandDeps(engine, repository), {
            openId: 'ou_1',
            namespace: 'default',
        }, '/model', {
            createSession: async () => ({ sessionId: 'session-1', machineId: 'machine-1' })
        })

        expect(result.handled).toBe(true)
        if (!result.handled) throw new Error('expected handled result')
        expect(result.response).toContain('当前模型：gpt-5.4')
        expect(result.response).toContain('/model list')
    })

    it('shows current working directory for the active session', async () => {
        const engine = new FakeEngine()
        engine.sessions.set('session-1', createSession('session-1', 'default', {
            metadata: {
                path: '/Users/test/work/project-a',
                host: 'test-host',
                machineId: 'machine-1',
                flavor: 'codex',
                name: 'Codex work',
            }
        }))
        const repository = new MemoryFeishuRepository({ ou_1: 'default' })
        repository.setSessionState({
            openId: 'ou_1',
            namespace: 'default',
            activeSessionId: 'session-1',
            activeTargetType: 'session',
        })

        const result = await routeFeishuCommand(commandDeps(engine, repository), {
            openId: 'ou_1',
            namespace: 'default',
        }, '/pwd', {
            createSession: async () => ({ sessionId: 'session-1', machineId: 'machine-1' })
        })

        expect(result.handled).toBe(true)
        if (!result.handled) throw new Error('expected handled result')
        expect(result.response).toContain('目录：/Users/test/work/project-a')
    })

    it('switches codex model for the active session', async () => {
        const engine = new FakeEngine()
        engine.sessions.set('session-1', createSession('session-1', 'default', {
            metadata: {
                path: testProjectPath('codex'),
                host: 'test-host',
                machineId: 'machine-1',
                flavor: 'codex',
                name: 'Codex work',
            }
        }))
        const repository = new MemoryFeishuRepository({ ou_1: 'default' })
        repository.setSessionState({
            openId: 'ou_1',
            namespace: 'default',
            activeSessionId: 'session-1',
            activeTargetType: 'session',
        })

        const result = await routeFeishuCommand(commandDeps(engine, repository), {
            openId: 'ou_1',
            namespace: 'default',
        }, '/model gpt-5.4', {
            createSession: async () => ({ sessionId: 'session-1', machineId: 'machine-1' })
        })

        expect(result.handled).toBe(true)
        if (!result.handled) throw new Error('expected handled result')
        expect(result.response).toContain('已切换模型。')
        expect(engine.lastSessionConfig).toEqual({
            sessionId: 'session-1',
            config: { model: 'gpt-5.4' }
        })
    })

    it('switches claude model mode for the active session', async () => {
        const engine = new FakeEngine()
        engine.sessions.set('session-1', createSession('session-1'))
        const repository = new MemoryFeishuRepository({ ou_1: 'default' })
        repository.setSessionState({
            openId: 'ou_1',
            namespace: 'default',
            activeSessionId: 'session-1',
            activeTargetType: 'session',
        })

        const result = await routeFeishuCommand(commandDeps(engine, repository), {
            openId: 'ou_1',
            namespace: 'default',
        }, '/model sonnet', {
            createSession: async () => ({ sessionId: 'session-1', machineId: 'machine-1' })
        })

        expect(result.handled).toBe(true)
        if (!result.handled) throw new Error('expected handled result')
        expect(engine.lastSessionConfig).toEqual({
            sessionId: 'session-1',
            config: { modelMode: 'sonnet' }
        })
    })

    it('rejects /model when current target is a room', async () => {
        const engine = new FakeEngine()
        engine.rooms.set('room-1', createRoom('room-1'))
        const repository = new MemoryFeishuRepository({ ou_1: 'default' })
        repository.setSessionState({
            openId: 'ou_1',
            namespace: 'default',
            activeRoomId: 'room-1',
            activeTargetType: 'room',
        })

        const result = await routeFeishuCommand(commandDeps(engine, repository), {
            openId: 'ou_1',
            namespace: 'default',
        }, '/model gpt-5.4', {
            createSession: async () => ({ sessionId: 'session-1', machineId: 'machine-1' })
        })

        expect(result).toEqual({
            handled: true,
            response: '当前目标是群组。请先发送 /sessions，再用 /use 切换到一个具体会话后再切换模型。'
        })
    })

    it('lists unified targets and switches active group via /use', async () => {
        const engine = new FakeEngine()
        engine.rooms.set('room-1', createRoom('room-1', 'default', 'Design Squad'))
        engine.rooms.set('room-2', createRoom('room-2', 'default', 'Review Squad'))
        engine.roomMessages.set('room-1', [{
            id: 'room-msg-1',
            roomId: 'room-1',
            seq: 1,
            senderType: 'session',
            senderId: 'session-1',
            content: { type: 'text', text: '最新群组进展：设计稿已确认。' },
            createdAt: Date.now(),
        }])
        engine.rooms.get('room-1')!.updatedAt = Date.now()
        const repository = new MemoryFeishuRepository({ ou_1: 'default' })

        const listResult = await routeFeishuCommand({
            engine: engine as unknown as Parameters<typeof routeFeishuCommand>[0]['engine'],
            repository,
            publicUrl: 'http://localhost:3217',
            accessToken: 'test-token',
            autoCreateSession: true,
            defaultMachineId: null,
        }, {
            openId: 'ou_1',
            namespace: 'default',
        }, '/sessions', {
            createSession: async () => ({ sessionId: 'unused', machineId: null })
        })

        expect(listResult.handled).toBe(true)
        if (!listResult.handled) throw new Error('expected handled result')
        expect(listResult.response).toContain('最近目标：')
        expect(listResult.response).toContain('[群组] Design Squad')
        expect(listResult.response).toContain('Design Squad')

        const switchResult = await routeFeishuCommand({
            engine: engine as unknown as Parameters<typeof routeFeishuCommand>[0]['engine'],
            repository,
            publicUrl: 'http://localhost:3217',
            accessToken: 'test-token',
            autoCreateSession: true,
            defaultMachineId: null,
        }, {
            openId: 'ou_1',
            namespace: 'default',
        }, '/use 1', {
            createSession: async () => ({ sessionId: 'unused', machineId: null })
        })

        expect(switchResult.handled).toBe(true)
        if (!switchResult.handled) throw new Error('expected handled result')
        expect(switchResult.response).toContain('已切换到群组')
        expect(switchResult.response).toContain('最近一条消息：最新群组进展：设计稿已确认。')
        expect(repository.getSessionState('ou_1')?.activeRoomId).toBe('room-1')
        expect(repository.getSessionState('ou_1')?.activeTargetType).toBe('room')
    })

    it('returns room progress when room reply is newer than session reply', async () => {
        const engine = new FakeEngine()
        engine.sessions.set('session-1', createSession('session-1', 'default', {
            metadata: {
                path: testProjectPath('project'),
                host: 'test-host',
                machineId: 'machine-1',
                flavor: 'codex',
                name: 'Old session',
            },
        }))
        engine.messages.set('session-1', [{
            id: 'assistant-1',
            seq: 2,
            localId: null,
            createdAt: Date.now() - 60_000,
            content: {
                role: 'agent',
                content: { type: 'text', text: '较早的 session 回复' }
            },
        }])
        engine.rooms.set('room-1', createRoom('room-1', 'default', 'War Room'))
        engine.roomMessages.set('room-1', [{
            id: 'room-msg-1',
            roomId: 'room-1',
            seq: 1,
            senderType: 'session',
            senderId: 'session-2',
            content: { type: 'text', text: '更近的群组回复：已经完成部署。' },
            createdAt: Date.now(),
        }])
        engine.rooms.get('room-1')!.updatedAt = Date.now()
        const repository = new MemoryFeishuRepository({ ou_1: 'default' })
        repository.setSessionState({
            openId: 'ou_1',
            namespace: 'default',
            activeSessionId: 'session-1',
            activeRoomId: 'room-1',
            activeTargetType: 'room',
        })

        const result = await routeFeishuCommand({
            engine: engine as unknown as Parameters<typeof routeFeishuCommand>[0]['engine'],
            repository,
            publicUrl: 'http://localhost:3217',
            accessToken: 'test-token',
            autoCreateSession: true,
            defaultMachineId: null,
        }, {
            openId: 'ou_1',
            namespace: 'default',
        }, '/progress', {
            createSession: async () => ({ sessionId: 'unused', machineId: null })
        })

        expect(result.handled).toBe(true)
        if (!result.handled) throw new Error('expected handled result')
        expect(result.response).toContain('当前群组：War Room')
        expect(result.response).toContain('最近回复：更近的群组回复：已经完成部署。')
    })
})

describe('FeishuInboundHandler + FeishuSessionBridge', () => {
    it('auto-creates session and relays assistant reply back to Feishu', async () => {
        const engine = new FakeEngine()
        engine.machines.set('machine-1', {
            id: 'machine-1',
            namespace: 'default',
            metadata: {
                host: 'test-host',
                homeDir: '/Users/test',
                displayName: 'Test Machine',
            }
        })
        const repository = new MemoryFeishuRepository({ ou_1: 'default' })
        const sentTexts: string[] = []
        const apiClient: FeishuApiMessageClient = {
            async sendText(_openId, text) {
                sentTexts.push(text)
                return `om_out_${sentTexts.length}`
            }
        }
        const bridge = new FeishuSessionBridge({
            engine: engine as unknown as Parameters<typeof routeFeishuCommand>[0]['engine'],
            repository,
            apiClient,
            publicUrl: 'http://localhost:3217',
            accessToken: 'test-token',
            replyTimeoutMs: 200,
            spawnStrategy: {
                autoCreateSession: true,
                defaultMachineId: null,
            }
        })
        const inbound = new FeishuInboundHandler({
            repository,
            apiClient,
            bridge,
            commandDeps: {
                engine: engine as unknown as Parameters<typeof routeFeishuCommand>[0]['engine'],
                repository,
                publicUrl: 'http://localhost:3217',
                accessToken: 'test-token',
                autoCreateSession: true,
                defaultMachineId: null,
            }
        })

        setTimeout(() => {
            engine.emitMessage('spawned-1', {
                id: 'assistant-1',
                seq: 2,
                localId: null,
                createdAt: Date.now(),
                content: {
                    role: 'agent',
                    content: {
                        type: 'output',
                        data: {
                            type: 'assistant',
                            message: {
                                content: [{ type: 'text', text: 'done from agent' }]
                            }
                        }
                    }
                }
            })
            engine.emitMessage('spawned-1', {
                id: 'ready-1',
                seq: 3,
                localId: null,
                createdAt: Date.now(),
                content: {
                    role: 'agent',
                    content: {
                        type: 'event',
                        data: { type: 'ready' }
                    }
                }
            })
        }, 10)

        await inbound.handleEvent({
            sender: { sender_id: { open_id: 'ou_1' } },
            message: {
                message_id: 'om_in_1',
                message_type: 'text',
                chat_type: 'p2p',
                content: JSON.stringify({ text: 'please help' }),
            }
        })

        expect(engine.sentMessages).toHaveLength(1)
        expect(engine.sentMessages[0]?.sessionId).toBe('spawned-1')
        expect(sentTexts.at(-1)).toBe('done from agent')
        expect(repository.getSessionState('ou_1')?.activeSessionId).toBe('spawned-1')
    })

    it('routes plain chat text into the active group and relays room reply back to Feishu', async () => {
        const engine = new FakeEngine()
        engine.rooms.set('room-1', createRoom('room-1', 'default', 'Ops Room'))
        const repository = new MemoryFeishuRepository({ ou_1: 'default' })
        repository.setSessionState({
            openId: 'ou_1',
            namespace: 'default',
            activeRoomId: 'room-1',
            activeTargetType: 'room',
        })
        const sentTexts: string[] = []
        const apiClient: FeishuApiMessageClient = {
            async sendText(_openId, text) {
                sentTexts.push(text)
                return `om_out_${sentTexts.length}`
            }
        }
        const bridge = new FeishuSessionBridge({
            engine: engine as unknown as Parameters<typeof routeFeishuCommand>[0]['engine'],
            repository,
            apiClient,
            publicUrl: 'http://localhost:3217',
            accessToken: 'test-token',
            replyTimeoutMs: 200,
            spawnStrategy: {
                autoCreateSession: true,
                defaultMachineId: null,
            }
        })
        const inbound = new FeishuInboundHandler({
            repository,
            apiClient,
            bridge,
            commandDeps: {
                engine: engine as unknown as Parameters<typeof routeFeishuCommand>[0]['engine'],
                repository,
                publicUrl: 'http://localhost:3217',
                accessToken: 'test-token',
                autoCreateSession: true,
                defaultMachineId: null,
            }
        })

        setTimeout(() => {
            engine.emitRoomMessage('room-1', {
                id: 'room-msg-2',
                roomId: 'room-1',
                seq: 2,
                senderType: 'session',
                senderId: 'session-ops',
                content: { type: 'text', text: '群组回复：正在处理告警。' },
                createdAt: Date.now(),
            })
        }, 10)

        await inbound.handleEvent({
            sender: { sender_id: { open_id: 'ou_1' } },
            message: {
                message_id: 'om_room_1',
                message_type: 'text',
                chat_type: 'p2p',
                content: JSON.stringify({ text: '请同步一下当前情况' }),
            }
        })

        expect(engine.roomMessages.get('room-1')?.[0]?.content.text).toBe('请同步一下当前情况')
        expect(sentTexts.at(-1)).toBe('群组回复：正在处理告警。')
    })


    it('returns agent runtime errors back to Feishu users', async () => {
        const engine = new FakeEngine()
        engine.machines.set('machine-1', {
            id: 'machine-1',
            namespace: 'default',
            metadata: {
                host: 'test-host',
                homeDir: '/Users/test',
                displayName: 'Test Machine',
            }
        })
        const repository = new MemoryFeishuRepository({ ou_1: 'default' })
        const sentTexts: string[] = []
        const apiClient: FeishuApiMessageClient = {
            async sendText(_openId, text) {
                sentTexts.push(text)
                return `om_out_${sentTexts.length}`
            }
        }
        const bridge = new FeishuSessionBridge({
            engine: engine as unknown as Parameters<typeof routeFeishuCommand>[0]['engine'],
            repository,
            apiClient,
            publicUrl: 'http://localhost:3217',
            accessToken: 'test-token',
            replyTimeoutMs: 200,
            spawnStrategy: {
                autoCreateSession: true,
                defaultMachineId: null,
            }
        })
        const inbound = new FeishuInboundHandler({
            repository,
            apiClient,
            bridge,
            commandDeps: {
                engine: engine as unknown as Parameters<typeof routeFeishuCommand>[0]['engine'],
                repository,
                publicUrl: 'http://localhost:3217',
                accessToken: 'test-token',
                autoCreateSession: true,
                defaultMachineId: null,
            }
        })

        setTimeout(() => {
            engine.emitMessage('spawned-1', {
                id: 'failed-1',
                seq: 2,
                localId: null,
                createdAt: Date.now(),
                content: {
                    role: 'agent',
                    content: {
                        type: 'event',
                        data: { type: 'task_failed', error: 'API Error: 402 provider misconfigured' }
                    }
                }
            })
        }, 10)

        await inbound.handleEvent({
            sender: { sender_id: { open_id: 'ou_1' } },
            message: {
                message_id: 'om_in_error',
                message_type: 'text',
                chat_type: 'p2p',
                content: JSON.stringify({ text: 'trigger error' }),
            }
        })

        expect(sentTexts.at(-1)).toContain('AgentChat 处理失败：')
        expect(sentTexts.at(-1)).toContain('API Error: 402 provider misconfigured')
    })

    it('returns spawn/configuration errors back to Feishu users', async () => {
        const engine = new FakeEngine()
        engine.spawnError = 'No machine online for namespace'
        engine.machines.set('machine-1', {
            id: 'machine-1',
            namespace: 'default',
            metadata: {
                host: 'test-host',
                homeDir: '/Users/test',
                displayName: 'Test Machine',
            }
        })
        const repository = new MemoryFeishuRepository({ ou_1: 'default' })
        const sentTexts: string[] = []
        const apiClient: FeishuApiMessageClient = {
            async sendText(_openId, text) {
                sentTexts.push(text)
                return `om_out_${sentTexts.length}`
            }
        }
        const bridge = new FeishuSessionBridge({
            engine: engine as unknown as Parameters<typeof routeFeishuCommand>[0]['engine'],
            repository,
            apiClient,
            publicUrl: 'http://localhost:3217',
            accessToken: 'test-token',
            replyTimeoutMs: 200,
            spawnStrategy: {
                autoCreateSession: true,
                defaultMachineId: null,
            }
        })
        const inbound = new FeishuInboundHandler({
            repository,
            apiClient,
            bridge,
            commandDeps: {
                engine: engine as unknown as Parameters<typeof routeFeishuCommand>[0]['engine'],
                repository,
                publicUrl: 'http://localhost:3217',
                accessToken: 'test-token',
                autoCreateSession: true,
                defaultMachineId: null,
            }
        })

        await inbound.handleEvent({
            sender: { sender_id: { open_id: 'ou_1' } },
            message: {
                message_id: 'om_in_spawn_error',
                message_type: 'text',
                chat_type: 'p2p',
                content: JSON.stringify({ text: '/new' }),
            }
        })

        expect(sentTexts.at(-1)).toContain('AgentChat 处理失败：')
        expect(sentTexts.at(-1)).toContain('No machine online for namespace')
    })

    it('shows merged help for new-session menu push event', async () => {
        const engine = new FakeEngine()
        const repository = new MemoryFeishuRepository({ ou_1: 'default' })
        const sentTexts: string[] = []
        const apiClient: FeishuApiMessageClient = {
            async sendText(_openId, text) {
                sentTexts.push(text)
                return 'om_1'
            }
        }
        const bridge = new FeishuSessionBridge({
            engine: engine as unknown as Parameters<typeof routeFeishuCommand>[0]['engine'],
            repository,
            apiClient,
            publicUrl: 'http://localhost:3217',
            accessToken: 'test-token',
            replyTimeoutMs: 200,
            spawnStrategy: {
                autoCreateSession: true,
                defaultMachineId: null,
            }
        })
        const inbound = new FeishuInboundHandler({
            repository,
            apiClient,
            bridge,
            commandDeps: {
                engine: engine as unknown as Parameters<typeof routeFeishuCommand>[0]['engine'],
                repository,
                publicUrl: 'http://localhost:3217',
                accessToken: 'test-token',
                autoCreateSession: true,
                defaultMachineId: null,
            }
        })

        await inbound.handleMenuEvent({
            event_key: 'agentchat_new_session',
            operator: {
                operator_id: { open_id: 'ou_1' }
            }
        })

        expect(sentTexts).toHaveLength(1)
        expect(sentTexts[0]).toContain('欢迎使用 AgentChat 飞书机器人。')
        expect(sentTexts[0]).toContain('/progress - 查看当前 active 会话/群组 的最近回复')
        expect(sentTexts[0]).toContain('/model - 查看当前会话模型')
        expect(sentTexts[0]).toContain('/pwd - 查看当前会话目录')
        expect(sentTexts[0]).toContain('/new agent=codex')
    })


    it('deduplicates repeated menu push events by event_id', async () => {
        const engine = new FakeEngine()
        const repository = new MemoryFeishuRepository({ ou_1: 'default' })
        const sentTexts: string[] = []
        const apiClient: FeishuApiMessageClient = {
            async sendText(_openId, text) {
                sentTexts.push(text)
                return 'om_1'
            }
        }
        const bridge = new FeishuSessionBridge({
            engine: engine as unknown as Parameters<typeof routeFeishuCommand>[0]['engine'],
            repository,
            apiClient,
            publicUrl: 'http://localhost:3217',
            accessToken: 'test-token',
            replyTimeoutMs: 200,
            spawnStrategy: {
                autoCreateSession: true,
                defaultMachineId: null,
            }
        })
        const inbound = new FeishuInboundHandler({
            repository,
            apiClient,
            bridge,
            commandDeps: {
                engine: engine as unknown as Parameters<typeof routeFeishuCommand>[0]['engine'],
                repository,
                publicUrl: 'http://localhost:3217',
                accessToken: 'test-token',
                autoCreateSession: true,
                defaultMachineId: null,
            }
        })

        const event = {
            event_id: 'evt_duplicate_1',
            event_key: 'agentchat_help',
            operator: { operator_id: { open_id: 'ou_1' } }
        }

        await inbound.handleMenuEvent(event)
        await inbound.handleMenuEvent(event)

        expect(sentTexts).toHaveLength(1)
        expect(repository.menuEvents.has('evt_duplicate_1')).toBe(true)
    })

    it('handles menu push event for listing sessions', async () => {
        const engine = new FakeEngine()
        engine.sessions.set('session-1', createSession('session-1'))
        const repository = new MemoryFeishuRepository({ ou_1: 'default' })
        const sentTexts: string[] = []
        const apiClient: FeishuApiMessageClient = {
            async sendText(_openId, text) {
                sentTexts.push(text)
                return 'om_1'
            }
        }
        const bridge = new FeishuSessionBridge({
            engine: engine as unknown as Parameters<typeof routeFeishuCommand>[0]['engine'],
            repository,
            apiClient,
            publicUrl: 'http://localhost:3217',
            accessToken: 'test-token',
            replyTimeoutMs: 200,
            spawnStrategy: {
                autoCreateSession: true,
                defaultMachineId: null,
            }
        })
        const inbound = new FeishuInboundHandler({
            repository,
            apiClient,
            bridge,
            commandDeps: {
                engine: engine as unknown as Parameters<typeof routeFeishuCommand>[0]['engine'],
                repository,
                publicUrl: 'http://localhost:3217',
                accessToken: 'test-token',
                autoCreateSession: true,
                defaultMachineId: null,
            }
        })

        await inbound.handleMenuEvent({
            event_id: 'evt_list_1',
            event_key: 'session_list',
            operator: {
                operator_id: { open_id: 'ou_1' }
            }
        })

        expect(sentTexts).toHaveLength(1)
        expect(sentTexts[0]).toContain('最近目标')
    })

    it('handles menu push event for current progress', async () => {
        const engine = new FakeEngine()
        engine.sessions.set('session-1', createSession('session-1', 'default', {
            metadata: {
                path: testProjectPath('project'),
                host: 'test-host',
                machineId: 'machine-1',
                flavor: 'codex',
                name: 'Current progress session',
            },
        }))
        engine.messages.set('session-1', [{
            id: 'assistant-1',
            seq: 2,
            localId: null,
            createdAt: Date.now(),
            content: {
                role: 'agent',
                content: {
                    type: 'output',
                    data: {
                        type: 'assistant',
                        message: {
                            content: [{ type: 'text', text: '最近回复：Room 协调任务已完成。' }]
                        }
                    }
                }
            }
        }])
        const repository = new MemoryFeishuRepository({ ou_1: 'default' })
        repository.setSessionState({
            openId: 'ou_1',
            namespace: 'default',
            activeSessionId: 'session-1',
        })
        const sentTexts: string[] = []
        const apiClient: FeishuApiMessageClient = {
            async sendText(_openId, text) {
                sentTexts.push(text)
                return 'om_1'
            }
        }
        const bridge = new FeishuSessionBridge({
            engine: engine as unknown as Parameters<typeof routeFeishuCommand>[0]['engine'],
            repository,
            apiClient,
            publicUrl: 'http://localhost:3217',
            accessToken: 'test-token',
            replyTimeoutMs: 200,
            spawnStrategy: {
                autoCreateSession: true,
                defaultMachineId: null,
            }
        })
        const inbound = new FeishuInboundHandler({
            repository,
            apiClient,
            bridge,
            commandDeps: {
                engine: engine as unknown as Parameters<typeof routeFeishuCommand>[0]['engine'],
                repository,
                publicUrl: 'http://localhost:3217',
                accessToken: 'test-token',
                autoCreateSession: true,
                defaultMachineId: null,
            }
        })

        await inbound.handleMenuEvent({
            event_id: 'evt_progress_1',
            event_key: 'agentchat_progress',
            operator: {
                operator_id: { open_id: 'ou_1' }
            }
        })

        expect(sentTexts).toHaveLength(1)
        expect(sentTexts[0]).toContain('当前会话：Current progress session')
        expect(sentTexts[0]).toContain('最近回复：最近回复：Room 协调任务已完成。')
    })
})
