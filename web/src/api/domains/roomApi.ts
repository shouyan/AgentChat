import type { CreateRoomResponse, DeleteRoomResponse, RoomMessagesResponse, RoomResponse, RoomsResponse } from '@/types/api'
import { ApiClient } from '../core'

type RoomRoleInput = {
    key: string
    label: string
    description?: string
    required?: boolean
    preferredFlavor?: 'claude' | 'codex' | 'cursor' | 'gemini' | 'opencode'
    preferredModel?: string
    permissionMode?: string
    assignmentMode?: 'existing_session' | 'spawn_new' | 'unassigned'
    assignedSessionId?: string | null
    spawnConfig?: {
        machineId?: string
        flavor?: 'claude' | 'codex' | 'cursor' | 'gemini' | 'opencode'
        model?: string
        path?: string
        permissionMode?: string
        yolo?: boolean
        sessionType?: 'simple' | 'worktree'
        worktreeName?: string
    }
    sortOrder?: number
}

type RoomTaskStatus = 'pending' | 'in_progress' | 'blocked' | 'completed'

declare module '../core' {
    interface ApiClient {
        getRooms(): Promise<RoomsResponse>
        getRoom(roomId: string): Promise<RoomResponse>
        createRoom(payload: {
            name: string
            goal?: string
            templateKey?: string
            autoDispatch?: boolean
            coordinatorRoleKey?: string
            roles: RoomRoleInput[]
        }): Promise<CreateRoomResponse>
        updateRoom(roomId: string, payload: {
            name?: string
            goal?: string
            templateKey?: string
            autoDispatch?: boolean
            coordinatorRoleKey?: string
            roleTemplates?: Array<{
                key: string
                label: string
                description?: string
                roles: Array<{
                    key: string
                    label: string
                    description?: string
                    required?: boolean
                    preferredFlavor?: 'claude' | 'codex' | 'cursor' | 'gemini' | 'opencode'
                    preferredModel?: string
                    permissionMode?: string
                    sortOrder?: number
                }>
            }>
            status?: 'active' | 'archived'
        }): Promise<RoomResponse>
        createRoomRole(roomId: string, payload: RoomRoleInput): Promise<RoomResponse>
        getRoomMessages(roomId: string, options: { beforeSeq?: number | null; limit?: number }): Promise<RoomMessagesResponse>
        sendRoomMessage(roomId: string, payload: {
            text: string
            targetRoleKey?: string
            targetSessionId?: string
            forwardToAgent?: boolean
        }): Promise<void>
        assignRoomRole(roomId: string, roleId: string, sessionId: string): Promise<RoomResponse>
        spawnRoomRole(roomId: string, roleId: string, payload: {
            machineId: string
            directory: string
            agent?: 'claude' | 'codex' | 'cursor' | 'gemini' | 'opencode'
            model?: string
            yolo?: boolean
            sessionType?: 'simple' | 'worktree'
            worktreeName?: string
        }): Promise<{ type: 'success'; sessionId: string; room: RoomResponse['room'] }>
        clearRoomRoleAssignment(roomId: string, roleId: string): Promise<RoomResponse>
        createRoomTask(roomId: string, payload: {
            title: string
            description?: string
            status?: RoomTaskStatus
            assigneeRoleKey?: string
            assigneeSessionId?: string | null
        }): Promise<RoomResponse>
        updateRoomTask(roomId: string, taskId: string, payload: {
            title?: string
            description?: string | null
            status?: RoomTaskStatus
            assigneeRoleKey?: string | null
            assigneeSessionId?: string | null
        }): Promise<RoomResponse>
        assignRoomTask(roomId: string, taskId: string, payload: {
            assigneeRoleKey: string | null
            note?: string
            actorRoleKey?: string
        }): Promise<RoomResponse>
        claimRoomTask(roomId: string, taskId: string, payload: {
            roleKey?: string
            note?: string
        }): Promise<RoomResponse>
        blockRoomTask(roomId: string, taskId: string, payload: {
            roleKey?: string
            reason: string
        }): Promise<RoomResponse>
        handoffRoomTask(roomId: string, taskId: string, payload: {
            fromRoleKey?: string
            toRoleKey: string
            note?: string
        }): Promise<RoomResponse>
        completeRoomTask(roomId: string, taskId: string, payload: {
            roleKey?: string
            summary?: string
        }): Promise<RoomResponse>
        deleteRoom(roomId: string): Promise<DeleteRoomResponse>
    }
}

function buildMessagePageUrl(roomId: string, options: { beforeSeq?: number | null; limit?: number }): string {
    const params = new URLSearchParams()
    if (options.beforeSeq !== undefined && options.beforeSeq !== null) {
        params.set('beforeSeq', `${options.beforeSeq}`)
    }
    if (options.limit !== undefined && options.limit !== null) {
        params.set('limit', `${options.limit}`)
    }
    const qs = params.toString()
    return `/api/rooms/${encodeURIComponent(roomId)}/messages${qs ? `?${qs}` : ''}`
}

Object.assign(ApiClient.prototype, {
    async getRooms(this: ApiClient): Promise<RoomsResponse> {
        return await this.request<RoomsResponse>('/api/rooms')
    },

    async getRoom(this: ApiClient, roomId: string): Promise<RoomResponse> {
        return await this.request<RoomResponse>(`/api/rooms/${encodeURIComponent(roomId)}`)
    },

    async createRoom(this: ApiClient, payload: {
        name: string
        goal?: string
        templateKey?: string
        autoDispatch?: boolean
        coordinatorRoleKey?: string
        roles: RoomRoleInput[]
    }): Promise<CreateRoomResponse> {
        return await this.request<CreateRoomResponse>('/api/rooms', {
            method: 'POST',
            body: JSON.stringify(payload),
        })
    },

    async updateRoom(this: ApiClient, roomId: string, payload: {
        name?: string
        goal?: string
        templateKey?: string
        autoDispatch?: boolean
        coordinatorRoleKey?: string
        roleTemplates?: Array<{
            key: string
            label: string
            description?: string
            roles: Array<{
                key: string
                label: string
                description?: string
                required?: boolean
                preferredFlavor?: 'claude' | 'codex' | 'cursor' | 'gemini' | 'opencode'
                preferredModel?: string
                permissionMode?: string
                sortOrder?: number
            }>
        }>
        status?: 'active' | 'archived'
    }): Promise<RoomResponse> {
        return await this.request<RoomResponse>(`/api/rooms/${encodeURIComponent(roomId)}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
        })
    },

    async createRoomRole(this: ApiClient, roomId: string, payload: RoomRoleInput): Promise<RoomResponse> {
        return await this.request<RoomResponse>(`/api/rooms/${encodeURIComponent(roomId)}/roles`, {
            method: 'POST',
            body: JSON.stringify(payload),
        })
    },

    async getRoomMessages(this: ApiClient, roomId: string, options: { beforeSeq?: number | null; limit?: number }): Promise<RoomMessagesResponse> {
        return await this.request<RoomMessagesResponse>(buildMessagePageUrl(roomId, options))
    },

    async sendRoomMessage(this: ApiClient, roomId: string, payload: {
        text: string
        targetRoleKey?: string
        targetSessionId?: string
        forwardToAgent?: boolean
    }): Promise<void> {
        await this.request(`/api/rooms/${encodeURIComponent(roomId)}/messages`, {
            method: 'POST',
            body: JSON.stringify(payload),
        })
    },

    async assignRoomRole(this: ApiClient, roomId: string, roleId: string, sessionId: string): Promise<RoomResponse> {
        return await this.request<RoomResponse>(`/api/rooms/${encodeURIComponent(roomId)}/roles/${encodeURIComponent(roleId)}/assign-session`, {
            method: 'POST',
            body: JSON.stringify({ sessionId }),
        })
    },

    async spawnRoomRole(this: ApiClient, roomId: string, roleId: string, payload: {
        machineId: string
        directory: string
        agent?: 'claude' | 'codex' | 'cursor' | 'gemini' | 'opencode'
        model?: string
        yolo?: boolean
        sessionType?: 'simple' | 'worktree'
        worktreeName?: string
    }): Promise<{ type: 'success'; sessionId: string; room: RoomResponse['room'] }> {
        return await this.request<{ type: 'success'; sessionId: string; room: RoomResponse['room'] }>(
            `/api/rooms/${encodeURIComponent(roomId)}/roles/${encodeURIComponent(roleId)}/spawn`,
            {
                method: 'POST',
                body: JSON.stringify(payload),
            }
        )
    },

    async clearRoomRoleAssignment(this: ApiClient, roomId: string, roleId: string): Promise<RoomResponse> {
        return await this.request<RoomResponse>(`/api/rooms/${encodeURIComponent(roomId)}/roles/${encodeURIComponent(roleId)}/assignment`, {
            method: 'DELETE',
        })
    },

    async createRoomTask(this: ApiClient, roomId: string, payload: {
        title: string
        description?: string
        status?: RoomTaskStatus
        assigneeRoleKey?: string
        assigneeSessionId?: string | null
    }): Promise<RoomResponse> {
        return await this.request<RoomResponse>(`/api/rooms/${encodeURIComponent(roomId)}/tasks`, {
            method: 'POST',
            body: JSON.stringify(payload),
        })
    },

    async updateRoomTask(this: ApiClient, roomId: string, taskId: string, payload: {
        title?: string
        description?: string | null
        status?: RoomTaskStatus
        assigneeRoleKey?: string | null
        assigneeSessionId?: string | null
    }): Promise<RoomResponse> {
        return await this.request<RoomResponse>(`/api/rooms/${encodeURIComponent(roomId)}/tasks/${encodeURIComponent(taskId)}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
        })
    },

    async assignRoomTask(this: ApiClient, roomId: string, taskId: string, payload: {
        assigneeRoleKey: string | null
        note?: string
        actorRoleKey?: string
    }): Promise<RoomResponse> {
        return await this.request<RoomResponse>(`/api/rooms/${encodeURIComponent(roomId)}/tasks/${encodeURIComponent(taskId)}/assign`, {
            method: 'POST',
            body: JSON.stringify(payload),
        })
    },

    async claimRoomTask(this: ApiClient, roomId: string, taskId: string, payload: {
        roleKey?: string
        note?: string
    }): Promise<RoomResponse> {
        return await this.request<RoomResponse>(`/api/rooms/${encodeURIComponent(roomId)}/tasks/${encodeURIComponent(taskId)}/claim`, {
            method: 'POST',
            body: JSON.stringify(payload),
        })
    },

    async blockRoomTask(this: ApiClient, roomId: string, taskId: string, payload: {
        roleKey?: string
        reason: string
    }): Promise<RoomResponse> {
        return await this.request<RoomResponse>(`/api/rooms/${encodeURIComponent(roomId)}/tasks/${encodeURIComponent(taskId)}/block`, {
            method: 'POST',
            body: JSON.stringify(payload),
        })
    },

    async handoffRoomTask(this: ApiClient, roomId: string, taskId: string, payload: {
        fromRoleKey?: string
        toRoleKey: string
        note?: string
    }): Promise<RoomResponse> {
        return await this.request<RoomResponse>(`/api/rooms/${encodeURIComponent(roomId)}/tasks/${encodeURIComponent(taskId)}/handoff`, {
            method: 'POST',
            body: JSON.stringify(payload),
        })
    },

    async completeRoomTask(this: ApiClient, roomId: string, taskId: string, payload: {
        roleKey?: string
        summary?: string
    }): Promise<RoomResponse> {
        return await this.request<RoomResponse>(`/api/rooms/${encodeURIComponent(roomId)}/tasks/${encodeURIComponent(taskId)}/complete`, {
            method: 'POST',
            body: JSON.stringify(payload),
        })
    },

    async deleteRoom(this: ApiClient, roomId: string): Promise<DeleteRoomResponse> {
        return await this.request<DeleteRoomResponse>(`/api/rooms/${encodeURIComponent(roomId)}`, {
            method: 'DELETE',
        })
    },
})
