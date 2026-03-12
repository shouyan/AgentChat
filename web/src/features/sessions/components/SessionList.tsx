import { useMemo, useState } from 'react'
import type { SessionSummary } from '@/types/api'
import type { ApiClient } from '@/api/client'
import { useLongPress } from '@/hooks/useLongPress'
import { usePlatform } from '@/hooks/usePlatform'
import { useSessionActions } from '@/hooks/mutations/useSessionActions'
import { SessionActionMenu } from '@/components/SessionActionMenu'
import { RenameSessionDialog } from '@/components/RenameSessionDialog'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { AgentAvatar, AGENT_LABELS, hashStringToIndex, normalizeAgentFlavor } from '@/components/rooms/agentCatalog'
import { useTranslation } from '@/lib/use-translation'

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

function BulbIcon(props: { className?: string }) {
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
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M12 2a7 7 0 0 0-4 12c.6.6 1 1.2 1 2h6c0-.8.4-1.4 1-2a7 7 0 0 0-4-12Z" />
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

function getSessionTitle(session: SessionSummary): string {
  if (session.metadata?.name) return session.metadata.name
  if (session.metadata?.summary?.text) return session.metadata.summary.text
  if (session.metadata?.path) {
    const parts = session.metadata.path.split('/').filter(Boolean)
    return parts.length > 0 ? parts[parts.length - 1] : session.id.slice(0, 8)
  }
  return session.id.slice(0, 8)
}

function getTodoProgress(session: SessionSummary): { completed: number; total: number } | null {
  if (!session.todoProgress) return null
  if (session.todoProgress.completed === session.todoProgress.total) return null
  return session.todoProgress
}

function getAgentLabel(session: SessionSummary): string {
  return AGENT_LABELS[normalizeAgentFlavor(session.metadata?.flavor)]
}

function formatRelativeTime(value: number, t: (key: string, params?: Record<string, string | number>) => string): string | null {
  const ms = value < 1_000_000_000_000 ? value * 1000 : value
  if (!Number.isFinite(ms)) return null
  const delta = Date.now() - ms
  if (delta < 60_000) return t('session.time.justNow')
  const minutes = Math.floor(delta / 60_000)
  if (minutes < 60) return t('session.time.minutesAgo', { n: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('session.time.hoursAgo', { n: hours })
  const days = Math.floor(hours / 24)
  if (days < 7) return t('session.time.daysAgo', { n: days })
  return new Date(ms).toLocaleDateString()
}

function sortSessions(sessions: SessionSummary[]): SessionSummary[] {
  return [...sessions].sort((a, b) => {
    const rankA = a.active ? (a.pendingRequestsCount > 0 ? 0 : 1) : 2
    const rankB = b.active ? (b.pendingRequestsCount > 0 ? 0 : 1) : 2
    if (rankA !== rankB) return rankA - rankB
    return b.updatedAt - a.updatedAt
  })
}

export function SessionItem(props: {
  session: SessionSummary
  onSelect: (sessionId: string) => void
  onDeleted?: (sessionId: string) => void
  showPath?: boolean
  api: ApiClient | null
  selected?: boolean
}) {
  const { t } = useTranslation()
  const { session: s, onSelect, showPath = true, api, selected = false } = props
  const { haptic } = usePlatform()
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuAnchorPoint, setMenuAnchorPoint] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [renameOpen, setRenameOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const { archiveSession, renameSession, deleteSession, isPending } = useSessionActions(
    api,
    s.id,
    s.metadata?.flavor ?? null
  )

  const longPressHandlers = useLongPress({
    onLongPress: (point) => {
      haptic.impact('medium')
      setMenuAnchorPoint(point)
      setMenuOpen(true)
    },
    onClick: () => {
      if (!menuOpen) {
        onSelect(s.id)
      }
    },
    threshold: 500,
  })

  const sessionName = getSessionTitle(s)
  const progress = getTodoProgress(s)
  const agent = normalizeAgentFlavor(s.metadata?.flavor)
  const statusDotClass = s.active
    ? (s.thinking ? 'bg-[#007AFF]' : 'bg-[var(--app-badge-success-text)]')
    : 'bg-[var(--app-hint)]'

  const handleDelete = async () => {
    await deleteSession()
    props.onDeleted?.(s.id)
  }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        {...longPressHandlers}
        className={`session-list-item flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-link)] select-none ${selected ? 'bg-[var(--app-secondary-bg)]' : 'hover:bg-[var(--app-subtle-bg)]'}`}
        style={{ WebkitTouchCallout: 'none' }}
        aria-current={selected ? 'page' : undefined}
      >
        <div className="relative shrink-0">
          <AgentAvatar
            agent={agent}
            ringIndex={hashStringToIndex(s.id)}
            sizeClass="h-11 w-11"
          />
          <span className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[var(--app-bg)] ${statusDotClass}`} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-[var(--app-fg)]">{sessionName}</div>
              <div className="mt-0.5 truncate text-xs text-[var(--app-hint)]">{getAgentLabel(s)}</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <div className="text-[11px] text-[var(--app-hint)]">{formatRelativeTime(s.updatedAt, t)}</div>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  event.preventDefault()
                  setDeleteOpen(true)
                }}
                className="rounded-full border border-red-200 px-2 py-1 text-red-600 transition-colors hover:bg-red-50"
                title="Delete session"
              >
                <TrashIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {showPath ? (
            <div className="mt-1 truncate text-xs text-[var(--app-hint)]">{s.metadata?.path ?? s.id}</div>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="rounded-full bg-[var(--app-subtle-bg)] px-2 py-0.5 text-[var(--app-hint)]">
              {t('session.item.modelMode')}: {s.modelMode || 'default'}
            </span>
            {s.thinking ? (
              <span className="rounded-full bg-[#007AFF]/10 px-2 py-0.5 text-[#007AFF]">
                {t('session.item.thinking')}
              </span>
            ) : null}
            {progress ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">
                <BulbIcon className="h-3 w-3" />
                {progress.completed}/{progress.total}
              </span>
            ) : null}
            {s.pendingRequestsCount > 0 ? (
              <span className="rounded-full bg-[var(--app-subtle-bg)] px-2 py-0.5 text-[var(--app-badge-warning-text)]">
                {t('session.item.pending')} {s.pendingRequestsCount}
              </span>
            ) : null}
            {s.metadata?.worktree?.branch ? (
              <span className="rounded-full bg-[var(--app-subtle-bg)] px-2 py-0.5 text-[var(--app-hint)]">
                {s.metadata.worktree.branch}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <SessionActionMenu
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        sessionActive={s.active}
        onRename={() => setRenameOpen(true)}
        onArchive={() => setArchiveOpen(true)}
        onDelete={() => setDeleteOpen(true)}
        anchorPoint={menuAnchorPoint}
      />

      <RenameSessionDialog
        isOpen={renameOpen}
        onClose={() => setRenameOpen(false)}
        currentName={sessionName}
        onRename={renameSession}
        isPending={isPending}
      />

      <ConfirmDialog
        isOpen={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        title={t('dialog.archive.title')}
        description={t('dialog.archive.description', { name: sessionName })}
        confirmLabel={t('dialog.archive.confirm')}
        confirmingLabel={t('dialog.archive.confirming')}
        onConfirm={archiveSession}
        isPending={isPending}
        destructive
      />

      <ConfirmDialog
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={t('dialog.delete.title')}
        description={t('dialog.delete.description', { name: sessionName })}
        confirmLabel={t('dialog.delete.confirm')}
        confirmingLabel={t('dialog.delete.confirming')}
        onConfirm={handleDelete}
        isPending={isPending}
        destructive
      />
    </>
  )
}

export function SessionList(props: {
  sessions: SessionSummary[]
  onSelect: (sessionId: string) => void
  onDeleted?: (sessionId: string) => void
  onNewSession: () => void
  onRefresh: () => void
  isLoading: boolean
  renderHeader?: boolean
  api: ApiClient | null
  selectedSessionId?: string | null
}) {
  const sortedSessions = useMemo(() => sortSessions(props.sessions), [props.sessions])
  const { renderHeader = true, api, selectedSessionId } = props

  return (
    <div className="flex flex-col gap-2">
      {renderHeader ? (
        <div className="flex items-center justify-between px-3 pb-1 pt-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--app-hint)]">Sessions</div>
            <div className="text-xs text-[var(--app-hint)]">{props.sessions.length} total</div>
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
              className="session-list-new-button inline-flex items-center gap-1 rounded-full bg-[var(--app-link)] px-3 py-1.5 text-xs text-white transition-colors"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Session
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-1 px-2 pb-2">
        {sortedSessions.map((session) => (
          <SessionItem
            key={session.id}
            session={session}
            onSelect={props.onSelect}
            onDeleted={props.onDeleted}
            api={api}
            selected={session.id === selectedSessionId}
          />
        ))}

        {!props.isLoading && sortedSessions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--app-border)] px-4 py-6 text-sm text-[var(--app-hint)]">
            No sessions yet.
          </div>
        ) : null}
      </div>
    </div>
  )
}
