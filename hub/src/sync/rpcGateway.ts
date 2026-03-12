import type { ModelMode, PermissionMode } from '@hapi/protocol/types'
import type {
    DeleteUploadResponse as RpcDeleteUploadResponse,
    FileReadResponse as RpcReadFileResponse,
    FileWriteResponse as RpcWriteFileResponse,
    ListDirectoryResponse as RpcListDirectoryResponse,
    PathMutationResponse as RpcPathMutationResponse,
    UploadFileResponse as RpcUploadFileResponse,
} from '@hapi/protocol/contracts/files'
import type { DirectoryEntry as RpcDirectoryEntry } from '@hapi/protocol/files'
import type { Server } from 'socket.io'
import type { RpcRegistry } from '../socket/rpcRegistry'

export type {
    DeleteUploadResponse as RpcDeleteUploadResponse,
    FileReadResponse as RpcReadFileResponse,
    FileWriteResponse as RpcWriteFileResponse,
    ListDirectoryResponse as RpcListDirectoryResponse,
    PathMutationResponse as RpcPathMutationResponse,
    UploadFileResponse as RpcUploadFileResponse,
} from '@hapi/protocol/contracts/files'

export type RpcCommandResponse = {
    success: boolean
    stdout?: string
    stderr?: string
    exitCode?: number
    error?: string
}

export type RpcPathExistsResponse = {
    exists: Record<string, boolean>
}

export type RpcPidAliveResponse = {
    alive: Record<string, boolean>
}

export type RpcMachineDirectoryEntry = RpcDirectoryEntry & {
    path: string
}

export type RpcListMachineDirectoryResponse = {
    success: boolean
    path?: string
    parentPath?: string | null
    entries?: RpcMachineDirectoryEntry[]
    error?: string
}

export type RpcMachineSessionSummary = {
    startedBy: string
    sessionId: string
    pid: number
}

export type RpcListMachineSessionsResponse = {
    success: boolean
    sessions?: RpcMachineSessionSummary[]
    error?: string
}

export type RpcProviderHealthStatus = {
    configured: boolean
    authMode?: string
    baseUrl?: string
    configPath?: string
    note?: string
    checkedAt: number
    status: 'ready' | 'needs-auth' | 'not-configured' | 'unreachable' | 'warning'
    summary: string
    detail: string
    probe?: {
        url: string
        ok: boolean
        statusCode?: number
        error?: string
    }
}

export type RpcProviderHealthResponse = {
    success: boolean
    checkedAt?: number
    providers?: Partial<Record<'claude' | 'codex' | 'cursor' | 'gemini' | 'opencode', RpcProviderHealthStatus>>
    error?: string
}

export class RpcGateway {
    constructor(
        private readonly io: Server,
        private readonly rpcRegistry: RpcRegistry
    ) {
    }

    async approvePermission(
        sessionId: string,
        requestId: string,
        mode?: PermissionMode,
        allowTools?: string[],
        decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort',
        answers?: Record<string, string[]> | Record<string, { answers: string[] }>
    ): Promise<void> {
        await this.sessionRpc(sessionId, 'permission', {
            id: requestId,
            approved: true,
            mode,
            allowTools,
            decision,
            answers
        })
    }

    async denyPermission(
        sessionId: string,
        requestId: string,
        decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort'
    ): Promise<void> {
        await this.sessionRpc(sessionId, 'permission', {
            id: requestId,
            approved: false,
            decision
        })
    }

    async abortSession(sessionId: string): Promise<void> {
        await this.sessionRpc(sessionId, 'abort', { reason: 'User aborted via Telegram Bot' })
    }

    async switchSession(sessionId: string, to: 'remote' | 'local'): Promise<void> {
        await this.sessionRpc(sessionId, 'switch', { to })
    }

    async requestSessionConfig(
        sessionId: string,
        config: {
            permissionMode?: PermissionMode
            modelMode?: ModelMode
        }
    ): Promise<unknown> {
        return await this.sessionRpc(sessionId, 'set-session-config', config)
    }

    async killSession(sessionId: string): Promise<void> {
        await this.sessionRpc(sessionId, 'killSession', {})
    }

    async spawnSession(
        machineId: string,
        directory: string,
        agent: 'claude' | 'codex' | 'cursor' | 'gemini' | 'opencode' = 'claude',
        model?: string,
        yolo?: boolean,
        sessionType?: 'simple' | 'worktree',
        worktreeName?: string,
        resumeSessionId?: string
    ): Promise<{ type: 'success'; sessionId: string } | { type: 'error'; message: string }> {
        try {
            const result = await this.machineRpc(
                machineId,
                'spawn-happy-session',
                { type: 'spawn-in-directory', directory, agent, model, yolo, sessionType, worktreeName, resumeSessionId }
            )
            if (result && typeof result === 'object') {
                const obj = result as Record<string, unknown>
                if (obj.type === 'success' && typeof obj.sessionId === 'string') {
                    return { type: 'success', sessionId: obj.sessionId }
                }
                if (obj.type === 'error' && typeof obj.errorMessage === 'string') {
                    return { type: 'error', message: obj.errorMessage }
                }
                if (obj.type === 'requestToApproveDirectoryCreation' && typeof obj.directory === 'string') {
                    return { type: 'error', message: `Directory creation requires approval: ${obj.directory}` }
                }
                if (typeof obj.error === 'string') {
                    return { type: 'error', message: obj.error }
                }
                if (obj.type !== 'success' && typeof obj.message === 'string') {
                    return { type: 'error', message: obj.message }
                }
            }
            const details = typeof result === 'string'
                ? result
                : (() => {
                    try {
                        return JSON.stringify(result)
                    } catch {
                        return String(result)
                    }
                })()
            return { type: 'error', message: `Unexpected spawn result: ${details}` }
        } catch (error) {
            return { type: 'error', message: error instanceof Error ? error.message : String(error) }
        }
    }

    async checkPathsExist(machineId: string, paths: string[]): Promise<Record<string, boolean>> {
        const result = await this.machineRpc(machineId, 'path-exists', { paths }) as RpcPathExistsResponse | unknown
        if (!result || typeof result !== 'object') {
            throw new Error('Unexpected path-exists result')
        }

        const existsValue = (result as RpcPathExistsResponse).exists
        if (!existsValue || typeof existsValue !== 'object') {
            throw new Error('Unexpected path-exists result')
        }

        const exists: Record<string, boolean> = {}
        for (const [key, value] of Object.entries(existsValue)) {
            exists[key] = value === true
        }
        return exists
    }

    async checkMachinePids(machineId: string, pids: number[]): Promise<Record<number, boolean>> {
        const result = await this.machineRpc(machineId, 'pid-alive', { pids }) as RpcPidAliveResponse | unknown
        if (!result || typeof result !== 'object') {
            throw new Error('Unexpected pid-alive result')
        }

        const aliveValue = (result as RpcPidAliveResponse).alive
        if (!aliveValue || typeof aliveValue !== 'object') {
            throw new Error('Unexpected pid-alive result')
        }

        const alive = new Map<number, boolean>()
        for (const [key, value] of Object.entries(aliveValue)) {
            const pid = Number(key)
            if (!Number.isFinite(pid)) {
                continue
            }
            alive.set(pid, value === true)
        }
        return Object.fromEntries(alive) as Record<number, boolean>
    }

    async listMachineDirectory(machineId: string, path?: string): Promise<RpcListMachineDirectoryResponse> {
        return await this.machineRpc(machineId, 'list-directory', { path }) as RpcListMachineDirectoryResponse
    }

    async listMachineSessions(machineId: string): Promise<RpcListMachineSessionsResponse> {
        return await this.machineRpc(machineId, 'list-sessions', {}) as RpcListMachineSessionsResponse
    }

    async restartRunner(machineId: string): Promise<{ message?: string }> {
        return await this.machineRpc(machineId, 'restart-runner', {}) as { message?: string }
    }

    async checkProviderHealth(machineId: string): Promise<RpcProviderHealthResponse> {
        return await this.machineRpc(machineId, 'provider-health', {}) as RpcProviderHealthResponse
    }

    async getGitStatus(sessionId: string, cwd?: string): Promise<RpcCommandResponse> {
        return await this.sessionRpc(sessionId, 'git-status', { cwd }) as RpcCommandResponse
    }

    async getGitDiffNumstat(sessionId: string, options: { cwd?: string; staged?: boolean }): Promise<RpcCommandResponse> {
        return await this.sessionRpc(sessionId, 'git-diff-numstat', options) as RpcCommandResponse
    }

    async getGitDiffFile(sessionId: string, options: { cwd?: string; filePath: string; staged?: boolean }): Promise<RpcCommandResponse> {
        return await this.sessionRpc(sessionId, 'git-diff-file', options) as RpcCommandResponse
    }

    async readSessionFile(sessionId: string, path: string): Promise<RpcReadFileResponse> {
        return await this.sessionRpc(sessionId, 'readFile', { path }) as RpcReadFileResponse
    }

    async writeSessionFile(sessionId: string, path: string, content: string, expectedHash?: string | null): Promise<RpcWriteFileResponse> {
        return await this.sessionRpc(sessionId, 'writeFile', { path, content, expectedHash }) as RpcWriteFileResponse
    }

    async listDirectory(sessionId: string, path: string): Promise<RpcListDirectoryResponse> {
        return await this.sessionRpc(sessionId, 'listDirectory', { path }) as RpcListDirectoryResponse
    }

    async createDirectory(sessionId: string, path: string): Promise<RpcPathMutationResponse> {
        return await this.sessionRpc(sessionId, 'createDirectory', { path }) as RpcPathMutationResponse
    }

    async renameSessionPath(sessionId: string, path: string, nextPath: string): Promise<RpcPathMutationResponse> {
        return await this.sessionRpc(sessionId, 'renamePath', { path, nextPath }) as RpcPathMutationResponse
    }

    async deleteSessionPath(sessionId: string, path: string, recursive?: boolean): Promise<RpcPathMutationResponse> {
        return await this.sessionRpc(sessionId, 'deletePath', { path, recursive }) as RpcPathMutationResponse
    }

    async uploadFile(sessionId: string, filename: string, content: string, mimeType: string): Promise<RpcUploadFileResponse> {
        return await this.sessionRpc(sessionId, 'uploadFile', { sessionId, filename, content, mimeType }) as RpcUploadFileResponse
    }

    async deleteUploadFile(sessionId: string, path: string): Promise<RpcDeleteUploadResponse> {
        return await this.sessionRpc(sessionId, 'deleteUpload', { sessionId, path }) as RpcDeleteUploadResponse
    }

    async runRipgrep(sessionId: string, args: string[], cwd?: string): Promise<RpcCommandResponse> {
        return await this.sessionRpc(sessionId, 'ripgrep', { args, cwd }) as RpcCommandResponse
    }

    async listSlashCommands(sessionId: string, agent: string): Promise<{
        success: boolean
        commands?: Array<{ name: string; description?: string; source: 'builtin' | 'user' | 'plugin' | 'project' }>
        error?: string
    }> {
        return await this.sessionRpc(sessionId, 'listSlashCommands', { agent }) as {
            success: boolean
            commands?: Array<{ name: string; description?: string; source: 'builtin' | 'user' | 'plugin' | 'project' }>
            error?: string
        }
    }

    async listSkills(sessionId: string): Promise<{
        success: boolean
        skills?: Array<{ name: string; description?: string }>
        error?: string
    }> {
        return await this.sessionRpc(sessionId, 'listSkills', {}) as {
            success: boolean
            skills?: Array<{ name: string; description?: string }>
            error?: string
        }
    }

    private async sessionRpc(sessionId: string, method: string, params: unknown): Promise<unknown> {
        return await this.rpcCall(`${sessionId}:${method}`, params)
    }

    private async machineRpc(machineId: string, method: string, params: unknown): Promise<unknown> {
        return await this.rpcCall(`${machineId}:${method}`, params)
    }

    private async rpcCall(method: string, params: unknown): Promise<unknown> {
        const socketId = this.rpcRegistry.getSocketIdForMethod(method)
        if (!socketId) {
            throw new Error(`RPC handler not registered: ${method}`)
        }

        const socket = this.io.of('/cli').sockets.get(socketId)
        if (!socket) {
            throw new Error(`RPC socket disconnected: ${method}`)
        }

        const response = await socket.timeout(30_000).emitWithAck('rpc-request', {
            method,
            params: JSON.stringify(params)
        }) as unknown

        if (typeof response !== 'string') {
            return response
        }

        try {
            return JSON.parse(response) as unknown
        } catch {
            return response
        }
    }
}
