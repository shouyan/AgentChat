import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAppGoBack } from '@/hooks/useAppGoBack'
import { useTemplateActions } from '@/hooks/mutations/useTemplateActions'
import { useTemplates } from '@/hooks/queries/useTemplates'
import { useAppContext } from '@/lib/app-context'
import {
  BUILTIN_ROLE_SLOT_TEMPLATE_LIST,
  BUILTIN_ROOM_TEMPLATE_LIST,
  ensureUniqueTemplateKey,
  getAllRoleSlotTemplates,
  getAvailableRoleSlotTemplates,
  getBuiltinRoleTemplateState,
  getBuiltinRoomTemplateState,
  isRoomTemplateVisibleInRoomCreator,
  slugifyRoleTemplateKey,
  type AgentFlavor,
  type RoleSlotTemplate,
  type RoomTemplateDefinition,
} from '@/components/rooms/roleTemplates'

const AGENT_OPTIONS: AgentFlavor[] = ['claude', 'codex', 'cursor', 'gemini', 'opencode']

function BackIcon(props: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <polyline points="15 18 9 12 15 6" />
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

type RoomSlotDraft = {
  id: string
  enabled: boolean
  roleTemplateKey: string
  agent: AgentFlavor
  model?: string
  mentionKey?: string
}

function createRoomSlotDraft(
  roleTemplateKey = 'planner',
  agent: AgentFlavor = 'claude',
  options?: {
    enabled?: boolean
    model?: string
    mentionKey?: string
  }
): RoomSlotDraft {
  return {
    id: Math.random().toString(36).slice(2, 8),
    enabled: options?.enabled ?? true,
    roleTemplateKey,
    agent,
    model: options?.model,
    mentionKey: options?.mentionKey,
  }
}

function createEmptyRoleDraft() {
  return {
    label: '',
    roleKey: '',
    description: '',
    preferredFlavor: 'claude' as AgentFlavor,
  }
}

function createEmptyRoomDraft() {
  return {
    label: '',
    description: '',
    visibleInRoomCreator: true,
    slots: [
      createRoomSlotDraft('planner', 'claude'),
      createRoomSlotDraft('coder', 'codex'),
    ],
  }
}

export default function TemplateManagerPage() {
  const { api } = useAppContext()
  const goBack = useAppGoBack()
  const navigate = useNavigate()

  const { catalog, isLoading: templatesLoading, error: templatesError } = useTemplates(api)
  const templateActions = useTemplateActions(api)
  const [editingRoleTemplateKey, setEditingRoleTemplateKey] = useState<string | null>(null)
  const [editingRoomTemplateKey, setEditingRoomTemplateKey] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const allRoleTemplates = useMemo(() => getAllRoleSlotTemplates(catalog), [catalog])
  const availableRoleTemplates = useMemo(() => getAvailableRoleSlotTemplates(catalog), [catalog])

  const [roleDraft, setRoleDraft] = useState(createEmptyRoleDraft)
  const [roomDraft, setRoomDraft] = useState(createEmptyRoomDraft)

  useEffect(() => {
    if (templatesError) {
      setStatus(templatesError)
    }
  }, [templatesError])

  const resetRoleDraft = () => {
    setRoleDraft(createEmptyRoleDraft())
    setEditingRoleTemplateKey(null)
  }

  const resetRoomDraft = () => {
    setRoomDraft(createEmptyRoomDraft())
    setEditingRoomTemplateKey(null)
  }

  const saveRoleTemplate = async () => {
    const label = roleDraft.label.trim()
    if (!label) {
      setStatus('Role template title is required.')
      return
    }

    const key = editingRoleTemplateKey ?? ensureUniqueTemplateKey(roleDraft.roleKey || label, [
      ...BUILTIN_ROLE_SLOT_TEMPLATE_LIST.map((template) => template.key),
      ...catalog.customRoleTemplates.map((template) => template.key),
    ])

    const nextTemplate: RoleSlotTemplate = {
      key,
      label,
      roleKey: slugifyRoleTemplateKey(roleDraft.roleKey || label),
      roleLabel: label,
      description: roleDraft.description.trim() || undefined,
      preferredFlavor: roleDraft.preferredFlavor,
    }

    await templateActions.saveRoleTemplate(nextTemplate)
    resetRoleDraft()
    setStatus(`${editingRoleTemplateKey ? 'Updated' : 'Saved'} role template "${label}".`)
  }

  const editRoleTemplate = (template: RoleSlotTemplate) => {
    setEditingRoleTemplateKey(template.key)
    setRoleDraft({
      label: template.label,
      roleKey: template.roleKey,
      description: template.description ?? '',
      preferredFlavor: template.preferredFlavor ?? 'claude',
    })
    setStatus(null)
  }

  const deleteRoleTemplate = async (key: string) => {
    await templateActions.deleteRoleTemplate(key)
    if (editingRoleTemplateKey === key) {
      resetRoleDraft()
    }
    setStatus('Custom role template removed.')
  }

  const updateBuiltinRoleTemplate = async (key: string, hidden: boolean, deleted: boolean) => {
    await templateActions.updateBuiltinRoleTemplateOverride(key, { hidden, deleted })
    if (deleted) {
      setStatus('Built-in role template deleted for this namespace.')
    } else if (hidden) {
      setStatus('Built-in role template hidden.')
    } else {
      setStatus('Built-in role template restored.')
    }
  }

  const saveRoomTemplate = async () => {
    const label = roomDraft.label.trim()
    if (!label) {
      setStatus('Room template title is required.')
      return
    }
    const enabledSlots = roomDraft.slots.filter((slot) => slot.enabled)
    if (enabledSlots.length === 0) {
      setStatus('At least one slot must be enabled.')
      return
    }

    const key = editingRoomTemplateKey ?? ensureUniqueTemplateKey(label, [
      ...BUILTIN_ROOM_TEMPLATE_LIST.map((template) => template.key),
      ...catalog.customRoomTemplates.map((template) => template.key),
    ])

    const nextTemplate: RoomTemplateDefinition = {
      key,
      label,
      description: roomDraft.description.trim() || undefined,
      visibleInRoomCreator: roomDraft.visibleInRoomCreator,
      slots: roomDraft.slots.map((slot) => ({
        enabled: slot.enabled,
        roleTemplateKey: slot.roleTemplateKey,
        agent: slot.agent,
        model: slot.model,
        mentionKey: slot.mentionKey,
      })),
    }

    await templateActions.saveRoomTemplate(nextTemplate)
    resetRoomDraft()
    setStatus(`${editingRoomTemplateKey ? 'Updated' : 'Saved'} room template "${label}".`)
  }

  const editRoomTemplate = (template: RoomTemplateDefinition) => {
    setEditingRoomTemplateKey(template.key)
    setRoomDraft({
      label: template.label,
      description: template.description ?? '',
      visibleInRoomCreator: isRoomTemplateVisibleInRoomCreator(template),
      slots: template.slots.map((slot, index) => {
        const roleTemplate = allRoleTemplates.find((item) => item.key === slot.roleTemplateKey)
        const fallbackAgent = roleTemplate?.preferredFlavor ?? (index === 0 ? 'claude' : 'codex')
        return createRoomSlotDraft(slot.roleTemplateKey, slot.agent ?? fallbackAgent, {
          enabled: slot.enabled,
          model: slot.model,
          mentionKey: slot.mentionKey,
        })
      }),
    })
    setStatus(null)
  }

  const deleteRoomTemplate = async (key: string) => {
    await templateActions.deleteRoomTemplate(key)
    if (editingRoomTemplateKey === key) {
      resetRoomDraft()
    }
    setStatus('Custom room template removed.')
  }

  const updateBuiltinRoomTemplate = async (key: string, hidden: boolean, deleted: boolean) => {
    await templateActions.updateBuiltinRoomTemplateOverride(key, { hidden, deleted })
    if (deleted) {
      setStatus('Built-in room template deleted for this namespace.')
    } else if (hidden) {
      setStatus('Built-in room template hidden.')
    } else {
      setStatus('Built-in room template restored.')
    }
  }

  const toggleCustomRoomTemplateVisibility = async (template: RoomTemplateDefinition, visibleInRoomCreator: boolean) => {
    await templateActions.saveRoomTemplate({
      ...template,
      visibleInRoomCreator,
    })
    if (editingRoomTemplateKey === template.key) {
      setRoomDraft((current) => ({ ...current, visibleInRoomCreator }))
    }
    setStatus(visibleInRoomCreator ? 'Custom room template now shows in room creator.' : 'Custom room template hidden from room creator.')
  }

  return (
    <div className="flex h-full flex-col">
      <div className="bg-[var(--app-bg)] pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex w-full max-w-content items-center gap-2 border-b border-[var(--app-border)] p-3">
          <button
            type="button"
            onClick={goBack}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
          >
            <BackIcon />
          </button>
          <div className="flex-1 font-semibold">Template Manager</div>
          <button
            type="button"
            onClick={() => navigate({ to: '/rooms/new' })}
            className="rounded border border-[var(--app-border)] px-3 py-1.5 text-sm"
          >
            New room
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-content flex-col gap-4 p-4">
          <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] p-4">
            <div className="text-base font-semibold">Role templates</div>
            <div className="mt-1 text-sm text-[var(--app-hint)]">
              Built-ins can now be hidden, deleted, and restored per namespace.
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {BUILTIN_ROLE_SLOT_TEMPLATE_LIST.map((template) => {
                const state = getBuiltinRoleTemplateState(catalog, template.key)
                return (
                  <div key={template.key} className="rounded-lg border border-[var(--app-border)] bg-[var(--app-subtle-bg)] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-medium">{template.label}</div>
                          {state.deleted ? (
                            <span className="rounded-full bg-[var(--app-bg)] px-2 py-0.5 text-[11px] text-[var(--app-hint)]">Deleted</span>
                          ) : state.hidden ? (
                            <span className="rounded-full bg-[var(--app-bg)] px-2 py-0.5 text-[11px] text-[var(--app-hint)]">Hidden</span>
                          ) : null}
                        </div>
                        {template.description ? <div className="mt-1 text-xs text-[var(--app-hint)]">{template.description}</div> : null}
                        <div className="mt-2 text-[11px] text-[var(--app-hint)]">@{template.roleKey} · {template.preferredFlavor ?? 'any'}</div>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-3">
                        {state.deleted ? (
                          <button type="button" onClick={() => updateBuiltinRoleTemplate(template.key, false, false)} className="rounded border border-[var(--app-border)] px-2 py-1 text-xs">
                            Restore
                          </button>
                        ) : (
                          <>
                            <label className="flex items-center gap-2 text-xs text-[var(--app-hint)]">
                              <input
                                type="checkbox"
                                checked={!state.hidden}
                                onChange={(e) => void updateBuiltinRoleTemplate(template.key, !e.target.checked, false)}
                              />
                              Show
                            </label>
                            <button
                              type="button"
                              onClick={() => void updateBuiltinRoleTemplate(template.key, false, true)}
                              aria-label={`Delete built-in role template ${template.label}`}
                              title="Delete"
                              className="flex h-8 w-8 items-center justify-center rounded border border-[var(--app-border)] text-[var(--app-hint)]"
                            >
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
                <div className="text-sm font-medium">
                  {editingRoleTemplateKey ? 'Edit custom role template' : 'Add custom role template'}
                </div>
                {editingRoleTemplateKey ? (
                  <button
                    type="button"
                    onClick={resetRoleDraft}
                    className="rounded border border-[var(--app-border)] px-3 py-1.5 text-sm"
                  >
                    Cancel edit
                  </button>
                ) : null}
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <input
                  value={roleDraft.label}
                  onChange={(e) => setRoleDraft((current) => ({ ...current, label: e.target.value }))}
                  placeholder="Template title"
                  className="rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2"
                />
                <input
                  value={roleDraft.roleKey}
                  onChange={(e) => setRoleDraft((current) => ({ ...current, roleKey: e.target.value }))}
                  placeholder="Mention key (optional)"
                  className="rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2"
                />
                <textarea
                  value={roleDraft.description}
                  onChange={(e) => setRoleDraft((current) => ({ ...current, description: e.target.value }))}
                  placeholder="What this role does"
                  className="min-h-24 rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 md:col-span-2"
                />
                <select
                  value={roleDraft.preferredFlavor}
                  onChange={(e) => setRoleDraft((current) => ({ ...current, preferredFlavor: e.target.value as AgentFlavor }))}
                  className="rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2"
                >
                  {AGENT_OPTIONS.map((agent) => <option key={agent} value={agent}>{agent}</option>)}
                </select>
              </div>
              <div className="mt-3 flex justify-end">
                <button type="button" onClick={() => void saveRoleTemplate()} className="rounded bg-[var(--app-link)] px-3 py-1.5 text-sm text-white">
                  {editingRoleTemplateKey ? 'Update role template' : 'Save role template'}
                </button>
              </div>
            </div>

            {catalog.customRoleTemplates.length > 0 ? (
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {catalog.customRoleTemplates.map((template) => (
                  <div key={template.key} className="rounded-lg border border-[var(--app-border)] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{template.label}</div>
                        {template.description ? <div className="mt-1 text-xs text-[var(--app-hint)]">{template.description}</div> : null}
                        <div className="mt-2 text-[11px] text-[var(--app-hint)]">@{template.roleKey} · {template.preferredFlavor ?? 'any'}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => editRoleTemplate(template)} className="rounded border border-[var(--app-border)] px-2 py-1 text-xs">
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteRoleTemplate(template.key)}
                          aria-label={`Delete custom role template ${template.label}`}
                          title="Delete"
                          className="flex h-8 w-8 items-center justify-center rounded border border-[var(--app-border)] text-[var(--app-hint)]"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] p-4">
            <div className="text-base font-semibold">Room templates</div>
            <div className="mt-1 text-sm text-[var(--app-hint)]">
              Custom templates sync through the hub. Built-ins can be hidden, deleted, and restored per namespace.
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {BUILTIN_ROOM_TEMPLATE_LIST.map((template) => {
                const state = getBuiltinRoomTemplateState(catalog, template.key)
                return (
                  <div key={template.key} className="rounded-lg border border-[var(--app-border)] bg-[var(--app-subtle-bg)] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-medium">{template.label}</div>
                          {state.deleted ? (
                            <span className="rounded-full bg-[var(--app-bg)] px-2 py-0.5 text-[11px] text-[var(--app-hint)]">Deleted</span>
                          ) : state.hidden ? (
                            <span className="rounded-full bg-[var(--app-bg)] px-2 py-0.5 text-[11px] text-[var(--app-hint)]">Hidden</span>
                          ) : null}
                        </div>
                        {template.description ? <div className="mt-1 text-xs text-[var(--app-hint)]">{template.description}</div> : null}
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-3">
                        {state.deleted ? (
                          <button type="button" onClick={() => void updateBuiltinRoomTemplate(template.key, false, false)} className="rounded border border-[var(--app-border)] px-2 py-1 text-xs">
                            Restore
                          </button>
                        ) : (
                          <>
                            <label className="flex items-center gap-2 text-xs text-[var(--app-hint)]">
                              <input
                                type="checkbox"
                                checked={!state.hidden}
                                onChange={(e) => void updateBuiltinRoomTemplate(template.key, !e.target.checked, false)}
                              />
                              Show
                            </label>
                            <button
                              type="button"
                              onClick={() => void updateBuiltinRoomTemplate(template.key, false, true)}
                              aria-label={`Delete built-in room template ${template.label}`}
                              title="Delete"
                              className="flex h-8 w-8 items-center justify-center rounded border border-[var(--app-border)] text-[var(--app-hint)]"
                            >
                              <TrashIcon />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {template.slots.map((slot, index) => {
                        const role = allRoleTemplates.find((item) => item.key === slot.roleTemplateKey)
                        return (
                          <span key={`${template.key}-${index}`} className="rounded-full bg-[var(--app-bg)] px-2 py-0.5 text-[11px] text-[var(--app-hint)]">
                            {role?.label ?? slot.roleTemplateKey}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="mt-4 rounded-lg border border-[var(--app-border)] bg-[var(--app-subtle-bg)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-medium">
                  {editingRoomTemplateKey ? 'Edit custom room template' : 'Add custom room template'}
                </div>
                {editingRoomTemplateKey ? (
                  <button
                    type="button"
                    onClick={resetRoomDraft}
                    className="rounded border border-[var(--app-border)] px-3 py-1.5 text-sm"
                  >
                    Cancel edit
                  </button>
                ) : null}
              </div>
              <div className="mt-3 grid gap-3">
                <input
                  value={roomDraft.label}
                  onChange={(e) => setRoomDraft((current) => ({ ...current, label: e.target.value }))}
                  placeholder="Template title"
                  className="rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2"
                />
                <input
                  value={roomDraft.description}
                  onChange={(e) => setRoomDraft((current) => ({ ...current, description: e.target.value }))}
                  placeholder="Description (optional)"
                  className="rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2"
                />
                <label className="flex items-center gap-2 rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={roomDraft.visibleInRoomCreator}
                    onChange={(e) => setRoomDraft((current) => ({ ...current, visibleInRoomCreator: e.target.checked }))}
                  />
                  Show in room creation screen
                </label>

                <div className="flex flex-col gap-3">
                  {roomDraft.slots.map((slot, index) => (
                    <div key={slot.id} className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={slot.enabled}
                            onChange={(e) => setRoomDraft((current) => ({
                              ...current,
                              slots: current.slots.map((item) => item.id === slot.id ? { ...item, enabled: e.target.checked } : item),
                            }))}
                          />
                          Slot {index + 1}
                        </label>
                        {roomDraft.slots.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => setRoomDraft((current) => ({ ...current, slots: current.slots.filter((item) => item.id !== slot.id) }))}
                            className="rounded border border-[var(--app-border)] px-2 py-1 text-xs"
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <select
                          value={slot.roleTemplateKey}
                          onChange={(e) => setRoomDraft((current) => ({
                            ...current,
                            slots: current.slots.map((item) => item.id === slot.id ? { ...item, roleTemplateKey: e.target.value } : item),
                          }))}
                          className="rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2"
                        >
                          {availableRoleTemplates.map((template) => (
                            <option key={template.key} value={template.key}>{template.label}</option>
                          ))}
                        </select>
                        <select
                          value={slot.agent}
                          onChange={(e) => setRoomDraft((current) => ({
                            ...current,
                            slots: current.slots.map((item) => item.id === slot.id ? { ...item, agent: e.target.value as AgentFlavor } : item),
                          }))}
                          className="rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2"
                        >
                          {AGENT_OPTIONS.map((agent) => <option key={agent} value={agent}>{agent}</option>)}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setRoomDraft((current) => ({ ...current, slots: current.slots.concat(createRoomSlotDraft('coder', 'codex')) }))}
                    className="rounded border border-[var(--app-border)] px-3 py-1.5 text-sm"
                  >
                    + Add slot
                  </button>
                  <button type="button" onClick={() => void saveRoomTemplate()} className="rounded bg-[var(--app-link)] px-3 py-1.5 text-sm text-white">
                    {editingRoomTemplateKey ? 'Update room template' : 'Save room template'}
                  </button>
                </div>
              </div>
            </div>

            {catalog.customRoomTemplates.length > 0 ? (
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {catalog.customRoomTemplates.map((template) => (
                  <div key={template.key} className="rounded-lg border border-[var(--app-border)] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-medium">{template.label}</div>
                          <span className="rounded-full bg-[var(--app-subtle-bg)] px-2 py-0.5 text-[11px] text-[var(--app-hint)]">
                            {isRoomTemplateVisibleInRoomCreator(template) ? 'Visible in room creator' : 'Hidden from room creator'}
                          </span>
                        </div>
                        {template.description ? <div className="mt-1 text-xs text-[var(--app-hint)]">{template.description}</div> : null}
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-3">
                        <label className="flex items-center gap-2 text-xs text-[var(--app-hint)]">
                          <input
                            type="checkbox"
                            checked={isRoomTemplateVisibleInRoomCreator(template)}
                            onChange={(e) => void toggleCustomRoomTemplateVisibility(template, e.target.checked)}
                          />
                          Show
                        </label>
                        <button type="button" onClick={() => editRoomTemplate(template)} className="rounded border border-[var(--app-border)] px-2 py-1 text-xs">
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteRoomTemplate(template.key)}
                          aria-label={`Delete custom room template ${template.label}`}
                          title="Delete"
                          className="flex h-8 w-8 items-center justify-center rounded border border-[var(--app-border)] text-[var(--app-hint)]"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {template.slots.map((slot, index) => {
                        const role = allRoleTemplates.find((item) => item.key === slot.roleTemplateKey)
                        return (
                          <span key={`${template.key}-${index}`} className="rounded-full bg-[var(--app-subtle-bg)] px-2 py-0.5 text-[11px] text-[var(--app-hint)]">
                            {role?.label ?? slot.roleTemplateKey}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {templatesLoading ? <div className="text-sm text-[var(--app-hint)]">Loading templates…</div> : null}
          {status ? <div className="text-sm text-[var(--app-hint)]">{status}</div> : null}
        </div>
      </div>
    </div>
  )
}
