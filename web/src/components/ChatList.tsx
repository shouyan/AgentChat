import { useMemo } from 'react'
import type { ApiClient } from '@/api/client'
import type { Room, SessionSummary } from '@/types/api'
import { RoomItem } from '@/components/RoomList'
import { SessionItem } from '@/components/SessionList'

function PlusIcon(props: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

type ChatEntry =
  | { type: 'room'; id: string; updatedAt: number; room: Room }
  | { type: 'session'; id: string; updatedAt: number; session: SessionSummary }

function sortChatEntries(entries: ChatEntry[]): ChatEntry[] {
  return [...entries].sort((a, b) => b.updatedAt - a.updatedAt)
}

export function ChatList(props: {
  api: ApiClient | null
  rooms: Room[]
  sessions: SessionSummary[]
  allSessions: SessionSummary[]
  selectedRoomId: string | null
  selectedSessionId: string | null
  onOpenRoom: (roomId: string) => void
  onOpenSession: (sessionId: string) => void
  onRoomDeleted?: (roomId: string) => void
  onSessionDeleted?: (sessionId: string) => void
  onNewRoom: () => void
  onNewSession: () => void
  onRefresh: () => void
  isLoading?: boolean
}) {
  const entries = useMemo(() => sortChatEntries([
    ...props.rooms.map((room) => ({
      type: 'room' as const,
      id: room.id,
      updatedAt: room.updatedAt,
      room,
    })),
    ...props.sessions.map((session) => ({
      type: 'session' as const,
      id: session.id,
      updatedAt: session.updatedAt,
      session,
    })),
  ]), [props.rooms, props.sessions])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-3 pb-1 pt-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--app-hint)]">Chats</div>
          <div className="text-xs text-[var(--app-hint)]">{entries.length} total</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={props.onRefresh}
            className="rounded-full border border-[var(--app-border)] px-2.5 py-1 text-xs text-[var(--app-hint)] transition-colors hover:bg-[var(--app-subtle-bg)]"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={props.onNewSession}
            className="inline-flex items-center gap-1 rounded-full border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-1.5 text-xs text-[var(--app-fg)] transition-colors hover:bg-[var(--app-subtle-bg)]"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            Session
          </button>
          <button
            type="button"
            onClick={props.onNewRoom}
            className="inline-flex items-center gap-1 rounded-full bg-[var(--app-link)] px-3 py-1.5 text-xs text-white transition-colors"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            Room
          </button>
        </div>
      </div>

      {props.isLoading ? <div className="px-3 py-2 text-sm text-[var(--app-hint)]">Loading chats…</div> : null}

      <div className="flex flex-col gap-1 px-2 pb-2">
        {entries.map((entry) => (
          entry.type === 'room' ? (
            <RoomItem
              key={`room:${entry.id}`}
              room={entry.room}
              sessions={props.allSessions}
              selected={props.selectedRoomId === entry.room.id}
              onSelect={props.onOpenRoom}
              api={props.api}
              onDeleted={props.onRoomDeleted}
            />
          ) : (
            <SessionItem
              key={`session:${entry.id}`}
              session={entry.session}
              onSelect={props.onOpenSession}
              onDeleted={props.onSessionDeleted}
              api={props.api}
              selected={props.selectedSessionId === entry.session.id}
            />
          )
        ))}

        {!props.isLoading && entries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--app-border)] px-4 py-6 text-sm text-[var(--app-hint)]">
            No chats yet.
          </div>
        ) : null}
      </div>
    </div>
  )
}
