import { z } from 'zod'
import {
    RoomMessageSchema,
    RoomMetadataSchema,
    RoomRoleSchema,
    RoomRoleSpawnConfigSchema,
    RoomRoleTemplateSchema,
    RoomSchema,
    RoomTaskSchema,
} from '../schemas'

export const RoomPageSchema = z.object({
    limit: z.number().int(),
    beforeSeq: z.number().nullable(),
    nextBeforeSeq: z.number().nullable(),
    hasMore: z.boolean()
})
export type RoomPage = z.infer<typeof RoomPageSchema>

export const CreateRoomRoleInputSchema = RoomRoleSchema.pick({
    key: true,
    label: true,
    description: true,
    required: true,
    preferredFlavor: true,
    preferredModel: true,
    permissionMode: true,
    assignmentMode: true,
    assignedSessionId: true,
    spawnConfig: true,
    sortOrder: true,
}).partial({
    assignmentMode: true,
}).extend({
    key: z.string().min(1),
    label: z.string().min(1),
})
export type CreateRoomRoleInput = z.infer<typeof CreateRoomRoleInputSchema>

export const CreateRoomBodySchema = z.object({
    name: z.string().min(1).max(255),
    goal: z.string().optional(),
    templateKey: z.string().optional(),
    autoDispatch: z.boolean().optional(),
    coordinatorRoleKey: z.string().optional(),
    roles: z.array(CreateRoomRoleInputSchema).default([]),
})
export type CreateRoomBody = z.infer<typeof CreateRoomBodySchema>

export const UpdateRoomBodySchema = RoomMetadataSchema.pick({
    name: true,
    goal: true,
    templateKey: true,
    autoDispatch: true,
    coordinatorRoleKey: true,
    roleTemplates: true,
    status: true,
}).partial()
export type UpdateRoomBody = z.infer<typeof UpdateRoomBodySchema>

export const RoomMessageQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(200).optional(),
    beforeSeq: z.coerce.number().int().min(1).optional(),
})
export type RoomMessageQuery = z.infer<typeof RoomMessageQuerySchema>

export const SendRoomMessageBodySchema = z.object({
    text: z.string().min(1),
    targetRoleKey: z.string().optional(),
    targetSessionId: z.string().optional(),
    forwardToAgent: z.boolean().optional(),
})
export type SendRoomMessageBody = z.infer<typeof SendRoomMessageBodySchema>

export const AssignRoomRoleBodySchema = z.object({
    sessionId: z.string().min(1),
})
export type AssignRoomRoleBody = z.infer<typeof AssignRoomRoleBodySchema>

export const SpawnRoomRoleBodySchema = z.object({
    machineId: z.string().min(1),
    directory: z.string().min(1),
    agent: RoomRoleSpawnConfigSchema.shape.flavor.optional(),
    model: z.string().optional(),
    yolo: z.boolean().optional(),
    sessionType: RoomRoleSpawnConfigSchema.shape.sessionType.optional(),
    worktreeName: z.string().optional(),
})
export type SpawnRoomRoleBody = z.infer<typeof SpawnRoomRoleBodySchema>

export const CreateRoomTaskBodySchema = z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    status: RoomTaskSchema.shape.status.optional(),
    assigneeRoleKey: z.string().optional(),
    assigneeSessionId: z.string().nullable().optional(),
})
export type CreateRoomTaskBody = z.infer<typeof CreateRoomTaskBodySchema>

export const UpdateRoomTaskBodySchema = z.object({
    title: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    status: RoomTaskSchema.shape.status.optional(),
    assigneeRoleKey: z.string().nullable().optional(),
    assigneeSessionId: z.string().nullable().optional(),
})
export type UpdateRoomTaskBody = z.infer<typeof UpdateRoomTaskBodySchema>

export const AssignRoomTaskBodySchema = z.object({
    assigneeRoleKey: z.string().nullable(),
    note: z.string().optional(),
    actorRoleKey: z.string().optional(),
})
export type AssignRoomTaskBody = z.infer<typeof AssignRoomTaskBodySchema>

export const ClaimRoomTaskBodySchema = z.object({
    roleKey: z.string().optional(),
    note: z.string().optional(),
})
export type ClaimRoomTaskBody = z.infer<typeof ClaimRoomTaskBodySchema>

export const BlockRoomTaskBodySchema = z.object({
    roleKey: z.string().optional(),
    reason: z.string().min(1),
})
export type BlockRoomTaskBody = z.infer<typeof BlockRoomTaskBodySchema>

export const HandoffRoomTaskBodySchema = z.object({
    fromRoleKey: z.string().optional(),
    toRoleKey: z.string().min(1),
    note: z.string().optional(),
})
export type HandoffRoomTaskBody = z.infer<typeof HandoffRoomTaskBodySchema>

export const CompleteRoomTaskBodySchema = z.object({
    roleKey: z.string().optional(),
    summary: z.string().optional(),
})
export type CompleteRoomTaskBody = z.infer<typeof CompleteRoomTaskBodySchema>

export const RoomsResponseSchema = z.object({
    rooms: z.array(RoomSchema)
})
export type RoomsResponse = z.infer<typeof RoomsResponseSchema>

export const RoomResponseSchema = z.object({
    room: RoomSchema
})
export type RoomResponse = z.infer<typeof RoomResponseSchema>

export const RoomMessagesResponseSchema = z.object({
    messages: z.array(RoomMessageSchema),
    page: RoomPageSchema
})
export type RoomMessagesResponse = z.infer<typeof RoomMessagesResponseSchema>

export const CreateRoomResponseSchema = z.object({
    room: RoomSchema,
    spawnedSessionIds: z.array(z.string()).optional()
})
export type CreateRoomResponse = z.infer<typeof CreateRoomResponseSchema>

export const DeleteRoomResponseSchema = z.object({
    ok: z.literal(true),
    deletedSessionIds: z.array(z.string())
})
export type DeleteRoomResponse = z.infer<typeof DeleteRoomResponseSchema>

export const SpawnRoomRoleResponseSchema = z.object({
    type: z.literal('success'),
    sessionId: z.string(),
    room: RoomSchema
})
export type SpawnRoomRoleResponse = z.infer<typeof SpawnRoomRoleResponseSchema>
