import type {
    DeleteUploadResponse,
    FileReadResponse,
    FileSearchResponse,
    FileWriteResponse,
    GitCommandResponse,
    ListDirectoryResponse,
    PathMutationResponse,
    UploadFileResponse,
} from '@/types/api'
import { ApiClient } from '../core'

declare module '../core' {
    interface ApiClient {
        getGitStatus(sessionId: string): Promise<GitCommandResponse>
        getGitDiffNumstat(sessionId: string, staged: boolean): Promise<GitCommandResponse>
        getGitDiffFile(sessionId: string, path: string, staged?: boolean): Promise<GitCommandResponse>
        searchSessionFiles(sessionId: string, query: string, limit?: number): Promise<FileSearchResponse>
        readSessionFile(sessionId: string, path: string): Promise<FileReadResponse>
        writeSessionFile(sessionId: string, path: string, content: string, expectedHash?: string | null): Promise<FileWriteResponse>
        listSessionDirectory(sessionId: string, path?: string): Promise<ListDirectoryResponse>
        createSessionDirectory(sessionId: string, path: string): Promise<PathMutationResponse>
        renameSessionPath(sessionId: string, path: string, nextPath: string): Promise<PathMutationResponse>
        deleteSessionPath(sessionId: string, path: string, recursive?: boolean): Promise<PathMutationResponse>
        uploadFile(sessionId: string, filename: string, content: string, mimeType: string): Promise<UploadFileResponse>
        deleteUploadFile(sessionId: string, path: string): Promise<DeleteUploadResponse>
    }
}

Object.assign(ApiClient.prototype, {
    async getGitStatus(this: ApiClient, sessionId: string): Promise<GitCommandResponse> {
        return await this.request<GitCommandResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/git-status`)
    },

    async getGitDiffNumstat(this: ApiClient, sessionId: string, staged: boolean): Promise<GitCommandResponse> {
        const params = new URLSearchParams()
        params.set('staged', staged ? 'true' : 'false')
        return await this.request<GitCommandResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/git-diff-numstat?${params.toString()}`)
    },

    async getGitDiffFile(this: ApiClient, sessionId: string, path: string, staged?: boolean): Promise<GitCommandResponse> {
        const params = new URLSearchParams()
        params.set('path', path)
        if (staged !== undefined) {
            params.set('staged', staged ? 'true' : 'false')
        }
        return await this.request<GitCommandResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/git-diff-file?${params.toString()}`)
    },

    async searchSessionFiles(this: ApiClient, sessionId: string, query: string, limit?: number): Promise<FileSearchResponse> {
        const params = new URLSearchParams()
        if (query) {
            params.set('query', query)
        }
        if (limit !== undefined) {
            params.set('limit', `${limit}`)
        }
        const qs = params.toString()
        return await this.request<FileSearchResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/files${qs ? `?${qs}` : ''}`)
    },

    async readSessionFile(this: ApiClient, sessionId: string, path: string): Promise<FileReadResponse> {
        const params = new URLSearchParams()
        params.set('path', path)
        return await this.request<FileReadResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/file?${params.toString()}`)
    },

    async writeSessionFile(this: ApiClient, sessionId: string, path: string, content: string, expectedHash?: string | null): Promise<FileWriteResponse> {
        return await this.request<FileWriteResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/file/write`, {
            method: 'POST',
            body: JSON.stringify({ path, content, expectedHash }),
        })
    },

    async listSessionDirectory(this: ApiClient, sessionId: string, path?: string): Promise<ListDirectoryResponse> {
        const params = new URLSearchParams()
        if (path) {
            params.set('path', path)
        }
        const qs = params.toString()
        return await this.request<ListDirectoryResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/directory${qs ? `?${qs}` : ''}`)
    },

    async createSessionDirectory(this: ApiClient, sessionId: string, path: string): Promise<PathMutationResponse> {
        return await this.request<PathMutationResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/directory/create`, {
            method: 'POST',
            body: JSON.stringify({ path }),
        })
    },

    async renameSessionPath(this: ApiClient, sessionId: string, path: string, nextPath: string): Promise<PathMutationResponse> {
        return await this.request<PathMutationResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/path/rename`, {
            method: 'POST',
            body: JSON.stringify({ path, nextPath }),
        })
    },

    async deleteSessionPath(this: ApiClient, sessionId: string, path: string, recursive = true): Promise<PathMutationResponse> {
        return await this.request<PathMutationResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/path/delete`, {
            method: 'POST',
            body: JSON.stringify({ path, recursive }),
        })
    },

    async uploadFile(this: ApiClient, sessionId: string, filename: string, content: string, mimeType: string): Promise<UploadFileResponse> {
        return await this.request<UploadFileResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/upload`, {
            method: 'POST',
            body: JSON.stringify({ filename, content, mimeType }),
        })
    },

    async deleteUploadFile(this: ApiClient, sessionId: string, path: string): Promise<DeleteUploadResponse> {
        return await this.request<DeleteUploadResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/upload/delete`, {
            method: 'POST',
            body: JSON.stringify({ path }),
        })
    },
})
