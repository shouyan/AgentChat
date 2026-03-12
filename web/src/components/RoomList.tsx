import { useState } from 'react'
import type { ApiClient } from '@/api/client'
import type { Room, SessionSummary } from '@/types/api'
import { AgentAvatar, hashStringToIndex, normalizeAgentFlavor } from '@/components/rooms/agentCatalog'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useRoomActions } from '@/features/rooms/hooks/useRoomActions'

function isRoleOnline(role: Room['state']['roles'][number], sessions: SessionSummary[]): boolean {
  if (!role.assignedSessionId) return false
  return sessions.some((session) => session.id === role.assignedSessionId && session.active)
}

function resolveRoomRoleAgent(role: Room['state']['roles'][number], sessions: SessionSummary[]) {
  const assignedSession = role.assignedSessionId
    ? sessions.find((session) => session.id === role.assignedSessionId)
    : undefined

  return normalizeAgentFlavor(
    assignedSession?.metadata?.flavor
    ?? role.preferredFlavor
    ?? role.spawnConfig?.flavor
    ?? undefined
  )
}

function resolveRoomRoleName(role: Room['state']['roles'][number], sessions: SessionSummary[]): string {
  const assignedSession = role.assignedSessionId
    ? sessions.find((session) => session.id === role.assignedSessionId)
    : undefined

  return assignedSession?.metadata?.name
    ?? assignedSession?.metadata?.summary?.text
    ?? role.label
}

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

function TrashIcon(props: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  )
}

export function RoomItem(props: {
  room: Room
  sessions: SessionSummary[]
  selected: boolean
  onSelect: (roomId: string) => void
  api: ApiClient | null
  onDeleted?: (roomId: string) => void
}) {
  const [deleteOpen, setDeleteOpen] = useState(false)
  const actions = useRoomActions(props.api, props.room.id)
  const room = props.room
  const assigned = room.state.roles.filter((role) => role.assignedSessionId).length
  const online = room.state.roles.filter((role) => isRoleOnline(role, props.sessions)).length
  const completed = room.state.tasks.filter((task) => task.status === 'completed').length
  const previewRoles = room.state.roles.slice(0, 4)

  const handleDelete = async () => {
    await actions.deleteRoom()
    props.onDeleted?.(room.id)
  }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => props.onSelect(room.id)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            props.onSelect(room.id)
          }
        }}
        className={`w-full rounded-2xl px-3 py-3 text-left transition-colors ${props.selected ? 'bg-[var(--app-secondary-bg)]' : 'hover:bg-[var(--app-subtle-bg)]'}`}
      >
        <div className="flex items-start gap-3">
          <div className="flex -space-x-3 shrink-0 pt-0.5">
            {previewRoles.map((role) => (
              <div key={role.id} className="relative">
                <AgentAvatar
                  agent={resolveRoomRoleAgent(role, props.sessions)}
                  ringIndex={hashStringToIndex(role.assignedSessionId ?? role.id ?? role.key)}
                  sizeClass="h-10 w-10"
                />
                <span className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[var(--app-bg)] ${isRoleOnline(role, props.sessions) ? 'bg-emerald-500' : role.assignedSessionId ? 'bg-amber-400' : 'bg-gray-300'}`} />
              </div>
            ))}
            {room.state.roles.length > 4 ? (
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--app-border)] bg-[var(--app-bg)] text-[11px] font-medium text-[var(--app-hint)]">
                +{room.state.roles.length - 4}
              </div>
            ) : null}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-[var(--app-fg)]">{room.metadata.name}</div>
                <div className="mt-0.5 truncate text-xs text-[var(--app-hint)]">
                  {previewRoles.map((role) => resolveRoomRoleName(role, props.sessions)).join(' · ')}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <div className="rounded-full bg-[var(--app-subtle-bg)] px-2 py-0.5 text-[11px] text-[var(--app-hint)]">
                  {online}/{room.state.roles.length} online
                </div>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    setDeleteOpen(true)
                  }}
                  className="rounded-full border border-red-200 px-2 py-1 text-red-600 transition-colors hover:bg-red-50"
                  title="Delete room"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {room.metadata.goal ? (
              <div className="mt-1 line-clamp-2 text-xs text-[var(--app-hint)]">{room.metadata.goal}</div>
            ) : null}

            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-[var(--app-hint)]">
              <span className="rounded-full bg-[var(--app-subtle-bg)] px-2 py-0.5">
                {assigned}/{room.state.roles.length} assigned
              </span>
              <span className="rounded-full bg-[var(--app-subtle-bg)] px-2 py-0.5">
                {completed}/{room.state.tasks.length} tasks done
              </span>
              {room.metadata.coordinatorRoleKey ? (
                <span className="rounded-full bg-[var(--app-subtle-bg)] px-2 py-0.5">
                  @{room.metadata.coordinatorRoleKey}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete Room"
        description={`Delete "${room.metadata.name}" and permanently remove all sessions currently assigned to this room? This cannot be undone.`}
        confirmLabel="Delete"
        confirmingLabel="Deleting…"
        onConfirm={handleDelete}
        isPending={actions.isDeletingRoom}
        destructive
      />
    </>
  )
}

export function RoomList(props: {
  rooms: Room[]
  sessions: SessionSummary[]
  selectedRoomId: string | null
  onSelect: (roomId: string) => void
  onNewRoom: () => void
  onRefresh: () => void
  api: ApiClient | null
  onDeleted?: (roomId: string) => void
  isLoading?: boolean
  renderHeader?: boolean
}) {
  const { renderHeader = true } = props

  return (
    <div className="flex flex-col gap-2">
      {renderHeader ? (
        <div className="flex items-center justify-between px-3 pb-1 pt-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--app-hint)]">Rooms</div>
            <div className="text-xs text-[var(--app-hint)]">{props.rooms.length} total</div>
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
              onClick={props.onNewRoom}
              className="inline-flex items-center gap-1 rounded-full bg-[var(--app-link)] px-3 py-1.5 text-xs text-white transition-colors"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Room
            </button>
          </div>
        </div>
      ) : null}

      {props.isLoading ? <div className="px-3 py-2 text-sm text-[var(--app-hint)]">Loading rooms…</div> : null}

      <div className="flex flex-col gap-1 px-2 pb-2">
        {props.rooms.map((room) => (
          <RoomItem
            key={room.id}
            room={room}
            sessions={props.sessions}
            selected={props.selectedRoomId === room.id}
            onSelect={props.onSelect}
            api={props.api}
            onDeleted={props.onDeleted}
          />
        ))}

        {!props.isLoading && props.rooms.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--app-border)] px-4 py-6 text-sm text-[var(--app-hint)]">
            No rooms yet.
          </div>
        ) : null}
      </div>
    </div>
  )
}
