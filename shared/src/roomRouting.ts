import type { Room, RoomRole } from './types'

export function normalizeRoomMentionToken(value: string): string {
    return value.trim().replace(/^@+/, '').toLowerCase()
}

export function slugifyRoomMentionAlias(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '-')
        .replace(/^-+|-+$/g, '')
}

export function uniqueRoomStrings(values: Array<string | null | undefined>): string[] {
    const seen = new Set<string>()
    const result: string[] = []
    for (const value of values) {
        if (!value) continue
        if (seen.has(value)) continue
        seen.add(value)
        result.push(value)
    }
    return result
}

export function buildRoomMentionAliasMap(roles: Pick<RoomRole, 'key' | 'label'>[]): Map<string, string> {
    const aliases = new Map<string, string>()
    for (const role of roles) {
        const candidates = uniqueRoomStrings([
            normalizeRoomMentionToken(role.key),
            slugifyRoomMentionAlias(role.key),
            slugifyRoomMentionAlias(role.label),
            slugifyRoomMentionAlias(role.key).replace(/-/g, '_'),
            slugifyRoomMentionAlias(role.label).replace(/-/g, '_'),
        ])
        for (const candidate of candidates) {
            if (!aliases.has(candidate)) {
                aliases.set(candidate, role.key)
            }
        }
    }
    return aliases
}

export function extractRoomMentionTokens(text: string): string[] {
    return Array.from(text.matchAll(/\B@([a-zA-Z0-9][\w-]*)/g))
        .map((match) => normalizeRoomMentionToken(match[1] ?? ''))
        .filter(Boolean)
}

export function resolveRoomMentionTargets(text: string, roles: Pick<RoomRole, 'key' | 'label'>[]): {
    mentionAll: boolean
    mentionedRoleKeys: string[]
} {
    const aliases = buildRoomMentionAliasMap(roles)
    const mentionTokens = extractRoomMentionTokens(text)
    const mentionAll = mentionTokens.includes('all')
    const mentionedRoleKeys = uniqueRoomStrings(
        mentionTokens
            .filter((token) => token !== 'all')
            .map((token) => aliases.get(token))
    )

    return {
        mentionAll,
        mentionedRoleKeys,
    }
}

export function getRoomCoordinatorRoleKey(room: Pick<Room, 'metadata' | 'state'>): string | undefined {
    return room.metadata.coordinatorRoleKey
        ?? room.state.roles.find((role) => role.key === 'coordinator')?.key
        ?? room.state.roles[0]?.key
}

export function getRoomComposerRoutingPreview(text: string, room: Pick<Room, 'metadata' | 'state'>): {
    mentionAll: boolean
    mentionedRoleKeys: string[]
    helper: string
} {
    const { mentionAll, mentionedRoleKeys } = resolveRoomMentionTargets(text, room.state.roles)

    if (mentionAll) {
        return {
            mentionAll: true,
            mentionedRoleKeys,
            helper: 'This will notify everyone in the room.'
        }
    }

    if (mentionedRoleKeys.length > 0) {
        return {
            mentionAll: false,
            mentionedRoleKeys,
            helper: `This will route to ${mentionedRoleKeys.map((item) => `@${item}`).join(', ')}.`
        }
    }

    const coordinatorKey = getRoomCoordinatorRoleKey(room)
    return {
        mentionAll: false,
        mentionedRoleKeys: coordinatorKey ? [coordinatorKey] : [],
        helper: coordinatorKey
            ? `No @mention detected, so this will default to @${coordinatorKey}.`
            : 'No roles available for routing yet.'
    }
}
