import { useEffect, useMemo, useState } from 'react'
import { useAppGoBack } from '@/hooks/useAppGoBack'
import { useTemplateActions } from '@/hooks/mutations/useTemplateActions'
import { useTemplates } from '@/hooks/queries/useTemplates'
import { useAppContext } from '@/lib/app-context'
import {
  RoleTemplatesSection,
  RoomTemplatesSection,
  TemplateManagerHeader,
} from '@/components/templates/TemplateManagerSections'
import {
  BUILTIN_ROLE_SLOT_TEMPLATE_LIST,
  BUILTIN_ROOM_TEMPLATE_LIST,
  ensureUniqueTemplateKey,
  getAllRoleSlotTemplates,
  getAvailableRoleSlotTemplates,
  isRoomTemplateVisibleInRoomCreator,
  slugifyRoleTemplateKey,
  type AgentFlavor,
  type RoleSlotTemplate,
  type RoomTemplateDefinition,
} from '@/components/rooms/roleTemplates'

const AGENT_OPTIONS: AgentFlavor[] = ['claude', 'codex', 'cursor', 'gemini', 'opencode']

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
      <TemplateManagerHeader onBack={goBack} />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-content flex-col gap-4 p-4">
          <RoleTemplatesSection
            catalog={catalog}
            templatesLoading={templatesLoading}
            allRoleTemplates={allRoleTemplates}
            editingRoleTemplateKey={editingRoleTemplateKey}
            roleDraft={roleDraft}
            agentOptions={AGENT_OPTIONS}
            status={status}
            onRoleDraftChange={(updater) => setRoleDraft(updater)}
            onResetRoleDraft={resetRoleDraft}
            onSaveRoleTemplate={() => void saveRoleTemplate()}
            onEditRoleTemplate={editRoleTemplate}
            onDeleteRoleTemplate={(key) => void deleteRoleTemplate(key)}
            onUpdateBuiltinRoleTemplate={(key, hidden, deleted) => void updateBuiltinRoleTemplate(key, hidden, deleted)}
          />
          <RoomTemplatesSection
            catalog={catalog}
            allRoleTemplates={allRoleTemplates}
            availableRoleTemplates={availableRoleTemplates}
            editingRoomTemplateKey={editingRoomTemplateKey}
            roomDraft={roomDraft}
            agentOptions={AGENT_OPTIONS}
            status={status}
            onRoomDraftChange={(updater) => setRoomDraft(updater)}
            onResetRoomDraft={resetRoomDraft}
            onSaveRoomTemplate={() => void saveRoomTemplate()}
            onEditRoomTemplate={editRoomTemplate}
            onDeleteRoomTemplate={(key) => void deleteRoomTemplate(key)}
            onUpdateBuiltinRoomTemplate={(key, hidden, deleted) => void updateBuiltinRoomTemplate(key, hidden, deleted)}
            onToggleCustomRoomTemplateVisibility={(template, visible) => void toggleCustomRoomTemplateVisibility(template, visible)}
            onCreateSlot={() => createRoomSlotDraft('coder', 'codex')}
          />
        </div>
      </div>
    </div>
  )
}
