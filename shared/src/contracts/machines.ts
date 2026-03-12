import { z } from 'zod'
import {
    MachineProviderHealthMapSchema,
    MachineSchema,
} from '../machines'

export const MachinesResponseSchema = z.object({
    machines: z.array(MachineSchema)
})
export type MachinesResponse = z.infer<typeof MachinesResponseSchema>

export const MachinePathsExistsResponseSchema = z.object({
    exists: z.record(z.string(), z.boolean())
})
export type MachinePathsExistsResponse = z.infer<typeof MachinePathsExistsResponseSchema>

export const MachineDirectoryEntrySchema = z.object({
    name: z.string(),
    path: z.string(),
    type: z.enum(['file', 'directory', 'other']),
    size: z.number().optional(),
    modified: z.number().optional()
})
export type MachineDirectoryEntry = z.infer<typeof MachineDirectoryEntrySchema>

export const MachineDirectoryResponseSchema = z.object({
    success: z.boolean(),
    path: z.string().optional(),
    parentPath: z.string().nullable().optional(),
    entries: z.array(MachineDirectoryEntrySchema).optional(),
    error: z.string().optional()
})
export type MachineDirectoryResponse = z.infer<typeof MachineDirectoryResponseSchema>

export const MachineActionResponseSchema = z.object({
    ok: z.literal(true),
    message: z.string()
})
export type MachineActionResponse = z.infer<typeof MachineActionResponseSchema>

export const MachineCleanupResponseSchema = z.object({
    deletedSessionIds: z.array(z.string()),
    keptSessionIds: z.array(z.string()),
    preservedInactiveSessionIds: z.array(z.string()),
    deadProcessSessionIds: z.array(z.string()),
    aliveProcessSessionIds: z.array(z.string())
})
export type MachineCleanupResponse = z.infer<typeof MachineCleanupResponseSchema>

export const ProviderHealthResponseSchema = z.object({
    success: z.boolean(),
    checkedAt: z.number().optional(),
    providers: MachineProviderHealthMapSchema.optional(),
    error: z.string().optional()
})
export type ProviderHealthResponse = z.infer<typeof ProviderHealthResponseSchema>
