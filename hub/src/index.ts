/**
 * AgentChat Hub - Main Entry Point
 *
 * Provides:
 * - Web app + HTTP API
 * - Socket.IO for CLI connections
 * - SSE updates for the web UI
 * - Optional Feishu private-chat bridge
 */

import { createConfiguration, type ConfigSource } from './configuration'
import { Store } from './store'
import { SyncEngine, type SyncEvent } from './sync/syncEngine'
import { NotificationHub } from './notifications/notificationHub'
import type { NotificationChannel } from './notifications/notificationTypes'
import { startWebServer } from './web/server'
import { getOrCreateJwtSecret } from './config/jwtSecret'
import { createSocketServer } from './socket/server'
import { SSEManager } from './sse/sseManager'
import { getOrCreateVapidKeys } from './config/vapidKeys'
import { PushService } from './push/pushService'
import { PushNotificationChannel } from './push/pushNotificationChannel'
import { VisibilityTracker } from './visibility/visibilityTracker'
import { TunnelManager } from './tunnel'
import { waitForTunnelTlsReady } from './tunnel/tlsGate'
import QRCode from 'qrcode'
import type { Server as BunServer } from 'bun'
import type { WebSocketData } from '@socket.io/bun-engine'
import { FeishuIntegration } from './integrations/feishu'

/** Format config source for logging */
function formatSource(source: ConfigSource | 'generated'): string {
    switch (source) {
        case 'env':
            return 'environment'
        case 'file':
            return 'settings.json'
        case 'default':
            return 'default'
        case 'generated':
            return 'generated'
    }
}

type RelayFlagSource = 'default' | '--relay' | '--no-relay'

function resolveRelayFlag(args: string[]): { enabled: boolean; source: RelayFlagSource } {
    let enabled = false
    let source: RelayFlagSource = 'default'

    for (const arg of args) {
        if (arg === '--relay') {
            enabled = true
            source = '--relay'
        } else if (arg === '--no-relay') {
            enabled = false
            source = '--no-relay'
        }
    }

    return { enabled, source }
}

function normalizeOrigin(value: string): string {
    const trimmed = value.trim()
    if (!trimmed) {
        return ''
    }
    try {
        return new URL(trimmed).origin
    } catch {
        return trimmed
    }
}

function normalizeOrigins(origins: string[]): string[] {
    const normalized = origins
        .map(normalizeOrigin)
        .filter(Boolean)
    if (normalized.includes('*')) {
        return ['*']
    }
    return Array.from(new Set(normalized))
}

function mergeCorsOrigins(base: string[], extra: string[]): string[] {
    if (base.includes('*') || extra.includes('*')) {
        return ['*']
    }
    const merged = new Set<string>()
    for (const origin of base) {
        merged.add(origin)
    }
    for (const origin of extra) {
        merged.add(origin)
    }
    return Array.from(merged)
}

let syncEngine: SyncEngine | null = null
let webServer: BunServer<WebSocketData> | null = null
let sseManager: SSEManager | null = null
let visibilityTracker: VisibilityTracker | null = null
let notificationHub: NotificationHub | null = null
let tunnelManager: TunnelManager | null = null
let feishuIntegration: FeishuIntegration | null = null

async function main() {
    console.log('AgentChat Hub starting...')

    // Load configuration (async - loads from env/file with persistence)
    const relayApiDomain = process.env.AGENTCHAT_RELAY_API || 'relay.agentchat.run'
    const relayFlag = resolveRelayFlag(process.argv)
    const officialWebUrl = process.env.AGENTCHAT_OFFICIAL_WEB_URL || 'https://app.agentchat.run'
    const config = await createConfiguration()
    const baseCorsOrigins = normalizeOrigins(config.corsOrigins)
    const relayCorsOrigin = normalizeOrigin(officialWebUrl)
    const corsOrigins = relayFlag.enabled
        ? mergeCorsOrigins(baseCorsOrigins, relayCorsOrigin ? [relayCorsOrigin] : [])
        : baseCorsOrigins

    // Display CLI API token information
    if (config.cliApiTokenIsNew) {
        console.log('')
        console.log('='.repeat(70))
        console.log('  NEW CLI_API_TOKEN GENERATED')
        console.log('='.repeat(70))
        console.log('')
        console.log(`  Token: ${config.cliApiToken}`)
        console.log('')
        console.log(`  Saved to: ${config.settingsFile}`)
        console.log('')
        console.log('='.repeat(70))
        console.log('')
    } else {
        console.log(`[Hub] CLI_API_TOKEN: loaded from ${formatSource(config.sources.cliApiToken)}`)
    }

    // Display other configuration sources
    console.log(`[Hub] AGENTCHAT_LISTEN_HOST: ${config.listenHost} (${formatSource(config.sources.listenHost)})`)
    console.log(`[Hub] AGENTCHAT_LISTEN_PORT: ${config.listenPort} (${formatSource(config.sources.listenPort)})`)
    console.log(`[Hub] AGENTCHAT_PUBLIC_URL: ${config.publicUrl} (${formatSource(config.sources.publicUrl)})`)

    // Display tunnel status
    if (relayFlag.enabled) {
        console.log(`[Hub] Tunnel: enabled (${relayFlag.source}), API: ${relayApiDomain}`)
    } else {
        console.log(`[Hub] Tunnel: disabled (${relayFlag.source})`)
    }

    const store = new Store(config.dbPath)
    const jwtSecret = await getOrCreateJwtSecret()
    const vapidKeys = await getOrCreateVapidKeys(config.dataDir)
    const vapidSubject = process.env.VAPID_SUBJECT ?? 'mailto:admin@agentchat.run'
    const pushService = new PushService(vapidKeys, vapidSubject, store)

    visibilityTracker = new VisibilityTracker()
    sseManager = new SSEManager(30_000, visibilityTracker)

    const socketServer = createSocketServer({
        store,
        jwtSecret,
        corsOrigins,
        getSession: (sessionId) => {
            if (syncEngine) {
                return syncEngine.getSession(sessionId) ?? null
            }
            return store.sessions.getSession(sessionId)
        },
        onWebappEvent: (event: SyncEvent) => syncEngine?.handleRealtimeEvent(event),
        onSessionAlive: (payload) => syncEngine?.handleSessionAlive(payload),
        onSessionEnd: (payload) => syncEngine?.handleSessionEnd(payload),
        onMachineAlive: (payload) => syncEngine?.handleMachineAlive(payload)
    })

    syncEngine = new SyncEngine(store, socketServer.io, socketServer.rpcRegistry, sseManager)
    feishuIntegration = new FeishuIntegration({
        store,
        engine: syncEngine,
    })

    const notificationChannels: NotificationChannel[] = [
        new PushNotificationChannel(pushService, sseManager, visibilityTracker, config.publicUrl)
    ]
    const feishuNotificationChannel = feishuIntegration.getNotificationChannel()
    if (feishuNotificationChannel) {
        notificationChannels.push(feishuNotificationChannel)
    }

    notificationHub = new NotificationHub(syncEngine, notificationChannels)

    // Start HTTP service first (before tunnel, so tunnel has something to forward to)
    webServer = await startWebServer({
        getSyncEngine: () => syncEngine,
        getSseManager: () => sseManager,
        getVisibilityTracker: () => visibilityTracker,
        jwtSecret,
        store,
        vapidPublicKey: vapidKeys.publicKey,
        socketEngine: socketServer.engine,
        corsOrigins,
        relayMode: relayFlag.enabled,
        officialWebUrl,
        getFeishuStatus: () => feishuIntegration?.getStatus() ?? null,
        getFeishuCardActionHandler: () => feishuIntegration?.getCardActionHandler() ?? null,
    })

    await feishuIntegration.start()

    console.log('')
    console.log('[Web] AgentChat Hub listening on :' + config.listenPort)
    console.log('[Web] Local:  http://localhost:' + config.listenPort)

    // Initialize tunnel AFTER web service is ready
    let tunnelUrl: string | null = null
    if (relayFlag.enabled) {
        tunnelManager = new TunnelManager({
            localPort: config.listenPort,
            enabled: true,
            apiDomain: relayApiDomain,
            authKey: process.env.AGENTCHAT_RELAY_AUTH || null,
            useRelay: process.env.AGENTCHAT_RELAY_FORCE_TCP === 'true' || process.env.AGENTCHAT_RELAY_FORCE_TCP === '1'
        })

        try {
            tunnelUrl = await tunnelManager.start()
        } catch (error) {
            console.error('[Tunnel] Failed to start:', error instanceof Error ? error.message : error)
            console.log('[Tunnel] Hub continuing without tunnel. Restart without --relay to disable.')
        }
    }

    if (tunnelUrl && tunnelManager) {
        const manager = tunnelManager
        const announceTunnelAccess = async () => {
            const tlsReady = await waitForTunnelTlsReady(tunnelUrl, manager)
            if (!tlsReady) {
                console.log('[Tunnel] Tunnel stopped before TLS was ready.')
                return
            }

            console.log('[Web] Public: ' + tunnelUrl)

            // Generate direct access link with hub and token
            const params = new URLSearchParams({
                hub: tunnelUrl,
                token: config.cliApiToken
            })
            const directAccessUrl = `${officialWebUrl}/?${params.toString()}`

            console.log('')
            console.log('Open in browser:')
            console.log(`  ${directAccessUrl}`)
            console.log('')
            console.log('or scan the QR code to open:')

            // Display QR code for easy mobile access
            try {
                const qrString = await QRCode.toString(directAccessUrl, {
                    type: 'terminal',
                    small: true,
                    margin: 1,
                    errorCorrectionLevel: 'L'
                })
                console.log('')
                console.log(qrString)
            } catch {
                // QR code generation failure should not affect main flow
            }
        }

        void announceTunnelAccess()
    }
    console.log('')
    console.log('AgentChat Hub is ready!')

    // Handle shutdown
    const shutdown = async () => {
        console.log('\nShutting down...')
        await tunnelManager?.stop()
        notificationHub?.stop()
        await feishuIntegration?.stop()
        syncEngine?.stop()
        sseManager?.stop()
        webServer?.stop()
        process.exit(0)
    }

    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)

    // Keep process running
    await new Promise(() => {})
}

main().catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
})
