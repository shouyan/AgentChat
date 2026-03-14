import type { Session } from '../../sync/syncEngine'
import type { NotificationChannel } from '../../notifications/notificationTypes'
import {
    buildPermissionCard,
    listPendingPermissionsForSession,
} from './permissions'
import type { FeishuApiMessageClient, FeishuRepositoryLike } from './types'

function pickLatestPendingRequest(session: Session) {
    return listPendingPermissionsForSession(session)
        .sort((left, right) => (right.request.createdAt ?? 0) - (left.request.createdAt ?? 0))[0] ?? null
}

export class FeishuNotificationChannel implements NotificationChannel {
    constructor(
        private readonly apiClient: FeishuApiMessageClient,
        private readonly repository: FeishuRepositoryLike,
        private readonly publicUrl: string,
        private readonly accessToken: string
    ) {
    }

    async sendReady(_session: Session): Promise<void> {
    }

    async sendPermissionRequest(session: Session): Promise<void> {
        if (!session.active || !this.apiClient.sendInteractiveCard) {
            return
        }

        const pending = pickLatestPendingRequest(session)
        if (!pending) {
            return
        }

        const openIds = this.repository.listOpenIdsByNamespace(session.namespace)
        if (openIds.length === 0) {
            return
        }

        const card = buildPermissionCard(pending, {
            publicUrl: this.publicUrl,
            accessToken: this.accessToken,
            state: 'pending',
        })

        await Promise.allSettled(openIds.map(async (openId) => {
            if (!this.repository.isOpenIdAllowed(openId)) {
                return
            }
            await this.apiClient.sendInteractiveCard?.(openId, card)
        }))
    }
}
