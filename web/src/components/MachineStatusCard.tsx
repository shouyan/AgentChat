import type { Machine, ProviderHealthResponse, SessionSummary } from '@/types/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatRunnerStatus, getMachineTitle, getProviderHealthPresentation, getProviderLabel, getProviderReadiness } from '@/lib/providerStatus'

function StatPill(props: { label: string; value: string }) {
    return (
        <div className="rounded-full border border-[var(--app-border)] px-2.5 py-1 text-xs text-[var(--app-hint)]">
            <span className="font-medium text-[var(--app-fg)]">{props.label}:</span> {props.value}
        </div>
    )
}

export function MachineStatusCard(props: {
    machine: Machine
    sessions: SessionSummary[]
    pendingAction?: string | null
    actionMessage?: string | null
    providerHealth?: ProviderHealthResponse | null
    onRestartRunner?: () => void
    onCleanupDeadSessions?: () => void
    onRunProviderHealthCheck?: () => void
    pendingSessionCleanupId?: string | null
    onOpenSession?: (sessionId: string) => void
    onCleanupSession?: (sessionId: string) => void
}) {
    const providerEntries = Object.entries(props.machine.metadata?.providers ?? {})
    const startedAt = props.machine.runnerState?.startedAt
        ? new Date(props.machine.runnerState.startedAt).toLocaleString()
        : null
    const checkedAt = props.providerHealth?.checkedAt
        ? new Date(props.providerHealth.checkedAt).toLocaleString()
        : null

    return (
        <Card className="border border-[var(--app-border)] bg-[var(--app-bg)]">
            <CardHeader className="gap-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <CardTitle className="truncate">{getMachineTitle(props.machine)}</CardTitle>
                        <CardDescription className="mt-1 truncate">
                            {props.machine.metadata?.platform ?? 'Unknown platform'} · {props.machine.id}
                        </CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <StatPill label="Runner" value={formatRunnerStatus(props.machine)} />
                        <StatPill label="Sessions" value={`${props.sessions.length}`} />
                        {typeof props.machine.runnerState?.pid === 'number' ? (
                            <StatPill label="PID" value={`${props.machine.runnerState.pid}`} />
                        ) : null}
                    </div>
                </div>
            </CardHeader>

            <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={props.onRunProviderHealthCheck}
                        disabled={props.pendingAction === 'health'}
                        className="rounded-md border border-[var(--app-border)] px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {props.pendingAction === 'health' ? 'Checking…' : 'Health check'}
                    </button>
                    <button
                        type="button"
                        onClick={props.onCleanupDeadSessions}
                        disabled={props.pendingAction === 'cleanup'}
                        className="rounded-md border border-[var(--app-border)] px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {props.pendingAction === 'cleanup' ? 'Cleaning…' : 'Cleanup orphaned sessions'}
                    </button>
                    <button
                        type="button"
                        onClick={props.onRestartRunner}
                        disabled={props.pendingAction === 'restart'}
                        className="rounded-md border border-[var(--app-border)] px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {props.pendingAction === 'restart' ? 'Restarting…' : 'Restart runner'}
                    </button>
                </div>

                {props.actionMessage ? (
                    <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-secondary-bg)] p-3 text-sm text-[var(--app-hint)]">
                        {props.actionMessage}
                    </div>
                ) : null}

                <div className="grid gap-2 text-sm text-[var(--app-hint)] sm:grid-cols-2">
                    <div>
                        <div className="text-xs uppercase tracking-wide">Host</div>
                        <div className="mt-1 break-all text-[var(--app-fg)]">{props.machine.metadata?.host ?? '—'}</div>
                    </div>
                    <div>
                        <div className="text-xs uppercase tracking-wide">Runner started</div>
                        <div className="mt-1 text-[var(--app-fg)]">{startedAt ?? '—'}</div>
                    </div>
                    <div>
                        <div className="text-xs uppercase tracking-wide">Control port</div>
                        <div className="mt-1 text-[var(--app-fg)]">{props.machine.runnerState?.httpPort ?? '—'}</div>
                    </div>
                    <div>
                        <div className="text-xs uppercase tracking-wide">Workspace home</div>
                        <div className="mt-1 break-all text-[var(--app-fg)]">{props.machine.metadata?.happyHomeDir ?? '—'}</div>
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="text-xs uppercase tracking-wide text-[var(--app-hint)]">Machine sessions</div>
                    {props.sessions.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-[var(--app-border)] bg-[var(--app-secondary-bg)] p-3 text-sm text-[var(--app-hint)]">
                            No tracked sessions on this machine.
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {props.sessions.map((session) => {
                                const label = session.metadata?.name
                                    ?? session.metadata?.summary?.text
                                    ?? session.id.slice(0, 8)
                                const flavor = session.metadata?.flavor ?? 'unknown'
                                const path = session.metadata?.path ?? '—'
                                return (
                                    <div
                                        key={session.id}
                                        className="rounded-lg border border-[var(--app-border)] bg-[var(--app-secondary-bg)] p-3 text-sm"
                                    >
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="truncate font-medium text-[var(--app-fg)]">{label}</div>
                                                <div className="mt-1 truncate text-xs text-[var(--app-hint)]">
                                                    {flavor} · {path}
                                                </div>
                                                <div className="mt-1 text-xs text-[var(--app-hint)]">
                                                    {session.active ? 'Active' : 'Inactive'} · {session.id}
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => props.onOpenSession?.(session.id)}
                                                    className="rounded-md border border-[var(--app-border)] px-2.5 py-1 text-xs"
                                                >
                                                    Open
                                                </button>
                                                {!session.active ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => props.onCleanupSession?.(session.id)}
                                                        disabled={props.pendingSessionCleanupId === session.id}
                                                        className="rounded-md border border-red-200 px-2.5 py-1 text-xs text-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                                                    >
                                                        {props.pendingSessionCleanupId === session.id ? 'Cleaning…' : 'Cleanup'}
                                                    </button>
                                                ) : null}
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>

                {props.machine.runnerState?.lastSpawnError?.message ? (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
                        <div className="font-medium">Last spawn error</div>
                        <div className="mt-1 break-words">{props.machine.runnerState.lastSpawnError.message}</div>
                    </div>
                ) : null}

                <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                        <div className="text-xs uppercase tracking-wide text-[var(--app-hint)]">Provider status</div>
                        {checkedAt ? (
                            <div className="text-xs text-[var(--app-hint)]">
                                Last health check: {checkedAt}
                            </div>
                        ) : null}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                        {providerEntries.map(([flavor, provider]) => {
                            const readiness = getProviderReadiness(provider)
                            const health = getProviderHealthPresentation(props.providerHealth?.providers?.[flavor as keyof NonNullable<ProviderHealthResponse['providers']>] ?? null)
                            const rawHealth = props.providerHealth?.providers?.[flavor as keyof NonNullable<ProviderHealthResponse['providers']>]
                            return (
                                <div
                                    key={flavor}
                                    className="rounded-lg border border-[var(--app-border)] bg-[var(--app-secondary-bg)] p-3 text-sm"
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="font-medium text-[var(--app-fg)]">{getProviderLabel(flavor)}</div>
                                        <span className={`text-xs ${readiness.tone}`}>
                                            {readiness.label}
                                        </span>
                                    </div>
                                    <div className={`mt-2 text-xs ${readiness.tone}`}>{readiness.detail}</div>
                                    {health ? (
                                        <div className={`mt-2 rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] p-2 text-xs ${health.tone}`}>
                                            <div className="font-medium">{health.label}</div>
                                            <div className="mt-1">{health.detail}</div>
                                            {rawHealth?.probe?.url ? (
                                                <div className="mt-1 break-all text-[var(--app-hint)]">
                                                    Probe: <span className="text-[var(--app-fg)]">{rawHealth.probe.url}</span>
                                                </div>
                                            ) : null}
                                        </div>
                                    ) : null}
                                    <div className="mt-2 space-y-1 text-xs text-[var(--app-hint)]">
                                        {provider.authMode ? <div>Auth: <span className="text-[var(--app-fg)]">{provider.authMode}</span></div> : null}
                                        {provider.baseUrl ? <div className="break-all">Base URL: <span className="text-[var(--app-fg)]">{provider.baseUrl}</span></div> : null}
                                        {provider.configPath ? <div className="break-all">Config: <span className="text-[var(--app-fg)]">{provider.configPath}</span></div> : null}
                                        {provider.note ? <div>{provider.note}</div> : null}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
