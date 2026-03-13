import { EventDispatcher as LarkEventDispatcher, LoggerLevel as LarkSdkLoggerLevel, WSClient as LarkWSClient } from '@larksuiteoapi/node-sdk'
import type { FeishuStatus } from './types'

type FeishuWsClientLike = {
    start: (input: { eventDispatcher: unknown }) => Promise<void>
    stop?: () => Promise<void> | void
}

type FeishuEventDispatcherLike = {
    register: (handlers: Record<string, (data: Record<string, unknown>) => Promise<void>>) => unknown
}

export class FeishuLongConnection {
    private client: FeishuWsClientLike | null = null
    private status: FeishuStatus

    constructor(
        private readonly options: {
            enabled: boolean
            appId: string | null
            appSecret: string | null
            onMessage: (event: Record<string, unknown>) => Promise<void>
            onMenu?: (event: Record<string, unknown>) => Promise<void>
        }
    ) {
        this.status = {
            enabled: options.enabled,
            mode: options.enabled ? 'long-connection' : 'disabled',
            connected: false,
        }
    }

    async start(): Promise<void> {
        if (!this.options.enabled) {
            return
        }
        if (!this.options.appId || !this.options.appSecret) {
            this.status = {
                ...this.status,
                connected: false,
                lastError: 'Missing Feishu app credentials',
            }
            return
        }
        const client = new (LarkWSClient as unknown as new (input: Record<string, unknown>) => FeishuWsClientLike)({
            appId: this.options.appId,
            appSecret: this.options.appSecret,
            loggerLevel: LarkSdkLoggerLevel.error,
        })
        const dispatcher = new (LarkEventDispatcher as unknown as new (input: Record<string, unknown>) => FeishuEventDispatcherLike)({
            loggerLevel: LarkSdkLoggerLevel.error,
        })
        const eventDispatcher = dispatcher.register({
            'im.message.receive_v1': async (event: Record<string, unknown>) => {
                this.status.lastEventAt = Date.now()
                await this.options.onMessage(event)
            },
            'application.bot.menu_v6': async (event: Record<string, unknown>) => {
                this.status.lastEventAt = Date.now()
                await this.options.onMenu?.(event)
            }
        })

        await client.start({ eventDispatcher })
        this.client = client
        this.status = {
            ...this.status,
            connected: true,
            lastError: undefined,
        }
        console.log('[FeishuLongConnection] started')
    }

    async stop(): Promise<void> {
        try {
            await this.client?.stop?.()
        } finally {
            this.status = {
                ...this.status,
                connected: false,
            }
            this.client = null
        }
    }

    getStatus(): FeishuStatus {
        return { ...this.status }
    }

    setError(error: unknown): void {
        this.status = {
            ...this.status,
            connected: false,
            lastError: error instanceof Error ? error.message : String(error),
        }
    }
}
