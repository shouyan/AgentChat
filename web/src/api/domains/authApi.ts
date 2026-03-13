import type { AuthResponse } from '@/types/api'
import { ApiClient } from '../core'

declare module '../core' {
    interface ApiClient {
        authenticate(auth: { accessToken: string }): Promise<AuthResponse>
        fetchVoiceToken(options?: { customAgentId?: string; customApiKey?: string }): Promise<{
            allowed: boolean
            token?: string
            agentId?: string
            error?: string
        }>
    }
}

Object.assign(ApiClient.prototype, {
    async authenticate(this: ApiClient, auth: { accessToken: string }): Promise<AuthResponse> {
        return await this.postUnauthenticated<AuthResponse>('/api/auth', auth, 'Auth failed')
    },

    async fetchVoiceToken(this: ApiClient, options?: { customAgentId?: string; customApiKey?: string }): Promise<{
        allowed: boolean
        token?: string
        agentId?: string
        error?: string
    }> {
        return await this.request('/api/voice/token', {
            method: 'POST',
            body: JSON.stringify(options || {}),
        })
    },
})
