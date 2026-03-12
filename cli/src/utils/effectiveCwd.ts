import { existsSync } from 'node:fs'

export function getEffectiveCwd(): string {
    const requestedCwd = process.env.AGENTCHAT_SESSION_CWD
    if (requestedCwd && existsSync(requestedCwd)) {
        return requestedCwd
    }
    return process.cwd()
}
