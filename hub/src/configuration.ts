/**
 * Configuration for agentchat-hub (Direct Connect)
 *
 * Configuration is loaded with priority: environment variable > settings.json > default
 * When values are read from environment variables and not present in settings.json,
 * they are automatically saved for future use
 *
 * Optional environment variables:
 * - CLI_API_TOKEN: Shared secret for AgentChat CLI authentication (auto-generated if not set)
 * - AGENTCHAT_LISTEN_HOST: Host/IP to bind the HTTP service (default: 127.0.0.1)
 * - AGENTCHAT_LISTEN_PORT: Port for HTTP service (default: 3217)
 * - AGENTCHAT_PUBLIC_URL: Public URL for external access
 * - CORS_ORIGINS: Comma-separated CORS origins
 * - AGENTCHAT_RELAY_API: Relay API domain for tunwg (default: relay.agentchat.run)
 * - AGENTCHAT_RELAY_AUTH: Relay auth key for tunwg (default: agentchat)
 * - AGENTCHAT_RELAY_FORCE_TCP: Force TCP relay mode when UDP is unavailable (true/1)
 * - VAPID_SUBJECT: Contact email or URL for Web Push (defaults to mailto:admin@agentchat.run)
 * - AGENTCHAT_HOME: Data directory (default: ~/.agentchat)
 * - DB_PATH: SQLite database path (default: {AGENTCHAT_HOME}/agentchat.db)
 * - FEISHU_APP_ID / FEISHU_APP_SECRET: Enable Feishu bot integration when both are present
 * - FEISHU_DEFAULT_NAMESPACE: Default namespace for Feishu users without explicit bindings (default: default)
 */

import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { getOrCreateCliApiToken } from './config/cliApiToken'
import { getSettingsFile } from './config/settings'
import { loadServerSettings, type ServerSettings, type ServerSettingsResult } from './config/serverSettings'

export type ConfigSource = 'env' | 'file' | 'default'

export interface ConfigSources {
    listenHost: ConfigSource
    listenPort: ConfigSource
    publicUrl: ConfigSource
    corsOrigins: ConfigSource
    cliApiToken: 'env' | 'file' | 'generated'
}

type FeishuUserBindingMap = Record<string, string>

function parseCommaSeparatedList(raw: string | undefined): string[] {
    if (!raw) {
        return []
    }
    return raw
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
}

function parseFeishuUserBindings(raw: string | undefined): FeishuUserBindingMap {
    const bindings: FeishuUserBindingMap = {}
    if (!raw) {
        return bindings
    }
    for (const entry of raw.split(',')) {
        const trimmed = entry.trim()
        if (!trimmed) continue
        const separatorIndex = trimmed.includes('=') ? trimmed.indexOf('=') : trimmed.indexOf(':')
        if (separatorIndex <= 0) {
            continue
        }
        const openId = trimmed.slice(0, separatorIndex).trim()
        const namespace = trimmed.slice(separatorIndex + 1).trim()
        if (!openId || !namespace) {
            continue
        }
        bindings[openId] = namespace
    }
    return bindings
}

class Configuration {
    /** CLI auth token (shared secret) */
    public cliApiToken: string

    /** Source of CLI API token */
    public cliApiTokenSource: 'env' | 'file' | 'generated' | ''

    /** Whether CLI API token was newly generated (for first-run display) */
    public cliApiTokenIsNew: boolean

    /** Path to settings.json file */
    public readonly settingsFile: string

    /** Data directory for credentials and state */
    public readonly dataDir: string

    /** SQLite DB path */
    public readonly dbPath: string

    /** Port for the HTTP service */
    public readonly listenPort: number

    /** Host/IP to bind the HTTP service to */
    public readonly listenHost: string

    /** Public URL for external access */
    public readonly publicUrl: string

    /** Allowed CORS origins for Mini App + Socket.IO (comma-separated env override) */
    public readonly corsOrigins: string[]

    /** Sources of each configuration value */
    public readonly sources: ConfigSources

    /** Feishu bot enabled */
    public readonly feishuEnabled: boolean

    /** Feishu long connection enabled */
    public readonly feishuLongConnection: boolean

    /** Feishu app id */
    public readonly feishuAppId: string | null

    /** Feishu app secret */
    public readonly feishuAppSecret: string | null

    /** Default namespace for Feishu users without explicit bindings */
    public readonly feishuDefaultNamespace: string

    /** Optional external base URL for deep links */
    public readonly feishuBaseUrl: string | null

    /** Optional allow list for Feishu open_ids */
    public readonly feishuAllowOpenIds: string[]

    /** Optional explicit Feishu open_id -> namespace bindings */
    public readonly feishuUserBindings: FeishuUserBindingMap

    /** Auto-create session on first private message */
    public readonly feishuAutoCreateSession: boolean

    /** Preferred machine for Feishu auto-created sessions */
    public readonly feishuDefaultMachineId: string | null

    /** Wait time for collecting assistant reply */
    public readonly feishuReplyTimeoutMs: number

    /** Private constructor - use createConfiguration() instead */
    private constructor(
        dataDir: string,
        dbPath: string,
        serverSettings: ServerSettings,
        sources: ServerSettingsResult['sources']
    ) {
        this.dataDir = dataDir
        this.dbPath = dbPath
        this.settingsFile = getSettingsFile(dataDir)

        // Apply server settings
        this.listenHost = serverSettings.listenHost
        this.listenPort = serverSettings.listenPort
        this.publicUrl = serverSettings.publicUrl
        this.corsOrigins = serverSettings.corsOrigins
        this.feishuAppId = process.env.FEISHU_APP_ID?.trim() || null
        this.feishuAppSecret = process.env.FEISHU_APP_SECRET?.trim() || null
        const feishuConfigured = Boolean(this.feishuAppId && this.feishuAppSecret)
        this.feishuEnabled = process.env.FEISHU_ENABLED === 'false'
            ? false
            : feishuConfigured || process.env.FEISHU_ENABLED === 'true'
        this.feishuLongConnection = process.env.FEISHU_LONG_CONNECTION !== 'false'
        this.feishuDefaultNamespace = process.env.FEISHU_DEFAULT_NAMESPACE?.trim() || 'default'
        this.feishuBaseUrl = process.env.FEISHU_BASE_URL?.trim() || null
        this.feishuAllowOpenIds = parseCommaSeparatedList(process.env.FEISHU_ALLOW_OPEN_IDS)
        this.feishuUserBindings = parseFeishuUserBindings(process.env.FEISHU_USER_BINDINGS)
        this.feishuAutoCreateSession = process.env.FEISHU_AUTO_CREATE_SESSION !== 'false'
        this.feishuDefaultMachineId = process.env.FEISHU_DEFAULT_MACHINE_ID?.trim() || null
        this.feishuReplyTimeoutMs = (() => {
            const raw = process.env.FEISHU_REPLY_TIMEOUT_MS
            const parsed = raw ? Number(raw) : NaN
            return Number.isFinite(parsed) && parsed > 0 ? parsed : 90_000
        })()

        // CLI API token - will be set by _setCliApiToken() before create() returns
        this.cliApiToken = ''
        this.cliApiTokenSource = ''
        this.cliApiTokenIsNew = false

        // Store sources for logging (cliApiToken will be set by _setCliApiToken)
        this.sources = {
            ...sources,
        } as ConfigSources

        // Ensure data directory exists
        if (!existsSync(this.dataDir)) {
            mkdirSync(this.dataDir, { recursive: true })
        }

        if (process.env.FEISHU_ENABLED === 'true' && (!this.feishuAppId || !this.feishuAppSecret)) {
            throw new Error('Feishu requires FEISHU_APP_ID and FEISHU_APP_SECRET')
        }
    }

    /** Create configuration asynchronously */
    static async create(): Promise<Configuration> {
        // 1. Determine data directory (env only - not persisted)
        const homeOverride = process.env.AGENTCHAT_HOME
        const dataDir = homeOverride
            ? homeOverride.replace(/^~/, homedir())
            : join(homedir(), '.agentchat')

        // Ensure data directory exists before loading settings
        if (!existsSync(dataDir)) {
            mkdirSync(dataDir, { recursive: true })
        }

        // 2. Determine DB path (env only - not persisted)
        const dbOverride = process.env.AGENTCHAT_DB_PATH || process.env.DB_PATH
        const dbPath = dbOverride
            ? dbOverride.replace(/^~/, homedir())
            : join(dataDir, 'agentchat.db')

        // 3. Load hub settings (with persistence)
        const settingsResult = await loadServerSettings(dataDir)

        if (settingsResult.savedToFile) {
            console.log(`[Hub] Configuration saved to ${getSettingsFile(dataDir)}`)
        }

        // 4. Create configuration instance
        const config = new Configuration(
            dataDir,
            dbPath,
            settingsResult.settings,
            settingsResult.sources
        )

        // 5. Load CLI API token
        const tokenResult = await getOrCreateCliApiToken(dataDir)
        config._setCliApiToken(tokenResult.token, tokenResult.source, tokenResult.isNew)

        return config
    }

    /** Set CLI API token (called during async initialization) */
    _setCliApiToken(token: string, source: 'env' | 'file' | 'generated', isNew: boolean): void {
        this.cliApiToken = token
        this.cliApiTokenSource = source
        this.cliApiTokenIsNew = isNew
        ;(this.sources as { cliApiToken: string }).cliApiToken = source
    }
}

// Singleton instance (set by createConfiguration)
let _configuration: Configuration | null = null

/**
 * Create and initialize configuration asynchronously.
 * Must be called once at startup before getConfiguration() can be used.
 */
export async function createConfiguration(): Promise<Configuration> {
    if (_configuration) {
        return _configuration
    }
    _configuration = await Configuration.create()
    return _configuration
}

/**
 * Get the initialized configuration.
 * Throws if createConfiguration() has not been called yet.
 */
export function getConfiguration(): Configuration {
    if (!_configuration) {
        throw new Error('Configuration not initialized. Call createConfiguration() first.')
    }
    return _configuration
}

// For compatibility - throws on access if not configured
export const configuration = new Proxy({} as Configuration, {
    get(_, prop) {
        return getConfiguration()[prop as keyof Configuration]
    }
})
