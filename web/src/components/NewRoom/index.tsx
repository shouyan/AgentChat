import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ApiClient } from '@/api/client'
import type { Machine } from '@/types/api'
import {
  BUILTIN_ROOM_TEMPLATES,
  BUILTIN_ROOM_TEMPLATE_LIST,
  ensureUniqueTemplateKey,
  getAllRoleSlotTemplates,
  getAvailableRoleSlotTemplates,
  getRoomTemplatesForRoomCreator,
  type AgentFlavor,
  type RoleSlotTemplate,
  type RoomTemplateDefinition,
} from '@/components/rooms/roleTemplates'
import { SaveRoomTemplateDialog } from '@/components/rooms/SaveRoomTemplateDialog'
import { useTemplateActions } from '@/hooks/mutations/useTemplateActions'
import { useTemplates } from '@/hooks/queries/useTemplates'
import {
  AGENT_LABELS,
  AGENT_MODEL_OPTIONS,
  AGENT_OPTIONS,
  AgentAvatar,
  buildMentionKeyBase,
  getDefaultModelForAgent,
  normalizeMentionKeyInput,
} from '@/components/rooms/agentCatalog'

type SlotDraft = {
  id: string
  enabled: boolean
  roleTemplateKey: string
  agent: AgentFlavor
  model: string
  mentionKey: string
  customMentionKey: boolean
}

const LAST_MACHINE_STORAGE_KEY = 'agentchat.newRoom.lastMachineId'
const LAST_DIRECTORY_STORAGE_KEY = 'agentchat.newRoom.lastDirectory'

function createSlot(
  roleTemplateKey: string,
  agent: AgentFlavor,
  options?: {
    enabled?: boolean
    model?: string
    mentionKey?: string
    customMentionKey?: boolean
  }
): SlotDraft {
  return {
    id: `${roleTemplateKey}-${Math.random().toString(36).slice(2, 8)}`,
    enabled: options?.enabled ?? true,
    roleTemplateKey,
    agent,
    model: options?.model ?? getDefaultModelForAgent(agent),
    mentionKey: options?.mentionKey ?? '',
    customMentionKey: options?.customMentionKey ?? Boolean(options?.mentionKey),
  }
}

function buildAutoMentionKey(roleKey: string, agent: AgentFlavor, model: string, index: number): string {
  const rolePart = index <= 1 ? roleKey : `${roleKey}${index}`
  return buildMentionKeyBase(rolePart, agent, model)
}

function findRoleTemplate(roleTemplates: RoleSlotTemplate[], key: string): RoleSlotTemplate | undefined {
  return roleTemplates.find((template) => template.key === key)
}

function applyAutoMentionKeys(slots: SlotDraft[], roleTemplates: RoleSlotTemplate[]): SlotDraft[] {
  const used = new Set<string>()

  for (const slot of slots) {
    if (!slot.customMentionKey) continue
    const normalized = normalizeMentionKeyInput(slot.mentionKey)
    if (normalized) {
      used.add(normalized)
    }
  }

  return slots.map((slot) => {
    if (slot.customMentionKey) {
      return { ...slot, mentionKey: normalizeMentionKeyInput(slot.mentionKey) }
    }

    const roleTemplate = findRoleTemplate(roleTemplates, slot.roleTemplateKey)
    const roleKey = normalizeMentionKeyInput(roleTemplate?.roleKey ?? roleTemplate?.label ?? 'agent') || 'agent'
    let counter = 1
    let candidate = buildAutoMentionKey(roleKey, slot.agent, slot.model, counter)
    while (used.has(candidate)) {
      counter += 1
      candidate = buildAutoMentionKey(roleKey, slot.agent, slot.model, counter)
    }
    used.add(candidate)
    return { ...slot, mentionKey: candidate }
  })
}

function duplicateSlotDraft(slot: SlotDraft): SlotDraft {
  return {
    ...slot,
    id: `${slot.roleTemplateKey}-${Math.random().toString(36).slice(2, 8)}`,
    customMentionKey: false,
    mentionKey: '',
  }
}

function moveSlotDrafts(slots: SlotDraft[], fromIndex: number, toIndex: number): SlotDraft[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= slots.length || toIndex >= slots.length) {
    return slots
  }

  const next = slots.slice()
  const [moved] = next.splice(fromIndex, 1)
  if (!moved) return slots
  next.splice(toIndex, 0, moved)
  return next
}

function slotsFromRoomTemplate(
  template: RoomTemplateDefinition,
  roleTemplates: RoleSlotTemplate[]
): SlotDraft[] {
  return applyAutoMentionKeys(template.slots.map((slot, index) => {
    const roleTemplate = findRoleTemplate(roleTemplates, slot.roleTemplateKey)
    const agent = slot.agent ?? roleTemplate?.preferredFlavor ?? (index === 0 ? 'claude' : 'codex')
    return createSlot(slot.roleTemplateKey, agent, {
      enabled: slot.enabled ?? true,
      model: slot.model ?? getDefaultModelForAgent(agent),
      mentionKey: slot.mentionKey,
      customMentionKey: Boolean(slot.mentionKey),
    })
  }), roleTemplates)
}

export function NewRoom(props: {
  api: ApiClient
  machines: Machine[]
  onSuccess: (roomId: string) => void
  onCancel: () => void
  onManageTemplates?: () => void
}) {
  const fallbackTemplate = BUILTIN_ROOM_TEMPLATES.quick_duo

  const { catalog: templateCatalog, error: templateLoadError } = useTemplates(props.api)
  const templateActions = useTemplateActions(props.api)
  const allRoleTemplates = useMemo(() => getAllRoleSlotTemplates(templateCatalog), [templateCatalog])
  const roleTemplates = useMemo(() => getAvailableRoleSlotTemplates(templateCatalog), [templateCatalog])
  const roomTemplates = useMemo(() => getRoomTemplatesForRoomCreator(templateCatalog), [templateCatalog])

  const [name, setName] = useState('')
  const [goal, setGoal] = useState('')
  const [autoDispatch, setAutoDispatch] = useState(true)
  const [autoLaunchAgents, setAutoLaunchAgents] = useState(true)
  const [selectedRoomTemplateKey, setSelectedRoomTemplateKey] = useState(fallbackTemplate.key)
  const [slots, setSlots] = useState<SlotDraft[]>(() => slotsFromRoomTemplate(fallbackTemplate, getAvailableRoleSlotTemplates()))
  const [machineId, setMachineId] = useState(() => {
    if (typeof window === 'undefined') return ''
    return window.localStorage.getItem(LAST_MACHINE_STORAGE_KEY) ?? ''
  })
  const [directory, setDirectory] = useState(() => {
    if (typeof window === 'undefined') return ''
    return window.localStorage.getItem(LAST_DIRECTORY_STORAGE_KEY) ?? ''
  })
  const [error, setError] = useState<string | null>(null)
  const [templateStatus, setTemplateStatus] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSavingTemplate, setIsSavingTemplate] = useState(false)
  const [saveTemplateDialogOpen, setSaveTemplateDialogOpen] = useState(false)

  const enabledSlots = slots.filter((slot) => slot.enabled)

  useEffect(() => {
    if (templateLoadError) {
      setTemplateStatus(templateLoadError)
    }
  }, [templateLoadError])

  useEffect(() => {
    if (machineId) return
    if (props.machines.length === 1) {
      setMachineId(props.machines[0]?.id ?? '')
    }
  }, [machineId, props.machines])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (machineId) {
      window.localStorage.setItem(LAST_MACHINE_STORAGE_KEY, machineId)
    }
  }, [machineId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(LAST_DIRECTORY_STORAGE_KEY, directory)
  }, [directory])

  useEffect(() => {
    if (roomTemplates.length === 0 || roleTemplates.length === 0) return
    const selectedTemplate = roomTemplates.find((template) => template.key === selectedRoomTemplateKey)
    if (selectedTemplate) return

    const nextTemplate = roomTemplates[0]
    if (!nextTemplate) return

    setSelectedRoomTemplateKey(nextTemplate.key)
    setSlots(slotsFromRoomTemplate(nextTemplate, roleTemplates))
  }, [roleTemplates, roomTemplates, selectedRoomTemplateKey])

  const applyRoomTemplate = useCallback((templateKey: string) => {
    const nextTemplate = roomTemplates.find((template) => template.key === templateKey)
    if (!nextTemplate) return
    setTemplateStatus(null)
    setSelectedRoomTemplateKey(nextTemplate.key)
    setSlots(slotsFromRoomTemplate(nextTemplate, roleTemplates))
  }, [roleTemplates, roomTemplates])

  const updateSlot = useCallback((slotId: string, patch: Partial<SlotDraft>) => {
    setSlots((current) => applyAutoMentionKeys(current.map((slot) => (
      slot.id === slotId
        ? { ...slot, ...patch }
        : slot
    )), roleTemplates))
  }, [roleTemplates])

  const addSlot = () => {
    setTemplateStatus(null)
    setSlots((current) => applyAutoMentionKeys(current.concat(createSlot('coder', 'codex')), roleTemplates))
  }

  const duplicateSlot = (slotId: string) => {
    setTemplateStatus(null)
    setSlots((current) => {
      const index = current.findIndex((slot) => slot.id === slotId)
      if (index < 0) return current
      const target = current[index]
      if (!target) return current
      const next = current.slice()
      next.splice(index + 1, 0, duplicateSlotDraft(target))
      return applyAutoMentionKeys(next, roleTemplates)
    })
  }

  const removeSlot = (slotId: string) => {
    setTemplateStatus(null)
    setSlots((current) => applyAutoMentionKeys(current.filter((slot) => slot.id !== slotId), roleTemplates))
  }

  const moveSlot = (slotId: string, direction: 'up' | 'down') => {
    setTemplateStatus(null)
    setSlots((current) => {
      const index = current.findIndex((slot) => slot.id === slotId)
      if (index < 0) return current
      const nextIndex = direction === 'up' ? index - 1 : index + 1
      return applyAutoMentionKeys(moveSlotDrafts(current, index, nextIndex), roleTemplates)
    })
  }

  const handleSaveTemplate = async (payload: { label: string; description?: string }) => {
    const activeSlots = slots.filter((slot) => slot.enabled)
    if (activeSlots.length === 0) {
      throw new Error('Please keep at least one slot enabled before saving a template.')
    }

    setIsSavingTemplate(true)
    try {
      const usedKeys = [
        ...BUILTIN_ROOM_TEMPLATE_LIST.map((template) => template.key),
        ...templateCatalog.customRoomTemplates.map((template) => template.key),
      ]
      const key = ensureUniqueTemplateKey(payload.label, usedKeys)
      const nextTemplate: RoomTemplateDefinition = {
        key,
        label: payload.label,
        description: payload.description,
        visibleInRoomCreator: true,
        slots: slots.map((slot) => ({
          enabled: slot.enabled,
          roleTemplateKey: slot.roleTemplateKey,
          agent: slot.agent,
          model: slot.model,
          mentionKey: slot.customMentionKey ? normalizeMentionKeyInput(slot.mentionKey) || undefined : undefined,
        })),
      }
      await templateActions.saveRoomTemplate(nextTemplate)
      setSelectedRoomTemplateKey(key)
      setTemplateStatus(`Saved room template "${payload.label}".`)
    } finally {
      setIsSavingTemplate(false)
    }
  }

  const handleCreate = async () => {
    if (!name.trim()) {
      setError('Room name is required')
      return
    }
    if (enabledSlots.length === 0) {
      setError('Please keep at least one slot enabled')
      return
    }
    if (autoLaunchAgents && !machineId) {
      setError('Choose a machine for auto launch')
      return
    }
    if (autoLaunchAgents && !directory.trim()) {
      setError('Set a working directory for auto launch')
      return
    }

    const normalizedKeys = enabledSlots.map((slot) => normalizeMentionKeyInput(slot.mentionKey))
    if (normalizedKeys.some((key) => !key)) {
      setError('Every enabled slot needs a valid mention key')
      return
    }
    if (new Set(normalizedKeys).size !== normalizedKeys.length) {
      setError('Mention keys must be unique across enabled slots')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const roles = enabledSlots.map((slot, index) => {
        const roleTemplate = findRoleTemplate(roleTemplates, slot.roleTemplateKey)
        return {
          key: normalizeMentionKeyInput(slot.mentionKey),
          label: roleTemplate?.roleLabel ?? roleTemplate?.label ?? `Role ${index + 1}`,
          description: roleTemplate?.description,
          required: index < 2,
          preferredFlavor: slot.agent,
          preferredModel: slot.model !== 'auto' && slot.agent !== 'opencode' ? slot.model : undefined,
          assignmentMode: autoLaunchAgents ? 'spawn_new' as const : 'unassigned' as const,
          spawnConfig: autoLaunchAgents ? {
            machineId,
            flavor: slot.agent,
            model: slot.model !== 'auto' && slot.agent !== 'opencode' ? slot.model : undefined,
            path: directory.trim(),
            sessionType: 'simple' as const,
            yolo: true,
          } : undefined,
          sortOrder: index,
        }
      })

      const result = await props.api.createRoom({
        name: name.trim(),
        goal: goal.trim() || undefined,
        templateKey: selectedRoomTemplateKey,
        autoDispatch,
        coordinatorRoleKey: roles[0]?.key,
        roles,
      })
      props.onSuccess(result.room.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create room')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold">Quick room setup</div>
            <div className="mt-1 text-sm text-[var(--app-hint)]">
              Start simple: choose a room template, keep the slots you want, then pick a role template, agent, model, and mention key for each slot.
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div>
            <div className="text-sm font-medium">Room name</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2"
              placeholder="Launch coordination room"
            />
          </div>
          <div className="mt-2 flex flex-col gap-2">
            <label className="flex items-center gap-2 rounded-lg border border-[var(--app-border)] bg-[var(--app-subtle-bg)] px-3 py-2 text-sm">
              <input type="checkbox" checked={autoDispatch} onChange={(e) => setAutoDispatch(e.target.checked)} />
              Enable planner auto-dispatch nudges
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-[var(--app-border)] bg-[var(--app-subtle-bg)] px-3 py-2 text-sm">
              <input type="checkbox" checked={autoLaunchAgents} onChange={(e) => setAutoLaunchAgents(e.target.checked)} />
              Auto launch agents after room creation
            </label>
          </div>
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium">Goal <span className="text-[var(--app-hint)]">(optional)</span></div>
            <div className="text-xs text-[var(--app-hint)]">Leave blank to start quietly and wait for your first room message.</div>
          </div>
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            className="mt-1 min-h-24 w-full rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2"
            placeholder="Optional: describe the shared objective"
          />
        </div>

        {autoLaunchAgents ? (
          <div className="mt-4 rounded-xl border border-[var(--app-border)] bg-[var(--app-subtle-bg)] p-4">
            <div className="text-sm font-medium">Launch defaults</div>
            <div className="mt-1 text-xs text-[var(--app-hint)]">
              All enabled slots will be spawned immediately with the selected agent type, model, machine, and working directory.
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div>
                <div className="text-xs font-medium text-[var(--app-hint)]">Machine</div>
                <select
                  value={machineId}
                  onChange={(e) => setMachineId(e.target.value)}
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
                <div className="text-xs font-medium text-[var(--app-hint)]">Working directory</div>
                <input
                  value={directory}
                  onChange={(e) => setDirectory(e.target.value)}
                  className="mt-1 w-full rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2"
                  placeholder="/path/to/project"
                />
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold">Room templates</div>
            <div className="mt-1 text-sm text-[var(--app-hint)]">
              These prefill the slot list below. You can still edit the slots after choosing one.
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="rounded-full bg-[var(--app-subtle-bg)] px-3 py-1 text-xs text-[var(--app-hint)]">
              {enabledSlots.length} active slot{enabledSlots.length === 1 ? '' : 's'}
            </div>
            <button
              type="button"
              onClick={() => setSaveTemplateDialogOpen(true)}
              className="rounded border border-[var(--app-border)] px-3 py-1.5 text-sm"
            >
              Add template
            </button>
            {props.onManageTemplates ? (
              <button
                type="button"
                onClick={props.onManageTemplates}
                className="rounded border border-[var(--app-border)] px-3 py-1.5 text-sm"
              >
                Manage templates
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {roomTemplates.map((template) => {
            const selected = selectedRoomTemplateKey === template.key
            return (
              <button
                key={template.key}
                type="button"
                onClick={() => applyRoomTemplate(template.key)}
                className={`rounded-xl border p-4 text-left transition-colors ${selected ? 'border-[var(--app-link)] bg-[var(--app-subtle-bg)]' : 'border-[var(--app-border)] bg-[var(--app-bg)] hover:bg-[var(--app-subtle-bg)]'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">{template.label}</div>
                  <span className="rounded-full bg-[var(--app-subtle-bg)] px-2 py-0.5 text-[11px] text-[var(--app-hint)]">
                    {template.slots.length} slots
                  </span>
                </div>
                {template.description ? <div className="mt-1 text-xs text-[var(--app-hint)]">{template.description}</div> : null}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {template.slots.map((slot, index) => {
                    const roleTemplate = findRoleTemplate(allRoleTemplates, slot.roleTemplateKey)
                    return (
                      <span key={`${template.key}-${index}`} className="rounded-full bg-[var(--app-subtle-bg)] px-2 py-0.5 text-[11px] text-[var(--app-hint)]">
                        {roleTemplate?.label ?? slot.roleTemplateKey}
                      </span>
                    )
                  })}
                </div>
              </button>
            )
          })}
        </div>

        {templateStatus ? (
          <div className="mt-3 text-sm text-[var(--app-hint)]">{templateStatus}</div>
        ) : null}
      </div>

      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-base font-semibold">Slots</div>
            <div className="mt-1 text-sm text-[var(--app-hint)]">
              Each slot now includes its role template, agent, model, mention key, and avatar preview.
            </div>
          </div>
          <button type="button" onClick={addSlot} className="rounded bg-[var(--app-subtle-bg)] px-3 py-1.5 text-sm">
            + Add slot
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          {slots.map((slot, index) => {
            const roleTemplate = findRoleTemplate(allRoleTemplates, slot.roleTemplateKey)
            const modelOptions = AGENT_MODEL_OPTIONS[slot.agent] ?? []
            return (
              <div key={slot.id} className="rounded-xl border border-[var(--app-border)] bg-[var(--app-subtle-bg)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={slot.enabled}
                      onChange={(e) => updateSlot(slot.id, { enabled: e.target.checked })}
                      className="mt-3"
                    />
                    <AgentAvatar agent={slot.agent} ringIndex={index} />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-medium">Slot {index + 1}</div>
                        <span className="rounded-full bg-[var(--app-bg)] px-2 py-0.5 text-[11px] text-[var(--app-hint)]">
                          @{slot.mentionKey || 'pending_key'}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-[var(--app-hint)]">
                        {roleTemplate?.label ?? slot.roleTemplateKey} · {AGENT_LABELS[slot.agent]} · {slot.model}
                      </div>
                      <div className="mt-1 text-xs text-[var(--app-hint)]">
                        {slot.enabled ? 'Enabled' : 'Disabled'}{roleTemplate?.description ? ` · ${roleTemplate.description}` : ''}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => moveSlot(slot.id, 'up')}
                      disabled={index === 0}
                      className="rounded border border-[var(--app-border)] px-2.5 py-1 text-xs disabled:opacity-40"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSlot(slot.id, 'down')}
                      disabled={index === slots.length - 1}
                      className="rounded border border-[var(--app-border)] px-2.5 py-1 text-xs disabled:opacity-40"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => duplicateSlot(slot.id)}
                      className="rounded border border-[var(--app-border)] px-2.5 py-1 text-xs"
                    >
                      Copy
                    </button>
                    {slots.length > 2 ? (
                      <button
                        type="button"
                        onClick={() => removeSlot(slot.id)}
                        className="rounded border border-[var(--app-border)] px-2.5 py-1 text-xs"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <div className="text-xs font-medium text-[var(--app-hint)]">Role template</div>
                    <select
                      value={slot.roleTemplateKey}
                      onChange={(e) => {
                        const nextKey = e.target.value
                        const nextTemplate = findRoleTemplate(allRoleTemplates, nextKey)
                        const nextAgent = nextTemplate?.preferredFlavor ?? slot.agent
                        updateSlot(slot.id, {
                          roleTemplateKey: nextKey,
                          agent: nextAgent,
                          model: getDefaultModelForAgent(nextAgent),
                        })
                      }}
                      className="mt-1 w-full rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2"
                    >
                      {roleTemplates.map((template) => (
                        <option key={template.key} value={template.key}>{template.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="text-xs font-medium text-[var(--app-hint)]">Agent</div>
                    <select
                      value={slot.agent}
                      onChange={(e) => {
                        const nextAgent = e.target.value as AgentFlavor
                        updateSlot(slot.id, { agent: nextAgent, model: getDefaultModelForAgent(nextAgent) })
                      }}
                      className="mt-1 w-full rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2"
                    >
                      {AGENT_OPTIONS.map((agent) => (
                        <option key={agent} value={agent}>
                          {AGENT_LABELS[agent]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="text-xs font-medium text-[var(--app-hint)]">Model</div>
                    {modelOptions.length > 0 ? (
                      <select
                        value={slot.model}
                        onChange={(e) => updateSlot(slot.id, { model: e.target.value })}
                        className="mt-1 w-full rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2"
                      >
                        {modelOptions.map((model) => (
                          <option key={model.value} value={model.value}>{model.label}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value="Auto"
                        disabled
                        className="mt-1 w-full rounded border border-[var(--app-border)] bg-[var(--app-subtle-bg)] px-3 py-2 text-[var(--app-hint)]"
                      />
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-medium text-[var(--app-hint)]">Mention key</div>
                      {!slot.customMentionKey ? (
                        <span className="text-[10px] uppercase tracking-wide text-[var(--app-hint)]">Auto</span>
                      ) : null}
                    </div>
                    <input
                      value={slot.mentionKey}
                      onChange={(e) => updateSlot(slot.id, { mentionKey: normalizeMentionKeyInput(e.target.value), customMentionKey: true })}
                      onBlur={(e) => {
                        const normalized = normalizeMentionKeyInput(e.target.value)
                        if (!normalized) {
                          updateSlot(slot.id, { mentionKey: '', customMentionKey: false })
                        } else {
                          updateSlot(slot.id, { mentionKey: normalized, customMentionKey: true })
                        }
                      }}
                      className="mt-1 w-full rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2"
                      placeholder="coder_cc_opus4_6"
                    />
                    <div className="mt-1 text-[11px] text-[var(--app-hint)]">
                      Use this as the room mention, for example @{slot.mentionKey || 'slot_name'}.
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold">Launch preview</div>
            <div className="mt-1 text-sm text-[var(--app-hint)]">
              Final room shape before creation: enabled slots, routing keys, and where each spawned agent will start.
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-[var(--app-subtle-bg)] px-3 py-1 text-[var(--app-hint)]">
              template: {roomTemplates.find((template) => template.key === selectedRoomTemplateKey)?.label ?? selectedRoomTemplateKey}
            </span>
            <span className="rounded-full bg-[var(--app-subtle-bg)] px-3 py-1 text-[var(--app-hint)]">
              roles: {enabledSlots.length}
            </span>
            <span className="rounded-full bg-[var(--app-subtle-bg)] px-3 py-1 text-[var(--app-hint)]">
              dispatch: {autoDispatch ? 'auto' : 'manual'}
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-subtle-bg)] p-3">
            <div className="text-xs font-medium uppercase tracking-wide text-[var(--app-hint)]">Room defaults</div>
            <div className="mt-2 space-y-2 text-sm">
              <div><span className="text-[var(--app-hint)]">Coordinator:</span> <span className="text-[var(--app-fg)]">@{enabledSlots[0]?.mentionKey || 'pending'}</span></div>
              <div><span className="text-[var(--app-hint)]">Machine:</span> <span className="text-[var(--app-fg)]">{props.machines.find((machine) => machine.id === machineId)?.metadata?.displayName || props.machines.find((machine) => machine.id === machineId)?.metadata?.host || machineId || 'Not selected'}</span></div>
              <div><span className="text-[var(--app-hint)]">Directory:</span> <span className="break-all text-[var(--app-fg)]">{directory.trim() || 'Not set'}</span></div>
              <div><span className="text-[var(--app-hint)]">Agent launch:</span> <span className="text-[var(--app-fg)]">{autoLaunchAgents ? 'Spawn immediately' : 'Create empty room only'}</span></div>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-subtle-bg)] p-3">
            <div className="text-xs font-medium uppercase tracking-wide text-[var(--app-hint)]">Routing preview</div>
            <div className="mt-2 text-sm text-[var(--app-hint)]">
              First enabled slot becomes the coordinator. Mention keys below are what room chat will route against after creation.
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {enabledSlots.map((slot, index) => {
            const roleTemplate = findRoleTemplate(allRoleTemplates, slot.roleTemplateKey)
            return (
              <div key={`preview-${slot.id}`} className="rounded-xl border border-[var(--app-border)] bg-[var(--app-subtle-bg)] p-3">
                <div className="flex items-start gap-3">
                  <AgentAvatar agent={slot.agent} ringIndex={index} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium text-[var(--app-fg)]">{roleTemplate?.roleLabel ?? roleTemplate?.label ?? `Role ${index + 1}`}</div>
                      <span className="rounded-full bg-[var(--app-bg)] px-2 py-0.5 text-[11px] text-[var(--app-hint)]">@{slot.mentionKey}</span>
                      {index === 0 ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-700">Coordinator</span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-xs text-[var(--app-hint)]">
                      {AGENT_LABELS[slot.agent]} · {slot.model}
                    </div>
                    <div className="mt-2 text-xs text-[var(--app-hint)]">
                      {autoLaunchAgents
                        ? `Will spawn on ${(props.machines.find((machine) => machine.id === machineId)?.metadata?.displayName || props.machines.find((machine) => machine.id === machineId)?.metadata?.host || 'selected machine')} in ${directory.trim() || 'the chosen directory'}.`
                        : 'Role seat only; no session spawned during room creation.'}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {error ? <div className="text-sm text-red-600">{error}</div> : null}

      <div className="flex gap-2">
        <button type="button" onClick={props.onCancel} className="rounded border border-[var(--app-border)] px-4 py-2">Cancel</button>
        <button type="button" onClick={handleCreate} disabled={isSubmitting} className="rounded bg-[var(--app-link)] px-4 py-2 text-white disabled:opacity-60">
          {isSubmitting ? 'Creating…' : 'Create room'}
        </button>
      </div>

      <SaveRoomTemplateDialog
        isOpen={saveTemplateDialogOpen}
        isPending={isSavingTemplate}
        initialLabel={name.trim() ? `${name.trim()} template` : undefined}
        initialDescription={goal.trim() || undefined}
        onClose={() => setSaveTemplateDialogOpen(false)}
        onSubmit={handleSaveTemplate}
      />
    </div>
  )
}
