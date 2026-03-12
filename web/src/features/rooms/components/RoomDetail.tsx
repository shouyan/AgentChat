import { useEffect, useRef } from 'react'
import type { ApiClient } from '@/api/client'
import type { Machine, Room, RoomMessage, SessionSummary } from '@/types/api'
import { MessageTaskDialog } from '@/components/rooms/MessageTaskDialog'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { RoomChatPanel } from './RoomChatPanel'
import { RoomDetailHeader } from './RoomDetailHeader'
import { RoomRolesPanel } from './RoomRolesPanel'
import { RoomTasksPanel } from './RoomTasksPanel'
import { useRoomDetailController } from '../hooks/useRoomDetailController'
import { statusColor } from '../lib/roomDetailHelpers'

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
    const chatEndRef = useRef<HTMLDivElement | null>(null)
    const membersScrollRef = useRef<HTMLDivElement | null>(null)
    const controller = useRoomDetailController(props)

    useEffect(() => {
        if (controller.tab !== 'chat') return
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }, [props.messages.length, controller.tab])

    const scrollMembers = (direction: 'left' | 'right') => {
        membersScrollRef.current?.scrollBy({
            left: direction === 'left' ? -240 : 240,
            behavior: 'smooth',
        })
    }

    return (
        <div className="flex h-full min-h-0 flex-col">
            <RoomDetailHeader
                roomName={props.room.metadata.name}
                goal={props.room.metadata.goal}
                roomIsOffline={controller.roomIsOffline}
                roomPowerBusy={controller.roomPowerBusy}
                roomHasWakeableAgents={controller.roomHasWakeableAgents}
                roomHasAssignedAgents={controller.roomHasAssignedAgents}
                autoDispatch={Boolean(props.room.metadata.autoDispatch)}
                onlineCount={controller.onlineCount}
                roleCount={props.room.state.roles.length}
                assignedCount={controller.assignedCount}
                completedCount={controller.completedCount}
                taskCount={props.room.state.tasks.length}
                tab={controller.tab}
                onTabChange={controller.setTab}
                onToggleRoomPower={() => void (controller.roomIsOffline
                    ? controller.actions.wakeRoom({ roles: props.room.state.roles, sessions: props.sessions })
                    : controller.actions.offlineRoom({ roles: props.room.state.roles, sessions: props.sessions })
                )}
                onToggleAutoDispatch={() => void controller.actions.updateRoom({ autoDispatch: !props.room.metadata.autoDispatch })}
                onDelete={() => controller.setDeleteOpen(true)}
                isDeleting={controller.actions.isDeletingRoom}
            />

            {controller.tab === 'chat' ? (
                <RoomChatPanel
                    room={props.room}
                    messages={props.messages}
                    sessions={props.sessions}
                    membersExpanded={controller.membersExpanded}
                    chatEndRef={chatEndRef}
                    membersScrollRef={membersScrollRef}
                    message={controller.message}
                    actions={controller.actions}
                    onToggleMembersExpanded={() => controller.setMembersExpanded((current) => !current)}
                    onScrollMembers={scrollMembers}
                    onInsertMention={controller.insertMention}
                    onMessageChange={controller.setMessage}
                    onSend={() => void controller.send()}
                    onOpenInviteComposer={() => controller.openInviteComposer('coder')}
                    onOpenMessageTaskDialog={controller.openMessageTaskDialog}
                    onOpenSession={props.onOpenSession}
                    onOpenSessionFiles={props.onOpenSessionFiles}
                    onOpenSessionTerminal={props.onOpenSessionTerminal}
                />
            ) : null}

            {controller.tab === 'tasks' ? (
                <RoomTasksPanel
                    room={props.room}
                    groupedTasks={controller.groupedTasks}
                    activeSessions={controller.activeSessions}
                    coordinatorRoleKey={controller.coordinatorRoleKey}
                    newTaskTitle={controller.newTaskTitle}
                    newTaskRoleKey={controller.newTaskRoleKey}
                    taskAssignees={controller.taskAssignees}
                    taskNotes={controller.taskNotes}
                    taskHandoffTargets={controller.taskHandoffTargets}
                    actions={controller.actions}
                    onNewTaskTitleChange={controller.setNewTaskTitle}
                    onNewTaskRoleKeyChange={controller.setNewTaskRoleKey}
                    onCreateTask={() => void controller.createTask()}
                    onTaskAssigneeChange={(taskId, value) => controller.setTaskAssignees((current) => ({ ...current, [taskId]: value }))}
                    onTaskNoteChange={(taskId, value) => controller.setTaskNotes((current) => ({ ...current, [taskId]: value }))}
                    onTaskHandoffTargetChange={(taskId, value) => controller.setTaskHandoffTargets((current) => ({ ...current, [taskId]: value }))}
                    onResetTaskComposer={controller.resetTaskComposer}
                    statusColor={statusColor}
                />
            ) : null}

            {controller.tab === 'roles' ? (
                <RoomRolesPanel
                    room={props.room}
                    sessions={props.sessions}
                    activeSessions={controller.activeSessions}
                    machines={props.machines}
                    assignments={controller.assignments}
                    spawnState={controller.spawnState}
                    showInviteComposer={controller.showInviteComposer}
                    inviteStatus={controller.inviteStatus}
                    inviteDraft={controller.inviteDraft}
                    savedTemplates={controller.savedTemplates}
                    templateName={controller.templateName}
                    templateDescription={controller.templateDescription}
                    templateStatus={controller.templateStatus}
                    actions={controller.actions}
                    onOpenInviteComposer={controller.openInviteComposer}
                    onSelectInvitePreset={controller.selectInvitePreset}
                    onCloseInviteComposer={controller.closeInviteComposer}
                    onInviteDraftChange={(updater) => controller.setInviteDraft(updater)}
                    onInviteAgent={() => void controller.inviteAgent()}
                    onApplyRoleTemplate={(template) => void controller.applyRoleTemplate(template)}
                    onTemplateNameChange={controller.setTemplateName}
                    onTemplateDescriptionChange={controller.setTemplateDescription}
                    onSaveCurrentRolesAsTemplate={() => void controller.saveCurrentRolesAsTemplate()}
                    onDeleteSavedTemplate={(templateKey) => void controller.deleteSavedTemplate(templateKey)}
                    onAssignmentChange={(roleId, value) => controller.setAssignments((current) => ({ ...current, [roleId]: value }))}
                    onSpawnStateChange={(roleId, patch) => controller.setSpawnState((current) => ({ ...current, [roleId]: patch }))}
                    onOpenSession={props.onOpenSession}
                    onOpenSessionFiles={props.onOpenSessionFiles}
                    onOpenSessionTerminal={props.onOpenSessionTerminal}
                />
            ) : null}

            <MessageTaskDialog
                draft={controller.messageTaskDraft}
                roles={props.room.state.roles}
                isPending={controller.actions.isCreatingTask}
                onChange={controller.setMessageTaskDraft}
                onClose={() => controller.setMessageTaskDraft(null)}
                onSubmit={() => void controller.createTaskFromMessage()}
            />

            <ConfirmDialog
                isOpen={controller.deleteOpen}
                onClose={() => controller.setDeleteOpen(false)}
                title="Delete Room"
                description={`Delete "${props.room.metadata.name}" and permanently remove all sessions currently assigned to this room? This cannot be undone.`}
                confirmLabel="Delete"
                confirmingLabel="Deleting…"
                onConfirm={controller.handleDeleteRoom}
                isPending={controller.actions.isDeletingRoom}
                destructive
            />
        </div>
    )
}
