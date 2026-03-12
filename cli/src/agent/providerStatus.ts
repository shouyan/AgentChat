export type MachineProviderStatus = {
    configured: boolean
    authMode?: string
    baseUrl?: string
    configPath?: string
    note?: string
}

export type MachineProviderStatusMap = Partial<Record<'claude' | 'codex' | 'gemini' | 'cursor' | 'opencode', MachineProviderStatus>>

function getClaudeStatus(): MachineProviderStatus {
    const authMode = process.env.ANTHROPIC_AUTH_TOKEN
        ? 'auth-token'
        : process.env.ANTHROPIC_API_KEY
            ? 'api-key'
            : process.env.CLAUDE_CODE_OAUTH_TOKEN
                ? 'oauth-token'
                : undefined

    return {
        configured: Boolean(authMode),
        authMode,
        baseUrl: process.env.ANTHROPIC_BASE_URL || undefined
    }
}

function getCodexStatus(): MachineProviderStatus {
    return {
        configured: Boolean(process.env.OPENAI_API_KEY),
        authMode: process.env.OPENAI_API_KEY ? 'api-key' : undefined,
        baseUrl: process.env.OPENAI_BASE_URL || undefined
    }
}

function getGeminiStatus(): MachineProviderStatus {
    const authMode = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
        ? 'api-key'
        : undefined

    return {
        configured: Boolean(authMode),
        authMode,
        baseUrl: process.env.GEMINI_BASE_URL || process.env.GOOGLE_BASE_URL || undefined
    }
}

function getCursorStatus(): MachineProviderStatus {
    return {
        configured: true,
        note: 'Local Cursor CLI'
    }
}

function getOpenCodeStatus(): MachineProviderStatus {
    return {
        configured: Boolean(process.env.OPENCODE_CONFIG || process.env.OPENCODE_CONFIG_DIR),
        authMode: process.env.OPENCODE_CONFIG || process.env.OPENCODE_CONFIG_DIR ? 'config-file' : undefined,
        configPath: process.env.OPENCODE_CONFIG || process.env.OPENCODE_CONFIG_DIR || undefined
    }
}

export function buildMachineProviderStatus(): MachineProviderStatusMap {
    return {
        claude: getClaudeStatus(),
        codex: getCodexStatus(),
        gemini: getGeminiStatus(),
        cursor: getCursorStatus(),
        opencode: getOpenCodeStatus()
    }
}
