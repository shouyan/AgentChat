import { z } from 'zod'
import { AttachmentMetadataSchema, DecryptedMessageSchema, ModelModeSchema, PermissionModeSchema, SessionSchema, WorktreeMetadataSchema } from '../schemas'

const SessionSummaryMetadataSchema = z.object({
    name: z.string().optional(),
    path: z.string(),
    model: z.string().optional(),
    machineId: z.string().optional(),
    summary: z.object({ text: z.string() }).optional(),
    flavor: z.string().nullish(),
    worktree: WorktreeMetadataSchema.optional(),
    roomSpawned: z.boolean().optional(),
    roomId: z.string().optional()
})

export const SessionSummarySchema = z.object({
    id: z.string(),
    active: z.boolean(),
    thinking: z.boolean(),
    activeAt: z.number(),
    updatedAt: z.number(),
    metadata: SessionSummaryMetadataSchema.nullable(),
    todoProgress: z.object({
        completed: z.number(),
        total: z.number(),
    }).nullable(),
    pendingRequestsCount: z.number(),
    modelMode: ModelModeSchema.optional()
})
export type SessionSummaryContract = z.infer<typeof SessionSummarySchema>

export const MessagePageSchema = z.object({
    limit: z.number().int(),
    beforeSeq: z.number().nullable(),
    nextBeforeSeq: z.number().nullable(),
    hasMore: z.boolean()
})
export type MessagePage = z.infer<typeof MessagePageSchema>

export const SessionsResponseSchema = z.object({
    sessions: z.array(SessionSummarySchema)
})
export type SessionsResponse = z.infer<typeof SessionsResponseSchema>

export const SessionResponseSchema = z.object({
    session: SessionSchema
})
export type SessionResponse = z.infer<typeof SessionResponseSchema>

export const MessagesResponseSchema = z.object({
    messages: z.array(DecryptedMessageSchema),
    page: MessagePageSchema
})
export type MessagesResponse = z.infer<typeof MessagesResponseSchema>

export const MessagesQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(200).optional(),
    beforeSeq: z.coerce.number().int().min(1).optional()
})
export type MessagesQuery = z.infer<typeof MessagesQuerySchema>

export const SendSessionMessageBodySchema = z.object({
    text: z.string(),
    localId: z.string().min(1).optional(),
    attachments: z.array(AttachmentMetadataSchema).optional()
})
export type SendSessionMessageBody = z.infer<typeof SendSessionMessageBodySchema>

export const ResumeSessionSuccessResponseSchema = z.object({
    type: z.literal('success'),
    sessionId: z.string()
})
export type ResumeSessionSuccessResponse = z.infer<typeof ResumeSessionSuccessResponseSchema>

export const RenameSessionBodySchema = z.object({
    name: z.string().min(1).max(255)
})
export type RenameSessionBody = z.infer<typeof RenameSessionBodySchema>

export const PermissionModeBodySchema = z.object({
    mode: PermissionModeSchema
})
export type PermissionModeBody = z.infer<typeof PermissionModeBodySchema>

export const SessionModelBodySchema = z.object({
    model: z.string().trim().min(1)
})
export type SessionModelBody = z.infer<typeof SessionModelBodySchema>
