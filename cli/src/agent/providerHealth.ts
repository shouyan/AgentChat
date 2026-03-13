import { access } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import type {
    MachineProviderHealthMap,
    MachineProviderHealthStatus,
    MachineProviderStatus,
    MachineProviderStatusMap
} from '@agentchat/protocol/machines'
import { buildMachineProviderStatus } from './providerStatus'

const DEFAULT_PROBE_URLS: Partial<Record<keyof MachineProviderHealthMap, string>> = {
    claude: 'https://api.anthropic.com',
    codex: 'https://api.openai.com/v1',
    gemini: 'https://generativelanguage.googleapis.com',
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

function normalizeProbeUrl(flavor: keyof MachineProviderHealthMap, provider: MachineProviderStatus): string | null {
    const candidate = provider.baseUrl || DEFAULT_PROBE_URLS[flavor]
    if (!candidate) {
        return null
    }

    try {
        return new URL(candidate).toString()
    } catch {
        return null
    }
}

async function probeUrl(url: string, fetchImpl: FetchLike): Promise<MachineProviderHealthStatus['probe']> {
    try {
        const response = await fetchImpl(url, {
            method: 'GET',
            redirect: 'manual',
            signal: AbortSignal.timeout(5_000),
        })

        return {
            url,
            ok: true,
            statusCode: response.status
        }
    } catch (error) {
        return {
            url,
            ok: false,
            error: error instanceof Error ? error.message : 'Request failed'
        }
    }
}

async function configExists(path: string | undefined): Promise<boolean> {
    if (!path) {
        return false
    }

    try {
        await access(path, fsConstants.F_OK)
        return true
    } catch {
        return false
    }
}

async function buildHealthEntry(
    flavor: keyof MachineProviderHealthMap,
    provider: MachineProviderStatus,
    fetchImpl: FetchLike
): Promise<MachineProviderHealthStatus> {
    const checkedAt = Date.now()
    const probeUrlValue = normalizeProbeUrl(flavor, provider)
    const probe = probeUrlValue ? await probeUrl(probeUrlValue, fetchImpl) : undefined

    if (flavor === 'cursor') {
        return {
            ...provider,
            checkedAt,
            status: 'ready',
            summary: 'Local CLI ready',
            detail: provider.note ?? 'Cursor is managed via local CLI.',
        }
    }

    if (flavor === 'opencode') {
        const exists = await configExists(provider.configPath)
        if (provider.configured && exists) {
            return {
                ...provider,
                checkedAt,
                status: 'ready',
                summary: 'Config detected',
                detail: provider.configPath ? `Using config at ${provider.configPath}` : 'OpenCode config available.',
            }
        }

        if (provider.configured && !exists) {
            return {
                ...provider,
                checkedAt,
                status: 'warning',
                summary: 'Config missing',
                detail: provider.configPath ? `Configured path not found: ${provider.configPath}` : 'Expected config path missing.',
            }
        }

        return {
            ...provider,
            checkedAt,
            status: 'not-configured',
            summary: 'Not configured',
            detail: 'No OpenCode config path detected on this runner.',
        }
    }

    if (!provider.configured) {
        if (provider.baseUrl && !provider.authMode) {
            return {
                ...provider,
                checkedAt,
                status: 'needs-auth',
                summary: 'Authentication missing',
                detail: probe?.ok
                    ? `Base URL reachable (${probe.statusCode ?? 'ok'}), but auth is missing.`
                    : `Base URL detected, but auth is missing${probe?.error ? `; reachability failed: ${probe.error}` : '.'}`,
                probe
            }
        }

        return {
            ...provider,
            checkedAt,
            status: 'not-configured',
            summary: 'Not configured',
            detail: provider.note ?? 'Provider variables/config not detected on this runner.',
            probe
        }
    }

    if (probe && !probe.ok) {
        return {
            ...provider,
            checkedAt,
            status: 'unreachable',
            summary: 'Reachability failed',
            detail: probe.error ?? 'Network probe failed.',
            probe
        }
    }

    if (probe) {
        return {
            ...provider,
            checkedAt,
            status: 'ready',
            summary: 'Ready',
            detail: `Reachable (${probe.statusCode ?? 'ok'})${provider.authMode ? ` via ${provider.authMode}` : ''}.`,
            probe
        }
    }

    return {
        ...provider,
        checkedAt,
        status: 'ready',
        summary: 'Ready',
        detail: provider.authMode
            ? `Configured via ${provider.authMode}.`
            : provider.note ?? 'Configured.',
    }
}

export async function buildMachineProviderHealth(
    fetchImpl: FetchLike = fetch,
    env: NodeJS.ProcessEnv = process.env
): Promise<MachineProviderHealthMap> {
    const statusMap = buildMachineProviderStatus(env)
    const entries = await Promise.all(
        (Object.entries(statusMap) as Array<[keyof MachineProviderHealthMap, MachineProviderStatus]>).map(async ([flavor, provider]) => {
            return [flavor, await buildHealthEntry(flavor, provider, fetchImpl)] as const
        })
    )

    return Object.fromEntries(entries) as MachineProviderHealthMap
}
