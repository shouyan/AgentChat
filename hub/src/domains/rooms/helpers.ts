import type { z } from 'zod'
import type { CreateRoomBodySchema } from '@agentchat/protocol/contracts/rooms'

export function normalizeCreateRoomRoles(input: z.infer<typeof CreateRoomBodySchema>) {
    return input.roles.map((role, index) => ({
        ...role,
        assignmentMode: role.assignmentMode ?? 'unassigned',
        sortOrder: role.sortOrder ?? index,
    }))
}
