import type { TemplatesResponse } from '@hapi/protocol/contracts/templates'
import type { RoleSlotTemplate, RoomTemplateDefinition, TemplateOverrideState } from '@hapi/protocol/templates'
import { ApiClient } from '../core'

declare module '../core' {
    interface ApiClient {
        getTemplates(): Promise<TemplatesResponse>
        saveRoleTemplate(template: RoleSlotTemplate): Promise<TemplatesResponse>
        deleteRoleTemplate(key: string): Promise<TemplatesResponse>
        updateBuiltinRoleTemplateOverride(key: string, override: Partial<TemplateOverrideState>): Promise<TemplatesResponse>
        saveRoomTemplate(template: RoomTemplateDefinition): Promise<TemplatesResponse>
        deleteRoomTemplate(key: string): Promise<TemplatesResponse>
        updateBuiltinRoomTemplateOverride(key: string, override: Partial<TemplateOverrideState>): Promise<TemplatesResponse>
    }
}

Object.assign(ApiClient.prototype, {
    async getTemplates(this: ApiClient): Promise<TemplatesResponse> {
        return await this.request<TemplatesResponse>('/api/templates')
    },

    async saveRoleTemplate(this: ApiClient, template: RoleSlotTemplate): Promise<TemplatesResponse> {
        return await this.request<TemplatesResponse>(`/api/templates/role-slot/custom/${encodeURIComponent(template.key)}`, {
            method: 'PUT',
            body: JSON.stringify(template),
        })
    },

    async deleteRoleTemplate(this: ApiClient, key: string): Promise<TemplatesResponse> {
        return await this.request<TemplatesResponse>(`/api/templates/role-slot/custom/${encodeURIComponent(key)}`, {
            method: 'DELETE',
        })
    },

    async updateBuiltinRoleTemplateOverride(this: ApiClient, key: string, override: Partial<TemplateOverrideState>): Promise<TemplatesResponse> {
        return await this.request<TemplatesResponse>(`/api/templates/role-slot/builtin/${encodeURIComponent(key)}`, {
            method: 'PATCH',
            body: JSON.stringify(override),
        })
    },

    async saveRoomTemplate(this: ApiClient, template: RoomTemplateDefinition): Promise<TemplatesResponse> {
        return await this.request<TemplatesResponse>(`/api/templates/room/custom/${encodeURIComponent(template.key)}`, {
            method: 'PUT',
            body: JSON.stringify(template),
        })
    },

    async deleteRoomTemplate(this: ApiClient, key: string): Promise<TemplatesResponse> {
        return await this.request<TemplatesResponse>(`/api/templates/room/custom/${encodeURIComponent(key)}`, {
            method: 'DELETE',
        })
    },

    async updateBuiltinRoomTemplateOverride(this: ApiClient, key: string, override: Partial<TemplateOverrideState>): Promise<TemplatesResponse> {
        return await this.request<TemplatesResponse>(`/api/templates/room/builtin/${encodeURIComponent(key)}`, {
            method: 'PATCH',
            body: JSON.stringify(override),
        })
    },
})
