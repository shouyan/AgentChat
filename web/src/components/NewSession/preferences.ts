import type { AgentType } from './types'

const AGENT_STORAGE_KEY = 'agentchat:newSession:agent'
const YOLO_STORAGE_KEY = 'agentchat:newSession:yolo'
const LEGACY_AGENT_STORAGE_KEY = 'agentchat:newSession:agent'
const LEGACY_YOLO_STORAGE_KEY = 'agentchat:newSession:yolo'

const VALID_AGENTS: AgentType[] = ['claude', 'codex', 'cursor', 'gemini', 'opencode']

export function loadPreferredAgent(): AgentType {
    try {
        const stored = localStorage.getItem(AGENT_STORAGE_KEY) ?? localStorage.getItem(LEGACY_AGENT_STORAGE_KEY)
        if (stored && VALID_AGENTS.includes(stored as AgentType)) {
            return stored as AgentType
        }
    } catch {
        // Ignore storage errors
    }
    return 'claude'
}

export function savePreferredAgent(agent: AgentType): void {
    try {
        localStorage.setItem(AGENT_STORAGE_KEY, agent)
        localStorage.setItem(LEGACY_AGENT_STORAGE_KEY, agent)
    } catch {
        // Ignore storage errors
    }
}

export function loadPreferredYoloMode(): boolean {
    try {
        return (localStorage.getItem(YOLO_STORAGE_KEY) ?? localStorage.getItem(LEGACY_YOLO_STORAGE_KEY)) === 'true'
    } catch {
        return false
    }
}

export function savePreferredYoloMode(enabled: boolean): void {
    try {
        localStorage.setItem(YOLO_STORAGE_KEY, enabled ? 'true' : 'false')
        localStorage.setItem(LEGACY_YOLO_STORAGE_KEY, enabled ? 'true' : 'false')
    } catch {
        // Ignore storage errors
    }
}
