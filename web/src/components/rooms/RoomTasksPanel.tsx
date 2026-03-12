import type { Room, SessionSummary } from '@/types/api'
import type { useRoomActions } from '@/hooks/mutations/useRoomActions'

type RoomActions = ReturnType<typeof useRoomActions>

type TaskGroup = {
    status: Room['state']['tasks'][number]['status']
    tasks: Room['state']['tasks']
}

export function RoomTasksPanel(props: {
    room: Room
    groupedTasks: TaskGroup[]
    activeSessions: SessionSummary[]
    coordinatorRoleKey?: string
    newTaskTitle: string
    newTaskRoleKey: string
    taskAssignees: Record<string, string>
    taskNotes: Record<string, string>
    taskHandoffTargets: Record<string, string>
    actions: RoomActions
    onNewTaskTitleChange: (value: string) => void
    onNewTaskRoleKeyChange: (value: string) => void
    onCreateTask: () => void
    onTaskAssigneeChange: (taskId: string, value: string) => void
    onTaskNoteChange: (taskId: string, value: string) => void
    onTaskHandoffTargetChange: (taskId: string, value: string) => void
    onResetTaskComposer: (taskId: string) => void
    statusColor: (status: string) => string
}) {
    return (
        <div className="flex-1 overflow-y-auto p-4">
            <div className="flex flex-col gap-4">
                <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-3">
                    <div className="text-sm font-medium">New task</div>
                    <div className="mt-1 text-xs text-[var(--app-hint)]">Planner/coordinator should create and assign tasks here. Assignees can then claim, report blockers, hand off, and complete.</div>
                    <input value={props.newTaskTitle} onChange={(e) => props.onNewTaskTitleChange(e.target.value)} className="mt-2 w-full rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2" placeholder="Task title" />
                    <select value={props.newTaskRoleKey} onChange={(e) => props.onNewTaskRoleKeyChange(e.target.value)} className="mt-2 w-full rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-2 py-1.5">
                        <option value="">Unassigned</option>
                        {props.room.state.roles.map((role) => <option key={role.id} value={role.key}>{role.label}</option>)}
                    </select>
                    <div className="mt-2 flex justify-end"><button type="button" onClick={props.onCreateTask} className="rounded bg-[var(--app-link)] px-4 py-2 text-white">Create task</button></div>
                </div>
                <div className="grid gap-2 md:grid-cols-4">
                    {props.groupedTasks.map((group) => (
                        <div key={group.status} className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-3">
                            <div className={`text-sm font-medium ${props.statusColor(group.status)}`}>{group.status}</div>
                            <div className="mt-1 text-xs text-[var(--app-hint)]">{group.tasks.length} task{group.tasks.length === 1 ? '' : 's'}</div>
                        </div>
                    ))}
                </div>
                {props.groupedTasks.map((group) => (
                    <div key={`group-${group.status}`} className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                            <div className={`text-sm font-semibold ${props.statusColor(group.status)}`}>{group.status}</div>
                            <div className="text-xs text-[var(--app-hint)]">{group.tasks.length} item{group.tasks.length === 1 ? '' : 's'}</div>
                        </div>
                        {group.tasks.length === 0 ? <div className="rounded-lg border border-dashed border-[var(--app-border)] bg-[var(--app-bg)] px-4 py-3 text-sm text-[var(--app-hint)]">No {group.status.replace('_', ' ')} tasks.</div> : null}
                        <div className="grid gap-3 md:grid-cols-2">
                            {group.tasks.map((task) => {
                                const assigneeRoleKey = props.taskAssignees[task.id] ?? task.assigneeRoleKey ?? ''
                                const handoffTarget = props.taskHandoffTargets[task.id] ?? ''
                                const note = props.taskNotes[task.id] ?? ''
                                const assignedRole = task.assigneeRoleKey ? props.room.state.roles.find((role) => role.key === task.assigneeRoleKey) : undefined
                                const assignedSessionName = props.activeSessions.find((session) => session.id === task.assigneeSessionId)?.metadata?.name
                                    || props.activeSessions.find((session) => session.id === task.assigneeSessionId)?.metadata?.summary?.text
                                    || task.assigneeSessionId
                                    || null

                                return (
                                    <div key={task.id} className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <div className="font-medium">{task.title}</div>
                                                {task.description ? <div className="mt-1 text-sm text-[var(--app-hint)]">{task.description}</div> : null}
                                            </div>
                                            <div className={`rounded-full bg-[var(--app-subtle-bg)] px-2.5 py-1 text-xs ${props.statusColor(task.status)}`}>{task.status}</div>
                                        </div>

                                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--app-hint)]">
                                            <span className="rounded-full bg-[var(--app-subtle-bg)] px-2.5 py-1">current owner: {task.assigneeRoleKey ? `@${task.assigneeRoleKey}` : 'unassigned'}</span>
                                            {assignedRole ? <span className="rounded-full bg-[var(--app-subtle-bg)] px-2.5 py-1">role: {assignedRole.label}</span> : null}
                                            {assignedSessionName ? <span className="rounded-full bg-[var(--app-subtle-bg)] px-2.5 py-1">session: {assignedSessionName}</span> : null}
                                        </div>

                                        <div className="mt-3 grid gap-2">
                                            <div>
                                                <div className="text-xs font-medium text-[var(--app-hint)]">Assign / current working role</div>
                                                <select value={assigneeRoleKey} onChange={(e) => props.onTaskAssigneeChange(task.id, e.target.value)} className="mt-1 w-full rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-2 py-1.5">
                                                    <option value="">Unassigned</option>
                                                    {props.room.state.roles.map((role) => <option key={role.id} value={role.key}>{role.label} (@{role.key})</option>)}
                                                </select>
                                            </div>

                                            <div>
                                                <div className="text-xs font-medium text-[var(--app-hint)]">Workflow note / summary / blocker</div>
                                                <textarea value={note} onChange={(e) => props.onTaskNoteChange(task.id, e.target.value)} className="mt-1 min-h-20 w-full rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-2 py-1.5" placeholder="Used for assignment notes, blocker reason, handoff context, or completion summary" />
                                            </div>

                                            <div>
                                                <div className="text-xs font-medium text-[var(--app-hint)]">Handoff target</div>
                                                <select value={handoffTarget} onChange={(e) => props.onTaskHandoffTargetChange(task.id, e.target.value)} className="mt-1 w-full rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-2 py-1.5">
                                                    <option value="">Choose next role</option>
                                                    {props.room.state.roles.filter((role) => role.key !== (assigneeRoleKey || task.assigneeRoleKey)).map((role) => <option key={role.id} value={role.key}>{role.label} (@{role.key})</option>)}
                                                </select>
                                            </div>
                                        </div>

                                        <div className="mt-3 flex flex-wrap gap-2">
                                            <button type="button" onClick={() => void props.actions.assignTask({ taskId: task.id, assigneeRoleKey: assigneeRoleKey || null, note: note.trim() || undefined, actorRoleKey: props.coordinatorRoleKey }).then(() => props.onResetTaskComposer(task.id))} disabled={props.actions.isUpdatingTaskWorkflow} className="rounded bg-[var(--app-link)] px-3 py-1.5 text-xs text-white disabled:opacity-60">Assign</button>
                                            <button type="button" onClick={() => void props.actions.claimTask({ taskId: task.id, roleKey: assigneeRoleKey || task.assigneeRoleKey || undefined, note: note.trim() || undefined }).then(() => props.onResetTaskComposer(task.id))} disabled={props.actions.isUpdatingTaskWorkflow || !(assigneeRoleKey || task.assigneeRoleKey)} className="rounded border border-[var(--app-border)] px-3 py-1.5 text-xs disabled:opacity-60">Claim / start</button>
                                            <button type="button" onClick={() => void props.actions.blockTask({ taskId: task.id, roleKey: assigneeRoleKey || task.assigneeRoleKey || undefined, reason: note.trim() }).then(() => props.onResetTaskComposer(task.id))} disabled={props.actions.isUpdatingTaskWorkflow || !note.trim()} className="rounded border border-amber-300 px-3 py-1.5 text-xs text-amber-700 disabled:opacity-60">Blocked</button>
                                            <button type="button" onClick={() => void props.actions.handoffTask({ taskId: task.id, fromRoleKey: assigneeRoleKey || task.assigneeRoleKey || undefined, toRoleKey: handoffTarget, note: note.trim() || undefined }).then(() => { props.onTaskHandoffTargetChange(task.id, ''); props.onResetTaskComposer(task.id) })} disabled={props.actions.isUpdatingTaskWorkflow || !handoffTarget} className="rounded border border-[var(--app-border)] px-3 py-1.5 text-xs disabled:opacity-60">Handoff</button>
                                            <button type="button" onClick={() => void props.actions.completeTask({ taskId: task.id, roleKey: assigneeRoleKey || task.assigneeRoleKey || undefined, summary: note.trim() || undefined }).then(() => props.onResetTaskComposer(task.id))} disabled={props.actions.isUpdatingTaskWorkflow} className="rounded border border-emerald-300 px-3 py-1.5 text-xs text-emerald-700 disabled:opacity-60">Complete</button>
                                        </div>

                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {(['pending', 'in_progress', 'blocked', 'completed'] as const).map((status) => (
                                                <button key={status} type="button" onClick={() => void props.actions.updateTask({ taskId: task.id, status })} className="rounded border border-[var(--app-border)] px-2 py-1 text-[11px]">{status}</button>
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
    )
}
