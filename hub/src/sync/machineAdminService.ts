import type { Session } from '@hapi/protocol/types'
import { planMachineSessionCleanup } from './machineMaintenance'
import type { Machine } from './machineCache'
import type { RpcGateway, RpcListMachineDirectoryResponse, RpcProviderHealthResponse } from './rpcGateway'

type MachineAdminDependencies = {
    rpcGateway: RpcGateway
    getMachineByNamespace: (machineId: string, namespace: string) => Machine | undefined
    getSessionsByNamespace: (namespace: string) => Session[]
    getSessionByNamespace: (sessionId: string, namespace: string) => Session | undefined
    endSession: (sessionId: string) => void
    deleteSession: (sessionId: string, namespace: string) => Promise<void>
}

export class MachineAdminService {
    private readonly rpcGateway: RpcGateway
    private readonly getMachineByNamespace: MachineAdminDependencies['getMachineByNamespace']
    private readonly getSessionsByNamespace: MachineAdminDependencies['getSessionsByNamespace']
    private readonly getSessionByNamespace: MachineAdminDependencies['getSessionByNamespace']
    private readonly endSession: MachineAdminDependencies['endSession']
    private readonly deleteSession: MachineAdminDependencies['deleteSession']

    constructor(deps: MachineAdminDependencies) {
        this.rpcGateway = deps.rpcGateway
        this.getMachineByNamespace = deps.getMachineByNamespace
        this.getSessionsByNamespace = deps.getSessionsByNamespace
        this.getSessionByNamespace = deps.getSessionByNamespace
        this.endSession = deps.endSession
        this.deleteSession = deps.deleteSession
    }

    async checkPathsExist(machineId: string, paths: string[]): Promise<Record<string, boolean>> {
        return await this.rpcGateway.checkPathsExist(machineId, paths)
    }

    async listMachineDirectory(machineId: string, path?: string): Promise<RpcListMachineDirectoryResponse> {
        return await this.rpcGateway.listMachineDirectory(machineId, path)
    }

    async restartRunner(machineId: string, namespace: string): Promise<{ ok: true; message: string }> {
        const machine = this.requireOnlineMachine(machineId, namespace)
        const result = await this.rpcGateway.restartRunner(machine.id)
        return {
            ok: true,
            message: result.message ?? 'Runner restart requested',
        }
    }

    async cleanupDeadSessions(machineId: string, namespace: string): Promise<{
        deletedSessionIds: string[]
        keptSessionIds: string[]
        preservedInactiveSessionIds: string[]
        deadProcessSessionIds: string[]
        aliveProcessSessionIds: string[]
    }> {
        this.requireOnlineMachine(machineId, namespace)

        const relatedSessions = this.getSessionsByNamespace(namespace).filter((session) => session.metadata?.machineId === machineId)
        const hostPids = Array.from(
            new Set(
                relatedSessions
                    .map((session) => session.metadata?.hostPid)
                    .filter((pid): pid is number => typeof pid === 'number' && Number.isFinite(pid) && pid > 0)
            )
        )
        const aliveByPid = new Map<number, boolean>(
            Object.entries(await this.rpcGateway.checkMachinePids(machineId, hostPids)).map(([pid, alive]) => [Number(pid), alive === true])
        )
        const plan = planMachineSessionCleanup(relatedSessions, aliveByPid)

        for (const sessionId of plan.deletedSessionIds) {
            const session = this.getSessionByNamespace(sessionId, namespace)
            if (!session) {
                continue
            }
            if (session.active) {
                this.endSession(sessionId)
            }
            await this.deleteSession(sessionId, namespace)
        }

        return {
            ...plan,
            aliveProcessSessionIds: relatedSessions
                .filter((session) => {
                    const pid = session.metadata?.hostPid
                    return typeof pid === 'number' && aliveByPid.get(pid) === true
                })
                .map((session) => session.id),
        }
    }

    async checkProviderHealth(machineId: string, namespace: string): Promise<RpcProviderHealthResponse> {
        const machine = this.requireOnlineMachine(machineId, namespace)
        return await this.rpcGateway.checkProviderHealth(machine.id)
    }

    private requireOnlineMachine(machineId: string, namespace: string): Machine {
        const machine = this.getMachineByNamespace(machineId, namespace)
        if (!machine) {
            throw new Error('Machine not found')
        }
        if (!machine.active) {
            throw new Error('Machine is offline')
        }
        return machine
    }
}
