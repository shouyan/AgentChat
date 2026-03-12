import { useEffect, useMemo, useRef, useState } from 'react'
import type { ApiClient } from '@/api/client'
import type { Machine, Room, RoomMessage, RoomRole, RoomRoleTemplate, SessionSummary } from '@/types/api'
import { BUILTIN_ROLE_TEMPLATE_LIST, getRoomSavedTemplates, slugifyRoleTemplateKey, type RoleTemplateDraft } from '@/components/rooms/roleTemplates'
import { AgentAvatar, hashStringToIndex, normalizeAgentFlavor } from '@/components/rooms/agentCatalog'
import { MessageTaskDialog, buildTaskDraftFromMessage, type MessageTaskDraft } from '@/components/rooms/MessageTaskDialog'
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

function buildMentionAliasMap(roles: RoomRole[]): Map<string, string> {
  const aliases = new Map<string, string>()
  for (const role of roles) {
    const candidates = [
      role.key.toLowerCase(),
      slugifyMentionAlias(role.key),
      slugifyMentionAlias(role.label),
      slugifyMentionAlias(role.key).replace(/-/g, '_'),
      slugifyMentionAlias(role.label).replace(/-/g, '_'),
    ].filter(Boolean)

    for (const candidate of candidates) {
      if (!aliases.has(candidate)) {
        aliases.set(candidate, role.key)
      }
    }
  }
  return aliases
}

function getComposerRoutingPreview(text: string, room: Room): {
  mentionAll: boolean
  mentionedRoleKeys: string[]
  helper: string
} {
  const aliases = buildMentionAliasMap(room.state.roles)
  const tokens = Array.from(text.matchAll(/\B@([a-zA-Z0-9][\w-]*)/g))
    .map((match) => (match[1] ?? '').toLowerCase())
    .filter(Boolean)

  const mentionAll = tokens.includes('all')
  const mentionedRoleKeys: string[] = []
  for (const token of tokens) {
    if (token === 'all') continue
    const matched = aliases.get(token)
    if (matched && !mentionedRoleKeys.includes(matched)) {
      mentionedRoleKeys.push(matched)
    }
  }

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

  const coordinatorKey = room.metadata.coordinatorRoleKey
    ?? room.state.roles.find((role) => role.key === 'coordinator')?.key
    ?? room.state.roles[0]?.key

  return {
    mentionAll: false,
    mentionedRoleKeys: coordinatorKey ? [coordinatorKey] : [],
    helper: coordinatorKey
      ? `No @mention detected, so this will default to @${coordinatorKey}.`
      : 'No roles available for routing yet.'
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
  const aliases = buildMentionAliasMap(room.state.roles)
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

function OnlineBadge(props: { online: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${props.online ? 'bg-emerald-100 text-emerald-700' : 'bg-[var(--app-subtle-bg)] text-[var(--app-hint)]'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${props.online ? 'bg-emerald-500' : 'bg-gray-300'}`} />
      {props.online ? 'online' : 'offline'}
    </span>
  )
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
    () => getComposerRoutingPreview(message, props.room),
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
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-3">
              <div className="text-sm font-medium">New task</div>
              <div className="mt-1 text-xs text-[var(--app-hint)]">
                Planner/coordinator should create and assign tasks here. Assignees can then claim, report blockers, hand off, and complete.
              </div>
              <input value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} className="mt-2 w-full rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2" placeholder="Task title" />
              <select value={newTaskRoleKey} onChange={(e) => setNewTaskRoleKey(e.target.value)} className="mt-2 w-full rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-2 py-1.5">
                <option value="">Unassigned</option>
                {props.room.state.roles.map((role) => <option key={role.id} value={role.key}>{role.label}</option>)}
              </select>
              <div className="mt-2 flex justify-end"><button type="button" onClick={() => void createTask()} className="rounded bg-[var(--app-link)] px-4 py-2 text-white">Create task</button></div>
            </div>
            <div className="grid gap-2 md:grid-cols-4">
              {groupedTasks.map((group) => (
                <div key={group.status} className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-3">
                  <div className={`text-sm font-medium ${statusColor(group.status)}`}>{group.status}</div>
                  <div className="mt-1 text-xs text-[var(--app-hint)]">{group.tasks.length} task{group.tasks.length === 1 ? '' : 's'}</div>
                </div>
              ))}
            </div>
            {groupedTasks.map((group) => (
              <div key={`group-${group.status}`} className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className={`text-sm font-semibold ${statusColor(group.status)}`}>{group.status}</div>
                  <div className="text-xs text-[var(--app-hint)]">{group.tasks.length} item{group.tasks.length === 1 ? '' : 's'}</div>
                </div>
                {group.tasks.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-[var(--app-border)] bg-[var(--app-bg)] px-4 py-3 text-sm text-[var(--app-hint)]">
                    No {group.status.replace('_', ' ')} tasks.
                  </div>
                ) : null}
                <div className="grid gap-3 md:grid-cols-2">
              {group.tasks.map((task) => {
                const assigneeRoleKey = taskAssignees[task.id] ?? task.assigneeRoleKey ?? ''
                const handoffTarget = taskHandoffTargets[task.id] ?? ''
                const note = taskNotes[task.id] ?? ''
                const assignedRole = task.assigneeRoleKey
                  ? props.room.state.roles.find((role) => role.key === task.assigneeRoleKey)
                  : undefined
                const assignedSessionName = activeSessions.find((session) => session.id === task.assigneeSessionId)?.metadata?.name
                  || activeSessions.find((session) => session.id === task.assigneeSessionId)?.metadata?.summary?.text
                  || task.assigneeSessionId
                  || null

                return (
                  <div key={task.id} className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{task.title}</div>
                        {task.description ? <div className="mt-1 text-sm text-[var(--app-hint)]">{task.description}</div> : null}
                      </div>
                      <div className={`rounded-full px-2.5 py-1 text-xs ${statusColor(task.status)} bg-[var(--app-subtle-bg)]`}>
                        {task.status}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--app-hint)]">
                      <span className="rounded-full bg-[var(--app-subtle-bg)] px-2.5 py-1">
                        current owner: {task.assigneeRoleKey ? `@${task.assigneeRoleKey}` : 'unassigned'}
                      </span>
                      {assignedRole ? (
                        <span className="rounded-full bg-[var(--app-subtle-bg)] px-2.5 py-1">
                          role: {assignedRole.label}
                        </span>
                      ) : null}
                      {assignedSessionName ? (
                        <span className="rounded-full bg-[var(--app-subtle-bg)] px-2.5 py-1">
                          session: {assignedSessionName}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-3 grid gap-2">
                      <div>
                        <div className="text-xs font-medium text-[var(--app-hint)]">Assign / current working role</div>
                        <select
                          value={assigneeRoleKey}
                          onChange={(e) => setTaskAssignees((current) => ({ ...current, [task.id]: e.target.value }))}
                          className="mt-1 w-full rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-2 py-1.5"
                        >
                          <option value="">Unassigned</option>
                          {props.room.state.roles.map((role) => <option key={role.id} value={role.key}>{role.label} (@{role.key})</option>)}
                        </select>
                      </div>

                      <div>
                        <div className="text-xs font-medium text-[var(--app-hint)]">Workflow note / summary / blocker</div>
                        <textarea
                          value={note}
                          onChange={(e) => setTaskNotes((current) => ({ ...current, [task.id]: e.target.value }))}
                          className="mt-1 min-h-20 w-full rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-2 py-1.5"
                          placeholder="Used for assignment notes, blocker reason, handoff context, or completion summary"
                        />
                      </div>

                      <div>
                        <div className="text-xs font-medium text-[var(--app-hint)]">Handoff target</div>
                        <select
                          value={handoffTarget}
                          onChange={(e) => setTaskHandoffTargets((current) => ({ ...current, [task.id]: e.target.value }))}
                          className="mt-1 w-full rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-2 py-1.5"
                        >
                          <option value="">Choose next role</option>
                          {props.room.state.roles
                            .filter((role) => role.key !== (assigneeRoleKey || task.assigneeRoleKey))
                            .map((role) => <option key={role.id} value={role.key}>{role.label} (@{role.key})</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void actions.assignTask({
                          taskId: task.id,
                          assigneeRoleKey: assigneeRoleKey || null,
                          note: note.trim() || undefined,
                          actorRoleKey: coordinatorRoleKey,
                        }).then(() => {
                          resetTaskComposer(task.id)
                        })}
                        disabled={actions.isUpdatingTaskWorkflow}
                        className="rounded bg-[var(--app-link)] px-3 py-1.5 text-xs text-white disabled:opacity-60"
                      >
                        Assign
                      </button>
                      <button
                        type="button"
                        onClick={() => void actions.claimTask({
                          taskId: task.id,
                          roleKey: assigneeRoleKey || task.assigneeRoleKey || undefined,
                          note: note.trim() || undefined,
                        }).then(() => {
                          resetTaskComposer(task.id)
                        })}
                        disabled={actions.isUpdatingTaskWorkflow || !(assigneeRoleKey || task.assigneeRoleKey)}
                        className="rounded border border-[var(--app-border)] px-3 py-1.5 text-xs disabled:opacity-60"
                      >
                        Claim / start
                      </button>
                      <button
                        type="button"
                        onClick={() => void actions.blockTask({
                          taskId: task.id,
                          roleKey: assigneeRoleKey || task.assigneeRoleKey || undefined,
                          reason: note.trim(),
                        }).then(() => {
                          resetTaskComposer(task.id)
                        })}
                        disabled={actions.isUpdatingTaskWorkflow || !note.trim()}
                        className="rounded border border-amber-300 px-3 py-1.5 text-xs text-amber-700 disabled:opacity-60"
                      >
                        Blocked
                      </button>
                      <button
                        type="button"
                        onClick={() => void actions.handoffTask({
                          taskId: task.id,
                          fromRoleKey: assigneeRoleKey || task.assigneeRoleKey || undefined,
                          toRoleKey: handoffTarget,
                          note: note.trim() || undefined,
                        }).then(() => {
                          setTaskHandoffTargets((current) => ({ ...current, [task.id]: '' }))
                          resetTaskComposer(task.id)
                        })}
                        disabled={actions.isUpdatingTaskWorkflow || !handoffTarget}
                        className="rounded border border-[var(--app-border)] px-3 py-1.5 text-xs disabled:opacity-60"
                      >
                        Handoff
                      </button>
                      <button
                        type="button"
                        onClick={() => void actions.completeTask({
                          taskId: task.id,
                          roleKey: assigneeRoleKey || task.assigneeRoleKey || undefined,
                          summary: note.trim() || undefined,
                        }).then(() => {
                          resetTaskComposer(task.id)
                        })}
                        disabled={actions.isUpdatingTaskWorkflow}
                        className="rounded border border-emerald-300 px-3 py-1.5 text-xs text-emerald-700 disabled:opacity-60"
                      >
                        Complete
                      </button>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {(['pending', 'in_progress', 'blocked', 'completed'] as const).map((status) => (
                        <button key={status} type="button" onClick={() => void actions.updateTask({ taskId: task.id, status })} className="rounded border border-[var(--app-border)] px-2 py-1 text-[11px]">{status}</button>
                      ))}
                    </div>
                  </div>
                )
              })}
                </div>
              </div>
            ))}
            {props.room.state.tasks.length === 0 ? <div className="text-sm text-[var(--app-hint)]">No tasks yet.</div> : null}
            </div>
          </div>
      ) : null}

      {tab === 'roles' ? (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid gap-3">
            <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">Invite agent into this room</div>
                  <div className="mt-1 text-xs text-[var(--app-hint)]">
                    After a room is created, you can add a new role and immediately bind an existing session or spawn a fresh agent into it.
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => openInviteComposer(inviteDraft.presetKey)}
                    className="rounded border border-[var(--app-border)] px-3 py-1.5 text-xs"
                  >
                    {showInviteComposer ? 'Reset form' : 'Open invite form'}
                  </button>
                  {showInviteComposer ? (
                    <button
                      type="button"
                      onClick={closeInviteComposer}
                      className="rounded border border-[var(--app-border)] px-3 py-1.5 text-xs"
                    >
                      Hide
                    </button>
                  ) : null}
                </div>
              </div>

              {showInviteComposer ? (
                <div className="mt-4 rounded-xl border border-[var(--app-border)] bg-[var(--app-subtle-bg)] p-4">
                  <div className="grid gap-3">
                    <div>
                      <div className="text-xs font-medium text-[var(--app-hint)]">Preset</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(Object.keys(INVITE_AGENT_ROLE_PRESETS) as InvitePresetKey[]).map((presetKey) => (
                          <button
                            key={presetKey}
                            type="button"
                            onClick={() => setInviteDraft((current) => ({
                              ...createInviteDraft(presetKey, props.room.state.roles),
                              mode: current.mode,
                            }))}
                            className={`rounded-full px-3 py-1.5 text-xs ${inviteDraft.presetKey === presetKey ? 'bg-[var(--app-link)] text-white' : 'bg-[var(--app-bg)] text-[var(--app-fg)]'}`}
                          >
                            {INVITE_AGENT_ROLE_PRESETS[presetKey].label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <div className="text-xs font-medium text-[var(--app-hint)]">Role label</div>
                        <input
                          value={inviteDraft.label}
                          onChange={(e) => setInviteDraft((current) => ({ ...current, label: e.target.value }))}
                          className="mt-1 w-full rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2"
                          placeholder="e.g. Backend Coder"
                        />
                      </div>
                      <div>
                        <div className="text-xs font-medium text-[var(--app-hint)]">Mention key</div>
                        <input
                          value={inviteDraft.key}
                          onChange={(e) => setInviteDraft((current) => ({ ...current, key: e.target.value }))}
                          className="mt-1 w-full rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2"
                          placeholder="backend_coder"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-medium text-[var(--app-hint)]">Role description</div>
                      <textarea
                        value={inviteDraft.description}
                        onChange={(e) => setInviteDraft((current) => ({ ...current, description: e.target.value }))}
                        className="mt-1 min-h-24 w-full rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2"
                        placeholder="What this agent is supposed to do in the room"
                      />
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <div className="text-xs font-medium text-[var(--app-hint)]">Join mode</div>
                        <select
                          value={inviteDraft.mode}
                          onChange={(e) => setInviteDraft((current) => ({ ...current, mode: e.target.value as InviteMode }))}
                          className="mt-1 w-full rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2"
                        >
                          <option value="spawn_new">Spawn new agent</option>
                          <option value="existing_session">Use existing session</option>
                          <option value="unassigned">Create empty role seat</option>
                        </select>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-[var(--app-hint)]">Preferred flavor</div>
                        <select
                          value={inviteDraft.agent}
                          onChange={(e) => setInviteDraft((current) => ({
                            ...current,
                            agent: e.target.value as AgentFlavor,
                            preferredFlavor: e.target.value as AgentFlavor,
                          }))}
                          className="mt-1 w-full rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2"
                        >
                          <option value="claude">Claude</option>
                          <option value="codex">Codex</option>
                          <option value="cursor">Cursor</option>
                          <option value="gemini">Gemini</option>
                          <option value="opencode">OpenCode</option>
                        </select>
                      </div>
                    </div>

                    {inviteDraft.mode === 'existing_session' ? (
                      <div>
                        <div className="text-xs font-medium text-[var(--app-hint)]">Existing session</div>
                        <select
                          value={inviteDraft.existingSessionId}
                          onChange={(e) => setInviteDraft((current) => ({ ...current, existingSessionId: e.target.value }))}
                          className="mt-1 w-full rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2"
                        >
                          <option value="">Select session</option>
                          {activeSessions.map((session) => (
                            <option key={session.id} value={session.id}>
                              {session.metadata?.name || session.metadata?.summary?.text || session.id}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}

                    {inviteDraft.mode === 'spawn_new' ? (
                      <div className="grid gap-3 md:grid-cols-2">
                        <div>
                          <div className="text-xs font-medium text-[var(--app-hint)]">Machine</div>
                          <select
                            value={inviteDraft.machineId}
                            onChange={(e) => setInviteDraft((current) => ({ ...current, machineId: e.target.value }))}
                            className="mt-1 w-full rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2"
                          >
                            <option value="">Select machine</option>
                            {props.machines.map((machine) => (
                              <option key={machine.id} value={machine.id}>
                                {machine.metadata?.displayName || machine.metadata?.host || machine.id}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-[var(--app-hint)]">Directory</div>
                          <input
                            value={inviteDraft.directory}
                            onChange={(e) => setInviteDraft((current) => ({ ...current, directory: e.target.value }))}
                            className="mt-1 w-full rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2"
                            placeholder="/path/to/project"
                          />
                        </div>
                      </div>
                    ) : null}

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-xs text-[var(--app-hint)]">
                        The role key will be auto-normalized to a unique @mention when the invite is submitted.
                      </div>
                      <button
                        type="button"
                        onClick={() => void inviteAgent()}
                        disabled={actions.isAddingRole || actions.isAssigningRole || actions.isSpawningRole}
                        className="rounded bg-[var(--app-link)] px-4 py-2 text-sm text-white disabled:opacity-60"
                      >
                        {inviteDraft.mode === 'spawn_new' ? 'Invite & spawn' : inviteDraft.mode === 'existing_session' ? 'Invite & bind' : 'Create role seat'}
                      </button>
                    </div>

                    {inviteStatus ? (
                      <div className="text-xs text-[var(--app-hint)]">{inviteStatus}</div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">Role templates</div>
                  <div className="mt-1 text-xs text-[var(--app-hint)]">
                    Apply built-in templates into this room, or save the current room role layout as a reusable room-level template.
                  </div>
                </div>
                <div className="text-xs text-[var(--app-hint)]">
                  Saved in this room: {savedTemplates.length}
                </div>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                {BUILTIN_ROLE_TEMPLATE_LIST.map((template) => (
                  <div key={template.key} className="rounded-lg border border-[var(--app-border)] bg-[var(--app-subtle-bg)] p-3">
                    <div className="font-medium">{template.label}</div>
                    {template.description ? <div className="mt-1 text-xs text-[var(--app-hint)]">{template.description}</div> : null}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {template.roles.map((role) => (
                        <span key={`${template.key}-${role.key}`} className="rounded-full bg-[var(--app-bg)] px-2 py-0.5 text-[11px] text-[var(--app-hint)]">
                          @{role.key}
                        </span>
                      ))}
                    </div>
                    <div className="mt-3 flex justify-end">
                      <button type="button" onClick={() => void applyRoleTemplate(template)} className="rounded bg-[var(--app-link)] px-3 py-1.5 text-xs text-white">
                        Apply preset
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-lg border border-[var(--app-border)] bg-[var(--app-subtle-bg)] p-3">
                <div className="text-sm font-medium">Save current room roles as template</div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <input
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="Template name"
                    className="rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2"
                  />
                  <input
                    value={templateDescription}
                    onChange={(e) => setTemplateDescription(e.target.value)}
                    placeholder="Short description (optional)"
                    className="rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2"
                  />
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-[var(--app-hint)]">Saves a snapshot of the current room role definitions into room metadata.</div>
                  <button type="button" onClick={() => void saveCurrentRolesAsTemplate()} className="rounded bg-[var(--app-link)] px-3 py-1.5 text-sm text-white">
                    Save template
                  </button>
                </div>
              </div>

              {savedTemplates.length > 0 ? (
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {savedTemplates.map((template) => (
                    <div key={template.key} className="rounded-lg border border-[var(--app-border)] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium">{template.label}</div>
                          {template.description ? <div className="mt-1 text-xs text-[var(--app-hint)]">{template.description}</div> : null}
                        </div>
                        <button type="button" onClick={() => void deleteSavedTemplate(template.key)} className="rounded border border-[var(--app-border)] px-2 py-1 text-xs">
                          Delete
                        </button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {template.roles.map((role) => (
                          <span key={`${template.key}-${role.key}`} className="rounded-full bg-[var(--app-subtle-bg)] px-2 py-0.5 text-[11px] text-[var(--app-hint)]">
                            @{role.key}
                          </span>
                        ))}
                      </div>
                      <div className="mt-3 flex justify-end">
                        <button type="button" onClick={() => void applyRoleTemplate(template)} className="rounded bg-[var(--app-link)] px-3 py-1.5 text-xs text-white">
                          Apply to room
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {templateStatus ? (
                <div className="mt-3 text-xs text-[var(--app-hint)]">{templateStatus}</div>
              ) : null}
            </div>

            {props.room.state.roles.map((role) => {
              const sessionName = activeSessions.find((session) => session.id === role.assignedSessionId)?.metadata?.name
                || activeSessions.find((session) => session.id === role.assignedSessionId)?.metadata?.summary?.text
                || role.assignedSessionId
                || 'Unassigned'
              const online = isRoleOnline(role, props.sessions)
              const spawnDraft = spawnState[role.id] ?? { agent: role.preferredFlavor }
              const assignedSession = role.assignedSessionId
                ? props.sessions.find((session) => session.id === role.assignedSessionId)
                : undefined
              return (
                <div key={role.id} className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-medium">{role.label}</div>
                        <OnlineBadge online={online} />
                      </div>
                      <div className="mt-1 text-sm text-[var(--app-hint)]">{role.description || 'No role description'}</div>
                      <div className="mt-2 text-xs text-[var(--app-hint)]">Mention as @{role.key}</div>
                      <div className="mt-1 text-xs text-[var(--app-hint)]">Current session: {sessionName}</div>
                      {assignedSession ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {props.onOpenSession ? (
                            <button
                              type="button"
                              onClick={() => props.onOpenSession?.(assignedSession.id)}
                              className="rounded border border-[var(--app-border)] px-2.5 py-1 text-xs"
                            >
                              Open chat
                            </button>
                          ) : null}
                          {props.onOpenSessionFiles ? (
                            <button
                              type="button"
                              onClick={() => props.onOpenSessionFiles?.(assignedSession.id)}
                              className="rounded border border-[var(--app-border)] px-2.5 py-1 text-xs"
                            >
                              Files
                            </button>
                          ) : null}
                          {props.onOpenSessionTerminal ? (
                            <button
                              type="button"
                              onClick={() => props.onOpenSessionTerminal?.(assignedSession.id)}
                              className="rounded border border-[var(--app-border)] px-2.5 py-1 text-xs"
                            >
                              Terminal
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {role.assignedSessionId ? (
                        <button
                          type="button"
                          onClick={() => void actions.offlineRoleSession(role.assignedSessionId!)}
                          disabled={actions.isOffliningRoleSession}
                          className="rounded border border-amber-300 px-2 py-1 text-xs text-amber-700 disabled:opacity-60"
                        >
                          Offline
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void actions.clearRoleAssignment(role.id)}
                        disabled={actions.isAssigningRole}
                        className="rounded border border-[var(--app-border)] px-2 py-1 text-xs disabled:opacity-60"
                      >
                        Kick
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <div className="rounded-md bg-[var(--app-subtle-bg)] p-3">
                      <div className="text-xs font-medium text-[var(--app-hint)]">Bind existing session</div>
                      <select value={assignments[role.id] ?? ''} onChange={(e) => setAssignments((current) => ({ ...current, [role.id]: e.target.value }))} className="mt-2 w-full rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-2 py-1.5">
                        <option value="">Select session</option>
                        {activeSessions.map((session) => (
                          <option key={session.id} value={session.id}>{session.metadata?.name || session.metadata?.summary?.text || session.id}</option>
                        ))}
                      </select>
                      <div className="mt-2 flex justify-end">
                        <button type="button" onClick={() => assignments[role.id] ? void actions.assignRole({ roleId: role.id, sessionId: assignments[role.id]! }) : undefined} className="rounded bg-[var(--app-link)] px-3 py-1.5 text-sm text-white">Assign</button>
                      </div>
                    </div>

                    <div className="rounded-md bg-[var(--app-subtle-bg)] p-3">
                      <div className="text-xs font-medium text-[var(--app-hint)]">Spawn new session</div>
                      <select value={spawnDraft.machineId ?? ''} onChange={(e) => setSpawnState((current) => ({ ...current, [role.id]: { ...spawnDraft, machineId: e.target.value || undefined } }))} className="mt-2 w-full rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-2 py-1.5">
                        <option value="">Select machine</option>
                        {props.machines.map((machine) => <option key={machine.id} value={machine.id}>{machine.metadata?.displayName || machine.metadata?.host || machine.id}</option>)}
                      </select>
                      <select value={spawnDraft.agent ?? role.preferredFlavor ?? 'claude'} onChange={(e) => setSpawnState((current) => ({ ...current, [role.id]: { ...spawnDraft, agent: e.target.value as typeof spawnDraft.agent } }))} className="mt-2 w-full rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-2 py-1.5">
                        <option value="claude">Claude</option>
                        <option value="codex">Codex</option>
                        <option value="cursor">Cursor</option>
                        <option value="gemini">Gemini</option>
                        <option value="opencode">OpenCode</option>
                      </select>
                      <input value={spawnDraft.directory ?? ''} onChange={(e) => setSpawnState((current) => ({ ...current, [role.id]: { ...spawnDraft, directory: e.target.value } }))} placeholder="/path/to/project" className="mt-2 w-full rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-2 py-1.5" />
                      <div className="mt-2 flex justify-end">
                        <button type="button" onClick={() => spawnDraft.machineId && spawnDraft.directory ? void actions.spawnRole({ roleId: role.id, machineId: spawnDraft.machineId, directory: spawnDraft.directory, agent: spawnDraft.agent }) : undefined} className="rounded bg-[var(--app-link)] px-3 py-1.5 text-sm text-white">Spawn & bind</button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
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
