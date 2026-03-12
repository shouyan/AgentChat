import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { RoomResponse, RoomRole, SessionSummary } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'
import { clearMessageWindow } from '@/lib/message-window-store'

function syncRoom(queryClient: ReturnType<typeof useQueryClient>, room: RoomResponse['room']) {
  queryClient.setQueryData(queryKeys.room(room.id), { room })
  queryClient.setQueryData(queryKeys.rooms, (previous: { rooms: RoomResponse['room'][] } | undefined) => {
    if (!previous) return previous
    const nextRooms = previous.rooms.slice()
    const index = nextRooms.findIndex((item) => item.id === room.id)
    if (index >= 0) nextRooms[index] = room
    else nextRooms.unshift(room)
    return { rooms: nextRooms }
  })
}

export function useRoomActions(api: ApiClient | null, roomId: string | null) {
  const queryClient = useQueryClient()

  const sendMutation = useMutation({
    mutationFn: async (payload: { text: string; targetRoleKey?: string; targetSessionId?: string; forwardToAgent?: boolean }) => {
      if (!api || !roomId) throw new Error('API unavailable')
      await api.sendRoomMessage(roomId, payload)
    },
    onSuccess: () => {
      if (!roomId) return
      void queryClient.invalidateQueries({ queryKey: queryKeys.roomMessages(roomId) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.room(roomId) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.rooms })
    }
  })

  const updateRoomMutation = useMutation({
    mutationFn: async (payload: {
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
    }) => {
      if (!api || !roomId) throw new Error('API unavailable')
      return await api.updateRoom(roomId, payload)
    },
    onSuccess: (result) => {
      syncRoom(queryClient, result.room)
    }
  })

  const deleteRoomMutation = useMutation({
    mutationFn: async () => {
      if (!api || !roomId) throw new Error('API unavailable')
      return await api.deleteRoom(roomId)
    },
    onSuccess: async (result) => {
      if (!roomId) return
      queryClient.removeQueries({ queryKey: queryKeys.room(roomId) })
      queryClient.removeQueries({ queryKey: queryKeys.roomMessages(roomId) })
      queryClient.setQueryData(queryKeys.rooms, (previous: { rooms: RoomResponse['room'][] } | undefined) => {
        if (!previous) return previous
        return { rooms: previous.rooms.filter((room) => room.id !== roomId) }
      })
      for (const sessionId of result.deletedSessionIds) {
        queryClient.removeQueries({ queryKey: queryKeys.session(sessionId) })
        clearMessageWindow(sessionId)
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
      await queryClient.invalidateQueries({ queryKey: queryKeys.rooms })
    }
  })

  const assignMutation = useMutation({
    mutationFn: async (payload: { roleId: string; sessionId: string }) => {
      if (!api || !roomId) throw new Error('API unavailable')
      return await api.assignRoomRole(roomId, payload.roleId, payload.sessionId)
    },
    onSuccess: (result) => {
      syncRoom(queryClient, result.room)
    }
  })

  const addRoleMutation = useMutation({
    mutationFn: async (payload: {
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
    }) => {
      if (!api || !roomId) throw new Error('API unavailable')
      return await api.createRoomRole(roomId, payload)
    },
    onSuccess: (result) => {
      syncRoom(queryClient, result.room)
    }
  })

  const clearAssignmentMutation = useMutation({
    mutationFn: async (roleId: string) => {
      if (!api || !roomId) throw new Error('API unavailable')
      return await api.clearRoomRoleAssignment(roomId, roleId)
    },
    onSuccess: (result) => {
      syncRoom(queryClient, result.room)
    }
  })

  const offlineRoleSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      if (!api) throw new Error('API unavailable')
      await api.archiveSession(sessionId)
      return sessionId
    },
    onSuccess: () => {
      if (!roomId) return
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
      void queryClient.invalidateQueries({ queryKey: queryKeys.room(roomId) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.rooms })
    }
  })

  const offlineRoomMutation = useMutation({
    mutationFn: async (payload: { roles: RoomRole[]; sessions: SessionSummary[] }) => {
      if (!api || !roomId) throw new Error('API unavailable')
      for (const role of payload.roles) {
        if (!role.assignedSessionId) continue
        const session = payload.sessions.find((item) => item.id === role.assignedSessionId)
        if (!session?.active) continue
        await api.archiveSession(role.assignedSessionId)
      }
      return await api.updateRoom(roomId, { status: 'archived' })
    },
    onSuccess: (result) => {
      syncRoom(queryClient, result.room)
      if (!roomId) return
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
      void queryClient.invalidateQueries({ queryKey: queryKeys.room(roomId) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.rooms })
    }
  })

  const wakeRoomMutation = useMutation({
    mutationFn: async (payload: { roles: RoomRole[]; sessions: SessionSummary[] }) => {
      if (!api || !roomId) throw new Error('API unavailable')
      for (const role of payload.roles) {
        const spawnConfig = role.spawnConfig
        const assignedSessionId = role.assignedSessionId ?? null
        const session = assignedSessionId
          ? payload.sessions.find((item) => item.id === assignedSessionId)
          : undefined

        if (session?.active) continue

        if (assignedSessionId) {
          try {
            const resumedSessionId = await api.resumeSession(assignedSessionId)
            if (resumedSessionId && resumedSessionId !== assignedSessionId) {
              await api.assignRoomRole(roomId, role.id, resumedSessionId)
            }
            continue
          } catch (error) {
            if (!spawnConfig?.machineId || !spawnConfig?.path) {
              throw error
            }
          }
        }

        if (!spawnConfig?.machineId || !spawnConfig?.path) {
          continue
        }

        await api.spawnRoomRole(roomId, role.id, {
          machineId: spawnConfig.machineId,
          directory: spawnConfig.path,
          agent: spawnConfig.flavor ?? role.preferredFlavor ?? undefined,
          model: spawnConfig.model ?? role.preferredModel ?? undefined,
          yolo: spawnConfig.yolo,
          sessionType: spawnConfig.sessionType,
          worktreeName: spawnConfig.worktreeName,
        })
      }
      return await api.updateRoom(roomId, { status: 'active' })
    },
    onSuccess: (result) => {
      syncRoom(queryClient, result.room)
      if (!roomId) return
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
      void queryClient.invalidateQueries({ queryKey: queryKeys.room(roomId) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.rooms })
    }
  })

  const spawnRoleMutation = useMutation({
    mutationFn: async (payload: {
      roleId: string
      machineId: string
      directory: string
      agent?: 'claude' | 'codex' | 'cursor' | 'gemini' | 'opencode'
      model?: string
      yolo?: boolean
      sessionType?: 'simple' | 'worktree'
      worktreeName?: string
    }) => {
      if (!api || !roomId) throw new Error('API unavailable')
      const { roleId, ...rest } = payload
      return await api.spawnRoomRole(roomId, roleId, rest)
    },
    onSuccess: (result) => {
      syncRoom(queryClient, result.room)
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
    }
  })

  const createTaskMutation = useMutation({
    mutationFn: async (payload: {
      title: string
      description?: string
      status?: 'pending' | 'in_progress' | 'blocked' | 'completed'
      assigneeRoleKey?: string
      assigneeSessionId?: string | null
    }) => {
      if (!api || !roomId) throw new Error('API unavailable')
      return await api.createRoomTask(roomId, payload)
    },
    onSuccess: (result) => {
      syncRoom(queryClient, result.room)
    }
  })

  const updateTaskMutation = useMutation({
    mutationFn: async (payload: {
      taskId: string
      title?: string
      description?: string | null
      status?: 'pending' | 'in_progress' | 'blocked' | 'completed'
      assigneeRoleKey?: string | null
      assigneeSessionId?: string | null
    }) => {
      if (!api || !roomId) throw new Error('API unavailable')
      const { taskId, ...rest } = payload
      return await api.updateRoomTask(roomId, taskId, rest)
    },
    onSuccess: (result) => {
      syncRoom(queryClient, result.room)
    }
  })

  const assignTaskMutation = useMutation({
    mutationFn: async (payload: {
      taskId: string
      assigneeRoleKey: string | null
      note?: string
      actorRoleKey?: string
    }) => {
      if (!api || !roomId) throw new Error('API unavailable')
      const { taskId, ...rest } = payload
      return await api.assignRoomTask(roomId, taskId, rest)
    },
    onSuccess: (result) => {
      syncRoom(queryClient, result.room)
      if (!roomId) return
      void queryClient.invalidateQueries({ queryKey: queryKeys.roomMessages(roomId) })
    }
  })

  const claimTaskMutation = useMutation({
    mutationFn: async (payload: {
      taskId: string
      roleKey?: string
      note?: string
    }) => {
      if (!api || !roomId) throw new Error('API unavailable')
      const { taskId, ...rest } = payload
      return await api.claimRoomTask(roomId, taskId, rest)
    },
    onSuccess: (result) => {
      syncRoom(queryClient, result.room)
      if (!roomId) return
      void queryClient.invalidateQueries({ queryKey: queryKeys.roomMessages(roomId) })
    }
  })

  const blockTaskMutation = useMutation({
    mutationFn: async (payload: {
      taskId: string
      roleKey?: string
      reason: string
    }) => {
      if (!api || !roomId) throw new Error('API unavailable')
      const { taskId, ...rest } = payload
      return await api.blockRoomTask(roomId, taskId, rest)
    },
    onSuccess: (result) => {
      syncRoom(queryClient, result.room)
      if (!roomId) return
      void queryClient.invalidateQueries({ queryKey: queryKeys.roomMessages(roomId) })
    }
  })

  const handoffTaskMutation = useMutation({
    mutationFn: async (payload: {
      taskId: string
      fromRoleKey?: string
      toRoleKey: string
      note?: string
    }) => {
      if (!api || !roomId) throw new Error('API unavailable')
      const { taskId, ...rest } = payload
      return await api.handoffRoomTask(roomId, taskId, rest)
    },
    onSuccess: (result) => {
      syncRoom(queryClient, result.room)
      if (!roomId) return
      void queryClient.invalidateQueries({ queryKey: queryKeys.roomMessages(roomId) })
    }
  })

  const completeTaskMutation = useMutation({
    mutationFn: async (payload: {
      taskId: string
      roleKey?: string
      summary?: string
    }) => {
      if (!api || !roomId) throw new Error('API unavailable')
      const { taskId, ...rest } = payload
      return await api.completeRoomTask(roomId, taskId, rest)
    },
    onSuccess: (result) => {
      syncRoom(queryClient, result.room)
      if (!roomId) return
      void queryClient.invalidateQueries({ queryKey: queryKeys.roomMessages(roomId) })
    }
  })

  return {
    updateRoom: updateRoomMutation.mutateAsync,
    deleteRoom: deleteRoomMutation.mutateAsync,
    sendRoomMessage: sendMutation.mutateAsync,
    addRole: addRoleMutation.mutateAsync,
    assignRole: assignMutation.mutateAsync,
    clearRoleAssignment: clearAssignmentMutation.mutateAsync,
    offlineRoleSession: offlineRoleSessionMutation.mutateAsync,
    offlineRoom: offlineRoomMutation.mutateAsync,
    wakeRoom: wakeRoomMutation.mutateAsync,
    spawnRole: spawnRoleMutation.mutateAsync,
    createTask: createTaskMutation.mutateAsync,
    updateTask: updateTaskMutation.mutateAsync,
    assignTask: assignTaskMutation.mutateAsync,
    claimTask: claimTaskMutation.mutateAsync,
    blockTask: blockTaskMutation.mutateAsync,
    handoffTask: handoffTaskMutation.mutateAsync,
    completeTask: completeTaskMutation.mutateAsync,
    isUpdatingRoom: updateRoomMutation.isPending,
    isDeletingRoom: deleteRoomMutation.isPending,
    isSendingMessage: sendMutation.isPending,
    isAddingRole: addRoleMutation.isPending,
    isAssigningRole: assignMutation.isPending,
    isOffliningRoleSession: offlineRoleSessionMutation.isPending,
    isOffliningRoom: offlineRoomMutation.isPending,
    isWakingRoom: wakeRoomMutation.isPending,
    isSpawningRole: spawnRoleMutation.isPending,
    isCreatingTask: createTaskMutation.isPending,
    isUpdatingTaskWorkflow:
      assignTaskMutation.isPending
      || claimTaskMutation.isPending
      || blockTaskMutation.isPending
      || handoffTaskMutation.isPending
      || completeTaskMutation.isPending,
    isDeletingAnything: deleteRoomMutation.isPending,
  }
}
