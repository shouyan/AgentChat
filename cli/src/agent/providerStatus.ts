import type { MachineProviderStatus, MachineProviderStatusMap } from '@agentchat/protocol/machines'

function getClaudeStatus(env: NodeJS.ProcessEnv): MachineProviderStatus {
    const authMode = env.ANTHROPIC_AUTH_TOKEN
        ? 'auth-token'
        : env.ANTHROPIC_API_KEY
            ? 'api-key'
            : env.CLAUDE_CODE_OAUTH_TOKEN
                ? 'oauth-token'
                : undefined

    return {
        configured: Boolean(authMode),
        authMode,
        baseUrl: env.ANTHROPIC_BASE_URL || undefined
    }
}

function getCodexStatus(env: NodeJS.ProcessEnv): MachineProviderStatus {
    return {
        configured: Boolean(env.OPENAI_API_KEY),
        authMode: env.OPENAI_API_KEY ? 'api-key' : undefined,
        baseUrl: env.OPENAI_BASE_URL || undefined
    }
}

function getGeminiStatus(env: NodeJS.ProcessEnv): MachineProviderStatus {
    const authMode = env.GEMINI_API_KEY ? 'api-key' : undefined

    return {
        configured: Boolean(authMode),
        authMode,
        baseUrl: env.GOOGLE_GEMINI_BASE_URL || env.GEMINI_BASE_URL || env.GOOGLE_BASE_URL || undefined
    }
}

function getCursorStatus(): MachineProviderStatus {
    return {
        configured: true,
        note: 'Local Cursor CLI'
    }
}

function getOpenCodeStatus(env: NodeJS.ProcessEnv): MachineProviderStatus {
    return {
        configured: Boolean(env.OPENCODE_CONFIG || env.OPENCODE_CONFIG_DIR),
        authMode: env.OPENCODE_CONFIG || env.OPENCODE_CONFIG_DIR ? 'config-file' : undefined,
        configPath: env.OPENCODE_CONFIG || env.OPENCODE_CONFIG_DIR || undefined
    }
}

export function buildMachineProviderStatus(env: NodeJS.ProcessEnv = process.env): MachineProviderStatusMap {
    return {
        claude: getClaudeStatus(env),
        codex: getCodexStatus(env),
        gemini: getGeminiStatus(env),
        cursor: getCursorStatus(),
        opencode: getOpenCodeStatus(env)
    }
}
