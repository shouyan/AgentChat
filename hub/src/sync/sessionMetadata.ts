export function mergeSessionMetadataPreservingSystemFields(
    existingMetadata: unknown | null,
    incomingMetadata: unknown | null
): unknown | null {
    if (!existingMetadata || typeof existingMetadata !== 'object') {
        return incomingMetadata
    }
    if (!incomingMetadata || typeof incomingMetadata !== 'object') {
        return existingMetadata
    }

    const oldObj = existingMetadata as Record<string, unknown>
    const newObj = incomingMetadata as Record<string, unknown>
    const merged: Record<string, unknown> = { ...newObj }
    let changed = false

    if (typeof oldObj.name === 'string' && typeof newObj.name !== 'string') {
        merged.name = oldObj.name
        changed = true
    }

    const oldSummary = oldObj.summary as { text?: unknown; updatedAt?: unknown } | undefined
    const newSummary = newObj.summary as { text?: unknown; updatedAt?: unknown } | undefined
    const oldUpdatedAt = typeof oldSummary?.updatedAt === 'number' ? oldSummary.updatedAt : null
    const newUpdatedAt = typeof newSummary?.updatedAt === 'number' ? newSummary.updatedAt : null
    if (oldUpdatedAt !== null && (newUpdatedAt === null || oldUpdatedAt > newUpdatedAt)) {
        merged.summary = oldSummary
        changed = true
    }

    if (oldObj.worktree && !newObj.worktree) {
        merged.worktree = oldObj.worktree
        changed = true
    }

    if (typeof oldObj.path === 'string' && typeof newObj.path !== 'string') {
        merged.path = oldObj.path
        changed = true
    }
    if (typeof oldObj.host === 'string' && typeof newObj.host !== 'string') {
        merged.host = oldObj.host
        changed = true
    }

    const carryForwardKeys = [
        'machineId',
        'homeDir',
        'agentchatHomeDir',
        'agentchatLibDir',
        'agentchatToolsDir',
        'flavor',
        'roomId',
        'claudeSessionId',
        'codexSessionId',
        'geminiSessionId',
        'opencodeSessionId',
        'cursorSessionId'
    ] as const

    for (const key of carryForwardKeys) {
        const oldValue = oldObj[key]
        const newValue = newObj[key]
        if ((typeof oldValue === 'string' && oldValue.length > 0) && !(typeof newValue === 'string' && newValue.length > 0)) {
            merged[key] = oldValue
            changed = true
        }
    }

    if (oldObj.roomSpawned === true && newObj.roomSpawned !== true) {
        merged.roomSpawned = true
        changed = true
    }

    return changed ? merged : incomingMetadata
}
