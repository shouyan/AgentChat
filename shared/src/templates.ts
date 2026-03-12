import { z } from 'zod'

export const TemplateAgentFlavorSchema = z.enum(['claude', 'codex', 'cursor', 'gemini', 'opencode'])
export type TemplateAgentFlavor = z.infer<typeof TemplateAgentFlavorSchema>

export const RoleSlotTemplateSchema = z.object({
    key: z.string().min(1),
    label: z.string().min(1),
    description: z.string().optional(),
    roleKey: z.string().min(1),
    roleLabel: z.string().min(1),
    preferredFlavor: TemplateAgentFlavorSchema.optional(),
})
export type RoleSlotTemplate = z.infer<typeof RoleSlotTemplateSchema>

export const RoomTemplateSlotSchema = z.object({
    enabled: z.boolean().optional(),
    roleTemplateKey: z.string().min(1),
    agent: TemplateAgentFlavorSchema.optional(),
    model: z.string().optional(),
    mentionKey: z.string().optional(),
})
export type RoomTemplateSlot = z.infer<typeof RoomTemplateSlotSchema>

export const RoomTemplateDefinitionSchema = z.object({
    key: z.string().min(1),
    label: z.string().min(1),
    description: z.string().optional(),
    visibleInRoomCreator: z.boolean().optional(),
    slots: z.array(RoomTemplateSlotSchema).default([]),
})
export type RoomTemplateDefinition = z.infer<typeof RoomTemplateDefinitionSchema>

export const TemplateOverrideStateSchema = z.object({
    key: z.string().min(1),
    hidden: z.boolean(),
    deleted: z.boolean(),
})
export type TemplateOverrideState = z.infer<typeof TemplateOverrideStateSchema>

export const BuiltinTemplateOverridePatchSchema = z.object({
    hidden: z.boolean().optional(),
    deleted: z.boolean().optional(),
})
export type BuiltinTemplateOverridePatch = z.infer<typeof BuiltinTemplateOverridePatchSchema>

export const TemplateCatalogSchema = z.object({
    customRoleTemplates: z.array(RoleSlotTemplateSchema),
    customRoomTemplates: z.array(RoomTemplateDefinitionSchema),
    builtinRoleTemplateOverrides: z.array(TemplateOverrideStateSchema),
    builtinRoomTemplateOverrides: z.array(TemplateOverrideStateSchema),
})
export type TemplateCatalog = z.infer<typeof TemplateCatalogSchema>
