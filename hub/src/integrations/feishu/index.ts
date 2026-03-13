import type { Store } from '../../store'
import type { SyncEngine } from '../../sync/syncEngine'
import { configuration } from '../../configuration'
import { FeishuApiClient } from './apiClient'
import { FeishuInboundHandler } from './inbound'
import { FeishuLongConnection } from './longConnection'
import { FeishuRepository } from './repository'
import { FeishuSessionBridge } from './sessionBridge'
import type { FeishuStatus } from './types'

export class FeishuIntegration {
    private readonly repository: FeishuRepository
    private readonly apiClient: FeishuApiClient | null
    private readonly bridge: FeishuSessionBridge | null
    private readonly inbound: FeishuInboundHandler | null
    private readonly longConnection: FeishuLongConnection

    constructor(
        private readonly deps: {
            store: Store
            engine: SyncEngine
        }
    ) {
        this.repository = new FeishuRepository(deps.store, {
            allowOpenIds: configuration.feishuAllowOpenIds,
            envBindings: configuration.feishuUserBindings,
            defaultNamespace: configuration.feishuDefaultNamespace,
        })
        this.apiClient = configuration.feishuEnabled && configuration.feishuAppId && configuration.feishuAppSecret
            ? new FeishuApiClient({
                appId: configuration.feishuAppId,
                appSecret: configuration.feishuAppSecret,
            })
            : null
        this.bridge = this.apiClient
            ? new FeishuSessionBridge({
                engine: deps.engine,
                repository: this.repository,
                apiClient: this.apiClient,
                publicUrl: configuration.feishuBaseUrl ?? configuration.publicUrl,
                accessToken: configuration.cliApiToken,
                replyTimeoutMs: configuration.feishuReplyTimeoutMs,
                spawnStrategy: {
                    autoCreateSession: configuration.feishuAutoCreateSession,
                    defaultMachineId: configuration.feishuDefaultMachineId,
                }
            })
            : null
        this.inbound = this.apiClient && this.bridge
            ? new FeishuInboundHandler({
                repository: this.repository,
                apiClient: this.apiClient,
                bridge: this.bridge,
                commandDeps: {
                    engine: deps.engine,
                    repository: this.repository,
                    publicUrl: configuration.feishuBaseUrl ?? configuration.publicUrl,
                    accessToken: configuration.cliApiToken,
                    autoCreateSession: configuration.feishuAutoCreateSession,
                    defaultMachineId: configuration.feishuDefaultMachineId,
                }
            })
            : null
        this.longConnection = new FeishuLongConnection({
            enabled: configuration.feishuEnabled && configuration.feishuLongConnection,
            appId: configuration.feishuAppId,
            appSecret: configuration.feishuAppSecret,
            onMessage: async (event) => {
                if (!this.inbound) {
                    return
                }
                await this.inbound.handleEvent(event)
            },
            onMenu: async (event) => {
                if (!this.inbound) {
                    return
                }
                await this.inbound.handleMenuEvent(event)
            }
        })
    }

    async start(): Promise<void> {
        if (!configuration.feishuEnabled) {
            return
        }
        try {
            await this.longConnection.start()
        } catch (error) {
            this.longConnection.setError(error)
            console.error('[FeishuIntegration] Failed to start', error)
        }
    }

    async stop(): Promise<void> {
        await this.longConnection.stop()
    }

    getStatus(): FeishuStatus {
        return this.longConnection.getStatus()
    }
}
