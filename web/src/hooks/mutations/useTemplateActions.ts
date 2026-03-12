import { useQueryClient } from '@tanstack/react-query'
import type { ApiClient, TemplatesResponse } from '@/api/client'
import type {
  RoleSlotTemplate,
  RoomTemplateDefinition,
  TemplateOverrideState,
} from '@/components/rooms/roleTemplates'
import { queryKeys } from '@/lib/query-keys'

function syncTemplates(queryClient: ReturnType<typeof useQueryClient>, nextCatalog: TemplatesResponse) {
  queryClient.setQueryData(queryKeys.templates, nextCatalog)
}

export function useTemplateActions(api: ApiClient | null) {
  const queryClient = useQueryClient()

  return {
    saveRoleTemplate: async (template: RoleSlotTemplate): Promise<TemplatesResponse> => {
      if (!api) throw new Error('API unavailable')
      const nextCatalog = await api.saveRoleTemplate(template)
      syncTemplates(queryClient, nextCatalog)
      return nextCatalog
    },
    deleteRoleTemplate: async (key: string): Promise<TemplatesResponse> => {
      if (!api) throw new Error('API unavailable')
      const nextCatalog = await api.deleteRoleTemplate(key)
      syncTemplates(queryClient, nextCatalog)
      return nextCatalog
    },
    updateBuiltinRoleTemplateOverride: async (key: string, override: Partial<TemplateOverrideState>): Promise<TemplatesResponse> => {
      if (!api) throw new Error('API unavailable')
      const nextCatalog = await api.updateBuiltinRoleTemplateOverride(key, override)
      syncTemplates(queryClient, nextCatalog)
      return nextCatalog
    },
    saveRoomTemplate: async (template: RoomTemplateDefinition): Promise<TemplatesResponse> => {
      if (!api) throw new Error('API unavailable')
      const nextCatalog = await api.saveRoomTemplate(template)
      syncTemplates(queryClient, nextCatalog)
      return nextCatalog
    },
    deleteRoomTemplate: async (key: string): Promise<TemplatesResponse> => {
      if (!api) throw new Error('API unavailable')
      const nextCatalog = await api.deleteRoomTemplate(key)
      syncTemplates(queryClient, nextCatalog)
      return nextCatalog
    },
    updateBuiltinRoomTemplateOverride: async (key: string, override: Partial<TemplateOverrideState>): Promise<TemplatesResponse> => {
      if (!api) throw new Error('API unavailable')
      const nextCatalog = await api.updateBuiltinRoomTemplateOverride(key, override)
      syncTemplates(queryClient, nextCatalog)
      return nextCatalog
    },
  }
}
