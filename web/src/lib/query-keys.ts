export const queryKeys = {
    sessions: ['sessions'] as const,
    session: (sessionId: string) => ['session', sessionId] as const,
    messages: (sessionId: string) => ['messages', sessionId] as const,
    rooms: ['rooms'] as const,
    room: (roomId: string) => ['room', roomId] as const,
    roomMessages: (roomId: string) => ['room-messages', roomId] as const,
    templates: ['templates'] as const,
    machines: ['machines'] as const,
    machineDirectory: (machineId: string, path: string) => ['machine-directory', machineId, path] as const,
    gitStatus: (sessionId: string) => ['git-status', sessionId] as const,
    sessionFiles: (sessionId: string, query: string) => ['session-files', sessionId, query] as const,
    sessionDirectory: (sessionId: string, path: string) => ['session-directory', sessionId, path] as const,
    sessionFile: (sessionId: string, path: string) => ['session-file', sessionId, path] as const,
    gitFileDiff: (sessionId: string, path: string, staged?: boolean) => [
        'git-file-diff',
        sessionId,
        path,
        staged ? 'staged' : 'unstaged'
    ] as const,
    slashCommands: (sessionId: string) => ['slash-commands', sessionId] as const,
    skills: (sessionId: string) => ['skills', sessionId] as const,
}
