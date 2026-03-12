import type { Machine, Room, RoomRoleTemplate, SessionSummary } from '@/types/api'
import type { useRoomActions } from '@/hooks/mutations/useRoomActions'
import { BUILTIN_ROLE_TEMPLATE_LIST, type RoleTemplateDraft } from '@/components/rooms/roleTemplates'
import { OnlineBadge } from '@/components/rooms/OnlineBadge'

type RoomActions = ReturnType<typeof useRoomActions>
type AgentFlavor = 'claude' | 'codex' | 'cursor' | 'gemini' | 'opencode'
type InviteMode = 'unassigned' | 'existing_session' | 'spawn_new'
type InvitePresetKey = 'planner' | 'coder' | 'reviewer' | 'researcher' | 'custom'

type InviteDraft = {
    presetKey: InvitePresetKey
    mode: InviteMode
    label: string
    key: string
    description: string
    preferredFlavor: AgentFlavor | undefined
    agent: AgentFlavor
    existingSessionId: string
    machineId: string
    directory: string
}

export function RoomRolesPanel(props: {
    room: Room
    sessions: SessionSummary[]
    activeSessions: SessionSummary[]
    machines: Machine[]
    assignments: Record<string, string>
    spawnState: Record<string, { machineId?: string; directory?: string; agent?: AgentFlavor }>
    showInviteComposer: boolean
    inviteStatus: string | null
    inviteDraft: InviteDraft
    savedTemplates: Array<RoomRoleTemplate | RoleTemplateDraft>
    templateName: string
    templateDescription: string
    templateStatus: string | null
    actions: RoomActions
    onOpenInviteComposer: (presetKey?: InvitePresetKey) => void
    onSelectInvitePreset: (presetKey: InvitePresetKey) => void
    onCloseInviteComposer: () => void
    onInviteDraftChange: (updater: (current: InviteDraft) => InviteDraft) => void
    onInviteAgent: () => void
    onApplyRoleTemplate: (template: RoomRoleTemplate | RoleTemplateDraft) => void
    onTemplateNameChange: (value: string) => void
    onTemplateDescriptionChange: (value: string) => void
    onSaveCurrentRolesAsTemplate: () => void
    onDeleteSavedTemplate: (templateKey: string) => void
    onAssignmentChange: (roleId: string, value: string) => void
    onSpawnStateChange: (roleId: string, patch: { machineId?: string; directory?: string; agent?: AgentFlavor }) => void
    onOpenSession?: (sessionId: string) => void
    onOpenSessionFiles?: (sessionId: string) => void
    onOpenSessionTerminal?: (sessionId: string) => void
}) {
    return (
        <div className="flex-1 overflow-y-auto p-4">
            <div className="grid gap-3">
                <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <div className="text-sm font-medium">Invite agent into this room</div>
                            <div className="mt-1 text-xs text-[var(--app-hint)]">After a room is created, you can add a new role and immediately bind an existing session or spawn a fresh agent into it.</div>
                        </div>
                        <div className="flex gap-2">
                            <button type="button" onClick={() => props.onOpenInviteComposer(props.inviteDraft.presetKey)} className="rounded border border-[var(--app-border)] px-3 py-1.5 text-xs">{props.showInviteComposer ? 'Reset form' : 'Open invite form'}</button>
                            {props.showInviteComposer ? <button type="button" onClick={props.onCloseInviteComposer} className="rounded border border-[var(--app-border)] px-3 py-1.5 text-xs">Hide</button> : null}
                        </div>
                    </div>

                    {props.showInviteComposer ? (
                        <div className="mt-4 rounded-xl border border-[var(--app-border)] bg-[var(--app-subtle-bg)] p-4">
                            <div className="grid gap-3">
                                <div>
                                    <div className="text-xs font-medium text-[var(--app-hint)]">Preset</div>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {(['planner', 'coder', 'reviewer', 'researcher', 'custom'] as InvitePresetKey[]).map((presetKey) => (
                                            <button key={presetKey} type="button" onClick={() => props.onSelectInvitePreset(presetKey)} className={`rounded-full px-3 py-1.5 text-xs ${props.inviteDraft.presetKey === presetKey ? 'bg-[var(--app-link)] text-white' : 'bg-[var(--app-bg)] text-[var(--app-fg)]'}`}>{presetKey}</button>
                                        ))}
                                    </div>
                                </div>

                                <div className="grid gap-3 md:grid-cols-2">
                                    <div>
                                        <div className="text-xs font-medium text-[var(--app-hint)]">Role label</div>
                                        <input value={props.inviteDraft.label} onChange={(e) => props.onInviteDraftChange((current) => ({ ...current, label: e.target.value }))} className="mt-1 w-full rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2" placeholder="e.g. Backend Coder" />
                                    </div>
                                    <div>
                                        <div className="text-xs font-medium text-[var(--app-hint)]">Mention key</div>
                                        <input value={props.inviteDraft.key} onChange={(e) => props.onInviteDraftChange((current) => ({ ...current, key: e.target.value }))} className="mt-1 w-full rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2" placeholder="backend_coder" />
                                    </div>
                                </div>

                                <div>
                                    <div className="text-xs font-medium text-[var(--app-hint)]">Role description</div>
                                    <textarea value={props.inviteDraft.description} onChange={(e) => props.onInviteDraftChange((current) => ({ ...current, description: e.target.value }))} className="mt-1 min-h-24 w-full rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2" placeholder="What this agent is supposed to do in the room" />
                                </div>

                                <div className="grid gap-3 md:grid-cols-2">
                                    <div>
                                        <div className="text-xs font-medium text-[var(--app-hint)]">Join mode</div>
                                        <select value={props.inviteDraft.mode} onChange={(e) => props.onInviteDraftChange((current) => ({ ...current, mode: e.target.value as InviteMode }))} className="mt-1 w-full rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2">
                                            <option value="spawn_new">Spawn new agent</option>
                                            <option value="existing_session">Use existing session</option>
                                            <option value="unassigned">Create empty role seat</option>
                                        </select>
                                    </div>
                                    <div>
                                        <div className="text-xs font-medium text-[var(--app-hint)]">Preferred flavor</div>
                                        <select value={props.inviteDraft.agent} onChange={(e) => props.onInviteDraftChange((current) => ({ ...current, agent: e.target.value as AgentFlavor, preferredFlavor: e.target.value as AgentFlavor }))} className="mt-1 w-full rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2">
                                            <option value="claude">Claude</option>
                                            <option value="codex">Codex</option>
                                            <option value="cursor">Cursor</option>
                                            <option value="gemini">Gemini</option>
                                            <option value="opencode">OpenCode</option>
                                        </select>
                                    </div>
                                </div>

                                {props.inviteDraft.mode === 'existing_session' ? (
                                    <div>
                                        <div className="text-xs font-medium text-[var(--app-hint)]">Existing session</div>
                                        <select value={props.inviteDraft.existingSessionId} onChange={(e) => props.onInviteDraftChange((current) => ({ ...current, existingSessionId: e.target.value }))} className="mt-1 w-full rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2">
                                            <option value="">Select session</option>
                                            {props.activeSessions.map((session) => <option key={session.id} value={session.id}>{session.metadata?.name || session.metadata?.summary?.text || session.id}</option>)}
                                        </select>
                                    </div>
                                ) : null}

                                {props.inviteDraft.mode === 'spawn_new' ? (
                                    <div className="grid gap-3 md:grid-cols-2">
                                        <div>
                                            <div className="text-xs font-medium text-[var(--app-hint)]">Machine</div>
                                            <select value={props.inviteDraft.machineId} onChange={(e) => props.onInviteDraftChange((current) => ({ ...current, machineId: e.target.value }))} className="mt-1 w-full rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2">
                                                <option value="">Select machine</option>
                                                {props.machines.map((machine) => <option key={machine.id} value={machine.id}>{machine.metadata?.displayName || machine.metadata?.host || machine.id}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <div className="text-xs font-medium text-[var(--app-hint)]">Directory</div>
                                            <input value={props.inviteDraft.directory} onChange={(e) => props.onInviteDraftChange((current) => ({ ...current, directory: e.target.value }))} className="mt-1 w-full rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2" placeholder="/path/to/project" />
                                        </div>
                                    </div>
                                ) : null}

                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="text-xs text-[var(--app-hint)]">The role key will be auto-normalized to a unique @mention when the invite is submitted.</div>
                                    <button type="button" onClick={props.onInviteAgent} disabled={props.actions.isAddingRole || props.actions.isAssigningRole || props.actions.isSpawningRole} className="rounded bg-[var(--app-link)] px-4 py-2 text-sm text-white disabled:opacity-60">{props.inviteDraft.mode === 'spawn_new' ? 'Invite & spawn' : props.inviteDraft.mode === 'existing_session' ? 'Invite & bind' : 'Create role seat'}</button>
                                </div>
                                {props.inviteStatus ? <div className="text-xs text-[var(--app-hint)]">{props.inviteStatus}</div> : null}
                            </div>
                        </div>
                    ) : null}
                </div>

                <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <div className="text-sm font-medium">Role templates</div>
                            <div className="mt-1 text-xs text-[var(--app-hint)]">Apply built-in templates into this room, or save the current room role layout as a reusable room-level template.</div>
                        </div>
                        <div className="text-xs text-[var(--app-hint)]">Saved in this room: {props.savedTemplates.length}</div>
                    </div>

                    <div className="mt-4 grid gap-3 lg:grid-cols-3">
                        {BUILTIN_ROLE_TEMPLATE_LIST.map((template) => (
                            <div key={template.key} className="rounded-lg border border-[var(--app-border)] bg-[var(--app-subtle-bg)] p-3">
                                <div className="font-medium">{template.label}</div>
                                {template.description ? <div className="mt-1 text-xs text-[var(--app-hint)]">{template.description}</div> : null}
                                <div className="mt-2 flex flex-wrap gap-1.5">{template.roles.map((role) => <span key={`${template.key}-${role.key}`} className="rounded-full bg-[var(--app-bg)] px-2 py-0.5 text-[11px] text-[var(--app-hint)]">@{role.key}</span>)}</div>
                                <div className="mt-3 flex justify-end"><button type="button" onClick={() => props.onApplyRoleTemplate(template)} className="rounded bg-[var(--app-link)] px-3 py-1.5 text-xs text-white">Apply preset</button></div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-4 rounded-lg border border-[var(--app-border)] bg-[var(--app-subtle-bg)] p-3">
                        <div className="text-sm font-medium">Save current room roles as template</div>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                            <input value={props.templateName} onChange={(e) => props.onTemplateNameChange(e.target.value)} placeholder="Template name" className="rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2" />
                            <input value={props.templateDescription} onChange={(e) => props.onTemplateDescriptionChange(e.target.value)} placeholder="Short description (optional)" className="rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2" />
                        </div>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                            <div className="text-xs text-[var(--app-hint)]">Saves a snapshot of the current room role definitions into room metadata.</div>
                            <button type="button" onClick={props.onSaveCurrentRolesAsTemplate} className="rounded bg-[var(--app-link)] px-3 py-1.5 text-sm text-white">Save template</button>
                        </div>
                    </div>

                    {props.savedTemplates.length > 0 ? (
                        <div className="mt-4 grid gap-3 lg:grid-cols-2">
                            {props.savedTemplates.map((template) => (
                                <div key={template.key} className="rounded-lg border border-[var(--app-border)] p-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <div className="font-medium">{template.label}</div>
                                            {template.description ? <div className="mt-1 text-xs text-[var(--app-hint)]">{template.description}</div> : null}
                                        </div>
                                        <button type="button" onClick={() => props.onDeleteSavedTemplate(template.key)} className="rounded border border-[var(--app-border)] px-2 py-1 text-xs">Delete</button>
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-1.5">{template.roles.map((role) => <span key={`${template.key}-${role.key}`} className="rounded-full bg-[var(--app-subtle-bg)] px-2 py-0.5 text-[11px] text-[var(--app-hint)]">@{role.key}</span>)}</div>
                                    <div className="mt-3 flex justify-end"><button type="button" onClick={() => props.onApplyRoleTemplate(template)} className="rounded bg-[var(--app-link)] px-3 py-1.5 text-xs text-white">Apply to room</button></div>
                                </div>
                            ))}
                        </div>
                    ) : null}

                    {props.templateStatus ? <div className="mt-3 text-xs text-[var(--app-hint)]">{props.templateStatus}</div> : null}
                </div>

                {props.room.state.roles.map((role) => {
                    const sessionName = props.activeSessions.find((session) => session.id === role.assignedSessionId)?.metadata?.name
                        || props.activeSessions.find((session) => session.id === role.assignedSessionId)?.metadata?.summary?.text
                        || role.assignedSessionId
                        || 'Unassigned'
                    const online = props.sessions.some((session) => session.id === role.assignedSessionId && session.active)
                    const spawnDraft = props.spawnState[role.id] ?? { agent: role.preferredFlavor as AgentFlavor | undefined }
                    const assignedSession = role.assignedSessionId ? props.sessions.find((session) => session.id === role.assignedSessionId) : undefined
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
                                            {props.onOpenSession ? <button type="button" onClick={() => props.onOpenSession?.(assignedSession.id)} className="rounded border border-[var(--app-border)] px-2.5 py-1 text-xs">Open chat</button> : null}
                                            {props.onOpenSessionFiles ? <button type="button" onClick={() => props.onOpenSessionFiles?.(assignedSession.id)} className="rounded border border-[var(--app-border)] px-2.5 py-1 text-xs">Files</button> : null}
                                            {props.onOpenSessionTerminal ? <button type="button" onClick={() => props.onOpenSessionTerminal?.(assignedSession.id)} className="rounded border border-[var(--app-border)] px-2.5 py-1 text-xs">Terminal</button> : null}
                                        </div>
                                    ) : null}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {role.assignedSessionId ? <button type="button" onClick={() => void props.actions.offlineRoleSession(role.assignedSessionId!)} disabled={props.actions.isOffliningRoleSession} className="rounded border border-amber-300 px-2 py-1 text-xs text-amber-700 disabled:opacity-60">Offline</button> : null}
                                    <button type="button" onClick={() => void props.actions.clearRoleAssignment(role.id)} disabled={props.actions.isAssigningRole} className="rounded border border-[var(--app-border)] px-2 py-1 text-xs disabled:opacity-60">Kick</button>
                                </div>
                            </div>

                            <div className="mt-3 grid gap-3 lg:grid-cols-2">
                                <div className="rounded-md bg-[var(--app-subtle-bg)] p-3">
                                    <div className="text-xs font-medium text-[var(--app-hint)]">Bind existing session</div>
                                    <select value={props.assignments[role.id] ?? ''} onChange={(e) => props.onAssignmentChange(role.id, e.target.value)} className="mt-2 w-full rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-2 py-1.5">
                                        <option value="">Select session</option>
                                        {props.activeSessions.map((session) => <option key={session.id} value={session.id}>{session.metadata?.name || session.metadata?.summary?.text || session.id}</option>)}
                                    </select>
                                    <div className="mt-2 flex justify-end"><button type="button" onClick={() => props.assignments[role.id] ? void props.actions.assignRole({ roleId: role.id, sessionId: props.assignments[role.id]! }) : undefined} className="rounded bg-[var(--app-link)] px-3 py-1.5 text-sm text-white">Assign</button></div>
                                </div>

                                <div className="rounded-md bg-[var(--app-subtle-bg)] p-3">
                                    <div className="text-xs font-medium text-[var(--app-hint)]">Spawn new session</div>
                                    <select value={spawnDraft.machineId ?? ''} onChange={(e) => props.onSpawnStateChange(role.id, { ...spawnDraft, machineId: e.target.value || undefined })} className="mt-2 w-full rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-2 py-1.5">
                                        <option value="">Select machine</option>
                                        {props.machines.map((machine) => <option key={machine.id} value={machine.id}>{machine.metadata?.displayName || machine.metadata?.host || machine.id}</option>)}
                                    </select>
                                    <select value={spawnDraft.agent ?? role.preferredFlavor ?? 'claude'} onChange={(e) => props.onSpawnStateChange(role.id, { ...spawnDraft, agent: e.target.value as AgentFlavor })} className="mt-2 w-full rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-2 py-1.5">
                                        <option value="claude">Claude</option>
                                        <option value="codex">Codex</option>
                                        <option value="cursor">Cursor</option>
                                        <option value="gemini">Gemini</option>
                                        <option value="opencode">OpenCode</option>
                                    </select>
                                    <input value={spawnDraft.directory ?? ''} onChange={(e) => props.onSpawnStateChange(role.id, { ...spawnDraft, directory: e.target.value })} placeholder="/path/to/project" className="mt-2 w-full rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-2 py-1.5" />
                                    <div className="mt-2 flex justify-end"><button type="button" onClick={() => spawnDraft.machineId && spawnDraft.directory ? void props.actions.spawnRole({ roleId: role.id, machineId: spawnDraft.machineId, directory: spawnDraft.directory, agent: spawnDraft.agent }) : undefined} className="rounded bg-[var(--app-link)] px-3 py-1.5 text-sm text-white">Spawn & bind</button></div>
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
