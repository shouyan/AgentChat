import { z } from 'zod'

export const MachineProviderFlavorSchema = z.enum(['claude', 'codex', 'gemini', 'cursor', 'opencode'])
export type MachineProviderFlavor = z.infer<typeof MachineProviderFlavorSchema>

export const MachineProviderStatusSchema = z.object({
    configured: z.boolean(),
    authMode: z.string().optional(),
    baseUrl: z.string().optional(),
    configPath: z.string().optional(),
    note: z.string().optional()
})
export type MachineProviderStatus = z.infer<typeof MachineProviderStatusSchema>

export const MachineProviderStatusMapSchema = z.object({
    claude: MachineProviderStatusSchema.optional(),
    codex: MachineProviderStatusSchema.optional(),
    gemini: MachineProviderStatusSchema.optional(),
    cursor: MachineProviderStatusSchema.optional(),
    opencode: MachineProviderStatusSchema.optional()
})
export type MachineProviderStatusMap = z.infer<typeof MachineProviderStatusMapSchema>

export const MachineProviderHealthProbeSchema = z.object({
    url: z.string(),
    ok: z.boolean(),
    statusCode: z.number().optional(),
    error: z.string().optional()
})
export type MachineProviderHealthProbe = z.infer<typeof MachineProviderHealthProbeSchema>

export const MachineProviderHealthStatusSchema = MachineProviderStatusSchema.extend({
    checkedAt: z.number(),
    status: z.enum(['ready', 'needs-auth', 'not-configured', 'unreachable', 'warning']),
    summary: z.string(),
    detail: z.string(),
    probe: MachineProviderHealthProbeSchema.optional()
})
export type MachineProviderHealthStatus = z.infer<typeof MachineProviderHealthStatusSchema>

export const MachineProviderHealthMapSchema = z.object({
    claude: MachineProviderHealthStatusSchema.optional(),
    codex: MachineProviderHealthStatusSchema.optional(),
    gemini: MachineProviderHealthStatusSchema.optional(),
    cursor: MachineProviderHealthStatusSchema.optional(),
    opencode: MachineProviderHealthStatusSchema.optional()
})
export type MachineProviderHealthMap = z.infer<typeof MachineProviderHealthMapSchema>

export const MachineMetadataSchema = z.object({
    host: z.string(),
    platform: z.string(),
    agentchatCliVersion: z.string(),
    displayName: z.string().optional(),
    homeDir: z.string(),
    agentchatHomeDir: z.string(),
    agentchatLibDir: z.string(),
    providers: MachineProviderStatusMapSchema.optional()
})
export type MachineMetadata = z.infer<typeof MachineMetadataSchema>

export const RunnerStateSchema = z.object({
    status: z.union([z.enum(['running', 'shutting-down']), z.string()]).optional(),
    pid: z.number().optional(),
    httpPort: z.number().optional(),
    startedAt: z.number().optional(),
    shutdownRequestedAt: z.number().optional(),
    shutdownSource: z.union([z.enum(['mobile-app', 'cli', 'os-signal', 'unknown']), z.string()]).optional(),
    lastSpawnError: z.object({
        message: z.string(),
        pid: z.number().optional(),
        exitCode: z.number().nullable().optional(),
        signal: z.string().nullable().optional(),
        at: z.number()
    }).nullable().optional()
})
export type RunnerState = z.infer<typeof RunnerStateSchema>

export const MachineSchema = z.object({
    id: z.string(),
    active: z.boolean(),
    metadata: MachineMetadataSchema.nullable(),
    runnerState: RunnerStateSchema.nullable().optional()
})
export type Machine = z.infer<typeof MachineSchema>
