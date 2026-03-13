/**
 * WebSocket client for machine/runner communication with agentchat-hub
 */

import { io, type Socket } from 'socket.io-client'
import { stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { homedir } from 'node:os'
import { logger } from '@/ui/logger'
import { configuration } from '@/configuration'
import type { Update, UpdateMachineBody } from '@agentchat/protocol'
import type { RunnerState, Machine, MachineMetadata } from './types'
import { RunnerStateSchema, MachineMetadataSchema } from './types'
import { backoff } from '@/utils/time'
import { RpcHandlerManager } from './rpc/RpcHandlerManager'
import { registerCommonHandlers } from '../modules/common/registerCommonHandlers'
import type { SpawnSessionOptions, SpawnSessionResult } from '../modules/common/rpcTypes'
import { applyVersionedAck } from './versionedUpdate'
import { listDirectoryEntries } from '../modules/common/directoryListing'
import { isProcessAlive } from '@/utils/process'
import type { MachineProviderHealthMap } from '@agentchat/protocol/machines'
import { ensureRunnerEnvFile, readRunnerEnvFileText, writeRunnerEnvFileText } from '@/runner/envFile'

interface ServerToRunnerEvents {
    update: (data: Update) => void
    'rpc-request': (data: { method: string; params: string }, callback: (response: string) => void) => void
    error: (data: { message: string }) => void
}

interface RunnerToServerEvents {
    'machine-alive': (data: { machineId: string; time: number }) => void
    'machine-update-metadata': (data: { machineId: string; metadata: unknown; expectedVersion: number }, cb: (answer: {
        result: 'error'
    } | {
        result: 'version-mismatch'
        version: number
        metadata: unknown | null
    } | {
        result: 'success'
        version: number
        metadata: unknown | null
    }) => void) => void
    'machine-update-state': (data: { machineId: string; runnerState: unknown | null; expectedVersion: number }, cb: (answer: {
        result: 'error'
    } | {
        result: 'version-mismatch'
        version: number
        runnerState: unknown | null
    } | {
        result: 'success'
        version: number
        runnerState: unknown | null
    }) => void) => void
    'rpc-register': (data: { method: string }) => void
    'rpc-unregister': (data: { method: string }) => void
}

type MachineRpcHandlers = {
    spawnSession: (options: SpawnSessionOptions) => Promise<SpawnSessionResult>
    stopSession: (sessionId: string) => boolean
    listSessions: () => Array<{
        startedBy: string
        happySessionId?: string
        pid: number
    }>
    requestShutdown: (options?: { restart?: boolean }) => void
    getProviderHealth: () => Promise<MachineProviderHealthMap>
}

interface PathExistsRequest {
    paths: string[]
}

interface PathExistsResponse {
    exists: Record<string, boolean>
}

interface PidAliveRequest {
    pids: number[]
}

interface PidAliveResponse {
    alive: Record<string, boolean>
}

interface MachineListDirectoryRequest {
    path?: string
}

interface MachineListDirectoryResponse {
    success: boolean
    path?: string
    parentPath?: string | null
    entries?: Array<{
        name: string
        path: string
        type: 'file' | 'directory' | 'other'
        size?: number
        modified?: number
    }>
    error?: string
}

interface MachineRunnerEnvResponse {
    success: boolean
    path?: string
    content?: string
    error?: string
}

interface MachineUpdateRunnerEnvRequest {
    content?: string
}

export class ApiMachineClient {
    private socket!: Socket<ServerToRunnerEvents, RunnerToServerEvents>
    private keepAliveInterval: NodeJS.Timeout | null = null
    private rpcHandlerManager: RpcHandlerManager

    constructor(
        private readonly token: string,
        private readonly machine: Machine
    ) {
        this.rpcHandlerManager = new RpcHandlerManager({
            scopePrefix: this.machine.id,
            logger: (msg, data) => logger.debug(msg, data)
        })

        registerCommonHandlers(this.rpcHandlerManager, process.cwd())

        this.rpcHandlerManager.registerHandler<PathExistsRequest, PathExistsResponse>('path-exists', async (params) => {
            const rawPaths = Array.isArray(params?.paths) ? params.paths : []
            const uniquePaths = Array.from(new Set(rawPaths.filter((path): path is string => typeof path === 'string')))
            const exists: Record<string, boolean> = {}

            await Promise.all(uniquePaths.map(async (path) => {
                const trimmed = path.trim()
                if (!trimmed) return
                try {
                    const stats = await stat(trimmed)
                    exists[trimmed] = stats.isDirectory()
                } catch {
                    exists[trimmed] = false
                }
            }))

            return { exists }
        })

        this.rpcHandlerManager.registerHandler<PidAliveRequest, PidAliveResponse>('pid-alive', async (params) => {
            const rawPids = Array.isArray(params?.pids) ? params.pids : []
            const uniquePids = Array.from(new Set(rawPids.filter((pid): pid is number => Number.isInteger(pid) && pid > 0)))
            const alive: Record<string, boolean> = {}

            for (const pid of uniquePids) {
                alive[String(pid)] = isProcessAlive(pid)
            }

            return { alive }
        })

        this.rpcHandlerManager.registerHandler<MachineListDirectoryRequest, MachineListDirectoryResponse>('list-directory', async (params) => {
            const requestedPath = typeof params?.path === 'string' ? params.path.trim() : ''
            const resolvedPath = resolve(requestedPath || homedir())

            try {
                const entries = await listDirectoryEntries(resolvedPath)
                const parentPath = dirname(resolvedPath)

                return {
                    success: true,
                    path: resolvedPath,
                    parentPath: parentPath === resolvedPath ? null : parentPath,
                    entries: entries.map((entry) => ({
                        ...entry,
                        path: resolve(resolvedPath, entry.name)
                    }))
                }
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to list directory'
                }
            }
        })

        this.rpcHandlerManager.registerHandler<undefined, MachineRunnerEnvResponse>('get-runner-env', async () => {
            try {
                await ensureRunnerEnvFile()
                return {
                    success: true,
                    path: configuration.runnerEnvFile,
                    content: await readRunnerEnvFileText(),
                }
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to read runner env file'
                }
            }
        })

        this.rpcHandlerManager.registerHandler<MachineUpdateRunnerEnvRequest, MachineRunnerEnvResponse>('set-runner-env', async (params) => {
            try {
                if (typeof params?.content !== 'string') {
                    return {
                        success: false,
                        error: 'Runner env content is required'
                    }
                }
                await writeRunnerEnvFileText(params.content)
                return {
                    success: true,
                    path: configuration.runnerEnvFile,
                    content: await readRunnerEnvFileText(),
                }
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to save runner env file'
                }
            }
        })
    }

    setRPCHandlers({ spawnSession, stopSession, listSessions, requestShutdown, getProviderHealth }: MachineRpcHandlers): void {
        this.rpcHandlerManager.registerHandler('spawn-agentchat-session', async (params: any) => {
            const { directory, sessionId, resumeSessionId, machineId, approvedNewDirectoryCreation, agent, model, yolo, token, sessionType, worktreeName } = params || {}

            if (!directory) {
                throw new Error('Directory is required')
            }

            const result = await spawnSession({
                directory,
                sessionId,
                resumeSessionId,
                machineId,
                approvedNewDirectoryCreation,
                agent,
                model,
                yolo,
                token,
                sessionType,
                worktreeName
            })

            switch (result.type) {
                case 'success':
                    return { type: 'success', sessionId: result.sessionId }
                case 'requestToApproveDirectoryCreation':
                    return { type: 'requestToApproveDirectoryCreation', directory: result.directory }
                case 'error':
                    return { type: 'error', errorMessage: result.errorMessage }
            }
        })

        this.rpcHandlerManager.registerHandler('stop-session', (params: any) => {
            const { sessionId } = params || {}
            if (!sessionId) {
                throw new Error('Session ID is required')
            }

            const success = stopSession(sessionId)
            if (!success) {
                throw new Error('Session not found or failed to stop')
            }

            return { message: 'Session stopped' }
        })

        this.rpcHandlerManager.registerHandler('stop-runner', () => {
            setTimeout(() => requestShutdown(), 100)
            return { message: 'Runner stop request acknowledged' }
        })

        this.rpcHandlerManager.registerHandler('restart-runner', () => {
            setTimeout(() => requestShutdown({ restart: true }), 100)
            return { message: 'Runner restart request acknowledged' }
        })

        this.rpcHandlerManager.registerHandler('list-sessions', () => {
            return {
                success: true,
                sessions: listSessions()
                    .filter((session) => typeof session.happySessionId === 'string' && session.happySessionId.length > 0)
                    .map((session) => ({
                        startedBy: session.startedBy,
                        sessionId: session.happySessionId!,
                        pid: session.pid
                    }))
            }
        })

        this.rpcHandlerManager.registerHandler('provider-health', async () => {
            return {
                success: true,
                checkedAt: Date.now(),
                providers: await getProviderHealth()
            }
        })
    }

    async updateMachineMetadata(handler: (metadata: MachineMetadata | null) => MachineMetadata): Promise<void> {
        await backoff(async () => {
            const updated = handler(this.machine.metadata)

            const answer = await this.socket.emitWithAck('machine-update-metadata', {
                machineId: this.machine.id,
                metadata: updated,
                expectedVersion: this.machine.metadataVersion
            }) as unknown

            applyVersionedAck(answer, {
                valueKey: 'metadata',
                parseValue: (value) => {
                    const parsed = MachineMetadataSchema.safeParse(value)
                    return parsed.success ? parsed.data : null
                },
                applyValue: (value) => {
                    this.machine.metadata = value
                },
                applyVersion: (version) => {
                    this.machine.metadataVersion = version
                },
                logInvalidValue: (context, version) => {
                    const suffix = context === 'success' ? 'ack' : 'version-mismatch ack'
                    logger.debug(`[API MACHINE] Ignoring invalid metadata value from ${suffix}`, { version })
                },
                invalidResponseMessage: 'Invalid machine-update-metadata response',
                errorMessage: 'Machine metadata update failed',
                versionMismatchMessage: 'Metadata version mismatch'
            })
        })
    }

    async updateRunnerState(handler: (state: RunnerState | null) => RunnerState): Promise<void> {
        await backoff(async () => {
            const updated = handler(this.machine.runnerState)

            const answer = await this.socket.emitWithAck('machine-update-state', {
                machineId: this.machine.id,
                runnerState: updated,
                expectedVersion: this.machine.runnerStateVersion
            }) as unknown

            applyVersionedAck(answer, {
                valueKey: 'runnerState',
                parseValue: (value) => {
                    const parsed = RunnerStateSchema.safeParse(value)
                    return parsed.success ? parsed.data : null
                },
                applyValue: (value) => {
                    this.machine.runnerState = value
                },
                applyVersion: (version) => {
                    this.machine.runnerStateVersion = version
                },
                logInvalidValue: (context, version) => {
                    const suffix = context === 'success' ? 'ack' : 'version-mismatch ack'
                    logger.debug(`[API MACHINE] Ignoring invalid runnerState value from ${suffix}`, { version })
                },
                invalidResponseMessage: 'Invalid machine-update-state response',
                errorMessage: 'Machine state update failed',
                versionMismatchMessage: 'Runner state version mismatch'
            })
        })
    }

    connect(): void {
        this.socket = io(`${configuration.apiUrl}/cli`, {
            transports: ['websocket'],
            auth: {
                token: this.token,
                clientType: 'machine-scoped' as const,
                machineId: this.machine.id
            },
            path: '/socket.io/',
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000
        })

        this.socket.on('connect', () => {
            logger.debug('[API MACHINE] Connected to bot')
            this.rpcHandlerManager.onSocketConnect(this.socket)
            this.updateMachineMetadata(() => this.machine.metadata ?? {
                host: process.env.AGENTCHAT_HOSTNAME || this.machine.id,
                platform: process.platform,
                agentchatCliVersion: 'unknown',
                homeDir: process.env.HOME || '',
                agentchatHomeDir: process.env.AGENTCHAT_HOME || '',
                agentchatLibDir: process.cwd()
            }).catch((error) => {
                logger.debug('[API MACHINE] Failed to update metadata on connect', error)
            })
            this.updateRunnerState((state) => ({
                ...(state ?? {}),
                status: 'running',
                pid: process.pid,
                httpPort: this.machine.runnerState?.httpPort,
                startedAt: Date.now()
            })).catch((error) => {
                logger.debug('[API MACHINE] Failed to update runner state on connect', error)
            })
            this.startKeepAlive()
        })

        this.socket.on('disconnect', () => {
            logger.debug('[API MACHINE] Disconnected from bot')
            this.rpcHandlerManager.onSocketDisconnect()
            this.stopKeepAlive()
        })

        this.socket.on('rpc-request', async (data: { method: string; params: string }, callback: (response: string) => void) => {
            callback(await this.rpcHandlerManager.handleRequest(data))
        })

        this.socket.on('update', (data: Update) => {
            if (data.body.t !== 'update-machine') {
                return
            }

            const update = data.body as UpdateMachineBody
            if (update.machineId !== this.machine.id) {
                return
            }

            if (update.metadata) {
                const parsed = MachineMetadataSchema.safeParse(update.metadata.value)
                if (parsed.success) {
                    this.machine.metadata = parsed.data
                } else {
                    logger.debug('[API MACHINE] Ignoring invalid metadata update', { version: update.metadata.version })
                }
                this.machine.metadataVersion = update.metadata.version
            }

            if (update.runnerState) {
                const next = update.runnerState.value
                if (next == null) {
                    this.machine.runnerState = null
                } else {
                    const parsed = RunnerStateSchema.safeParse(next)
                    if (parsed.success) {
                        this.machine.runnerState = parsed.data
                    } else {
                        logger.debug('[API MACHINE] Ignoring invalid runnerState update', { version: update.runnerState.version })
                    }
                }
                this.machine.runnerStateVersion = update.runnerState.version
            }
        })

        this.socket.on('connect_error', (error) => {
            logger.debug(`[API MACHINE] Connection error: ${error.message}`)
        })

        this.socket.on('error', (payload) => {
            logger.debug('[API MACHINE] Socket error:', payload)
        })
    }

    private startKeepAlive(): void {
        this.stopKeepAlive()
        this.keepAliveInterval = setInterval(() => {
            this.socket.emit('machine-alive', {
                machineId: this.machine.id,
                time: Date.now()
            })
        }, 20_000)
    }

    private stopKeepAlive(): void {
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval)
            this.keepAliveInterval = null
        }
    }

    shutdown(): void {
        this.stopKeepAlive()
        if (this.socket) {
            this.socket.close()
        }
    }
}
