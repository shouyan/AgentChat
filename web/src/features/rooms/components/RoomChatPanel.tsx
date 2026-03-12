import type { MutableRefObject } from 'react'
import { AgentAvatar, hashStringToIndex, normalizeAgentFlavor } from '@/components/rooms/agentCatalog'
import { OnlineBadge } from '@/features/rooms/components/OnlineBadge'
import type { Room, RoomMessage, SessionSummary } from '@/types/api'
import type { useRoomActions } from '@/features/rooms/hooks/useRoomActions'
import { getRoomComposerRoutingPreview } from '@hapi/protocol/roomRouting'
import {
    formatRoomMessageTime,
    getMessageRoutingLabel,
    getOnlineRoleCount,
    getRoleAgent,
    getRoleSessionName,
    getRoleTone,
    getSenderLabel,
    getSenderRole,
    getSenderSession,
    isRoleOnline,
    MentionBadge,
    renderHighlightedMessageText,
} from '@/features/rooms/lib/chatHelpers'

type RoomActions = ReturnType<typeof useRoomActions>

function ChevronDownIcon(props: { className?: string }) {
    return <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={props.className}><path d="m6 9 6 6 6-6" /></svg>
}

function ChevronLeftIcon(props: { className?: string }) {
    return <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={props.className}><path d="m15 18-6-6 6-6" /></svg>
}

function ChevronRightIcon(props: { className?: string }) {
    return <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={props.className}><path d="m9 18 6-6-6-6" /></svg>
}

export function RoomChatPanel(props: {
    room: Room
    messages: RoomMessage[]
    sessions: SessionSummary[]
    membersExpanded: boolean
    chatEndRef: MutableRefObject<HTMLDivElement | null>
    membersScrollRef: MutableRefObject<HTMLDivElement | null>
    message: string
    actions: RoomActions
    onToggleMembersExpanded: () => void
    onScrollMembers: (direction: 'left' | 'right') => void
    onInsertMention: (mention: string) => void
    onMessageChange: (value: string) => void
    onSend: () => void
    onOpenInviteComposer: () => void
    onOpenMessageTaskDialog: (message: RoomMessage) => void
    onOpenSession?: (sessionId: string) => void
    onOpenSessionFiles?: (sessionId: string) => void
    onOpenSessionTerminal?: (sessionId: string) => void
}) {
    const onlineCount = getOnlineRoleCount(props.room, props.sessions)
    const composerPreview = getRoomComposerRoutingPreview(props.message, props.room)

    return (
        <div className="flex min-h-0 flex-1 flex-col bg-[var(--app-subtle-bg)]">
            <div className="border-b border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-3 md:px-4">
                <div className="mx-auto w-full max-w-4xl">
                    <div className="flex items-center justify-between gap-3">
                        <button type="button" onClick={props.onToggleMembersExpanded} className="inline-flex items-center gap-2 rounded-full bg-[var(--app-subtle-bg)] px-3 py-1.5 text-left text-xs font-medium text-[var(--app-fg)]">
                            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--app-hint)]">Members</span>
                            <span className="text-[var(--app-hint)]">{onlineCount}/{props.room.state.roles.length} online</span>
                            <ChevronDownIcon className={`h-4 w-4 text-[var(--app-hint)] transition-transform ${props.membersExpanded ? 'rotate-180' : ''}`} />
                        </button>
                        <div className="flex items-center gap-2">
                            <button type="button" onClick={() => props.onInsertMention('@all')} className="rounded-full bg-[var(--app-subtle-bg)] px-2.5 py-1 text-xs text-[var(--app-fg)]">@all</button>
                            <button type="button" onClick={props.onOpenInviteComposer} className="rounded-full border border-dashed border-[var(--app-border)] px-3 py-1.5 text-xs font-medium text-[var(--app-link)]">+ Invite</button>
                        </div>
                    </div>

                    {props.membersExpanded ? (
                        <div className="mt-3">
                            <div className="mb-2 flex items-center justify-between gap-2 text-xs text-[var(--app-hint)]">
                                <span>Click avatar to open session · Mention button for quick @ routing</span>
                                <div className="flex items-center gap-1">
                                    <button type="button" onClick={() => props.onScrollMembers('left')} className="rounded-full border border-[var(--app-border)] p-1 text-[var(--app-hint)] transition-colors hover:bg-[var(--app-subtle-bg)]" aria-label="Scroll members left"><ChevronLeftIcon className="h-4 w-4" /></button>
                                    <button type="button" onClick={() => props.onScrollMembers('right')} className="rounded-full border border-[var(--app-border)] p-1 text-[var(--app-hint)] transition-colors hover:bg-[var(--app-subtle-bg)]" aria-label="Scroll members right"><ChevronRightIcon className="h-4 w-4" /></button>
                                </div>
                            </div>

                            <div ref={props.membersScrollRef} className="flex gap-2 overflow-x-auto pb-1">
                                {props.room.state.roles.map((role) => {
                                    const online = isRoleOnline(role, props.sessions)
                                    const sessionName = getRoleSessionName(role, props.sessions)
                                    const roleAgent = getRoleAgent(role, props.sessions)
                                    const canOpen = Boolean(role.assignedSessionId && props.onOpenSession)
                                    return (
                                        <div key={role.id} className="flex min-w-[170px] items-center gap-2 rounded-2xl border border-[var(--app-border)] bg-[var(--app-bg)] px-2.5 py-2 shadow-sm">
                                            {canOpen ? (
                                                <button type="button" onClick={() => props.onOpenSession?.(role.assignedSessionId!)} className="relative shrink-0" title="Open session">
                                                    <AgentAvatar agent={roleAgent} ringIndex={hashStringToIndex(role.assignedSessionId ?? role.id ?? role.key)} sizeClass="h-9 w-9" />
                                                    <span className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[var(--app-bg)] ${online ? 'bg-emerald-500' : role.assignedSessionId ? 'bg-amber-400' : 'bg-gray-300'}`} />
                                                </button>
                                            ) : (
                                                <div className="relative shrink-0">
                                                    <AgentAvatar agent={roleAgent} ringIndex={hashStringToIndex(role.assignedSessionId ?? role.id ?? role.key)} sizeClass="h-9 w-9" />
                                                    <span className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[var(--app-bg)] ${online ? 'bg-emerald-500' : role.assignedSessionId ? 'bg-amber-400' : 'bg-gray-300'}`} />
                                                </div>
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5">
                                                    <div className="truncate text-sm font-medium text-[var(--app-fg)]">{role.label}</div>
                                                    {props.room.metadata.coordinatorRoleKey === role.key ? <span className="rounded-full bg-[var(--app-subtle-bg)] px-1.5 py-0.5 text-[10px] text-[var(--app-hint)]">Coordinator</span> : null}
                                                </div>
                                                <div className="truncate text-[11px] text-[var(--app-hint)]">@{role.key}</div>
                                                <div className="mt-1 flex items-center gap-2">
                                                    <OnlineBadge online={online} />
                                                    <button type="button" onClick={() => props.onInsertMention(`@${role.key}`)} className={`rounded-full px-2 py-0.5 text-[11px] ${getRoleTone(role.key)}`}>Mention</button>
                                                </div>
                                                {role.assignedSessionId && (props.onOpenSessionFiles || props.onOpenSessionTerminal) ? (
                                                    <div className="mt-1 flex flex-wrap gap-1">
                                                        {props.onOpenSessionFiles ? <button type="button" onClick={() => props.onOpenSessionFiles?.(role.assignedSessionId!)} className="rounded-full border border-[var(--app-border)] px-2 py-0.5 text-[11px] text-[var(--app-hint)]">Files</button> : null}
                                                        {props.onOpenSessionTerminal ? <button type="button" onClick={() => props.onOpenSessionTerminal?.(role.assignedSessionId!)} className="rounded-full border border-[var(--app-border)] px-2 py-0.5 text-[11px] text-[var(--app-hint)]">Terminal</button> : null}
                                                    </div>
                                                ) : null}
                                                {sessionName ? <div className="mt-1 truncate text-[11px] text-[var(--app-hint)]">{sessionName}</div> : null}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-4 md:px-4">
                <div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
                    {props.messages.length === 0 ? (
                        <div className="rounded-3xl border border-dashed border-[var(--app-border)] bg-[var(--app-bg)] px-5 py-10 text-center text-sm text-[var(--app-hint)]">
                            No room messages yet. Start with something like <span className="font-medium">@{props.room.metadata.coordinatorRoleKey ?? props.room.state.roles[0]?.key ?? 'planner'}</span>.
                        </div>
                    ) : null}

                    {props.messages.map((item) => {
                        const isSystem = item.senderType === 'system'
                        const isUser = item.senderType === 'user'
                        const senderLabel = getSenderLabel(item, props.room, props.sessions)
                        const routeLabel = getMessageRoutingLabel(item, props.room)
                        const senderRole = getSenderRole(item, props.room)
                        const senderSession = getSenderSession(item, props.room, props.sessions)
                        const senderSessionId = senderRole?.assignedSessionId ?? senderSession?.id
                        const senderOnline = senderRole ? isRoleOnline(senderRole, props.sessions) : false
                        const senderAgent = normalizeAgentFlavor(senderSession?.metadata?.flavor ?? senderRole?.preferredFlavor ?? senderRole?.spawnConfig?.flavor ?? undefined)
                        const canOpenSession = Boolean(!isUser && senderSessionId && props.onOpenSession)

                        if (isSystem) {
                            return <div key={item.id} className="flex justify-center"><div className="max-w-2xl rounded-full border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-1.5 text-xs text-[var(--app-hint)]">{item.content.text}</div></div>
                        }

                        return (
                            <div key={item.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                                <div className={`grid max-w-[88%] gap-x-2.5 ${isUser ? 'grid-cols-[minmax(0,1fr)_auto]' : 'grid-cols-[auto_minmax(0,1fr)]'}`}>
                                    <div className={`mb-1 flex flex-wrap items-center gap-2 px-1 text-xs text-[var(--app-hint)] ${isUser ? 'col-start-1 row-start-1 justify-end' : 'col-start-2 row-start-1 justify-start'}`}>
                                        <span className="font-medium text-[var(--app-fg)]">{senderLabel}</span>
                                        {item.roleKey ? <span>@{item.roleKey}</span> : null}
                                        {!isUser && item.roleKey ? <OnlineBadge online={senderOnline} /> : null}
                                        <span>{formatRoomMessageTime(item.createdAt)}</span>
                                    </div>

                                    {isUser ? (
                                        <div className="col-start-2 row-start-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--app-link)] text-[11px] font-semibold text-white shadow-sm">You</div>
                                    ) : canOpenSession ? (
                                        <button type="button" onClick={() => props.onOpenSession?.(senderSessionId!)} className="relative col-start-1 row-start-2 shrink-0 self-start" title="Open session">
                                            <AgentAvatar agent={senderAgent} ringIndex={hashStringToIndex(senderSessionId ?? senderRole?.id ?? item.id)} sizeClass="h-10 w-10" />
                                            <span className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[var(--app-bg)] ${senderOnline ? 'bg-emerald-500' : senderSessionId ? 'bg-amber-400' : 'bg-gray-300'}`} />
                                        </button>
                                    ) : (
                                        <div className="relative col-start-1 row-start-2 shrink-0 self-start">
                                            <AgentAvatar agent={senderAgent} ringIndex={hashStringToIndex(senderSessionId ?? senderRole?.id ?? item.id)} sizeClass="h-10 w-10" />
                                            <span className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[var(--app-bg)] ${senderOnline ? 'bg-emerald-500' : senderSessionId ? 'bg-amber-400' : 'bg-gray-300'}`} />
                                        </div>
                                    )}

                                    <div className={`min-w-0 ${isUser ? 'col-start-1 row-start-2 items-end' : 'col-start-2 row-start-2 items-start'} flex flex-col`}>
                                        <div className={`rounded-3xl px-4 py-3 shadow-sm ${isUser ? 'bg-[var(--app-link)] text-white' : 'border border-[var(--app-border)] bg-[var(--app-bg)] text-[var(--app-fg)]'}`}>
                                            {(item.content.mentionAll || (item.content.mentions && item.content.mentions.length > 0)) ? (
                                                <div className="mb-2 flex flex-wrap gap-1.5">
                                                    {item.content.mentionAll ? <MentionBadge text="@all" active={isUser} /> : null}
                                                    {(item.content.mentions ?? []).map((mention) => <MentionBadge key={`${item.id}-${mention}`} text={`@${mention}`} active={isUser} />)}
                                                </div>
                                            ) : null}

                                            <div className="whitespace-pre-wrap text-sm leading-6">
                                                {renderHighlightedMessageText(item.content.text, props.room, {
                                                    onOpenSession: props.onOpenSession,
                                                    sessions: props.sessions,
                                                    active: isUser,
                                                })}
                                            </div>

                                            {routeLabel ? <div className={`mt-2 text-[11px] ${isUser ? 'text-white/75' : 'text-[var(--app-hint)]'}`}>{routeLabel}</div> : null}
                                            {!isSystem ? (
                                                <div className="mt-3 flex justify-end">
                                                    <button type="button" onClick={() => props.onOpenMessageTaskDialog(item)} className={`rounded-full border px-2.5 py-1 text-[11px] ${isUser ? 'border-white/30 text-white/80' : 'border-[var(--app-border)] text-[var(--app-hint)]'}`}>Create task</button>
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                    <div ref={props.chatEndRef} />
                </div>
            </div>

            <div className="border-t border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-3 md:px-4">
                <div className="mx-auto w-full max-w-4xl">
                    <div className="mb-2 flex flex-wrap gap-2">
                        <button type="button" onClick={() => props.onInsertMention('@all')} className="rounded-full bg-[var(--app-subtle-bg)] px-2.5 py-1 text-xs text-[var(--app-fg)]">Mention @all</button>
                        {props.room.state.roles.map((role) => (
                            <button key={`composer-${role.id}`} type="button" onClick={() => props.onInsertMention(`@${role.key}`)} className="rounded-full bg-[var(--app-subtle-bg)] px-2.5 py-1 text-xs text-[var(--app-fg)]">@{role.key}</button>
                        ))}
                    </div>

                    <div className="rounded-3xl border border-[var(--app-border)] bg-[var(--app-bg)] p-2 shadow-sm">
                        <textarea
                            value={props.message}
                            onChange={(e) => props.onMessageChange(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault()
                                    props.onSend()
                                }
                            }}
                            className="min-h-28 w-full resize-none rounded-2xl bg-transparent px-3 py-2 text-sm outline-none"
                            placeholder="Message the room… use @planner, @coder, or @all"
                        />
                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--app-border)] px-2 pt-2">
                            <div className="text-xs text-[var(--app-hint)]">{composerPreview.helper}</div>
                            <button type="button" onClick={props.onSend} disabled={props.actions.isSendingMessage} className="rounded-full bg-[var(--app-link)] px-4 py-2 text-sm text-white disabled:opacity-60">Send</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
