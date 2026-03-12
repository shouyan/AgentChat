import type {
    PushSubscriptionPayload,
    PushUnsubscribePayload,
    PushVapidPublicKeyResponse,
    VisibilityPayload,
} from '@/types/api'
import { ApiClient } from '../core'

declare module '../core' {
    interface ApiClient {
        getPushVapidPublicKey(): Promise<PushVapidPublicKeyResponse>
        subscribePushNotifications(payload: PushSubscriptionPayload): Promise<void>
        unsubscribePushNotifications(payload: PushUnsubscribePayload): Promise<void>
        setVisibility(payload: VisibilityPayload): Promise<void>
    }
}

Object.assign(ApiClient.prototype, {
    async getPushVapidPublicKey(this: ApiClient): Promise<PushVapidPublicKeyResponse> {
        return await this.request<PushVapidPublicKeyResponse>('/api/push/vapid-public-key')
    },

    async subscribePushNotifications(this: ApiClient, payload: PushSubscriptionPayload): Promise<void> {
        await this.request('/api/push/subscribe', {
            method: 'POST',
            body: JSON.stringify(payload),
        })
    },

    async unsubscribePushNotifications(this: ApiClient, payload: PushUnsubscribePayload): Promise<void> {
        await this.request('/api/push/subscribe', {
            method: 'DELETE',
            body: JSON.stringify(payload),
        })
    },

    async setVisibility(this: ApiClient, payload: VisibilityPayload): Promise<void> {
        await this.request('/api/visibility', {
            method: 'POST',
            body: JSON.stringify(payload),
        })
    },
})
