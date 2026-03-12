import type {
    RpcCommandResponse,
    RpcDeleteUploadResponse,
    RpcGateway,
    RpcListDirectoryResponse,
    RpcPathMutationResponse,
    RpcReadFileResponse,
    RpcUploadFileResponse,
    RpcWriteFileResponse,
} from './rpcGateway'

export class SessionWorkspaceService {
    constructor(private readonly rpcGateway: RpcGateway) {}

    async getGitStatus(sessionId: string, cwd?: string): Promise<RpcCommandResponse> {
        return await this.rpcGateway.getGitStatus(sessionId, cwd)
    }

    async getGitDiffNumstat(sessionId: string, options: { cwd?: string; staged?: boolean }): Promise<RpcCommandResponse> {
        return await this.rpcGateway.getGitDiffNumstat(sessionId, options)
    }

    async getGitDiffFile(sessionId: string, options: { cwd?: string; filePath: string; staged?: boolean }): Promise<RpcCommandResponse> {
        return await this.rpcGateway.getGitDiffFile(sessionId, options)
    }

    async readSessionFile(sessionId: string, path: string): Promise<RpcReadFileResponse> {
        return await this.rpcGateway.readSessionFile(sessionId, path)
    }

    async writeSessionFile(sessionId: string, path: string, content: string, expectedHash?: string | null): Promise<RpcWriteFileResponse> {
        return await this.rpcGateway.writeSessionFile(sessionId, path, content, expectedHash)
    }

    async listDirectory(sessionId: string, path: string): Promise<RpcListDirectoryResponse> {
        return await this.rpcGateway.listDirectory(sessionId, path)
    }

    async createDirectory(sessionId: string, path: string): Promise<RpcPathMutationResponse> {
        return await this.rpcGateway.createDirectory(sessionId, path)
    }

    async renameSessionPath(sessionId: string, path: string, nextPath: string): Promise<RpcPathMutationResponse> {
        return await this.rpcGateway.renameSessionPath(sessionId, path, nextPath)
    }

    async deleteSessionPath(sessionId: string, path: string, recursive?: boolean): Promise<RpcPathMutationResponse> {
        return await this.rpcGateway.deleteSessionPath(sessionId, path, recursive)
    }

    async uploadFile(sessionId: string, filename: string, content: string, mimeType: string): Promise<RpcUploadFileResponse> {
        return await this.rpcGateway.uploadFile(sessionId, filename, content, mimeType)
    }

    async deleteUploadFile(sessionId: string, path: string): Promise<RpcDeleteUploadResponse> {
        return await this.rpcGateway.deleteUploadFile(sessionId, path)
    }

    async runRipgrep(sessionId: string, args: string[], cwd?: string): Promise<RpcCommandResponse> {
        return await this.rpcGateway.runRipgrep(sessionId, args, cwd)
    }

    async listSlashCommands(sessionId: string, agent: string): Promise<{
        success: boolean
        commands?: Array<{ name: string; description?: string; source: 'builtin' | 'user' | 'plugin' | 'project' }>
        error?: string
    }> {
        return await this.rpcGateway.listSlashCommands(sessionId, agent)
    }

    async listSkills(sessionId: string): Promise<{
        success: boolean
        skills?: Array<{ name: string; description?: string }>
        error?: string
    }> {
        return await this.rpcGateway.listSkills(sessionId)
    }
}
