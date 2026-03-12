import type { AuthResponse } from '@/types/api'

type ErrorPayload = {
    error?: unknown
}

export type ApiClientOptions = {
    baseUrl?: string
    getToken?: () => string | null
    onUnauthorized?: () => Promise<string | null>
}

function parseErrorCode(bodyText: string): string | undefined {
    try {
        const parsed = JSON.parse(bodyText) as ErrorPayload
        return typeof parsed.error === 'string' ? parsed.error : undefined
    } catch {
        return undefined
    }
}

export class ApiError extends Error {
    status: number
    code?: string
    body?: string

    constructor(message: string, status: number, code?: string, body?: string) {
        super(message)
        this.name = 'ApiError'
        this.status = status
        this.code = code
        this.body = body
    }
}

export class ApiClient {
    private token: string
    private readonly baseUrl: string | null
    private readonly getTokenValue: (() => string | null) | null
    private readonly onUnauthorizedRefresh: (() => Promise<string | null>) | null

    constructor(token: string, options?: ApiClientOptions) {
        this.token = token
        this.baseUrl = options?.baseUrl ?? null
        this.getTokenValue = options?.getToken ?? null
        this.onUnauthorizedRefresh = options?.onUnauthorized ?? null
    }

    buildUrl(path: string): string {
        if (!this.baseUrl) {
            return path
        }
        try {
            return new URL(path, this.baseUrl).toString()
        } catch {
            return path
        }
    }

    async request<T>(
        path: string,
        init?: RequestInit,
        attempt: number = 0,
        overrideToken?: string | null
    ): Promise<T> {
        const headers = new Headers(init?.headers)
        const liveToken = this.getTokenValue ? this.getTokenValue() : null
        const authToken = overrideToken !== undefined
            ? (overrideToken ?? (liveToken ?? this.token))
            : (liveToken ?? this.token)
        if (authToken) {
            headers.set('authorization', `Bearer ${authToken}`)
        }
        if (init?.body !== undefined && !headers.has('content-type')) {
            headers.set('content-type', 'application/json')
        }

        const response = await fetch(this.buildUrl(path), {
            ...init,
            headers,
        })

        if (response.status === 401) {
            if (attempt === 0 && this.onUnauthorizedRefresh) {
                const refreshed = await this.onUnauthorizedRefresh()
                if (refreshed) {
                    this.token = refreshed
                    return await this.request<T>(path, init, attempt + 1, refreshed)
                }
            }
            throw new Error('Session expired. Please sign in again.')
        }

        if (!response.ok) {
            const body = await response.text().catch(() => '')
            throw new Error(`HTTP ${response.status} ${response.statusText}: ${body}`)
        }

        return await response.json() as T
    }

    async postUnauthenticated<T>(path: string, body: unknown, failurePrefix: string): Promise<T> {
        const response = await fetch(this.buildUrl(path), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
        })

        if (!response.ok) {
            const responseBody = await response.text().catch(() => '')
            const code = parseErrorCode(responseBody)
            const detail = responseBody ? `: ${responseBody}` : ''
            throw new ApiError(`${failurePrefix}: HTTP ${response.status} ${response.statusText}${detail}`, response.status, code, responseBody || undefined)
        }

        return await response.json() as T
    }
}

export type AuthApi = Pick<ApiClient, 'authenticate' | 'bind'>
export type { AuthResponse }
