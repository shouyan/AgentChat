import { useEffect, useMemo, useRef, useState } from 'react'
import type { ApiClient } from '@/api/client'
import type { Machine, Room, RoomMessage, RoomRole, RoomRoleTemplate, SessionSummary } from '@/types/api'
import { getRoomSavedTemplates, slugifyRoleTemplateKey, type RoleTemplateDraft } from '@/components/rooms/roleTemplates'
import { MessageTaskDialog, buildTaskDraftFromMessage, type MessageTaskDraft } from '@/components/rooms/MessageTaskDialog'
import { RoomChatPanel } from './RoomChatPanel'
import { RoomRolesPanel } from './RoomRolesPanel'
import { RoomTasksPanel } from './RoomTasksPanel'
import { getOnlineRoleCount, getSenderLabel } from '../lib/chatHelpers'
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

function groupTasksByStatus(tasks: Room['state']['tasks']) {
  const order = ['pending', 'in_progress', 'blocked', 'completed'] as const
  return order.map((status) => ({
    status,
    tasks: tasks.filter((task) => task.status === status),
  }))
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
        <RoomChatPanel
          room={props.room}
          messages={props.messages}
          sessions={props.sessions}
          membersExpanded={membersExpanded}
          chatEndRef={chatEndRef}
          membersScrollRef={membersScrollRef}
          message={message}
          actions={actions}
          onToggleMembersExpanded={() => setMembersExpanded((current) => !current)}
          onScrollMembers={scrollMembers}
          onInsertMention={insertMention}
          onMessageChange={setMessage}
          onSend={() => void send()}
          onOpenInviteComposer={() => openInviteComposer('coder')}
          onOpenMessageTaskDialog={openMessageTaskDialog}
          onOpenSession={props.onOpenSession}
          onOpenSessionFiles={props.onOpenSessionFiles}
          onOpenSessionTerminal={props.onOpenSessionTerminal}
        />
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
