import { buildRoomMentionAliasMap } from '@hapi/protocol/roomRouting'
import type { Room, RoomMessage, RoomRole, SessionSummary } from '@/types/api'
import { normalizeAgentFlavor } from '@/components/rooms/agentCatalog'

export type RoomAgentFlavor = 'claude' | 'codex' | 'cursor' | 'gemini' | 'opencode'

export function formatRoomMessageTime(value: number): string {
    try {
        return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch {
        return ''
    }
}

export function getRoleTone(roleKey: string): string {
    const palette = [
        'bg-sky-100 text-sky-700 border-sky-200',
        'bg-violet-100 text-violet-700 border-violet-200',
        'bg-emerald-100 text-emerald-700 border-emerald-200',
        'bg-amber-100 text-amber-700 border-amber-200',
        'bg-rose-100 text-rose-700 border-rose-200',
    ]

    let hash = 0
    for (let i = 0; i < roleKey.length; i++) hash += roleKey.charCodeAt(i)
    return palette[hash % palette.length] ?? palette[0]
}

export function getAssignedSession(role: RoomRole | undefined, sessions: SessionSummary[]): SessionSummary | undefined {
    if (!role?.assignedSessionId) return undefined
    return sessions.find((session) => session.id === role.assignedSessionId)
}

export function getRoleAgent(role: RoomRole | undefined, sessions: SessionSummary[]): RoomAgentFlavor {
    const session = getAssignedSession(role, sessions)
    return normalizeAgentFlavor(session?.metadata?.flavor ?? role?.preferredFlavor ?? role?.spawnConfig?.flavor ?? undefined)
}

export function getRoleSessionName(role: RoomRole | undefined, sessions: SessionSummary[]): string | null {
    const session = getAssignedSession(role, sessions)
    return session?.metadata?.name ?? session?.metadata?.summary?.text ?? null
}

export function getSenderRole(message: RoomMessage, room: Room): RoomRole | undefined {
    return message.roleKey
        ? room.state.roles.find((item) => item.key === message.roleKey)
        : undefined
}

export function getSenderSession(message: RoomMessage, room: Room, sessions: SessionSummary[]): SessionSummary | undefined {
    const senderRole = getSenderRole(message, room)
    return getAssignedSession(senderRole, sessions)
        ?? sessions.find((item) => item.id === message.senderId)
}

export function getSenderLabel(message: RoomMessage, room: Room, sessions: SessionSummary[]): string {
    if (message.senderType === 'system') return 'System'
    if (message.senderType === 'user') return 'You'

    const role = getSenderRole(message, room)
    if (role) return role.label

    const session = getSenderSession(message, room, sessions)
    return session?.metadata?.name || session?.metadata?.summary?.text || message.senderId
}

export function isRoleOnline(role: RoomRole, sessions: SessionSummary[]): boolean {
    if (!role.assignedSessionId) return false
    return sessions.some((session) => session.id === role.assignedSessionId && session.active)
}

export function getOnlineRoleCount(room: Room, sessions: SessionSummary[]): number {
    return room.state.roles.filter((role) => isRoleOnline(role, sessions)).length
}

export function getMessageRoutingLabel(message: RoomMessage, room: Room): string | null {
    if (message.senderType === 'system') return null
    if (message.content.deliveryMode === 'broadcast') return 'Broadcast to @all'
    if (message.content.deliveryMode === 'coordinator') {
        const coordinatorKey = message.content.targetRoleKey
            ?? room.metadata.coordinatorRoleKey
            ?? room.state.roles[0]?.key
        return coordinatorKey ? `Default routed to @${coordinatorKey}` : 'Default room routing'
    }
    if (message.content.mentions && message.content.mentions.length > 0) {
        return `Mentioned ${message.content.mentions.map((item) => `@${item}`).join(', ')}`
    }
    if (message.content.targetRoleKey) return `Targeted @${message.content.targetRoleKey}`
    return null
}

export function MentionBadge(props: { text: string; active?: boolean }) {
    return (
        <span className={`rounded-full border px-2 py-0.5 text-[11px] ${props.active ? 'border-white/40 bg-white/15 text-white' : 'border-[var(--app-border)] bg-[var(--app-subtle-bg)] text-[var(--app-hint)]'}`}>
            {props.text}
        </span>
    )
}

export function renderHighlightedMessageText(
    text: string,
    room: Room,
    options?: {
        onOpenSession?: (sessionId: string) => void
        sessions?: SessionSummary[]
        active?: boolean
    }
) {
    const aliases = buildRoomMentionAliasMap(room.state.roles)
    const parts = text.split(/(\B@[a-zA-Z0-9][\w-]*)/g)
    return parts.map((part, index) => {
        const match = /^\B@([a-zA-Z0-9][\w-]*)$/.exec(part)
        if (!match) {
            return <span key={`${part}-${index}`}>{part}</span>
        }
        const token = (match[1] ?? '').toLowerCase()
        const normalizedRoleKey = token === 'all' ? 'all' : aliases.get(token)
        const matchedRole = normalizedRoleKey && normalizedRoleKey !== 'all'
            ? room.state.roles.find((role) => role.key === normalizedRoleKey)
            : undefined
        const matchedSessionId = matchedRole?.assignedSessionId
            ?? (matchedRole ? getAssignedSession(matchedRole, options?.sessions ?? [])?.id : undefined)
        const isKnownMention = token === 'all' || Boolean(normalizedRoleKey)
        const className = options?.active
            ? 'rounded-full bg-white/15 px-1.5 py-0.5 font-medium text-white'
            : isKnownMention
                ? 'rounded-full bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800'
                : ''

        if (matchedSessionId && options?.onOpenSession) {
            return (
                <button
                    key={`${part}-${index}`}
                    type="button"
                    onClick={() => options.onOpenSession?.(matchedSessionId)}
                    className={`${className} cursor-pointer transition-opacity hover:opacity-80`}
                >
                    {part}
                </button>
            )
        }

        return (
            <span key={`${part}-${index}`} className={className}>
                {part}
            </span>
        )
    })
}
