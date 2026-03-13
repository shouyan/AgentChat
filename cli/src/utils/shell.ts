import { existsSync } from 'node:fs'

export function resolveDefaultShell(env: NodeJS.ProcessEnv = process.env, options?: { exists?: (path: string) => boolean }): string {
    const shellFromEnv = env.SHELL?.trim()
    if (shellFromEnv) {
        return shellFromEnv
    }

    if (process.platform === 'win32') {
        return env.ComSpec?.trim() || 'cmd.exe'
    }

    const exists = options?.exists ?? existsSync

    for (const candidate of ['/bin/zsh', '/bin/bash', '/bin/sh']) {
        if (exists(candidate)) {
            return candidate
        }
    }

    return '/bin/sh'
}
