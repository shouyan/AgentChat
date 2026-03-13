import { Hono } from 'hono'
import { SignJWT } from 'jose'
import { z } from 'zod'
import { configuration } from '../../configuration'
import { constantTimeEquals } from '../../utils/crypto'
import { parseAccessToken } from '../../utils/accessToken'
import { getOrCreateOwnerId } from '../../config/ownerId'
import type { WebAppEnv } from '../middleware/auth'

const accessTokenAuthSchema = z.object({
    accessToken: z.string()
})

const authBodySchema = accessTokenAuthSchema

export function createAuthRoutes(jwtSecret: Uint8Array): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.post('/auth', async (c) => {
        const json = await c.req.json().catch(() => null)
        const parsed = authBodySchema.safeParse(json)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        let userId: number
        const parsedToken = parseAccessToken(parsed.data.accessToken)
        if (!parsedToken || !constantTimeEquals(parsedToken.baseToken, configuration.cliApiToken)) {
            return c.json({ error: 'Invalid access token' }, 401)
        }

        userId = await getOrCreateOwnerId()
        const namespace = parsedToken.namespace

        const token = await new SignJWT({ uid: userId, ns: namespace })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('15m')
            .sign(jwtSecret)

        return c.json({
            token,
            namespace,
            user: {
                id: userId,
                firstName: 'Web User'
            }
        })
    })

    return app
}
