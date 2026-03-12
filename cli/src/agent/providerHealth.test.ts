import { describe, expect, it } from 'vitest'
import { buildMachineProviderHealth } from './providerHealth'

function withEnv(overrides: Record<string, string | undefined>, run: () => Promise<void>) {
    const previous = Object.fromEntries(Object.keys(overrides).map((key) => [key, process.env[key]]))

    for (const [key, value] of Object.entries(overrides)) {
        if (value === undefined) {
            delete process.env[key]
        } else {
            process.env[key] = value
        }
    }

    return run().finally(() => {
        for (const [key, value] of Object.entries(previous)) {
            if (value === undefined) {
                delete process.env[key]
            } else {
                process.env[key] = value
            }
        }
    })
}

describe('buildMachineProviderHealth', () => {
    it('marks configured provider as ready when probe succeeds', async () => {
        await withEnv({
            ANTHROPIC_AUTH_TOKEN: 'token',
            ANTHROPIC_API_KEY: undefined,
            CLAUDE_CODE_OAUTH_TOKEN: undefined,
            ANTHROPIC_BASE_URL: 'https://claude.example.com'
        }, async () => {
            const result = await buildMachineProviderHealth(async () => {
                return new Response('', { status: 200 })
            })

            expect(result.claude?.status).toBe('ready')
            expect(result.claude?.probe?.statusCode).toBe(200)
            expect(result.claude?.detail).toContain('Reachable')
        })
    })

    it('marks provider as needs-auth when base url exists without auth', async () => {
        await withEnv({
            ANTHROPIC_AUTH_TOKEN: undefined,
            ANTHROPIC_API_KEY: undefined,
            CLAUDE_CODE_OAUTH_TOKEN: undefined,
            ANTHROPIC_BASE_URL: 'https://claude.example.com'
        }, async () => {
            const result = await buildMachineProviderHealth(async () => {
                return new Response('', { status: 401 })
            })

            expect(result.claude?.status).toBe('needs-auth')
            expect(result.claude?.summary).toBe('Authentication missing')
        })
    })

    it('marks configured provider as unreachable when probe fails', async () => {
        await withEnv({
            OPENAI_API_KEY: 'token',
            OPENAI_BASE_URL: 'https://codex.example.com'
        }, async () => {
            const result = await buildMachineProviderHealth(async () => {
                throw new Error('connect ECONNREFUSED')
            })

            expect(result.codex?.status).toBe('unreachable')
            expect(result.codex?.detail).toContain('ECONNREFUSED')
        })
    })
})
