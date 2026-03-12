import type {
    MachineActionResponse,
    MachineCleanupResponse,
    MachineDirectoryResponse,
    MachinePathsExistsResponse,
    MachinesResponse,
    ProviderHealthResponse,
    SpawnResponse,
} from '@/types/api'
import { ApiClient } from '../core'

declare module '../core' {
    interface ApiClient {
        getMachines(): Promise<MachinesResponse>
        checkMachinePathsExists(machineId: string, paths: string[]): Promise<MachinePathsExistsResponse>
        listMachineDirectory(machineId: string, path?: string): Promise<MachineDirectoryResponse>
        spawnSession(
            machineId: string,
            directory: string,
            agent?: 'claude' | 'codex' | 'cursor' | 'gemini' | 'opencode',
            model?: string,
            yolo?: boolean,
            sessionType?: 'simple' | 'worktree',
            worktreeName?: string
        ): Promise<SpawnResponse>
        restartRunner(machineId: string): Promise<MachineActionResponse>
        cleanupDeadSessions(machineId: string): Promise<MachineCleanupResponse>
        runProviderHealthCheck(machineId: string): Promise<ProviderHealthResponse>
    }
}

Object.assign(ApiClient.prototype, {
    async getMachines(this: ApiClient): Promise<MachinesResponse> {
        return await this.request<MachinesResponse>('/api/machines')
    },

    async checkMachinePathsExists(this: ApiClient, machineId: string, paths: string[]): Promise<MachinePathsExistsResponse> {
        return await this.request<MachinePathsExistsResponse>(`/api/machines/${encodeURIComponent(machineId)}/paths/exists`, {
            method: 'POST',
            body: JSON.stringify({ paths }),
        })
    },

    async listMachineDirectory(this: ApiClient, machineId: string, path?: string): Promise<MachineDirectoryResponse> {
        const params = new URLSearchParams()
        if (path) {
            params.set('path', path)
        }
        const qs = params.toString()
        return await this.request<MachineDirectoryResponse>(`/api/machines/${encodeURIComponent(machineId)}/directory${qs ? `?${qs}` : ''}`)
    },

    async spawnSession(
        this: ApiClient,
        machineId: string,
        directory: string,
        agent?: 'claude' | 'codex' | 'cursor' | 'gemini' | 'opencode',
        model?: string,
        yolo?: boolean,
        sessionType?: 'simple' | 'worktree',
        worktreeName?: string
    ): Promise<SpawnResponse> {
        return await this.request<SpawnResponse>(`/api/machines/${encodeURIComponent(machineId)}/spawn`, {
            method: 'POST',
            body: JSON.stringify({ directory, agent, model, yolo, sessionType, worktreeName }),
        })
    },

    async restartRunner(this: ApiClient, machineId: string): Promise<MachineActionResponse> {
        return await this.request<MachineActionResponse>(`/api/machines/${encodeURIComponent(machineId)}/restart-runner`, {
            method: 'POST',
        })
    },

    async cleanupDeadSessions(this: ApiClient, machineId: string): Promise<MachineCleanupResponse> {
        return await this.request<MachineCleanupResponse>(`/api/machines/${encodeURIComponent(machineId)}/cleanup-dead-sessions`, {
            method: 'POST',
        })
    },

    async runProviderHealthCheck(this: ApiClient, machineId: string): Promise<ProviderHealthResponse> {
        return await this.request<ProviderHealthResponse>(`/api/machines/${encodeURIComponent(machineId)}/provider-health`, {
            method: 'POST',
        })
    },
})
