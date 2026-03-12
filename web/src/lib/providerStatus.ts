import type { Machine, MachineProviderHealthStatus } from '@/types/api'

export type KnownFlavor = 'claude' | 'codex' | 'gemini' | 'cursor' | 'opencode'
type ProviderStatus = NonNullable<Machine['metadata']>['providers'] extends infer T
    ? T extends Partial<Record<KnownFlavor, infer Provider>>
        ? Provider
        : never
    : never

export function getMachineTitle(machine: Machine | null | undefined): string {
    if (!machine) return 'Unknown machine'
    if (machine.metadata?.displayName) return machine.metadata.displayName
    if (machine.metadata?.host) return machine.metadata.host
    return machine.id.slice(0, 8)
}

export function getProviderLabel(flavor: string | null | undefined): string {
    if (flavor === 'claude') return 'Claude'
    if (flavor === 'codex') return 'Codex'
    if (flavor === 'gemini') return 'Gemini'
    if (flavor === 'cursor') return 'Cursor'
    if (flavor === 'opencode') return 'OpenCode'
    return flavor?.trim() || 'Unknown'
}

export function getMachineProviderStatus(machine: Machine | null | undefined, flavor: string | null | undefined) {
    if (!machine?.metadata?.providers) return null
    if (!flavor) return null
    return machine.metadata.providers[flavor as KnownFlavor] ?? null
}

export function formatProviderAuthSummary(machine: Machine | null | undefined, flavor: string | null | undefined): string | null {
    const provider = getMachineProviderStatus(machine, flavor)
    if (!provider) {
        if (flavor === 'cursor') return 'Local Cursor CLI'
        return null
    }

    if (provider.authMode && provider.baseUrl) {
        return `${provider.authMode} · ${provider.baseUrl}`
    }
    if (provider.authMode) {
        return provider.authMode
    }
    if (provider.baseUrl) {
        return provider.baseUrl
    }
    if (provider.note) {
        return provider.note
    }
    return provider.configured ? 'configured' : 'not configured'
}

export function formatRunnerStatus(machine: Machine | null | undefined): string {
    return machine?.runnerState?.status || 'unknown'
}

export function getProviderReadiness(provider: ProviderStatus | null | undefined): {
    label: string
    tone: string
    detail: string
} {
    if (!provider) {
        return {
            label: 'Unknown',
            tone: 'text-[var(--app-hint)]',
            detail: 'No provider metadata received yet.',
        }
    }
    if (provider.configured) {
        return {
            label: 'Ready',
            tone: 'text-emerald-600',
            detail: provider.authMode
                ? `Auth mode: ${provider.authMode}`
                : provider.note ?? 'Configured',
        }
    }
    if (provider.baseUrl && !provider.authMode) {
        return {
            label: 'Needs auth',
            tone: 'text-amber-600',
            detail: 'Base URL detected, but authentication is missing.',
        }
    }
    return {
        label: 'Not configured',
        tone: 'text-[var(--app-hint)]',
        detail: provider.note ?? 'Provider variables/config not detected on this runner.',
    }
}

export function getProviderHealthPresentation(provider: MachineProviderHealthStatus | null | undefined): {
    label: string
    tone: string
    detail: string
} | null {
    if (!provider) {
        return null
    }

    if (provider.status === 'ready') {
        return {
            label: provider.summary,
            tone: 'text-emerald-600',
            detail: provider.detail
        }
    }

    if (provider.status === 'needs-auth') {
        return {
            label: provider.summary,
            tone: 'text-amber-600',
            detail: provider.detail
        }
    }

    if (provider.status === 'unreachable' || provider.status === 'warning') {
        return {
            label: provider.summary,
            tone: 'text-red-600',
            detail: provider.detail
        }
    }

    return {
        label: provider.summary,
        tone: 'text-[var(--app-hint)]',
        detail: provider.detail
    }
}
