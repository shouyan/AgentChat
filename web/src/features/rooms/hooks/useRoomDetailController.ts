import { useMemo, useState } from 'react'
import { getRoomSavedTemplates, type RoleTemplateDraft } from '@/components/rooms/roleTemplates'
import { buildTaskDraftFromMessage, type MessageTaskDraft } from '@/components/rooms/MessageTaskDialog'
import type { ApiClient } from '@/api/client'
import type { Room, RoomMessage, RoomRoleTemplate, SessionSummary } from '@/types/api'
import { getOnlineRoleCount, getSenderLabel } from '../lib/chatHelpers'
import {
    buildUniqueRoleKey,
    createInviteDraft,
    groupTasksByStatus,
    snapshotRoleTemplate,
    type InvitePresetKey,
} from '../lib/roomDetailHelpers'
import { useRoomActions } from './useRoomActions'

export function useRoomDetailController(props: {
    api: ApiClient
    room: Room
    messages: RoomMessage[]
    sessions: SessionSummary[]
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
    const coordinatorRoleKey = props.room.metadata.coordinatorRoleKey
        ?? props.room.state.roles.find((role) => role.key === 'coordinator')?.key
        ?? props.room.state.roles[0]?.key
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

    const openInviteComposer = (presetKey: InvitePresetKey = 'coder') => {
        setTab('roles')
        setShowInviteComposer(true)
        setInviteStatus(null)
        setInviteDraft(createInviteDraft(presetKey, props.room.state.roles))
    }

    const selectInvitePreset = (presetKey: InvitePresetKey) => {
        setInviteDraft((current) => ({
            ...createInviteDraft(presetKey, props.room.state.roles),
            mode: current.mode,
        }))
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
        const nextTemplates = [...savedTemplates.filter((template) => template.key !== snapshot.key), snapshot]
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

        const uniqueKey = buildUniqueRoleKey(inviteDraft.key || label, props.room.state.roles)
        setInviteStatus(`Inviting @${uniqueKey}…`)

        try {
            const added = await actions.addRole({
                key: uniqueKey,
                label,
                description: inviteDraft.description.trim() || undefined,
                preferredFlavor: inviteDraft.preferredFlavor ?? inviteDraft.agent,
                assignmentMode: 'unassigned',
                sortOrder: props.room.state.roles.length,
            })
            const createdRole = added.room.state.roles.find((role) => role.key === uniqueKey)
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
            setInviteStatus(`Invited @${uniqueKey} into the room.`)
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

    return {
        actions,
        activeSessions,
        applyRoleTemplate,
        assignedCount,
        assignments,
        closeInviteComposer,
        completedCount,
        coordinatorRoleKey,
        createTask,
        createTaskFromMessage,
        deleteOpen,
        deleteSavedTemplate,
        groupedTasks,
        handleDeleteRoom,
        insertMention,
        inviteAgent,
        inviteDraft,
        inviteStatus,
        membersExpanded,
        message,
        messageTaskDraft,
        newTaskRoleKey,
        newTaskTitle,
        onlineCount,
        openInviteComposer,
        openMessageTaskDialog,
        resetTaskComposer,
        roomHasAssignedAgents,
        roomHasWakeableAgents,
        roomIsOffline,
        roomPowerBusy,
        savedTemplates,
        saveCurrentRolesAsTemplate,
        selectInvitePreset,
        send,
        setAssignments,
        setDeleteOpen,
        setInviteDraft,
        setMembersExpanded,
        setMessage,
        setMessageTaskDraft,
        setNewTaskRoleKey,
        setNewTaskTitle,
        setSpawnState,
        setTab,
        setTaskAssignees,
        setTaskHandoffTargets,
        setTaskNotes,
        setTemplateDescription,
        setTemplateName,
        showInviteComposer,
        spawnState,
        tab,
        taskAssignees,
        taskHandoffTargets,
        taskNotes,
        templateDescription,
        templateName,
        templateStatus,
    }
}
