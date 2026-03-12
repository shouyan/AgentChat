import type {
  RoleSlotTemplate,
  RoomTemplateDefinition,
  RoomTemplateSlot,
  TemplateAgentFlavor as AgentFlavor,
  TemplateCatalog,
  TemplateOverrideState,
} from '@hapi/protocol/templates'
import type { RoomMetadata } from '@/types/api'

export type RoleTemplateRoleDraft = {
  key: string
  label: string
  description?: string
  required?: boolean
  preferredFlavor?: 'claude' | 'codex' | 'cursor' | 'gemini' | 'opencode'
  preferredModel?: string
  permissionMode?: string
  sortOrder?: number
}

export type RoleTemplateDraft = {
  key: string
  label: string
  description?: string
  roles: RoleTemplateRoleDraft[]
}

export type { AgentFlavor, RoleSlotTemplate, RoomTemplateDefinition, RoomTemplateSlot, TemplateCatalog, TemplateOverrideState }

export const EMPTY_TEMPLATE_CATALOG: TemplateCatalog = {
  customRoleTemplates: [],
  customRoomTemplates: [],
  builtinRoleTemplateOverrides: [],
  builtinRoomTemplateOverrides: [],
}

export const BUILTIN_ROLE_SLOT_TEMPLATES: Record<string, RoleSlotTemplate> = {
  planner: {
    key: 'planner',
    label: 'Planner',
    description: 'Break down the goal, assign work, and coordinate the team.',
    roleKey: 'planner',
    roleLabel: 'Planner',
    preferredFlavor: 'claude',
  },
  coordinator: {
    key: 'coordinator',
    label: 'Coordinator',
    description: 'Keep the room aligned and make sure handoffs happen cleanly.',
    roleKey: 'coordinator',
    roleLabel: 'Coordinator',
    preferredFlavor: 'claude',
  },
  architect: {
    key: 'architect',
    label: 'Architect',
    description: 'Own system design, interfaces, and structure decisions.',
    roleKey: 'architect',
    roleLabel: 'Architect',
    preferredFlavor: 'claude',
  },
  coder: {
    key: 'coder',
    label: 'Coder',
    description: 'Implement the main code changes.',
    roleKey: 'coder',
    roleLabel: 'Coder',
    preferredFlavor: 'codex',
  },
  reviewer: {
    key: 'reviewer',
    label: 'Reviewer',
    description: 'Review outputs, find risks, and request fixes.',
    roleKey: 'reviewer',
    roleLabel: 'Reviewer',
    preferredFlavor: 'claude',
  },
  researcher: {
    key: 'researcher',
    label: 'Researcher',
    description: 'Collect evidence, compare sources, and surface findings.',
    roleKey: 'researcher',
    roleLabel: 'Researcher',
    preferredFlavor: 'claude',
  },
  writer: {
    key: 'writer',
    label: 'Writer',
    description: 'Turn findings into a clean written deliverable.',
    roleKey: 'writer',
    roleLabel: 'Writer',
    preferredFlavor: 'claude',
  },
  tester: {
    key: 'tester',
    label: 'Tester',
    description: 'Validate behavior, write tests, and check quality.',
    roleKey: 'tester',
    roleLabel: 'Tester',
    preferredFlavor: 'cursor',
  },
}

export const BUILTIN_ROLE_SLOT_TEMPLATE_LIST = Object.values(BUILTIN_ROLE_SLOT_TEMPLATES)

export const BUILTIN_ROLE_TEMPLATES: Record<string, RoleTemplateDraft> = {
  dev_trio: {
    key: 'dev_trio',
    label: 'Dev Trio',
    roles: [
      { key: 'coordinator', label: 'Coordinator', description: 'Break down work, assign tasks, and keep the team aligned.', preferredFlavor: 'claude', required: true },
      { key: 'implementer', label: 'Implementer', description: 'Write and refine the main implementation.', preferredFlavor: 'codex', required: true },
      { key: 'reviewer', label: 'Reviewer', description: 'Review changes, risks, and test coverage.', preferredFlavor: 'claude', required: true },
    ],
  },
  full_build: {
    key: 'full_build',
    label: 'Full Build',
    roles: [
      { key: 'planner', label: 'Planner', description: 'Turn the goal into a concrete execution plan.', preferredFlavor: 'claude', required: true },
      { key: 'architect', label: 'Architect', description: 'Own structure, interfaces, and design constraints.', preferredFlavor: 'claude' },
      { key: 'coder', label: 'Coder', description: 'Implement the core changes.', preferredFlavor: 'codex', required: true },
      { key: 'tester', label: 'Tester', description: 'Add or update tests and verify behavior.', preferredFlavor: 'cursor' },
      { key: 'reviewer', label: 'Reviewer', description: 'Review output quality before handoff.', preferredFlavor: 'claude' },
    ],
  },
  research: {
    key: 'research',
    label: 'Research',
    roles: [
      { key: 'lead', label: 'Lead', description: 'Coordinate the investigation and synthesize findings.', preferredFlavor: 'claude', required: true },
      { key: 'researcher', label: 'Researcher', description: 'Collect information and source material.', preferredFlavor: 'gemini' },
      { key: 'writer', label: 'Writer', description: 'Draft the final write-up.', preferredFlavor: 'claude' },
      { key: 'reviewer', label: 'Reviewer', description: 'Critique clarity, evidence, and gaps.', preferredFlavor: 'claude' },
    ],
  },
}

export const BUILTIN_ROLE_TEMPLATE_LIST = Object.values(BUILTIN_ROLE_TEMPLATES)

export const BUILTIN_ROOM_TEMPLATES: Record<string, RoomTemplateDefinition> = {
  quick_duo: {
    key: 'quick_duo',
    label: 'Quick Duo',
    description: 'Minimal two-slot setup for fast collaboration.',
    slots: [
      { enabled: true, roleTemplateKey: 'planner', agent: 'claude' },
      { enabled: true, roleTemplateKey: 'coder', agent: 'codex' },
    ],
  },
  dev_trio_room: {
    key: 'dev_trio_room',
    label: 'Dev Trio',
    description: 'Planner, coder, reviewer.',
    slots: [
      { enabled: true, roleTemplateKey: 'planner', agent: 'claude' },
      { enabled: true, roleTemplateKey: 'coder', agent: 'codex' },
      { enabled: true, roleTemplateKey: 'reviewer', agent: 'claude' },
    ],
  },
  full_build_room: {
    key: 'full_build_room',
    label: 'Full Build',
    description: 'A broader engineering room with design and testing roles.',
    slots: [
      { enabled: true, roleTemplateKey: 'planner', agent: 'claude' },
      { enabled: true, roleTemplateKey: 'architect', agent: 'claude' },
      { enabled: true, roleTemplateKey: 'coder', agent: 'codex' },
      { enabled: true, roleTemplateKey: 'tester', agent: 'cursor' },
      { enabled: true, roleTemplateKey: 'reviewer', agent: 'claude' },
    ],
  },
  research_duo: {
    key: 'research_duo',
    label: 'Research Duo',
    description: 'One researcher and one writer/reviewer partner.',
    slots: [
      { enabled: true, roleTemplateKey: 'researcher', agent: 'claude' },
      { enabled: true, roleTemplateKey: 'writer', agent: 'claude' },
    ],
  },
  research_room: {
    key: 'research_room',
    label: 'Research Team',
    description: 'Lead, researcher, writer, reviewer.',
    slots: [
      { enabled: true, roleTemplateKey: 'coordinator', agent: 'claude' },
      { enabled: true, roleTemplateKey: 'researcher', agent: 'claude' },
      { enabled: true, roleTemplateKey: 'writer', agent: 'claude' },
      { enabled: true, roleTemplateKey: 'reviewer', agent: 'claude' },
    ],
  },
}

export const BUILTIN_ROOM_TEMPLATE_LIST = Object.values(BUILTIN_ROOM_TEMPLATES)

function findOverride(overrides: TemplateOverrideState[], key: string): TemplateOverrideState | undefined {
  return overrides.find((item) => item.key === key)
}

export function getBuiltinRoleTemplateState(catalog: TemplateCatalog, key: string): TemplateOverrideState {
  const override = findOverride(catalog.builtinRoleTemplateOverrides, key)
  return {
    key,
    hidden: override?.hidden ?? false,
    deleted: override?.deleted ?? false,
  }
}

export function getBuiltinRoomTemplateState(catalog: TemplateCatalog, key: string): TemplateOverrideState {
  const override = findOverride(catalog.builtinRoomTemplateOverrides, key)
  return {
    key,
    hidden: override?.hidden ?? false,
    deleted: override?.deleted ?? false,
  }
}

export function slugifyRoleTemplateKey(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return normalized || `template_${Date.now()}`
}

export function getRoomSavedTemplates(metadata: Pick<RoomMetadata, 'roleTemplates'>): RoleTemplateDraft[] {
  return Array.isArray(metadata.roleTemplates) ? metadata.roleTemplates : []
}

export function slugifyTemplateKey(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return normalized || `template_${Date.now()}`
}

export function ensureUniqueTemplateKey(baseValue: string, usedKeys: Iterable<string>): string {
  const seen = new Set(usedKeys)
  const baseKey = slugifyTemplateKey(baseValue)
  if (!seen.has(baseKey)) {
    return baseKey
  }

  let counter = 2
  let candidate = `${baseKey}_${counter}`
  while (seen.has(candidate)) {
    counter += 1
    candidate = `${baseKey}_${counter}`
  }
  return candidate
}

export function isRoomTemplateVisibleInRoomCreator(template: RoomTemplateDefinition): boolean {
  return template.visibleInRoomCreator !== false
}

export function getAvailableRoleSlotTemplates(catalog: TemplateCatalog = EMPTY_TEMPLATE_CATALOG): RoleSlotTemplate[] {
  const builtin = BUILTIN_ROLE_SLOT_TEMPLATE_LIST.filter((template) => {
    const override = getBuiltinRoleTemplateState(catalog, template.key)
    return !override.hidden && !override.deleted
  })
  return [...builtin, ...catalog.customRoleTemplates]
}

export function getAllRoleSlotTemplates(catalog: TemplateCatalog = EMPTY_TEMPLATE_CATALOG): RoleSlotTemplate[] {
  return [...BUILTIN_ROLE_SLOT_TEMPLATE_LIST, ...catalog.customRoleTemplates]
}

export function getRoleSlotTemplateByKey(
  key: string,
  catalog: TemplateCatalog = EMPTY_TEMPLATE_CATALOG
): RoleSlotTemplate | undefined {
  return getAllRoleSlotTemplates(catalog).find((template) => template.key === key)
}

export function getAllRoomTemplates(catalog: TemplateCatalog = EMPTY_TEMPLATE_CATALOG): RoomTemplateDefinition[] {
  return [...BUILTIN_ROOM_TEMPLATE_LIST, ...catalog.customRoomTemplates]
}

export function getRoomTemplatesForRoomCreator(
  catalog: TemplateCatalog = EMPTY_TEMPLATE_CATALOG
): RoomTemplateDefinition[] {
  const builtin = BUILTIN_ROOM_TEMPLATE_LIST.filter((template) => {
    const override = getBuiltinRoomTemplateState(catalog, template.key)
    return !override.hidden && !override.deleted
  })
  return [
    ...builtin,
    ...catalog.customRoomTemplates.filter((template) => isRoomTemplateVisibleInRoomCreator(template)),
  ]
}
