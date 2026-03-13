import { describe, expect, it } from 'vitest'
import { formatProviderAuthSummary, getMachineProviderStatus, getProviderHealthPresentation, getProviderReadiness } from './providerStatus'
import type { Machine } from '@/types/api'

const machine: Machine = {
    id: 'machine-1',
    active: true,
    metadata: {
        host: 'devbox',
        platform: 'darwin',
        agentchatCliVersion: '0.0.1',
        homeDir: 'home/test',
        agentchatHomeDir: 'data/agentchat-home',
        agentchatLibDir: '/app/cli',
        providers: {
            claude: {
                configured: true,
                authMode: 'auth-token',
                baseUrl: 'https://example.invalid'
            }
        }
    },
    runnerState: {
        status: 'running'
    }
}

describe('providerStatus helpers', () => {
    it('returns provider status for known flavor', () => {
        expect(getMachineProviderStatus(machine, 'claude')).toEqual({
            configured: true,
            authMode: 'auth-token',
            baseUrl: 'https://example.invalid'
        })
    })

    it('formats auth summary with auth mode and base url', () => {
        expect(formatProviderAuthSummary(machine, 'claude')).toBe('auth-token · https://example.invalid')
    })

    it('falls back for cursor local cli', () => {
        expect(formatProviderAuthSummary(machine, 'cursor')).toBe('Local Cursor CLI')
    })

    it('describes provider readiness', () => {
        expect(getProviderReadiness(machine.metadata?.providers?.claude).label).toBe('Ready')
        expect(getProviderReadiness({ configured: false, baseUrl: 'https://example.invalid' }).label).toBe('Needs auth')
        expect(getProviderReadiness({ configured: false }).label).toBe('Not configured')
    })

    it('describes provider health check output', () => {
        expect(getProviderHealthPresentation({
            configured: true,
            checkedAt: Date.now(),
            status: 'unreachable',
            summary: 'Reachability failed',
            detail: 'connect ECONNREFUSED'
        })?.label).toBe('Reachability failed')

        expect(getProviderHealthPresentation({
            configured: false,
            checkedAt: Date.now(),
            status: 'needs-auth',
            summary: 'Authentication missing',
            detail: 'Base URL reachable.'
        })?.tone).toBe('text-amber-600')
    })
})
