import type {
    AttachmentMetadata,
    MessagesResponse,
    ModelMode,
    PermissionMode,
    SessionResponse,
    SessionsResponse,
    SlashCommandsResponse,
    SkillsResponse,
} from '@/types/api'
import { ApiClient } from '../core'

declare module '../core' {
    interface ApiClient {
        getSessions(): Promise<SessionsResponse>
        getSession(sessionId: string): Promise<SessionResponse>
        getMessages(sessionId: string, options: { beforeSeq?: number | null; limit?: number }): Promise<MessagesResponse>
        resumeSession(sessionId: string): Promise<string>
        sendMessage(sessionId: string, text: string, localId?: string | null, attachments?: AttachmentMetadata[]): Promise<void>
        abortSession(sessionId: string): Promise<void>
        archiveSession(sessionId: string): Promise<void>
        switchSession(sessionId: string): Promise<void>
        setPermissionMode(sessionId: string, mode: PermissionMode): Promise<void>
        setModelMode(sessionId: string, model: ModelMode): Promise<void>
        approvePermission(
            sessionId: string,
            requestId: string,
            modeOrOptions?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | {
                mode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'
                allowTools?: string[]
                decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort'
                answers?: Record<string, string[]> | Record<string, { answers: string[] }>
            }
        ): Promise<void>
        denyPermission(
            sessionId: string,
            requestId: string,
            options?: { decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort' }
        ): Promise<void>
        getSlashCommands(sessionId: string): Promise<SlashCommandsResponse>
        getSkills(sessionId: string): Promise<SkillsResponse>
        renameSession(sessionId: string, name: string): Promise<void>
        deleteSession(sessionId: string): Promise<void>
    }
}

function buildSessionMessageUrl(sessionId: string, options: { beforeSeq?: number | null; limit?: number }): string {
    const params = new URLSearchParams()
    if (options.beforeSeq !== undefined && options.beforeSeq !== null) {
        params.set('beforeSeq', `${options.beforeSeq}`)
    }
    if (options.limit !== undefined && options.limit !== null) {
        params.set('limit', `${options.limit}`)
    }
    const qs = params.toString()
    return `/api/sessions/${encodeURIComponent(sessionId)}/messages${qs ? `?${qs}` : ''}`
}

Object.assign(ApiClient.prototype, {
    async getSessions(this: ApiClient): Promise<SessionsResponse> {
        return await this.request<SessionsResponse>('/api/sessions')
    },

    async getSession(this: ApiClient, sessionId: string): Promise<SessionResponse> {
        return await this.request<SessionResponse>(`/api/sessions/${encodeURIComponent(sessionId)}`)
    },

    async getMessages(this: ApiClient, sessionId: string, options: { beforeSeq?: number | null; limit?: number }): Promise<MessagesResponse> {
        return await this.request<MessagesResponse>(buildSessionMessageUrl(sessionId, options))
    },

    async resumeSession(this: ApiClient, sessionId: string): Promise<string> {
        const response = await this.request<{ sessionId: string }>(`/api/sessions/${encodeURIComponent(sessionId)}/resume`, {
            method: 'POST',
        })
        return response.sessionId
    },

    async sendMessage(this: ApiClient, sessionId: string, text: string, localId?: string | null, attachments?: AttachmentMetadata[]): Promise<void> {
        await this.request(`/api/sessions/${encodeURIComponent(sessionId)}/messages`, {
            method: 'POST',
            body: JSON.stringify({
                text,
                localId: localId ?? undefined,
                attachments: attachments ?? undefined,
            }),
        })
    },

    async abortSession(this: ApiClient, sessionId: string): Promise<void> {
        await this.request(`/api/sessions/${encodeURIComponent(sessionId)}/abort`, {
            method: 'POST',
            body: JSON.stringify({}),
        })
    },

    async archiveSession(this: ApiClient, sessionId: string): Promise<void> {
        await this.request(`/api/sessions/${encodeURIComponent(sessionId)}/archive`, {
            method: 'POST',
            body: JSON.stringify({}),
        })
    },

    async switchSession(this: ApiClient, sessionId: string): Promise<void> {
        await this.request(`/api/sessions/${encodeURIComponent(sessionId)}/switch`, {
            method: 'POST',
            body: JSON.stringify({}),
        })
    },

    async setPermissionMode(this: ApiClient, sessionId: string, mode: PermissionMode): Promise<void> {
        await this.request(`/api/sessions/${encodeURIComponent(sessionId)}/permission-mode`, {
            method: 'POST',
            body: JSON.stringify({ mode }),
        })
    },

    async setModelMode(this: ApiClient, sessionId: string, model: ModelMode): Promise<void> {
        await this.request(`/api/sessions/${encodeURIComponent(sessionId)}/model`, {
            method: 'POST',
            body: JSON.stringify({ model }),
        })
    },

    async approvePermission(
        this: ApiClient,
        sessionId: string,
        requestId: string,
        modeOrOptions?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | {
            mode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'
            allowTools?: string[]
            decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort'
            answers?: Record<string, string[]> | Record<string, { answers: string[] }>
        }
    ): Promise<void> {
        const body = typeof modeOrOptions === 'string' || modeOrOptions === undefined
            ? { mode: modeOrOptions }
            : modeOrOptions
        await this.request(`/api/sessions/${encodeURIComponent(sessionId)}/permissions/${encodeURIComponent(requestId)}/approve`, {
            method: 'POST',
            body: JSON.stringify(body),
        })
    },

    async denyPermission(
        this: ApiClient,
        sessionId: string,
        requestId: string,
        options?: { decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort' }
    ): Promise<void> {
        await this.request(`/api/sessions/${encodeURIComponent(sessionId)}/permissions/${encodeURIComponent(requestId)}/deny`, {
            method: 'POST',
            body: JSON.stringify(options ?? {}),
        })
    },

    async getSlashCommands(this: ApiClient, sessionId: string): Promise<SlashCommandsResponse> {
        return await this.request<SlashCommandsResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/slash-commands`)
    },

    async getSkills(this: ApiClient, sessionId: string): Promise<SkillsResponse> {
        return await this.request<SkillsResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/skills`)
    },

    async renameSession(this: ApiClient, sessionId: string, name: string): Promise<void> {
        await this.request(`/api/sessions/${encodeURIComponent(sessionId)}`, {
            method: 'PATCH',
            body: JSON.stringify({ name }),
        })
    },

    async deleteSession(this: ApiClient, sessionId: string): Promise<void> {
        await this.request(`/api/sessions/${encodeURIComponent(sessionId)}`, {
            method: 'DELETE',
        })
    },
})
