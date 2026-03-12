import { useNavigate } from '@tanstack/react-router'
import {
    BUILTIN_ROLE_SLOT_TEMPLATE_LIST,
    BUILTIN_ROOM_TEMPLATE_LIST,
    getBuiltinRoleTemplateState,
    getBuiltinRoomTemplateState,
    isRoomTemplateVisibleInRoomCreator,
    type TemplateCatalog,
    type AgentFlavor,
    type RoleSlotTemplate,
    type RoomTemplateDefinition,
} from '@/components/rooms/roleTemplates'

type RoleDraft = {
    label: string
    roleKey: string
    description: string
    preferredFlavor: AgentFlavor
}

type RoomSlotDraft = {
    id: string
    enabled: boolean
    roleTemplateKey: string
    agent: AgentFlavor
    model?: string
    mentionKey?: string
}

type RoomDraft = {
    label: string
    description: string
    visibleInRoomCreator: boolean
    slots: RoomSlotDraft[]
}

function BackIcon(props: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={props.className}>
            <polyline points="15 18 9 12 15 6" />
        </svg>
    )
}

function TrashIcon(props: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={props.className}>
            <path d="M3 6h18" />
            <path d="M8 6V4h8v2" />
            <path d="M19 6l-1 14H6L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
        </svg>
    )
}

export function TemplateManagerHeader(props: { onBack: () => void }) {
    const navigate = useNavigate()
    return (
        <div className="bg-[var(--app-bg)] pt-[env(safe-area-inset-top)]">
            <div className="mx-auto flex w-full max-w-content items-center gap-2 border-b border-[var(--app-border)] p-3">
                <button type="button" onClick={props.onBack} className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]">
                    <BackIcon />
                </button>
                <div className="flex-1 font-semibold">Template Manager</div>
                <button type="button" onClick={() => navigate({ to: '/rooms/new' })} className="rounded border border-[var(--app-border)] px-3 py-1.5 text-sm">
                    New room
                </button>
            </div>
        </div>
    )
}

export function RoleTemplatesSection(props: {
    catalog: TemplateCatalog
    templatesLoading: boolean
    allRoleTemplates: RoleSlotTemplate[]
    editingRoleTemplateKey: string | null
    roleDraft: RoleDraft
    agentOptions: AgentFlavor[]
    status: string | null
    onRoleDraftChange: (updater: (current: RoleDraft) => RoleDraft) => void
    onResetRoleDraft: () => void
    onSaveRoleTemplate: () => void
    onEditRoleTemplate: (template: RoleSlotTemplate) => void
    onDeleteRoleTemplate: (key: string) => void
    onUpdateBuiltinRoleTemplate: (key: string, hidden: boolean, deleted: boolean) => void
}) {
    return (
        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] p-4">
            <div className="text-base font-semibold">Role templates</div>
            <div className="mt-1 text-sm text-[var(--app-hint)]">Built-ins can now be hidden, deleted, and restored per namespace.</div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {BUILTIN_ROLE_SLOT_TEMPLATE_LIST.map((template) => {
                    const state = getBuiltinRoleTemplateState(props.catalog, template.key)
                    return (
                        <div key={template.key} className="rounded-lg border border-[var(--app-border)] bg-[var(--app-subtle-bg)] p-3">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <div className="font-medium">{template.label}</div>
                                        {state.deleted ? <span className="rounded-full bg-[var(--app-bg)] px-2 py-0.5 text-[11px] text-[var(--app-hint)]">Deleted</span> : state.hidden ? <span className="rounded-full bg-[var(--app-bg)] px-2 py-0.5 text-[11px] text-[var(--app-hint)]">Hidden</span> : null}
                                    </div>
                                    {template.description ? <div className="mt-1 text-xs text-[var(--app-hint)]">{template.description}</div> : null}
                                    <div className="mt-2 text-[11px] text-[var(--app-hint)]">@{template.roleKey} · {template.preferredFlavor ?? 'any'}</div>
                                </div>
                                <div className="flex flex-wrap items-center justify-end gap-3">
                                    {state.deleted ? (
                                        <button type="button" onClick={() => props.onUpdateBuiltinRoleTemplate(template.key, false, false)} className="rounded border border-[var(--app-border)] px-2 py-1 text-xs">Restore</button>
                                    ) : (
                                        <>
                                            <label className="flex items-center gap-2 text-xs text-[var(--app-hint)]">
                                                <input type="checkbox" checked={!state.hidden} onChange={(e) => props.onUpdateBuiltinRoleTemplate(template.key, !e.target.checked, false)} />
                                                Show
                                            </label>
                                            <button type="button" onClick={() => props.onUpdateBuiltinRoleTemplate(template.key, false, true)} aria-label={`Delete built-in role template ${template.label}`} title="Delete" className="flex h-8 w-8 items-center justify-center rounded border border-[var(--app-border)] text-[var(--app-hint)]">
                                                <TrashIcon />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>

            <div className="mt-4 rounded-lg border border-[var(--app-border)] bg-[var(--app-subtle-bg)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm font-medium">{props.editingRoleTemplateKey ? 'Edit custom role template' : 'Add custom role template'}</div>
                    {props.editingRoleTemplateKey ? <button type="button" onClick={props.onResetRoleDraft} className="rounded border border-[var(--app-border)] px-3 py-1.5 text-sm">Cancel edit</button> : null}
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <input value={props.roleDraft.label} onChange={(e) => props.onRoleDraftChange((current) => ({ ...current, label: e.target.value }))} placeholder="Template title" className="rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2" />
                    <input value={props.roleDraft.roleKey} onChange={(e) => props.onRoleDraftChange((current) => ({ ...current, roleKey: e.target.value }))} placeholder="Mention key (optional)" className="rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2" />
                    <textarea value={props.roleDraft.description} onChange={(e) => props.onRoleDraftChange((current) => ({ ...current, description: e.target.value }))} placeholder="What this role does" className="min-h-24 rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 md:col-span-2" />
                    <select value={props.roleDraft.preferredFlavor} onChange={(e) => props.onRoleDraftChange((current) => ({ ...current, preferredFlavor: e.target.value as AgentFlavor }))} className="rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2">
                        {props.agentOptions.map((agent) => <option key={agent} value={agent}>{agent}</option>)}
                    </select>
                </div>
                <div className="mt-3 flex justify-end">
                    <button type="button" onClick={props.onSaveRoleTemplate} className="rounded bg-[var(--app-link)] px-3 py-1.5 text-sm text-white">{props.editingRoleTemplateKey ? 'Update role template' : 'Save role template'}</button>
                </div>
            </div>

            {props.catalog.customRoleTemplates.length > 0 ? (
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    {props.catalog.customRoleTemplates.map((template) => (
                        <div key={template.key} className="rounded-lg border border-[var(--app-border)] p-3">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <div className="font-medium">{template.label}</div>
                                    {template.description ? <div className="mt-1 text-xs text-[var(--app-hint)]">{template.description}</div> : null}
                                    <div className="mt-2 text-[11px] text-[var(--app-hint)]">@{template.roleKey} · {template.preferredFlavor ?? 'any'}</div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button type="button" onClick={() => props.onEditRoleTemplate(template)} className="rounded border border-[var(--app-border)] px-2 py-1 text-xs">Edit</button>
                                    <button type="button" onClick={() => props.onDeleteRoleTemplate(template.key)} aria-label={`Delete custom role template ${template.label}`} title="Delete" className="flex h-8 w-8 items-center justify-center rounded border border-[var(--app-border)] text-[var(--app-hint)]"><TrashIcon /></button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : null}

            {props.templatesLoading ? <div className="mt-4 text-sm text-[var(--app-hint)]">Loading templates…</div> : null}
            {props.status ? <div className="mt-3 text-sm text-[var(--app-hint)]">{props.status}</div> : null}
        </div>
    )
}

export function RoomTemplatesSection(props: {
    catalog: TemplateCatalog
    allRoleTemplates: RoleSlotTemplate[]
    availableRoleTemplates: RoleSlotTemplate[]
    editingRoomTemplateKey: string | null
    roomDraft: RoomDraft
    agentOptions: AgentFlavor[]
    status: string | null
    onRoomDraftChange: (updater: (current: RoomDraft) => RoomDraft) => void
    onResetRoomDraft: () => void
    onSaveRoomTemplate: () => void
    onEditRoomTemplate: (template: RoomTemplateDefinition) => void
    onDeleteRoomTemplate: (key: string) => void
    onUpdateBuiltinRoomTemplate: (key: string, hidden: boolean, deleted: boolean) => void
    onToggleCustomRoomTemplateVisibility: (template: RoomTemplateDefinition, visibleInRoomCreator: boolean) => void
    onCreateSlot: () => RoomSlotDraft
}) {
    return (
        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] p-4">
            <div className="text-base font-semibold">Room templates</div>
            <div className="mt-1 text-sm text-[var(--app-hint)]">Custom templates sync through the hub. Built-ins can be hidden, deleted, and restored per namespace.</div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {BUILTIN_ROOM_TEMPLATE_LIST.map((template) => {
                    const state = getBuiltinRoomTemplateState(props.catalog, template.key)
                    return (
                        <div key={template.key} className="rounded-lg border border-[var(--app-border)] bg-[var(--app-subtle-bg)] p-3">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <div className="font-medium">{template.label}</div>
                                        {state.deleted ? <span className="rounded-full bg-[var(--app-bg)] px-2 py-0.5 text-[11px] text-[var(--app-hint)]">Deleted</span> : state.hidden ? <span className="rounded-full bg-[var(--app-bg)] px-2 py-0.5 text-[11px] text-[var(--app-hint)]">Hidden</span> : null}
                                    </div>
                                    {template.description ? <div className="mt-1 text-xs text-[var(--app-hint)]">{template.description}</div> : null}
                                </div>
                                <div className="flex flex-wrap items-center justify-end gap-3">
                                    {state.deleted ? (
                                        <button type="button" onClick={() => props.onUpdateBuiltinRoomTemplate(template.key, false, false)} className="rounded border border-[var(--app-border)] px-2 py-1 text-xs">Restore</button>
                                    ) : (
                                        <>
                                            <label className="flex items-center gap-2 text-xs text-[var(--app-hint)]">
                                                <input type="checkbox" checked={!state.hidden} onChange={(e) => props.onUpdateBuiltinRoomTemplate(template.key, !e.target.checked, false)} />
                                                Show
                                            </label>
                                            <button type="button" onClick={() => props.onUpdateBuiltinRoomTemplate(template.key, false, true)} aria-label={`Delete built-in room template ${template.label}`} title="Delete" className="flex h-8 w-8 items-center justify-center rounded border border-[var(--app-border)] text-[var(--app-hint)]"><TrashIcon /></button>
                                        </>
                                    )}
                                </div>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                {template.slots.map((slot, index) => {
                                    const role = props.allRoleTemplates.find((item) => item.key === slot.roleTemplateKey)
                                    return <span key={`${template.key}-${index}`} className="rounded-full bg-[var(--app-bg)] px-2 py-0.5 text-[11px] text-[var(--app-hint)]">{role?.label ?? slot.roleTemplateKey}</span>
                                })}
                            </div>
                        </div>
                    )
                })}
            </div>

            <div className="mt-4 rounded-lg border border-[var(--app-border)] bg-[var(--app-subtle-bg)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm font-medium">{props.editingRoomTemplateKey ? 'Edit custom room template' : 'Add custom room template'}</div>
                    {props.editingRoomTemplateKey ? <button type="button" onClick={props.onResetRoomDraft} className="rounded border border-[var(--app-border)] px-3 py-1.5 text-sm">Cancel edit</button> : null}
                </div>
                <div className="mt-3 grid gap-3">
                    <input value={props.roomDraft.label} onChange={(e) => props.onRoomDraftChange((current) => ({ ...current, label: e.target.value }))} placeholder="Template title" className="rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2" />
                    <input value={props.roomDraft.description} onChange={(e) => props.onRoomDraftChange((current) => ({ ...current, description: e.target.value }))} placeholder="Description (optional)" className="rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2" />
                    <label className="flex items-center gap-2 rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 text-sm">
                        <input type="checkbox" checked={props.roomDraft.visibleInRoomCreator} onChange={(e) => props.onRoomDraftChange((current) => ({ ...current, visibleInRoomCreator: e.target.checked }))} />
                        Show in room creation screen
                    </label>
                    <div className="flex flex-col gap-3">
                        {props.roomDraft.slots.map((slot, index) => (
                            <div key={slot.id} className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <label className="flex items-center gap-2 text-sm">
                                        <input type="checkbox" checked={slot.enabled} onChange={(e) => props.onRoomDraftChange((current) => ({ ...current, slots: current.slots.map((item) => item.id === slot.id ? { ...item, enabled: e.target.checked } : item) }))} />
                                        Slot {index + 1}
                                    </label>
                                    {props.roomDraft.slots.length > 1 ? <button type="button" onClick={() => props.onRoomDraftChange((current) => ({ ...current, slots: current.slots.filter((item) => item.id !== slot.id) }))} className="rounded border border-[var(--app-border)] px-2 py-1 text-xs">Remove</button> : null}
                                </div>
                                <div className="mt-3 grid gap-3 md:grid-cols-2">
                                    <select value={slot.roleTemplateKey} onChange={(e) => props.onRoomDraftChange((current) => ({ ...current, slots: current.slots.map((item) => item.id === slot.id ? { ...item, roleTemplateKey: e.target.value } : item) }))} className="rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2">
                                        {props.availableRoleTemplates.map((template) => <option key={template.key} value={template.key}>{template.label}</option>)}
                                    </select>
                                    <select value={slot.agent} onChange={(e) => props.onRoomDraftChange((current) => ({ ...current, slots: current.slots.map((item) => item.id === slot.id ? { ...item, agent: e.target.value as AgentFlavor } : item) }))} className="rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2">
                                        {props.agentOptions.map((agent) => <option key={agent} value={agent}>{agent}</option>)}
                                    </select>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <button type="button" onClick={() => props.onRoomDraftChange((current) => ({ ...current, slots: current.slots.concat(props.onCreateSlot()) }))} className="rounded border border-[var(--app-border)] px-3 py-1.5 text-sm">+ Add slot</button>
                        <button type="button" onClick={props.onSaveRoomTemplate} className="rounded bg-[var(--app-link)] px-3 py-1.5 text-sm text-white">{props.editingRoomTemplateKey ? 'Update room template' : 'Save room template'}</button>
                    </div>
                </div>
            </div>

            {props.catalog.customRoomTemplates.length > 0 ? (
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    {props.catalog.customRoomTemplates.map((template) => (
                        <div key={template.key} className="rounded-lg border border-[var(--app-border)] p-3">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <div className="font-medium">{template.label}</div>
                                        <span className="rounded-full bg-[var(--app-subtle-bg)] px-2 py-0.5 text-[11px] text-[var(--app-hint)]">{isRoomTemplateVisibleInRoomCreator(template) ? 'Visible in room creator' : 'Hidden from room creator'}</span>
                                    </div>
                                    {template.description ? <div className="mt-1 text-xs text-[var(--app-hint)]">{template.description}</div> : null}
                                </div>
                                <div className="flex flex-wrap items-center justify-end gap-3">
                                    <label className="flex items-center gap-2 text-xs text-[var(--app-hint)]">
                                        <input type="checkbox" checked={isRoomTemplateVisibleInRoomCreator(template)} onChange={(e) => props.onToggleCustomRoomTemplateVisibility(template, e.target.checked)} />
                                        Show
                                    </label>
                                    <button type="button" onClick={() => props.onEditRoomTemplate(template)} className="rounded border border-[var(--app-border)] px-2 py-1 text-xs">Edit</button>
                                    <button type="button" onClick={() => props.onDeleteRoomTemplate(template.key)} aria-label={`Delete custom room template ${template.label}`} title="Delete" className="flex h-8 w-8 items-center justify-center rounded border border-[var(--app-border)] text-[var(--app-hint)]"><TrashIcon /></button>
                                </div>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                {template.slots.map((slot, index) => {
                                    const role = props.allRoleTemplates.find((item) => item.key === slot.roleTemplateKey)
                                    return <span key={`${template.key}-${index}`} className="rounded-full bg-[var(--app-subtle-bg)] px-2 py-0.5 text-[11px] text-[var(--app-hint)]">{role?.label ?? slot.roleTemplateKey}</span>
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            ) : null}

            {props.status ? <div className="mt-3 text-sm text-[var(--app-hint)]">{props.status}</div> : null}
        </div>
    )
}
