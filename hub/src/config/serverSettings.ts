/**
 * Hub Settings Management
 *
 * Handles loading and persistence of hub configuration.
 * Priority: environment variable > settings.json > default value
 *
 * When a value is loaded from environment variable and not present in settings.json,
 * it will be saved to settings.json for future use
 */

import { getSettingsFile, readSettings, writeSettings } from './settings'

export interface ServerSettings {
    listenHost: string
    listenPort: number
    publicUrl: string
    corsOrigins: string[]
}

export interface ServerSettingsResult {
    settings: ServerSettings
    sources: {
        listenHost: 'env' | 'file' | 'default'
        listenPort: 'env' | 'file' | 'default'
        publicUrl: 'env' | 'file' | 'default'
        corsOrigins: 'env' | 'file' | 'default'
    }
    savedToFile: boolean
}

/**
 * Parse and normalize CORS origins
 */
function parseCorsOrigins(str: string): string[] {
    const entries = str
        .split(',')
        .map(origin => origin.trim())
        .filter(Boolean)

    if (entries.includes('*')) {
        return ['*']
    }

    const normalized: string[] = []
    for (const entry of entries) {
        try {
            normalized.push(new URL(entry).origin)
        } catch {
            // Keep raw value if it's already an origin-like string
            normalized.push(entry)
        }
    }
    return normalized
}

/**
 * Derive CORS origins from public URL
 */
function deriveCorsOrigins(publicUrl: string): string[] {
    try {
        return [new URL(publicUrl).origin]
    } catch {
        return []
    }
}

/**
 * Load hub settings with priority: env > file > default
 * Saves new env values to file when not already present
 */
export async function loadServerSettings(dataDir: string): Promise<ServerSettingsResult> {
    const settingsFile = getSettingsFile(dataDir)
    const settings = await readSettings(settingsFile)

    // If settings file exists but couldn't be parsed, fail fast
    if (settings === null) {
        throw new Error(
            `Cannot read ${settingsFile}. Please fix or remove the file and restart.`
        )
    }

    let needsSave = false
    const sources: ServerSettingsResult['sources'] = {
        listenHost: 'default',
        listenPort: 'default',
        publicUrl: 'default',
        corsOrigins: 'default',
    }

    // listenHost: env > file (new or old name) > default
    let listenHost = '127.0.0.1'
    const envListenHost = process.env.AGENTCHAT_LISTEN_HOST
    if (envListenHost) {
        listenHost = envListenHost
        sources.listenHost = 'env'
        if (settings.listenHost === undefined) {
            settings.listenHost = listenHost
            needsSave = true
        }
    } else if (settings.listenHost !== undefined) {
        listenHost = settings.listenHost
        sources.listenHost = 'file'
    } else if (settings.webappHost !== undefined) {
        // Migrate from old field name
        listenHost = settings.webappHost
        sources.listenHost = 'file'
        settings.listenHost = listenHost
        delete settings.webappHost
        needsSave = true
    }

    // listenPort: env > file (new or old name) > default
    let listenPort = 3217
    const envListenPort = process.env.AGENTCHAT_LISTEN_PORT
    if (envListenPort) {
        const parsed = parseInt(envListenPort, 10)
        if (!Number.isFinite(parsed) || parsed <= 0) {
            throw new Error('AGENTCHAT_LISTEN_PORT must be a valid port number')
        }
        listenPort = parsed
        sources.listenPort = 'env'
        if (settings.listenPort === undefined) {
            settings.listenPort = listenPort
            needsSave = true
        }
    } else if (settings.listenPort !== undefined) {
        listenPort = settings.listenPort
        sources.listenPort = 'file'
    } else if (settings.webappPort !== undefined) {
        // Migrate from old field name
        listenPort = settings.webappPort
        sources.listenPort = 'file'
        settings.listenPort = listenPort
        delete settings.webappPort
        needsSave = true
    }

    // publicUrl: env > file (new or old name) > default
    let publicUrl = `http://localhost:${listenPort}`
    const envPublicUrl = process.env.AGENTCHAT_PUBLIC_URL
    if (envPublicUrl) {
        publicUrl = envPublicUrl
        sources.publicUrl = 'env'
        if (settings.publicUrl === undefined) {
            settings.publicUrl = publicUrl
            needsSave = true
        }
    } else if (settings.publicUrl !== undefined) {
        publicUrl = settings.publicUrl
        sources.publicUrl = 'file'
    } else if (settings.webappUrl !== undefined) {
        // Migrate from old field name
        publicUrl = settings.webappUrl
        sources.publicUrl = 'file'
        settings.publicUrl = publicUrl
        delete settings.webappUrl
        needsSave = true
    }

    // corsOrigins: env > file > derived from publicUrl
    let corsOrigins: string[]
    if (process.env.CORS_ORIGINS) {
        corsOrigins = parseCorsOrigins(process.env.CORS_ORIGINS)
        sources.corsOrigins = 'env'
        if (settings.corsOrigins === undefined) {
            settings.corsOrigins = corsOrigins
            needsSave = true
        }
    } else if (settings.corsOrigins !== undefined) {
        corsOrigins = settings.corsOrigins
        sources.corsOrigins = 'file'
    } else {
        corsOrigins = deriveCorsOrigins(publicUrl)
    }

    // Save settings if any new values were added
    if (needsSave) {
        await writeSettings(settingsFile, settings)
    }

    return {
        settings: {
            listenHost,
            listenPort,
            publicUrl,
            corsOrigins,
        },
        sources,
        savedToFile: needsSave,
    }
}
