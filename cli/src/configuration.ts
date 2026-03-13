/**
 * Global configuration for AgentChat CLI
 *
 * Centralizes all configuration including environment variables and paths
 * Environment files should be loaded using Node's --env-file flag
 */

import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import packageJson from '../package.json'
import { getCliArgs } from './utils/cliArgs'

class Configuration {
    private _apiUrl: string
    private _cliApiToken: string
    public readonly isRunnerProcess: boolean

    // Directories and paths (from persistence)
    public readonly agentchatHomeDir: string
    public readonly logsDir: string
    public readonly settingsFile: string
    public readonly privateKeyFile: string
    public readonly runnerStateFile: string
    public readonly runnerLockFile: string
    public readonly runnerEnvFile: string
    public readonly currentCliVersion: string

    public readonly isExperimentalEnabled: boolean

    constructor() {
        // Server configuration
        this._apiUrl = process.env.AGENTCHAT_API_URL || 'http://localhost:3217'
        this._cliApiToken = process.env.CLI_API_TOKEN || ''

        // Check if we're running as runner based on process args
        const args = getCliArgs()
        this.isRunnerProcess = args.length >= 2 && args[0] === 'runner' && (args[1] === 'start-sync')

        // Directory configuration - Priority: AGENTCHAT_HOME env > default home dir
        const homeOverride = process.env.AGENTCHAT_HOME
        if (homeOverride) {
            // Expand ~ to home directory if present
            const expandedPath = homeOverride.replace(/^~/, homedir())
            this.agentchatHomeDir = expandedPath
        } else {
            this.agentchatHomeDir = join(homedir(), '.agentchat')
        }

        this.logsDir = join(this.agentchatHomeDir, 'logs')
        this.settingsFile = join(this.agentchatHomeDir, 'settings.json')
        this.privateKeyFile = join(this.agentchatHomeDir, 'access.key')
        this.runnerStateFile = join(this.agentchatHomeDir, 'runner.state.json')
        this.runnerLockFile = join(this.agentchatHomeDir, 'runner.state.json.lock')
        this.runnerEnvFile = join(this.agentchatHomeDir, 'runner.env')

        this.isExperimentalEnabled = ['true', '1', 'yes'].includes(process.env.AGENTCHAT_EXPERIMENTAL?.toLowerCase() || '')

        this.currentCliVersion = packageJson.version

        if (!existsSync(this.agentchatHomeDir)) {
            mkdirSync(this.agentchatHomeDir, { recursive: true })
        }
        // Ensure directories exist
        if (!existsSync(this.logsDir)) {
            mkdirSync(this.logsDir, { recursive: true })
        }
    }

    get apiUrl(): string {
        return this._apiUrl
    }

    _setApiUrl(url: string): void {
        this._apiUrl = url
    }

    get cliApiToken(): string {
        return this._cliApiToken
    }

    _setCliApiToken(token: string): void {
        this._cliApiToken = token
    }
}

export const configuration: Configuration = new Configuration()
