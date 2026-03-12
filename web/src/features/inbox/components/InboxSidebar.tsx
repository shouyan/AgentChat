import type { ApiClient } from '@/api/client'
import { BrandMark } from '@/components/BrandMark'
import { ChatList } from '@/components/ChatList'
import { useInboxSidebarData } from '../hooks/useInboxSidebarData'

function SettingsIcon(props: { className?: string }) {
    return <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={props.className}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
}

export function InboxSidebar(props: {
    api: ApiClient | null
    selectedSessionId: string | null
    selectedRoomId: string | null
    onOpenSession: (sessionId: string) => void
    onOpenRoom: (roomId: string) => void
    onSessionDeleted?: (sessionId: string) => void
    onRoomDeleted?: (roomId: string) => void
    onNewSession: () => void
    onNewRoom: () => void
    onOpenSettings: () => void
}) {
    const { rooms, roomsLoading, roomsError, refetchRooms, sessions, sessionsLoading, sessionsError, refetchSessions, topLevelSessions } = useInboxSidebarData(props.api)

    return (
        <div className="flex h-full min-h-0 flex-col bg-[var(--app-bg)]">
            <div className="border-b border-[var(--app-divider)] bg-[var(--app-bg)] px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <BrandMark className="h-11 w-11 rounded-2xl" />
                        <div>
                            <div className="text-lg font-semibold text-[var(--app-fg)]">AgentChat</div>
                            <div className="mt-0.5 text-xs text-[var(--app-hint)]">Rooms and direct sessions in one inbox</div>
                        </div>
                    </div>
                    <button type="button" onClick={props.onOpenSettings} className="rounded-full p-2 text-[var(--app-hint)] transition-colors hover:bg-[var(--app-subtle-bg)] hover:text-[var(--app-fg)]" title="Settings"><SettingsIcon className="h-5 w-5" /></button>
                </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto desktop-scrollbar-left">
                {roomsError ? <div className="px-4 py-3 text-sm text-red-600">{roomsError}</div> : null}
                {sessionsError ? <div className="px-4 py-3 text-sm text-red-600">{sessionsError}</div> : null}
                <ChatList
                    api={props.api}
                    rooms={rooms}
                    sessions={topLevelSessions}
                    allSessions={sessions}
                    selectedRoomId={props.selectedRoomId}
                    selectedSessionId={props.selectedSessionId}
                    onOpenRoom={props.onOpenRoom}
                    onOpenSession={props.onOpenSession}
                    onRoomDeleted={props.onRoomDeleted}
                    onSessionDeleted={props.onSessionDeleted}
                    onNewRoom={props.onNewRoom}
                    onNewSession={props.onNewSession}
                    onRefresh={() => { void refetchRooms(); void refetchSessions() }}
                    isLoading={roomsLoading || sessionsLoading}
                />
            </div>
        </div>
    )
}
