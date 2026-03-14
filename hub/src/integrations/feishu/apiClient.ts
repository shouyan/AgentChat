import type { InteractiveCard } from '@larksuiteoapi/node-sdk'

type TokenCache = {
    value: string
    expiresAt: number
}

export class FeishuApiClient {
    private tokenCache: TokenCache | null = null
    private tokenInFlight: Promise<string> | null = null

    constructor(
        private readonly options: {
            appId: string
            appSecret: string
            timeoutMs?: number
        }
    ) {
    }

    async sendText(openId: string, text: string): Promise<string | undefined> {
        const trimmedText = text.trim()
        if (!trimmedText) {
            throw new Error('Feishu text content is required')
        }

        return await this.sendMessage(openId, 'text', {
            text: trimmedText,
        })
    }

    async sendInteractiveCard(openId: string, card: InteractiveCard): Promise<string | undefined> {
        if (!card || typeof card !== 'object') {
            throw new Error('Feishu interactive card content is required')
        }

        return await this.sendMessage(openId, 'interactive', card)
    }

    private async sendMessage(
        openId: string,
        msgType: 'text' | 'interactive',
        content: unknown
    ): Promise<string | undefined> {
        if (!openId.trim()) {
            throw new Error('Feishu openId is required')
        }

        const token = await this.getTenantAccessToken()
        const response = await this.fetchWithTimeout('https://open.feishu.cn/open-apis/im/v1/messages', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json; charset=utf-8',
            },
            body: JSON.stringify({
                receive_id: openId,
                msg_type: msgType,
                content: JSON.stringify(content),
            }),
        }, {
            receive_id_type: 'open_id'
        })

        const payload = await response.json().catch(() => ({})) as {
            code?: number
            msg?: string
            data?: { message_id?: string }
        }
        if (!response.ok || payload.code !== 0) {
            if (response.status === 401 || response.status === 403) {
                this.tokenCache = null
            }
            throw new Error(`Feishu send failed: ${response.status} ${payload.code ?? 'unknown'} ${payload.msg ?? 'unknown'}`)
        }

        return payload.data?.message_id
    }

    private async getTenantAccessToken(): Promise<string> {
        const now = Date.now()
        if (this.tokenCache && now < this.tokenCache.expiresAt) {
            return this.tokenCache.value
        }
        if (this.tokenInFlight) {
            return this.tokenInFlight
        }
        this.tokenInFlight = this.fetchTenantAccessToken()
        try {
            return await this.tokenInFlight
        } finally {
            this.tokenInFlight = null
        }
    }

    private async fetchTenantAccessToken(): Promise<string> {
        const now = Date.now()
        const response = await this.fetchWithTimeout(
            'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json; charset=utf-8',
                },
                body: JSON.stringify({
                    app_id: this.options.appId,
                    app_secret: this.options.appSecret,
                }),
            }
        )
        const payload = await response.json() as {
            code?: number
            msg?: string
            tenant_access_token?: string
            expire?: number
        }
        if (!response.ok || payload.code !== 0 || !payload.tenant_access_token || !payload.expire) {
            throw new Error(`Feishu token failed: ${response.status} ${payload.code ?? 'unknown'} ${payload.msg ?? 'unknown'}`)
        }
        this.tokenCache = {
            value: payload.tenant_access_token,
            expiresAt: now + Math.max(0, payload.expire - 60) * 1000
        }
        return this.tokenCache.value
    }

    private async fetchWithTimeout(
        input: string,
        init: RequestInit,
        query?: Record<string, string>
    ): Promise<Response> {
        const url = new URL(input)
        if (query) {
            for (const [key, value] of Object.entries(query)) {
                url.searchParams.set(key, value)
            }
        }
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 15_000)
        try {
            return await fetch(url, {
                ...init,
                signal: controller.signal,
            })
        } catch (error) {
            console.warn('[FeishuApiClient] fetch failed', {
                url: url.toString(),
                error: error instanceof Error ? error.message : String(error),
            })
            throw error
        } finally {
            clearTimeout(timer)
        }
    }
}
