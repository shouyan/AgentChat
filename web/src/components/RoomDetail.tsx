import { useEffect, useMemo, useRef, useState } from 'react'
import { buildRoomMentionAliasMap, getRoomComposerRoutingPreview } from '@hapi/protocol/roomRouting'
import type { ApiClient } from '@/api/client'
import type { Machine, Room, RoomMessage, RoomRole, RoomRoleTemplate, SessionSummary } from '@/types/api'
import { getRoomSavedTemplates, slugifyRoleTemplateKey, type RoleTemplateDraft } from '@/components/rooms/roleTemplates'
import { AgentAvatar, hashStringToIndex, normalizeAgentFlavor } from '@/components/rooms/agentCatalog'
import { MessageTaskDialog, buildTaskDraftFromMessage, type MessageTaskDraft } from '@/components/rooms/MessageTaskDialog'
import { OnlineBadge } from '@/components/rooms/OnlineBadge'
import { RoomRolesPanel } from '@/components/rooms/RoomRolesPanel'
import { RoomTasksPanel } from '@/components/rooms/RoomTasksPanel'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useRoomActions } from '@/hooks/mutations/useRoomActions'

type AgentFlavor = 'claude' | 'codex' | 'cursor' | 'gemini' | 'opencode'
type InviteMode = 'unassigned' | 'existing_session' | 'spawn_new'
type InvitePresetKey = 'planner' | 'coder' | 'reviewer' | 'researcher' | 'custom'

const INVITE_AGENT_ROLE_PRESETS: Record<InvitePresetKey, {
  label: string
  key: string
  description: string
  preferredFlavor?: AgentFlavor
}> = {
  planner: {
    label: 'Planner',
    key: 'planner',
    description: 'Break down the goal, assign work, and coordinate handoffs.',
    preferredFlavor: 'claude',
  },
  coder: {
    label: 'Coder',
    key: 'coder',
    description: 'Implement code changes and report results back into the room.',
    preferredFlavor: 'codex',
  },
  reviewer: {
    label: 'Reviewer',
    key: 'reviewer',
    description: 'Review outputs, validate quality, and request fixes when needed.',
    preferredFlavor: 'claude',
  },
  researcher: {
    label: 'Researcher',
    key: 'researcher',
    description: 'Collect evidence, compare options, and summarize findings for the room.',
    preferredFlavor: 'claude',
  },
  custom: {
    label: 'Custom role',
    key: 'agent',
    description: 'Define a custom role and bring a session into the room.',
  },
}

function statusColor(status: string): string {
  if (status === 'completed') return 'text-emerald-600'
  if (status === 'in_progress') return 'text-[var(--app-link)]'
  if (status === 'blocked') return 'text-red-600'
  return 'text-[var(--app-hint)]'
}

function formatTime(value: number): string {
  try {
    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function ChevronDownIcon(props: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={props.className}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

function ChevronLeftIcon(props: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={props.className}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}

function ChevronRightIcon(props: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={props.className}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

function slugifyMentionAlias(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function buildUniqueRoleKey(value: string, roles: RoomRole[]): string {
  const base = slugifyMentionAlias(value).replace(/-/g, '_') || 'agent'
  const existing = new Set(roles.map((role) => role.key.toLowerCase()))
  if (!existing.has(base.toLowerCase())) {
    return base
  }
  let counter = 2
  while (existing.has(`${base}_${counter}`.toLowerCase())) {
    counter += 1
  }
  return `${base}_${counter}`
}

function createInviteDraft(presetKey: InvitePresetKey, roles: RoomRole[]) {
  const preset = INVITE_AGENT_ROLE_PRESETS[presetKey]
  return {
    presetKey,
    mode: 'spawn_new' as InviteMode,
    label: preset.label,
    key: buildUniqueRoleKey(preset.key, roles),
    description: preset.description,
    preferredFlavor: preset.preferredFlavor,
    existingSessionId: '',
    machineId: '',
    directory: '',
    agent: preset.preferredFlavor ?? 'claude',
  }
}

function getRoleTone(roleKey: string): string {
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

function getAssignedSession(role: RoomRole | undefined, sessions: SessionSummary[]): SessionSummary | undefined {
  if (!role?.assignedSessionId) return undefined
  return sessions.find((session) => session.id === role.assignedSessionId)
}

function getRoleAgent(role: RoomRole | undefined, sessions: SessionSummary[]): AgentFlavor {
  const session = getAssignedSession(role, sessions)
  return normalizeAgentFlavor(session?.metadata?.flavor ?? role?.preferredFlavor ?? role?.spawnConfig?.flavor ?? undefined)
}

function getRoleSessionName(role: RoomRole | undefined, sessions: SessionSummary[]): string | null {
  const session = getAssignedSession(role, sessions)
  return session?.metadata?.name ?? session?.metadata?.summary?.text ?? null
}

function getSenderRole(message: RoomMessage, room: Room): RoomRole | undefined {
  return message.roleKey
    ? room.state.roles.find((item) => item.key === message.roleKey)
    : undefined
}

function getSenderSession(message: RoomMessage, room: Room, sessions: SessionSummary[]): SessionSummary | undefined {
  const senderRole = getSenderRole(message, room)
  return getAssignedSession(senderRole, sessions)
    ?? sessions.find((item) => item.id === message.senderId)
}

function getSenderLabel(message: RoomMessage, room: Room, sessions: SessionSummary[]): string {
  if (message.senderType === 'system') return 'System'
  if (message.senderType === 'user') return 'You'

  const role = getSenderRole(message, room)
  if (role) return role.label

  const session = getSenderSession(message, room, sessions)
  return session?.metadata?.name || session?.metadata?.summary?.text || message.senderId
}

function isRoleOnline(role: RoomRole, sessions: SessionSummary[]): boolean {
  if (!role.assignedSessionId) return false
  return sessions.some((session) => session.id === role.assignedSessionId && session.active)
}

function getOnlineRoleCount(room: Room, sessions: SessionSummary[]): number {
  return room.state.roles.filter((role) => isRoleOnline(role, sessions)).length
}

function groupTasksByStatus(tasks: Room['state']['tasks']) {
  const order = ['pending', 'in_progress', 'blocked', 'completed'] as const
  return order.map((status) => ({
    status,
    tasks: tasks.filter((task) => task.status === status),
  }))
}

function getMessageRoutingLabel(message: RoomMessage, room: Room): string | null {
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

function MentionBadge(props: { text: string; active?: boolean }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] ${props.active ? 'border-white/40 bg-white/15 text-white' : 'border-[var(--app-border)] bg-[var(--app-subtle-bg)] text-[var(--app-hint)]'}`}>
      {props.text}
    </span>
  )
}

function renderHighlightedMessageText(
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
      <span
        key={`${part}-${index}`}
        className={className}
      >
        {part}
      </span>
    )
  })
}

function snapshotRoleTemplate(room: Room, label: string, description?: string): RoleTemplateDraft {
  return {
    key: slugifyRoleTemplateKey(label),
    label,
    description,
    roles: room.state.roles.map((role, index) => ({
      key: role.key,
      label: role.label,
      description: role.description,
      required: role.required,
      preferredFlavor: role.preferredFlavor,
      preferredModel: role.preferredModel,
      permissionMode: role.permissionMode,
      sortOrder: role.sortOrder ?? index,
    })),
  }
}

export function RoomDetail(props: {
  api: ApiClient
  room: Room
  messages: RoomMessage[]
  sessions: SessionSummary[]
  machines: Machine[]
  onOpenSession?: (sessionId: string) => void
  onOpenSessionFiles?: (sessionId: string) => void
  onOpenSessionTerminal?: (sessionId: string) => void
  onDeleted?: (roomId: string) => void
}) {
  const [tab, setTab] = useState<'chat' | 'tasks' | 'roles'>('chat')
  const [message, setMessage] = useState('')
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskRoleKey, setNewTaskRoleKey] = useState('')
  const [showInviteComposer, setShowInviteComposer] = useState(false)
  const [inviteStatus, setInviteStatus] = useState<string | null>(null)
  const [inviteDraft, setInviteDraft] = useState(() => createInviteDraft('coder', props.room.state.roles))
  const [spawnState, setSpawnState] = useState<Record<string, { machineId?: string; directory?: string; agent?: 'claude' | 'codex' | 'cursor' | 'gemini' | 'opencode' }>>({})
  const [assignments, setAssignments] = useState<Record<string, string>>({})
  const [taskAssignees, setTaskAssignees] = useState<Record<string, string>>({})
  const [taskNotes, setTaskNotes] = useState<Record<string, string>>({})
  const [taskHandoffTargets, setTaskHandoffTargets] = useState<Record<string, string>>({})
  const [messageTaskDraft, setMessageTaskDraft] = useState<MessageTaskDraft | null>(null)
  const [templateName, setTemplateName] = useState('')
  const [templateDescription, setTemplateDescription] = useState('')
  const [templateStatus, setTemplateStatus] = useState<string | null>(null)
  const [membersExpanded, setMembersExpanded] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const actions = useRoomActions(props.api, props.room.id)
  const activeSessions = useMemo(() => props.sessions.filter((session) => session.active), [props.sessions])
  const chatEndRef = useRef<HTMLDivElement | null>(null)
  const membersScrollRef = useRef<HTMLDivElement | null>(null)
  const coordinatorRoleKey = props.room.metadata.coordinatorRoleKey
    ?? props.room.state.roles.find((role) => role.key === 'coordinator')?.key
    ?? props.room.state.roles[0]?.key

  const composerPreview = useMemo(
    () => getRoomComposerRoutingPreview(message, props.room),
    [message, props.room]
  )

  useEffect(() => {
    if (tab !== 'chat') return
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [props.messages.length, tab])

  const openInviteComposer = (presetKey: InvitePresetKey = 'coder') => {
    setTab('roles')
    setShowInviteComposer(true)
    setInviteStatus(null)
    setInviteDraft(createInviteDraft(presetKey, props.room.state.roles))
  }

  const closeInviteComposer = () => {
    setShowInviteComposer(false)
    setInviteStatus(null)
  }

  const insertMention = (mention: string) => {
    setMessage((current) => {
      const trimmedEnd = current.replace(/\s+$/, '')
      const prefix = trimmedEnd.length > 0 ? `${trimmedEnd} ` : ''
      return `${prefix}${mention} `
    })
  }

  const send = async () => {
    const trimmed = message.trim()
    if (!trimmed) return
    await actions.sendRoomMessage({ text: trimmed })
    setMessage('')
  }

  const createTask = async () => {
    const trimmed = newTaskTitle.trim()
    if (!trimmed) return
    await actions.createTask({ title: trimmed, assigneeRoleKey: newTaskRoleKey || undefined })
    setNewTaskTitle('')
  }

  const resetTaskComposer = (taskId: string) => {
    setTaskNotes((current) => ({ ...current, [taskId]: '' }))
  }

  const assignedCount = props.room.state.roles.filter((role) => role.assignedSessionId).length
  const wakeableCount = props.room.state.roles.filter((role) => role.assignedSessionId || (role.spawnConfig?.machineId && role.spawnConfig?.path)).length
  const onlineCount = getOnlineRoleCount(props.room, props.sessions)
  const completedCount = props.room.state.tasks.filter((task) => task.status === 'completed').length
  const roomHasAssignedAgents = assignedCount > 0
  const roomHasWakeableAgents = wakeableCount > 0
  const roomIsOffline = props.room.metadata.status === 'archived' || (onlineCount === 0 && roomHasWakeableAgents)
  const roomPowerBusy = actions.isOffliningRoom || actions.isWakingRoom
  const groupedTasks = useMemo(() => groupTasksByStatus(props.room.state.tasks), [props.room.state.tasks])
  const savedTemplates = useMemo(() => getRoomSavedTemplates(props.room.metadata), [props.room.metadata])
  const applyRoleTemplate = async (template: RoomRoleTemplate | RoleTemplateDraft) => {
    const existingKeys = new Set(props.room.state.roles.map((role) => role.key))
    const rolesToCreate = template.roles.filter((role) => !existingKeys.has(role.key))
    if (rolesToCreate.length === 0) {
      setTemplateStatus(`Template "${template.label}" is already fully present in this room.`)
      return
    }
    setTemplateStatus(`Applying template "${template.label}"...`)
    const baseSortOrder = props.room.state.roles.length
    for (const [index, role] of rolesToCreate.entries()) {
      await actions.addRole({
        key: role.key,
        label: role.label,
        description: role.description,
        required: role.required,
        preferredFlavor: role.preferredFlavor,
        preferredModel: role.preferredModel,
        permissionMode: role.permissionMode,
        assignmentMode: 'unassigned',
        sortOrder: baseSortOrder + index,
      })
    }
    setTemplateStatus(`Applied ${rolesToCreate.length} role(s) from "${template.label}".`)
  }

  const saveCurrentRolesAsTemplate = async () => {
    const label = templateName.trim()
    if (!label) {
      setTemplateStatus('Template name is required.')
      return
    }
    const snapshot = snapshotRoleTemplate(props.room, label, templateDescription.trim() || undefined)
    const nextTemplates = [
      ...savedTemplates.filter((template) => template.key !== snapshot.key),
      snapshot,
    ]
    await actions.updateRoom({ roleTemplates: nextTemplates })
    setTemplateName('')
    setTemplateDescription('')
    setTemplateStatus(`Saved room template "${snapshot.label}".`)
  }

  const deleteSavedTemplate = async (templateKey: string) => {
    const nextTemplates = savedTemplates.filter((template) => template.key !== templateKey)
    await actions.updateRoom({ roleTemplates: nextTemplates })
    setTemplateStatus('Saved room template removed.')
  }

  const scrollMembers = (direction: 'left' | 'right') => {
    membersScrollRef.current?.scrollBy({
      left: direction === 'left' ? -240 : 240,
      behavior: 'smooth',
    })
  }

  const inviteAgent = async () => {
    const label = inviteDraft.label.trim()
    if (!label) {
      setInviteStatus('Role label is required.')
      return
    }

    if (inviteDraft.mode === 'existing_session' && !inviteDraft.existingSessionId) {
      setInviteStatus('Pick an existing session to invite.')
      return
    }

    if (inviteDraft.mode === 'spawn_new' && (!inviteDraft.machineId || !inviteDraft.directory.trim())) {
      setInviteStatus('Choose a machine and directory before spawning a new agent.')
      return
    }

    const key = buildUniqueRoleKey(inviteDraft.key || label, props.room.state.roles)
    setInviteStatus(`Inviting @${key}…`)

    try {
      const added = await actions.addRole({
        key,
        label,
        description: inviteDraft.description.trim() || undefined,
        preferredFlavor: inviteDraft.preferredFlavor ?? inviteDraft.agent,
        assignmentMode: 'unassigned',
        sortOrder: props.room.state.roles.length,
      })

      const createdRole = added.room.state.roles.find((role) => role.key === key)
      if (!createdRole) {
        throw new Error('New role was created but could not be located.')
      }

      if (inviteDraft.mode === 'existing_session') {
        await actions.assignRole({ roleId: createdRole.id, sessionId: inviteDraft.existingSessionId })
      } else if (inviteDraft.mode === 'spawn_new') {
        await actions.spawnRole({
          roleId: createdRole.id,
          machineId: inviteDraft.machineId,
          directory: inviteDraft.directory.trim(),
          agent: inviteDraft.agent,
        })
      }

      setInviteStatus(`Invited @${key} into the room.`)
      setShowInviteComposer(false)
    } catch (error) {
      setInviteStatus(error instanceof Error ? error.message : 'Failed to invite agent')
    }
  }

  const handleDeleteRoom = async () => {
    await actions.deleteRoom()
    props.onDeleted?.(props.room.id)
  }

  const openMessageTaskDialog = (item: RoomMessage) => {
    const senderLabel = getSenderLabel(item, props.room, props.sessions)
    const draft = buildTaskDraftFromMessage(item, senderLabel)
    setMessageTaskDraft({
      messageId: item.id,
      title: draft.title,
      description: draft.description,
      assigneeRoleKey: item.roleKey ?? '',
    })
  }

  const createTaskFromMessage = async () => {
    if (!messageTaskDraft) return
    const title = messageTaskDraft.title.trim()
    if (!title) return
    await actions.createTask({
      title,
      description: messageTaskDraft.description.trim() || undefined,
      assigneeRoleKey: messageTaskDraft.assigneeRoleKey || undefined,
    })
    setTab('tasks')
    setMessageTaskDraft(null)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-[var(--app-border)] bg-[var(--app-bg)] px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">{props.room.metadata.name}</div>
            {props.room.metadata.goal ? (
              <div className="mt-1 max-w-3xl text-sm text-[var(--app-hint)]">{props.room.metadata.goal}</div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="flex items-center gap-2 rounded-full bg-[var(--app-subtle-bg)] px-2 py-1">
              <span className="text-[var(--app-hint)]">Status:</span>
              <span className={`text-xs font-medium ${roomIsOffline ? 'text-amber-700' : 'text-emerald-700'}`}>
                {roomPowerBusy ? (roomIsOffline ? 'Waking…' : 'Offlining…') : (roomIsOffline ? 'Offline' : 'Wake')}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={!roomIsOffline}
                onClick={() => void (roomIsOffline
                  ? actions.wakeRoom({ roles: props.room.state.roles, sessions: props.sessions })
                  : actions.offlineRoom({ roles: props.room.state.roles, sessions: props.sessions })
                )}
                disabled={(roomIsOffline ? !roomHasWakeableAgents : !roomHasAssignedAgents) || roomPowerBusy}
                className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors disabled:opacity-60 ${roomIsOffline ? 'border-amber-300 bg-amber-100' : 'border-emerald-300 bg-emerald-100'}`}
                title={roomIsOffline ? 'Resume all assigned room agents' : 'Archive all online room agents'}
              >
                <span
                  className={`absolute h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${roomIsOffline ? 'translate-x-1' : 'translate-x-6'}`}
                />
              </button>
            </div>
            <button
              type="button"
              onClick={() => void actions.updateRoom({ autoDispatch: !props.room.metadata.autoDispatch })}
              disabled={actions.isUpdatingRoom || roomPowerBusy}
              className={`rounded-full px-3 py-1 ${props.room.metadata.autoDispatch ? 'bg-emerald-100 text-emerald-700' : 'bg-[var(--app-subtle-bg)] text-[var(--app-hint)]'} disabled:opacity-60`}
              title="Toggle planner auto-dispatch nudges"
            >
              auto-dispatch {props.room.metadata.autoDispatch ? 'on' : 'off'}
            </button>
            <span className="rounded-full bg-[var(--app-subtle-bg)] px-3 py-1 text-[var(--app-hint)]">
              {onlineCount}/{props.room.state.roles.length} online
            </span>
            <span className="rounded-full bg-[var(--app-subtle-bg)] px-3 py-1 text-[var(--app-hint)]">
              {assignedCount}/{props.room.state.roles.length} roles assigned
            </span>
            <span className="rounded-full bg-[var(--app-subtle-bg)] px-3 py-1 text-[var(--app-hint)]">
              {completedCount}/{props.room.state.tasks.length} tasks done
            </span>
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              disabled={actions.isDeletingRoom}
              className="rounded-full border border-red-200 px-3 py-1 text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60"
              title="Delete room and all assigned sessions"
            >
              Delete
            </button>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          {(['chat', 'tasks', 'roles'] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              className={`rounded-full px-3 py-1.5 text-sm capitalize ${tab === item ? 'bg-[var(--app-link)] text-white' : 'bg-[var(--app-subtle-bg)] text-[var(--app-fg)]'}`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {tab === 'chat' ? (
        <div className="flex min-h-0 flex-1 flex-col bg-[var(--app-subtle-bg)]">
          <div className="border-b border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-3 md:px-4">
            <div className="mx-auto w-full max-w-4xl">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setMembersExpanded((current) => !current)}
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--app-subtle-bg)] px-3 py-1.5 text-left text-xs font-medium text-[var(--app-fg)]"
                >
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--app-hint)]">Members</span>
                  <span className="text-[var(--app-hint)]">{onlineCount}/{props.room.state.roles.length} online</span>
                  <ChevronDownIcon className={`h-4 w-4 text-[var(--app-hint)] transition-transform ${membersExpanded ? 'rotate-180' : ''}`} />
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => insertMention('@all')}
                    className="rounded-full bg-[var(--app-subtle-bg)] px-2.5 py-1 text-xs text-[var(--app-fg)]"
                  >
                    @all
                  </button>
                  <button
                    type="button"
                    onClick={() => openInviteComposer('coder')}
                    className="rounded-full border border-dashed border-[var(--app-border)] px-3 py-1.5 text-xs font-medium text-[var(--app-link)]"
                  >
                    + Invite
                  </button>
                </div>
              </div>

              {membersExpanded ? (
                <div className="mt-3">
                  <div className="mb-2 flex items-center justify-between gap-2 text-xs text-[var(--app-hint)]">
                    <span>Click avatar to open session · Mention button for quick @ routing</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => scrollMembers('left')}
                        className="rounded-full border border-[var(--app-border)] p-1 text-[var(--app-hint)] transition-colors hover:bg-[var(--app-subtle-bg)]"
                        aria-label="Scroll members left"
                      >
                        <ChevronLeftIcon className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => scrollMembers('right')}
                        className="rounded-full border border-[var(--app-border)] p-1 text-[var(--app-hint)] transition-colors hover:bg-[var(--app-subtle-bg)]"
                        aria-label="Scroll members right"
                      >
                        <ChevronRightIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div ref={membersScrollRef} className="flex gap-2 overflow-x-auto pb-1">
                {props.room.state.roles.map((role) => {
                  const online = isRoleOnline(role, props.sessions)
                  const sessionName = getRoleSessionName(role, props.sessions)
                  const roleAgent = getRoleAgent(role, props.sessions)
                  const canOpen = Boolean(role.assignedSessionId && props.onOpenSession)

                  return (
                    <div
                      key={role.id}
                      className="flex min-w-[170px] items-center gap-2 rounded-2xl border border-[var(--app-border)] bg-[var(--app-bg)] px-2.5 py-2 shadow-sm"
                    >
                      {canOpen ? (
                        <button
                          type="button"
                          onClick={() => props.onOpenSession?.(role.assignedSessionId!)}
                          className="relative shrink-0"
                          title="Open session"
                        >
                          <AgentAvatar
                            agent={roleAgent}
                            ringIndex={hashStringToIndex(role.assignedSessionId ?? role.id ?? role.key)}
                            sizeClass="h-9 w-9"
                          />
                          <span className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[var(--app-bg)] ${online ? 'bg-emerald-500' : role.assignedSessionId ? 'bg-amber-400' : 'bg-gray-300'}`} />
                        </button>
                      ) : (
                        <div className="relative shrink-0">
                          <AgentAvatar
                            agent={roleAgent}
                            ringIndex={hashStringToIndex(role.assignedSessionId ?? role.id ?? role.key)}
                            sizeClass="h-9 w-9"
                          />
                          <span className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[var(--app-bg)] ${online ? 'bg-emerald-500' : role.assignedSessionId ? 'bg-amber-400' : 'bg-gray-300'}`} />
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <div className="truncate text-sm font-medium text-[var(--app-fg)]">{role.label}</div>
                          {props.room.metadata.coordinatorRoleKey === role.key ? (
                            <span className="rounded-full bg-[var(--app-subtle-bg)] px-1.5 py-0.5 text-[10px] text-[var(--app-hint)]">Coordinator</span>
                          ) : null}
                        </div>
                        <div className="truncate text-[11px] text-[var(--app-hint)]">@{role.key}</div>
                        <div className="mt-1 flex items-center gap-2">
                          <OnlineBadge online={online} />
                          <button
                            type="button"
                            onClick={() => insertMention(`@${role.key}`)}
                            className={`rounded-full px-2 py-0.5 text-[11px] ${getRoleTone(role.key)}`}
                          >
                            Mention
                          </button>
                        </div>
                        {role.assignedSessionId && (props.onOpenSessionFiles || props.onOpenSessionTerminal) ? (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {props.onOpenSessionFiles ? (
                              <button
                                type="button"
                                onClick={() => props.onOpenSessionFiles?.(role.assignedSessionId!)}
                                className="rounded-full border border-[var(--app-border)] px-2 py-0.5 text-[11px] text-[var(--app-hint)]"
                              >
                                Files
                              </button>
                            ) : null}
                            {props.onOpenSessionTerminal ? (
                              <button
                                type="button"
                                onClick={() => props.onOpenSessionTerminal?.(role.assignedSessionId!)}
                                className="rounded-full border border-[var(--app-border)] px-2 py-0.5 text-[11px] text-[var(--app-hint)]"
                              >
                                Terminal
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                        {sessionName ? (
                          <div className="mt-1 truncate text-[11px] text-[var(--app-hint)]">{sessionName}</div>
                        ) : null}
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
                  return (
                    <div key={item.id} className="flex justify-center">
                      <div className="max-w-2xl rounded-full border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-1.5 text-xs text-[var(--app-hint)]">
                        {item.content.text}
                      </div>
                    </div>
                  )
                }

                return (
                  <div key={item.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                    <div className={`grid max-w-[88%] gap-x-2.5 ${isUser ? 'grid-cols-[minmax(0,1fr)_auto]' : 'grid-cols-[auto_minmax(0,1fr)]'}`}>
                      <div
                        className={`mb-1 flex flex-wrap items-center gap-2 px-1 text-xs text-[var(--app-hint)] ${
                          isUser
                            ? 'col-start-1 row-start-1 justify-end'
                            : 'col-start-2 row-start-1 justify-start'
                        }`}
                      >
                        <span className="font-medium text-[var(--app-fg)]">{senderLabel}</span>
                        {item.roleKey ? <span>@{item.roleKey}</span> : null}
                        {!isUser && item.roleKey ? <OnlineBadge online={senderOnline} /> : null}
                        <span>{formatTime(item.createdAt)}</span>
                      </div>

                      {isUser ? (
                        <div className="col-start-2 row-start-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--app-link)] text-[11px] font-semibold text-white shadow-sm">
                          You
                        </div>
                      ) : canOpenSession ? (
                        <button
                          type="button"
                          onClick={() => props.onOpenSession?.(senderSessionId!)}
                          className="relative col-start-1 row-start-2 shrink-0 self-start"
                          title="Open session"
                        >
                          <AgentAvatar
                            agent={senderAgent}
                            ringIndex={hashStringToIndex(senderSessionId ?? senderRole?.id ?? item.id)}
                            sizeClass="h-10 w-10"
                          />
                          <span className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[var(--app-bg)] ${senderOnline ? 'bg-emerald-500' : senderSessionId ? 'bg-amber-400' : 'bg-gray-300'}`} />
                        </button>
                      ) : (
                        <div className="relative col-start-1 row-start-2 shrink-0 self-start">
                          <AgentAvatar
                            agent={senderAgent}
                            ringIndex={hashStringToIndex(senderSessionId ?? senderRole?.id ?? item.id)}
                            sizeClass="h-10 w-10"
                          />
                          <span className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[var(--app-bg)] ${senderOnline ? 'bg-emerald-500' : senderSessionId ? 'bg-amber-400' : 'bg-gray-300'}`} />
                        </div>
                      )}

                      <div
                        className={`min-w-0 ${
                          isUser
                            ? 'col-start-1 row-start-2 items-end'
                            : 'col-start-2 row-start-2 items-start'
                        } flex flex-col`}
                      >
                        <div className={`rounded-3xl px-4 py-3 shadow-sm ${isUser ? 'bg-[var(--app-link)] text-white' : 'border border-[var(--app-border)] bg-[var(--app-bg)] text-[var(--app-fg)]'}`}>
                          {(item.content.mentionAll || (item.content.mentions && item.content.mentions.length > 0)) ? (
                            <div className="mb-2 flex flex-wrap gap-1.5">
                              {item.content.mentionAll ? <MentionBadge text="@all" active={isUser} /> : null}
                              {(item.content.mentions ?? []).map((mention) => (
                                <MentionBadge key={`${item.id}-${mention}`} text={`@${mention}`} active={isUser} />
                              ))}
                            </div>
                          ) : null}

                          <div className="whitespace-pre-wrap text-sm leading-6">
                            {renderHighlightedMessageText(item.content.text, props.room, {
                              onOpenSession: props.onOpenSession,
                              sessions: props.sessions,
                              active: isUser,
                            })}
                          </div>

                          {routeLabel ? (
                            <div className={`mt-2 text-[11px] ${isUser ? 'text-white/75' : 'text-[var(--app-hint)]'}`}>
                              {routeLabel}
                            </div>
                          ) : null}

                          {!isSystem ? (
                            <div className="mt-3 flex justify-end">
                              <button
                                type="button"
                                onClick={() => openMessageTaskDialog(item)}
                                className={`rounded-full border px-2.5 py-1 text-[11px] ${
                                  isUser
                                    ? 'border-white/30 text-white/80'
                                    : 'border-[var(--app-border)] text-[var(--app-hint)]'
                                }`}
                              >
                                Create task
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={chatEndRef} />
            </div>
          </div>

          <div className="border-t border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-3 md:px-4">
            <div className="mx-auto w-full max-w-4xl">
              <div className="mb-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => insertMention('@all')}
                  className="rounded-full bg-[var(--app-subtle-bg)] px-2.5 py-1 text-xs text-[var(--app-fg)]"
                >
                  Mention @all
                </button>
                {props.room.state.roles.map((role) => (
                  <button
                    key={`composer-${role.id}`}
                    type="button"
                    onClick={() => insertMention(`@${role.key}`)}
                    className="rounded-full bg-[var(--app-subtle-bg)] px-2.5 py-1 text-xs text-[var(--app-fg)]"
                  >
                    @{role.key}
                  </button>
                ))}
              </div>

              <div className="rounded-3xl border border-[var(--app-border)] bg-[var(--app-bg)] p-2 shadow-sm">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void send()
                    }
                  }}
                  className="min-h-28 w-full resize-none rounded-2xl bg-transparent px-3 py-2 text-sm outline-none"
                  placeholder="Message the room… use @planner, @coder, or @all"
                />
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--app-border)] px-2 pt-2">
                  <div className="text-xs text-[var(--app-hint)]">{composerPreview.helper}</div>
                  <button
                    type="button"
                    onClick={() => void send()}
                    disabled={actions.isSendingMessage}
                    className="rounded-full bg-[var(--app-link)] px-4 py-2 text-sm text-white disabled:opacity-60"
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {tab === 'tasks' ? (
        <RoomTasksPanel
          room={props.room}
          groupedTasks={groupedTasks}
          activeSessions={activeSessions}
          coordinatorRoleKey={coordinatorRoleKey}
          newTaskTitle={newTaskTitle}
          newTaskRoleKey={newTaskRoleKey}
          taskAssignees={taskAssignees}
          taskNotes={taskNotes}
          taskHandoffTargets={taskHandoffTargets}
          actions={actions}
          onNewTaskTitleChange={setNewTaskTitle}
          onNewTaskRoleKeyChange={setNewTaskRoleKey}
          onCreateTask={() => void createTask()}
          onTaskAssigneeChange={(taskId, value) => setTaskAssignees((current) => ({ ...current, [taskId]: value }))}
          onTaskNoteChange={(taskId, value) => setTaskNotes((current) => ({ ...current, [taskId]: value }))}
          onTaskHandoffTargetChange={(taskId, value) => setTaskHandoffTargets((current) => ({ ...current, [taskId]: value }))}
          onResetTaskComposer={resetTaskComposer}
          statusColor={statusColor}
        />
      ) : null}

      {tab === 'roles' ? (
        <RoomRolesPanel
          room={props.room}
          sessions={props.sessions}
          activeSessions={activeSessions}
          machines={props.machines}
          assignments={assignments}
          spawnState={spawnState}
          showInviteComposer={showInviteComposer}
          inviteStatus={inviteStatus}
          inviteDraft={inviteDraft}
          savedTemplates={savedTemplates}
          templateName={templateName}
          templateDescription={templateDescription}
          templateStatus={templateStatus}
          actions={actions}
          onOpenInviteComposer={openInviteComposer}
          onSelectInvitePreset={(presetKey) => setInviteDraft((current) => ({
            ...createInviteDraft(presetKey, props.room.state.roles),
            mode: current.mode,
          }))}
          onCloseInviteComposer={closeInviteComposer}
          onInviteDraftChange={(updater) => setInviteDraft(updater)}
          onInviteAgent={() => void inviteAgent()}
          onApplyRoleTemplate={(template) => void applyRoleTemplate(template)}
          onTemplateNameChange={setTemplateName}
          onTemplateDescriptionChange={setTemplateDescription}
          onSaveCurrentRolesAsTemplate={() => void saveCurrentRolesAsTemplate()}
          onDeleteSavedTemplate={(templateKey) => void deleteSavedTemplate(templateKey)}
          onAssignmentChange={(roleId, value) => setAssignments((current) => ({ ...current, [roleId]: value }))}
          onSpawnStateChange={(roleId, patch) => setSpawnState((current) => ({ ...current, [roleId]: patch }))}
          onOpenSession={props.onOpenSession}
          onOpenSessionFiles={props.onOpenSessionFiles}
          onOpenSessionTerminal={props.onOpenSessionTerminal}
        />
      ) : null}

      <MessageTaskDialog
        draft={messageTaskDraft}
        roles={props.room.state.roles}
        isPending={actions.isCreatingTask}
        onChange={setMessageTaskDraft}
        onClose={() => setMessageTaskDraft(null)}
        onSubmit={() => void createTaskFromMessage()}
      />

      <ConfirmDialog
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete Room"
        description={`Delete "${props.room.metadata.name}" and permanently remove all sessions currently assigned to this room? This cannot be undone.`}
        confirmLabel="Delete"
        confirmingLabel="Deleting…"
        onConfirm={handleDeleteRoom}
        isPending={actions.isDeletingRoom}
        destructive
      />
    </div>
  )
}
