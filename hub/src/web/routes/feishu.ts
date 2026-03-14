import { Hono } from 'hono'
import type { FeishuCardActionHandler } from '../../integrations/feishu/cardActionHandler'

export function createFeishuRoutes(getCardActionHandler: () => FeishuCardActionHandler | null): Hono {
    const app = new Hono()

    app.post('/card', async (c) => {
        const handler = getCardActionHandler()
        if (!handler) {
            return c.json({ error: 'Feishu card callbacks are not enabled' }, 503)
        }

        const payload = await c.req.json().catch(() => null)
        const result = await handler.handlePayload(payload, c.req.raw.headers)
        return c.json(result.body, result.status as 200 | 400 | 401 | 503)
    })

    return app
}
